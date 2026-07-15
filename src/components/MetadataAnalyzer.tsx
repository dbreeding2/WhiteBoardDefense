import React from "react";
import { 
  FileText, 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Activity, 
  BookMarked,
  Layers,
  HelpCircle,
  FileCheck,
  ShieldCheck,
  Percent,
  Compass
} from "lucide-react";

export interface MetadataAnalysisData {
  wordCount: number;
  charCount: number;
  estimatedReadingTime: number;
  academicComplexity: "Low" | "Medium" | "High";
  readabilityScore: number;
  readabilityLabel: string;
  passiveVoicePercent: number;
  keyConcepts: string[];
  standardsCompliance: {
    // Activity-type-specific boolean fields (paper: hasAbstract/hasMethodology/hasCitations,
    // presentation: hasObjective/hasVisuals/hasConclusion, project: hasRequirements/hasArchitecture/hasTestPlan).
    // Not read directly by this component -- use `checks` below instead, which server.ts
    // populates consistently for every activity type.
    formatCheckScore: number;
    checks?: { label: string; status: string }[];
  };
  aiLikelihood: {
    score: number;
    diagnosticExplanation: string;
    structuralEntropy: "Uniform" | "Dynamic" | "Suspiciously Consistent" | string;
  };
  conceptualWeaknesses: string[];
  extractedReferences: string[];
}

interface MetadataAnalyzerProps {
  analysis: MetadataAnalysisData | null;
  isLoading: boolean;
}

