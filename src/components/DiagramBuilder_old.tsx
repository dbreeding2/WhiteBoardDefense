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
  onCaptureSnapshot: (b64: string) => void;
  role: "student" | "instructor" | "both";
}

// ??? Constants ????????????????????????????????????????????????????????????????

const NODE_W = 80;
const NODE_H = 48;
const RX = 8;
const HANDLE_R = 7;
const HANDLE_HIT = 14;

const DEFS: Record<string, NodeDef> = {
  router:   { icon: "?",  label: "Router",      color: "#818CF8", fill: "#1e1b4b", stroke: "#4338ca" },
  firewall: { icon: "?",  label: "Firewall",    color: "#f87171", fill: "#450a0a", stroke: "#991b1b" },
  switch:   { icon: "?",  label: "Switch",      color: "#a78bfa", fill: "#2e1065", stroke: "#6d28d9" },
  vlan:     { icon: "?",  label: "VLAN",        color: "#34d399", fill: "#022c22", stroke: "#065f46" },
  server:   { icon: "?",  label: "Server",      color: "#9ca3af", fill: "#111827", stroke: "#374151" },
  cloud:    { icon: "?",  label: "Cloud",       color: "#60a5fa", fill: "#0c1a2e", stroke: "#1e40af" },
  endpoint: { icon: "?", label: "Endpoint",    color: "#d1d5db", fill: "#1f2937", stroke: "#4b5563" },
  wifi:     { icon: "?",  label: "Wi-Fi AP",    color: "#c4b5fd", fill: "#1e1b4b", stroke: "#5b21b6" },
  isp:      { icon: "?",  label: "ISP",         color: "#fbbf24", fill: "#1c0a00", stroke: "#92400e" },
  noc:      { icon: "?",  label: "NOC",         color: "#6ee7b7", fill: "#022c22", stroke: "#059669" },
  siem:     { icon: "?", label: "SIEM",        color: "#fca5a5", fill: "#450a0a", stroke: "#b91c1c" },
  shield:   { icon: "?",  label: "Safeguard",   color: "#fb923c", fill: "#431407", stroke: "#c2410c" },
  lock:     { icon: "?", label: "Access Ctrl", color: "#a78bfa", fill: "#1e1b4b", stroke: "#7c3aed" },
  dmz:      { icon: "?",  label: "DMZ",         color: "#f472b6", fill: "#2d0a1f", stroke: "#9d174d" },
};

const ROLE_COLORS: Record<string, string> = {
  enforcement: "#ef4444",
  trusted:     "#10b981",
  untrusted:   "#f59e0b",
  dmz:         "#8b5cf6",
  management:  "#3b82f6",
  encrypted:   "#06b6d4",
};

// Map focusConcept keywords -> component palette presets
const SCENARIO_PALETTES: Array<{
  keywords: string[];
  components: string[];
  hint: string;
}> = [
  {
    keywords: ["vlan", "segmentation", "segment", "clinic", "network"],
    components: ["firewall", "switch", "vlan", "vlan", "vlan", "endpoint", "wifi"],
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
    keywords: ["noc", "siem", "log", "monitor", "alert", "incident"],
    components: ["noc", "siem", "firewall", "switch", "router", "server"],
    hint: "Connect log sources to the SIEM, then show the NOC analyst connection and alert path.",
  },
];

const ALL_COMPONENTS = Object.keys(DEFS);

