import React, { useState, useEffect, useRef } from "react";
import { StudentMetadata, DefenseQuestion, DrawingStroke, ChatMessage, AIPreparedAssessment } from "./types";
import SetupForm from "./components/SetupForm";
import ReviewQuestions from "./components/ReviewQuestions";
import DefenseSession from "./components/DefenseSession";
import FollowUpChat from "./components/FollowUpChat";
import ReportViewer from "./components/ReportViewer";
import { FileEdit, Sparkles, Monitor, AppWindow, UserCheck, ShieldAlert } from "lucide-react";

export default function App() {
  const [currentStage, setCurrentStage] = useState<'setup' | 'review' | 'session' | 'followup' | 'report'>('setup');
  
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
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'draw' | 'text'>('draw');
  const [snapshots, setSnapshots] = useState<string[]>(Array(8).fill(""));

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

  // Generate unique session ID
  const generateSessionId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Initialize and handle Route parameters for tablet scan-in
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const urlSessionId = queryParams.get("sessionId");
    const urlRole = queryParams.get("role") as 'student' | 'instructor' | 'both' | null;

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
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === "system_message") {
          console.log("WebSocket Sync Broadcast:", data);
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
      setCurrentStage('review');
    } catch (err: any) {
      alert(`API Error generating questions: ${err.message}. Resilient falling back to standard template questions.`);
      // Generate standard sample questions to guarantee usability if key is missing or invalid
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
      setCurrentStage('review');
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
  };

  const handleSaveSnapshot = (idx: number, b64: string) => {
    setSnapshots((prev) => {
      const copy = [...prev];
      copy[idx] = b64;
      return copy;
    });
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
      setChatHistory([]);
      setAssessment(null);
      setSessionId(generateSessionId());
      setCurrentQuestionIndex(0);
      setCurrentStage('setup');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col font-sans antialiased text-[#E0E0E0]">
      
      {/* Platform Navigation bar Header */}
      <header className="border-b border-white/10 pb-6 pt-6">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-semibold mb-1">
              Whiteboard Defense Assistant
            </span>
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-serif italic text-white/90">
                {studentName ? `Defense Session: ${studentName}` : "New Defense Session"}
              </h2>
              <span className="px-2.5 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 rounded-full text-[10px] tracking-wider uppercase font-bold">
                Live Session
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
            
            {/* Context Workspace Role Selector */}
            <div className="flex items-center bg-white/5 p-1 border border-white/10 rounded-lg text-xs">
              <span className="text-[10px] uppercase text-white/40 tracking-widest font-medium hidden sm:inline mr-2 ml-1">Sim:</span>
              <select
                id="role-switch-selector"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as 'both' | 'student' | 'instructor');
                }}
                className="bg-transparent border-none rounded text-[11px] text-[#E0E0E0] outline-none p-1 font-mono uppercase focus:ring-0 cursor-pointer"
              >
                <option value="both" className="bg-[#111] text-[#E0E0E0]">Combined View</option>
                <option value="student" className="bg-[#111] text-[#E0E0E0]">Student View</option>
                <option value="instructor" className="bg-[#111] text-[#E0E0E0]">Instructor View</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stepper tracker sub-rail */}
        <div className="max-w-7xl mx-auto px-6 mt-4 flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar">
          <span className="text-[10px] uppercase tracking-widest text-[#E0E0E0]/30 mr-2">Phase:</span>
          <span className={`p-1 px-3 rounded-md text-[10px] uppercase tracking-wider border font-mono transition duration-200 ${currentStage === 'setup' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 ring-1 ring-indigo-500/20' : 'border-white/5 bg-transparent text-[#E0E0E0]/40'}`}>
            1. Ingest
          </span>
          <span className="text-white/20 text-xs font-mono">/</span>
          <span className={`p-1 px-3 rounded-md text-[10px] uppercase tracking-wider border font-mono transition duration-200 ${currentStage === 'review' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 ring-1 ring-indigo-500/20' : 'border-white/5 bg-transparent text-[#E0E0E0]/40'}`}>
            2. Review
          </span>
          <span className="text-white/20 text-xs font-mono">/</span>
          <span className={`p-1 px-3 rounded-md text-[10px] uppercase tracking-wider border font-mono transition duration-200 ${currentStage === 'session' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 ring-1 ring-indigo-500/20' : 'border-white/5 bg-transparent text-[#E0E0E0]/40'}`}>
            3. Live Board
          </span>
          <span className="text-white/20 text-xs font-mono">/</span>
          <span className={`p-1 px-3 rounded-md text-[10px] uppercase tracking-wider border font-mono transition duration-200 ${currentStage === 'followup' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 ring-1 ring-indigo-500/20' : 'border-white/5 bg-transparent text-[#E0E0E0]/40'}`}>
            {assessmentMode === 'ai' ? '4. AI Inquiry' : '4. Oral Examination'}
          </span>
          <span className="text-white/20 text-xs font-mono">/</span>
          <span className={`p-1 px-3 rounded-md text-[10px] uppercase tracking-wider border font-mono transition duration-200 ${currentStage === 'report' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 ring-1 ring-indigo-500/20' : 'border-white/5 bg-transparent text-[#E0E0E0]/40'}`}>
            5. final evaluation
          </span>
        </div>
      </header>

      {/* Primary body view switcher container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        
        {/* Dynamic stage route router mapping */}
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
            onResetSession={handleReset}
            activityType={activityType}
          />
        )}
      </main>

      {/* Global Academic footer */}
      <footer className="bg-black py-8 text-center border-t border-white/10 text-[11px] font-mono text-white/30">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="tracking-widest uppercase text-[10px]">🛡️ Whiteboard Integrity Verification Protocol v1.4.2</span>
          <span>© 2026 University Academic Honor Integrity Board. Powered by Gemini Core.</span>
        </div>
      </footer>
    </div>
  );
}