export default function MetadataAnalyzer({ analysis, isLoading }: MetadataAnalyzerProps) {
  if (isLoading) {
    return (
      <div className="bg-[#111] rounded-xl border border-white/5 p-8 text-center space-y-4">
        <div className="relative w-12 h-12 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500/10" />
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-white font-mono uppercase tracking-widest">Running Deconstructive Analysis</h4>
          <p className="text-[11px] text-white/40 max-w-xs mx-auto leading-relaxed">
            Scanning document entropy, syntax compliance scores, vocabulary passive-voice density, and extracting citation indexes...
          </p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="bg-[#111] rounded-xl border border-white/5 p-6 text-center space-y-2">
        <HelpCircle className="w-8 h-8 text-white/20 mx-auto" />
        <h4 className="text-xs font-bold text-white/60 uppercase font-mono tracking-wider">No Data Analyzed</h4>
        <p className="text-[11px] text-white/40 max-w-xs mx-auto">
          Please confirm your setup questions. Analysis is prepared automatically after scholastic ingestion.
        </p>
      </div>
    );
  }

  // Determine dynamic badges based on thresholds
  const aiScore = analysis.aiLikelihood?.score || 0;
  let aiAlertColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/25";
  let aiAlertLabel = "Highly Genuine / Low Risk";
  if (aiScore > 65) {
    aiAlertColor = "text-red-400 bg-red-500/10 border-red-500/25 animate-pulse";
    aiAlertLabel = "Suspiciously Uniform/AI Generated";
  } else if (aiScore > 35) {
    aiAlertColor = "text-amber-400 bg-amber-500/10 border-amber-500/25";
    aiAlertLabel = "Moderate Pattern Match Risk";
  }

  return (
    <div className="space-y-6">
      {/* Overview stats block */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-black/40 p-3 rounded-lg border border-white/5">
          <div className="text-[10px] text-white/30 uppercase tracking-wider font-mono block">Document Volume</div>
          <p className="text-sm font-bold text-white/80 mt-1">{analysis.wordCount?.toLocaleString() || "0"} words</p>
          <span className="text-[9px] text-white/40 font-mono">~{analysis.estimatedReadingTime || 1} min read length</span>
        </div>
        <div className="bg-black/40 p-3 rounded-lg border border-white/5">
          <div className="text-[10px] text-white/30 uppercase tracking-wider font-mono block">Syntactic Complexity</div>
          <p className="text-sm font-bold text-white/80 mt-1">{analysis.academicComplexity || "Medium"} Grade</p>
          <span className="text-[9px] text-[#818CF8] font-mono">{analysis.readabilityLabel || "Standard Prose"}</span>
        </div>
      </div>

      {/* Checklist formatting compliance */}
      <div className="bg-[#151522] rounded-xl border border-indigo-500/10 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h5 className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 font-mono flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5" /> Peer Format Compliance Check
          </h5>
          <span className="text-xs font-mono font-bold text-white bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded">
            {analysis.standardsCompliance?.formatCheckScore || 0}% Score
          </span>
        </div>

        <div className="space-y-2 text-xs">
          {analysis.standardsCompliance?.checks && analysis.standardsCompliance.checks.length > 0 ? (
            analysis.standardsCompliance.checks.map((check, i) => {
              const isPass = check.status === "PRESENT";
              const isWarn = check.status === "MANUAL CHECK REQ." || check.status === "THIN SECTION";
              return (
                <div key={i} className="flex items-center justify-between p-2 bg-black/30 rounded border border-white/5">
                  <span className="text-white/60 font-mono text-[11px]">{check.label}</span>
                  {isPass ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-400 font-mono bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/15">
                      <CheckCircle className="w-3 h-3" /> Detected
                    </span>
                  ) : isWarn ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-yellow-400 font-mono bg-yellow-500/5 px-2 py-0.5 rounded border border-yellow-500/15 animate-pulse">
                      <AlertTriangle className="w-3 h-3" /> {check.status === "THIN SECTION" ? "Thin section" : "Manual Check Req."}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-red-400 font-mono bg-red-500/5 px-2 py-0.5 rounded border border-red-500/15">
                      <XCircle className="w-3 h-3" /> {check.status === "MISSING LABEL" ? "Missing label" : "Missing"}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-xs text-white/30 italic font-mono text-center py-2">No compliance checks available.</p>
          )}
        </div>
      </div>

      {/* Writing Quality Profile */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase font-bold tracking-widest text-white/40 font-mono block">Style Quality Metrics</label>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-black/30 p-2.5 rounded border border-white/5 flex items-center justify-between">
            <span className="text-white/55 font-mono text-[10.5px]">Passive Voice Density</span>
            <span className="font-bold text-white bg-white/5 px-1.5 py-0.5 rounded border border-white/10 font-mono text-[11px]">{analysis.passiveVoicePercent || 0}%</span>
          </div>
          <div className="bg-black/30 p-2.5 rounded border border-white/5 flex items-center justify-between">
            <span className="text-white/55 font-mono text-[10.5px]">Technical Readability</span>
            <span className="font-bold text-[#818CF8] bg-white/5 px-1.5 py-0.5 rounded border border-white/10 font-mono text-[11px]">{analysis.readabilityScore || 0} / 100</span>
          </div>
        </div>

        {/* Highlighted Terminology extracted */}
        <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-2">
          <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider font-bold block flex items-center gap-1">
            <Compass className="w-3 h-3" /> Ingested Core Lexicon Tags
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {analysis.keyConcepts && analysis.keyConcepts.length > 0 ? (
              analysis.keyConcepts.map((kw, i) => (
                <span key={i} className="text-[10px] bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 rounded px-2 py-0.5 font-mono font-medium">
                  {kw}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-white/30 italic font-mono">No terms extracted</span>
            )}
          </div>
        </div>
      </div>

      {/* Structural Entropy and AI Fingerprinting */}
      <div className="bg-[#1b1216] rounded-xl border border-red-500/10 p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <h5 className="text-[10px] font-bold uppercase tracking-widest text-red-400 font-mono flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Linguistic AI-Signature Alert
          </h5>
          <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${aiAlertColor}`}>
            Score: {aiScore}%
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/50 text-[11px] font-mono">Confidence Assessment:</span>
            <span className="font-bold text-white text-[11px]">{aiAlertLabel}</span>
          </div>
          <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
            <div 
              className={`h-1.5 transition-all duration-300 ${aiScore > 65 ? 'bg-red-500' : (aiScore > 35 ? 'bg-amber-400' : 'bg-emerald-400')}`}
              style={{ width: `${aiScore}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[9px] text-white/30 font-mono">
            <span>Dynamic (Human)</span>
            <span>Uniform (AI)</span>
          </div>

          <p className="text-[11px] text-white/60 leading-relaxed bg-black/20 p-2.5 rounded border border-white/5 italic">
            "{analysis.aiLikelihood?.diagnosticExplanation || "Linguistics score within safe empirical ranges. Pattern displays standard human structural variation."}"
          </p>
        </div>
      </div>

      {/* ANTI FAKE INFORMATION ANALYTICS (Conceptual Gaps & Assumptions) */}
      <div className="bg-amber-500/[0.02] border border-amber-500/15 rounded-xl p-4 space-y-3">
        <h5 className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" /> Conceptual Assumptions & Weaknesses
        </h5>
        
        <p className="text-[11.5px] text-white/50 leading-relaxed">
          The following assumptions or missing empirical grounds are flagged for focused oral defense verification. Watch out for potential faked or hallucinated theoretical elements!
        </p>

        <ul className="space-y-2">
          {analysis.conceptualWeaknesses && analysis.conceptualWeaknesses.length > 0 ? (
            analysis.conceptualWeaknesses.slice(0, 3).map((weakness, i) => (
              <li key={i} className="flex gap-2 text-xs bg-black/30 p-2.5 rounded border border-white/5">
                <div className="w-5 h-5 rounded bg-amber-500/15 border border-amber-500/20 text-amber-400 flex items-center justify-center font-mono text-[10px] font-bold shrink-0">
                  {i + 1}
                </div>
                <span className="text-white/70 leading-relaxed">{weakness}</span>
              </li>
            ))
          ) : (
            <li className="text-xs text-white/30 italic font-mono text-center py-2">No critical structural holes identified in the draft.</li>
          )}
        </ul>
      </div>

      {/* Citation index references parsing */}
      <div className="bg-[#0b0c11] border border-white/5 rounded-xl p-4 space-y-3">
        <h5 className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8] font-mono flex items-center gap-1.5">
          <BookMarked className="w-3.5 h-3.5 text-indigo-400" /> Extracted Academic Literature Index
        </h5>

        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
          {analysis.extractedReferences && analysis.extractedReferences.length > 0 ? (
            analysis.extractedReferences.map((ref, idx) => (
              <div key={idx} className="bg-black/40 p-2.5 rounded border border-white/5 text-[11px] leading-relaxed font-serif text-white/60">
                <span className="text-[10px] bg-white/5 border border-white/10 text-white/50 rounded px-1.5 py-0.5 shrink-0 mr-1.5 font-mono">
                  [{idx + 1}]
                </span>
                {ref}
              </div>
            ))
          ) : (
            <p className="text-xs text-white/30 italic font-mono text-center">No reference list found. Prompting dynamically simulated citations.</p>
          )}
        </div>
      </div>
    </div>
  );
}
