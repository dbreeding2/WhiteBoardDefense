import type JSZip from "jszip";
import {
  BookOpen,
  ChevronRight,
  Clipboard,
  Code,
  FileCode,
  FileText,
  Image,
  Layers,
  Presentation,
  Sparkles,
  User,
  X
} from "lucide-react";
import React, { FormEvent, useRef, useState } from "react";

interface SetupFormProps {
  onSetupComplete: (studentName: string, paperTitle: string, courseName: string, pastedText: string, activityType: string, assessmentMode: 'ai' | 'instructor', pastedDiagram: string | null) => void;
  isLoading: boolean;
  assessmentMode: 'ai' | 'instructor';
  setAssessmentMode: (mode: 'ai' | 'instructor') => void;
}

const activityConfigs: {
  [key: string]: {
    name: string;
    icon: React.ComponentType<any>;
    titleLabel: string;
    titlePlaceholder: string;
    fileLabel: string;
    fileDesc: string;
    pastedLabel: string;
    pastedPlaceholder: string;
  }
} = {
  paper: {
    name: "Research Paper",
    icon: FileText,
    titleLabel: "Research Paper Title",
    titlePlaceholder: "e.g. Simulating Physics with Computers",
    fileLabel: "Manuscript file ingestion (text, md, pdf, or pptx)",
    fileDesc: "Drag & drop or click browse below to upload paper files",
    pastedLabel: "Paste Manuscript Content Text",
    pastedPlaceholder: "Paste the abstract, core equations, experimental details, conclusions, and structural outline here..."
  },
  project: {
    name: "Project / Codebase",
    icon: Code,
    titleLabel: "Project / Codebase Name",
    titlePlaceholder: "e.g. Distributed Consensus Engine in Rust",
    fileLabel: "Project README or design specification file",
    fileDesc: "Drag & drop or click browse below to upload specification files",
    pastedLabel: "Paste Project Specifications & Architecture Outline",
    pastedPlaceholder: "Paste the README, architectural design, component flow, algorithm paths, or core source file contents here..."
  },
  presentation: {
    name: "Presentation / Slide Deck",
    icon: Presentation,
    titleLabel: "Presentation / Slide Deck Title",
    titlePlaceholder: "e.g. Commercializing Fusion Energy Bounds",
    fileLabel: "Upload .pptx slide deck or paste notes below",
    fileDesc: "Drag & drop or click browse -- .pptx files are automatically parsed",
    pastedLabel: "Paste Slide Outlines, Speaker Notes, or Transcripts",
    pastedPlaceholder: "Paste the slide-by-slide titles, key bullet points, and speaker notes representing the slides' claims..."
  },
  article: {
    name: "Article / Column",
    icon: FileCode,
    titleLabel: "Article / Column Title",
    titlePlaceholder: "e.g. Ethical Implications of Generative Audio Agents",
    fileLabel: "Article draft body of text or references files",
    fileDesc: "Drag & drop or click browse below to upload text draft files",
    pastedLabel: "Paste Article Body Text & References",
    pastedPlaceholder: "Paste the article sections, discussion paragraphs, critical arguments, and bibliography content..."
  }
};

// ??? PPTX text extraction ?????????????????????????????????????????????????????
// Extracts readable text from all slide XML files inside a .pptx zip archive.
// Does NOT render slides as images -- just pulls the text content for AI analysis.
async function extractPptxText(file: File): Promise<string> {
  // Dynamically import JSZip -- it's already in node_modules via the xlsx dependency chain
  // If JSZip is not available, fall back to a helpful error message
  let JSZip: JSZip;
  try {
    // Try the package that's most likely bundled
    const mod = await import("jszip");
    JSZip = mod.default || mod;
  } catch {
    throw new Error("JSZip not available. Please paste the slide content manually.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
      return numA - numB;
    });

  if (slideFiles.length === 0) {
    throw new Error("No slides found in this .pptx file.");
  }

  const slideTexts: string[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const xmlContent = await zip.files[slideFiles[i]].async("string");
    // Extract text directly from <a:t> nodes via capture group
    const textMatches = Array.from(xmlContent.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g));
    const slideText = textMatches
      .map((match) => (match[1] || "").trim())
      .filter((t) => t.length > 0)
      .join(" ");
    if (slideText.trim()) {
      slideTexts.push(`[Slide ${i + 1}] ${slideText}`);
    }
  }

  if (slideTexts.length === 0) {
    throw new Error("Could not extract text from slides. Try pasting the content manually.");
  }

  return slideTexts.join("\n\n");
}

