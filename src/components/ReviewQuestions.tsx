import React, { useState } from "react";
import { DefenseQuestion } from "../types";
import { Sparkles, Edit3, Check, RefreshCw, AlertCircle, PlayCircle, Eye, FileText } from "lucide-react";
import MetadataAnalyzer, { MetadataAnalysisData } from "./MetadataAnalyzer";

interface ReviewQuestionsProps {
  questions: DefenseQuestion[];
  paperTitle: string;
  pastedText: string;
  onQuestionsConfirmed: (finalQuestions: DefenseQuestion[]) => void;
  onRegenerateSingle: (num: number, reviewNotes: string) => Promise<void>;
  isRegenerating: boolean;
  activityType?: string;
  studentName?: string;
  courseName?: string;
  metadataAnalysis?: MetadataAnalysisData | null;
  isAnalyzingMetadata?: boolean;
}

export default function ReviewQuestions({
  questions,
  paperTitle,
  pastedText,
  onQuestionsConfirmed,
  onRegenerateSingle,
  isRegenerating,
  activityType,
  studentName = "Student Candidate",
  courseName = "Academic Department",
  metadataAnalysis = null,
  isAnalyzingMetadata = false,
}: ReviewQuestionsProps) {
  const [editedQuestions, setEditedQuestions] = useState<DefenseQuestion[]>(questions);
  const [selectedNum, setSelectedNum] = useState<number>(1);
  const [reviewNotes, setReviewNotes] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string>("");
  const [activeRightTab, setActiveRightTab] = useState<'checkpoint' | 'metadata'>('metadata');

  const [checklist, setChecklist] = useState({
    sourceChecked: true,
    identitySynced: true,
    lexiconApproved: true,
    questionsVerified: false,
  });

  const [showFullText, setShowFullText] = useState(false);

  const wordCount = pastedText ? pastedText.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = pastedText ? pastedText.length : 0;
  const estReadTime = Math.max(1, Math.round(wordCount / 220));

  const checkedCount = Object.values(checklist).filter(Boolean).length;
  const checklistTotal = Object.keys(checklist).length;
  const progressPercent = Math.round((checkedCount / checklistTotal) * 100);

  const activityLabels: Record<string, string> = {
    paper: "Research Paper",
    project: "Project Codebase",
    presentation: "Presentation Slide Deck",
    article: "Article/Manuscript",
  };
  const activeLabel = activityType ? (activityLabels[activityType] || "Material") : "Resource";

  // Sync edits
  React.useEffect(() => {
    setEditedQuestions(questions);
  }, [questions]);

  const handleTextChange = (id: string, newText: string) => {
    setEditedQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, questionText: newText } : q))
    );
  };

  const handleConceptChange = (id: string, newConcept: string) => {
    setEditedQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, focusConcept: newConcept } : q))
    );
  };

  const startInlineEdit = (q: DefenseQuestion) => {
    setEditingId(q.id);
    setEditedText(q.questionText);
  };

  const saveInlineEdit = (id: string) => {
    setEditedQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, questionText: editedText } : q))
    );
    setEditingId(null);
  };

  const handleRegenClick = async () => {
    if (!reviewNotes.trim()) {
      alert("Please provide specific feedback/review notes to guide the question regeneration.");
      return;
    }
    await onRegenerateSingle(selectedNum, reviewNotes);
    setReviewNotes("");
  };

  const handleLaunch = () => {
    onQuestionsConfirmed(editedQuestions);
  };

  const currentRegenQuestion = editedQuestions.find((q) => q.num === selectedNum);

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Informational Header */}
      <div className="lg:col-span-12 bg-white/5 p-4 rounded-xl border border-white/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white/90">Verification Scheme Synthesized</h2>
            <p className="text-xs text-white/40">
              Assessing {activeLabel} <span className="font-semibold text-white/70 italic font-serif">"{paperTitle}"</span>. Exactly 8 specialized whiteboard challenges have been generated.
            </p>
          </div>
        </div>
        <div className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20 font-bold uppercase tracking-wider">
          Defense Phase II
        </div>
      </div>

      {/* Main List of Questions */}
      <div className="lg:col-span-7 space-y-4">
        <h3 className="text-sm font-bold text-white/50 flex items-center gap-2 uppercase tracking-wider font-mono">
          <Eye className="w-4 h-4 text-indigo-400" /> Defense Whiteboard Questions (1 - 8)
        </h3>

        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {editedQuestions.map((q) => {
            const isEditing = editingId === q.id;
            return (
              <div
                key={q.id}
                onClick={() => setSelectedNum(q.num)}
                className={`p-4 rounded-xl border text-left cursor-pointer transition duration-150 ${
                  selectedNum === q.num
                    ? "bg-[#161622] border-indigo-500/50 ring-2 ring-indigo-500/10"
                    : "bg-[#111] border-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="w-6 h-6 rounded bg-indigo-600/20 text-indigo-300 font-mono text-xs flex items-center justify-center font-bold border border-indigo-500/20">
                    {q.num}
                  </span>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                        {q.focusConcept || "Conceptual Test"}
                      </span>
                      <button
                        type="button"
                        id={`edit-question-btn-${q.num}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isEditing) saveInlineEdit(q.id);
                          else startInlineEdit(q);
                        }}
                        className="text-xs font-semibold text-white/40 hover:text-indigo-400 flex items-center gap-1 transition"
                      >
                        {isEditing ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Edit3 className="w-3.5 h-3.5" />}
                        {isEditing ? "Save" : "Edit"}
                      </button>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <textarea
                          id={`question-textbox-${q.num}`}
                          value={editedText}
                          onChange={(e) => setEditedText(e.target.value)}
                          className="w-full text-xs bg-black border border-white/10 rounded p-2 focus:border-indigo-500 outline-none leading-relaxed text-white"
                          rows={3}
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            id={`question-concept-textbox-${q.num}`}
                            placeholder="Concept descriptor (e.g. Logic proof)"
                            value={q.focusConcept}
                            onChange={(e) => handleConceptChange(q.id, e.target.value)}
                            className="text-[11px] bg-black border border-white/10 rounded p-1.5 focus:border-indigo-500 outline-none grow font-mono text-white"
                          />
                          <button
                            type="button"
                            onClick={() => saveInlineEdit(q.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white p-1.5 px-3 rounded text-xs font-semibold transition"
                          >
                            Apply Info
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-white/80 text-sm leading-relaxed whitespace-pre-line">
                        {q.questionText}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guide & Regeneration panel */}
      <div className="lg:col-span-5 space-y-6">
        {/* Toggleable Right Panel Tabs */}
        <div className="flex bg-[#111] p-1 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => setActiveRightTab('checkpoint')}
            className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider font-mono rounded-lg transition cursor-pointer ${activeRightTab === 'checkpoint' ? 'bg-[#1b1b2f] text-indigo-400 border border-indigo-500/10' : 'text-white/40 hover:text-white'}`}
          >
            Checkpoint Checklist
          </button>
          <button
            type="button"
            id="metadata-analyzer-toggle-btn"
            onClick={() => setActiveRightTab('metadata')}
            className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider font-mono rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${activeRightTab === 'metadata' ? 'bg-[#1b1b2f] text-indigo-400 border border-indigo-500/10' : 'text-white/40 hover:text-white'}`}
          >
            Manuscript Analyzer
            {isAnalyzingMetadata && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
            )}
          </button>
        </div>

        {activeRightTab === 'checkpoint' && (
          <div className="bg-[#11111d] rounded-xl border border-indigo-500/10 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h4 className="text-xs font-bold uppercase text-white/70 tracking-wider flex items-center gap-1.5 font-mono">
              <FileText className="w-3.5 h-3.5 text-indigo-400" /> Ingestion Checkpoint
            </h4>
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {progressPercent}% VERIFIED
            </span>
          </div>

          {/* Progress metric */}
          <div className="space-y-1.5">
            <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-1 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-white/40 font-mono">
              <span>Checkpoint Tasks</span>
              <span>{checkedCount} of {checklistTotal} verified</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div className="space-y-1 bg-black/40 p-2 rounded border border-white/5">
              <span className="text-[10px] text-white/30 block uppercase tracking-wider font-mono">Candidate</span>
              <span className="text-white/80 font-medium truncate block">{studentName}</span>
            </div>
            <div className="space-y-1 bg-black/40 p-2 rounded border border-white/5">
              <span className="text-[10px] text-white/30 block uppercase tracking-wider font-mono">Course / Subject</span>
              <span className="text-white/80 font-medium truncate block">{courseName}</span>
            </div>
            <div className="space-y-1 bg-black/40 p-2 rounded border border-white/5">
              <span className="text-[10px] text-white/30 block uppercase tracking-wider font-mono">Document Volume</span>
              <span className="text-white/80 font-mono block">{wordCount} words / {charCount} chars</span>
            </div>
            <div className="space-y-1 bg-black/40 p-2 rounded border border-white/5">
              <span className="text-[10px] text-white/30 block uppercase tracking-wider font-mono">Complexity Grade</span>
              <span className="text-white/80 font-mono block">~{estReadTime} min read content</span>
            </div>
          </div>

          {/* Segment snippet drawer */}
          <div className="bg-black/80 rounded-lg p-3 border border-white/5 text-xs">
            <div className="flex items-center justify-between pointer-events-auto">
              <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider font-bold">Source Content Review</span>
              <button
                type="button"
                id="toggle-source-content-inspect-btn"
                onClick={() => setShowFullText(!showFullText)}
                className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold font-mono uppercase flex items-center gap-1"
              >
                {showFullText ? "Hide Full Raw Text" : "Inspect Raw Text"}
                <Eye className="w-3 h-3" />
              </button>
            </div>
            <div className={`mt-2 font-serif text-white/70 leading-relaxed custom-scrollbar overflow-y-auto transition-all ${showFullText ? 'max-h-[220px]' : 'max-h-[60px] blur-[0.5px]'}`}>
              {showFullText ? pastedText : (pastedText ? `${pastedText.substring(0, 180)}...` : "Empty source text draft uploaded.")}
            </div>
          </div>

          {/* Checklist controls */}
          <div className="space-y-2 pt-2 border-t border-white/5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400 font-mono block">Milestone Status Verification</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="checkpoint-cb-source"
                onClick={() => setChecklist(prev => ({ ...prev, sourceChecked: !prev.sourceChecked }))}
                className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition select-none ${checklist.sourceChecked ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-black/20 border-white/5 text-white/40 hover:border-white/10'}`}
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${checklist.sourceChecked ? 'bg-[#1b1b2f] border-indigo-400 text-indigo-300' : 'border-white/20'}`}>
                  {checklist.sourceChecked && <Check className="w-2.5 h-2.5 stroke-[4px]" />}
                </div>
                <span className="truncate">Source Verified</span>
              </button>

              <button
                type="button"
                id="checkpoint-cb-identity"
                onClick={() => setChecklist(prev => ({ ...prev, identitySynced: !prev.identitySynced }))}
                className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition select-none ${checklist.identitySynced ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-black/20 border-white/5 text-white/40 hover:border-white/10'}`}
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${checklist.identitySynced ? 'bg-[#1b1b2f] border-indigo-400 text-indigo-300' : 'border-white/20'}`}>
                  {checklist.identitySynced && <Check className="w-2.5 h-2.5 stroke-[4px]" />}
                </div>
                <span className="truncate">Identity Synced</span>
              </button>

              <button
                type="button"
                id="checkpoint-cb-lexicon"
                onClick={() => setChecklist(prev => ({ ...prev, lexiconApproved: !prev.lexiconApproved }))}
                className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition select-none ${checklist.lexiconApproved ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-black/20 border-white/5 text-white/40 hover:border-white/10'}`}
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${checklist.lexiconApproved ? 'bg-[#1b1b2f] border-indigo-400 text-indigo-300' : 'border-white/20'}`}>
                  {checklist.lexiconApproved && <Check className="w-2.5 h-2.5 stroke-[4px]" />}
                </div>
                <span className="truncate">Lexicon Calibrated</span>
              </button>

              <button
                type="button"
                id="checkpoint-cb-questions"
                onClick={() => setChecklist(prev => ({ ...prev, questionsVerified: !prev.questionsVerified }))}
                className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition select-none ${checklist.questionsVerified ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-black/20 border-white/5 text-white/40 hover:border-white/10'}`}
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${checklist.questionsVerified ? 'bg-[#1b1b2f] border-indigo-400 text-indigo-300' : 'border-white/20'}`}>
                  {checklist.questionsVerified && <Check className="w-2.5 h-2.5 stroke-[4px]" />}
                </div>
                <span className="truncate">Syllabus Confirmed</span>
              </button>
            </div>
          </div>
          </div>
        )}

        {activeRightTab === 'metadata' && (
          <MetadataAnalyzer analysis={metadataAnalysis} isLoading={isAnalyzingMetadata} />
        )}

        <div className="bg-[#111] rounded-xl border border-white/5 p-5 space-y-4 shadow-sm">
          <h4 className="text-xs font-bold uppercase text-white/40 tracking-wider flex items-center gap-1.5 font-mono">
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin-slow" /> AI Question Refiner
          </h4>

          {currentRegenQuestion ? (
            <div className="space-y-3 pt-1 border-t border-white/5">
              <span className="text-[11px] font-bold text-white/40 font-mono">
                Slide Selected: Question #{currentRegenQuestion.num}
              </span>
              <p className="text-xs text-white/60 italic bg-black/40 p-2.5 rounded border border-white/5">
                "{currentRegenQuestion.questionText}"
              </p>

              <div className="space-y-1 pt-2">
                <label className="text-[11px] font-bold uppercase tracking-wide text-white/50 flex items-center gap-1 font-mono">
                  <AlertCircle className="w-3 h-3 text-indigo-400" /> Replacement Guidance
                </label>
                <textarea
                  id="regeneration-feedback-input"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g. Focus on Equation 2 specifically; or 'Require the student to map the control group setup vs the theoretical models'"
                  className="w-full text-xs bg-black border border-white/10 rounded-lg p-2.5 outline-none focus:border-indigo-500 transition text-white placeholder-white/20"
                  rows={3}
                />
              </div>

              <button
                type="button"
                id="regenerate-single-question-button"
                disabled={isRegenerating || !reviewNotes.trim()}
                onClick={handleRegenClick}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 rounded-lg text-xs font-semibold shadow active:scale-95 transition disabled:opacity-50"
              >
                {isRegenerating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Synthesizing upgrade question...
                  </>
                ) : (
                  <>
                    Regenerate Question #{selectedNum} <RefreshCw className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          ) : (
            <p className="text-xs text-white/40">Select a question from the board on the left to regenerate using specific guidelines.</p>
          )}
        </div>

        {/* Action button to confirm and enter stage 3 */}
        <div className="bg-gradient-to-br from-[#12121e] to-[#0d0d12] border border-indigo-500/10 rounded-xl p-5 text-white space-y-4 shadow-md">
          <div className="space-y-1">
            <h4 className="text-sm font-bold tracking-tight">Confirm Defense Parameters</h4>
            <p className="text-xs text-white/40 leading-relaxed">
              Once ready, launch the live Board session. This prepares the active synced Excalidraw, creates a Share QR for Tablets, and triggers sync protocols.
            </p>
          </div>

          <button
            type="button"
            id="launch-defense-session-launch-btn"
            disabled={isRegenerating}
            onClick={handleLaunch}
            className="w-full py-3 bg-white hover:bg-white/90 text-black rounded-xl text-xs font-bold shadow-md active:scale-95 transition flex items-center justify-center gap-2"
          >
            Launch Active Synced Session <PlayCircle className="w-4 h-4 text-indigo-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
