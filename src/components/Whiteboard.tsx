import React, { useRef, useState, useEffect } from "react";
import { DrawingStroke } from "../types";
import { 
  MousePointer, 
  Square, 
  Circle as CircleIcon, 
  Type, 
  Eraser, 
  Undo2, 
  Trash2, 
  ArrowUpRight, 
  PenTool, 
  LayoutGrid,
  ChevronUp,
  ChevronDown,
  Info
} from "lucide-react";

interface WhiteboardProps {
  sessionId: string;
  questionIndex: number;
  role: "student" | "instructor" | "both";
  strokes: DrawingStroke[];
  onStrokesChange: (updated: DrawingStroke[]) => void;
  onCaptureSnapshot: (base64Image: string) => void;
  wsRef: React.MutableRefObject<WebSocket | null>;
}

// File level canvas helper functions
const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];
  
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line);
      line = words[n] + " ";
    } else {
      line = testLine;
    }
  }
  lines.push(line);
  
  const totalHeight = lines.length * lineHeight;
  let currentY = y - totalHeight / 2 + lineHeight / 2;
  
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i].trim(), x, currentY);
    currentY += lineHeight;
  }
};

export default function Whiteboard({
  sessionId,
  questionIndex,
  role,
  strokes,
  onStrokesChange,
  onCaptureSnapshot,
  wsRef,
}: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<"select" | "block" | "arrow" | "pencil" | "rectangle" | "circle" | "text" | "eraser">("select");
  const [color, setColor] = useState<string>("#4ADE80"); // Nice bright default: Mint Green
  const [lineWidth, setLineWidth] = useState<number>(3);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  
  // Interaction and selection states
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<"none" | "moving" | "resizing" | "moving_arrow_handle">("none");
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [dragStartMouse, setDragStartMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStartArrow, setDragStartArrow] = useState<{ x: number; y: number; x2: number; y2: number }>({ x: 0, y: 0, x2: 0, y2: 0 });
  const [arrowHandleType, setArrowHandleType] = useState<"start" | "end" | null>(null);
  
  // Active temporary drawing states
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [startPos, setStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [textInput, setTextInput] = useState<{ x: number; y: number; text: string } | null>(null);
  const textInputValRef = useRef<string>("");

  // Broadcast channel for same-machine tab sync
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Initialize BroadcastChannel
  useEffect(() => {
    const channelName = `whiteboard_sync_${sessionId}_q${questionIndex}`;
    channelRef.current = new BroadcastChannel(channelName);

    channelRef.current.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === "stroke_update") {
        onStrokesChange(data);
      }
    };

    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, [sessionId, questionIndex, onStrokesChange]);

  // Handle keyboard hotkeys for deletion and deselection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events in input forms, textareas, etc.
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === "INPUT" || 
        activeEl.tagName === "TEXTAREA" || 
        activeEl.getAttribute("contenteditable") === "true"
      )) {
        return;
      }

      if (selectedId) {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          const updated = strokes.filter((s) => s.id !== selectedId);
          setSelectedId(null);
          propagateWhiteboardUpdate(updated);
        } else if (e.key === "Escape") {
          setSelectedId(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedId, strokes]);

  // Handle Resize of canvas to match standard canvas aspect ratio
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * 1.5; // High resolution rendering
      canvas.height = 500 * 1.5;
      redrawCanvas();
    };

    handleResize();
    const observer = new ResizeObserver(() => handleResize());
    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [strokes, showGrid, selectedId]);

  // Redraw whenever strokes list, points, or modes update
  useEffect(() => {
    redrawCanvas();
  }, [strokes, isDrawing, currentPoints, startPos, showGrid, tool, selectedId, interactionMode]);

  // Recapture the whiteboard snapshot when navigating back/forth or when strokes finish changing
  useEffect(() => {
    if (!isDrawing) {
      triggerSnapshotCapture();
    }
  }, [questionIndex, strokes, isDrawing]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context for high-res scaling
    ctx.save();
    ctx.scale(1.5, 1.5);

    const w = canvas.width / 1.5;
    const h = canvas.height / 1.5;

    // Optional Academic grid pattern for Dark chalkboard
    if (showGrid) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)"; // faint grid
      ctx.lineWidth = 0.5;
      const gridSize = 35;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    // Render historical strokes
    strokes.forEach((stroke) => {
      drawStrokeOnContext(ctx, stroke);
    });

    // Render selected border overlay and handles if an item is selected
    if (selectedId) {
      const s = strokes.find((el) => el.id === selectedId);
      if (s) {
        ctx.save();
        ctx.strokeStyle = "#818CF8"; // Soft neon indigo
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        
        if (s.type === "block" || s.type === "rectangle") {
          const sx = s.x || 0;
          const sy = s.y || 0;
          const sw = s.w || 120;
          const sh = s.h || 60;
          ctx.strokeRect(sx, sy, sw, sh);
          
          // Draw solid resize handle square bottom right
          ctx.restore();
          ctx.save();
          ctx.fillStyle = "#818CF8";
          ctx.fillRect(sx + sw - 6, sy + sh - 6, 12, 12);
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx + sw - 6, sy + sh - 6, 12, 12);
        } else if (s.type === "circle") {
          const sx = s.x || 0;
          const sy = s.y || 0;
          const radius = s.w || 40;
          ctx.beginPath();
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw resize handle
          ctx.restore();
          ctx.save();
          ctx.fillStyle = "#818CF8";
          ctx.fillRect(sx + radius - 6, sy - 6, 12, 12);
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx + radius - 6, sy - 6, 12, 12);
        } else if (s.type === "text") {
          const sx = s.x || 0;
          const sy = s.y || 0;
          const textLen = s.text ? s.text.length : 0;
          const width = textLen * 7 + 16;
          const height = 24;
          ctx.strokeRect(sx - 8, sy - height + 4, width, height);
        } else if (s.type === "arrow") {
          const sx = s.x || 0;
          const sy = s.y || 0;
          const tx = s.x2 || 0;
          const ty = s.y2 || 0;
          
          ctx.restore();
          ctx.save();
          
          ctx.strokeStyle = "#818CF8";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          
          // Start circle (Green anchor)
          ctx.fillStyle = "#34D399";
          ctx.beginPath();
          ctx.arc(sx, sy, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FFFFFF";
          ctx.stroke();
          
          // End circle (Red target)
          ctx.fillStyle = "#F87171";
          ctx.beginPath();
          ctx.arc(tx, ty, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FFFFFF";
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Render active temporary stroke while dragging/drawing
    if (isDrawing) {
      ctx.save();
      if ((tool === "pencil" || tool === "eraser") && currentPoints.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = tool === "eraser" ? "#141414" : color;
        ctx.lineWidth = tool === "eraser" ? 24 : lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
          ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        ctx.stroke();
      } else if (tool === "rectangle") {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        const tempWidth = currentPoints[currentPoints.length - 1]?.x - startPos.x || 0;
        const tempHeight = currentPoints[currentPoints.length - 1]?.y - startPos.y || 0;
        ctx.strokeRect(startPos.x, startPos.y, tempWidth, tempHeight);
      } else if (tool === "circle") {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        const endPos = currentPoints[currentPoints.length - 1] || startPos;
        const radius = Math.sqrt(
          Math.pow(endPos.x - startPos.x, 2) + Math.pow(endPos.y - startPos.y, 2)
        );
        ctx.beginPath();
        ctx.arc(startPos.x, startPos.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (tool === "arrow" && currentPoints.length > 0) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = lineWidth || 2.5;
        const endPos = currentPoints[currentPoints.length - 1] || startPos;
        
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(endPos.x, endPos.y);
        ctx.stroke();
        
        const angle = Math.atan2(endPos.y - startPos.y, endPos.x - startPos.x);
        const arrowLength = 12;
        ctx.beginPath();
        ctx.moveTo(endPos.x, endPos.y);
        ctx.lineTo(
          endPos.x - arrowLength * Math.cos(angle - Math.PI / 6),
          endPos.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          endPos.x - arrowLength * Math.cos(angle + Math.PI / 6),
          endPos.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  };

  const drawStrokeOnContext = (ctx: CanvasRenderingContext2D, stroke: DrawingStroke) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if ((stroke.type === "pencil" || stroke.type === "eraser") && stroke.points && stroke.points.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = stroke.type === "eraser" ? "#141414" : stroke.color;
      ctx.lineWidth = stroke.type === "eraser" ? 24 : stroke.width;
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    } else if (stroke.type === "rectangle" && stroke.x !== undefined && stroke.y !== undefined && stroke.w !== undefined && stroke.h !== undefined) {
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.strokeRect(stroke.x, stroke.y, stroke.w, stroke.h);
    } else if (stroke.type === "circle" && stroke.x !== undefined && stroke.y !== undefined && stroke.w !== undefined) {
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.arc(stroke.x, stroke.y, stroke.w, 0, Math.PI * 2);
      ctx.stroke();
    } else if (stroke.type === "text" && stroke.x !== undefined && stroke.y !== undefined && stroke.text) {
      ctx.font = `bold ${stroke.width * 2 + 13}px sans-serif`;
      ctx.fillStyle = stroke.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(stroke.text, stroke.x, stroke.y);
    } else if (stroke.type === "block" && stroke.x !== undefined && stroke.y !== undefined && stroke.w !== undefined && stroke.h !== undefined) {
      ctx.save();
      
      // Card subtle outer glow
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
      
      ctx.fillStyle = "rgba(18, 18, 22, 0.95)";
      drawRoundedRect(ctx, stroke.x, stroke.y, stroke.w, stroke.h, 8);
      ctx.fill();
      
      // Border outline
      ctx.shadowBlur = 0;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width || 2;
      ctx.stroke();
      
      // Inline centered text wrapping inside block
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      const tcX = stroke.x + stroke.w / 2;
      const tcY = stroke.y + stroke.h / 2;
      wrapText(ctx, stroke.text || "Box Block", tcX, tcY, stroke.w - 16, 16);
      
      ctx.restore();
    } else if (stroke.type === "arrow" && stroke.x !== undefined && stroke.y !== undefined && stroke.x2 !== undefined && stroke.y2 !== undefined) {
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width || 2.5;
      
      // Main arrow body line
      ctx.beginPath();
      ctx.moveTo(stroke.x, stroke.y);
      ctx.lineTo(stroke.x2, stroke.y2);
      ctx.stroke();
      
      // Direction arrowhead arithmetic
      const angle = Math.atan2(stroke.y2 - stroke.y, stroke.x2 - stroke.x);
      const arrowLength = 12;
      
      ctx.beginPath();
      ctx.moveTo(stroke.x2, stroke.y2);
      ctx.lineTo(
        stroke.x2 - arrowLength * Math.cos(angle - Math.PI / 12),
        stroke.y2 - arrowLength * Math.sin(angle - Math.PI / 12)
      );
      ctx.lineTo(
        stroke.x2 - arrowLength * Math.cos(angle + Math.PI / 12),
        stroke.y2 - arrowLength * Math.sin(angle + Math.PI / 12)
      );
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    }
  };

  // Helper coordinate mapper
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    
    let clientX = 0;
    let clientY = 0;
    
    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width / 1.5;
    const scaleY = canvas.height / rect.height / 1.5;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Collision checks
  const isNearResizeHandle = (s: DrawingStroke, mx: number, my: number) => {
    if (s.type !== "block" && s.type !== "rectangle" && s.type !== "circle") return false;
    
    if (s.type === "circle") {
      const sx = s.x || 0;
      const sy = s.y || 0;
      const radius = s.w || 40;
      const hx = sx + radius;
      const hy = sy;
      const dist = Math.sqrt((mx - hx) ** 2 + (my - hy) ** 2);
      return dist <= 18;
    } else {
      const sx = s.x || 0;
      const sy = s.y || 0;
      const sw = s.w || 120;
      const sh = s.h || 60;
      const hx = sx + sw;
      const hy = sy + sh;
      const dist = Math.sqrt((mx - hx) ** 2 + (my - hy) ** 2);
      return dist <= 18;
    }
  };

  const findElementAt = (mx: number, my: number): DrawingStroke | null => {
    // Traverse backwards (front to-back order)
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (s.type === "block" || s.type === "rectangle") {
        const sx = s.x || 0;
        const sy = s.y || 0;
        const sw = s.w || 120;
        const sh = s.h || 60;
        const left = sw < 0 ? sx + sw : sx;
        const right = sw < 0 ? sx : sx + sw;
        const top = sh < 0 ? sy + sh : sy;
        const bottom = sh < 0 ? sy : sy + sh;
        
        if (mx >= left && mx <= right && my >= top && my <= bottom) {
          return s;
        }
      } else if (s.type === "circle") {
        const sx = s.x || 0;
        const sy = s.y || 0;
        const radius = s.w || 40;
        const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
        if (dist <= radius) {
          return s;
        }
      } else if (s.type === "text") {
        const sx = s.x || 0;
        const sy = s.y || 0;
        const textLen = s.text ? s.text.length : 0;
        const width = textLen * 8 + 20;
        const height = 24;
        if (mx >= sx - 8 && mx <= sx + width && my >= sy - height && my <= sy + 8) {
          return s;
        }
      } else if (s.type === "arrow") {
        const sx = s.x || 0;
        const sy = s.y || 0;
        const tx = s.x2 || 0;
        const ty = s.y2 || 0;
        
        const l2 = (tx - sx) ** 2 + (ty - sy) ** 2;
        if (l2 < 20) continue; // Skip too small arrows
        
        let t = ((mx - sx) * (tx - sx) + (my - sy) * (ty - sy)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = sx + t * (tx - sx);
        const projY = sy + t * (ty - sy);
        
        const dist = Math.sqrt((mx - projX) ** 2 + (my - projY) ** 2);
        if (dist < 15) {
          return s;
        }
      }
    }
    return null;
  };

  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (role === "instructor") return;
    
    const coords = getCoordinates(e);
    if (!coords) return;

    if (tool === "text") {
      setTextInput({ x: coords.x, y: coords.y, text: "" });
      textInputValRef.current = "";
      return;
    }

    if (tool === "select") {
      // 1. Is clicking handle on current selection?
      if (selectedId) {
        const s = strokes.find((el) => el.id === selectedId);
        if (s) {
          if (isNearResizeHandle(s, coords.x, coords.y)) {
            setInteractionMode("resizing");
            setDragStartMouse(coords);
            return;
          }
          
          if (s.type === "arrow") {
            const startDist = Math.sqrt((coords.x - (s.x || 0)) ** 2 + (coords.y - (s.y || 0)) ** 2);
            const endDist = Math.sqrt((coords.x - (s.x2 || 0)) ** 2 + (coords.y - (s.y2 || 0)) ** 2);
            if (startDist <= 16) {
              setInteractionMode("moving_arrow_handle");
              setArrowHandleType("start");
              return;
            } else if (endDist <= 16) {
              setInteractionMode("moving_arrow_handle");
              setArrowHandleType("end");
              return;
            }
          }
        }
      }

      // 2. Clicked element checking
      const hit = findElementAt(coords.x, coords.y);
      if (hit) {
        setSelectedId(hit.id);
        setInteractionMode("moving");
        setDragStartMouse(coords);
        if (hit.type === "arrow") {
          setDragStartArrow({
            x: hit.x || 0,
            y: hit.y || 0,
            x2: hit.x2 || 0,
            y2: hit.y2 || 0
          });
        } else {
          setDragOffset({
            dx: coords.x - (hit.x || 0),
            dy: coords.y - (hit.y || 0)
          });
        }
        return;
      } else {
        setSelectedId(null);
        setInteractionMode("none");
      }
      return;
    }

    if (tool === "block") {
      // Create a gorgeous block nodes
      const bW = 150;
      const bH = 65;
      const newB: DrawingStroke = {
        id: `stroke_${Date.now()}_block_${Math.random().toString(36).substring(2, 6)}`,
        type: "block",
        color: color,
        width: 2,
        x: coords.x - bW / 2,
        y: coords.y - bH / 2,
        w: bW,
        h: bH,
        text: "Process Block"
      };
      
      const updated = [...strokes, newB];
      setSelectedId(newB.id);
      setTool("select"); // Auto focus to move/editor select tool
      propagateWhiteboardUpdate(updated);
      return;
    }

    if (tool === "eraser") {
      const hit = findElementAt(coords.x, coords.y);
      if (hit) {
        const updated = strokes.filter((s) => s.id !== hit.id);
        setSelectedId(null);
        propagateWhiteboardUpdate(updated);
        return;
      }
    }

    // Classic continuous drawing modes
    setIsDrawing(true);
    setStartPos(coords);
    setCurrentPoints([coords]);
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCoordinates(e);
    if (!coords) return;

    if (tool === "select") {
      if (interactionMode === "moving" && selectedId) {
        const updated = strokes.map((s) => {
          if (s.id === selectedId) {
            if (s.type === "arrow") {
              const dx = coords.x - dragStartMouse.x;
              const dy = coords.y - dragStartMouse.y;
              return {
                ...s,
                x: dragStartArrow.x + dx,
                y: dragStartArrow.y + dy,
                x2: dragStartArrow.x2 + dx,
                y2: dragStartArrow.y2 + dy
              };
            } else {
              return {
                ...s,
                x: coords.x - dragOffset.dx,
                y: coords.y - dragOffset.dy
              };
            }
          }
          return s;
        });
        onStrokesChange(updated);
      } else if (interactionMode === "resizing" && selectedId) {
        const updated = strokes.map((s) => {
          if (s.id === selectedId) {
            if (s.type === "circle") {
              const dx = coords.x - (s.x || 0);
              const dy = coords.y - (s.y || 0);
              const radius = Math.sqrt(dx * dx + dy * dy);
              return { ...s, w: Math.max(10, radius) };
            } else {
              const startX = s.x || 0;
              const startY = s.y || 0;
              return {
                ...s,
                w: Math.max(25, coords.x - startX),
                h: Math.max(20, coords.y - startY)
              };
            }
          }
          return s;
        });
        onStrokesChange(updated);
      } else if (interactionMode === "moving_arrow_handle" && selectedId) {
        const updated = strokes.map((s) => {
          if (s.id === selectedId && s.type === "arrow") {
            if (arrowHandleType === "start") {
              return { ...s, x: coords.x, y: coords.y };
            } else {
              return { ...s, x2: coords.x, y2: coords.y };
            }
          }
          return s;
        });
        onStrokesChange(updated);
      }
      return;
    }

    if (!isDrawing) return;

    if (tool === "eraser") {
      const hit = findElementAt(coords.x, coords.y);
      if (hit) {
        const updated = strokes.filter((s) => s.id !== hit.id);
        setSelectedId(null);
        propagateWhiteboardUpdate(updated);
      }
    }

    setCurrentPoints((prev) => [...prev, coords]);
  };

  const handleEnd = () => {
    if (tool === "select") {
      if (interactionMode !== "none") {
        setInteractionMode("none");
        setArrowHandleType(null);
        propagateWhiteboardUpdate(strokes);
      }
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    let newStroke: DrawingStroke | null = null;
    const endPos = currentPoints[currentPoints.length - 1] || startPos;

    if (tool === "pencil" || tool === "eraser") {
      if (currentPoints.length > 1) {
        newStroke = {
          id: `stroke_${Date.now()}_p`,
          type: tool,
          color: color,
          width: lineWidth,
          points: currentPoints,
        };
      }
    } else if (tool === "rectangle") {
      const w = endPos.x - startPos.x;
      const h = endPos.y - startPos.y;
      if (Math.abs(w) > 5 || Math.abs(h) > 5) {
        newStroke = {
          id: `stroke_${Date.now()}_r`,
          type: "rectangle",
          color: color,
          width: lineWidth,
          x: startPos.x,
          y: startPos.y,
          w,
          h,
        };
      }
    } else if (tool === "circle") {
      const radius = Math.sqrt(
        Math.pow(endPos.x - startPos.x, 2) + Math.pow(endPos.y - startPos.y, 2)
      );
      if (radius > 5) {
        newStroke = {
          id: `stroke_${Date.now()}_c`,
          type: "circle",
          color: color,
          width: lineWidth,
          x: startPos.x,
          y: startPos.y,
          w: radius,
        };
      }
    } else if (tool === "arrow") {
      const dx = endPos.x - startPos.x;
      const dy = endPos.y - startPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 12) {
        newStroke = {
          id: `stroke_${Date.now()}_a_${Math.random().toString(36).substring(2, 6)}`,
          type: "arrow",
          color: color,
          width: lineWidth || 2.5,
          x: startPos.x,
          y: startPos.y,
          x2: endPos.x,
          y2: endPos.y
        };
      }
    }

    if (newStroke) {
      const updatedStrokes = [...strokes, newStroke];
      propagateWhiteboardUpdate(updatedStrokes);
    }

    setCurrentPoints([]);
  };

  const handleTextInputSubmit = () => {
    if (!textInput || !textInputValRef.current.trim()) {
      setTextInput(null);
      return;
    }

    const newStroke: DrawingStroke = {
      id: `stroke_${Date.now()}_txt`,
      type: "text",
      color: color,
      width: lineWidth,
      x: textInput.x,
      y: textInput.y,
      text: textInputValRef.current,
    };

    const updatedStrokes = [...strokes, newStroke];
    propagateWhiteboardUpdate(updatedStrokes);
    setTextInput(null);
  };

  const propagateWhiteboardUpdate = (updatedStrokes: DrawingStroke[]) => {
    onStrokesChange(updatedStrokes);

    if (channelRef.current) {
      channelRef.current.postMessage({
        type: "stroke_update",
        data: updatedStrokes,
      });
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "sync_whiteboard",
          sessionId,
          role,
          data: {
            questionIndex,
            strokes: updatedStrokes,
          },
        })
      );
    }

    triggerSnapshotCapture();
  };

  const triggerSnapshotCapture = () => {
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL("image/png");
      onCaptureSnapshot(dataUrl);
    }, 120);
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const updatedStrokes = strokes.slice(0, -1);
    setSelectedId(null);
    propagateWhiteboardUpdate(updatedStrokes);
  };

  const handleClear = () => {
    if (window.confirm("Are you sure you want to clear this whiteboard diagram?")) {
      setSelectedId(null);
      propagateWhiteboardUpdate([]);
    }
  };

  const handleBringToFront = () => {
    if (!selectedId) return;
    const idx = strokes.findIndex((s) => s.id === selectedId);
    if (idx > -1) {
      const target = strokes[idx];
      const updated = [...strokes.slice(0, idx), ...strokes.slice(idx + 1), target];
      propagateWhiteboardUpdate(updated);
    }
  };

  const handleSendToBack = () => {
    if (!selectedId) return;
    const idx = strokes.findIndex((s) => s.id === selectedId);
    if (idx > -1) {
      const target = strokes[idx];
      const updated = [target, ...strokes.slice(0, idx), ...strokes.slice(idx + 1)];
      propagateWhiteboardUpdate(updated);
    }
  };

  const handleSelectedDelete = () => {
    if (!selectedId) return;
    const updated = strokes.filter((s) => s.id !== selectedId);
    setSelectedId(null);
    propagateWhiteboardUpdate(updated);
  };

  const selectedElement = selectedId ? strokes.find((s) => s.id === selectedId) : null;

  return (
    <div className="flex flex-col h-full bg-[#0d0d11] rounded-xl shadow-lg border border-white/5 overflow-hidden">
      
      {/* Upper toolbar controls */}
      <div className="flex flex-col border-b border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 p-3">
          {role !== "instructor" ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-white/5 p-1 rounded-lg border border-white/10 gap-0.5">
                <button
                  type="button"
                  onClick={() => { setTool("select"); setSelectedId(null); }}
                  className={`p-1.5 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    tool === "select" ? "bg-indigo-600/25 text-indigo-400 border border-indigo-500/20" : "text-white/40 hover:text-white"
                  }`}
                  title="Move and select element"
                >
                  <MousePointer className="w-3.5 h-3.5" /> Pointer
                </button>
                <button
                  type="button"
                  onClick={() => setTool("block")}
                  className={`p-1.5 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    tool === "block" ? "bg-indigo-600/25 text-indigo-400 border border-indigo-500/20" : "text-white/40 hover:text-white"
                  }`}
                  title="Place card block"
                >
                  <Square className="w-3.5 h-3.5" /> Card
                </button>
                <button
                  type="button"
                  onClick={() => setTool("arrow")}
                  className={`p-1.5 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    tool === "arrow" ? "bg-indigo-600/25 text-indigo-400 border border-indigo-500/20" : "text-white/40 hover:text-white"
                  }`}
                  title="Drag arrow mapping"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" /> Arrow
                </button>
                <button
                  type="button"
                  onClick={() => setTool("text")}
                  className={`p-1.5 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    tool === "text" ? "bg-indigo-600/25 text-indigo-400 border border-indigo-500/20" : "text-white/40 hover:text-white"
                  }`}
                  title="Add text annotation"
                >
                  <Type className="w-3.5 h-3.5" /> Text
                </button>
                <button
                  type="button"
                  onClick={() => setTool("pencil")}
                  className={`p-1.5 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    tool === "pencil" ? "bg-indigo-600/25 text-indigo-400 border border-indigo-500/20" : "text-white/40 hover:text-white"
                  }`}
                  title="Draw freehand"
                >
                  <PenTool className="w-3.5 h-3.5" /> Pen
                </button>
                <button
                  type="button"
                  onClick={() => setTool("eraser")}
                  className={`p-1.5 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    tool === "eraser" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "text-white/40 hover:text-white"
                  }`}
                  title="Eraser tool"
                >
                  <Eraser className="w-3.5 h-3.5" /> Eraser
                </button>
              </div>

              {/* Color swatch selection */}
              <div className="flex items-center gap-1.5 pr-1.5">
                {[
                  { hex: "#4ADE80", name: "Mint" },
                  { hex: "#60A5FA", name: "Sky" },
                  { hex: "#C084FC", name: "Lavender" },
                  { hex: "#F87171", name: "Rose" },
                  { hex: "#F8FAFC", name: "Chalk" },
                ].map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setColor(c.hex)}
                    className={`w-5 h-5 rounded-full border transition hover:scale-110 cursor-pointer ${
                      color === c.hex ? "ring-2 ring-indigo-500 scale-105 border-white" : "border-white/10"
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs font-mono text-white/40 bg-white/5 py-1 px-3 rounded-full flex items-center gap-1.5 border border-white/5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse mr-0.5"></span>
              Instructor Mirroring View — Read-only Reviewing
            </div>
          )}

          {/* Setup Actions */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 px-2.5 rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                showGrid ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-black text-white/40 border-white/10 hover:bg-white/5"
              }`}
              title="Show grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Grid
            </button>
            {role !== "instructor" && (
              <>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={strokes.length === 0}
                  className="p-1.5 px-2 bg-black border border-white/10 text-white/60 hover:text-white rounded hover:bg-white/5 text-xs transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5"
                  title="Undo previous strokes"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={strokes.length === 0}
                  className="p-1.5 px-2.5 bg-red-950/20 border border-red-900/30 text-red-400 rounded text-xs transition cursor-pointer hover:bg-red-950/45 disabled:pointer-events-none disabled:opacity-30"
                  title="Wipe canvas clear"
                >
                  Clear All
                </button>
              </>
            )}
          </div>
        </div>

        {/* Dynamic Context Selector Panel (Satisfies editing, updating, and deleting objects easily) */}
        {selectedElement && role !== "instructor" && (
          <div className="bg-[#151520] border-t border-indigo-500/20 p-2.5 px-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <span className="font-mono text-[10px] text-indigo-300 font-bold uppercase shrink-0">
                Selected: {selectedElement.type}
              </span>
              
              {(selectedElement.type === "block" || selectedElement.type === "text") && (
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <span className="text-[10px] text-white/40 font-mono">Label:</span>
                  <input
                    type="text"
                    value={selectedElement.text || ""}
                    onChange={(e) => {
                      const updated = strokes.map((st) => {
                        if (st.id === selectedElement.id) {
                          return { ...st, text: e.target.value };
                        }
                        return st;
                      });
                      propagateWhiteboardUpdate(updated);
                    }}
                    className="flex-1 bg-black border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-indigo-500 outline-none font-sans"
                    placeholder="Enter block description text..."
                  />
                </div>
              )}

              <div className="flex items-center gap-1.5 pl-2 border-l border-white/5">
                <span className="text-[10px] text-white/40 font-mono">Color:</span>
                <div className="flex items-center gap-1">
                  {["#4ADE80", "#60A5FA", "#C084FC", "#F87171", "#F8FAFC"].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => {
                        const updated = strokes.map((st) => {
                          if (st.id === selectedElement.id) {
                            return { ...st, color: hex };
                          }
                          return st;
                        });
                        propagateWhiteboardUpdate(updated);
                      }}
                      className={`w-3.5 h-3.5 rounded-full border border-white/10 cursor-pointer transition transform hover:scale-110 ${
                        selectedElement.color === hex ? "ring-1 ring-white scale-115" : ""
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30 font-mono mr-1">Layer:</span>
              <button
                type="button"
                onClick={handleBringToFront}
                className="p-1 px-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 rounded flex items-center gap-0.5 text-[11px] cursor-pointer"
                title="Bring to top layer"
              >
                <ChevronUp className="w-3 h-3" /> Front
              </button>
              <button
                type="button"
                onClick={handleSendToBack}
                className="p-1 px-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 rounded flex items-center gap-0.5 text-[11px] cursor-pointer"
                title="Send to back layer"
              >
                <ChevronDown className="w-3 h-3" /> Back
              </button>
              
              <button
                type="button"
                onClick={handleSelectedDelete}
                className="ml-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 hover:border-red-500/40 px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1 text-[11px]"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Drawing Area Container */}
      <div 
        ref={containerRef} 
        className="relative flex-1 bg-[#121215] overflow-hidden cursor-crosshair min-h-[420px]"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          className="absolute top-0 left-0 w-full h-full block"
          style={{ touchAction: "none" }}
        />

        {/* Overlay helper instructions when diagram is empty */}
        {strokes.length === 0 && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-center p-6 space-y-2 select-none">
            <Info className="w-8 h-8 text-white/10 animate-pulse" />
            <p className="text-xs font-bold text-white/30 font-sans tracking-wide uppercase">Interactive Diagram Whiteboard</p>
            <p className="text-[11px] text-white/20 font-mono max-w-sm leading-relaxed">
              Click <span className="text-white/40">"Card"</span> to place process nodes, or drag from point to point with <span className="text-white/40">"Arrow"</span> to connect. Click <span className="text-white/40">"Pointer"</span> to select, move, scale, or edit block labels instantly.
            </p>
          </div>
        )}

        {/* Text prompt dialogue box */}
        {textInput && (
          <div
            className="absolute bg-[#16161b] p-3 rounded-lg border border-white/10 shadow-2xl flex flex-col gap-1.5 z-25 scale-105"
            style={{
              left: `${textInput.x / 1.5}px`,
              top: `${textInput.y / 1.5}px`,
            }}
          >
            <label className="text-[9px] uppercase tracking-wider font-bold text-white/40 font-mono">Create Annotation Text</label>
            <input
              type="text"
              id="whiteboard-text-input-field"
              autoFocus
              className="border border-white/15 bg-black rounded px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500 font-sans text-white focus:ring-1 focus:ring-indigo-500/20 w-44"
              placeholder="e.g. Concept formula..."
              onChange={(e) => {
                textInputValRef.current = e.target.value;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTextInputSubmit();
                } else if (e.key === "Escape") {
                  setTextInput(null);
                }
              }}
            />
            <div className="flex items-center justify-end gap-1 px-1 mt-1 text-[8px] font-mono text-white/35">
              <span className="bg-black px-1 border border-white/10 rounded">Esc</span> cancel
              <span className="bg-black px-1 border border-white/10 rounded ml-1">Enter</span> apply
            </div>
          </div>
        )}
      </div>

      {/* Synchronized status bar */}
      <div className="flex items-center justify-between text-[10px] font-mono text-white/30 bg-black/40 border-t border-white/10 px-3 py-1.5">
        <span>Session code: {sessionId}</span>
        <span>Topic Question #{questionIndex + 1}</span>
        <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-900/10 px-2 rounded-full text-[9px] font-semibold flex items-center gap-1 animate-pulse">
          <span className="w-1 h-1 bg-emerald-400 rounded-full"></span> Live Board Synchronization
        </span>
      </div>
    </div>
  );
}
