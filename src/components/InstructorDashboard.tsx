import React, { useState, useEffect, useRef } from "react";
import { Monitor, Users, Clock, ChevronRight, Plus, QrCode, Copy, CheckCircle, AlertCircle, Loader2, BookOpen, Layers } from "lucide-react";

interface SessionMeta {
  sessionId: string;
  studentName: string;
  paperTitle: string;
  courseCode: string;
  currentQuestion: number;
  totalQuestions: number;
  stage: "setup" | "session" | "followup" | "report" | "complete";
  startedAt: number;
  lastActivity: number;
  thumbnail: string;
}

interface InstructorDashboardProps {
  wsRef: React.MutableRefObject<WebSocket | null>;
  appUrl: string;
  onNewSession: () => void;
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  setup:    { label: "Setting Up",    color: "text-white/40 bg-white/5 border-white/10" },
  session:  { label: "Whiteboard",    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30" },
  followup: { label: "Oral Defense",  color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  report:   { label: "Report Ready",  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  complete: { label: "Complete",      color: "text-white/30 bg-white/5 border-white/10" },
};

function elapsed(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function duration(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function InstructorDashboard({ wsRef, appUrl, onNewSession }: InstructorDashboardProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState(0);
  const dashWsRef = useRef<WebSocket | null>(null);

  // Connect dedicated dashboard WebSocket
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}`);
    dashWsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "dashboard_join" }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "dashboard_update") {
          setSessions(msg.sessions || []);
        }
      } catch {}
    };

    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, []);

  // Tick every 10s to update elapsed times
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const copyLink = (sessionId: string) => {
    const url = `${appUrl}/?sessionId=${sessionId}&role=student`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(sessionId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const openSession = (sessionId: string) => {
    window.open(`/?sessionId=${sessionId}&role=instructor`, "_blank");
  };

  const activeSessions = sessions.filter(s => s.stage !== "complete");
  const completedSessions = sessions.filter(s => s.stage === "complete");

  return (
    <div className="min-h-[80vh] p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Monitor className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl font-bold text-white">Instructor Dashboard</h1>
            <span className={`ml-2 flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${connected ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : "text-red-400 bg-red-500/10 border-red-500/30"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
              {connected ? "Live" : "Disconnected"}
            </span>
          </div>
          <p className="text-white/40 text-sm">
            {activeSessions.length} active {activeSessions.length === 1 ? "session" : "sessions"} · {completedSessions.length} completed
          </p>
        </div>
        <button
          onClick={onNewSession}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:scale-105 active:scale-95 shadow-lg"
        >
          <Plus className="w-4 h-4" /> New Defense Session
        </button>
      </div>

      {/* Empty state */}
      {sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-white/20" />
          </div>
          <h2 className="text-white/60 font-semibold mb-2">No active sessions</h2>
          <p className="text-white/30 text-sm max-w-sm mb-6">
            Start a new defense session to set up questions, then share the student link. Sessions appear here automatically once a student joins.
          </p>
          <button
            onClick={onNewSession}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <Plus className="w-4 h-4" /> Start First Session
          </button>
        </div>
      )}

      {/* Active sessions grid */}
      {activeSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Active Sessions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeSessions.map(session => {
              const stageInfo = STAGE_LABELS[session.stage] || STAGE_LABELS.session;
              const progress = session.totalQuestions > 0
                ? Math.round((session.currentQuestion / session.totalQuestions) * 100)
                : 0;
              return (
                <div key={session.sessionId} className="bg-[#0d0d11] border border-white/8 rounded-2xl overflow-hidden hover:border-white/15 transition group">

                  {/* Thumbnail */}
                  <div className="relative h-36 bg-[#080810] flex items-center justify-center overflow-hidden border-b border-white/5">
                    {session.thumbnail ? (
                      <img src={session.thumbnail} alt="Latest whiteboard" className="w-full h-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-white/20">
                        <Layers className="w-8 h-8" />
                        <span className="text-xs">Waiting for whiteboard activity</span>
                      </div>
                    )}
                    {/* Stage badge overlay */}
                    <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${stageInfo.color}`}>
                      {stageInfo.label}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-white text-sm truncate max-w-[180px]">
                          {session.studentName || "Student"}
                        </div>
                        <div className="text-white/40 text-xs truncate max-w-[180px]">
                          {session.paperTitle || "Untitled"} · {session.courseCode || "—"}
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded border border-white/8">
                        {session.sessionId}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {session.stage === "session" && (
                      <div className="mb-3">
                        <div className="flex justify-between text-[10px] text-white/30 mb-1">
                          <span>Question {session.currentQuestion + 1} of {session.totalQuestions}</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-3 text-[10px] text-white/30 mb-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {duration(session.startedAt)}
                      </span>
                      <span>· Active {elapsed(session.lastActivity)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyLink(session.sessionId)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-white/10 hover:bg-white/5 text-white/60 hover:text-white py-1.5 rounded-lg transition"
                      >
                        {copiedId === session.sessionId
                          ? <><CheckCircle className="w-3 h-3 text-emerald-400" /> Copied!</>
                          : <><Copy className="w-3 h-3" /> Copy Link</>}
                      </button>
                      <button
                        onClick={() => openSession(session.sessionId)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-400 py-1.5 rounded-lg transition"
                      >
                        View Session <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add new session card */}
            <button
              onClick={onNewSession}
              className="h-full min-h-[280px] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 text-white/20 hover:text-white/40 hover:border-white/20 transition group"
            >
              <div className="w-12 h-12 rounded-xl border border-dashed border-current flex items-center justify-center group-hover:scale-110 transition">
                <Plus className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold">Add Student Session</span>
            </button>
          </div>
        </div>
      )}

      {/* Completed sessions */}
      {completedSessions.length > 0 && (
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Completed This Session</h2>
          <div className="space-y-2">
            {completedSessions.map(session => (
              <div key={session.sessionId} className="flex items-center gap-4 bg-white/3 border border-white/5 rounded-xl px-4 py-3">
                <CheckCircle className="w-4 h-4 text-emerald-400/50 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-white/50 text-sm font-semibold truncate block">
                    {session.studentName || "Student"}
                  </span>
                  <span className="text-white/25 text-xs truncate block">
                    {session.paperTitle} · {session.courseCode}
                  </span>
                </div>
                <span className="text-white/25 text-xs font-mono">{session.sessionId}</span>
                <span className="text-white/25 text-xs">{duration(session.startedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dashboard URL hint */}
      <div className="mt-8 p-4 bg-white/3 border border-white/8 rounded-xl">
        <p className="text-white/30 text-xs">
          <span className="text-white/50 font-semibold">Dashboard URL:</span>{" "}
          <span className="font-mono">{appUrl}/?dashboard=true</span>
          {" "}· Bookmark this to return directly to the dashboard.
        </p>
      </div>
    </div>
  );
}
