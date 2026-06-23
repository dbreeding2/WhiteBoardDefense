import React, { useState, useEffect, useRef } from "react";
import { 
  Type, 
  Plus, 
  Trash2, 
  TableProperties, 
  Heading1, 
  Heading2, 
  List, 
  BookOpen, 
  Sparkles,
  RefreshCw,
  FileCheck
} from "lucide-react";

interface WordProcessorProps {
  sessionId: string;
  questionIndex: number;
  role: "student" | "instructor" | "both";
  value: string; // Serialized JSON string document state
  onChange: (newValue: string) => void;
  onCaptureSnapshot: (base64Image: string) => void;
  wsRef: React.MutableRefObject<WebSocket | null>;
}

interface TableState {
  headers: string[];
  rows: string[][];
}

interface DocState {
  text: string;
  table?: TableState;
  hasTable?: boolean;
}

export default function WordProcessor({
  sessionId,
  questionIndex,
  role,
  value,
  onChange,
  onCaptureSnapshot,
  wsRef,
}: WordProcessorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Parse or seed default document state
  const getInitialState = (): DocState => {
    try {
      if (value) {
        const parsed = JSON.parse(value);
        if (parsed.text !== undefined) {
          return {
            text: parsed.text,
            table: parsed.table || { headers: [], rows: [] },
            hasTable: parsed.hasTable !== undefined ? parsed.hasTable : (parsed.table && parsed.table.headers && parsed.table.headers.length > 0)
          };
        }
      }
    } catch (e) {
      // Fall through to default
    }
    return {
      text: "Provide your analytical answer, proof outlines, or conceptual claims response here. Use the action bar or edit the template matrix directly below to structure comparative parameters, values, and proofs.",
      hasTable: true,
      table: {
        headers: ["Variable / Parameter", "Theoretical Value", "Logical Justification"],
        rows: [
          ["e.g. Convergence Rate", "O(1/k) animate", "Direct first-order subgradient bounds"],
          ["e.g. Beta Boundary", "± 1.96 σ", "Normal distribution bounds wrapper for error rates"]
        ]
      }
    };
  };

  const [docState, setDocState] = useState<DocState>(getInitialState);

  // Synchronize state when value changes externally (e.g., from Peer Websocket)
  useEffect(() => {
    try {
      if (value) {
        const parsed = JSON.parse(value);
        // Deep compare to prevent infinite state update loops
        if (JSON.stringify(parsed) !== JSON.stringify(docState)) {
          setDocState(parsed);
        }
      }
    } catch (e) {
      // Ignore parse issues from intermediate network broadcasts
    }
  }, [value]);

  // Reset or restore when question changes
  useEffect(() => {
    if (value) {
      // Restore saved state for this question
      try {
        const parsed = JSON.parse(value);
        if (parsed.text !== undefined) {
          setDocState(parsed);
          return;
        }
      } catch (e) {
        // fall through to default
      }
    }
    // No saved state — reset to blank default
    setDocState({
      text: "",
      hasTable: false,
      table: { headers: [], rows: [] },
    });
  }, [questionIndex]);

  // Broadcast channel for same-machine tab sync
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const channelName = `doc_processor_sync_${sessionId}_q${questionIndex}`;
    channelRef.current = new BroadcastChannel(channelName);

    channelRef.current.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === "doc_update") {
        setDocState(data);
        onChange(JSON.stringify(data));
      }
    };

    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, [sessionId, questionIndex, onChange]);

  // Trigger dynamic Canvas Export whenever document content updates
  useEffect(() => {
    renderDocToCanvas();
  }, [docState]);

  const propagateUpdate = (newState: DocState) => {
    setDocState(newState);
    const stringified = JSON.stringify(newState);
    onChange(stringified);

    // Broadcast in same-machine tab
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: "doc_update",
        data: newState,
      });
    }

    // Broadcast across Network to Peer Websocket (Instructor / Observer)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "sync_document",
          sessionId,
          role,
          data: {
            questionIndex,
            docState: newState,
          },
        })
      );
    }
  };

  // Canvas drawing exporter
  const renderDocToCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fixed High resolution canvas size
    canvas.width = 900;
    canvas.height = 700;

    // Background: Clean Slate Chalkboard Theme
    ctx.fillStyle = "#121215";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Upper brand header
    ctx.fillStyle = "rgba(129, 140, 248, 0.08)";
    ctx.fillRect(0, 0, canvas.width, 60);

    ctx.fillStyle = "#818CF8";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("WHITEBOARD TECHNICAL DOCUMENT PROCESSOR", 30, 36);

    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.font = "11px monospace";
    ctx.fillText(`SESSION ID: ${sessionId} • QUESTION #${questionIndex + 1}`, canvas.width - 240, 36);

    // Content Margins
    const startX = 40;
    let currentY = 105;
    const maxWidth = canvas.width - 80;

    // Question Label
    ctx.fillStyle = "#34D399"; // Mint green tag
    ctx.fillRect(startX, currentY - 18, 120, 22);
    ctx.fillStyle = "#121215";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("SUBMITTED ANSWER", startX + 11, currentY - 3);

    currentY += 28;

    // Draw Main Text Paragraph with precise word wrapping
    ctx.fillStyle = "#E2E8F0";
    ctx.font = "14px serif";
    const lineHeight = 24;

    const words = docState.text.split(" ");
    let currentLine = "";

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine ? currentLine + " " + words[i] : words[i];
      const measure = ctx.measureText(testLine);
      if (measure.width > maxWidth) {
        ctx.fillText(currentLine, startX, currentY);
        currentLine = words[i];
        currentY += lineHeight;
        
        // Safety bounds
        if (currentY > 340) break;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine && currentY <= 340) {
      ctx.fillText(currentLine, startX, currentY);
      currentY += lineHeight;
    }

    currentY = Math.max(currentY + 25, 260);

    // Render Academic Grid table
    const table = docState.table;
    if (docState.hasTable !== false && table && table.headers.length > 0) {
      // Header tag
      ctx.fillStyle = "rgba(129, 140, 248, 0.15)";
      ctx.fillRect(startX, currentY - 18, 110, 20);
      ctx.fillStyle = "#818CF8";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("COMPARISON MATRIX", startX + 10, currentY - 5);

      currentY += 15;

      const cellPadding = 12;
      const numCols = table.headers.length;
      const colWidth = Math.floor(maxWidth / numCols);
      const rowHeight = 35;

      // Table Header background
      ctx.fillStyle = "#1e1e24";
      ctx.fillRect(startX, currentY, maxWidth, rowHeight);

      // Draw horizontal top line
      ctx.strokeStyle = "rgba(129, 140, 248, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, currentY);
      ctx.lineTo(startX + maxWidth, currentY);
      ctx.stroke();

      // Header Texts
      ctx.fillStyle = "#34D399"; // Mint accents for headers
      ctx.font = "bold 12px sans-serif";
      
      for (let c = 0; c < numCols; c++) {
        const headerText = table.headers[c] || "";
        const cx = startX + c * colWidth;
        
        // Draw Header text
        ctx.fillText(headerText, cx + cellPadding, currentY + rowHeight / 2 + 4);
        
        // Draw vertical column divider
        if (c > 0) {
          ctx.beginPath();
          ctx.moveTo(cx, currentY);
          ctx.lineTo(cx, currentY + rowHeight);
          ctx.stroke();
        }
      }

      currentY += rowHeight;

      // Double divider
      ctx.strokeStyle = "rgba(129, 140, 248, 0.4)";
      ctx.beginPath();
      ctx.moveTo(startX, currentY);
      ctx.lineTo(startX + maxWidth, currentY);
      ctx.stroke();

      // Draw spreadsheet Rows
      ctx.font = "12px sans-serif";
      
      table.rows.forEach((row, rIdx) => {
        // Alternating background rows for high readability
        ctx.fillStyle = rIdx % 2 === 0 ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.05)";
        ctx.fillRect(startX, currentY, maxWidth, rowHeight);

        ctx.fillStyle = "#D1D5DB";

        for (let c = 0; c < numCols; c++) {
          const cellValue = row[c] || "";
          const cx = startX + c * colWidth;

          // Draw Truncated cell text bounds safely
          const valWidth = colWidth - cellPadding * 2;
          let cellText = cellValue;
          if (ctx.measureText(cellValue).width > valWidth) {
            // Truncate
            while (cellText.length > 3 && ctx.measureText(cellText + "...").width > valWidth) {
              cellText = cellText.slice(0, -1);
            }
            cellText += "...";
          }

          ctx.fillText(cellText, cx + cellPadding, currentY + rowHeight / 2 + 4);

          // Draw vertical divider
          if (c > 0) {
            ctx.strokeStyle = "rgba(129, 140, 248, 0.15)";
            ctx.beginPath();
            ctx.moveTo(cx, currentY);
            ctx.lineTo(cx, currentY + rowHeight);
            ctx.stroke();
          }
        }

        currentY += rowHeight;

        // Horiz divider
        ctx.strokeStyle = "rgba(129, 140, 248, 0.15)";
        ctx.beginPath();
        ctx.moveTo(startX, currentY);
        ctx.lineTo(startX + maxWidth, currentY);
        ctx.stroke();
      });
    }

    // Capture Base64 representation to persist snapshot
    const dataUrl = canvas.toDataURL("image/png");
    onCaptureSnapshot(dataUrl);
  };

  // Text paragraph updates
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (role === "instructor") return;
    propagateUpdate({
      ...docState,
      text: e.target.value
    });
  };

  // Cell modification
  const handleCellChange = (rIdx: number, cIdx: number, newVal: string) => {
    if (role === "instructor") return;
    const table = docState.table || { headers: [], rows: [] };
    const updatedRows = table.rows.map((row, ri) => {
      if (ri === rIdx) {
        const copy = [...row];
        copy[cIdx] = newVal;
        return copy;
      }
      return row;
    });

    propagateUpdate({
      ...docState,
      table: {
        ...table,
        rows: updatedRows
      }
    });
  };

  // Header edits
  const handleHeaderChange = (cIdx: number, newVal: string) => {
    if (role === "instructor") return;
    const table = docState.table || { headers: [], rows: [] };
    const updatedHeaders = [...table.headers];
    updatedHeaders[cIdx] = newVal;

    propagateUpdate({
      ...docState,
      table: {
        ...table,
        headers: updatedHeaders
      }
    });
  };

  // Add row
  const addRow = () => {
    if (role === "instructor") return;
    const table = docState.table || { headers: ["Parameter", "Value"], rows: [["e.g. Bound", "Limit"]] };
    const numCols = table.headers.length;
    const newRow = Array(numCols).fill("Empty Cell");
    propagateUpdate({
      ...docState,
      table: {
        ...table,
        rows: [...table.rows, newRow]
      }
    });
  };

  // Remove Row
  const removeRow = (rIdx: number) => {
    if (role === "instructor") return;
    const table = docState.table || { headers: [], rows: [] };
    if (table.rows.length <= 1) return;
    const filtered = table.rows.filter((_, idx) => idx !== rIdx);
    propagateUpdate({
      ...docState,
      table: {
        ...table,
        rows: filtered
      }
    });
  };

  // Add Column
  const addColumn = () => {
    if (role === "instructor") return;
    const table = docState.table || { headers: ["Parameter", "Value"], rows: [["e.g. Bound", "Limit"]] };
    if (table.headers.length >= 5) {
      alert("Limit of 5 parameters / columns reached.");
      return;
    }
    const newHeaders = [...table.headers, "New Dimension"];
    const newRows = table.rows.map(row => [...row, "Value"]);
    propagateUpdate({
      ...docState,
      text: docState.text,
      table: {
        headers: newHeaders,
        rows: newRows
      }
    });
  };

  // Remove Column
  const removeColumn = () => {
    if (role === "instructor") return;
    const table = docState.table || { headers: [], rows: [] };
    if (table.headers.length <= 2) return;
    const newHeaders = table.headers.slice(0, -1);
    const newRows = table.rows.map(row => row.slice(0, -1));
    propagateUpdate({
      ...docState,
      text: docState.text,
      table: {
        headers: newHeaders,
        rows: newRows
      }
    });
  };

  const isInstructor = role === "instructor";

  // Quick structure templates
  const insertTemplate = (type: "tradeoff" | "arguments" | "outline") => {
    if (role === "instructor") return;
    let newText = "";
    let newTable: TableState = { headers: [], rows: [] };

    if (type === "tradeoff") {
      newText = "Detailed Trade-off Matrix:\nComparing alternative architectures against our proposed boundary limits, tracking overhead versus precision thresholds.";
      newTable = {
        headers: ["System Option", "Trade-off Overhead", "Precision %", "Key Constraint"],
        rows: [
          ["Proposed Bounds", "Low (O(1) limits)", "98.8%", "Strict mathematical convergence"],
          ["Baseline Model", "Mid (O(N) lookup)", "92.1%", "Prone to high latency skew"],
          ["Exhaustive Proof", "High (O(N^2) load)", "99.9%", "Unfeasible compute limits"]
        ]
      };
    } else if (type === "arguments") {
      newText = "Logical Claims Affirmation and Debunking Outline:\nDetailing primary scientific assertions inside the paper against competitor theories and experimental biases.";
      newTable = {
        headers: ["Core Asserted Claim", "Empirical Evidence / Line", "Counter Theory", "Our Defense Outcome"],
        rows: [
          ["Autonomous crop reading", "Section 4 / p. 11", "Sensor solar drift error", "Differential offset bounds added"],
          ["Asymptotic error threshold", "Section 3 / Theorem 2", "Inconsistent sample noise", "Validated with bootstrapping proof"]
        ]
      };
    } else if (type === "outline") {
      newText = "Project Module Structural Outline & Interaction Grid:\nDividing computational stages, data outputs, and specific analytical responsibilities of components.";
      newTable = {
        headers: ["Module / File", "Functional Trigger", "Internal State Output", "Assigned Verification"],
        rows: [
          ["Inference Engine", "Batch trigger step", "N-dimensional tensor", "Fully bounds validated"],
          ["Spectrometry Layer", "Hardware register loop", "Calibrated raw floating float", "Validated in laboratory tests"]
        ]
      };
    }

    propagateUpdate({
      text: newText,
      table: newTable,
      hasTable: true
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d11] rounded-xl shadow-lg border border-white/5 overflow-hidden">
      
      {/* Exporter canvas - hidden representation for multi-modal image export */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Control bar */}
      <div className="bg-black/40 p-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-mono font-bold text-white/80 tracking-wide uppercase">
            Proof & Structure Word Processor
          </span>
          {isInstructor && (
            <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-mono animate-pulse">
              Instructor Observer Frame
            </span>
          )}
        </div>

        {!isInstructor && (
          <div className="flex flex-wrap items-center gap-1.5 bg-white/5 p-1 rounded-lg border border-white/10">
            <span className="text-[10px] text-white/30 tracking-wider font-mono mr-1.5 uppercase pl-2">Load Template:</span>
            <button
              type="button"
              onClick={() => insertTemplate("tradeoff")}
              className="px-2 py-1 text-[10.5px] font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/10 transition cursor-pointer"
            >
              📊 Trade-offs
            </button>
            <button
              type="button"
              onClick={() => insertTemplate("arguments")}
              className="px-2 py-1 text-[10.5px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/10 transition cursor-pointer"
            >
              📝 Claim Debunks
            </button>
            <button
              type="button"
              onClick={() => insertTemplate("outline")}
              className="px-2 py-1 text-[10.5px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/10 transition cursor-pointer"
            >
              📐 System Architecture
            </button>
          </div>
        )}
      </div>

      {/* Editor Body */}
      <div className="p-5 flex flex-col gap-6 text-left flex-1 min-h-[420px] overflow-y-auto">
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold tracking-widest text-[#94A3B8] font-mono block">
            ✍️ Part 1: Explanatory Proof & Analytical Paragraphs
          </label>
          <p className="text-[11px] text-white/40">
            Articulate key mathematical steps, hypotheses responses, or definitions. Changes update and sync with the examiner immediately.
          </p>
          <textarea
            value={docState.text}
            onChange={handleTextChange}
            disabled={isInstructor}
            className="w-full h-24 bg-[#0a0a0df2] border border-white/10 rounded-lg p-3 text-xs text-white placeholder-white/20 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-serif leading-relaxed resize-none disabled:opacity-60"
            placeholder="Structure your equations, logical variables, arguments, and academic claims here..."
          />
        </div>

        {/* Part 2: Dynamic Spreadsheet Table Matrix */}
        {docState.hasTable !== false ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <label className="text-[10px] uppercase font-bold tracking-widest text-[#94A3B8] font-mono block flex items-center gap-1">
                <TableProperties className="w-3.5 h-3.5 text-indigo-400" /> Part 2: Comparison & Proof Matrix (Grid)
              </label>
              
              {!isInstructor && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={addColumn}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white hover:text-indigo-300 rounded text-[10.5px] flex items-center gap-1 font-mono transition cursor-pointer"
                    title="Add parameter column"
                  >
                    <Plus className="w-3 h-3" /> Col
                  </button>
                  <button
                    type="button"
                    onClick={removeColumn}
                    disabled={(docState.table?.headers || []).length <= 2}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white hover:text-red-300 disabled:opacity-30 disabled:pointer-events-none rounded text-[10.5px] flex items-center gap-1 font-mono transition cursor-pointer"
                    title="Remove last parameter column"
                  >
                    <Trash2 className="w-3 h-3" /> Col
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      propagateUpdate({
                        ...docState,
                        hasTable: false
                      });
                    }}
                    className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 rounded text-[10.5px] flex items-center gap-1 font-mono transition cursor-pointer ml-1"
                    title="Remove/Delete table grid entirely"
                  >
                    <Trash2 className="w-3 h-3" /> Delete Table
                  </button>
                </div>
              )}
            </div>

            <p className="text-[11px] text-white/40">
              Construct structured academic trade-off grids. Double click or tap headers and cells to reformat claims. Limit of 5 dimension columns.
            </p>

            <div className="border border-white/10 rounded-xl overflow-x-auto bg-[#08080c]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    {(docState.table?.headers || []).map((hdr, cIdx) => (
                      <th key={cIdx} className="p-3 border-r border-white/15 min-w-[120px]">
                        <input
                          type="text"
                          value={hdr}
                          onChange={(e) => handleHeaderChange(cIdx, e.target.value)}
                          disabled={isInstructor}
                          className="bg-transparent text-indigo-300 font-mono font-bold text-xs outline-none focus:border-b focus:border-indigo-400 w-full disabled:opacity-80"
                          placeholder={`Header ${cIdx + 1}`}
                        />
                      </th>
                    ))}
                    {!isInstructor && (
                      <th className="p-3 w-12 text-center text-white/30 font-mono text-[10px]">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(docState.table?.rows || []).map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-white/5 hover:bg-white/[0.02]">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2 border-r border-white/5">
                          <textarea
                            rows={1}
                            value={cell}
                            onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                            disabled={isInstructor}
                            className="bg-transparent text-[#E2E8F0] font-sans text-xs outline-none focus:border-b focus:border-indigo-500 w-full resize-none disabled:opacity-80"
                            placeholder="Empty Parameter"
                          />
                        </td>
                      ))}
                      {!isInstructor && (
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(rIdx)}
                            disabled={(docState.table?.rows || []).length <= 1}
                            className="text-red-400/50 hover:text-red-400 transition cursor-pointer disabled:opacity-20 disabled:pointer-events-none p-1.5 rounded"
                            title="Delete Row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isInstructor && (
              <button
                type="button"
                onClick={addRow}
                className="mt-2 w-full py-2 bg-gradient-to-r from-indigo-500/10 to-indigo-600/5 hover:from-indigo-500/15 hover:to-indigo-600/10 border border-indigo-500/20 text-indigo-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm hover:shadow"
              >
                <Plus className="w-4 h-4" /> Add Row to Table Matrix
              </button>
            )}
          </div>
        ) : (
          <div className="border border-dashed border-white/10 rounded-xl p-6 text-center bg-black/20 space-y-3">
            <TableProperties className="w-8 h-8 text-indigo-400 mx-auto opacity-30" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white/70 uppercase font-mono tracking-wider">No Comparative Table Active</h4>
              <p className="text-[11px] text-white/40 max-w-sm mx-auto">
                {isInstructor 
                  ? "The candidate answered using text only. No comparative proof matrix active for this question." 
                  : "Adding a structured comparison matrix table can help committee members judge mathematical constraints or results."}
              </p>
            </div>
            {!isInstructor && (
              <button
                type="button"
                onClick={() => {
                  propagateUpdate({
                    ...docState,
                    hasTable: true,
                    table: docState.table && docState.table.headers && docState.table.headers.length > 0 ? docState.table : {
                      headers: ["Variable / Parameter", "Value Limits", "Analytical Justification"],
                      rows: [["e.g. Target Accuracy Bound", "O(1/n)", "Symmetric error convergence limit claims"]]
                    }
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg text-xs font-bold border border-indigo-500/30 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Setup Comparison Table
              </button>
            )}
          </div>
        )}

        {/* Quality status ticker */}
        <div className="mt-4 p-3 bg-indigo-500/[0.03] border border-indigo-500/10 rounded-xl flex items-center gap-2 text-[10.5px] font-mono text-indigo-300/80">
          <FileCheck className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
          <span>Real-time Sync Active: Written details automatically converted into academic images for the evaluation.</span>
        </div>
      </div>
    </div>
  );
}
