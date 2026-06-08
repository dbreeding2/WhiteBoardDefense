import React, { useEffect, useState } from "react";
import { DefenseQuestion, DrawingStroke } from "../types";
import { QRCodeSVG } from "qrcode.react";
import Whiteboard from "./Whiteboard";
import WordProcessor from "./WordProcessor";
import { ChevronLeft, ChevronRight, Share2, Award, Users, AlertCircle, Sparkles, CheckCircle, FileText, Palette } from "lucide-react";

interface DefenseSessionProps {
  sessionId: string;
  role: "student" | "instructor" | "both";
  currentQuestionIndex: number;
  onQuestionIndexChange: (idx: number) => void;
  questions: DefenseQuestion[];
  allStrokes: DrawingStroke[][]; // 8 lists of strokes
  onStrokesChange: (idx: number, strokes: DrawingStroke[]) => void;
  allDocs: string[];
  onDocChange: (idx: number, doc: string) => void;
  activeTab: "draw" | "text";
  onActiveTabChange: (tab: "draw" | "text") => void;
  onSaveSnapshot: (idx: number, b64: string) => void;
  snapshots: string[];
  wsRef: React.MutableRefObject<WebSocket | null>;
  onProgressToChat: () => void;
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
}: DefenseSessionProps) {
  const [showQR, setShowQR] = useState(false);
  const currentQuestion = questions[currentQuestionIndex];

  // Construct sharing url
  const shareUrl = `${window.location.origin}/?sessionId=${sessionId}&role=student`;

  // Listening to peer slide-changes via WebSocket or BroadcastChannel
  useEffect(() => {
    // Also use BroadcastChannel for slide switching on same computer
    const slideChan = new BroadcastChannel(`slide_sync_${sessionId}`);
    
    slideChan.onmessage = (event) => {
      const { type, idx } = event.data;
      if (type === "slide_change" && idx !== currentQuestionIndex) {
        onQuestionIndexChange(idx);
      }
    };

    return () => {
      slideChan.close();
    };
  }, [sessionId, currentQuestionIndex, onQuestionIndexChange]);

  const changeSlide = (newIdx: number) => {
    if (newIdx < 0 || newIdx >= questions.length) return;
    onQuestionIndexChange(newIdx);

    // Broadcast slide position to WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "slide_change",
          sessionId,
          role,
          data: {
            idx: newIdx,
          },
        })
      );
    }

    // Broadcast to BroadcastChannel
    const slideChan = new BroadcastChannel(`slide_sync_${sessionId}`);
    slideChan.postMessage({ type: "slide_change", idx: newIdx });
    slideChan.close();
  };

  const currentQuestionStrokes = allStrokes[currentQuestionIndex] || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Session header banner */}
      <div className="bg-[#111] text-white rounded-2xl p-6 shadow-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
              Active Defense Panel
            </span>
            <span className="text-xs font-mono text-white/50">
              ID: <span className="text-white font-bold">{sessionId}</span>
            </span>
          </div>
          <h2 className="text-xl font-serif italic text-white/95">Stage 3 — Whiteboard In-Depth Probing</h2>
          <p className="text-xs text-white/40">
            Student answers the customized analytical questions by drawing schema and derivations on the canvas in real-time.
          </p>
        </div>

        {/* Core Controls per Role */}
        <div className="flex flex-wrap items-center gap-3">
          {role !== "student" && (
            <button
              type="button"
              id="session-toggle-qr-btn"
              onClick={() => setShowQR(!showQR)}
              className="flex items-center gap-1.5 bg-white/5 border border-white/15 text-white hover:bg-white/10 p-2.5 px-4 rounded-xl text-xs font-semibold transition"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-400" /> Share Student Board (QR Code)
            </button>
          )}

          {role !== "student" && (
            <button
              type="button"
              id="progress-to-followup-chat-btn"
              onClick={onProgressToChat}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 px-5 rounded-xl text-xs font-bold shadow-md transition hover:scale-105 active:scale-95"
            >
              Proceed to AI Probing Chat <Award className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* QR Code sharing flyout drawer if toggled */}
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
              Have the student scan this QR code on their stylus-equipped tablet/mobile device. They can sketch fluidly in full-screen Canvas Mode while you observe and control the active defense question index live from your computer browser.
            </p>
            <div className="p-3 border border-white/10 bg-black rounded-lg flex items-center justify-between">
              <span className="text-xs font-mono text-white/40 truncate grow mr-2">{shareUrl}</span>
              <button
                type="button"
                id="copy-session-link"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  alert("Student collaboration invitation link copied to clipboard!");
                }}
                className="text-[10px] uppercase font-bold text-indigo-400 hover:underline shrink-0 font-mono"
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Board Work Space */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left column: Sidebar list of 8 Questions */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-[#111] rounded-xl border border-white/5 p-4 space-y-3">
            <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest font-mono">
              Verification Roadmap (1-8)
            </h3>
            <div className="space-y-2">
              {questions.map((q, idx) => {
                const isActive = idx === currentQuestionIndex;
                const hasSnapshot = !!snapshots[idx];
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      if (role === "student") {
                        alert("Students are in sync mode. Only instructors can navigate defense slides.");
                        return;
                      }
                      changeSlide(idx);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs font-sans transition flex items-center gap-2 ${
                      isActive
                        ? "bg-indigo-600/10 border-indigo-500/40 text-indigo-400 font-semibold"
                        : "bg-black/30 border-white/5 hover:border-white/20 text-white/70 hover:text-white"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center font-mono font-bold text-[10px] ${
                      isActive ? "bg-indigo-600/35 text-indigo-300 border border-indigo-500/30" : "bg-white/5 text-white/40"
                    }`}>
                      {q.num}
                    </span>
                    <span className="truncate grow">{q.focusConcept}</span>
                    {hasSnapshot && (
                      <span className="text-[9px] bg-emerald-950/40 text-emerald-400 p-0.5 px-1.5 rounded border border-emerald-900/50 font-bold font-mono">
                        Saved
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 space-y-2 text-left">
            <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1 font-mono">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Instructor Pro Tip
            </h4>
            <p className="text-[11px] text-white/50 leading-relaxed">
              When student finishes sketching a proof or outline, make sure to change slides or let the automatic snapshot record the whiteboard drawings. This base64 canvas state is saved and injected as direct image parts in the AI follow-up interview module.
            </p>
          </div>
        </div>

        {/* Right column: Main active whiteboard workspace */}
        <div className="lg:col-span-9 space-y-4 flex flex-col">
          {/* Question Display Card */}
          <div className="bg-[#111] border border-white/5 rounded-xl p-5 shadow-inner">
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-indigo-500/10 text-indigo-450 border border-indigo-500/20 py-0.5 px-2 rounded font-mono font-bold">
                QUESTION #{currentQuestion.num}
              </span>
              <span className="text-xs font-mono font-bold text-white/40 uppercase tracking-widest">
                — {currentQuestion.focusConcept}
              </span>
            </div>
            <p className="text-white/90 text-sm md:text-base leading-relaxed mt-2.5 font-medium whitespace-pre-line font-sans">
              {currentQuestion.questionText}
            </p>
          </div>

          {/* Workspace Tab Triggers */}
          <div className="flex border-b border-white/5 gap-0.5 select-none pt-1">
            <button
              type="button"
              onClick={() => {
                onActiveTabChange("draw");
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({
                    type: "tab_change",
                    sessionId,
                    role,
                    data: { tab: "draw" }
                  }));
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold font-mono uppercase tracking-wider transition border-t-2 rounded-t-lg ${
                activeTab === "draw"
                  ? "bg-[#0d0d11] border-indigo-500 text-[#818CF8]"
                  : "bg-transparent border-transparent text-white/40 hover:text-white"
              }`}
            >
              <Palette className="w-3.5 h-3.5" /> Drawing Board
            </button>
            <button
              type="button"
              onClick={() => {
                onActiveTabChange("text");
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({
                    type: "tab_change",
                    sessionId,
                    role,
                    data: { tab: "text" }
                  }));
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold font-mono uppercase tracking-wider transition border-t-2 rounded-t-lg ${
                activeTab === "text"
                  ? "bg-[#0d0d11] border-indigo-500 text-[#818CF8]"
                  : "bg-transparent border-transparent text-white/40 hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Text Word Processor
            </button>
          </div>

          {/* Interactive Whiteboard or Word Processor component wrapper */}
          <div className="flex-1">
            {activeTab === "draw" ? (
              <Whiteboard
                sessionId={sessionId}
                questionIndex={currentQuestionIndex}
                role={role}
                strokes={currentQuestionStrokes}
                onStrokesChange={(updated) => onStrokesChange(currentQuestionIndex, updated)}
                onCaptureSnapshot={(b64) => onSaveSnapshot(currentQuestionIndex, b64)}
                wsRef={wsRef}
              />
            ) : (
              <WordProcessor
                sessionId={sessionId}
                questionIndex={currentQuestionIndex}
                role={role}
                value={allDocs[currentQuestionIndex] || ""}
                onChange={(newValue) => onDocChange(currentQuestionIndex, newValue)}
                onCaptureSnapshot={(b64) => onSaveSnapshot(currentQuestionIndex, b64)}
                wsRef={wsRef}
              />
            )}
          </div>

          {/* Pagination buttons */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              id="prev-slide-button"
              onClick={() => changeSlide(currentQuestionIndex - 1)}
              disabled={currentQuestionIndex === 0 || role === "student"}
              className="flex items-center gap-1 border border-white/10 hover:bg-white/5 text-white font-semibold text-xs rounded-xl p-2 px-4 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous Question
            </button>
            <div className="text-xs text-white/40 font-mono">
              Active Question {currentQuestionIndex + 1} of {questions.length}
            </div>
            <button
              type="button"
              id="next-slide-button"
              onClick={() => changeSlide(currentQuestionIndex + 1)}
              disabled={currentQuestionIndex === questions.length - 1 || role === "student"}
              className="flex items-center gap-1 border border-white/10 hover:bg-white/5 text-white font-semibold text-xs rounded-xl p-2 px-4 disabled:opacity-40 transition"
            >
              Next Question <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
