import React, { useEffect, useRef, useState, useCallback } from "react";
import { Network, Trash2, RefreshCw, CheckCircle, AlertTriangle, ChevronDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NodeDef {
  icon: string;       // emoji fallback label
  label: string;
  color: string;      // text / border accent
  fill: string;       // background fill
  stroke: string;     // border color
}

interface DiagramNode {
  id: number;
  type: string;
  x: number;
  y: number;
  label: string;
  role: string;
  def: NodeDef;
}

interface DiagramEdge {
  id: number;
  a: number;          // from node id
  b: number;          // to node id
  label: string;
  dir: "one" | "both";
}

interface EvalCheck {
  label: string;
  pass: boolean;
  note: string;
}

interface DiagramEvaluation {
  overallScore: number;
  checks: EvalCheck[];
  missingConcepts: string[];
  integritySignal: "low" | "medium" | "high";
  integrityNote: string;
}

interface DiagramBuilderProps {
  questionIndex: number;
  focusConcept: string;
  questionText: string;
  onCaptureSnapshot: (b64: string) => void;
  role: "student" | "instructor" | "both";
  diagramState?: { nodes: DiagramNode[]; edges: DiagramEdge[]; nextId: number } | null;
  onDiagramStateChange?: (state: { nodes: DiagramNode[]; edges: DiagramEdge[]; nextId: number }) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 80;
const NODE_H = 48;
const RX = 8;
const HANDLE_R = 7;
const HANDLE_HIT = 14;

const DEFS: Record<string, NodeDef> = {
  // ── Networking / Security ──────────────────────────────────────────────────
  router:   { icon: "⇄",  label: "Router",      color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  firewall: { icon: "🛡",  label: "Firewall",    color: "#f87171", fill: "#450a0a", stroke: "#991b1b" },
  switch:   { icon: "⊕",  label: "Switch",      color: "#a78bfa", fill: "#2e1065", stroke: "#6d28d9" },
  vlan:     { icon: "⬡",  label: "VLAN",        color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  server:   { icon: "▣",  label: "Server",      color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  cloud:    { icon: "☁",  label: "Cloud",       color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  endpoint: { icon: "⬛", label: "Endpoint",    color: "#d1d5db", fill: "#1f2937", stroke: "#4b5563" },
  wifi:     { icon: "≈",  label: "Wi-Fi AP",    color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  isp:      { icon: "◎",  label: "ISP",         color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  noc:      { icon: "👁",  label: "NOC",         color: "#6ee7b7", fill: "#022c22", stroke: "#059669" },
  siem:     { icon: "📊", label: "SIEM",        color: "#fca5a5", fill: "#450a0a", stroke: "#b91c1c" },
  shield:   { icon: "⛨",  label: "Safeguard",   color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  lock:     { icon: "🔒", label: "Access Ctrl", color: "#a78bfa", fill: "#1e1b4b", stroke: "#7c3aed" },
  dmz:      { icon: "⬠",  label: "DMZ",         color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  // ── Software / SDC ────────────────────────────────────────────────────────
  class:    { icon: "◻",  label: "Class",       color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  interface:{ icon: "⟨⟩", label: "Interface",   color: "#a78bfa", fill: "#2e1065", stroke: "#6d28d9" },
  method:   { icon: "ƒ",  label: "Method",      color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  api:      { icon: "⇌",  label: "API",         color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  database: { icon: "⊚",  label: "Database",    color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  client:   { icon: "▯",  label: "Client",      color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  module:   { icon: "▤",  label: "Module",      color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  function: { icon: "λ",  label: "Function",    color: "#34d399", fill: "#022c22", stroke: "#059669" },
  object:   { icon: "◈",  label: "Object",      color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  event:    { icon: "⚡", label: "Event",       color: "#fca5a5", fill: "#2d0a1f", stroke: "#b91c1c" },
  state:    { icon: "◉",  label: "State",       color: "#6ee7b7", fill: "#022c22", stroke: "#059669" },
  ui:       { icon: "▭",  label: "UI Layer",    color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  // ── Data Analytics / ML ───────────────────────────────────────────────────
  datasrc:  { icon: "⊞",  label: "Data Source", color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  ingest:   { icon: "⤵",  label: "Ingest",      color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  transform:{ icon: "⟳",  label: "Transform",   color: "#a78bfa", fill: "#2e1065", stroke: "#6d28d9" },
  model:    { icon: "⬡",  label: "Model",       color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  train:    { icon: "↺",  label: "Training",    color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  validate: { icon: "✓",  label: "Validation",  color: "#6ee7b7", fill: "#022c22", stroke: "#059669" },
  output:   { icon: "▶",  label: "Output",      color: "#f87171", fill: "#450a0a", stroke: "#991b1b" },
  pipeline: { icon: "⟹",  label: "Pipeline",    color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  feature:  { icon: "⊡",  label: "Feature",     color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  storage:  { icon: "⊟",  label: "Storage",     color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  // ── General / Generic ─────────────────────────────────────────────────────
  process:  { icon: "▷",  label: "Process",     color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  decision: { icon: "◇",  label: "Decision",    color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  start:    { icon: "●",  label: "Start/End",   color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  input:    { icon: "▱",  label: "Input",       color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  store:    { icon: "⊏",  label: "Data Store",  color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  actor:    { icon: "☺",  label: "Actor",       color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  system:   { icon: "⬕",  label: "System",      color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  note:     { icon: "≡",  label: "Note",        color: "#6b7280", fill: "#111827", stroke: "#374151" },
};

const ROLE_COLORS: Record<string, string> = {
  enforcement: "#ef4444",
  trusted:     "#10b981",
  untrusted:   "#f59e0b",
  dmz:         "#8b5cf6",
  management:  "#3b82f6",
  encrypted:   "#06b6d4",
};

// Map focusConcept keywords → component palette presets
const SCENARIO_PALETTES: Array<{
  keywords: string[];
  components: string[];
  hint: string;
}> = [
  // ── Networking / Security ──────────────────────────────────────────────────
  {
    keywords: ["vlan", "segmentation", "segment", "clinic", "network topology", "network design"],
    components: ["firewall", "switch", "vlan", "vlan", "vlan", "endpoint", "wifi"],
    hint: "Show at least three VLANs, place the firewall at the enforcement boundary, label each VLAN.",
  },
  {
    keywords: ["failover", "redundan", "ospf", "isp", "wan", "backup link"],
    components: ["router", "router", "firewall", "cloud", "isp", "isp"],
    hint: "Show primary and backup ISP paths, dual edge routers, and the cloud destination.",
  },
  {
    keywords: ["hipaa", "safeguard", "compliance", "administrative control", "technical control"],
    components: ["shield", "server", "lock", "endpoint", "noc", "cloud"],
    hint: "Map all three HIPAA safeguard categories (administrative, physical, technical) to components.",
  },
  {
    keywords: ["noc", "siem", "log monitoring", "alert", "incident response"],
    components: ["noc", "siem", "firewall", "switch", "router", "server"],
    hint: "Connect log sources to the SIEM, then show the NOC analyst connection and alert path.",
  },
  // ── Software / SDC ─────────────────────────────────────────────────────────
  {
    keywords: ["class", "object", "inherit", "polymorphi", "encapsul", "oop", "uml"],
    components: ["class", "class", "class", "interface", "object", "method"],
    hint: "Draw the class hierarchy, show inheritance arrows, and label each class with its key attributes and methods.",
  },
  {
    keywords: ["api", "rest", "endpoint", "request", "response", "http", "microservice"],
    components: ["client", "api", "server", "database", "cloud", "module"],
    hint: "Show the client→API→server→database call chain, label each request/response with the HTTP method and data.",
  },
  {
    keywords: ["event", "listener", "callback", "async", "promise", "queue", "pub", "sub"],
    components: ["event", "module", "function", "state", "ui", "database"],
    hint: "Map the event source, listener chain, and any async state changes that result.",
  },
  {
    keywords: ["state", "fsm", "transition", "finite", "workflow", "lifecycle"],
    components: ["state", "state", "state", "event", "decision", "process"],
    hint: "Draw each state as a node, label transitions with the triggering event, and show the start and end states.",
  },
  {
    keywords: ["mvc", "model", "view", "controller", "frontend", "backend", "layer", "tier"],
    components: ["ui", "module", "api", "database", "server", "client"],
    hint: "Separate the UI, logic, and data layers clearly and show how data flows between them.",
  },
  {
    keywords: ["algorithm", "sort", "search", "recursion", "loop", "iteration", "complexity"],
    components: ["start", "process", "decision", "process", "store", "output"],
    hint: "Draw the algorithm as a flowchart — show each step, branch condition, and the output.",
  },
  {
    keywords: ["function", "scope", "stack", "heap", "memory", "pointer", "variable"],
    components: ["function", "store", "object", "state", "process", "output"],
    hint: "Diagram the call stack or memory layout showing how variables and functions are allocated.",
  },
  // ── Data Analytics / Python / ML ───────────────────────────────────────────
  {
    keywords: ["data", "analytic", "pandas", "dataframe", "csv", "excel", "visuali"],
    components: ["datasrc", "ingest", "transform", "storage", "output", "pipeline"],
    hint: "Show the data source, loading/cleaning step, transformation, and final output or visualization.",
  },
  {
    keywords: ["machine learning", "ml", "train", "model", "predict", "classif", "regression", "neural"],
    components: ["datasrc", "feature", "train", "model", "validate", "output"],
    hint: "Map the full ML pipeline: data → feature engineering → training → validation → prediction output.",
  },
  {
    keywords: ["pipeline", "etl", "extract", "transform", "load", "batch", "stream"],
    components: ["datasrc", "ingest", "transform", "storage", "pipeline", "output"],
    hint: "Show each ETL stage as a node, label the data format at each handoff, and indicate batch vs stream.",
  },
  {
    keywords: ["database", "sql", "query", "schema", "table", "relation", "join", "index"],
    components: ["datasrc", "database", "store", "process", "output", "api"],
    hint: "Draw the schema with tables as nodes, show foreign key relationships, and trace a sample query path.",
  },
  // ── Code / Function Call Diagrams ──────────────────────────────────────────
  {
    keywords: ["function", "call", "execution", "stack", "main(", "flowchart", "breakdown", "trace", "control flow", "pseudocode"],
    components: ["start", "function", "process", "decision", "output", "module"],
    hint: "Start with the entry point, show each function call as a node, use Decision for branches, and label each arrow with what triggers the call.",
  },
  {
    keywords: ["loop", "iteration", "recursion", "while", "for loop", "base case"],
    components: ["start", "decision", "process", "function", "output", "state"],
    hint: "Show the loop condition as a Decision node, the loop body as Process nodes, and mark the base case or exit condition clearly.",
  },
  {
    keywords: ["runtime", "memory", "heap", "stack frame", "pointer", "variable scope"],
    components: ["start", "function", "store", "object", "state", "output"],
    hint: "Diagram the call stack frames as Function nodes, show variables in Store nodes, and trace how memory is allocated and released.",
  },
  {
    keywords: ["process", "flowchart", "flow", "diagram", "system", "design"],
    components: ["start", "process", "decision", "process", "store", "output"],
    hint: "Build a flowchart with a clear start, decision points, process steps, and a final output.",
  },
  {
    keywords: ["user", "actor", "use case", "scenario", "stakeholder", "requirement"],
    components: ["actor", "system", "process", "decision", "output", "note"],
    hint: "Show each actor, the system boundary, and the use cases they interact with.",
  },
];

const ALL_COMPONENTS = Object.keys(DEFS);

// Domain-specific component sets — shown in palette based on detected scenario
const DOMAIN_COMPONENTS: Record<string, string[]> = {
  networking: ["router", "firewall", "switch", "vlan", "server", "cloud", "endpoint", "wifi", "isp", "noc", "siem", "shield", "lock", "dmz"],
  software:   ["start", "function", "process", "decision", "module", "object", "state", "event", "output", "store", "class", "interface", "method", "api"],
  code:       ["start", "function", "process", "decision", "module", "output", "store", "state", "object", "event", "input"],
  data:       ["datasrc", "ingest", "transform", "model", "train", "validate", "output", "pipeline", "feature", "storage", "database", "cloud", "server"],
  general:    ["start", "process", "decision", "input", "store", "output", "actor", "system", "note", "module", "event", "state"],
};

function getDomainForScenario(concept: string): string {
  const lower = concept.toLowerCase();
  const codeKw       = ["function", "call stack", "execution", "flowchart", "breakdown", "trace", "runtime", "pseudocode", "control flow", "loop", "iteration", "recursion", "def ", "main(", "return value", "stack frame", "scope"];
  const dataKw       = ["data", "analytic", "pandas", "ml", "machine learning", "train", "model", "pipeline", "etl", "database", "sql", "dataset", "predict", "classif", "regression", "neural", "feature"];
  const softwareKw   = ["class", "object", "api", "rest", "mvc", "interface", "module", "event", "state machine", "fsm", "algorithm", "software design", "oop", "uml", "microservice"];
  const networkingKw = ["vlan", "router", "firewall", "switch", "isp", "wan", "noc", "siem", "hipaa", "network topology", "segmentation", "failover", "ospf", "dmz", "wifi", "compliance", "safeguard"];
  // Code must be checked first — networking keywords are too broad and can false-match
  if (codeKw.some((k) => lower.includes(k)))       return "code";
  if (dataKw.some((k) => lower.includes(k)))        return "data";
  if (softwareKw.some((k) => lower.includes(k)))   return "software";
  if (networkingKw.some((k) => lower.includes(k))) return "networking";
  return "general";
}

function detectScenario(concept: string): { components: string[]; hint: string } {
  const lower = concept.toLowerCase();
  for (const s of SCENARIO_PALETTES) {
    if (s.keywords.some((k) => lower.includes(k))) {
      return { components: s.components, hint: s.hint };
    }
  }
  // Domain-aware fallback when no keyword matches
  const isSDC = /code|program|software|python|java|script|develop|debug|function|variable/.test(lower);
  const isData = /data|analyt|statistic|chart|graph|plot|dataset|metric/.test(lower);
  if (isSDC) {
    return {
      components: ["start", "process", "decision", "function", "store", "output"],
      hint: "Build a flowchart or structure diagram showing the logic, inputs, outputs, and key decisions.",
    };
  }
  if (isData) {
    return {
      components: ["datasrc", "ingest", "transform", "model", "output", "storage"],
      hint: "Show the data flow from source through processing to output, labeling each transformation.",
    };
  }
  // Generic fallback
  return {
    components: ["start", "process", "decision", "store", "output", "actor"],
    hint: "Draw a diagram that best represents your answer — label each component and show how they connect.",
  };
}

// Returns the point where the line from (cx,cy) toward (tx,ty) exits the
// rounded rectangle centered at (cx,cy) with half-dimensions hw x hh.
function rectEdgePoint(
  cx: number, cy: number, hw: number, hh: number,
  tx: number, ty: number, gap: number
): { x: number; y: number } {
  const dx = tx - cx, dy = ty - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: cx, y: cy };
  // Find t for intersection with each side
  const candidates: number[] = [];
  if (Math.abs(dx) > 0.001) {
    candidates.push((hw) / Math.abs(dx));
    candidates.push((-hw) / Math.abs(dx));
  }
  if (Math.abs(dy) > 0.001) {
    candidates.push((hh) / Math.abs(dy));
    candidates.push((-hh) / Math.abs(dy));
  }
  // Smallest positive t that keeps us inside the box
  const t = Math.min(...candidates.filter((v) => v > 0));
  const ix = cx + dx * t;
  const iy = cy + dy * t;
  // Clamp to box edges
  const ex = Math.max(cx - hw, Math.min(cx + hw, ix));
  const ey = Math.max(cy - hh, Math.min(cy + hh, iy));
  // Apply gap along the direction vector
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len;
  return { x: ex + ux * gap, y: ey + uy * gap };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tx: number, ty: number,
  ux: number, uy: number,
  color: string
) {
  const hl = 10, hw = 5;
  const hx = tx - ux * hl, hy = ty - uy * hl;
  const px = -uy, py = ux;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx + px * hw, hy + py * hw);
  ctx.lineTo(hx - px * hw, hy - py * hw);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiagramBuilder({
  questionIndex,
  focusConcept,
  questionText,
  onCaptureSnapshot,
  role,
  diagramState,
  onDiagramStateChange,
}: DiagramBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [nextId, setNextId] = useState(1);
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<DiagramEdge | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [domainOverride, setDomainOverride] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<DiagramEvaluation | null>(null);
  const [scenario, setScenario] = useState<{ components: string[]; hint: string }>(
    detectScenario(focusConcept)
  );

  // Mutable refs for canvas interaction (avoids stale closure in event listeners)
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const nextIdRef = useRef(nextId);
  const selectedNodeRef = useRef(selectedNode);
  const hoverNodeIdRef = useRef(hoverNodeId);
  const dragNodeRef = useRef<DiagramNode | null>(null);
  const dragOffRef = useRef({ x: 0, y: 0 });
  const connDragRef = useRef<{
    fromId: number; fromX: number; fromY: number;
    curX: number; curY: number; snapTarget: DiagramNode | null;
  } | null>(null);
  const paletteDragTypeRef = useRef<string | null>(null);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { nextIdRef.current = nextId; }, [nextId]);
  useEffect(() => { selectedNodeRef.current = selectedNode; }, [selectedNode]);
  useEffect(() => { hoverNodeIdRef.current = hoverNodeId; }, [hoverNodeId]);

  // Re-detect scenario when question changes
  useEffect(() => {
    setScenario(detectScenario(focusConcept));
    setEvaluation(null);
    // Load saved diagram state for this question, or clear if none
    if (diagramState) {
      setNodes(diagramState.nodes);
      setEdges(diagramState.edges);
      setNextId(diagramState.nextId);
    } else {
      setNodes([]);
      setEdges([]);
      setNextId(1);
    }
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [questionIndex, focusConcept]);

  // Emit state changes so parent can save per-question
  useEffect(() => {
    if (onDiagramStateChange) {
      onDiagramStateChange({ nodes, edges, nextId });
    }
  }, [nodes, edges]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getHandles = (n: DiagramNode) => [
    { side: "right",  x: n.x + NODE_W / 2, y: n.y },
    { side: "left",   x: n.x - NODE_W / 2, y: n.y },
    { side: "bottom", x: n.x,              y: n.y + NODE_H / 2 },
    { side: "top",    x: n.x,              y: n.y - NODE_H / 2 },
  ];

  const getNodeAt = (x: number, y: number, nodeList: DiagramNode[]) => {
    for (let i = nodeList.length - 1; i >= 0; i--) {
      const n = nodeList[i];
      if (x >= n.x - NODE_W / 2 - 4 && x <= n.x + NODE_W / 2 + 4 &&
          y >= n.y - NODE_H / 2 - 4 && y <= n.y + NODE_H / 2 + 4) return n;
    }
    return null;
  };

  const getHandleAt = (x: number, y: number, nodeList: DiagramNode[]) => {
    // Only show/hit handles on the currently hovered node.
    // We read directly from hoverNodeIdRef (the mutable ref) NOT from
    // React state, so this is always current even inside mousedown.
    const hovId = hoverNodeIdRef.current;
    if (hovId === null) return null;
    const hov = nodeList.find((n) => n.id === hovId);
    if (!hov) return null;
    for (const h of getHandles(hov)) {
      if ((x - h.x) ** 2 + (y - h.y) ** 2 <= HANDLE_HIT ** 2) {
        return { node: hov, ...h };
      }
    }
    return null;
  };

  const getEdgeAt = (x: number, y: number, nodeList: DiagramNode[], edgeList: DiagramEdge[]) => {
    for (let i = edgeList.length - 1; i >= 0; i--) {
      const e = edgeList[i];
      const a = nodeList.find((n) => n.id === e.a);
      const b = nodeList.find((n) => n.id === e.b);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      const t = ((x - a.x) * dx + (y - a.y) * dy) / (len * len);
      if (t < 0.1 || t > 0.9) continue;
      const px = a.x + t * dx, py = a.y + t * dy;
      if (Math.abs(x - px) < 10 && Math.abs(y - py) < 10) return e;
    }
    return null;
  };

  const clampX = (x: number) => Math.max(NODE_W / 2 + 4, Math.min(660 - NODE_W / 2 - 4, x));
  const clampY = (y: number) => Math.max(NODE_H / 2 + 4, Math.min(400 - NODE_H / 2 - 4, y));

  const addNode = useCallback((type: string, x: number, y: number) => {
    const def = DEFS[type] || DEFS.server;
    const newNode: DiagramNode = {
      id: nextIdRef.current,
      type, x: clampX(x), y: clampY(y),
      label: def.label, role: "", def,
    };
    setNextId((prev) => prev + 1);
    setNodes((prev) => [...prev, newNode]);
    return newNode;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const curNodes = nodesRef.current;
    const curEdges = edgesRef.current;
    const selNode = selectedNodeRef.current;
    const hovId = hoverNodeIdRef.current;
    const connD = connDragRef.current;

    ctx.clearRect(0, 0, W, H);

    // Grid dots
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let gx = 20; gx < W; gx += 20) {
      for (let gy = 20; gy < H; gy += 20) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Edges
    curEdges.forEach((e) => {
      const a = curNodes.find((n) => n.id === e.a);
      const b = curNodes.find((n) => n.id === e.b);
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      const ux = dx / len, uy = dy / len;
      const isSel = selectedEdge?.id === e.id;
      const color = isSel ? "#818CF8" : "#4b5563";
      const GAP = 3;

      // Proper rect-edge intersection so angled arrows land cleanly
      const startPt = rectEdgePoint(a.x, a.y, NODE_W / 2, NODE_H / 2, b.x, b.y, GAP);
      const endPt   = rectEdgePoint(b.x, b.y, NODE_W / 2, NODE_H / 2, a.x, a.y, GAP);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.setLineDash(isSel ? [5, 3] : []);

      if (e.dir === "both") {
        // Offset the two parallel lines slightly perpendicular to avoid overlap
        const px = -uy * 2.5, py = ux * 2.5;
        ctx.beginPath();
        ctx.moveTo(startPt.x + px, startPt.y + py);
        ctx.lineTo(endPt.x + px, endPt.y + py);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(endPt.x - px, endPt.y - py);
        ctx.lineTo(startPt.x - px, startPt.y - py);
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrowHead(ctx, endPt.x + px, endPt.y + py, ux, uy, color);
        drawArrowHead(ctx, startPt.x - px, startPt.y - py, -ux, -uy, color);
      } else {
        ctx.beginPath();
        ctx.moveTo(startPt.x, startPt.y);
        ctx.lineTo(endPt.x, endPt.y);
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrowHead(ctx, endPt.x, endPt.y, ux, uy, color);
      }
      ctx.restore();

      if (e.label) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ctx.save();
        ctx.font = "10px monospace";
        const tw = ctx.measureText(e.label).width;
        ctx.fillStyle = "#111827";
        ctx.fillRect(mx - tw / 2 - 3, my - 9, tw + 6, 14);
        ctx.fillStyle = isSel ? "#818CF8" : "#9ca3af";
        ctx.textAlign = "center";
        ctx.fillText(e.label, mx, my + 1);
        ctx.restore();
      }
    });

    // Connection drag line
    if (connD) {
      const fromNode = curNodes.find((n) => n.id === connD.fromId);
      if (fromNode) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "#818CF8";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(connD.fromX, connD.fromY);
        ctx.lineTo(connD.curX, connD.curY);
        ctx.stroke();
        if (connD.snapTarget) {
          ctx.beginPath();
          ctx.arc(connD.snapTarget.x, connD.snapTarget.y, NODE_W / 2 + 6, 0, Math.PI * 2);
          ctx.strokeStyle = "#10b981";
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Nodes
    curNodes.forEach((n) => {
      const x = n.x - NODE_W / 2, y = n.y - NODE_H / 2;
      const isSel = selNode?.id === n.id;
      const isHov = n.id === hovId;

      if (isSel) {
        ctx.save();
        roundRect(ctx, x - 3, y - 3, NODE_W + 6, NODE_H + 6, RX + 3);
        ctx.strokeStyle = "#818CF8";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.restore();
      }

      roundRect(ctx, x, y, NODE_W, NODE_H, RX);
      ctx.fillStyle = n.def.fill;
      ctx.fill();
      ctx.strokeStyle = n.role && ROLE_COLORS[n.role] ? ROLE_COLORS[n.role] : n.def.stroke;
      ctx.lineWidth = n.role ? 2 : 1;
      ctx.setLineDash([]);
      ctx.stroke();

      if (n.role && ROLE_COLORS[n.role]) {
        ctx.save();
        roundRect(ctx, x, y, NODE_W, 5, RX);
        ctx.fillStyle = ROLE_COLORS[n.role];
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = n.def.color;
      ctx.font = "500 11px sans-serif";
      ctx.textAlign = "center";
      const lbl = n.label.length > 13 ? n.label.slice(0, 12) + "…" : n.label;
      ctx.fillText(lbl, n.x, n.y + 4);
      ctx.font = "10px monospace";
      ctx.fillStyle = "#6b7280";
      ctx.fillText(n.type, n.x, n.y + 16);

      if (isHov && !connD && !dragNodeRef.current) {
        getHandles(n).forEach((h) => {
          ctx.beginPath();
          ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
          ctx.fillStyle = "#818CF8";
          ctx.fill();
          ctx.strokeStyle = "#080810";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }
    });
  }, [selectedEdge]);

  // Re-render whenever state changes
  useEffect(() => { render(); }, [nodes, edges, selectedNode, selectedEdge, hoverNodeId, render]);

  // ── Canvas events ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getXY = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      // Scale mouse coords from CSS pixels to canvas pixels
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      return {
        x: (e.clientX - r.left) * scaleX,
        y: (e.clientY - r.top) * scaleY,
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      const { x, y } = getXY(e);

      if (connDragRef.current) {
        connDragRef.current.curX = x;
        connDragRef.current.curY = y;
        const t = getNodeAt(x, y, nodesRef.current);
        connDragRef.current.snapTarget = t && t.id !== connDragRef.current.fromId ? t : null;
        render();
        return;
      }

      if (dragNodeRef.current) {
        dragNodeRef.current.x = clampX(x - dragOffRef.current.x);
        dragNodeRef.current.y = clampY(y - dragOffRef.current.y);
        setNodes([...nodesRef.current]);
        return;
      }

      // Always update hover ref synchronously first so mousedown sees it immediately
      const hit = getNodeAt(x, y, nodesRef.current);
      const newId = hit ? hit.id : null;
      const prev = hoverNodeIdRef.current;
      if (newId !== prev) {
        hoverNodeIdRef.current = newId;   // sync ref update — mousedown reads this
        setHoverNodeId(newId);            // async React state for re-render
        render();
      }

      // Check handles after hover is updated
      const h = getHandleAt(x, y, nodesRef.current);
      canvas.style.cursor = h ? "crosshair" : hit ? "grab" : "default";
      if (h) render();
    };

    // Track mousedown position to distinguish click vs drag
    const mouseDownPosRef = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      // Ignore right-clicks and double-click repeats
      if (e.button !== 0 || e.detail > 1) return;
      const { x, y } = getXY(e);
      mouseDownPosRef.x = x;
      mouseDownPosRef.y = y;

      const h = getHandleAt(x, y, nodesRef.current);
      if (h) {
        connDragRef.current = { fromId: h.node.id, fromX: h.x, fromY: h.y, curX: x, curY: y, snapTarget: null };
        canvas.style.cursor = "crosshair";
        return;
      }
      const n = getNodeAt(x, y, nodesRef.current);
      if (n) {
        setSelectedNode(n);
        setSelectedEdge(null);
        dragNodeRef.current = n;
        dragOffRef.current = { x: x - n.x, y: y - n.y };
        canvas.style.cursor = "grabbing";
        return;
      }
      const ed = getEdgeAt(x, y, nodesRef.current, edgesRef.current);
      if (ed) {
        setSelectedEdge(ed);
        setSelectedNode(null);
        return;
      }
      setSelectedNode(null);
      setSelectedEdge(null);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (connDragRef.current) {
        const { x, y } = getXY(e);
        const t = getNodeAt(x, y, nodesRef.current);
        if (t && t.id !== connDragRef.current.fromId) {
          const exists = edgesRef.current.find(
            (ed) => (ed.a === connDragRef.current!.fromId && ed.b === t.id) ||
                    (ed.a === t.id && ed.b === connDragRef.current!.fromId)
          );
          if (!exists) {
            const newEdge: DiagramEdge = { id: nextIdRef.current, a: connDragRef.current.fromId, b: t.id, label: "", dir: "one" };
            setNextId((prev) => prev + 1);
            setEdges((prev) => [...prev, newEdge]);
          }
        }
        connDragRef.current = null;
        canvas.style.cursor = "default";
        render();
        return;
      }
      if (dragNodeRef.current) {
        // If mouse barely moved it was a click not a drag — keep selection but don't deselect
        const { x, y } = getXY(e);
        const moved = Math.abs(x - mouseDownPosRef.x) + Math.abs(y - mouseDownPosRef.y);
        if (moved < 4) {
          // Pure click — selection was already set on mousedown, nothing more to do
        }
        dragNodeRef.current = null;
        canvas.style.cursor = hoverNodeIdRef.current ? "grab" : "default";
        return;
      }
      dragNodeRef.current = null;
      canvas.style.cursor = hoverNodeIdRef.current ? "grab" : "default";
    };

    // Suppress double-click text selection / event confusion on the canvas
    const onDblClick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

    const onMouseLeave = () => {
      if (connDragRef.current) { connDragRef.current = null; render(); }
      dragNodeRef.current = null;
      setHoverNodeId(null);
      canvas.style.cursor = "default";
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("dblclick", onDblClick);
    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("dblclick", onDblClick);
    };
  }, [render, addNode]);

  // ── Drop from palette ────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = paletteDragTypeRef.current || e.dataTransfer.getData("text/plain");
    if (!type || !DEFS[type]) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / r.width;
    const scaleY = canvasRef.current!.height / r.height;
    addNode(type, (e.clientX - r.left) * scaleX, (e.clientY - r.top) * scaleY);
    paletteDragTypeRef.current = null;
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const deleteSelected = () => {
    if (selectedNode) {
      setNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
      setEdges((prev) => prev.filter((e) => e.a !== selectedNode.id && e.b !== selectedNode.id));
      setSelectedNode(null);
    } else if (selectedEdge) {
      setEdges((prev) => prev.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
    }
  };

  const updateSelectedLabel = (v: string) => {
    if (!selectedNode) return;
    setNodes((prev) => prev.map((n) => n.id === selectedNode.id ? { ...n, label: v } : n));
    setSelectedNode((prev) => prev ? { ...prev, label: v } : null);
  };

  const updateSelectedRole = (v: string) => {
    if (!selectedNode) return;
    setNodes((prev) => prev.map((n) => n.id === selectedNode.id ? { ...n, role: v } : n));
    setSelectedNode((prev) => prev ? { ...prev, role: v } : null);
  };

  const updateEdgeLabel = (v: string) => {
    if (!selectedEdge) return;
    setEdges((prev) => prev.map((e) => e.id === selectedEdge.id ? { ...e, label: v } : e));
    setSelectedEdge((prev) => prev ? { ...prev, label: v } : null);
  };

  const setEdgeDir = (dir: "one" | "both") => {
    if (!selectedEdge) return;
    setEdges((prev) => prev.map((e) => e.id === selectedEdge.id ? { ...e, dir } : e));
    setSelectedEdge((prev) => prev ? { ...prev, dir } : null);
  };

  const captureSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const b64 = canvas.toDataURL("image/png").split(",")[1];
    onCaptureSnapshot(b64);
  };

  const clearCanvas = () => {
    setNodes([]); setEdges([]); setSelectedNode(null); setSelectedEdge(null); setEvaluation(null);
  };

  // ── Evaluate ──────────────────────────────────────────────────────────────────

  const evaluate = async () => {
    setEvaluating(true);
    setEvaluation(null);
    captureSnapshot();

    const nodeList = nodes.map((n) =>
      `${n.type}(label:"${n.label}"${n.role ? ",role:" + n.role : ""})`
    ).join("; ");
    const edgeList = edges.map((e) => {
      const a = nodes.find((n) => n.id === e.a);
      const b = nodes.find((n) => n.id === e.b);
      return a && b
        ? `${a.type}${e.dir === "both" ? "↔" : "→"}${b.type}${e.label ? " [" + e.label + "]" : ""}`
        : "";
    }).filter(Boolean).join(", ");

    // ── Client-side scoring — not delegated to AI ─────────────────────────
    const hasEnoughNodes    = nodes.length >= 4;
    const hasEnoughEdges    = edges.length >= 3;
    const hasCustomLabels   = nodes.some((n) => n.label !== n.def.label);
    const hasRoles          = nodes.some((n) => n.role !== "");
    const hasEdgeLabels     = edges.some((e) => e.label !== "");

    const checks = [
      {
        label: "Components placed",
        pass: hasEnoughNodes,
        note: hasEnoughNodes
          ? `${nodes.length} components placed on the diagram.`
          : `Add more components — at least 4 are needed to represent the concept.`,
      },
      {
        label: "Connections drawn",
        pass: hasEnoughEdges,
        note: hasEnoughEdges
          ? `${edges.length} connections show the flow between components.`
          : `Connect more components — at least 3 links are needed to show flow.`,
      },
      {
        label: "Labels & roles applied",
        pass: hasCustomLabels || hasRoles || hasEdgeLabels,
        note: (hasCustomLabels || hasRoles || hasEdgeLabels)
          ? `Components and/or links have been labeled to reflect the specific concept.`
          : `Rename components and label links to show what each one represents.`,
      },
    ];

    const passing = checks.filter((c) => c.pass).length;
    const isEmpty = nodes.length === 0 && edges.length === 0;
    const baseScore = isEmpty ? 0 : passing === 3 ? 10 : passing === 2 ? 7 : passing === 1 ? 5 : 3;
    const overallScore = baseScore;

    // ── AI used only for qualitative feedback, not scoring ────────────────
    const prompt = `You are giving brief feedback on a student's diagram during a whiteboard defense. Do NOT score or grade — scoring has already been handled separately.

Defense question: "${questionText}"
Concept: "${focusConcept}"

Student's diagram:
Nodes (${nodes.length}): ${nodeList || "(none)"}
Links (${edges.length}): ${edgeList || "(none)"}

Write feedback as 3 short check observations and 1-2 missing concept suggestions. Be encouraging and specific to what is actually in the diagram above. Respond ONLY with valid JSON, no markdown fences:
{
  "checks": [
    {"label": "short criterion name", "pass": true, "note": "one sentence citing something specific from the diagram"},
    {"label": "short criterion name", "pass": true, "note": "one sentence citing something specific from the diagram"},
    {"label": "short criterion name", "pass": ${passing < 3 ? "false" : "true"}, "note": "one sentence citing something specific from the diagram"}
  ],
  "missingConcepts": ["1-2 suggestions for enrichment only"],
  "integritySignal": "low|medium|high",
  "integrityNote": "one sentence on whether the diagram suggests genuine understanding"
}`;

    try {
      const res = await fetch("/api/defense/evaluate-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        // Always use OUR checks and score — never the AI's.
        // Only borrow the AI's note text if it happens to match our criteria count.
        const enrichedChecks = checks.map((c, i) => ({
          ...c,
          note: data.checks?.[i]?.note ?? c.note,
        }));
        setEvaluation({
          overallScore,
          checks: enrichedChecks,
          missingConcepts: data.missingConcepts ?? [],
          integritySignal: data.integritySignal ?? "low",
          integrityNote: data.integrityNote ?? "",
        });
      } else {
        setEvaluation({ overallScore, checks, missingConcepts: [], integritySignal: "low", integrityNote: "Evaluation service unavailable." });
      }
    } catch {
      setEvaluation({ overallScore, checks, missingConcepts: [], integritySignal: "low", integrityNote: "Could not reach evaluation endpoint." });
    }
    setEvaluating(false);
  };

  // ── Render UI ─────────────────────────────────────────────────────────────────

  const domain = domainOverride ?? getDomainForScenario(focusConcept);
  const domainComponents = DOMAIN_COMPONENTS[domain] ?? DOMAIN_COMPONENTS.general;
  // Scenario-specific components first, then the rest of the domain set, no duplicates
  // When domain is overridden by instructor, skip scenario components to show clean domain set
  const paletteTypes = domainOverride
    ? [...new Set([...domainComponents])]
    : [...new Set([...scenario.components, ...domainComponents])];

  return (
    <div className="space-y-3">
      {/* Hint bar */}
      <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl px-4 py-2.5 flex items-start gap-2">
        <Network className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
        <p className="text-xs text-indigo-300/80 leading-relaxed">
          <span className="font-bold text-indigo-300">Diagram task: </span>{scenario.hint}
          <span className="text-indigo-400/60 ml-2">· Hover a node → drag a handle to connect · Click a link to edit or delete it</span>
        </p>
      </div>

      {/* Palette */}
      <div className="bg-[#0d0d11] border border-white/5 rounded-xl p-3">
        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={() => setPaletteOpen(!paletteOpen)}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white/60 transition flex-1"
          >
            Component palette — drag onto canvas
            <ChevronDown className={`w-3 h-3 transition-transform ${paletteOpen ? "rotate-180" : ""}`} />
          </button>
          {(role === "instructor" || role === "both") && (
            <select
              value={domainOverride ?? ""}
              onChange={(e) => setDomainOverride(e.target.value || null)}
              className="text-[10px] font-mono uppercase bg-[#111] border border-white/10 text-white/50 rounded px-2 py-1 cursor-pointer hover:border-white/20 transition"
              title="Override component palette domain"
            >
              <option value="">Auto-detect</option>
              <option value="networking">Networking</option>
              <option value="software">Software</option>
              <option value="code">Code / Flowchart</option>
              <option value="data">Data / ML</option>
              <option value="general">General</option>
            </select>
          )}
        </div>
        <div className={`flex flex-wrap gap-1.5 transition-all overflow-hidden ${paletteOpen ? "mt-3 max-h-96" : "mt-2 max-h-12"}`}>
          {paletteTypes.map((type) => {
            const d = DEFS[type];
            if (!d) return null;
            return (
              <div
                key={type}
                draggable
                onDragStart={() => { paletteDragTypeRef.current = type; }}
                style={{ borderColor: d.stroke, backgroundColor: d.fill + "80" }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-grab select-none hover:opacity-90 transition"
                title={`Drag ${d.label} onto canvas`}
              >
                <span className="text-xs" style={{ color: d.color }}>{d.icon}</span>
                <span className="text-[11px] font-mono" style={{ color: d.color }}>{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Canvas */}
      <div
        className="bg-[#080810] border border-white/30 rounded-xl overflow-hidden"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <canvas
          ref={canvasRef}
          width={660}
          height={400}
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </div>

      {/* Properties panel */}
      {(selectedNode || selectedEdge) && (
        <div className="bg-[#0d0d11] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white/60 uppercase tracking-widest font-mono">
              {selectedNode ? `${selectedNode.def.label} properties` : "Link properties"}
            </span>
            <button
              type="button"
              onClick={deleteSelected}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-900/60 bg-red-950/30 text-red-400 text-xs font-bold hover:bg-red-950/50 transition"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>

          {selectedNode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Label</label>
                <input
                  type="text"
                  value={selectedNode.label}
                  onChange={(e) => updateSelectedLabel(e.target.value)}
                  placeholder="e.g. VLAN 10 — Clinical"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Role</label>
                <select
                  value={selectedNode.role}
                  onChange={(e) => updateSelectedRole(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="">— none —</option>
                  <option value="enforcement">Enforcement boundary</option>
                  <option value="trusted">Trusted zone</option>
                  <option value="untrusted">Untrusted zone</option>
                  <option value="dmz">DMZ</option>
                  <option value="management">Management plane</option>
                  <option value="encrypted">Encrypted link</option>
                </select>
              </div>
            </div>
          )}

          {selectedEdge && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Link label</label>
                <input
                  type="text"
                  value={selectedEdge.label}
                  onChange={(e) => updateEdgeLabel(e.target.value)}
                  placeholder="e.g. AES-256 VPN, OSPF, 802.1Q trunk"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Direction</label>
                <div className="flex gap-2">
                  {(["one", "both"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setEdgeDir(d)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-bold font-mono uppercase tracking-wider transition ${
                        selectedEdge.dir === d
                          ? "bg-indigo-600/20 border-indigo-500/60 text-indigo-400"
                          : "bg-black/30 border-white/10 text-white/40 hover:text-white/60"
                      }`}
                    >
                      {d === "one" ? "→ One-way" : "↔ Both ways"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clearCanvas}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/40 text-xs font-bold hover:text-white/60 hover:bg-white/5 transition"
        >
          <Trash2 className="w-3 h-3" /> Clear
        </button>
        <button
          type="button"
          onClick={() => { clearCanvas(); setScenario(detectScenario(focusConcept)); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/40 text-xs font-bold hover:text-white/60 hover:bg-white/5 transition"
        >
          <RefreshCw className="w-3 h-3" /> Reset
        </button>
        <button
          type="button"
          onClick={captureSnapshot}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-900/50 text-emerald-400 text-xs font-bold hover:bg-emerald-950/30 transition ml-auto"
        >
          <CheckCircle className="w-3 h-3" /> Save snapshot
        </button>
        <button
          type="button"
          onClick={evaluate}
          disabled={evaluating || nodes.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold transition"
        >
          {evaluating ? (
            <><RefreshCw className="w-3 h-3 animate-spin" /> Evaluating…</>
          ) : (
            <><CheckCircle className="w-3 h-3" /> Evaluate diagram</>
          )}
        </button>
      </div>

      {/* Evaluation results */}
      {evaluation && (
        <div className="bg-[#0d0d11] border border-white/5 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-white/60 uppercase tracking-widest font-mono">Diagram evaluation</span>
            <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
              evaluation.overallScore === 10 ? "bg-emerald-950/40 text-emerald-300 border border-emerald-700/50"
              : evaluation.overallScore >= 8 ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
              : evaluation.overallScore >= 7 ? "bg-indigo-950/40 text-indigo-400 border border-indigo-900/50"
              : evaluation.overallScore >= 5 ? "bg-amber-950/40 text-amber-400 border border-amber-900/50"
              : "bg-red-950/40 text-red-400 border border-red-900/50"
            }`}>
              {evaluation.overallScore}/10
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
              evaluation.integritySignal === "low" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
              : evaluation.integritySignal === "medium" ? "bg-amber-950/40 text-amber-400 border border-amber-900/50"
              : "bg-red-950/40 text-red-400 border border-red-900/50"
            }`}>
              {evaluation.integritySignal === "low" ? "✓ Authentic"
               : evaluation.integritySignal === "medium" ? "⚠ Follow up"
               : "⛐ Flagged"}
            </span>
          </div>

          <div className="space-y-2">
            {evaluation.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs">
                <span className={`mt-0.5 shrink-0 ${c.pass ? "text-emerald-400" : "text-red-400"}`}>
                  {c.pass ? "✓" : "✗"}
                </span>
                <div>
                  <span className="font-bold text-white/70">{c.label}</span>
                  <span className="text-white/40 ml-2">{c.note}</span>
                </div>
              </div>
            ))}
            {evaluation.missingConcepts.length > 0 && (
              <div className="flex items-start gap-2.5 text-xs">
                <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-white/70">Missing concepts</span>
                  <span className="text-white/40 ml-2">{evaluation.missingConcepts.join(", ")}</span>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2.5 text-xs pt-1 border-t border-white/5">
              <span className="text-white/20 shrink-0">↳</span>
              <span className="text-white/40 italic">{evaluation.integrityNote}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
