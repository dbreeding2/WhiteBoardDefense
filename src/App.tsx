import React, { useState, useEffect, useRef } from "react";
import { StudentMetadata, DefenseQuestion, DrawingStroke, ChatMessage, AIPreparedAssessment } from "./types";
import SetupForm from "./components/SetupForm";
import ReviewQuestions from "./components/ReviewQuestions";
import DefenseSession from "./components/DefenseSession";
import FollowUpChat from "./components/FollowUpChat";
import ReportViewer from "./components/ReportViewer";
import InstructorDashboard from "./components/InstructorDashboard";
import { FileEdit, Sparkles, Monitor, AppWindow, UserCheck, ShieldAlert } from "lucide-react";

export default function App() {
  // Inject global accessibility CSS
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* WCAG 2.4.11 -- visible focus indicators on all interactive elements */
      *:focus-visible {
        outline: 2px solid #818CF8 !important;
        outline-offset: 2px !important;
      }
      /* WCAG 1.4.10 -- prefers-reduced-motion */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
      /* Minimum font size floor */
      button, input, select, textarea, label {
        font-size: max(14px, 1em);
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);
  const [currentStage, setCurrentStage] = useState<'dashboard' | 'setup' | 'review' | 'session' | 'followup' | 'report'>('setup');
  
  // Student Metadata
  const [studentName, setStudentName] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [courseName, setCourseName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [activityType, setActivityType] = useState<string>("paper");

  // Questions and whiteboard data
  const [questions, setQuestions] = useState<DefenseQuestion[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [allQuestionStrokes, setAllQuestionStrokes] = useState<DrawingStroke[][]>(Array(8).fill([]));
  const [allQuestionDocs, setAllQuestionDocs] = useState<string[]>(Array(8).fill(""));
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'draw' | 'text' | 'diagram'>('diagram');
  const [snapshots, setSnapshots] = useState<string[]>(Array(8).fill(""));
  const [diagramEvaluations, setDiagramEvaluations] = useState<(any | null)[]>(Array(8).fill(null));

  // Refs so WebSocket closures always see current values (avoids stale closure bug)
  const questionsRef = useRef<DefenseQuestion[]>([]);
  const studentNameRef = useRef("");
  const paperTitleRef = useRef("");
  const courseNameRef = useRef("");

  // Follow-up chat and evaluation
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [assessment, setAssessment] = useState<AIPreparedAssessment | null>(null);

  // Metadata Analysis
  const [metadataAnalysis, setMetadataAnalysis] = useState<any | null>(null);
  const [isAnalyzingMetadata, setIsAnalyzingMetadata] = useState<boolean>(false);

  // Connection role setup
  const [role, setRole] = useState<'both' | 'student' | 'instructor'>('both');
  const [assessmentMode, setAssessmentMode] = useState<'ai' | 'instructor'>('ai');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  // Keep refs in sync with state for use in WebSocket closures
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { studentNameRef.current = studentName; }, [studentName]);
  useEffect(() => { paperTitleRef.current = paperTitle; }, [paperTitle]);
  useEffect(() => { courseNameRef.current = courseName; }, [courseName]);

  // Generate unique session ID
  const generateSessionId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Poll REST endpoint for questions when joining via URL (student or instructor via "View Session")
  useEffect(() => {
    // Only poll if we joined via URL params (have a sessionId but started in 'session' stage directly)
    const urlParams = new URLSearchParams(window.location.search);
    const joinedViaUrl = !!urlParams.get("sessionId");
    if (!joinedViaUrl || !sessionId) return;

    let attempts = 0;
    const maxAttempts = 10;
    const pollQuestions = async () => {
      if (attempts >= maxAttempts) return;
      attempts++;
      try {
        const res = await fetch(`/api/defense/session-questions/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.questions && data.questions.length > 0) {
            setQuestions(data.questions);
            if (data.studentName) setStudentName(data.studentName);
            if (data.paperTitle)  setPaperTitle(data.paperTitle);
            if (data.courseName)  setCourseName(data.courseName);
            return; // Got real questions -- stop polling
          }
        }
      } catch (err) {
        console.warn("Question poll failed:", err);
      }
      // Retry with backoff: 2s, 3s, 4s...
      setTimeout(pollQuestions, 2000 + attempts * 1000);
    };

    // Start polling after 1.5s to give WebSocket a chance first
    const timer = setTimeout(pollQuestions, 1500);
    return () => clearTimeout(timer);
  }, [role, sessionId]);
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const urlSessionId = queryParams.get("sessionId");
    const urlRole = queryParams.get("role") as 'student' | 'instructor' | 'both' | null;
    const isDashboard = queryParams.get("dashboard") === "true";

    if (isDashboard) {
      setCurrentStage('dashboard');
      return;
    }

    if (urlSessionId) {
      setSessionId(urlSessionId);
      setRole(urlRole || 'student');
      setCurrentStage('session');
      
      // Seed default placeholders for students scanning in a live session
      setStudentName("Student Candidate");
      setPaperTitle("Oral Defense Presentation");
      setCourseName("Dissertation Review");

      // Generate generic 8 questions as placeholders until peer sync takes over, avoiding empty pages
      const fallbacks: DefenseQuestion[] = Array.from({ length: 8 }, (_, i) => ({
        id: `fall_${i}`,
        num: i + 1,
        questionText: `Draw detailed derivations, structural configurations or algorithmic flowcharts representing core manuscript claims for check #${i + 1}.`,
        focusConcept: `Logical Verification #${i + 1}`
      }));
      setQuestions(fallbacks);
    } else {
      setSessionId(generateSessionId());
    }
  }, []);

  // Broadcast stage changes to dashboard
  const broadcastStage = (stage: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "session_stage_update",
        sessionId,
        role,
        data: { stage },
      }));
    }
  };

  // Establish WebSocket sync channel
  useEffect(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log(`WebSocket connected to defensive room: ${sessionId} as ${role}`);
      // Join room
      socket.send(JSON.stringify({
        type: "join",
        sessionId,
        role,
        data: {}
      }));
      // If student, request a question sync from the instructor after a short delay
      if (role === 'student') {
        setTimeout(() => {
          socket.send(JSON.stringify({ type: "request_sync", sessionId, role, data: {} }));
        }, 1500);
        setTimeout(() => {
          socket.send(JSON.stringify({ type: "request_sync", sessionId, role, data: {} }));
        }, 4000);
        setTimeout(() => {
          socket.send(JSON.stringify({ type: "request_sync", sessionId, role, data: {} }));
        }, 8000);
      }
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === "system_message") {
          console.log("WebSocket Sync Broadcast:", payload.text);
          // If a student just joined and we're the instructor already in session, re-send questions
          if (
            payload.text?.toLowerCase().includes("student joined") &&
            role !== "student" &&
            questionsRef.current.length > 0 &&
            wsRef.current?.readyState === WebSocket.OPEN
          ) {
            setTimeout(() => {
              wsRef.current!.send(JSON.stringify({
                type: "sync_questions",
                sessionId,
                role,
                data: {
                  questions: questionsRef.current,
                  studentName: studentNameRef.current,
                  paperTitle: paperTitleRef.current,
                  courseName: courseNameRef.current,
                },
              }));
            }, 1000);
          }
        } else if (type === "slide_change") {
          setCurrentQuestionIndex(data.idx);
        } else if (type === "sync_whiteboard") {
          const { questionIndex, strokes } = data;
          setAllQuestionStrokes((prev) => {
            const copy = [...prev];
            copy[questionIndex] = strokes;
            return copy;
          });
        } else if (type === "sync_document") {
          const { questionIndex, docState } = data;
          setAllQuestionDocs((prev) => {
            const copy = [...prev];
            copy[questionIndex] = JSON.stringify(docState);
            return copy;
          });
        } else if (type === "tab_change") {
          setActiveWorkspaceTab(data.tab);
        } else if (type === "chat_message_sent" || type === "chat_message_received") {
          setChatHistory((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        } else if (type === "assessment_finalized") {
          setAssessment(data.assessment);
          setCurrentStage("report");
        } else if (type === "sync_questions") {
          // Instructor is broadcasting the real questions -- replace fallbacks
          setQuestions(data.questions);
          if (data.studentName) setStudentName(data.studentName);
          if (data.paperTitle)  setPaperTitle(data.paperTitle);
          if (data.courseName)  setCourseName(data.courseName);
        } else if (type === "request_sync") {
          // Student is requesting questions -- if we're the instructor and have questions, send them
          if (
            role !== "student" &&
            questionsRef.current.length > 0 &&
            wsRef.current?.readyState === WebSocket.OPEN
          ) {
            wsRef.current.send(JSON.stringify({
              type: "sync_questions",
              sessionId,
              role,
              data: {
                questions: questionsRef.current,
                studentName: studentNameRef.current,
                paperTitle: paperTitleRef.current,
                courseName: courseNameRef.current,
              },
            }));
          }
        }
      } catch (err) {
        console.error("Error parsing sync packet:", err);
      }
    };

    socket.onerror = (err) => {
      console.error("WebSocket transport error:", err);
    };

    socket.onclose = () => {
      console.log("WebSocket socket dropped. Ready to retry connection on session refresh.");
    };

    return () => {
      socket.close();
    };
  }, [sessionId, role]);

  // Handle stage 1 setup submit
  const handleSetupComplete = async (name: string, title: string, course: string, text: string, type: string, mode: 'ai' | 'instructor') => {
    setIsLoading(true);
    setStudentName(name);
    setPaperTitle(title);
    setCourseName(course);
    setPastedText(text);
    setActivityType(type);
    setAssessmentMode(mode);

    // Trigger metadata analysis concurrently in background so it does not block question rendering
    setMetadataAnalysis(null);
    setIsAnalyzingMetadata(true);
    fetch("/api/defense/analyze-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: name,
        paperTitle: title,
        courseName: course,
        pastedText: text,
        activityType: type
      })
    })
      .then(async (res) => {
        if (res.ok) {
          const metaResult = await res.json();
          setMetadataAnalysis(metaResult);
        } else {
          console.warn("Metadata analysis server returned non-ok status, fallback estimator will trigger");
        }
      })
      .catch((err) => {
        console.error("Failed fetching metadata report, local fallback logic triggers:", err);
      })
      .finally(() => {
        setIsAnalyzingMetadata(false);
      });

    try {
      const response = await fetch("/api/defense/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: name,
          paperTitle: title,
          courseName: course,
          pastedText: text,
          activityType: type
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Generation query timeout");

      const generated: DefenseQuestion[] = result.questions.map((q: any, idx: number) => ({
        id: `q_${idx}_${Date.now()}`,
        num: q.num || idx + 1,
        questionText: q.questionText,
        focusConcept: q.focusConcept || "Theoretical Proof"
      }));

      setQuestions(generated);

      if (mode === 'ai') {
        // AI mode: skip review, go straight to session and publish questions immediately
        setCurrentStage('session');
        broadcastStage('session');
        await fetch("/api/defense/session-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            questions: generated,
            studentName: name,
            paperTitle: title,
            courseName: course,
          }),
        });
      } else {
        // Instructor mode: show review/diagnostics screen first
        setCurrentStage('review');
      }
    } catch (err: any) {
      alert(`API Error generating questions: ${err.message}. Resilient falling back to standard template questions.`);
      const sampleQs: DefenseQuestion[] = [
        { id: "s1", num: 1, questionText: `Draw the fundamental system block diagram layout comparing your custom pipeline constraints vs typical baselines described in Section 2.`, focusConcept: "Pipeline Constrains" },
        { id: "s2", num: 2, questionText: `Sketch the complete mathematical proof or equation formulation supporting your core hypothesis bounds in Section 3.`, focusConcept: "Hypothesis Bounds" },
        { id: "s3", num: 3, questionText: `Format a state transition map showing how invalid conditions are handled within the central algorithmic loops of your workflow.`, focusConcept: "Algorithmic Loops" },
        { id: "s4", num: 4, questionText: `Plot the dimensional coordinates or feature charts supporting the performance claims outlined in your primary evaluation matrix.`, focusConcept: "Performance Claims" },
        { id: "s5", num: 5, questionText: `Draw the comprehensive logic gate flow or hardware network connections utilized to execute the physical measurements.`, focusConcept: "Network Connections" },
        { id: "s6", num: 6, questionText: `Derived from Section 4, sketch the database schema topology, relational models or indexing strategies applied to store multi-modal nodes.`, focusConcept: "Schema Topology" },
        { id: "s7", num: 7, questionText: `Draft a schematic detailing how data contamination risks or external biases were isolated and controlled across your cohorts.`, focusConcept: "Biases Control" },
        { id: "s8", num: 8, questionText: `Outline the overall lifecycle state machine comparing training loops, validations and testing execution times for model convergence.`, focusConcept: "Model Convergence" }
      ];
      setQuestions(sampleQs);
      setCurrentStage(mode === 'ai' ? 'session' : 'review');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle single question regeneration
  const handleRegenerateQuestion = async (numToRegen: number, notes: string) => {
    setIsRegenerating(true);
    try {
      const response = await fetch("/api/defense/regenerate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperTitle,
          pastedText,
          currentQuestions: questions,
          numToRegen,
          reviewNotes: notes,
          activityType
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Regeneration failed");

      const newQ = result.question;
      setQuestions((prev) =>
        prev.map((q) =>
          q.num === numToRegen
            ? {
                ...q,
                id: `q_regen_${Date.now()}`,
                questionText: newQ.questionText,
                focusConcept: newQ.focusConcept
              }
            : q
        )
      );
    } catch (err: any) {
      alert(`Could not regenerate question: ${err.message}. Making standard analytical edit.`);
      setQuestions((prev) =>
        prev.map((q) =>
          q.num === numToRegen
            ? {
                ...q,
                questionText: `[REFINED] ${q.questionText} (${notes})`,
              }
            : q
        )
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  // Stage 2 confirmed -> Go to live whiteboard
  const handleReviewConfirmed = (confirmedQuestions: DefenseQuestion[]) => {
    setQuestions(confirmedQuestions);
    setCurrentStage('session');
    broadcastStage('session');

    // Broadcast real questions to any student already waiting in the session room
    // Small delay to ensure the WebSocket is in the session stage before sending
    const broadcastQuestions = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "sync_questions",
          sessionId,
          role,
          data: {
            questions: confirmedQuestions,
            studentName,
            paperTitle,
            courseName,
          },
        }));
      }
    };
    // Broadcast twice -- once after 1s, again after 3s to catch late-joining students
    setTimeout(broadcastQuestions, 1000);
    setTimeout(broadcastQuestions, 3000);

    // Also publish to REST store so students can poll regardless of WebSocket timing
    fetch("/api/defense/session-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questions: confirmedQuestions,
        studentName,
        paperTitle,
        courseName,
      }),
    }).catch((err) => console.warn("Failed to publish session questions:", err));
  };

  const handleSaveSnapshot = (idx: number, b64: string, evaluation?: any) => {
    setSnapshots((prev) => {
      const copy = [...prev];
      copy[idx] = b64;
      return copy;
    });
    if (evaluation) {
      setDiagramEvaluations((prev) => {
        const copy = [...prev];
        copy[idx] = evaluation;
        return copy;
      });
    }
    // Send latest snapshot thumbnail to dashboard
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "snapshot_update",
        sessionId,
        role,
        data: { thumbnail: `data:image/png;base64,${b64}` },
      }));
    }
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to dismiss the current scorecard and start a new defense session?")) {
      setStudentName("");
      setPaperTitle("");
      setCourseName("");
      setPastedText("");
      setQuestions([]);
      setAllQuestionStrokes(Array(8).fill([]));
      setSnapshots(Array(8).fill(""));
      setDiagramEvaluations(Array(8).fill(null));
      setChatHistory([]);
      setAssessment(null);
      setSessionId(generateSessionId());
      setCurrentQuestionIndex(0);
      setRole('both');
      setCurrentStage('setup');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col font-sans antialiased text-[#E0E0E0]">

      {/* Skip to main content -- required WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-bold"
      >
        Skip to main content
      </a>

      {/* ARIA live region for status announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" id="status-announcer" />

      {/* Platform Navigation bar Header */}
      <header className="border-b border-white/10 pb-6 pt-6" role="banner">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-[0.3em] text-white/40 font-semibold mb-1">
              Whiteboard Defense Assistant
            </span>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-serif italic text-white/90">
                {studentName ? `Defense Session: ${studentName}` : "New Defense Session"}
              </h1>
              <span className="px-2.5 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 rounded-full text-xs tracking-wider uppercase font-bold">
                <span aria-hidden="true">&#11044;</span> Live Session
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 items-center">
            {sessionId && (
              <div className="flex flex-col items-start md:items-end">
                <span className="text-[10px] uppercase text-[#E0E0E0]/30 tracking-widest font-medium">Session ID</span>
                <span className="font-mono text-base text-white/80 tracking-tighter">{sessionId}</span>
              </div>
            )}
            {paperTitle && (
              <>
                <div className="hidden sm:block h-10 w-[1px] bg-white/10"></div>
                <div className="flex flex-col items-start md:items-end max-w-[200px]">
                  <span className="text-[10px] uppercase text-[#E0E0E0]/30 tracking-widest font-medium">Paper</span>
                  <span className="text-xs text-white/70 italic truncate block w-full" title={paperTitle}>
                    {paperTitle}
                  </span>
                </div>
              </>
            )}
            <div className="h-10 w-[1px] bg-white/10"></div>
            
            {/* Context Workspace Role Selector -- only shown during setup/review, hidden during live session */}
            {role !== 'student' && ['setup', 'review', 'dashboard'].includes(currentStage) ? (
              <div className="flex items-center bg-white/5 p-1 border border-white/10 rounded-lg">
                <label htmlFor="role-switch-selector" className="sr-only">View mode</label>
                <select
                  id="role-switch-selector"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value as 'both' | 'student' | 'instructor');
                  }}
                  className="bg-transparent border-none rounded text-sm text-[#E0E0E0] outline-none p-1 font-mono uppercase focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="both" className="bg-[#111] text-[#E0E0E0]">Combined View</option>
                  <option value="student" className="bg-[#111] text-[#E0E0E0]">Student View</option>
                  <option value="instructor" className="bg-[#111] text-[#E0E0E0]">Instructor View</option>
                </select>
              </div>
            ) : role === 'student' ? (
              <div className="flex items-center bg-white/5 px-3 py-2 border border-white/10 rounded-lg" role="status">
                <span className="text-sm uppercase text-white/40 tracking-widest font-mono">Student View</span>
              </div>
            ) : null}
            {/* Dashboard button -- only in instructor view, not during live session */}
            {role === 'instructor' && ['setup', 'review', 'dashboard'].includes(currentStage) && (
              <button
                type="button"
                onClick={() => setCurrentStage('dashboard')}
                aria-label="Go to instructor dashboard"
                className="flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white px-4 py-2 rounded-lg text-sm font-mono uppercase tracking-wider transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <Monitor className="w-4 h-4" aria-hidden="true" /> Dashboard
              </button>
            )}
          </div>
        </div>

        {/* Stepper tracker sub-rail */}
        <nav aria-label="Defense session phases" className="max-w-7xl mx-auto px-6 mt-4 flex items-center gap-2 overflow-x-auto py-1">
          <span className="text-xs uppercase tracking-widest text-[#E0E0E0]/30 mr-2" aria-hidden="true">Phase:</span>
          {[
            { key: 'setup',    label: '1. Ingest' },
            { key: 'review',   label: '2. Review' },
            { key: 'session',  label: '3. Live Board' },
            { key: 'followup', label: assessmentMode === 'ai' ? '4. AI Inquiry' : '4. Oral Examination' },
            { key: 'report',   label: '5. Final Evaluation' },
          ].map((phase, i, arr) => (
            <React.Fragment key={phase.key}>
              <span
                aria-current={currentStage === phase.key ? 'step' : undefined}
                className={`p-2 px-3 rounded-md text-sm border font-mono transition duration-200 ${
                  currentStage === phase.key
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 ring-1 ring-indigo-500/20'
                    : 'border-white/5 bg-transparent text-[#E0E0E0]/40'
                }`}
              >
                {phase.label}
              </span>
              {i < arr.length - 1 && (
                <span className="text-white/20 text-sm font-mono" aria-hidden="true">/</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      </header>

      {/* Primary body view switcher container */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8" role="main">
        
        {/* Dynamic stage route router mapping */}
        {currentStage === 'dashboard' && (
          <InstructorDashboard
            wsRef={wsRef}
            appUrl={window.location.origin}
            onNewSession={() => {
              // Full reset with a fresh session ID so new session doesn't collide with previous
              const newId = generateSessionId();
              setStudentName("");
              setPaperTitle("");
              setCourseName("");
              setPastedText("");
              setQuestions([]);
              setAllQuestionStrokes(Array(8).fill([]));
              setSnapshots(Array(8).fill(""));
              setDiagramEvaluations(Array(8).fill(null));
              setChatHistory([]);
              setAssessment(null);
              setSessionId(newId);
              setCurrentQuestionIndex(0);
              setActiveWorkspaceTab('diagram');
              setRole('both'); // always reset to combined view for new session
              setCurrentStage('setup');
              console.log(`[WhiteboardDefense] New session started: ${newId}`);
            }}
          />
        )}

        {currentStage === 'setup' && (
          <SetupForm 
            onSetupComplete={handleSetupComplete} 
            isLoading={isLoading} 
            assessmentMode={assessmentMode}
            setAssessmentMode={setAssessmentMode}
          />
        )}

        {currentStage === 'review' && (
          <ReviewQuestions
            questions={questions}
            paperTitle={paperTitle}
            pastedText={pastedText}
            studentName={studentName}
            courseName={courseName}
            onQuestionsConfirmed={handleReviewConfirmed}
            onRegenerateSingle={handleRegenerateQuestion}
            isRegenerating={isRegenerating}
            activityType={activityType}
            metadataAnalysis={metadataAnalysis}
            isAnalyzingMetadata={isAnalyzingMetadata}
          />
        )}

        {currentStage === 'session' && (
          <DefenseSession
            sessionId={sessionId}
            role={role}
            currentQuestionIndex={currentQuestionIndex}
            onQuestionIndexChange={setCurrentQuestionIndex}
            questions={questions}
            allStrokes={allQuestionStrokes}
            onStrokesChange={(idx, strokes) => {
              setAllQuestionStrokes((prev) => {
                const copy = [...prev];
                copy[idx] = strokes;
                return copy;
              });
            }}
            allDocs={allQuestionDocs}
            onDocChange={(idx, doc) => {
              setAllQuestionDocs((prev) => {
                const copy = [...prev];
                copy[idx] = doc;
                return copy;
              });
            }}
            activeTab={activeWorkspaceTab}
            onActiveTabChange={setActiveWorkspaceTab}
            onSaveSnapshot={handleSaveSnapshot}
            snapshots={snapshots}
            wsRef={wsRef}
            onProgressToChat={() => setCurrentStage('followup')}
            onBackToDashboard={() => setCurrentStage('dashboard')}
          />
        )}

        {currentStage === 'followup' && (
          <FollowUpChat
            sessionId={sessionId}
            role={role}
            studentName={studentName}
            paperTitle={paperTitle}
            courseName={courseName}
            pastedText={pastedText}
            chatHistory={chatHistory}
            onAddChatMessage={(msg) => setChatHistory((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            })}
            snapshots={snapshots}
            onDefenseCompleted={(gradedAssessment) => {
              setAssessment(gradedAssessment);
              setCurrentStage('report');
            }}
            wsRef={wsRef}
            activityType={activityType}
            assessmentMode={assessmentMode}
            questions={questions}
            currentQuestionIndex={currentQuestionIndex}
          />
        )}

        {currentStage === 'report' && assessment && (
          <ReportViewer
            studentName={studentName}
            paperTitle={paperTitle}
            courseName={courseName}
            chatHistory={chatHistory}
            assessment={assessment}
            snapshots={snapshots}
            diagramEvaluations={diagramEvaluations}
            onResetSession={handleReset}
            activityType={activityType}
          />
        )}
      </main>

      {/* Global Academic footer */}
      <footer className="bg-black py-8 text-center border-t border-white/10 text-[11px] font-mono text-white/30">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="tracking-widest uppercase text-[10px]">?? Whiteboard Integrity Verification Protocol v1.4.2</span>
          <span>2026 University Academic Honor Integrity Board. Powered by Whiteboard Defense.</span>
        </div>
      </footer>
    </div>
  );
}