// ??? DOCX text extraction ?????????????????????????????????????????????????????
// Uses mammoth.js to convert a .docx file to plain text in the browser.
async function extractDocxText(file: File): Promise<string> {
  let mammoth: any;
  try {
    const mod = await import("mammoth");
    mammoth = mod.default || mod;
  } catch {
    throw new Error("mammoth.js not available. Please paste the document content manually.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });

  if (!result.value || result.value.trim().length === 0) {
    throw new Error("Could not extract text from this .docx file. Try pasting the content manually.");
  }

  return result.value;
}

// ??? Image compression helper ?????????????????????????????????????????????????
// Resizes and compresses an image to max 1280px wide at 75% JPEG quality.
// Returns a compressed base64 data URL.
async function compressImage(dataUrl: string, maxWidth = 1280, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = dataUrl;
  });
}

export default function SetupForm({ onSetupComplete, isLoading, assessmentMode, setAssessmentMode }: SetupFormProps) {
  const [studentName, setStudentName] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [courseName, setCourseName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<string>("paper");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  // Diagram paste zone state
  const [pastedDiagram, setPastedDiagram] = useState<string | null>(null);
  const [diagramCompressing, setDiagramCompressing] = useState(false);
  const pasteZoneRef = useRef<HTMLDivElement>(null);

  const currentConfig = activityConfigs[activityType] || activityConfigs.paper;

  // ??? File upload handler ??????????????????????????????????????????????????
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileError(null);
    setFileLoading(true);

    // Auto-populate title from filename
    const sanitizedTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    if (!paperTitle) {
      setPaperTitle(sanitizedTitle);
    }

    try {
      if (file.name.toLowerCase().endsWith(".pptx")) {
        // PPTX: extract text from slide XML
        const extracted = await extractPptxText(file);
        setPastedText(extracted);
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        // DOCX: extract text using mammoth.js
        const extracted = await extractDocxText(file);
        setPastedText(extracted);
      } else {
        // Plain text / markdown / other text files
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          if (text) setPastedText(text);
          setFileLoading(false);
        };
        reader.onerror = () => {
          setFileError("Could not read file. Try pasting the content manually.");
          setFileLoading(false);
        };
        reader.readAsText(file);
        return; // FileReader is async via callback, return here
      }
    } catch (err: any) {
      setFileError(err?.message || "Failed to process file. Try pasting the content manually.");
    }

    setFileLoading(false);
  };

  // ??? Diagram paste handler ????????????????????????????????????????????????
  const handleDiagramPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;

    e.preventDefault();
    setDiagramCompressing(true);

    const blob = imageItem.getAsFile();
    if (!blob) { setDiagramCompressing(false); return; }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target?.result as string;
        const compressed = await compressImage(raw);
        setPastedDiagram(compressed);
      } catch {
        // If compression fails, use the raw image
        setPastedDiagram(ev.target?.result as string);
      }
      setDiagramCompressing(false);
    };
    reader.readAsDataURL(blob);
  };

  // Also handle drop on the paste zone
  const handleDiagramDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;

    setDiagramCompressing(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target?.result as string;
        const compressed = await compressImage(raw);
        setPastedDiagram(compressed);
      } catch {
        setPastedDiagram(ev.target?.result as string);
      }
      setDiagramCompressing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!paperTitle.trim() || !pastedText.trim()) {
      alert(`Please provide at least a ${currentConfig.titleLabel} and paste the core activity or submission contents.`);
      return;
    }
    onSetupComplete(studentName, paperTitle, courseName, pastedText, activityType, assessmentMode, pastedDiagram);
  };

  return (
    <div className="max-w-3xl mx-auto bg-[#111] rounded-2xl shadow-xl border border-white/5 overflow-hidden">
      <div className="bg-transparent border-b border-white/10 px-8 py-6 text-white text-center relative">
        <div className="absolute top-4 right-4 text-[10px] font-mono tracking-widest text-indigo-400 border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 rounded uppercase font-bold">
          Defense Phase I
        </div>
        <h1 className="text-2xl font-serif italic text-white/95">Setup Whiteboard Defense</h1>
        <p className="text-white/40 text-xs mt-1">Ingest scholastic materials dynamically to generate targeted whiteboard verification challenges.</p>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-6">
        {/* Activity Selection Grid */}
        <div className="space-y-2">
          <label className="text-xs font-semibold tracking-wide text-white/50 uppercase flex items-center gap-1.5 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Defense Scholastic Activity Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(activityConfigs).map(([key, config]) => {
              const IconComp = config.icon;
              const isSelected = activityType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivityType(key)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition outline-none cursor-pointer ${isSelected
                    ? "bg-indigo-600/10 border-indigo-500 text-white shadow-indigo-500/5 ring-1 ring-indigo-500/20"
                    : "bg-black border-white/5 text-white/50 hover:border-white/25 hover:text-white"
                    }`}
                >
                  <IconComp className={`w-5 h-5 mb-1.5 ${isSelected ? "text-indigo-400 animate-pulse" : "text-white/30"}`} />
                  <span className="text-xs font-medium font-sans truncate w-full">{config.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Student metadata */}
          <div className="space-y-1">
            <label className="text-xs font-semibold tracking-wide text-white/50 uppercase flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-400" /> Student Name
            </label>
            <input
              type="text"
              id="student-name-field"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="e.g. Richard Feynman"
              className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-black text-white placeholder-white/20 focus:border-indigo-500 outline-none text-sm transition"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold tracking-wide text-white/50 uppercase flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Course or Unit Code
            </label>
            <input
              type="text"
              id="course-name-field"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="e.g. PHY921 - Quantum Electrodynamics"
              className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-black text-white placeholder-white/20 focus:border-indigo-500 outline-none text-sm transition"
              required
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold tracking-wide text-white/50 uppercase flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-indigo-400" /> {currentConfig.titleLabel}
          </label>
          <input
            type="text"
            id="paper-title-field"
            value={paperTitle}
            onChange={(e) => setPaperTitle(e.target.value)}
            placeholder={currentConfig.titlePlaceholder}
            className="w-full px-4 py-2.5 rounded-lg border border-white/10 bg-black text-white placeholder-white/20 focus:border-indigo-500 outline-none text-sm transition"
            required
          />
        </div>

        {/* File upload */}
        <div className="space-y-4 pt-2">
          <div className="border-2 border-dashed border-white/10 rounded-xl p-5 bg-white/5 hover:bg-white/10 transition relative">
            <div className="flex flex-col items-center justify-center text-center">
              <FileText className="w-10 h-10 text-white/30 mb-2" />
              <p className="text-xs font-semibold text-white/70">{currentConfig.fileLabel}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{currentConfig.fileDesc}</p>

              <input
                type="file"
                id="paper-file-upload-input"
                accept=".txt,.md,.pdf,.pptx,.docx"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {fileLoading && (
                <div className="mt-2 flex items-center gap-2 text-indigo-400 text-xs font-mono">
                  <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                  Extracting content...
                </div>
              )}

              {fileName && !fileLoading && (
                <div className="mt-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs px-3 py-1 rounded-full font-mono flex items-center gap-1">
                  ? {fileName}
                  {pastedText && <span className="text-emerald-400 ml-1">v extracted</span>}
                </div>
              )}

              {fileError && (
                <div className="mt-2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-3 py-1.5 rounded-lg font-mono">
                  ? {fileError}
                </div>
              )}
            </div>
          </div>

          {/* Diagram paste zone */}
          <div className="space-y-1">
            <label className="text-xs font-semibold tracking-wide text-white/50 uppercase flex items-center gap-1.5 font-mono">
              <Image className="w-3.5 h-3.5 text-indigo-400" /> Paste a Diagram or Screenshot (optional)
            </label>
            <div
              ref={pasteZoneRef}
              tabIndex={0}
              onPaste={handleDiagramPaste}
              onDrop={handleDiagramDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-white/10 rounded-xl p-4 bg-white/3 hover:bg-white/5 transition focus:outline-none focus:border-indigo-500/50 min-h-[80px] flex items-center justify-center cursor-pointer relative"
            >
              {diagramCompressing && (
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono">
                  <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                  Compressing image...
                </div>
              )}

              {!pastedDiagram && !diagramCompressing && (
                <div className="text-center pointer-events-none">
                  <Image className="w-6 h-6 text-white/20 mx-auto mb-1" />
                  <p className="text-[11px] text-white/30 font-mono">
                    Click here, then press <span className="text-white/50">Ctrl+V</span> to paste a diagram
                  </p>
                  <p className="text-[10px] text-white/20 mt-0.5">or drag and drop an image file -- auto-compressed before sending</p>
                </div>
              )}

              {pastedDiagram && !diagramCompressing && (
                <div className="relative w-full">
                  <img
                    src={pastedDiagram}
                    alt="Pasted diagram"
                    className="max-h-48 mx-auto rounded-lg object-contain border border-white/10"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPastedDiagram(null); }}
                    className="absolute top-1 right-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-full p-1 transition"
                    title="Remove diagram"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="text-[10px] text-emerald-400 font-mono text-center mt-1.5">
                    v Diagram attached -- will be included in defense analysis
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold tracking-wide text-white/50 uppercase flex items-center gap-1.5 font-mono">
              <Clipboard className="w-3.5 h-3.5 text-indigo-400" /> {currentConfig.pastedLabel}
            </label>
            <textarea
              id="paper-paste-text-area"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={currentConfig.pastedPlaceholder}
              className="w-full h-60 px-4 py-3 rounded-lg border border-white/10 bg-black text-white placeholder-white/20 focus:border-indigo-500 outline-none text-xs transition font-mono leading-relaxed"
              required
            ></textarea>
            <p className="text-[10px] text-white/40">Provide at least 300 words of standard content. Recommended: 1000+ words including technical data for rich analysis.</p>
          </div>
        </div>

        {/* Assessment Mode selection */}
        <div className="space-y-3 pt-4 border-t border-white/5">
          <label className="text-xs font-semibold tracking-wide text-white/50 uppercase flex items-center gap-1.5 font-mono">
            <Layers className="w-3.5 h-3.5 text-indigo-400" /> Choose Assessment Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setAssessmentMode("ai")}
              className={`p-4 rounded-xl border text-left transition duration-200 cursor-pointer ${assessmentMode === "ai"
                ? "bg-indigo-500/10 border-indigo-500 text-white shadow-lg shadow-indigo-500/10"
                : "bg-[#0b0b0f] border-white/5 text-white/60 hover:bg-white/5 hover:text-white"
                }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className={`w-4 h-4 ${assessmentMode === "ai" ? "text-indigo-400 animate-pulse" : "text-white/45"}`} />
                <span className="text-xs font-bold font-mono uppercase tracking-wide">AI-Managed Mode</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                AI automatically orchestrates the follow-up oral inquiries, reviews candidate answers, and compiles final scoremark reports.
              </p>
            </button>
            <button
              type="button"
              id="instructor-mode-button"
              onClick={() => setAssessmentMode("instructor")}
              className={`p-4 rounded-xl border text-left transition duration-200 cursor-pointer ${assessmentMode === "instructor"
                ? "bg-indigo-500/10 border-indigo-500 text-white shadow-lg shadow-indigo-500/10"
                : "bg-[#0b0b0f] border-white/5 text-white/60 hover:bg-white/5 hover:text-white"
                }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <User className={`w-4 h-4 ${assessmentMode === "instructor" ? "text-indigo-400" : "text-white/45"}`} />
                <span className="text-xs font-bold font-mono uppercase tracking-wide">Instructor-Led Mode</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                The human instructor chairs the oral examination. Type comments directly, sync in real-time, and manually fill out the report scorecard on completion.
              </p>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-white/10 flex items-center justify-between">
          <div className="text-[11px] text-white/30 font-mono tracking-wide">
            Whiteboard Defense Platform
          </div>
          <button
            type="submit"
            id="setup-submit-btn"
            disabled={isLoading || fileLoading || !paperTitle.trim() || !pastedText.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl text-sm font-semibold shadow-md active:scale-95 transition disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Analyzing & Synthesizing...
              </>
            ) : (
              <>
                Generate Defense Board Questions <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
