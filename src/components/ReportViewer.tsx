import React from "react";
import { AIPreparedAssessment, ChatMessage } from "../types";
import { jsPDF } from "jspdf";
import { Award, AlertTriangle, FileText, CheckCircle2, XCircle, RefreshCw, Layers, ShieldCheck } from "lucide-react";

interface ReportViewerProps {
  studentName: string;
  paperTitle: string;
  courseName: string;
  chatHistory: ChatMessage[];
  assessment: AIPreparedAssessment;
  snapshots: string[]; // base64
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
      doc.text(`• ${cat.name} (${cat.score}/10)`, 15, currentY);
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
        const wrappedf = doc.splitTextToSize(`✔ ${f}`, 175);
        doc.text(wrappedf, 15, currentY);
        currentY += (wrappedf.length * 4) + 2;
      });
    } else {
      doc.text("✔ No major strengths identified during follow-up questioning.", 15, currentY);
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
        const wrappedg = doc.splitTextToSize(`✖ ${g}`, 175);
        doc.text(wrappedg, 15, currentY);
        currentY += (wrappedg.length * 4) + 2;
      });
    } else {
      doc.text("✖ No core competence discrepancies detected.", 15, currentY);
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

    const validSnapshots = snapshots.filter(Boolean);
    validSnapshots.forEach((snap, idx) => {
      try {
        // Embed canvas png base64 directly
        doc.addImage(snap, "PNG", 15, currentY, 80, 55);
        doc.setFont("Helvetica", "bold");
        doc.text(`Snapshot #${idx + 1}: Conceptual Sketch`, 105, currentY + 15);
        doc.setFont("Helvetica", "normal");
        doc.text("Vector strokes recorded in active session", 105, currentY + 22);

        currentY += 65;

        // Add page break if required
        if (currentY > 240 && idx < validSnapshots.length - 1) {
          doc.addPage();
          currentY = 20;
        }
      } catch (err) {
        console.error("Image loading fail during PDF construct:", err);
      }
    });

    // Save
    doc.save(`Defense_Integrity_Report_${studentName.replace(/\s+/g, "_")}.pdf`);
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
                  <span className="text-emerald-500 font-bold shrink-0">✔</span>
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
                  <span className="text-red-500 font-bold shrink-0">✖</span>
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

      {/* Buttons to PDF export and resets */}
      <div className="bg-[#131313] rounded-2xl p-6 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-inner">
        <div>
          <h4 className="text-sm font-bold text-white/90">Publish Final Examination Report</h4>
          <p className="text-xs text-white/40 mt-0.5 font-sans leading-relaxed">
            Export the official university integrity evaluation PDF detailing transcript responses and the registered whiteboard drawing proofs.
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
            <FileText className="w-4 h-4 text-[#F8FAFC]" /> Export Full Academic Defense PDF
          </button>
        </div>
      </div>
    </div>
  );
}
