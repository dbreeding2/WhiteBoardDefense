import React, { useEffect, useState } from "react";
import { DefenseQuestion, DrawingStroke } from "../types";
import { QRCodeSVG } from "qrcode.react";
import Whiteboard from "./Whiteboard";
import WordProcessor from "./WordProcessor";
import DiagramBuilder from "./DiagramBuilder";
import { ChevronLeft, ChevronRight, Share2, Award, Users, AlertCircle, Palette, FileText, Network, Monitor } from "lucide-react";

interface DefenseSessionProps {
  sessionId: string;
  role: "student" | "instructor" | "both";
  currentQuestionIndex: number;
  onQuestionIndexChange: (idx: number) => void;
  questions: DefenseQuestion[];
  allStrokes: DrawingStroke[][];
  onStrokesChange: (idx: number, strokes: DrawingStroke[]) => void;
  allDocs: string[];
  onDocChange: (idx: number, doc: string) => void;
  activeTab: "draw" | "text" | "diagram";
  onActiveTabChange: (tab: "draw" | "text" | "diagram") => void;
  onSaveSnapshot: (idx: number, b64: string, evaluation?: any) => void;
  snapshots: string[];
  wsRef: React.MutableRefObject<WebSocket | null>;
  onProgressToChat: () => void;
  onBackToDashboard: () => void;
}

// Keywords in focusConcept that should auto-suggest the diagram tab
const DIAGRAM_CONCEPTS = [
  "vlan", "network", "topology", "architecture", "failover",
  "ospf", "routing", "firewall", "segment", "isp", "wan",
  "hipaa", "safeguard", "noc", "siem", "diagram", "flow",
  "infrastructure", "design", "schema",
];

function shouldSuggestDiagram(focusConcept: string): boolean {
  const lower = focusConcept.toLowerCase();
  return DIAGRAM_CONCEPTS.some((kw) => lower.includes(kw));
}

