import React, { useEffect, useRef, useState, useCallback } from "react";
import { Network, Trash2, RefreshCw, CheckCircle, AlertTriangle, ChevronDown } from "lucide-react";

// ??? Types ????????????????????????????????????????????????????????????????????

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

interface DiagramGroup {
  id: number;
  x: number;
  y: number;
  rx: number;   // horizontal radius
  ry: number;   // vertical radius
  label: string;
  color: string;
}

interface DiagramTextLabel {
  id: number;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
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
  focusConcept: string;       // from DefenseQuestion.focusConcept
  questionText: string;       // from DefenseQuestion.questionText
  onCaptureSnapshot: (b64: string, evaluation?: any) => void;
  role: "student" | "instructor" | "both";
  isVisible: boolean;
  savedState?: any | null;
  onStateChange?: (state: any) => void;
  diagramDomain?: string;
  wsRef?: React.MutableRefObject<WebSocket | null>;
  sessionId?: string;
}

// ??? Constants ????????????????????????????????????????????????????????????????

const NODE_W = 80;
const NODE_H = 48;
const RX = 8;
const HANDLE_R = 7;
const HANDLE_HIT = 14;

const DEFS: Record<string, NodeDef> = {
  // ── Networking ──────────────────────────────────────────────────────────────
  router:   { icon: "ti-router",           label: "Router",      color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  firewall: { icon: "ti-shield",           label: "Firewall",    color: "#f87171", fill: "#450a0a", stroke: "#991b1b" },
  switch:   { icon: "ti-switch",           label: "Switch",      color: "#a78bfa", fill: "#2e1065", stroke: "#6d28d9" },
  vlan:     { icon: "ti-circles-relation", label: "VLAN",        color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  server:   { icon: "ti-server",           label: "Server",      color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  cloud:    { icon: "ti-cloud",            label: "Cloud",       color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  endpoint: { icon: "ti-device-laptop",   label: "Endpoint",    color: "#d1d5db", fill: "#1f2937", stroke: "#4b5563" },
  wifi:     { icon: "ti-wifi",             label: "Wi-Fi AP",    color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  isp:      { icon: "ti-world",            label: "ISP",         color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  noc:      { icon: "ti-eye",              label: "NOC",         color: "#6ee7b7", fill: "#022c22", stroke: "#059669" },
  siem:     { icon: "ti-activity",         label: "SIEM",        color: "#fca5a5", fill: "#450a0a", stroke: "#b91c1c" },
  shield:   { icon: "ti-shield-check",     label: "Safeguard",   color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  lock:     { icon: "ti-lock",             label: "Access Ctrl", color: "#a78bfa", fill: "#1e1b4b", stroke: "#7c3aed" },
  dmz:      { icon: "ti-hexagon",          label: "DMZ",         color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  // ── Software / Code ─────────────────────────────────────────────────────────
  func:     { icon: "ti-code",             label: "Function",    color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  input:    { icon: "ti-arrow-bar-to-down",label: "Input",       color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  output:   { icon: "ti-arrow-bar-up",     label: "Output",      color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  process:  { icon: "ti-cpu",             label: "Process",     color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  decision: { icon: "ti-diamond",          label: "Decision",    color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  loop:     { icon: "ti-refresh",          label: "Loop",        color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  database: { icon: "ti-database",         label: "Database",    color: "#f87171", fill: "#450a0a", stroke: "#991b1b" },
  api:      { icon: "ti-api",              label: "API Call",    color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  file:     { icon: "ti-file",             label: "File/IO",     color: "#6ee7b7", fill: "#022c22", stroke: "#059669" },
  class:    { icon: "ti-package",          label: "Class",       color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  module:   { icon: "ti-puzzle",           label: "Module",      color: "#a78bfa", fill: "#2e1065", stroke: "#6d28d9" },
  start:    { icon: "ti-player-play",      label: "Start/End",   color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  // ── Business / Workflow ──────────────────────────────────────────────────────
  biz_start:    { icon: "ti-player-play",    label: "Trigger",     color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  biz_task:     { icon: "ti-checkbox",       label: "Task",        color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  biz_decision: { icon: "ti-diamond",        label: "Decision",    color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  biz_approval: { icon: "ti-circle-check",   label: "Approval",    color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  biz_notify:   { icon: "ti-bell",           label: "Notify",      color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  biz_data:     { icon: "ti-database",       label: "Data Store",  color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  biz_role:     { icon: "ti-user",           label: "Role/Dept",   color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  biz_end:      { icon: "ti-flag",           label: "Outcome",     color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  // ── UX / Design ─────────────────────────────────────────────────────────────
  ux_screen:    { icon: "ti-device-desktop", label: "Screen",      color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  ux_action:    { icon: "ti-cursor-text",    label: "User Action", color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  ux_decision:  { icon: "ti-diamond",        label: "Decision",    color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  ux_input:     { icon: "ti-forms",          label: "Form/Input",  color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  ux_feedback:  { icon: "ti-message",        label: "Feedback",    color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  ux_nav:       { icon: "ti-arrow-right",    label: "Navigate",    color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  ux_modal:     { icon: "ti-layout-navbar",  label: "Modal/Pop-up",color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  ux_end:       { icon: "ti-flag",           label: "End State",   color: "#6ee7b7", fill: "#022c22", stroke: "#059669" },
  model:    { icon: "ti-brain",            label: "Model",       color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  dataset:  { icon: "ti-table",            label: "Dataset",     color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  pipeline: { icon: "ti-git-branch",       label: "Pipeline",    color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  layer:    { icon: "ti-stack",            label: "Layer",       color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  // ── UML ──────────────────────────────────────────────────────────────────────
  uml_class:    { icon: "ti-package",        label: "Class",       color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  uml_interface:{ icon: "ti-brackets",       label: "Interface",   color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  uml_abstract: { icon: "ti-layer-difference",label: "Abstract",   color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  uml_inherit:  { icon: "ti-arrow-up",       label: "Inherits",    color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  uml_compose:  { icon: "ti-diamond",        label: "Composition", color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  uml_aggregate:{ icon: "ti-diamond",        label: "Aggregation", color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  uml_depend:   { icon: "ti-arrow-right",    label: "Dependency",  color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  uml_method:   { icon: "ti-code",           label: "Method",      color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  uml_attr:     { icon: "ti-tag",            label: "Attribute",   color: "#6ee7b7", fill: "#022c22", stroke: "#059669" },
  uml_note:     { icon: "ti-notes",          label: "Note",        color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  // ── State / State Transition ─────────────────────────────────────────────────
  st_initial:   { icon: "ti-player-play",    label: "Initial",     color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  st_state:     { icon: "ti-square",         label: "State",       color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  st_final:     { icon: "ti-flag",           label: "Final",       color: "#f87171", fill: "#450a0a", stroke: "#991b1b" },
  st_transition:{ icon: "ti-arrow-right",    label: "Transition",  color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  st_event:     { icon: "ti-bolt",           label: "Event/Guard", color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  st_action:    { icon: "ti-player-record",  label: "Action",      color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  st_choice:    { icon: "ti-diamond",        label: "Choice",      color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  st_fork:      { icon: "ti-git-branch",     label: "Fork/Join",   color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  db_entity:   { icon: "ti-table",          label: "Entity",      color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  db_attr:     { icon: "ti-tag",            label: "Attribute",   color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  db_key:      { icon: "ti-key",            label: "Primary Key", color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  db_fk:       { icon: "ti-link",           label: "Foreign Key", color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  db_table:    { icon: "ti-layout-rows",    label: "Table",       color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  db_view:     { icon: "ti-eye",            label: "View",        color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  db_proc:     { icon: "ti-code",           label: "Procedure",   color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  db_index:    { icon: "ti-list-search",    label: "Index",       color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
  db_rel_one:  { icon: "ti-arrow-right",    label: "One-to-One",  color: "#6ee7b7", fill: "#022c22", stroke: "#059669" },
  db_rel_many: { icon: "ti-arrows-split",   label: "One-to-Many", color: "#f87171", fill: "#450a0a", stroke: "#991b1b" },
};

const ROLE_COLORS: Record<string, string> = {
  enforcement: "#ef4444",
  trusted:     "#10b981",
  untrusted:   "#f59e0b",
  dmz:         "#8b5cf6",
  management:  "#3b82f6",
  encrypted:   "#06b6d4",
};

const SCENARIO_PALETTES: Array<{
  keywords: string[];
  components: string[];
  hint: string;
}> = [
  // ── Networking ──────────────────────────────────────────────────────────────
  {
    keywords: ["vlan", "segmentation", "segment", "network", "subnet"],
    components: ["firewall", "router", "switch", "vlan", "vlan", "vlan", "endpoint", "server", "wifi", "lock", "noc", "siem", "cloud", "isp"],
    hint: "Show at least three VLANs, place the firewall at the enforcement boundary, label each VLAN.",
  },
  {
    keywords: ["failover", "redundan", "ospf", "isp", "wan", "backup"],
    components: ["router", "router", "firewall", "cloud", "isp", "isp"],
    hint: "Show primary and backup ISP paths, dual edge routers, and the cloud destination.",
  },
  {
    keywords: ["hipaa", "safeguard", "compliance", "phy", "admin", "technical"],
    components: ["shield", "server", "lock", "endpoint", "noc", "cloud"],
    hint: "Map all three HIPAA safeguard categories (administrative, physical, technical) to components.",
  },
  {
    keywords: ["noc", "siem", "monitor", "alert", "incident response", "log management"],
    components: ["noc", "siem", "firewall", "switch", "router", "server"],
    hint: "Connect log sources to the SIEM, then show the NOC analyst connection and alert path.",
  },
  {
    keywords: ["acl", "access control", "firewall rule", "packet filter"],
    components: ["router", "firewall", "lock", "server", "endpoint", "dmz"],
    hint: "Show ACL placement at the routing boundary and which traffic is permitted vs denied.",
  },
  // ── Software / Code ─────────────────────────────────────────────────────────
  {
    keywords: ["function", "flow", "algorithm", "python", "java", "code", "program", "script", "method"],
    components: ["start", "input", "process", "decision", "loop", "output", "func", "file"],
    hint: "Sketch a flowchart: Start -> Input -> Process -> Decision/Loop -> Output. Label each step.",
  },
  {
    keywords: ["class", "object", "oop", "inheritance", "polymorphism", "encapsulation"],
    components: ["class", "class", "module", "func", "database", "api"],
    hint: "Show class relationships, inheritance arrows, and key methods or attributes.",
  },
  {
    keywords: ["api", "rest", "http", "endpoint", "request", "response", "web service"],
    components: ["input", "api", "process", "database", "output", "cloud", "server"],
    hint: "Show the request/response flow: Client -> API endpoint -> Processing -> Database -> Response.",
  },
  {
    keywords: ["database", "sql", "query", "schema", "table", "crud", "data model", "erd", "entity", "relational"],
    components: ["db_entity", "db_entity", "db_table", "db_key", "db_fk", "db_rel_one", "db_rel_many", "db_attr"],
    hint: "Draw entities as boxes, add primary keys, connect with relationship lines (one-to-one or one-to-many).",
  },
  {
    keywords: ["pipeline", "etl", "data flow", "transform", "extract", "load"],
    components: ["input", "pipeline", "process", "process", "database", "output", "file"],
    hint: "Show each pipeline stage: Extract -> Transform -> Load, with data sources and destinations.",
  },
  // ── Business / Workflow ──────────────────────────────────────────────────────
  {
    keywords: ["workflow", "business process", "bpmn", "approval", "operations", "procurement", "supply chain", "erp"],
    components: ["biz_start", "biz_task", "biz_decision", "biz_approval", "biz_notify", "biz_end", "biz_data", "biz_role"],
    hint: "Map the business process: trigger -> tasks -> decision gates -> approvals -> outcome.",
  },
  {
    keywords: ["stakeholder", "swimlane", "department", "handoff", "escalation", "sla"],
    components: ["biz_role", "biz_role", "biz_task", "biz_decision", "biz_approval", "biz_notify", "biz_end"],
    hint: "Use swimlanes to show which department/role owns each step, and where handoffs occur.",
  },
  {
    keywords: ["customer journey", "touchpoint", "experience", "crm", "sales", "marketing funnel"],
    components: ["biz_start", "biz_task", "biz_decision", "biz_notify", "biz_data", "biz_end", "biz_role"],
    hint: "Show each customer touchpoint in sequence, decision points, and conversion or drop-off outcomes.",
  },
  // ── UML ──────────────────────────────────────────────────────────────────────
  {
    keywords: ["uml", "class diagram", "inheritance", "polymorphism", "encapsulation", "interface", "abstract"],
    components: ["uml_class", "uml_class", "uml_interface", "uml_abstract", "uml_inherit", "uml_compose", "uml_aggregate", "uml_depend"],
    hint: "Draw classes with attributes and methods, connect with inheritance (open arrow), composition (filled diamond), or dependency (dashed arrow).",
  },
  {
    keywords: ["sequence diagram", "use case", "actor", "message", "lifeline"],
    components: ["uml_class", "uml_interface", "uml_method", "uml_depend", "uml_inherit", "uml_note"],
    hint: "Show actors/objects as boxes, interactions as arrows, and add notes for constraints.",
  },
  // ── State / State Transition ─────────────────────────────────────────────────
  {
    keywords: ["state machine", "state diagram", "statechart", "fsm", "finite state", "state transition"],
    components: ["st_initial", "st_state", "st_state", "st_state", "st_event", "st_action", "st_choice", "st_final"],
    hint: "Start with Initial, connect States with labeled Transitions (event [guard] / action), end with Final.",
  },
  {
    keywords: ["lifecycle", "status", "pending", "processing", "active", "idle", "complete", "workflow state"],
    components: ["st_initial", "st_state", "st_state", "st_event", "st_transition", "st_choice", "st_fork", "st_final"],
    hint: "Map each lifecycle status as a State, label each arrow with the event that triggers the transition.",
  },
  // ── UX / Design ─────────────────────────────────────────────────────────────
  {
    keywords: ["ux", "ui", "user interface", "wireframe", "prototype", "usability", "design", "interaction"],
    components: ["ux_screen", "ux_action", "ux_decision", "ux_input", "ux_feedback", "ux_nav", "ux_modal", "ux_end"],
    hint: "Sketch the user flow: screen states -> user actions -> system responses -> navigation paths.",
  },
  {
    keywords: ["user flow", "navigation", "screen", "page", "modal", "form", "button", "click"],
    components: ["ux_screen", "ux_nav", "ux_action", "ux_input", "ux_modal", "ux_feedback", "ux_decision", "ux_end"],
    hint: "Map screen-to-screen navigation: show what happens on each user action and where they go next.",
  },
  {
    keywords: ["heuristic", "accessibility", "wcag", "persona", "user research", "card sort"],
    components: ["ux_screen", "ux_action", "ux_feedback", "ux_decision", "ux_input", "ux_end"],
    hint: "Diagram the evaluation framework or research process and how findings map to design decisions.",
  },
  {
    keywords: ["machine learning", "neural", "training", "model", "ai", "deep learning", "classification"],
    components: ["dataset", "pipeline", "model", "layer", "layer", "output", "process"],
    hint: "Show data ingestion, preprocessing, model layers, training loop, and output/evaluation.",
  },
  {
    keywords: ["regression", "classification", "clustering", "feature", "predict"],
    components: ["dataset", "process", "model", "decision", "output", "pipeline"],
    hint: "Show feature engineering, model training, prediction pipeline, and evaluation metrics.",
  },
];

const NETWORKING_COMPONENTS = ["router", "firewall", "switch", "server", "cloud", "endpoint", "vlan", "isp", "wifi", "lock", "noc", "siem", "dmz", "shield"];
const SOFTWARE_COMPONENTS = ["start", "input", "process", "decision", "loop", "output", "func", "file", "database"];
const AI_COMPONENTS = ["dataset", "pipeline", "model", "layer", "process", "output", "input"];

const ALL_COMPONENTS = Object.keys(DEFS);

function detectScenario(concept: string): { components: string[]; hint: string } {
  const lower = (concept || "").toLowerCase();

  // Check software/code FIRST to prevent networking keywords like "log" in "logic" from matching
  const isSoftwareFirst = /python|javascript|typescript|def |function |class |method|algorithm|regex|parse|string|script|flowchart|text.*process|process.*text/.test(lower);
  if (isSoftwareFirst) return {
    components: ["start", "input", "process", "decision", "loop", "output", "func", "file", "database"],
    hint: "Sketch a flowchart: Start -> Input -> Process -> Decision/Loop -> Output. Label each step clearly.",
  };

  // Check specific scenarios
  for (const s of SCENARIO_PALETTES) {
    if (s.keywords.some((k) => lower.includes(k))) {
      return { components: s.components, hint: s.hint };
    }
  }

  // Detect broad domain from concept
  const isSoftware = /python|java|code|script|program|function|class|algorithm|loop|variable|method|debug/.test(lower);
  const isAI = /machine learning|neural|model|dataset|training|ai|deep learning|predict/.test(lower);
  const isData = /erd|entity.relation|data model|schema|relational|database design|normalization/.test(lower);
  const isBusiness = /workflow|business|process|approval|stakeholder|crm|erp|supply|operations|procurement/.test(lower);
  const isUX = /ux|ui|user interface|wireframe|screen|navigation|usability|design|persona|heuristic/.test(lower);
  const isUML = /uml|class diagram|inheritance|polymorphism|interface|abstract class|composition|aggregation/.test(lower);
  const isState = /state machine|state diagram|statechart|fsm|finite state|state transition|lifecycle/.test(lower);

  if (isAI) return { components: AI_COMPONENTS, hint: "Diagram the ML pipeline: data ingestion, preprocessing, model training, and output evaluation." };
  if (isUML) return { components: ["uml_class", "uml_class", "uml_interface", "uml_abstract", "uml_inherit", "uml_compose", "uml_aggregate", "uml_depend"], hint: "Draw classes, connect with inheritance, composition, or dependency arrows." };
  if (isState) return { components: ["st_initial", "st_state", "st_state", "st_event", "st_action", "st_choice", "st_fork", "st_final"], hint: "Start with Initial, connect States with labeled Transitions, end with Final." };
  if (isData) return { components: ["db_entity", "db_entity", "db_table", "db_key", "db_fk", "db_rel_one", "db_rel_many", "db_attr"], hint: "Draw entities, add primary/foreign keys, and connect with relationship lines." };
  if (isBusiness) return { components: ["biz_start", "biz_role", "biz_task", "biz_decision", "biz_approval", "biz_notify", "biz_data", "biz_end"], hint: "Map the business process: trigger -> roles -> tasks -> decisions -> approvals -> outcome." };
  if (isUX) return { components: ["ux_screen", "ux_action", "ux_decision", "ux_input", "ux_feedback", "ux_nav", "ux_modal", "ux_end"], hint: "Sketch the user flow: screens -> user actions -> system responses -> navigation paths." };
  if (isSoftware) return { components: SOFTWARE_COMPONENTS, hint: "Sketch a flowchart: Start -> Input -> Process -> Decision/Loop -> Output." };

  // Default to networking
  return {
    components: NETWORKING_COMPONENTS,
    hint: "Label each component clearly and connect them to show traffic flow.",
  };
}

// ??? Canvas drawing helpers ???????????????????????????????????????????????????

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

// ??? Component ????????????????????????????????????????????????????????????????

export default function DiagramBuilder({
  questionIndex,
  focusConcept,
  questionText,
  onCaptureSnapshot,
  role,
  isVisible,
  savedState,
  onStateChange,
  diagramDomain = "auto",
  wsRef,
  sessionId,
}: DiagramBuilderProps) {

  const getScenario = (concept: string) => {
    if (diagramDomain === "networking") return {
      components: ["router", "firewall", "switch", "server", "cloud", "endpoint", "vlan", "isp", "wifi", "lock", "noc", "siem", "dmz", "shield"],
      hint: "Label each component clearly and connect them to show traffic flow.",
    };
    if (diagramDomain === "software") return {
      components: ["start", "input", "process", "decision", "loop", "output", "func", "file", "database"],
      hint: "Sketch a flowchart: Start -> Input -> Process -> Decision/Loop -> Output.",
    };
    if (diagramDomain === "ai") return {
      components: ["dataset", "pipeline", "model", "layer", "process", "output", "input"],
      hint: "Diagram the ML pipeline: data ingestion, preprocessing, model training, and output evaluation.",
    };
    if (diagramDomain === "business") return {
      components: ["biz_start", "biz_role", "biz_task", "biz_decision", "biz_approval", "biz_notify", "biz_data", "biz_end"],
      hint: "Map the business process: trigger -> roles -> tasks -> decisions -> approvals -> outcome.",
    };
    if (diagramDomain === "uml") return {
      components: ["uml_class", "uml_class", "uml_interface", "uml_abstract", "uml_inherit", "uml_compose", "uml_aggregate", "uml_depend", "uml_method", "uml_note"],
      hint: "Draw classes with attributes and methods, connect with inheritance, composition, or dependency arrows.",
    };
    if (diagramDomain === "state") return {
      components: ["st_initial", "st_state", "st_state", "st_state", "st_event", "st_action", "st_choice", "st_fork", "st_transition", "st_final"],
      hint: "Start with Initial, connect States with labeled Transitions (event [guard] / action), end with Final.",
    };
    if (diagramDomain === "data") return {
      components: ["db_entity", "db_entity", "db_table", "db_key", "db_fk", "db_rel_one", "db_rel_many", "db_attr", "db_view", "db_proc"],
      hint: "Draw entities, add primary/foreign keys, and connect with relationship lines.",
    };
    if (diagramDomain === "business") return {
      components: ["biz_start", "biz_role", "biz_task", "biz_decision", "biz_approval", "biz_notify", "biz_data", "biz_end"],
      hint: "Map the business process: trigger -> roles -> tasks -> decisions -> approvals -> outcome.",
    };
    if (diagramDomain === "ux") return {
      components: ["ux_screen", "ux_action", "ux_decision", "ux_input", "ux_feedback", "ux_nav", "ux_modal", "ux_end"],
      hint: "Sketch the user flow: screens -> user actions -> system responses -> navigation paths.",
    };
    return detectScenario(concept);
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [groups, setGroups] = useState<DiagramGroup[]>([]);
  const [textLabels, setTextLabels] = useState<DiagramTextLabel[]>([]);
  const [nextId, setNextId] = useState(1);
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<DiagramEdge | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DiagramGroup | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<DiagramTextLabel | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<DiagramEvaluation | null>(null);
  const [scenario, setScenario] = useState<{ components: string[]; hint: string }>(() => {
    const base = getScenario(focusConcept);
    return { ...base, hint: questionText ? `Diagram task for this question: ${questionText.slice(0, 120)}${questionText.length > 120 ? "..." : ""}` : base.hint };
  });

  // Mutable refs for canvas interaction (avoids stale closure in event listeners)
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const groupsRef = useRef(groups);
  const textLabelsRef = useRef(textLabels);
  const nextIdRef = useRef(nextId);
  const selectedNodeRef = useRef(selectedNode);
  const hoverNodeIdRef = useRef(hoverNodeId);
  const dragNodeRef = useRef<DiagramNode | null>(null);
  const dragOffRef = useRef({ x: 0, y: 0 });
  const dragGroupRef = useRef<DiagramGroup | null>(null);
  const dragLabelRef = useRef<DiagramTextLabel | null>(null);
  const connDragRef = useRef<{
    fromId: number; fromX: number; fromY: number;
    curX: number; curY: number; snapTarget: DiagramNode | null;
  } | null>(null);
  const draggingPaletteType = useRef<string | null>(null);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { groupsRef.current = groups; }, [groups]);
  useEffect(() => { textLabelsRef.current = textLabels; }, [textLabels]);
  useEffect(() => { nextIdRef.current = nextId; }, [nextId]);
  useEffect(() => { selectedNodeRef.current = selectedNode; }, [selectedNode]);
  useEffect(() => { hoverNodeIdRef.current = hoverNodeId; }, [hoverNodeId]);

  // Persist diagram state to parent whenever it changes
  useEffect(() => {
    if (onStateChange && (nodes.length > 0 || edges.length > 0 || groups.length > 0 || textLabels.length > 0)) {
      onStateChange({ nodes, edges, groups, textLabels, nextId });
    }
  }, [nodes, edges, groups, textLabels]);

  // Broadcast live thumbnail to instructor dashboard (throttled to every 3s)
  const lastBroadcastRef = useRef<number>(0);
  useEffect(() => {
    if (!wsRef?.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!isVisible || nodes.length === 0) return;
    const now = Date.now();
    if (now - lastBroadcastRef.current < 3000) return;
    lastBroadcastRef.current = now;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const thumbnail = canvas.toDataURL("image/png");
    wsRef.current.send(JSON.stringify({
      type: "snapshot_update",
      sessionId,
      role,
      data: { thumbnail },
    }));
  }, [nodes, edges, groups, textLabels]);

  // Re-detect scenario and restore/clear canvas when question changes
  useEffect(() => {
    const base = getScenario(focusConcept);
    setScenario({
      ...base,
      hint: questionText ? `${questionText.slice(0, 120)}${questionText.length > 120 ? "..." : ""}` : base.hint,
    });
    setEvaluation(null);
    setEditingLabelId(null);
    setSelectedNode(null); setSelectedEdge(null); setSelectedGroup(null); setSelectedLabel(null);

    if (savedState) {
      // Restore previously saved diagram for this question
      setNodes(savedState.nodes || []);
      setEdges(savedState.edges || []);
      setGroups(savedState.groups || []);
      setTextLabels(savedState.textLabels || []);
      setNextId(savedState.nextId || 1);
    } else {
      // Fresh question — clear canvas
      setNodes([]); setEdges([]); setGroups([]); setTextLabels([]);
      setNextId(1);
    }
  }, [questionIndex, focusConcept]);

  // ?? Helpers ??????????????????????????????????????????????????????????????????

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
    const hov = nodeList.find((n) => n.id === hoverNodeIdRef.current);
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

  const getGroupAt = (x: number, y: number) => {
    for (let i = groupsRef.current.length - 1; i >= 0; i--) {
      const g = groupsRef.current[i];
      const dx = x - g.x, dy = y - g.y;
      // Point in ellipse: (dx/rx)^2 + (dy/ry)^2 <= 1
      // Use ring detection: between 0.8 and 1.0 of ellipse boundary
      const norm = (dx / g.rx) ** 2 + (dy / g.ry) ** 2;
      if (norm <= 1.0 && norm >= 0.7) return g;
    }
    return null;
  };

  const getLabelAt = (x: number, y: number) => {
    for (let i = textLabelsRef.current.length - 1; i >= 0; i--) {
      const l = textLabelsRef.current[i];
      const w = l.text.length * l.fontSize * 0.6;
      const h = l.fontSize + 4;
      if (x >= l.x - 4 && x <= l.x + w + 4 && y >= l.y - h && y <= l.y + 4) return l;
    }
    return null;
  };

  const clampX = (x: number) => Math.max(NODE_W / 2 + 4, Math.min(660 - NODE_W / 2 - 4, x));
  const clampY = (y: number) => Math.max(NODE_H / 2 + 4, Math.min(400 - NODE_H / 2 - 4, y));

  const addGroup = useCallback((x: number, y: number) => {
    const g: DiagramGroup = {
      id: nextIdRef.current, x, y, rx: 100, ry: 60,
      label: "Group", color: "#818CF8",
    };
    setNextId(p => p + 1);
    setGroups(prev => [...prev, g]);
  }, []);

  const addTextLabel = useCallback((x: number, y: number) => {
    const l: DiagramTextLabel = {
      id: nextIdRef.current, x, y,
      text: "Label", fontSize: 13, color: "#e2e8f0",
    };
    setNextId(p => p + 1);
    setTextLabels(prev => [...prev, l]);
    setEditingLabelId(l.id);
  }, []);

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

  // ?? Render ????????????????????????????????????????????????????????????????????

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

    // Draw groups (behind everything)
    groupsRef.current.forEach((g) => {
      const isSel = selectedGroup?.id === g.id;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.rx, g.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = g.color + "18";
      ctx.fill();
      ctx.strokeStyle = isSel ? "#fff" : g.color;
      ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (g.label) {
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = g.color;
        ctx.textAlign = "center";
        ctx.fillText(g.label, g.x, g.y - g.ry + 14);
      }
      ctx.restore();
    });

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
      const OFFSET = 4;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.setLineDash(isSel ? [5, 3] : []);

      if (e.dir === "both") {
        const px = -uy * 2.5, py = ux * 2.5;
        const ax1 = a.x + NODE_W / 2 * ux + OFFSET * ux + px;
        const ay1 = a.y + NODE_H / 2 * uy + OFFSET * uy + py;
        const bx1 = b.x - NODE_W / 2 * ux - OFFSET * ux + px;
        const by1 = b.y - NODE_H / 2 * uy - OFFSET * uy + py;
        const ax2 = b.x - NODE_W / 2 * ux - OFFSET * ux - px;
        const ay2 = b.y - NODE_H / 2 * uy - OFFSET * uy - py;
        const bx2 = a.x + NODE_W / 2 * ux + OFFSET * ux - px;
        const by2 = a.y + NODE_H / 2 * uy + OFFSET * uy - py;
        ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(bx1, by1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax2, ay2); ctx.lineTo(bx2, by2); ctx.stroke();
        ctx.setLineDash([]);
        drawArrowHead(ctx, bx1, by1, ux, uy, color);
        drawArrowHead(ctx, bx2, by2, -ux, -uy, color);
      } else {
        const sx = a.x + NODE_W / 2 * ux + OFFSET * ux;
        const sy = a.y + NODE_H / 2 * uy + OFFSET * uy;
        const ex = b.x - NODE_W / 2 * ux - OFFSET * ux;
        const ey = b.y - NODE_H / 2 * uy - OFFSET * uy;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        drawArrowHead(ctx, ex, ey, ux, uy, color);
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
      const lbl = n.label.length > 13 ? n.label.slice(0, 12) + "..." : n.label;
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
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }
    });
    // Text labels (on top of everything except editing overlay)
    textLabelsRef.current.forEach((l) => {
      if (l.id === editingLabelId) return; // skip — rendered as HTML input
      const isSel = selectedLabel?.id === l.id;
      ctx.save();
      ctx.font = `${l.fontSize}px sans-serif`;
      const tw = ctx.measureText(l.text).width;
      if (isSel) {
        ctx.fillStyle = "rgba(129,140,248,0.15)";
        ctx.fillRect(l.x - 3, l.y - l.fontSize - 1, tw + 6, l.fontSize + 6);
        ctx.strokeStyle = "#818CF8";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(l.x - 3, l.y - l.fontSize - 1, tw + 6, l.fontSize + 6);
        ctx.setLineDash([]);
      }
      ctx.fillStyle = l.color;
      ctx.textAlign = "left";
      ctx.fillText(l.text, l.x, l.y);
      ctx.restore();
    });
  }, [selectedEdge, selectedGroup, selectedLabel, editingLabelId]);

  // Re-render whenever state changes
  useEffect(() => { render(); }, [nodes, edges, groups, textLabels, selectedNode, selectedEdge, selectedGroup, selectedLabel, hoverNodeId, editingLabelId, render]);

  // Re-render when tab becomes visible -- canvas has 0 dimensions while hidden
  useEffect(() => {
    if (isVisible) {
      requestAnimationFrame(() => render());
    }
  }, [isVisible, render]);

  // ?? Canvas events ?????????????????????????????????????????????????????????????

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getXY = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      // Scale mouse coords from display size to canvas internal size
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

      if (dragGroupRef.current) {
        dragGroupRef.current.x = x - dragOffRef.current.x;
        dragGroupRef.current.y = y - dragOffRef.current.y;
        setGroups([...groupsRef.current]);
        return;
      }

      if (dragLabelRef.current) {
        dragLabelRef.current.x = x - dragOffRef.current.x;
        dragLabelRef.current.y = y - dragOffRef.current.y;
        setTextLabels([...textLabelsRef.current]);
        return;
      }

      const h = getHandleAt(x, y, nodesRef.current);
      if (h) { canvas.style.cursor = "crosshair"; render(); return; }

      const prev = hoverNodeIdRef.current;
      const hit = getNodeAt(x, y, nodesRef.current);
      const newId = hit ? hit.id : null;
      if (newId !== prev) {
        setHoverNodeId(newId);
      }
      canvas.style.cursor = hit ? "grab" : getLabelAt(x, y) || getGroupAt(x, y) ? "move" : "default";
    };

    const onMouseDown = (e: MouseEvent) => {
      const { x, y } = getXY(e);
      const h = getHandleAt(x, y, nodesRef.current);
      if (h) {
        connDragRef.current = { fromId: h.node.id, fromX: h.x, fromY: h.y, curX: x, curY: y, snapTarget: null };
        canvas.style.cursor = "crosshair";
        return;
      }
      const n = getNodeAt(x, y, nodesRef.current);
      if (n) {
        setSelectedNode(n); setSelectedEdge(null); setSelectedGroup(null); setSelectedLabel(null);
        dragNodeRef.current = n;
        dragOffRef.current = { x: x - n.x, y: y - n.y };
        canvas.style.cursor = "grabbing";
        return;
      }
      const ed = getEdgeAt(x, y, nodesRef.current, edgesRef.current);
      if (ed) {
        setSelectedEdge(ed); setSelectedNode(null); setSelectedGroup(null); setSelectedLabel(null);
        return;
      }
      const lbl = getLabelAt(x, y);
      if (lbl) {
        if (e.detail === 2) {
          setEditingLabelId(lbl.id);
        } else {
          setSelectedLabel(lbl); setSelectedNode(null); setSelectedEdge(null); setSelectedGroup(null);
          dragLabelRef.current = lbl;
          dragOffRef.current = { x: x - lbl.x, y: y - lbl.y };
        }
        return;
      }
      const grp = getGroupAt(x, y);
      if (grp) {
        setSelectedGroup(grp); setSelectedNode(null); setSelectedEdge(null); setSelectedLabel(null);
        dragGroupRef.current = grp;
        dragOffRef.current = { x: x - grp.x, y: y - grp.y };
        return;
      }
      setSelectedNode(null); setSelectedEdge(null); setSelectedGroup(null); setSelectedLabel(null);
      setEditingLabelId(null);
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
      dragNodeRef.current = null;
      dragGroupRef.current = null;
      dragLabelRef.current = null;
      canvas.style.cursor = hoverNodeIdRef.current ? "grab" : "default";
    };

    const onMouseLeave = () => {
      if (connDragRef.current) { connDragRef.current = null; render(); }
      dragNodeRef.current = null;
      dragGroupRef.current = null;
      dragLabelRef.current = null;
      setHoverNodeId(null);
      canvas.style.cursor = "default";
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [render, addNode]);

  // ── Palette drag via mousemove (replaces HTML5 drag-drop which fails on canvas) ──
  const dragGhostRef = useRef<HTMLDivElement | null>(null);

  const startPaletteDrag = (type: string, e: React.MouseEvent) => {
    draggingPaletteType.current = type;

    // Create a ghost element that follows the cursor
    const ghost = document.createElement("div");
    ghost.style.cssText = `
      position:fixed; pointer-events:none; z-index:9999;
      padding:4px 10px; border-radius:8px; font-size:11px; font-family:monospace;
      background:${DEFS[type]?.fill || "#1e1b4b"}; color:${DEFS[type]?.color || "#fff"};
      border:1px solid ${DEFS[type]?.stroke || "#818CF8"};
      left:${e.clientX + 10}px; top:${e.clientY - 16}px;
    `;
    ghost.textContent = DEFS[type]?.label || type;
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;

    const onMove = (me: MouseEvent) => {
      if (ghost) {
        ghost.style.left = `${me.clientX + 10}px`;
        ghost.style.top = `${me.clientY - 16}px`;
      }
    };

    const onUp = (me: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      dragGhostRef.current = null;

      // Check if dropped over the canvas
      const canvas = canvasRef.current;
      if (!canvas || !draggingPaletteType.current) return;
      const r = canvas.getBoundingClientRect();
      if (
        me.clientX >= r.left && me.clientX <= r.right &&
        me.clientY >= r.top && me.clientY <= r.bottom
      ) {
        const scaleX = canvas.width / r.width;
        const scaleY = canvas.height / r.height;
        const x = (me.clientX - r.left) * scaleX;
        const y = (me.clientY - r.top) * scaleY;
        addNode(draggingPaletteType.current, x, y);
      }
      draggingPaletteType.current = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ?? Actions ??????????????????????????????????????????????????????????????????

  const deleteSelected = () => {
    if (selectedNode) {
      setNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
      setEdges((prev) => prev.filter((e) => e.a !== selectedNode.id && e.b !== selectedNode.id));
      setSelectedNode(null);
    } else if (selectedEdge) {
      setEdges((prev) => prev.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
    } else if (selectedGroup) {
      setGroups((prev) => prev.filter((g) => g.id !== selectedGroup.id));
      setSelectedGroup(null);
    } else if (selectedLabel) {
      setTextLabels((prev) => prev.filter((l) => l.id !== selectedLabel.id));
      setSelectedLabel(null);
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

  const captureSnapshot = (evalResult?: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const b64 = canvas.toDataURL("image/png").split(",")[1];
    // If no explicit evalResult passed, include the current evaluation state if it exists
    onCaptureSnapshot(b64, evalResult !== undefined ? evalResult : evaluation || undefined);
  };

  const clearCanvas = () => {
    setNodes([]); setEdges([]); setGroups([]); setTextLabels([]);
    setSelectedNode(null); setSelectedEdge(null); setSelectedGroup(null); setSelectedLabel(null);
    setEditingLabelId(null); setEvaluation(null);
  };

  // ?? Evaluate ??????????????????????????????????????????????????????????????????

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
        ? `${a.type}${e.dir === "both" ? "<->" : "->"}${b.type}${e.label ? " [" + e.label + "]" : ""}`
        : "";
    }).filter(Boolean).join(", ");

    const prompt = `You are evaluating a student's network diagram during a whiteboard defense. Your job is to assess ONLY what is explicitly visible in the diagram data provided -- do NOT penalize for concepts that cannot be shown in a node-and-edge diagram.

Defense question concept: "${focusConcept}"
Full question: "${questionText}"

Student's diagram:
Nodes (${nodes.length}): ${nodeList || "(none)"}
Links (${edges.length}): ${edgeList || "(none)"}

EVALUATION RULES:
1. Base ALL criteria on what is structurally present in the node/edge data above.
2. Do NOT create criteria requiring text annotations or written explanations -- this is a diagram, not an essay.
3. Do NOT fail a criterion because a concept "could be more explicitly stated" -- if the structure implies it, mark it pass.
4. Criteria should be: topology correctness, component completeness, and connection logic -- not conceptual depth.
5. If the diagram has 8+ nodes and 6+ connections with meaningful labels, the score should be 8 or higher.
6. Only flag integritySignal as "medium" or "high" if the layout looks copy-pasted or random with no logical flow.

Respond ONLY with valid JSON, no markdown fences:
{
  "overallScore": <integer 1-10>,
  "checks": [
    {"label": "short criterion", "pass": true|false, "note": "one specific sentence referencing actual nodes/links"},
    {"label": "short criterion", "pass": true|false, "note": "one specific sentence referencing actual nodes/links"},
    {"label": "short criterion", "pass": true|false, "note": "one specific sentence referencing actual nodes/links"}
  ],
  "missingConcepts": ["only list if a structurally required component is completely absent from the diagram"],
  "integritySignal": "low|medium|high",
  "integrityNote": "one sentence on whether the topology layout suggests genuine understanding of the architecture"
}`;

    try {
      const res = await fetch("/api/defense/evaluate-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        // Enforce exact score based on check results
        if (data.checks && Array.isArray(data.checks)) {
          const passCount = data.checks.filter((c: {pass: boolean}) => c.pass).length;
          if (passCount === 3) data.overallScore = 10;
          else if (passCount === 2) data.overallScore = 7;
          else if (passCount === 1) data.overallScore = 4;
          else if (nodes.length > 0) data.overallScore = 1; // something placed but all wrong
          else data.overallScore = 0;
        }
        setEvaluation(data);
        // Note: student clicks "Save snapshot" explicitly to record this evaluation
      } else {
        // Fallback local evaluation
        setEvaluation({
          overallScore: nodes.length >= 3 && edges.length >= 2 ? 6 : 3,
          checks: [
            { label: "Components placed", pass: nodes.length >= 3, note: nodes.length < 3 ? "Add more components to represent the topology." : "Sufficient components present." },
            { label: "Traffic flow shown", pass: edges.length >= 2, note: edges.length < 2 ? "Connect components to show traffic flow." : "Connections present." },
            { label: "Labels meaningful", pass: nodes.some((n) => n.label !== n.def.label), note: nodes.some((n) => n.label !== n.def.label) ? "At least some labels customized." : "Rename components to match your specific design." },
          ],
          missingConcepts: [],
          integritySignal: "low",
          integrityNote: "Manual evaluation required -- AI evaluation unavailable.",
        });
      }
    } catch {
      setEvaluation({
        overallScore: 0,
        checks: [{ label: "Evaluation error", pass: false, note: "Could not reach evaluation endpoint." }],
        missingConcepts: [],
        integritySignal: "low",
        integrityNote: "Evaluation service unavailable.",
      });
    }
    setEvaluating(false);
  };

  // ?? Render UI ?????????????????????????????????????????????????????????????????

  // Show scenario components first, then add a few universal extras from the same domain
  // Don't show ALL_COMPONENTS -- that's 60+ items and overwhelms the palette
  const paletteTypes = [...new Set(scenario.components)];

  return (
    <div className="space-y-3">
      {/* Hint bar */}
      <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl px-4 py-2.5 flex items-start gap-2" role="note">
        <Network className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-sm text-indigo-300/80 leading-relaxed">
          <span className="font-bold text-indigo-300">Diagram task: </span>{scenario.hint}
          <span className="text-indigo-400/60 ml-2">{"· Click palette item to place · Drag a node handle to connect · Click a link to edit"}</span>
        </p>
      </div>

      {/* Palette */}
      <div className="bg-[#0d0d11] border border-white/5 rounded-xl p-3">
        <button
          type="button"
          onClick={() => setPaletteOpen(!paletteOpen)}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white/60 transition w-full"
        >
          Component palette -- drag onto canvas
          <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${paletteOpen ? "rotate-180" : ""}`} />
        </button>
        <div className={`flex flex-wrap gap-1.5 transition-all overflow-hidden ${paletteOpen ? "mt-3 max-h-96" : "mt-2 max-h-20"}`}>
          {paletteTypes.map((type) => {
            const d = DEFS[type];
            if (!d) return null;
            return (
              <div
                key={type}
                onMouseDown={(e) => startPaletteDrag(type, e)}
                onClick={() => {
                  const x = 200 + Math.random() * 260;
                  const y = 100 + Math.random() * 200;
                  addNode(type, x, y);
                }}
                style={{ borderColor: d.stroke, backgroundColor: d.fill + "80" }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-grab select-none hover:opacity-90 transition"
                title="Click to place, or drag onto canvas"
              >
                <i className={`ti ${d.icon} text-xs`} style={{ color: d.color }} aria-hidden="true" />
                <span className="text-[11px] font-mono" style={{ color: d.color }}>{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Canvas */}
      <div className="bg-[#080810] border border-white/5 rounded-xl overflow-hidden">
        <canvas
          ref={canvasRef}
          width={660}
          height={400}
          role="img"
          aria-label="Network diagram canvas. Use the palette above to add components, then connect them by hovering a node and dragging from its handles."
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </div>

      {/* Group properties */}
      {selectedGroup && !selectedNode && !selectedEdge && (
        <div className="bg-[#0d0d11] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white/60 uppercase tracking-widest font-mono">Group properties</span>
            <button type="button" onClick={deleteSelected} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-900/60 bg-red-950/30 text-red-400 text-xs font-bold hover:bg-red-950/50 transition">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Label</label>
              <input type="text" value={selectedGroup.label}
                onChange={(e) => {
                  setGroups(prev => prev.map(g => g.id === selectedGroup.id ? {...g, label: e.target.value} : g));
                  setSelectedGroup(prev => prev ? {...prev, label: e.target.value} : null);
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <div>
              <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Color</label>
              <select value={selectedGroup.color}
                onChange={(e) => {
                  setGroups(prev => prev.map(g => g.id === selectedGroup.id ? {...g, color: e.target.value} : g));
                  setSelectedGroup(prev => prev ? {...prev, color: e.target.value} : null);
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
              >
                <option value="#818CF8">Indigo</option>
                <option value="#34d399">Green</option>
                <option value="#f87171">Red</option>
                <option value="#fbbf24">Amber</option>
                <option value="#60a5fa">Blue</option>
                <option value="#f472b6">Pink</option>
                <option value="#9ca3af">Gray</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Width (radius)</label>
              <input type="range" min="50" max="300" value={selectedGroup.rx}
                onChange={(e) => {
                  const rx = Number(e.target.value);
                  const updated = {...selectedGroup, rx};
                  setGroups(prev => prev.map(g => g.id === selectedGroup.id ? updated : g));
                  setSelectedGroup(updated);
                }}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Height (radius)</label>
              <input type="range" min="30" max="200" value={selectedGroup.ry}
                onChange={(e) => {
                  const ry = Number(e.target.value);
                  const updated = {...selectedGroup, ry};
                  setGroups(prev => prev.map(g => g.id === selectedGroup.id ? updated : g));
                  setSelectedGroup(updated);
                }}
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Text label properties / inline editor */}
      {selectedLabel && !selectedNode && !selectedEdge && !selectedGroup && (
        <div className="bg-[#0d0d11] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white/60 uppercase tracking-widest font-mono">Label properties</span>
            <button type="button" onClick={deleteSelected} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-900/60 bg-red-950/30 text-red-400 text-xs font-bold hover:bg-red-950/50 transition">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Text</label>
              <input type="text" value={selectedLabel.text}
                onChange={(e) => {
                  setTextLabels(prev => prev.map(l => l.id === selectedLabel.id ? {...l, text: e.target.value} : l));
                  setSelectedLabel(prev => prev ? {...prev, text: e.target.value} : null);
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <div>
              <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Color</label>
              <select value={selectedLabel.color}
                onChange={(e) => {
                  setTextLabels(prev => prev.map(l => l.id === selectedLabel.id ? {...l, color: e.target.value} : l));
                  setSelectedLabel(prev => prev ? {...prev, color: e.target.value} : null);
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
              >
                <option value="#e2e8f0">White</option>
                <option value="#818CF8">Indigo</option>
                <option value="#34d399">Green</option>
                <option value="#f87171">Red</option>
                <option value="#fbbf24">Amber</option>
                <option value="#60a5fa">Blue</option>
                <option value="#f472b6">Pink</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-white/40 mb-1 font-mono uppercase tracking-wider">Font size</label>
            <input type="range" min="10" max="24" value={selectedLabel.fontSize}
              onChange={(e) => {
                const fontSize = Number(e.target.value);
                setTextLabels(prev => prev.map(l => l.id === selectedLabel.id ? {...l, fontSize} : l));
                setSelectedLabel(prev => prev ? {...prev, fontSize} : null);
              }}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Node / edge properties */}
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
                  placeholder="e.g. VLAN 10 -- Clinical"
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
                  <option value="">-- none --</option>
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
                      {d === "one" ? "One-way" : "Both ways"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => addGroup(330, 200)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-400 text-xs font-bold hover:bg-indigo-950/40 transition"
          title="Add a dashed ellipse to group/enclose components"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2"><ellipse cx="6.5" cy="6.5" rx="6" ry="4"/></svg>
          Add Group
        </button>
        <button
          type="button"
          onClick={() => addTextLabel(100, 100)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-950/40 transition"
          title="Add a free text label anywhere on the canvas"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><text x="1" y="11" fontSize="11" fontFamily="monospace">T</text></svg>
          Add Label
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Clear the diagram? This cannot be undone.")) clearCanvas();
          }}
          aria-label="Clear all diagram elements"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/40 text-sm font-bold hover:text-white/60 hover:bg-white/5 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Clear
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reset the diagram and reload the scenario palette?")) {
              clearCanvas();
              const base = getScenario(focusConcept);
              setScenario({ ...base, hint: questionText ? `${questionText.slice(0, 120)}${questionText.length > 120 ? "..." : ""}` : base.hint });
            }
          }}
          aria-label="Reset diagram and reload scenario"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/40 text-sm font-bold hover:text-white/60 hover:bg-white/5 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Reset
        </button>
        <button
          type="button"
          onClick={() => captureSnapshot()}
          aria-label="Save diagram as snapshot for the report"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-900/50 text-emerald-400 text-sm font-bold hover:bg-emerald-950/30 transition ml-auto focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
          {evaluation ? "Save snapshot + evaluation" : "Save snapshot"}
        </button>
        <button
          type="button"
          onClick={evaluate}
          disabled={evaluating || nodes.length === 0}
          aria-label="Evaluate diagram with AI"
          aria-busy={evaluating}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          {evaluating ? (
            <><RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Evaluating...</>
          ) : (
            <><CheckCircle className="w-3.5 h-3.5" aria-hidden="true" /> Evaluate diagram</>
          )}
        </button>
      </div>

      {/* Evaluation results */}
      {evaluation && (
        <div className="bg-[#0d0d11] border border-white/5 rounded-xl p-4 space-y-3" role="region" aria-label="Diagram evaluation results" aria-live="polite">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-white/60 uppercase tracking-widest font-mono">Diagram evaluation</span>
            <span className={`ml-auto px-2.5 py-1 rounded-full text-sm font-bold font-mono ${
              evaluation.overallScore >= 8 ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
              : evaluation.overallScore >= 6 ? "bg-amber-950/40 text-amber-400 border border-amber-900/50"
              : "bg-red-950/40 text-red-400 border border-red-900/50"
            }`}>
              <span aria-label={`Score: ${evaluation.overallScore} out of 10`}>{evaluation.overallScore}/10</span>
            </span>
            <span className={`px-2.5 py-1 rounded-full text-sm font-bold font-mono ${
              evaluation.integritySignal === "low" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
              : evaluation.integritySignal === "medium" ? "bg-amber-950/40 text-amber-400 border border-amber-900/50"
              : "bg-red-950/40 text-red-400 border border-red-900/50"
            }`}>
              {evaluation.integritySignal === "low"
                ? <><CheckCircle className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />Low concern</>
                : evaluation.integritySignal === "medium"
                  ? <><AlertTriangle className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />Review needed</>
                  : <><AlertTriangle className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />Flagged</>}
            </span>
          </div>

          <div className="space-y-2">
            {evaluation.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <span className={`mt-0.5 shrink-0 font-bold ${c.pass ? "text-emerald-400" : "text-red-400"}`} aria-hidden="true">
                  {c.pass ? "✓" : "✗"}
                </span>
                <div>
                  <span className="font-bold text-white/70">{c.label}</span>
                  <span className="text-white/40 ml-2">{c.note}</span>
                </div>
                <span className="sr-only">{c.pass ? "Pass" : "Fail"}: {c.label}. {c.note}</span>
              </div>
            ))}
            {evaluation.missingConcepts.length > 0 && (
              <div className="flex items-start gap-2.5 text-sm">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <span className="font-bold text-white/70">Missing concepts</span>
                  <span className="text-white/40 ml-2">{evaluation.missingConcepts.join(", ")}</span>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2.5 text-sm pt-1 border-t border-white/5">
              <span className="text-white/20 shrink-0" aria-hidden="true">--</span>
              <span className="text-white/40 italic">{evaluation.integrityNote}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
