import { jsPDF } from "jspdf";
import { AlertTriangle, CheckCircle2, FileText, Layers, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { AIPreparedAssessment, ChatMessage } from "../types";

interface DiagramEvalResult {
  overallScore: number;
  checks: { label: string; pass: boolean; note: string }[];
  missingConcepts: string[];
  integritySignal: "low" | "medium" | "high";
  integrityNote: string;
}

interface ReportViewerProps {
  studentName: string;
  paperTitle: string;
  courseName: string;
  chatHistory: ChatMessage[];
  assessment: AIPreparedAssessment;
  snapshots: string[]; // base64
  diagramEvaluations?: (DiagramEvalResult | null)[];
  questionDocs?: string[];
  questions?: { num: number; questionText: string; focusConcept: string }[];
  onResetSession: () => void;
  activityType?: string;
}

export default function ReportViewer({
  studentName,
  paperTitle,
  courseName,
  chatHistory,
  assessment,
  snapshots,
  diagramEvaluations = [],
  questionDocs = [],
  questions = [],
  onResetSession,
  activityType,
}: ReportViewerProps) {

  const activityLabels: Record<string, string> = {
    paper: "Research Paper",
    project: "Project Codebase",
    presentation: "Presentation Slide Deck",
    article: "Article/Manuscript",
  };
  const activeLabel = activityType ? (activityLabels[activityType] || "Material") : "Resource";

  // High-fidelity jsPDF document compiler
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Color definitions
    const primaryColor = [30, 41, 59]; // slate-800
    const secondaryColor = [79, 70, 229]; // indigo-600
    const accentColor = [220, 38, 38]; // red-600
    const grayTextColor = [100, 116, 139]; // slate-500

    let currentY = 15;

    // Helper: Add centered title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("WHITEBOARD DEFENSE INTEGRITY REPORT", 105, currentY, { align: "center" });

    currentY += 8;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(grayTextColor[0], grayTextColor[1], grayTextColor[2]);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} UTC`, 105, currentY, { align: "center" });

    currentY += 10;
    // Draw decorative header line
    doc.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.setLineWidth(1);
    doc.line(15, currentY, 195, currentY);

    currentY += 10;
    // Section 1: Candidate Metadata Details
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`1. CANDIDATE & ${activeLabel.toUpperCase()} METADATA`, 15, currentY);

    currentY += 6;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Student Name: ${studentName || "N/A"}`, 15, currentY);
    doc.text(`Course Code: ${courseName || "N/A"}`, 110, currentY);

    currentY += 6;
    doc.text(`${activeLabel} Title:`, 15, currentY);
    currentY += 5;
    doc.setFont("Helvetica", "italic");
    const wrappedTitle = doc.splitTextToSize(paperTitle || "Untitled Thesis", 175);
    doc.text(wrappedTitle, 15, currentY);

    currentY += (wrappedTitle.length * 5) + 5;
    // Section 2: Integrity Diagnostic Summary Card
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("2. INTEGRITY DIAGNOSTIC SCORECARD", 15, currentY);

    currentY += 6;
    // Overall Score & Recommendation
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Overall Understanding Mastery: ${assessment.overallScore}/100`, 15, currentY);
    doc.text(`Recommended Grade: ${assessment.recommendedGrade || "B"}`, 110, currentY);

    currentY += 6;
    const isMediumOrHigh = assessment.suspicionLevel === "High" || assessment.suspicionLevel === "Medium";
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(isMediumOrHigh ? accentColor[0] : 16, isMediumOrHigh ? accentColor[1] : 124, isMediumOrHigh ? accentColor[2] : 16);
    doc.text(`AI-Generated / Ghostwriting Suspicion Level: ${assessment.suspicionLevel || "Low"}`, 15, currentY);

    currentY += 6;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    const wrappedReason = doc.splitTextToSize(`Diagnostic Rationale: ${assessment.suspicionReasoning || "Explanations correspond perfectly with local manuscript outlines."}`, 175);
    doc.text(wrappedReason, 15, currentY);

    currentY += (wrappedReason.length * 5) + 6;
    // Section 3: Detailed Feedback Categories
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("3. DETAILED ASSESSMENTS BY CATEGORY", 15, currentY);

    currentY += 6;
    doc.setFontSize(9);
    assessment.categories.forEach((cat) => {
      doc.setFont("Helvetica", "bold");
      doc.text(`* ${cat.name} (${cat.score}/10)`, 15, currentY);
      currentY += 4;
      doc.setFont("Helvetica", "normal");
      const wrappedFeedback = doc.splitTextToSize(cat.feedback, 170);
      doc.text(wrappedFeedback, 20, currentY);
      currentY += (wrappedFeedback.length * 4) + 4;
    });

    // Check if y is getting too high, add page break
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    // Section 4: Key Findings & Gaps
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("4. ACADEMIC GAP ANALYSIS", 15, currentY);

    currentY += 6;
    doc.setFontSize(9.5);
    doc.setFont("Helvetica", "bold");
    doc.text("Strong Concept Verifications:", 15, currentY);
    currentY += 5;
    doc.setFont("Helvetica", "normal");

    if (assessment.keyFindings && assessment.keyFindings.length > 0) {
      assessment.keyFindings.forEach((f) => {
        const wrappedf = doc.splitTextToSize(`v ${f}`, 175);
        doc.text(wrappedf, 15, currentY);
        currentY += (wrappedf.length * 4) + 2;
      });
    } else {
      doc.text("v No major strengths identified during follow-up questioning.", 15, currentY);
      currentY += 6;
    }

    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }

    currentY += 2;
    doc.setFont("Helvetica", "bold");
    doc.text("Concepts Lacking Ownership (Gaps):", 15, currentY);
    currentY += 5;
    doc.setFont("Helvetica", "normal");

    if (assessment.gapsIdentified && assessment.gapsIdentified.length > 0) {
      assessment.gapsIdentified.forEach((g) => {
        const wrappedg = doc.splitTextToSize(`? ${g}`, 175);
        doc.text(wrappedg, 15, currentY);
        currentY += (wrappedg.length * 4) + 2;
      });
    } else {
      doc.text("? No core competence discrepancies detected.", 15, currentY);
      currentY += 6;
    }

    // New Page: Whiteboard drawing images
    doc.addPage();
    currentY = 20;
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.text("APPENDIX A: STUDENT WHITEBOARD DERIVATIONS", 15, currentY);

    currentY += 10;
    doc.setFontSize(9);
    doc.setFont("Helvetica", "normal");
    doc.text("The student illustrated structural schema on the interactive board for the synthesized checkpoints.", 15, currentY);

    currentY += 10;

    const validSnapshots = snapshots.map((s, i) => ({ snap: s, idx: i })).filter(s => s.snap);
    validSnapshots.forEach(({ snap, idx }) => {
      const evalResult = diagramEvaluations?.[idx];
      try {
        doc.addImage(snap, "PNG", 15, currentY, 80, 55);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(11);
        const snapLabel = evalResult ? `Snapshot #${idx + 1}: Diagram Submission` : `Snapshot #${idx + 1}: Written Submission`;
        doc.text(snapLabel, 105, currentY + 8);

        // Show question text
        const question = questions?.[idx];
        if (question) {
          doc.setFont("Helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(grayTextColor[0], grayTextColor[1], grayTextColor[2]);
          const qWrapped = doc.splitTextToSize(`Q${question.num}: ${question.questionText}`, 80);
          const qPreview = qWrapped.slice(0, 2);
          doc.text(qPreview, 105, currentY + 14);
          doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        }

        if (evalResult) {
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
          doc.text(`Score: ${evalResult.overallScore}/10`, 105, currentY + 26);

          doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          let checkY = currentY + 32;
          evalResult.checks.forEach((c) => {
            const symbol = c.pass ? "v" : "x";
            const wrapped = doc.splitTextToSize(`${symbol} ${c.label}: ${c.note}`, 80);
            doc.setFont("Helvetica", c.pass ? "normal" : "italic");
            doc.setTextColor(c.pass ? 16 : accentColor[0], c.pass ? 124 : accentColor[1], c.pass ? 16 : accentColor[2]);
            doc.text(wrapped, 105, checkY);
            checkY += wrapped.length * 4 + 1;
          });

          if (evalResult.missingConcepts.length > 0) {
            doc.setFont("Helvetica", "italic");
            doc.setTextColor(grayTextColor[0], grayTextColor[1], grayTextColor[2]);
            const mc = doc.splitTextToSize(`Missing: ${evalResult.missingConcepts.join(", ")}`, 80);
            doc.text(mc, 105, checkY);
            checkY += mc.length * 4 + 1;
          }

          doc.setFont("Helvetica", "italic");
          doc.setTextColor(grayTextColor[0], grayTextColor[1], grayTextColor[2]);
          const note = doc.splitTextToSize(evalResult.integrityNote, 80);
          doc.text(note, 105, checkY);
        } else {
          // Written submission -- show the actual text content
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(grayTextColor[0], grayTextColor[1], grayTextColor[2]);
          let writtenText = "";
          try {
            const docData = questionDocs?.[idx];
            if (docData) {
              const parsed = JSON.parse(docData);
              writtenText = parsed.text || "";
            }
          } catch { }
          if (writtenText) {
            const wrapped = doc.splitTextToSize(writtenText, 80);
            const preview = wrapped.slice(0, 8); // max 8 lines
            doc.text(preview, 105, currentY + 26);
            if (wrapped.length > 8) {
              doc.setFont("Helvetica", "italic");
              doc.text("[truncated...]", 105, currentY + 26 + (preview.length * 4));
            }
          } else {
            doc.text("Written answer captured in snapshot.", 105, currentY + 26);
          }
        }

        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        currentY += 70;

        if (currentY > 240 && idx < validSnapshots.length - 1) {
          doc.addPage();
          currentY = 20;
        }
      } catch (err) {
        console.error("Image loading fail during PDF construct:", err);
      }
    });

    // Open in new tab instead of forcing an automatic download.
    // Auto-downloaded files from internal/unfamiliar domains often get flagged
    // as "unsafe" by Chrome/Edge Safe Browsing heuristics. Opening in-browser
    // lets the user view it immediately and manually save via the PDF viewer's
    // own save button, which does not trigger that warning.
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl as unknown as string, "_blank");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 text-left">
      {/* Visual Top Score Overview */}
      <div className="bg-[#111] text-white rounded-3xl p-8 relative overflow-hidden shadow-2xl border border-white/5">
        <div className="absolute top-6 right-6 text-xs font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-450 p-1 px-3 rounded uppercase tracking-wider font-semibold">
          Defense Phase Final Scorecard
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Radial score representation */}
          <div className="md:col-span-4 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/5 pb-6 md:pb-0">
            <div className="relative w-36 h-36 flex items-center justify-center bg-black rounded-full border border-white/10">
              <div className="text-center font-mono">
                <span className="text-5xl font-bold tracking-tight text-indigo-400">
                  {assessment.overallScore}
                </span>
                <span className="text-white/40 block text-xs mt-1">/ 100 Mastery</span>
              </div>
            </div>
            <div className="mt-4 text-center">
              <span className="text-sm font-semibold text-white/50">Recommended Grade:</span>
              <span className="text-lg font-bold text-white ml-2 font-mono">{assessment.recommendedGrade || "B+"}</span>
            </div>
          </div>

          {/* Details text summary */}
          <div className="md:col-span-8 space-y-4">
            <div className="flex items-center gap-3">
              {assessment.suspicionLevel === "High" ? (
                <div className="p-2.5 bg-red-950/25 border border-red-900/45 rounded-xl text-red-450 flex items-center gap-1.5 text-xs font-bold leading-none select-none font-mono">
                  <AlertTriangle className="w-4 h-4 text-red-400" /> HIGH SUSPICION INDICES
                </div>
              ) : assessment.suspicionLevel === "Medium" ? (
                <div className="p-2.5 bg-amber-950/25 border border-amber-900/40 rounded-xl text-amber-450 flex items-center gap-1.5 text-xs font-bold leading-none select-none font-mono">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> MODERATE DISCREPANCIES DETECTED
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-950/25 border border-emerald-900/35 rounded-xl text-emerald-450 flex items-center gap-1.5 text-xs font-bold leading-none select-none font-mono">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> VERIFIED GENUINE OWNERSHIP
                </div>
              )}
            </div>

            <h2 className="text-xl font-serif italic text-white/95">Holistic Integrity Findings</h2>
            <p className="text-xs text-white/80 leading-relaxed font-mono whitespace-pre-line bg-black p-4 rounded-xl border border-white/10">
              {assessment.suspicionReasoning}
            </p>
          </div>
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Category Evaluation Grids */}
        <div className="bg-[#111] rounded-2xl border border-white/5 p-6 space-y-6 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5 font-mono">
            <Layers className="w-4 h-4 text-indigo-400" /> Competency Rubric (Scores / 10)
          </h3>
          <div className="space-y-5">
            {assessment.categories.map((cat, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white/90">{cat.name}</span>
                  <span className="font-mono font-bold text-white/30">
                    <span className="text-white font-bold">{cat.score}</span> / 10
                  </span>
                </div>
                {/* Score bar */}
                <div className="w-full h-2 bg-black border border-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full"
                    style={{ width: `${cat.score * 10}%` }}
                  ></div>
                </div>
                <p className="text-[11px] text-[#E0E0E0]/60 italic mt-0.5 leading-relaxed">
                  "{cat.feedback}"
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Strong verification vs Logic gaps panels */}
        <div className="space-y-6">
          <div className="bg-[#111] rounded-2xl border border-white/5 p-6 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5 font-mono">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Direct Concept Audited Pros
            </h3>
            <ul className="space-y-3 leading-relaxed text-xs">
              {assessment.keyFindings && assessment.keyFindings.map((inf, idx) => (
                <li key={idx} className="flex gap-2.5 items-start text-white/80">
                  <span className="text-emerald-500 font-bold shrink-0">v</span>
                  <span>{inf}</span>
                </li>
              ))}
              {(!assessment.keyFindings || assessment.keyFindings.length === 0) && (
                <p className="text-white/40 italic font-mono">No standout verification metrics found.</p>
              )}
            </ul>
          </div>

          <div className="bg-[#111] rounded-2xl border border-white/5 p-6 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5 font-mono">
              <XCircle className="w-4 h-4 text-red-500" /> Intellectual Logic Gaps
            </h3>
            <ul className="space-y-3 leading-relaxed text-xs">
              {assessment.gapsIdentified && assessment.gapsIdentified.map((gap, idx) => (
                <li key={idx} className="flex gap-2.5 items-start text-white/80">
                  <span className="text-red-500 font-bold shrink-0">?</span>
                  <span>{gap}</span>
                </li>
              ))}
              {(!assessment.gapsIdentified || assessment.gapsIdentified.length === 0) && (
                <p className="text-white/40 italic font-mono">No major intellectual discrepancies identified.</p>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Diagram Evaluations */}
      {snapshots.some(Boolean) && (
        <div className="bg-[#111] rounded-2xl border border-white/5 p-6 space-y-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5 font-mono">
            <Layers className="w-4 h-4 text-indigo-400" /> Whiteboard Diagram Evaluations
          </h3>
          <div className="space-y-6">
            {snapshots.map((snap, idx) => {
              if (!snap) return null;
              const evalResult = diagramEvaluations?.[idx];
              const question = questions?.[idx];
              return (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-4">
                  {/* Snapshot thumbnail + question */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-white/30">Snapshot #{idx + 1}</span>
                      {evalResult && (
                        <span className="text-xs font-mono text-indigo-400/60">{evalResult.checks ? "Diagram" : "Written"}</span>
                      )}
                    </div>
                    {question && (
                      <p className="text-xs text-white/50 italic border-l-2 border-indigo-500/20 pl-2 leading-relaxed">
                        Q{question.num}: {question.questionText}
                      </p>
                    )}
                    <img
                      src={snap.startsWith("data:") ? snap : `data:image/png;base64,${snap}`}
                      alt={`Whiteboard snapshot for question ${idx + 1}`}
                      className="w-full rounded-lg border border-white/10"
                    />
                  </div>
                  {/* Evaluation results -- same layout for both diagram and written */}
                  <div className="space-y-3">
                    {evalResult ? (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono ${evalResult.overallScore >= 8 ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
                            : evalResult.overallScore >= 5 ? "bg-amber-950/40 text-amber-400 border border-amber-900/50"
                              : "bg-red-950/40 text-red-400 border border-red-900/50"
                            }`}>
                            {evalResult.overallScore}/10
                          </span>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono ${evalResult.integritySignal === "low" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
                            : evalResult.integritySignal === "medium" ? "bg-amber-950/40 text-amber-400 border border-amber-900/50"
                              : "bg-red-950/40 text-red-400 border border-red-900/50"
                            }`}>
                            {evalResult.integritySignal === "low" ? "Low concern"
                              : evalResult.integritySignal === "medium" ? "Review needed"
                                : "Flagged"}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {evalResult.checks.map((c: any, ci: number) => (
                            <div key={ci} className="flex items-start gap-2 text-xs">
                              <span className={`shrink-0 font-bold ${c.pass ? "text-emerald-400" : "text-red-400"}`}>
                                {c.pass ? "v" : "x"}
                              </span>
                              <div>
                                <span className="font-bold text-white/70">{c.label}</span>
                                <span className="text-white/40 ml-1">{c.note}</span>
                              </div>
                            </div>
                          ))}
                          {evalResult.missingConcepts?.length > 0 && (
                            <div className="flex items-start gap-2 text-xs">
                              <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                              <span className="text-white/40">Missing: {evalResult.missingConcepts.join(", ")}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-white/30 italic border-t border-white/5 pt-2">{evalResult.integrityNote}</p>
                      </>
                    ) : (
                      <p className="text-xs text-white/30 italic">No evaluation recorded.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Buttons to PDF export and resets */}
      <div className="bg-[#131313] rounded-2xl p-6 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-inner">
        <div>
          <h4 className="text-sm font-bold text-white/90">Publish Final Examination Report</h4>
          <p className="text-xs text-white/40 mt-0.5 font-sans leading-relaxed">
            Opens the official university integrity evaluation PDF in a new tab, detailing transcript responses and the registered whiteboard drawing proofs. Use your browser's save icon in the PDF viewer to download a copy.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            id="reset-state-restart-defense-btn"
            onClick={onResetSession}
            className="flex items-center gap-1 bg-black hover:bg-white/5 text-[#E0E0E0] border border-white/10 rounded-xl text-xs font-bold p-3 px-5 transition active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-white/50" /> Ingest New {activeLabel}
          </button>
          <button
            type="button"
            id="export-pdf-report-viewer-button"
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold p-3 px-6 transition hover:scale-105 active:scale-95 shadow-md cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[#F8FAFC]" /> View Full Academic Defense PDF
          </button>
        </div>
      </div>
    </div>
  );
}
