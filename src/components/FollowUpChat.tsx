import { AlertTriangle, ChevronRight, Cpu, Mic, MicOff, Send, Sparkles, User } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { AIPreparedAssessment, ChatMessage, DefenseQuestion } from "../types";
import { toSafePngDataUrl } from "../utils/dataUrl";

interface FollowUpChatProps {
  sessionId: string;
  role: "student" | "instructor" | "both";
  studentName: string;
  paperTitle: string;
  courseName: string;
  pastedText: string;
  chatHistory: ChatMessage[];
  onAddChatMessage: (msg: ChatMessage) => void;
  snapshots: string[]; // base64 imagess indices 0-7
  onDefenseCompleted: (finalAssessment: AIPreparedAssessment) => void;
  wsRef: React.MutableRefObject<WebSocket | null>;
  activityType?: string;
  assessmentMode?: "ai" | "instructor";
  questions?: DefenseQuestion[];
  currentQuestionIndex?: number;
}

export default function FollowUpChat({
  sessionId,
  role,
  studentName,
  paperTitle,
  courseName,
  pastedText,
  chatHistory,
  onAddChatMessage,
  snapshots,
  onDefenseCompleted,
  wsRef,
  activityType,
  assessmentMode = "ai",
  questions = [],
  currentQuestionIndex = 0,
}: FollowUpChatProps) {
  const [inputText, setInputText] = useState("");
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sendAs, setSendAs] = useState<'student' | 'instructor'>(role === "instructor" ? "instructor" : "student");
  const [studentTurnCount, setStudentTurnCount] = useState(0);
  const MAX_TURNS = 10; // 5 questions x 2 turns each (initial + follow-up)

  // Grading scorecard states for Instructor
  const [showGradingPanel, setShowGradingPanel] = useState(false);
  const [tempOverallScore, setTempOverallScore] = useState(85);
  const [tempSuspicionLevel, setTempSuspicionLevel] = useState<'Low' | 'Medium' | 'High'>('Low');
  const [tempSuspicionReasoning, setTempSuspicionReasoning] = useState("Explanations and whiteboard annotations match core competencies.");
  const [tempRecommendedGrade, setTempRecommendedGrade] = useState("A-");
  const [tempMasteryScore, setTempMasteryScore] = useState(8);
  const [tempMasteryFeedback, setTempMasteryFeedback] = useState("Excellent familiarity with central subject matter and core arguments.");
  const [tempSynthesisScore, setTempSynthesisScore] = useState(8);
  const [tempSynthesisFeedback, setTempSynthesisFeedback] = useState("Diagrams were clearly labeled and correlated properly during verbal probes.");
  const [tempIntegrityScore, setTempIntegrityScore] = useState(9);
  const [tempIntegrityFeedback, setTempIntegrityFeedback] = useState("Direct, responsive answers with zero indication of unauthorized external help.");
  const [tempFindings, setTempFindings] = useState("Strong visual defense of fundamental concepts.");
  const [tempGaps, setTempGaps] = useState("Could slightly refine formal mathematical definitions in edge scenarios.");

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const hasInitializedRef = useRef(false);

  // Sync role changes to sendAs to maintain consistency
  useEffect(() => {
    setSendAs(role === "instructor" ? "instructor" : "student");
  }, [role]);

  // Sync scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isAiResponding]);

  // Setup Web Speech API for voice comments
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const resultText = event.results[0][0].transcript;
        if (resultText) {
          setInputText((prev) => (prev ? `${prev} ${resultText}` : resultText));
        }
      };

      rec.onerror = (err: any) => {
        console.error("Speech recognition error:", err);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }

    // Trigger initial AI question if chat is entirely empty
    if (chatHistory.length === 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      if (assessmentMode === "ai") {
        triggerAiTurn(true); // First initialization call
      } else {
        // Instructor Mode: add dynamic system instruction message
        const welcomeMsg: ChatMessage = {
          id: "sys_welcome",
          sender: "system",
          text: "Oral examination started in Instructor-Led Mode. The instructor should write their custom follow-up questions or statement in the input field to begin.",
          timestamp: new Date().toISOString()
        };
        onAddChatMessage(welcomeMsg);
        notifyPeerStateChange("chat_message_received", { message: welcomeMsg });
      }
    }
  }, []);

  // Sync incoming WebSocket messages for the chat in multi-user settings
  useEffect(() => {
    const chatChan = new BroadcastChannel(`chat_sync_${sessionId}`);
    chatChan.onmessage = (event) => {
      const { type, message } = event.data;
      if (type === "chat_message_received") {
        onAddChatMessage(message);
      } else if (type === "ai_state_change") {
        setIsAiResponding(event.data.state);
      } else if (type === "assessment_finalized") {
        onDefenseCompleted(event.data.assessment);
      }
    };

    return () => {
      chatChan.close();
    };
  }, [sessionId, onAddChatMessage, onDefenseCompleted]);

  const toggleSpeech = () => {
    if (!recognitionRef.current) {
      alert("Web Speech transcriptions are not fully supported on this browser version. Copy-paste standard text inputs.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const notifyPeerStateChange = (type: string, data: any) => {
    // Sync using WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type,
        sessionId,
        role,
        data
      }));
    }

    // Double redundancy same-device tabs sync
    const chatChan = new BroadcastChannel(`chat_sync_${sessionId}`);
    chatChan.postMessage({ type, ...data });
    chatChan.close();
  };

  // Student or Instructor makes comment
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isAiResponding) return;

    // Determine the sender role
    const msgSender = role === "both" ? sendAs : (role === "instructor" ? "instructor" : "student");

    if (assessmentMode === "ai" && msgSender === "instructor") {
      alert("This session is running in AI-Managed Mode. Switch role to student candidate to type answers, or switch the assessment mode.");
      return;
    }

    // AI-assisted response pattern detector -- conservative, only genuine artifacts
    const aiPatternFlags: string[] = [];
    const txt = inputText.trim();
    if ((txt.match(/\+[-=]{3,}\+/g) || []).length >= 1 && (txt.match(/\|/g) || []).length >= 4) aiPatternFlags.push("ASCII box-diagram detected");
    if (/\b(great question|i'd be happy to (explain|help)|let me break (this|that) down for you|as an ai)\b/i.test(txt)) aiPatternFlags.push("AI assistant phrasing");

    if (aiPatternFlags.length >= 1) {
      const flagList = aiPatternFlags.join(", ");
      const proceed = window.confirm(
        `Warning: This response shows patterns consistent with AI-generated content (${flagList}).\n\nAre you sure you want to submit this answer? The system will flag it for integrity review.`
      );
      if (!proceed) return;
    }

    // Paste-back detection: check if student submitted the AI's last question verbatim
    const lastAiMsg = chatHistory.filter(m => m.sender === "ai").slice(-1)[0];
    if (lastAiMsg && inputText.trim().length > 20) {
      const similarity = inputText.trim().toLowerCase().slice(0, 80);
      const aiText = lastAiMsg.text.toLowerCase().slice(0, 80);
      if (similarity === aiText) {
        alert("It looks like you pasted the question instead of your answer. Please type your response.");
        return;
      }
    }

    // Create message chunk
    const newMsg: ChatMessage = {
      id: `${msgSender}_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sender: msgSender,
      text: inputText.trim(),
      timestamp: new Date().toISOString()
    };

    onAddChatMessage(newMsg);
    setInputText("");

    // Broadcast comment
    notifyPeerStateChange("chat_message_sent", { message: newMsg });

    // Initiate AI reply ONLY if we are in AI mode AND the comment came from a student
    if (assessmentMode === "ai" && msgSender === "student") {
      const newCount = studentTurnCount + 1;
      setStudentTurnCount(newCount);
      if (newCount >= MAX_TURNS) {
        // Auto-conclude: student has reached the turn limit
        const limitMsg: ChatMessage = {
          id: `sys_limit_${Date.now()}`,
          sender: "system",
          text: `Defense exchange complete (${MAX_TURNS} responses recorded). Generating your final assessment now...`,
          timestamp: new Date().toISOString()
        };
        onAddChatMessage(limitMsg);
        notifyPeerStateChange("chat_message_received", { message: limitMsg });
        await handleConcludeDefense();
      } else {
        await triggerAiTurn(false, [...chatHistory, newMsg], newCount);
      }
    }
  };

  const triggerAiTurn = async (isFirst: boolean = false, activeHistory: ChatMessage[] = chatHistory, currentTurn: number = studentTurnCount) => {
    setIsAiResponding(true);
    notifyPeerStateChange("ai_state_change", { state: true });

    const isNearEnd = currentTurn >= MAX_TURNS - 2;

    let fetchPromptBody = {
      chatHistory: isFirst
        ? [{ sender: "system", text: "Commence defense questions.", timestamp: new Date().toISOString() }]
        : activeHistory,
      snapshots: snapshots,
      studentName,
      paperTitle,
      courseName,
      questions,
      pastedText,
      conclude: false,
      activityType,
      turnCount: currentTurn,
      maxTurns: MAX_TURNS,
      isNearEnd,
      currentQuestionIndex,
    };

    try {
      const response = await fetch("/api/defense/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fetchPromptBody)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Probing proxy failed");

      const aiMsg: ChatMessage = {
        id: `ai_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: "ai",
        text: result.text,
        timestamp: new Date().toISOString()
      };

      onAddChatMessage(aiMsg);
      notifyPeerStateChange("chat_message_received", { message: aiMsg });
    } catch (err: any) {
      console.error(err);
      const errMsg: ChatMessage = {
        id: `sys_err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: "system",
        text: `Error contacting the defense platform: ${err.message || "Unspecified connection timeout"}`,
        timestamp: new Date().toISOString()
      };
      onAddChatMessage(errMsg);
    } finally {
      setIsAiResponding(false);
      notifyPeerStateChange("ai_state_change", { state: false });
    }
  };

  // Instructor or student concludes defense and extracts JSON from XML tags
  const handleConcludeDefense = async () => {
    if (assessmentMode === "instructor") {
      // In Instructor mode, show a beautiful manual scorecard builder instead of AI parsing
      setShowGradingPanel(true);
      return;
    }

    setIsAiResponding(true);
    notifyPeerStateChange("ai_state_change", { state: true });

    try {
      const response = await fetch("/api/defense/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatHistory: chatHistory,
          snapshots: snapshots,
          studentName,
          paperTitle,
          courseName,
          questions,
          pastedText,
          conclude: true,
          activityType,
          currentQuestionIndex,
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Conclude calculation failed");

      const finalOutput = result.text || "";

      // Add final AI wrap-up message to transcript
      // We can clean any raw json from output before showing, but displaying is also helpful
      const trimmedText = finalOutput.replace(/<assessment>[\s\S]*?<\/assessment>/, "").trim();
      const aiFinalMsg: ChatMessage = {
        id: `ai_conclude_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sender: "ai",
        text: trimmedText || "Defense concluded. Generating scoring metrics report...",
        timestamp: new Date().toISOString()
      };
      onAddChatMessage(aiFinalMsg);
      notifyPeerStateChange("chat_message_received", { message: aiFinalMsg });

      // Parsing matches with high robustness for markdown, trailing commas, and inline comments
      const match = finalOutput.match(/<assessment>([\s\S]*?)<\/assessment>/);
      if (match) {
        try {
          let jsonText = match[1].trim();

          // Strip markdown code fences if present (e.g., ```json or ```)
          if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```[a-zA-Z]*\s*/, "");
            jsonText = jsonText.replace(/\s*```$/, "");
          }
          jsonText = jsonText.trim();

          // Strip single-line comments like // ...
          jsonText = jsonText.replace(/\/\/.*$/gm, "");

          // Strip trailing commas from objects or arrays (e.g., {a: 1,} -> {a: 1})
          jsonText = jsonText.replace(/,(\s*[\]}])/g, "$1");

          const assessment: AIPreparedAssessment = JSON.parse(jsonText);

          // Hard server-independent completion-rate enforcement: prevent inflated scores
          // AND inflated grades when most questions were never answered, regardless of
          // what the AI returned. These two checks are independent -- a low score doesn't
          // guarantee the AI also chose an appropriately low grade.
          const totalQ = questions?.length || 8;
          const answeredCount = (snapshots || []).filter((s) => s && s.trim().length > 0).length;
          const completionRatio = totalQ > 0 ? answeredCount / totalQ : 1;
          const maxAllowedScore = Math.round(completionRatio * 100 + 10); // small partial-credit allowance

          if (typeof assessment.overallScore === "number" && assessment.overallScore > maxAllowedScore) {
            console.warn(`Capping inflated score ${assessment.overallScore} -> ${maxAllowedScore} (only ${answeredCount}/${totalQ} questions answered)`);
            assessment.overallScore = maxAllowedScore;
          }

          // Grade enforcement runs independently -- always check completion ratio,
          // not just when the score itself needed capping.
          if (completionRatio < 0.25) {
            assessment.recommendedGrade = "F";
          } else if (completionRatio < 0.5) {
            assessment.recommendedGrade = "C-";
          }

          onDefenseCompleted(assessment);
          notifyPeerStateChange("assessment_finalized", { assessment });
        } catch (jsonErr) {
          console.error("Error parsing assessment JSON from AI output:", jsonErr);
          alert("A validation error occurred parsing assessment tags. Loading default assessment.");
          triggerFallbackAssessment();
        }
      } else {
        triggerFallbackAssessment();
      }
    } catch (err: any) {
      alert(`Evaluation error: ${err.message}`);
    } finally {
      setIsAiResponding(false);
      notifyPeerStateChange("ai_state_change", { state: false });
    }
  };

  const triggerFallbackAssessment = () => {
    const fallback: AIPreparedAssessment = {
      overallScore: 80,
      suspicionLevel: "Low",
      suspicionReasoning: "Assessment could not be auto-generated. Please use the scoring form to enter results manually.",
      categories: [
        { name: "Technical Subject Mastery", score: 8, feedback: "Please review transcript and enter score manually." },
        { name: "Visual Whiteboard Synthesis", score: 8, feedback: "Please review snapshots and enter score manually." },
        { name: "Integrity & Originality Verification", score: 8, feedback: "Please review responses and enter score manually." }
      ],
      keyFindings: ["Manual review required -- auto-assessment was unavailable."],
      gapsIdentified: ["Please review the transcript and enter gaps manually."],
      recommendedGrade: "B"
    };
    onDefenseCompleted(fallback);
    notifyPeerStateChange("assessment_finalized", { assessment: fallback });
  };

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

      {/* Visual Canvas Snapshots referenced */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-[#111] rounded-2xl border border-white/5 p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase text-white/40 tracking-wider flex items-center gap-1.5 font-mono">
            <Cpu className="w-4 h-4 text-indigo-400" /> Evidence Library
          </h3>
          <p className="text-[11px] text-white/50 leading-relaxed">
            These whiteboard snapshots are fed directly to the AI as images to compare the spoken answers against the diagrammatic formulations.
          </p>

          <div className="grid grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
            {snapshots.map((snap, idx) => {
              if (!snap) return null;
              return (
                <div key={idx} className="bg-black border border-white/10 rounded-lg p-1.5 shadow-sm text-left">
                  <div className="aspect-[4/3] bg-[#141414] rounded-md overflow-hidden border border-white/5 flex items-center justify-center relative">
                    <img
                      src={toSafePngDataUrl(snap)}
                      alt={`Snapshot Question ${idx + 1}`}
                      className="object-contain w-full h-full"
                    />
                    <span className="absolute bottom-1 right-1 text-[8px] bg-black/95 border border-white/20 text-indigo-300 p-0.5 px-1.5 rounded font-mono font-bold">
                      Q {idx + 1}
                    </span>
                  </div>
                  <span className="text-[10px] text-white/40 font-mono mt-1 block truncate">
                    Saved Derivation
                  </span>
                </div>
              );
            })}
            {snapshots.filter(Boolean).length === 0 && (
              <div className="col-span-2 text-center py-10 text-xs text-white/40 font-mono bg-black rounded-lg border border-dashed border-white/10">
                No canvas snapshots found. Ensure drawings are saved in Stage 3.
              </div>
            )}
          </div>
        </div>

        {/* Action Call for Chair/Observer or Student */}
        <div className="bg-gradient-to-br from-[#12121e] to-[#0d0d12] border border-indigo-500/10 text-white rounded-2xl p-5 space-y-4 shadow-md text-left">
          <h4 className="text-xs font-bold font-mono text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> {role === "student" ? "Finish Examination" : "Defense Chair Controls"}
          </h4>
          <p className="text-xs text-white/50 leading-relaxed font-sans">
            {role === "student"
              ? "Completed your responses? Click below to submit all your whiteboard diagrams to the committee to lock details and calculate results."
              : "When you have completed testing, click below to conclude candidate inquiry. The model will run a multimodal integrity diagnostic and trigger the Final Scorecard."}
          </p>
          <button
            type="button"
            id="conclude-defense-panel-btn"
            onClick={handleConcludeDefense}
            disabled={isAiResponding}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            {role === "student" ? "Submit Drawings & Conclude" : "Conclude Defense & Grade"} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Probing Chat Container */}
      <div className="lg:col-span-8 flex flex-col h-[650px] bg-[#111] rounded-2xl shadow-xl border border-white/5 overflow-hidden">
        {/* Chat Box Header */}
        <div className="bg-black px-6 py-4 text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs animate-pulse font-mono">
              AI
            </div>
            <div>
              <h2 className="text-sm font-bold font-sans">Inquiry Follow-up Interview</h2>
              <p className="text-[11px] text-white/50">
                Evaluating candidate: <span className="text-indigo-400 font-medium">{studentName || "Richard Feynman"}</span>
              </p>
            </div>
          </div>
          <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono font-bold">
            Active session: {sessionId}
          </span>
          <span className="text-[9px] bg-white/5 text-white/40 border border-white/10 px-2 py-0.5 rounded-full font-mono font-bold">
            {studentTurnCount} / {MAX_TURNS} responses
          </span>
          {role !== "student" && (
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/?sessionId=${sessionId}&role=student`;
                if (navigator.clipboard && window.isSecureContext) {
                  navigator.clipboard.writeText(url).then(() => alert("Student link copied!"));
                } else {
                  const el = document.createElement("textarea");
                  el.value = url;
                  el.style.position = "fixed";
                  el.style.opacity = "0";
                  document.body.appendChild(el);
                  el.focus(); el.select();
                  try { document.execCommand("copy"); alert("Student link copied!"); }
                  catch { alert("Copy manually:\n\n" + url); }
                  document.body.removeChild(el);
                }
              }}
              className="text-[9px] bg-white/5 text-white/40 border border-white/10 hover:text-indigo-400 hover:border-indigo-500/30 px-2 py-0.5 rounded-full font-mono font-bold transition"
            >
              Copy Student Link
            </button>
          )}
        </div>

        {/* Message body transcript scrolls */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-black/10 custom-scrollbar">
          {chatHistory.map((msg) => {
            const isStudent = msg.sender === "student";
            const isSystem = msg.sender === "system";
            const isInstructor = msg.sender === "instructor";

            if (isSystem) {
              return (
                <div key={msg.id} className="text-center">
                  <span className="inline-block text-[10px] font-mono text-[#E0E0E0]/60 bg-white/5 p-1 px-3 rounded border border-white/10">
                    ?? {msg.text}
                  </span>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex items-start gap-3 ${isStudent ? "justify-end" : "justify-start"}`}>
                {!isStudent && (
                  <div className={`w-8 h-8 rounded text-[9px] flex items-center justify-center font-bold uppercase shrink-0 ${isInstructor
                    ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 font-mono"
                    : "bg-white/5 border border-white/10 text-indigo-400 font-mono"
                    }`}>
                    {isInstructor ? "Chr" : "AI"}
                  </div>
                )}
                <div className={`p-4 rounded-xl max-w-[85%] text-left whitespace-pre-line text-xs relative ${isStudent
                  ? "bg-[#1d1d2c] border border-indigo-500/30 text-white rounded-tr-none shadow-indigo-950/20"
                  : isInstructor
                    ? "bg-[#0c1612] border border-emerald-500/20 text-white/90 rounded-tl-none shadow-sm"
                    : "bg-[#161616] border border-white/5 text-white/90 rounded-tl-none shadow-sm"
                  }`}>
                  <span className={`text-[9px] block mb-1 font-bold font-mono tracking-wide ${isStudent ? "text-indigo-300" : isInstructor ? "text-emerald-400" : "text-white/40"
                    }`}>
                    {isStudent ? (studentName || "Student Candidate") : isInstructor ? "Defense Chair (Instructor)" : "Assessor Committee (AI)"}
                  </span>
                  <div className="leading-relaxed font-sans">{msg.text}</div>
                </div>
                {isStudent && (
                  <div className="w-8 h-8 rounded bg-indigo-900/25 border border-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-[9px] uppercase shrink-0">
                    Stud
                  </div>
                )}
              </div>
            );
          })}

          {isAiResponding && (
            <div className="flex items-start gap-3 justify-start animate-pulse">
              <div className="w-8 h-8 rounded bg-white/5 border border-white/10 text-indigo-400 font-mono text-[9px] flex items-center justify-center font-bold uppercase shrink-0">
                Cmte
              </div>
              <div className="p-4 bg-[#161616] border border-white/5 text-white/40 rounded-xl rounded-tl-none text-[11px] flex items-center gap-2">
                <div className="flex gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
                Examiner is compiling visual whiteboard elements & drafting question...
              </div>
            </div>
          )}
        </div>

        {/* Input form */}
        {(role !== "instructor" || assessmentMode === "instructor") ? (
          <form onSubmit={handleSendMessage} className="bg-[#141414] border-t border-white/10 p-4 space-y-2">
            {role === "both" && assessmentMode === "instructor" && (
              <div className="flex gap-2 pb-1.5 border-b border-white/5 mb-1.5">
                <span className="text-[10px] uppercase font-mono tracking-wider text-white/40 flex items-center mr-1">Sender:</span>
                <button
                  type="button"
                  onClick={() => setSendAs("student")}
                  className={`px-2.5 py-1 text-[9px] font-bold font-mono uppercase tracking-wide rounded transition cursor-pointer ${sendAs === "student"
                    ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-400"
                    : "bg-[#1d1d1d] border border-white/5 text-[#A0A0A0] hover:bg-[#2a2a2a] hover:text-white"
                    }`}
                >
                  ? Student Candidate
                </button>
                <button
                  type="button"
                  onClick={() => setSendAs("instructor")}
                  className={`px-2.5 py-1 text-[9px] font-bold font-mono uppercase tracking-wide rounded transition cursor-pointer ${sendAs === "instructor"
                    ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
                    : "bg-[#1d1d1d] border border-white/5 text-[#A0A0A0] hover:bg-[#2a2a2a] hover:text-white"
                    }`}
                >
                  ? Panel Chair (Instructor)
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="mic-record-speech-button"
                onClick={toggleSpeech}
                className={`p-3 rounded-xl border transition cursor-pointer ${isListening
                  ? "bg-red-950/30 border-red-500/40 text-red-400 animate-pulse"
                  : "bg-[#1d1d1d] border-white/10 text-white/60 hover:text-white"
                  }`}
                title="Oral voice dictation (Click to Speak)"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <input
                type="text"
                id="followup-chat-textbox"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  isListening
                    ? "Listening... Speak clearly"
                    : role === "instructor"
                      ? "Type follow-up probing instructions or questions to send candidate..."
                      : "Answer follow-up, refer to your whiteboard drawings..."
                }
                disabled={isAiResponding}
                className="flex-1 bg-black border border-white/10 rounded-xl p-3 px-4 text-sm outline-none focus:border-indigo-500 focus:bg-[#1a1a1a] transition text-white placeholder-white/30 disabled:opacity-50"
              />
              <button
                type="submit"
                id="followup-chat-send-btn"
                disabled={isAiResponding || !inputText.trim()}
                aria-label="Send answer"
                className="flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow disabled:opacity-40 active:scale-95 transition shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                Send
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-white/30 px-1 font-mono">
              <span>
                {assessmentMode === "instructor"
                  ? "Instructor-Led Live Examination session"
                  : "Oral dictation supported via Speech Recognition"}
              </span>
              <span>
                {role === "instructor"
                  ? "Press send to direct the candidate"
                  : "Submit to query assessor panel"}
              </span>
            </div>
          </form>
        ) : (
          <div className="bg-[#141414] border-t border-white/10 p-4 text-center text-xs font-mono text-white/40">
            ?? You are observing in spectator Mode. Student drawings and comments synced instantaneously.
          </div>
        )}
      </div>

      {/* Dynamic Instructor Grading Overlay Modal */}
      {showGradingPanel && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/95 backdrop-blur-md flex items-center justify-center p-4 md:p-6 origin-center">
          <div className="bg-[#121216] border border-white/10 rounded-2xl w-full max-w-4xl p-6 md:p-8 space-y-6 shadow-2xl relative text-left my-8">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-sans">Instructor Oral Examination Scorecard Form</h3>
                  <p className="text-xs text-white/40 font-mono uppercase tracking-wider">Session: {sessionId} / Candidate: {studentName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGradingPanel(false)}
                className="p-1 px-3 text-xs bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white rounded-lg transition opacity-80 hover:opacity-100 cursor-pointer"
              >
                Return to Chat
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Left Column: Key Parameters */}
              <div className="space-y-4">
                <div className="bg-[#0b0b0d] p-4 rounded-xl border border-white/5 space-y-3.5">
                  <h4 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-widest">Core Performance metrics</h4>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-white/70">Overall Defense Score</span>
                      <span className="text-indigo-400 font-mono text-sm">{tempOverallScore} / 100</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={tempOverallScore}
                      onChange={(e) => setTempOverallScore(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-white/10 active:bg-indigo-500 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wide">Suspicion Level</label>
                      <select
                        value={tempSuspicionLevel}
                        onChange={(e) => setTempSuspicionLevel(e.target.value as any)}
                        className="w-full bg-black border border-white/10 rounded-lg p-2 text-xs text-white focus:border-indigo-500 outline-none"
                      >
                        <option value="Low">Low Suspicion</option>
                        <option value="Medium">Medium Suspicion</option>
                        <option value="High">High Suspicion</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wide">Recommended Grade</label>
                      <input
                        type="text"
                        value={tempRecommendedGrade}
                        onChange={(e) => setTempRecommendedGrade(e.target.value)}
                        placeholder="e.g. A-, B+, Pass"
                        className="w-full bg-black border border-white/10 rounded-lg p-2 text-xs text-white focus:border-indigo-500 outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-[#0b0b0d] p-4 rounded-xl border border-white/5 space-y-3">
                  <h4 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-widest">Integrity & Authenticity</h4>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wide font-mono">Academic Integrity Reasoning / Observations</label>
                    <textarea
                      value={tempSuspicionReasoning}
                      onChange={(e) => setTempSuspicionReasoning(e.target.value)}
                      rows={3}
                      className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-xs text-white focus:border-indigo-500 outline-none leading-relaxed font-sans"
                    />
                  </div>
                </div>

                <div className="bg-[#0b0b0d] p-4 rounded-xl border border-white/5 space-y-3">
                  <h4 className="text-xs font-bold font-mono text-indigo-400 uppercase tracking-widest">Key Findings & Gaps</h4>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wide font-mono">Key Strengths Demonstrated</label>
                    <input
                      type="text"
                      value={tempFindings}
                      onChange={(e) => setTempFindings(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-lg p-2 text-xs text-white focus:border-indigo-500 outline-none font-sans"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wide font-mono">Conceptual Gaps Identified</label>
                    <input
                      type="text"
                      value={tempGaps}
                      onChange={(e) => setTempGaps(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-lg p-2 text-xs text-white focus:border-indigo-500 outline-none font-sans"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Category Scores */}
              <div className="space-y-4">
                <div className="bg-[#0b0b0d] p-4 rounded-xl border border-white/5 space-y-3">
                  <h4 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-widest">Category-by-Category Scores</h4>

                  {/* Category 1 */}
                  <div className="space-y-1.5 border-b border-white/5 pb-2.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-white/80">1. Technical Subject Mastery</span>
                      <span className="text-indigo-400 font-mono text-xs">{tempMasteryScore} / 10</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={tempMasteryScore}
                      onChange={(e) => setTempMasteryScore(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg accent-indigo-500"
                    />
                    <input
                      type="text"
                      value={tempMasteryFeedback}
                      onChange={(e) => setTempMasteryFeedback(e.target.value)}
                      placeholder="Technical subject mastery narrative feedback"
                      className="w-full bg-black border border-white/5 rounded-lg p-1.5 text-[11px] text-white/70 focus:border-indigo-500 outline-none font-sans"
                    />
                  </div>

                  {/* Category 2 */}
                  <div className="space-y-1.5 border-b border-white/5 pb-2.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-white/80">2. Visual Whiteboard Synthesis</span>
                      <span className="text-indigo-400 font-mono text-xs">{tempSynthesisScore} / 10</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={tempSynthesisScore}
                      onChange={(e) => setTempSynthesisScore(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg accent-indigo-500"
                    />
                    <input
                      type="text"
                      value={tempSynthesisFeedback}
                      onChange={(e) => setTempSynthesisFeedback(e.target.value)}
                      placeholder="Visual annotations narrative feedback"
                      className="w-full bg-black border border-white/5 rounded-lg p-1.5 text-[11px] text-white/70 focus:border-indigo-500 outline-none font-sans"
                    />
                  </div>

                  {/* Category 3 */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-white/80">3. Integrity & Originality Verification</span>
                      <span className="text-indigo-400 font-mono text-xs">{tempIntegrityScore} / 10</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={tempIntegrityScore}
                      onChange={(e) => setTempIntegrityScore(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg accent-indigo-500"
                    />
                    <input
                      type="text"
                      value={tempIntegrityFeedback}
                      onChange={(e) => setTempIntegrityFeedback(e.target.value)}
                      placeholder="Integrity verification narrative feedback"
                      className="w-full bg-black border border-[#222] rounded-lg p-1.5 text-[11px] text-white/70 focus:border-indigo-500 outline-none font-sans"
                    />
                  </div>
                </div>

                <div className="bg-[#0b0b0d] p-4 rounded-xl border border-white/5 flex flex-col justify-center items-center text-center space-y-2">
                  <p className="text-[11px] text-white/40 leading-relaxed max-w-sm">
                    Submitting this manual scorecard freezes the oral defense session data and displays the comprehensive findings report to both the candidate and examiner board.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={async () => {
                  setIsAiResponding(true);
                  try {
                    const response = await fetch("/api/defense/chat", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        chatHistory,
                        snapshots,
                        studentName,
                        paperTitle,
                        courseName,
                        questions,
                        pastedText,
                        conclude: true,
                        activityType,
                        currentQuestionIndex,
                      })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);
                    const match = result.text.match(/<assessment>([\s\S]*?)<\/assessment>/);
                    if (match) {
                      let jsonText = match[1].trim();
                      if (jsonText.startsWith("```")) {
                        jsonText = jsonText.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "");
                      }
                      jsonText = jsonText.replace(/\/\/.*$/gm, "");
                      jsonText = jsonText.replace(/,(\s*[\]}])/g, "$1");
                      const assessmentObj = JSON.parse(jsonText);
                      setTempOverallScore(assessmentObj.overallScore ?? 85);
                      setTempSuspicionLevel(assessmentObj.suspicionLevel ?? 'Low');
                      setTempSuspicionReasoning(assessmentObj.suspicionReasoning ?? "Consistent modeling");
                      setTempRecommendedGrade(assessmentObj.recommendedGrade ?? 'B');
                      if (assessmentObj.categories) {
                        assessmentObj.categories.forEach((cat: any) => {
                          const catNameUpper = cat.name.toUpperCase();
                          if (catNameUpper.includes("MASTERY") || catNameUpper.includes("TECHNICAL")) {
                            setTempMasteryScore(cat.score ?? 8);
                            setTempMasteryFeedback(cat.feedback ?? "");
                          } else if (catNameUpper.includes("SYNTHESIS") || catNameUpper.includes("WHITEBOARD") || catNameUpper.includes("VISUAL")) {
                            setTempSynthesisScore(cat.score ?? 8);
                            setTempSynthesisFeedback(cat.feedback ?? "");
                          } else if (catNameUpper.includes("INTEGRITY") || catNameUpper.includes("VERIFICATION") || catNameUpper.includes("ORIGINALITY")) {
                            setTempIntegrityScore(cat.score ?? 9);
                            setTempIntegrityFeedback(cat.feedback ?? "");
                          }
                        });
                      }
                      if (assessmentObj.keyFindings && assessmentObj.keyFindings.length > 0) {
                        setTempFindings(assessmentObj.keyFindings.join("; "));
                      }
                      if (assessmentObj.gapsIdentified && assessmentObj.gapsIdentified.length > 0) {
                        setTempGaps(assessmentObj.gapsIdentified.join("; "));
                      }
                    }
                  } catch (e: any) {
                    alert(`API Prefill Error: ${e.message || "Failed to parse auto-draft"}`);
                  } finally {
                    setIsAiResponding(false);
                  }
                }}
                disabled={isAiResponding}
                className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-mono text-xs px-4 py-2.5 rounded-xl border border-indigo-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isAiResponding ? "Connecting with AI..." : "Draft automatically with AI Analysis"}
              </button>

              <button
                type="button"
                id="submit-manual-scores-btn"
                onClick={() => {
                  const manualScoreObj: AIPreparedAssessment = {
                    overallScore: tempOverallScore,
                    suspicionLevel: tempSuspicionLevel,
                    suspicionReasoning: tempSuspicionReasoning,
                    categories: [
                      { name: "Technical Subject Mastery", score: tempMasteryScore, feedback: tempMasteryFeedback },
                      { name: "Visual Whiteboard Synthesis", score: tempSynthesisScore, feedback: tempSynthesisFeedback },
                      { name: "Integrity & Originality Verification", score: tempIntegrityScore, feedback: tempIntegrityFeedback }
                    ],
                    keyFindings: tempFindings.split(/[;|\n]+/).map(f => f.trim()).filter(Boolean),
                    gapsIdentified: tempGaps.split(/[;|\n]+/).map(g => g.trim()).filter(Boolean),
                    recommendedGrade: tempRecommendedGrade || "A-"
                  };
                  onDefenseCompleted(manualScoreObj);
                  notifyPeerStateChange("assessment_finalized", { assessment: manualScoreObj });
                }}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-xs font-bold px-6 py-3 rounded-xl active:scale-95 transition cursor-pointer"
              >
                Finalize Oral Defense & Publish Report <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