export default function DefenseSession({
  sessionId,
  role,
  currentQuestionIndex,
  onQuestionIndexChange,
  questions,
  allStrokes,
  onStrokesChange,
  allDocs,
  onDocChange,
  activeTab,
  onActiveTabChange,
  onSaveSnapshot,
  snapshots,
  wsRef,
  onProgressToChat,
  onBackToDashboard,
}: DefenseSessionProps) {
  const [showQR, setShowQR] = useState(false);
  const [syncToast, setSyncToast] = useState(false);
  const [diagramSuggested, setDiagramSuggested] = useState(false);

  const showSyncToast = () => {
    setSyncToast(true);
    setTimeout(() => setSyncToast(false), 2500);
  };
  const currentQuestion = questions[currentQuestionIndex];

  const [serverBaseUrl, setServerBaseUrl] = useState(window.location.origin);

  useEffect(() => {
    fetch("/api/server-info")
      .then(r => r.json())
      .then(data => { if (data.baseUrl) setServerBaseUrl(data.baseUrl); })
      .catch(() => {}); // fall back to window.location.origin
  }, []);

  const shareUrl = `${serverBaseUrl}/?sessionId=${sessionId}&role=student`;

  // Auto-suggest diagram tab when question changes to a topology/architecture concept
  useEffect(() => {
    if (!currentQuestion) return;
    const suggest = shouldSuggestDiagram(currentQuestion.focusConcept);
    setDiagramSuggested(suggest && activeTab !== "diagram");
  }, [currentQuestionIndex, currentQuestion]);

  // BroadcastChannel slide sync
  useEffect(() => {
    const slideChan = new BroadcastChannel(`slide_sync_${sessionId}`);
    slideChan.onmessage = (event) => {
      const { type, idx } = event.data;
      if (type === "slide_change" && idx !== currentQuestionIndex) {
        onQuestionIndexChange(idx);
      }
    };
    return () => { slideChan.close(); };
  }, [sessionId, currentQuestionIndex, onQuestionIndexChange]);

  const changeSlide = (newIdx: number) => {
    if (newIdx < 0 || newIdx >= questions.length) return;
    onQuestionIndexChange(newIdx);
    setDiagramSuggested(false);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "slide_change",
        sessionId,
        role,
        data: { idx: newIdx },
      }));
    }
    const slideChan = new BroadcastChannel(`slide_sync_${sessionId}`);
    slideChan.postMessage({ type: "slide_change", idx: newIdx });
    slideChan.close();
  };

  const handleTabChange = (tab: "draw" | "text" | "diagram") => {
    onActiveTabChange(tab);
    if (tab === "diagram") setDiagramSuggested(false);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "tab_change",
        sessionId,
        role,
        data: { tab },
      }));
    }
  };

  const currentQuestionStrokes = allStrokes[currentQuestionIndex] || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Session header */}
      <div className="bg-[#111] text-white rounded-2xl p-6 shadow-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm uppercase font-bold tracking-widest bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded" role="status">
              <span aria-hidden="true">&#9679;</span> Active Defense Panel
            </span>
            <span className="text-sm font-mono text-white/50">
              ID: <span className="text-white font-bold">{sessionId}</span>
            </span>
          </div>
          <h2 className="text-xl font-serif italic text-white/95">Stage 3 -- Whiteboard In-Depth Probing</h2>
          <p className="text-sm text-white/40">
            Student answers questions by drawing, typing, or constructing a network diagram on the live board.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {role !== "student" && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Return to dashboard? The current session will remain active.")) {
                  onBackToDashboard();
                }
              }}
              aria-label="Return to instructor dashboard"
              className="flex items-center gap-1.5 bg-white/5 border border-white/15 text-white/60 hover:text-white hover:bg-white/10 p-2.5 px-4 rounded-xl text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Monitor className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" /> Dashboard
            </button>
          )}
          {role !== "student" && (
            <button
              type="button"
              onClick={() => setShowQR(!showQR)}
              aria-label="Share student board link"
              className="flex items-center gap-1.5 bg-white/5 border border-white/15 text-white hover:bg-white/10 p-2.5 px-4 rounded-xl text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" /> Share Student Board
            </button>
          )}
          <button
            type="button"
            onClick={onProgressToChat}
            aria-label="Proceed to AI probing chat"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 px-5 rounded-xl text-sm font-bold shadow-md transition hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Proceed to AI Probing Chat <Award className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* QR drawer */}
      {showQR && (
        <div className="bg-[#161622] border border-indigo-500/20 rounded-2xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-3 flex justify-center">
            <div className="p-3 bg-white rounded-xl shadow-lg border border-white/10 inline-block">
              <QRCodeSVG value={shareUrl} size={140} />
            </div>
          </div>
          <div className="md:col-span-9 space-y-3 text-left">
            <h4 className="text-sm font-bold text-white/90 flex items-center gap-1.5 font-sans uppercase tracking-wider">
              <Users className="w-4 h-4 text-indigo-400" /> Cast Student Whiteboard to Tablet or iPad
            </h4>
            <p className="text-xs text-white/50 leading-relaxed">
              Have the student scan this QR code on their stylus-equipped tablet. They can sketch in full-screen Canvas Mode while you observe and control the active question from your browser.
            </p>
            <div className="p-3 border border-white/10 bg-black rounded-lg flex items-center justify-between">
              <span className="text-xs font-mono text-white/40 truncate grow mr-2">{shareUrl}</span>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(shareUrl); alert("Link copied!"); }}
                className="text-[10px] uppercase font-bold text-indigo-400 hover:underline shrink-0 font-mono"
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-[#111] rounded-xl border border-white/5 p-4 space-y-3">
            <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest font-mono">
              Verification Roadmap (1-{questions.length})
            </h3>
            <div className="space-y-2">
              {questions.map((q, idx) => {
                const isActive = idx === currentQuestionIndex;
                const hasSnapshot = !!snapshots[idx];
                const isDiagramQ = shouldSuggestDiagram(q.focusConcept);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      changeSlide(idx);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs font-sans transition flex items-center gap-2 ${
                      isActive
                        ? "bg-indigo-600/10 border-indigo-500/40 text-indigo-400 font-semibold"
                        : "bg-black/30 border-white/5 hover:border-white/20 text-white/70 hover:text-white"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center font-mono font-bold text-[10px] shrink-0 ${
                      isActive ? "bg-indigo-600/35 text-indigo-300 border border-indigo-500/30" : "bg-white/5 text-white/40"
                    }`}>
                      {q.num}
                    </span>
                    <span className="truncate grow">{q.focusConcept}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isDiagramQ && (
                        <span title="Diagram question" className="text-indigo-400/50">
                          <Network className="w-3 h-3" />
                        </span>
                      )}
                      {hasSnapshot && (
                        <span className="text-[9px] bg-emerald-950/40 text-emerald-400 p-0.5 px-1.5 rounded border border-emerald-900/50 font-bold font-mono">
                          Saved
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sync mode toast for students */}
          {syncToast && (
            <div className="bg-indigo-950/60 border border-indigo-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-indigo-300">
              <i className="ti ti-lock" style={{fontSize:"13px"}} />
              Instructor controls navigation
            </div>
          )}

          {role !== "student" && (
            <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 space-y-2 text-left">
              <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1 font-mono">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Instructor Pro Tip
              </h4>
              <p className="text-[11px] text-white/50 leading-relaxed">
                Questions marked with a <Network className="w-3 h-3 inline text-indigo-400/50" /> icon are topology or architecture questions -- switch to the <span className="text-indigo-400">Diagram Board</span> tab and have the student construct the network from components to verify genuine understanding.
              </p>
            </div>
          )}
        </div>

        {/* Right: workspace */}
        <div className="lg:col-span-9 space-y-4 flex flex-col">

          {/* Question display */}
          <div className="bg-[#111] border border-white/5 rounded-xl p-5 shadow-inner">
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-indigo-500/10 text-indigo-450 border border-indigo-500/20 py-0.5 px-2 rounded font-mono font-bold">
                QUESTION #{currentQuestion.num}
              </span>
              <span className="text-xs font-mono font-bold text-white/40 uppercase tracking-widest">
                -- {currentQuestion.focusConcept}
              </span>
              {shouldSuggestDiagram(currentQuestion.focusConcept) && (
                <span className="ml-auto flex items-center gap-1 text-[10px] text-indigo-400/70 font-mono">
                  <Network className="w-3 h-3" /> Diagram question
                </span>
              )}
            </div>
            <p className="text-white/90 text-sm md:text-base leading-relaxed mt-2.5 font-medium whitespace-pre-line font-sans">
              {currentQuestion.questionText}
            </p>
          </div>

          {/* Diagram suggestion banner */}
          {diagramSuggested && activeTab !== "diagram" && (
            <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
              <Network className="w-4 h-4 text-indigo-400 shrink-0" />
              <p className="text-xs text-indigo-300 flex-1">
                This is a topology/architecture question. The <strong>Diagram Board</strong> lets the student construct the network from components -- a stronger integrity check than freehand drawing.
              </p>
              <button
                type="button"
                onClick={() => handleTabChange("diagram")}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition"
              >
                Switch to Diagram Board
              </button>
              <button
                type="button"
                onClick={() => setDiagramSuggested(false)}
                className="shrink-0 text-white/20 hover:text-white/40 text-xs font-mono"
              >
                x
              </button>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex border-b border-white/5 gap-0.5 select-none pt-1">
            {(
              [
                { id: "diagram", label: "Diagram Board",   Icon: Network },
                { id: "text",    label: "Word Processor",  Icon: FileText },
                { id: "draw",    label: "Drawing Board",   Icon: Palette },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleTabChange(id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold font-mono uppercase tracking-wider transition border-t-2 rounded-t-lg ${
                  activeTab === id
                    ? "bg-[#0d0d11] border-indigo-500 text-[#818CF8]"
                    : "bg-transparent border-transparent text-white/40 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {id === "diagram" && shouldSuggestDiagram(currentQuestion.focusConcept) && activeTab !== "diagram" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse ml-0.5" />
                )}
              </button>
            ))}
          </div>

          {/* Workspace */}
          <div className="flex-1">
            {activeTab === "draw" && (
              <Whiteboard
                sessionId={sessionId}
                questionIndex={currentQuestionIndex}
                role={role}
                strokes={currentQuestionStrokes}
                onStrokesChange={(updated) => onStrokesChange(currentQuestionIndex, updated)}
                onCaptureSnapshot={(b64, evaluation) => onSaveSnapshot(currentQuestionIndex, b64, evaluation)}
                wsRef={wsRef}
              />
            )}
            {activeTab === "text" && (
              <WordProcessor
                sessionId={sessionId}
                questionIndex={currentQuestionIndex}
                questionText={currentQuestion.questionText}
                focusConcept={currentQuestion.focusConcept}
                role={role}
                value={allDocs[currentQuestionIndex] || ""}
                onChange={(newValue) => onDocChange(currentQuestionIndex, newValue)}
                onCaptureSnapshot={(b64, evaluation) => onSaveSnapshot(currentQuestionIndex, b64, evaluation)}
                wsRef={wsRef}
              />
            )}
            {activeTab === "diagram" && (
              <DiagramBuilder
                questionIndex={currentQuestionIndex}
                focusConcept={currentQuestion.focusConcept}
                questionText={currentQuestion.questionText}
                onCaptureSnapshot={(b64, evaluation) => onSaveSnapshot(currentQuestionIndex, b64, evaluation)}
                role={role}
                isVisible={activeTab === "diagram"}
              />
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => changeSlide(currentQuestionIndex - 1)}
              disabled={currentQuestionIndex === 0}
              aria-label={`Go to question ${currentQuestionIndex}`}
              className="flex items-center gap-2 border border-white/30 hover:border-white/60 hover:bg-white/10 text-white font-semibold text-sm rounded-xl px-5 py-2.5 disabled:opacity-30 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Previous Question
            </button>
            <div className="text-sm text-white/50 font-mono">
              Active Question {currentQuestionIndex + 1} of {questions.length}
            </div>
            <button
              type="button"
              onClick={() => changeSlide(currentQuestionIndex + 1)}
              disabled={currentQuestionIndex === questions.length - 1}
              aria-label={`Go to question ${currentQuestionIndex + 2}`}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 border border-indigo-500 text-white font-semibold text-sm rounded-xl px-5 py-2.5 disabled:opacity-30 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Next Question <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
