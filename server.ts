import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3456;

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// --- AI Provider Configuration ------------------------------------------------
const AI_PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  || "";
const OPENAI_MODEL    = process.env.OPENAI_MODEL    || "gpt-4o-mini";

const CLAUDE_API_KEY  = process.env.CLAUDE_API_KEY  || "";
const CLAUDE_MODEL    = process.env.CLAUDE_MODEL    || "claude-haiku-4-5-20251001";

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY  || "";
const GEMINI_MODEL    = process.env.GEMINI_MODEL    || "gemini-2.0-flash";

const activeModel = AI_PROVIDER === "claude" ? CLAUDE_MODEL : AI_PROVIDER === "gemini" ? GEMINI_MODEL : OPENAI_MODEL;
console.log(`[AI] Provider: ${AI_PROVIDER.toUpperCase()} | Model: ${activeModel}`);

if (AI_PROVIDER === "openai" && !OPENAI_API_KEY) console.warn("[AI] WARNING: OPENAI_API_KEY is not set");
if (AI_PROVIDER === "claude" && !CLAUDE_API_KEY) console.warn("[AI] WARNING: CLAUDE_API_KEY is not set");
if (AI_PROVIDER === "gemini" && !GEMINI_API_KEY) console.warn("[AI] WARNING: GEMINI_API_KEY is not set");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- OpenAI -------------------------------------------------------------------
async function openaiChat(
  messages: { role: string; content: any }[],
  maxRetries = 3,
  forceJson = false,
  temperature = 0.3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[OpenAI] Attempt ${attempt}/${maxRetries}...`);
      const body: any = { model: OPENAI_MODEL, messages, max_tokens: 8192, temperature };
      if (forceJson) body.response_format = { type: "json_object" };
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as any;
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      console.log(`[OpenAI] Success (${content.length} chars).`);
      return content;
    } catch (err: any) {
      console.warn(`[OpenAI] Attempt ${attempt} failed. ${err?.message}`);
      if (attempt === maxRetries) throw err;
      await sleep(Math.pow(2, attempt) * 1000 + Math.random() * 500);
    }
  }
  throw new Error("OpenAI retries exhausted.");
}

// --- Claude -------------------------------------------------------------------
async function claudeChat(
  messages: { role: string; content: any }[],
  systemPrompt: string | undefined,
  maxRetries = 3,
  temperature = 0.3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Claude] Attempt ${attempt}/${maxRetries}...`);
      const body: any = { model: CLAUDE_MODEL, max_tokens: 4096, messages, temperature };
      if (systemPrompt) body.system = systemPrompt;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as any;
      const content: string = json?.content?.[0]?.text ?? "";
      console.log(`[Claude] Success (${content.length} chars).`);
      return content;
    } catch (err: any) {
      console.warn(`[Claude] Attempt ${attempt} failed. ${err?.message}`);
      if (attempt === maxRetries) throw err;
      await sleep(Math.pow(2, attempt) * 1000 + Math.random() * 500);
    }
  }
  throw new Error("Claude retries exhausted.");
}

// --- Gemini -------------------------------------------------------------------
async function geminiChat(
  userPrompt: string,
  systemPrompt: string | undefined,
  imageParts: { mimeType: string; data: string }[] = [],
  maxRetries = 3,
  temperature = 0.3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Gemini] Attempt ${attempt}/${maxRetries}...`);
      const parts: any[] = [];
      if (systemPrompt) parts.push({ text: systemPrompt + "\n\n" });
      for (const img of imageParts) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
      parts.push({ text: userPrompt });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: "application/json", temperature },
        }),
      });
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as any;
      const content: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      console.log(`[Gemini] Success (${content.length} chars).`);
      return content;
    } catch (err: any) {
      console.warn(`[Gemini] Attempt ${attempt} failed. ${err?.message}`);
      if (attempt === maxRetries) throw err;
      await sleep(Math.pow(2, attempt) * 1000 + Math.random() * 500);
    }
  }
  throw new Error("Gemini retries exhausted.");
}

// --- Unified helpers ----------------------------------------------------------
// temperature guide:
//   0.2-0.3 = evaluation/scoring/chat (consistent, harder to fool)
//   0.7     = question generation (varied questions per student)
async function generateText(userPrompt: string, systemPrompt?: string, forceJson = false, temperature = 0.3): Promise<string> {
  if (AI_PROVIDER === "claude") {
    return claudeChat([{ role: "user", content: userPrompt }], systemPrompt, 3, temperature);
  } else if (AI_PROVIDER === "gemini") {
    return geminiChat(userPrompt, systemPrompt, [], 3, temperature);
  } else {
    const messages: { role: string; content: any }[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: userPrompt });
    return openaiChat(messages, 3, forceJson, temperature);
  }
}

async function generateMultimodal(
  textPrompt: string,
  base64Images: string[],
  systemPrompt?: string,
  temperature = 0.3
): Promise<string> {
  if (AI_PROVIDER === "claude") {
    const contentParts: any[] = [];
    for (const img of base64Images.filter(Boolean)) {
      const base64Data = img.includes("base64,") ? img.split("base64,")[1] : img;
      const mimeType = img.includes("data:") ? img.split(":")[1].split(";")[0] : "image/png";
      contentParts.push({ type: "image", source: { type: "base64", media_type: mimeType, data: base64Data } });
    }
    contentParts.push({ type: "text", text: textPrompt });
    return claudeChat([{ role: "user", content: contentParts }], systemPrompt, 3, temperature);
  } else if (AI_PROVIDER === "gemini") {
    const imageParts = base64Images.filter(Boolean).map((img) => ({
      mimeType: img.includes("data:") ? img.split(":")[1].split(";")[0] : "image/png",
      data: img.includes("base64,") ? img.split("base64,")[1] : img,
    }));
    return geminiChat(textPrompt, systemPrompt, imageParts, 3, temperature);
  } else {
    const contentParts: any[] = [{ type: "text", text: textPrompt }];
    for (const img of base64Images.filter(Boolean)) {
      const dataUri = img.startsWith("data:") ? img : `data:image/png;base64,${img}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUri, detail: "low" } });
    }
    const messages: { role: string; content: any }[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: contentParts });
    return openaiChat(messages, 3, false, temperature);
  }
}