function detectScenario(concept: string): { components: string[]; hint: string } {
  const lower = concept.toLowerCase();
  for (const s of SCENARIO_PALETTES) {
    if (s.keywords.some((k) => lower.includes(k))) {
      return { components: s.components, hint: s.hint };
    }
  }
  return {
    components: ["router", "firewall", "switch", "server", "cloud", "endpoint"],
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
}: DiagramBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [nextId, setNextId] = useState(1);
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<DiagramEdge | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
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
  }, [selectedEdge]);

  // Re-render whenever state changes
  useEffect(() => { render(); }, [nodes, edges, selectedNode, selectedEdge, hoverNodeId, render]);

  // ?? Canvas events ?????????????????????????????????????????????????????????????

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getXY = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
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

      const h = getHandleAt(x, y, nodesRef.current);
      if (h) { canvas.style.cursor = "crosshair"; render(); return; }

      const prev = hoverNodeIdRef.current;
      const hit = getNodeAt(x, y, nodesRef.current);
      const newId = hit ? hit.id : null;
      if (newId !== prev) {
        setHoverNodeId(newId);
      }
      canvas.style.cursor = hit ? "grab" : "default";
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
      dragNodeRef.current = null;
      canvas.style.cursor = hoverNodeIdRef.current ? "grab" : "default";
    };

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
    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [render, addNode]);

  // ?? Drop from palette ????????????????????????????????????????????????????????

  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = paletteDragTypeRef.current || e.dataTransfer.getData("text/plain");
    if (!type || !DEFS[type]) return;
    const r = canvasRef.current!.getBoundingClientRect();
    addNode(type, e.clientX - r.left, e.clientY - r.top);
    paletteDragTypeRef.current = null;
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

    const prompt = `You are evaluating a student's network diagram during a whiteboard defense for a cybersecurity/networking course.

Defense question concept: "${focusConcept}"
Full question: "${questionText}"
Scenario hint: ${scenario.hint}

Student's diagram:
Nodes (${nodes.length}): ${nodeList || "(none)"}
Links (${edges.length}): ${edgeList || "(none)"}

Evaluate on exactly three criteria specific to this question, and respond ONLY with valid JSON, no markdown fences:
{
  "overallScore": <integer 1-10>,
  "checks": [
    {"label": "short criterion", "pass": true|false, "note": "one specific sentence"},
    {"label": "short criterion", "pass": true|false, "note": "one specific sentence"},
    {"label": "short criterion", "pass": true|false, "note": "one specific sentence"}
  ],
  "missingConcepts": ["concept1", "concept2"],
  "integritySignal": "low|medium|high",
  "integrityNote": "one sentence on whether placement and labeling suggest genuine understanding vs guessing"
}`;

    try {
      const res = await fetch("/api/defense/evaluate-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvaluation(data);
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

  const paletteTypes = [...new Set([...scenario.components, ...ALL_COMPONENTS])];

  return (
    <div className="space-y-3">
      {/* Hint bar */}
      <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl px-4 py-2.5 flex items-start gap-2">
        <Network className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
        <p className="text-xs text-indigo-300/80 leading-relaxed">
          <span className="font-bold text-indigo-300">Diagram task: </span>{scenario.hint}
          <span className="text-indigo-400/60 ml-2">. Hover a node -> drag a handle to connect . Click a link to edit or delete it</span>
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
        className="bg-[#080810] border border-white/5 rounded-xl overflow-hidden"
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
                      {d === "one" ? "-> One-way" : "<-> Both ways"}
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
            <><RefreshCw className="w-3 h-3 animate-spin" /> Evaluating...</>
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
              evaluation.overallScore >= 8 ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
              : evaluation.overallScore >= 6 ? "bg-amber-950/40 text-amber-400 border border-amber-900/50"
              : "bg-red-950/40 text-red-400 border border-red-900/50"
            }`}>
              {evaluation.overallScore}/10
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
              evaluation.integritySignal === "low" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
              : evaluation.integritySignal === "medium" ? "bg-amber-950/40 text-amber-400 border border-amber-900/50"
              : "bg-red-950/40 text-red-400 border border-red-900/50"
            }`}>
              {evaluation.integritySignal === "low" ? "v Low concern"
               : evaluation.integritySignal === "medium" ? "? Review needed"
               : "? Flagged"}
            </span>
          </div>

          <div className="space-y-2">
            {evaluation.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs">
                <span className={`mt-0.5 shrink-0 ${c.pass ? "text-emerald-400" : "text-red-400"}`}>
                  {c.pass ? "v" : "?"}
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
              <span className="text-white/20 shrink-0">?</span>
              <span className="text-white/40 italic">{evaluation.integrityNote}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