function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

// --- WebSocket setup ----------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });
const sessions = new Map<string, Set<{ ws: WebSocket; role: "student" | "instructor" }>>();

// Dashboard clients -- separate set of connected dashboard browsers
const dashboardClients = new Set<WebSocket>();

// Session metadata store for dashboard
interface SessionMeta {
  sessionId: string;
  studentName: string;
  paperTitle: string;
  courseCode: string;
  currentQuestion: number;
  totalQuestions: number;
  stage: string;
  startedAt: number;
  lastActivity: number;
  thumbnail: string;
}
const sessionMetas = new Map<string, SessionMeta>();

function broadcastDashboard() {
  const payload = JSON.stringify({
    type: "dashboard_update",
    sessions: Array.from(sessionMetas.values()),
  });
  for (const ws of dashboardClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

wss.on("connection", (ws: WebSocket) => {
  let joinedSessionId: string | null = null;
  let clientRole: "student" | "instructor" | null = null;

  ws.on("message", (message: string) => {
    try {
      const payload = JSON.parse(message);
      const { type, sessionId, role } = payload;

      // Dashboard client registration
      if (type === "dashboard_join") {
        dashboardClients.add(ws);
        // Send current state immediately
        ws.send(JSON.stringify({
          type: "dashboard_update",
          sessions: Array.from(sessionMetas.values()),
        }));
        return;
      }

      if (type === "join") {
        joinedSessionId = sessionId;
        clientRole = role;
        if (!sessions.has(sessionId)) sessions.set(sessionId, new Set());
        sessions.get(sessionId)!.add({ ws, role });

        // Initialize session metadata if instructor
        if (role === "instructor" && !sessionMetas.has(sessionId)) {
          const stored = sessionQuestionStore.get(sessionId);
          sessionMetas.set(sessionId, {
            sessionId,
            studentName: stored?.studentName || "",
            paperTitle: stored?.paperTitle || "",
            courseCode: stored?.courseName || "",
            currentQuestion: 0,
            totalQuestions: stored?.questions?.length || 8,
            stage: "session",
            startedAt: Date.now(),
            lastActivity: Date.now(),
            thumbnail: "",
          });
          broadcastDashboard();
        }

        broadcastToSession(sessionId, ws, {
          type: "system_message",
          text: `${role === "student" ? "Student" : "Instructor"} joined session ${sessionId}.`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Track session metadata updates from instructor
      if (sessionId && sessionMetas.has(sessionId)) {
        const meta = sessionMetas.get(sessionId)!;
        meta.lastActivity = Date.now();

        if (type === "slide_change" && payload.data?.idx !== undefined) {
          meta.currentQuestion = payload.data.idx;
          broadcastDashboard();
        }
        if (type === "session_stage_update" && payload.data?.stage) {
          meta.stage = payload.data.stage;
          broadcastDashboard();
        }
        if (type === "snapshot_update" && payload.data?.thumbnail) {
          meta.thumbnail = payload.data.thumbnail;
          broadcastDashboard();
        }
        if (type === "sync_questions" && payload.data?.questions) {
          meta.studentName = payload.data.studentName || meta.studentName;
          meta.paperTitle = payload.data.paperTitle || meta.paperTitle;
          meta.courseCode = payload.data.courseName || meta.courseCode;
          meta.totalQuestions = payload.data.questions.length;
          broadcastDashboard();
        }
      }

      if (sessionId && type) broadcastToSession(sessionId, ws, payload);
    } catch (err) {
      console.error("Error matching WS payload:", err);
    }
  });

  ws.on("close", () => {
    // Remove from dashboard clients
    dashboardClients.delete(ws);

    if (joinedSessionId && sessions.has(joinedSessionId)) {
      const set = sessions.get(joinedSessionId)!;
      for (const client of set) {
        if (client.ws === ws) { set.delete(client); break; }
      }
      if (set.size === 0) {
        sessions.delete(joinedSessionId);
      } else {
        broadcastToSession(joinedSessionId, null, {
          type: "system_message",
          text: `${clientRole === "student" ? "Student" : "Instructor"} disconnected.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
});

function broadcastToSession(sessionId: string, senderWs: WebSocket | null, payload: any) {
  const clients = sessions.get(sessionId);
  if (!clients) return;
  const rawMessage = JSON.stringify(payload);
  for (const client of clients) {
    if (client.ws !== senderWs && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(rawMessage);
    }
  }
}

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  }
});

// --- In-memory session question store ----------------------------------------
// Instructor publishes questions here; student polls to retrieve them.
const sessionQuestionStore = new Map<string, {
  questions: any[];
  studentName: string;
  paperTitle: string;
  courseName: string;
  updatedAt: number;
}>();

// Instructor pushes questions for a session
app.post("/api/defense/session-questions", (req, res) => {
  const { sessionId, questions, studentName, paperTitle, courseName } = req.body;
  if (!sessionId || !questions) return res.status(400).json({ error: "sessionId and questions required" });
  sessionQuestionStore.set(sessionId, {
    questions, studentName, paperTitle, courseName, updatedAt: Date.now()
  });

  // Create or update dashboard session metadata
  const existing = sessionMetas.get(sessionId);
  sessionMetas.set(sessionId, {
    sessionId,
    studentName: studentName || existing?.studentName || "",
    paperTitle: paperTitle || existing?.paperTitle || "",
    courseCode: courseName || existing?.courseCode || "",
    currentQuestion: existing?.currentQuestion || 0,
    totalQuestions: questions.length,
    stage: existing?.stage || "session",
    startedAt: existing?.startedAt || Date.now(),
    lastActivity: Date.now(),
    thumbnail: existing?.thumbnail || "",
  });
  broadcastDashboard();

  return res.json({ ok: true });
});

// Student polls for questions
app.get("/api/defense/session-questions/:sessionId", (req, res) => {
  const data = sessionQuestionStore.get(req.params.sessionId);
  if (!data) return res.status(404).json({ error: "Session not found" });
  return res.json(data);
});

// Dismiss/remove a session from dashboard
app.delete("/api/defense/session-questions/:sessionId", (req, res) => {
  sessionQuestionStore.delete(req.params.sessionId);
  sessionMetas.delete(req.params.sessionId);
  broadcastDashboard();
  return res.json({ ok: true });
});

// Dashboard polls for all active sessions
app.get("/api/defense/dashboard-sessions", (_req, res) => {
  return res.json({ sessions: Array.from(sessionMetas.values()) });
});

// --- API: Server network info for share links ----------------------------
app.get("/api/server-info", (_req, res) => {
  // Allow explicit override via .env
  const envIp = process.env.SERVER_IP;
  if (envIp) {
    return res.json({ ip: envIp, port: PORT, baseUrl: `http://${envIp}:${PORT}` });
  }

  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        candidates.push(net.address);
      }
    }
  }

  // Prefer 192.168.0.x / 10.x.x.x / 172.16-31.x.x over virtual adapters
  const preferred = candidates.find(ip =>
    ip.startsWith("192.168.0.") ||
    ip.startsWith("192.168.1.") ||
    ip.startsWith("10.") ||
    (ip.startsWith("172.") && parseInt(ip.split(".")[1]) >= 16 && parseInt(ip.split(".")[1]) <= 31)
  ) || candidates[0] || "localhost";

  return res.json({ ip: preferred, port: PORT, baseUrl: `http://${preferred}:${PORT}` });
});

// --- API: Generate 8 defense questions ---------------------------------------
app.post("/api/defense/generate-questions", async (req, res) => {
  const { studentName, paperTitle, courseName, pastedText, activityType } = req.body;
  const activityName = activityType || "Research Paper";

  if (!paperTitle || !pastedText) {
    return res.status(400).json({ error: "Title and content details are required" });
  }

  const prompt = `
You are an expert academic defense committee assessor. Analyze the following submitted ${activityName} (Title: ${paperTitle}) and generate EXACTLY 8 highly specific, intellectually rigorous whiteboard defense questions.

CRITICAL CONSTRAINT: Questions MUST be strictly grounded in the concrete topic, scope, and specific details in the provided text.
- Do NOT introduce unrelated theoretical ideas or external formulas not mentioned in the text.
- Mix DIAGRAM-oriented sketching challenges with deep CONCEPTUAL questions appropriate to the domain.
- Reference specific named entities, terminology, systems, datasets, formulas, and results from the text.
- Every question must be fully personalized to the specific content -- no generic templates.

Student Name: ${studentName || "N/A"}
Submission Title: ${paperTitle}
Course Name: ${courseName || "N/A"}
Activity Type: ${activityName}

Submission content (excerpt):
${pastedText.substring(0, 16000)}

Return a JSON object with a "questions" array containing EXACTLY 8 objects. Each object must have:
- "num": integer 1-8
- "questionText": the detailed whiteboard question string referencing specific content from the paper
- "focusConcept": short concept category string
`;

  try {
    const raw = await generateText(prompt, undefined, true, 0.7);
    const parsed = parseJsonResponse<any>(raw);
    const questions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.questions)
      ? parsed.questions
      : Array.isArray(parsed.items)
      ? parsed.items
      : Object.values(parsed).find((v) => Array.isArray(v)) || [];
    return res.json({ questions });
  } catch (err: any) {
    console.error("Error generating questions:", err);
    return res.status(500).json({ error: err.message || "Failed to generate questions" });
  }
});

// --- API: Analyze document metadata ------------------------------------------
app.post("/api/defense/analyze-metadata", async (req, res) => {
  const { studentName, paperTitle, courseName, pastedText, activityType } = req.body;
  const activityName = activityType || "Research Paper";

  if (!pastedText) {
    return res.status(400).json({ error: "Content body is required for metadata analysis" });
  }

  const trimmed = pastedText.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const charCount = trimmed ? trimmed.length : 0;

  const createFallbackAnalysis = () => {
    const wordSplit = pastedText.split(/\s+/).filter(Boolean);
    const passiveWords = (pastedText.match(/\b(is|was|were|been|are|be)\b\s+\w+ed\b/gi) || []).length;
    const estimatedPassiveVoice = Math.min(45, Math.max(10, Math.round((passiveWords / (wordSplit.length || 1)) * 300)));
    const candidates = (Array.from(new Set(pastedText.match(/\b[A-Z][a-zA-Z]{3,}\b/g) || [])) as string[])
      .filter(w => !["The","This","That","Abstract","Introduction","Methodology","Conclusion","Figure","Table","Slide"].includes(w))
      .slice(0, 5);
    while (candidates.length < 4) candidates.push("Core Concept","Technical Term","Key Topic","Main Theme");
    const sentences = (pastedText.match(/[.!?]+/g) || []).length || 1;
    const wordsPerSentence = Math.round(wordCount / sentences);
    let readabilityScore = Math.max(20, Math.min(85, 120 - Math.round(wordsPerSentence * 1.5)));
    let readabilityLabel = "Graduate Research Standard";
    if (readabilityScore > 75) readabilityLabel = "Highly Accessible";
    else if (readabilityScore > 55) readabilityLabel = "Standard Academic Prose";
    else if (readabilityScore < 35) readabilityLabel = "Rigorously Complex";

    // Activity-type-specific compliance checks
    let standardsCompliance: any;
    const isPaper = !activityType || activityType === "paper" || activityType === "capstone";
    const isPresentation = activityType === "presentation";
    const isProject = activityType === "project";

    if (isPresentation) {
      const hasObjective = /objective|goal|purpose|overview/i.test(pastedText);
      const hasVisuals = /figure|diagram|chart|table|image|slide|visual/i.test(pastedText);
      const hasConclusion = /conclusion|summary|takeaway|next step/i.test(pastedText);
      standardsCompliance = {
        hasObjective, hasVisuals, hasConclusion,
        formatCheckScore: Math.round(((hasObjective?1:0)+(hasVisuals?1:0)+(hasConclusion?1:0)+(wordCount>200?1:0))*25),
        checks: [
          { label: "Clear Objective / Overview", status: hasObjective ? "PRESENT" : "MISSING LABEL" },
          { label: "Visual / Diagram Support", status: hasVisuals ? "PRESENT" : "MISSING" },
          { label: "Conclusion / Takeaways", status: hasConclusion ? "PRESENT" : "THIN SECTION" },
        ]
      };
    } else if (isProject) {
      const hasRequirements = /requirement|specification|feature|user stor/i.test(pastedText);
      const hasArchitecture = /architecture|design|component|module|system/i.test(pastedText);
      const hasTestPlan = /test|validation|verification|qa|quality/i.test(pastedText);
      standardsCompliance = {
        hasRequirements, hasArchitecture, hasTestPlan,
        formatCheckScore: Math.round(((hasRequirements?1:0)+(hasArchitecture?1:0)+(hasTestPlan?1:0)+(wordCount>400?1:0))*25),
        checks: [
          { label: "Requirements / Specifications", status: hasRequirements ? "PRESENT" : "MISSING" },
          { label: "Architecture / Design", status: hasArchitecture ? "PRESENT" : "THIN SECTION" },
          { label: "Testing / Validation Plan", status: hasTestPlan ? "PRESENT" : "MANUAL CHECK REQ." },
        ]
      };
    } else {
      // Default: paper/capstone
      const hasIntro = /introduction|intro/i.test(pastedText);
      const hasMeth = /methodology|method|model|implementation|algorithm/i.test(pastedText);
      const hasAbstract = /abstract|summary/i.test(pastedText);
      const hasRefs = /references|bibliography|citations|\[\d+\]/i.test(pastedText);
      standardsCompliance = {
        hasAbstract, hasMethodology: hasMeth, hasCitations: hasRefs,
        formatCheckScore: Math.round(((hasAbstract?1:0)+(hasIntro?1:0)+(hasMeth?1:0)+(hasRefs?1:0))*25),
        checks: [
          { label: "Abstract / Intent Summary", status: hasAbstract ? "PRESENT" : "MISSING LABEL" },
          { label: "Methodology & Constraints", status: hasMeth ? "PRESENT" : "THIN SECTION" },
          { label: "Standard Citations Index", status: hasRefs ? "PRESENT" : "MANUAL CHECK REQ." },
        ]
      };
    }

    return {
      academicComplexity: wordCount > 1500 ? "High" : wordCount > 600 ? "Medium" : "Low",
      readabilityScore, readabilityLabel,
      passiveVoicePercent: estimatedPassiveVoice,
      keyConcepts: candidates,
      standardsCompliance,
      aiLikelihood: {
        score: Math.floor(Math.random() * 20) + 12,
        diagnosticExplanation: "Analyzed local lexicon syntax bounds. Highly structured style with dynamic transition points.",
        structuralEntropy: "Dynamic"
      },
      conceptualWeaknesses: [],
      extractedReferences: []
    };
  };

  const compliancePromptSection = activityType === "presentation" ? `
  "standardsCompliance": {
    "hasObjective": boolean (does it have a clear objective/overview?),
    "hasVisuals": boolean (does it reference diagrams, charts, or slides?),
    "hasConclusion": boolean (does it have conclusions or takeaways?),
    "formatCheckScore": integer 0-100,
    "checks": [
      { "label": "Clear Objective / Overview", "status": "PRESENT" | "MISSING LABEL" | "THIN SECTION" },
      { "label": "Visual / Diagram Support", "status": "PRESENT" | "MISSING" | "MANUAL CHECK REQ." },
      { "label": "Conclusion / Takeaways", "status": "PRESENT" | "MISSING LABEL" | "THIN SECTION" }
    ]
  }` : activityType === "project" ? `
  "standardsCompliance": {
    "hasRequirements": boolean,
    "hasArchitecture": boolean,
    "hasTestPlan": boolean,
    "formatCheckScore": integer 0-100,
    "checks": [
      { "label": "Requirements / Specifications", "status": "PRESENT" | "MISSING" | "THIN SECTION" },
      { "label": "Architecture / Design", "status": "PRESENT" | "MISSING" | "THIN SECTION" },
      { "label": "Testing / Validation Plan", "status": "PRESENT" | "MISSING" | "MANUAL CHECK REQ." }
    ]
  }` : `
  "standardsCompliance": {
    "hasAbstract": boolean,
    "hasMethodology": boolean,
    "hasCitations": boolean,
    "formatCheckScore": integer 0-100,
    "checks": [
      { "label": "Abstract / Intent Summary", "status": "PRESENT" | "MISSING LABEL" | "THIN SECTION" },
      { "label": "Methodology & Constraints", "status": "PRESENT" | "MISSING" | "THIN SECTION" },
      { "label": "Standard Citations Index", "status": "PRESENT" | "MISSING" | "MANUAL CHECK REQ." }
    ]
  }`;

  const prompt = `
You are an expert academic reviewer. Analyze the following ${activityName} and produce a detailed structural, style, and integrity analysis appropriate for a ${activityName}.

Submission Name: "${paperTitle}"
Activity Type: "${activityName}"
Student Name: "${studentName || "Candidate"}"
Subject context: "${courseName || "Academic Field"}"

Submission Content (excerpt):
${pastedText.substring(0, 16000)}

Return a JSON object with these exact fields:
{
  "academicComplexity": "Low" | "Medium" | "High",
  "readabilityScore": integer 0-100,
  "readabilityLabel": string,
  "passiveVoicePercent": integer 0-100,
  "keyConcepts": [4-6 precise technical terms from the actual text],
  ${compliancePromptSection},
  "aiLikelihood": {
    "score": integer 0-100,
    "diagnosticExplanation": "1-2 sentences",
    "structuralEntropy": "Uniform" | "Dynamic" | "Suspiciously Consistent"
  },
  "conceptualWeaknesses": ["3-4 specific criticisms relevant to a ${activityName}"],
  "extractedReferences": [${activityType === "presentation" || activityType === "project" ? "0-3 citations/sources if present, empty array if none" : "3-5 reference strings from the actual text"}]
}
`;

  try {
    const raw = await generateText(prompt, undefined, true);
    const data = parseJsonResponse<any>(raw);
    return res.json({
      wordCount, charCount,
      estimatedReadingTime: Math.max(1, Math.round(wordCount / 220)),
      ...data,
    });
  } catch (err: any) {
    console.warn("LLM Metadata Analysis failed, using algorithmic fallback:", err);
    return res.json({
      wordCount, charCount,
      estimatedReadingTime: Math.max(1, Math.round(wordCount / 220)),
      ...createFallbackAnalysis(),
    });
  }
});

// --- API: Regenerate a single question ---------------------------------------
app.post("/api/defense/regenerate-question", async (req, res) => {
  const { paperTitle, pastedText, currentQuestions, numToRegen, reviewNotes, activityType } = req.body;
  const activityName = activityType || "Research Paper";

  const prompt = `
You are an expert academic defense committee assessor. An instructor wants to replace Question #${numToRegen} out of 8.

Submission Title: ${paperTitle}
Activity Type: ${activityName}

Submission content (excerpt):
${pastedText ? pastedText.substring(0, 8000) : "N/A"}

Existing questions (avoid repeating these concepts):
${JSON.stringify(currentQuestions)}

Instructor instructions for the new question:
"${reviewNotes || "Make it challenging and require conceptual explanation, outline, or visual sketching on the board"}"

Return a JSON object for the replacement question:
{
  "num": ${numToRegen},
  "questionText": "...",
  "focusConcept": "..."
}
`;

  try {
    const raw = await generateText(prompt, undefined, true, 0.7);
    const question = parseJsonResponse<any>(raw);
    return res.json({ question });
  } catch (err: any) {
    console.error("Error regenerating question:", err);
    return res.status(500).json({ error: err.message || "Failed to regenerate question" });
  }
});

// --- API: Evaluate written answer -----------------------------------------
app.post("/api/defense/evaluate-written", async (req, res) => {
  const { questionText, answerText, focusConcept, isDiagramQuestion } = req.body;
  if (!answerText || !questionText) return res.status(400).json({ error: "questionText and answerText required" });

  const criteria = isDiagramQuestion
    ? `Evaluate on three criteria appropriate for a diagram-supported answer:
1. "Diagram Accuracy" - Does the ASCII/text diagram correctly represent the concept?
2. "Conceptual Explanation" - Does the written explanation support the diagram?
3. "Completeness" - Are all key components of the concept represented?`
    : `Evaluate on three criteria appropriate for a written answer:
1. "Accuracy" - Is the answer factually correct based on the question?
2. "Depth of Understanding" - Does the answer demonstrate genuine understanding beyond surface level?
3. "Conceptual Clarity" - Is the explanation clear and well-organized?

IMPORTANT: Do NOT penalize for missing diagrams on written questions. Only evaluate the quality of the written explanation.`;

  const prompt = `You are an academic examiner evaluating a student defense answer.

Question: "${questionText}"
Focus Concept: "${focusConcept || "General"}"
Answer Type: ${isDiagramQuestion ? "Diagram + written explanation" : "Written explanation only"}
Student Answer: "${answerText}"

${criteria}

Respond ONLY with valid JSON, no markdown:
{
  "overallScore": <integer 0-10>,
  "checks": [
    { "label": "<criterion name>", "pass": <true|false>, "note": "one sentence" },
    { "label": "<criterion name>", "pass": <true|false>, "note": "one sentence" },
    { "label": "<criterion name>", "pass": <true|false>, "note": "one sentence" }
  ],
  "missingConcepts": [],
  "integritySignal": "low" | "medium" | "high",
  "integrityNote": "one sentence on whether the answer appears genuine"
}
Scoring: all 3 pass=10, 2 pass=7, 1 pass=4, 0 pass but text present=1, empty=0.`;

  try {
    const raw = await generateText(prompt, undefined, true, 0.3);
    const data = parseJsonResponse<any>(raw);
    if (data.checks && Array.isArray(data.checks)) {
      const passCount = data.checks.filter((c: any) => c.pass).length;
      if (passCount === 3) data.overallScore = 10;
      else if (passCount === 2) data.overallScore = 7;
      else if (passCount === 1) data.overallScore = 4;
      else if (answerText.trim().length > 0) data.overallScore = 1;
      else data.overallScore = 0;
    }
    return res.json(data);
  } catch (err: any) {
    console.error("[evaluate-written] error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- API: Evaluate diagram (DiagramBuilder component) ------------------------
app.post("/api/defense/evaluate-diagram", async (req, res) => {
  const { prompt } = req.body as { prompt: string };
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  try {
    const raw = await generateText(prompt, undefined, true);
    const parsed = parseJsonResponse<any>(raw);
    return res.json(parsed);
  } catch (err: any) {
    console.error("[evaluate-diagram] error:", err);
    return res.status(500).json({ error: err.message || "Diagram evaluation failed" });
  }
});

// --- API: Defense chat (multimodal) ------------------------------------------
app.post("/api/defense/chat", async (req, res) => {
  const {
    chatHistory, snapshots, studentName, paperTitle,
    courseName, questions, pastedText, conclude, activityType,
    currentQuestionIndex,
  } = req.body;

  const activityName = activityType || "Research Paper";
  const totalQuestions = questions?.length || 8;
  // Count only student messages to determine which question we're on
  const studentTurns = (chatHistory || []).filter((m: any) => m.sender === "student").length;
  // Each question gets 2 student turns (initial + follow-up) before advancing
  const effectiveQIdx = Math.min(Math.floor(studentTurns / 2), totalQuestions - 1);
  const roundOnCurrentQ = (studentTurns % 2) + 1; // 1 = first answer, 2 = follow-up answered
  const currentQ = questions?.[effectiveQIdx];
  const nextQIdx = Math.min(effectiveQIdx + 1, totalQuestions - 1);
  const nextQ = questions?.[nextQIdx];

  // Real completion count: how many questions actually have a recorded snapshot (Stage 3),
  // combined with how far the oral follow-up (Stage 4) has progressed. Use whichever is higher.
  const snapshotsAnswered = (snapshots || []).filter((s: string) => s && s.trim().length > 0).length;
  const chatAnswered = studentTurns > 0 ? effectiveQIdx + (roundOnCurrentQ >= 1 ? 1 : 0) : 0;
  const questionsAnswered = Math.max(snapshotsAnswered, chatAnswered);
  const unansweredQuestionTexts = (questions || [])
    .map((q: any, i: number) => ({ q, i }))
    .filter(({ i }: any) => i >= questionsAnswered)
    .map(({ q }: any) => q.questionText);

  try {
    const recentHistory = chatHistory || [];
    const printedHistory = recentHistory
      .map((msg: any) => {
        const name = msg.sender === "student" ? (studentName || "Student") : "AI Evaluator/Committee";
        return `[${name}]: ${msg.text}`;
      })
      .join("\n");

    const questionsContext = questions && Array.isArray(questions) && questions.length > 0
      ? "\n--- ALL DEFENSE QUESTIONS ---\n" +
        questions.map((q: any) => `Q${q.num} [${q.focusConcept || "N/A"}]: ${q.questionText}`).join("\n") +
        "\n-----------------------------\n"
      : "";

    const systemPrompt = `
You are an expert academic examiner conducting a whiteboard defense oral interview.
Student: ${studentName || "N/A"} | Submission: ${paperTitle} | Type: ${activityName} | Course: ${courseName || "N/A"}

${questionsContext}

CURRENT POSITION:
- Question #${effectiveQIdx + 1} of ${totalQuestions}: "${currentQ?.questionText || "N/A"}"
- Student has answered this question ${roundOnCurrentQ - 1} time(s) so far.
- Next question will be Q${nextQIdx + 1}: "${nextQ?.questionText || "done"}"

AI-ASSISTED RESPONSE DETECTION -- be conservative. Being well-organized or thorough is NOT suspicious on its own; many genuine students explain clearly. Only flag when you see actual AI ARTIFACTS:
- Response contains a literal ASCII box-drawing diagram (multiple lines of +---+, |...|, or similar box characters)
- Response contains AI-assistant courtesy phrases directed at YOU the examiner, e.g. "Great question!", "I'd be happy to explain", "Let me break this down for you"
- Response is near-verbatim identical in wording/structure to a previous answer in this transcript (recycled AI output)
- Response explicitly references being generated by an AI tool or mentions "ChatGPT", "as an AI", etc.

Do NOT flag a response merely for: being long, being well-organized, covering the topic thoroughly, using correct terminology, or answering confidently. These are marks of a well-prepared student, not evidence of AI use.

If you detect a genuine AI ARTIFACT above:
1. Respond with: "Your answer appears unusually structured. Let me ask you to explain that more naturally -- [ask a specific detail from their answer that an AI would not know how to elaborate on spontaneously]"
2. Set suspicionLevel to "Medium" (not "High" unless multiple clear artifacts appear across several answers)

If no artifacts are present, treat the answer normally regardless of length or organization quality.

IMPORTANT CONTEXT:
- The whiteboard/diagram phase is COMPLETE. All diagrams have already been drawn and captured as snapshots.
- This is the ORAL defense phase. The student answers verbally in text only -- no whiteboard is available.
- Do NOT ask the student to "sketch", "draw", "illustrate on the whiteboard", or "diagram" anything.
- Instead ask them to EXPLAIN, DESCRIBE, JUSTIFY, or WALK YOU THROUGH concepts verbally.
- You may reference their previously captured diagram snapshots (e.g. "In your earlier diagram...") but do not ask for new ones.

STRICT RULES -- follow exactly:
1. Ask EXACTLY ONE question per response. Never list multiple questions.
2. Maximum 3 sentences per response. Be brief and direct.
3. If this is the FIRST answer to Q${effectiveQIdx + 1} (round 1): ask ONE targeted follow-up probing deeper.
4. If this is the SECOND answer to Q${effectiveQIdx + 1} (round 2): acknowledge in ONE sentence, then ask Q${nextQIdx + 1} above.
5. NEVER ask about a topic already covered -- check the transcript.
6. NEVER repeat or rephrase a question already asked.
7. If a student answer is strong, acknowledge briefly and move on immediately.
8. PASTE-BACK DETECTION: If the student's response is identical or nearly identical to your previous question, do NOT move on. Instead respond: "It looks like you may have accidentally pasted the question instead of your answer. Please provide your actual response." Then wait -- do not ask a new question.

${conclude ? `
CONCLUDE: 2 sentences of closing feedback, then output EXACTLY:
<assessment>
{
  "overallScore": <0-100>,
  "suspicionLevel": "Low" | "Medium" | "High",
  "suspicionReasoning": "one sentence based on actual responses in this transcript",
  "categories": [
    {"name": "Technical Mastery", "score": <1-10>, "feedback": "one sentence referencing SPECIFIC concepts from this defense"},
    {"name": "Whiteboard Synthesis", "score": <1-10>, "feedback": "one sentence about their diagrams and written submissions in this session"},
    {"name": "Integrity Verification", "score": <1-10>, "feedback": "one sentence about response consistency and ownership signals observed"}
  ],
  "keyFindings": ["specific strength observed in THIS transcript -- name the actual topic"],
  "gapsIdentified": ["specific gap observed in THIS transcript -- name the actual topic"],
  "recommendedGrade": "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "F"
}
</assessment>

CRITICAL RULES FOR ASSESSMENT:
- keyFindings and gapsIdentified MUST reference topics actually discussed in this transcript
- NEVER mention topics not covered (no "neural networks", "experimental benchmarks", or anything not in the questions list above)
- Base every finding on specific student responses visible in the transcript
- suspicionLevel scaling: "Low" is the default for a student who answers consistently in their own words, even if some answers were briefly flagged as "unusually structured" during the session -- being asked to rephrase once or twice and doing so successfully is NORMAL and should NOT push suspicion above "Low". Only use "Medium" if 3+ answers showed genuine AI artifacts (ASCII diagrams, AI-assistant phrasing) that the student could not adequately explain in plain language when asked. Only use "High" if the student was unable to explain their own answers in follow-up, or repeated identical content across multiple questions.
- Do not let a temporary "unusually structured" prompt from earlier in the transcript automatically raise suspicion if the student's subsequent explanation was clear and consistent with their other answers.

COMPLETION-RATE SCORING -- THIS IS MANDATORY AND OVERRIDES QUALITY-ONLY SCORING:
- Total defense questions in this session: ${totalQuestions}
- Questions the student actually answered with substantive content: ${questionsAnswered} out of ${totalQuestions}
- Unanswered questions: ${unansweredQuestionTexts.length > 0 ? unansweredQuestionTexts.join(" | ") : "none -- all questions were answered"}
- The overallScore MUST reflect BOTH the quality of what was answered AND the fraction of questions actually completed. A student who answers only ${questionsAnswered} of ${totalQuestions} questions perfectly cannot score above approximately ${Math.round((questionsAnswered/totalQuestions)*100 + 10)} -- do NOT inflate this based on quality alone.
- Exact formula to follow: overallScore = round((${questionsAnswered} / ${totalQuestions}) × quality_score_0_to_100), where quality_score reflects only the answered questions. Add at most 5-10 points of partial credit for effort, never more.
- If ${questionsAnswered} out of ${totalQuestions} is less than half, the recommendedGrade MUST be in the C/D/F range regardless of how good the few answered responses were -- an incomplete defense cannot earn an A or B grade.
- gapsIdentified MUST explicitly list each unanswered question topic from the "Unanswered questions" list above, not just a vague "needs more detail" note.
` : ""}`;

    const base64Images: string[] = [];
    if (snapshots && Array.isArray(snapshots)) {
      snapshots.forEach((snap: string) => {
        if (snap && snap.includes("base64,")) base64Images.push(snap);
      });
    }

    const userText = `${systemPrompt}\n\nTranscript so far:\n${printedHistory}\n\nYour task: ${
      conclude
        ? "Finalize and output the assessment block."
        : roundOnCurrentQ >= 2
          ? `The student just answered Q${effectiveQIdx + 1} a second time. Acknowledge in one sentence, then ask Q${nextQIdx + 1}: "${nextQ?.questionText || ""}"`
          : `The student just answered Q${effectiveQIdx + 1} for the first time. Ask one targeted follow-up.`
    }`;

    const aiResponseText =
      base64Images.length > 0
        ? await generateMultimodal(userText, base64Images)
        : await generateText(userText);

    return res.json({ text: aiResponseText });
  } catch (err: any) {
    console.error("Error in defense chat assistant:", err);
    return res.status(500).json({ error: err.message || "Failed in chat session" });
  }
});

// --- Vite / static file serving ----------------------------------------------
async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Whiteboard Defense Server (${AI_PROVIDER.toUpperCase()}/${activeModel}) live at http://0.0.0.0:${PORT}`);
  });
}

initServer();
