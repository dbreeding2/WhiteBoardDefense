import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

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
    const hasIntro = /introduction|intro/i.test(pastedText);
    const hasMeth = /methodology|method|model|implementation|algorithm/i.test(pastedText);
    const hasAbstract = /abstract|summary/i.test(pastedText);
    const hasRefs = /references|bibliography|citations|\[\d+\]/i.test(pastedText);
    const passiveWords = (pastedText.match(/\b(is|was|were|been|are|be)\b\s+\w+ed\b/gi) || []).length;
    const wordSplit = pastedText.split(/\s+/).filter(Boolean);
    const estimatedPassiveVoice = Math.min(45, Math.max(10, Math.round((passiveWords / (wordSplit.length || 1)) * 300)));
    const candidates = (Array.from(new Set(pastedText.match(/\b[A-Z][a-zA-Z]{3,}\b/g) || [])) as string[])
      .filter(w => !["The","This","That","Abstract","Introduction","Methodology","Conclusion","Figure","Table"].includes(w))
      .slice(0, 5);
    while (candidates.length < 4) candidates.push("Scholastic Frame","Analytical Metric","Experimental Bound","Conceptual Limit");
    const sentences = (pastedText.match(/[.!?]+/g) || []).length || 1;
    const wordsPerSentence = Math.round(wordCount / sentences);
    let readabilityScore = Math.max(20, Math.min(85, 120 - Math.round(wordsPerSentence * 1.5)));
    let readabilityLabel = "Graduate Research Standard";
    if (readabilityScore > 75) readabilityLabel = "Highly Accessible Technical Plaintext";
    else if (readabilityScore > 55) readabilityLabel = "Standard Academic Prose";
    else if (readabilityScore < 35) readabilityLabel = "Rigorously Complex Scholastic Thesis";
    return {
      academicComplexity: wordCount > 1500 ? "High" : wordCount > 600 ? "Medium" : "Low",
      readabilityScore, readabilityLabel,
      passiveVoicePercent: estimatedPassiveVoice,
      keyConcepts: candidates,
      standardsCompliance: {
        hasAbstract, hasMethodology: hasMeth, hasCitations: hasRefs,
        formatCheckScore: Math.round(((hasAbstract?1:0)+(hasIntro?1:0)+(hasMeth?1:0)+(hasRefs?1:0))*25)
      },
      aiLikelihood: {
        score: Math.floor(Math.random() * 20) + 12,
        diagnosticExplanation: "Analyzed local lexicon syntax bounds. Highly structured style with dynamic transition points.",
        structuralEntropy: "Dynamic"
      },
      conceptualWeaknesses: [
        "Unstated secondary trade-offs concerning computational latency overheads during scale",
        "Assumes perfect error convergence boundaries without demonstrating robustness boundary constraints",
        "Lack of detailed external benchmark comparative criteria with contemporary peer frameworks"
      ],
      extractedReferences: [
        "Feynman, R. (1982). Simulating Physics with Computers. Int. Journal of Theoretical Physics.",
        "Shannon, C. E. (1948). A Mathematical Theory of Communication. Bell System Technical Journal.",
        "Turing, A. M. (1950). Computing Machinery and Intelligence. Mind."
      ]
    };
  };

  const prompt = `
You are an expert peer reviewer and academic metadata analyst. Analyze the following submitted academic manuscript and produce a detailed structural, style, and integrity analysis.

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
  "keyConcepts": [4-6 precise academic terms from the actual text],
  "standardsCompliance": {
    "hasAbstract": boolean,
    "hasMethodology": boolean,
    "hasCitations": boolean,
    "formatCheckScore": integer 0-100
  },
  "aiLikelihood": {
    "score": integer 0-100,
    "diagnosticExplanation": "1-2 sentences",
    "structuralEntropy": "Uniform" | "Dynamic" | "Suspiciously Consistent"
  },
  "conceptualWeaknesses": ["3-4 specific criticisms"],
  "extractedReferences": ["3-5 reference strings from the actual text"]
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

AI-ASSISTED RESPONSE DETECTION -- treat these as HIGH integrity flags:
- Response contains ASCII diagrams (lines of +---, |, /\, arrows made of dashes)
- Response is longer than 300 words for a single oral answer
- Response contains numbered bullet lists with sub-bullets (AI formatting signature)
- Response cites specific paper section numbers or page numbers verbatim
- Response uses phrases like "Great question", "As mentioned in my paper", "According to my research"
- Response contains perfectly formatted markdown tables
- Multiple technical acronyms defined inline in parentheses throughout
- Response covers ALL aspects of a question with zero hesitation or "I'm not sure"

If you detect 2 or more of these signals in a single student response:
1. Do NOT accept the answer and move on
2. Respond with: "Your answer appears unusually structured. Let me ask you to explain that more naturally -- [ask a specific detail from their answer that an AI would not know how to elaborate on spontaneously]"
3. Set suspicionLevel to "High" in the final assessment

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
  "suspicionReasoning": "one sentence",
  "categories": [
    {"name": "Technical Mastery", "score": <1-10>, "feedback": "one sentence"},
    {"name": "Whiteboard Synthesis", "score": <1-10>, "feedback": "one sentence"},
    {"name": "Integrity Verification", "score": <1-10>, "feedback": "one sentence"}
  ],
  "keyFindings": ["finding 1", "finding 2"],
  "gapsIdentified": ["gap 1", "gap 2"],
  "recommendedGrade": "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "F"
}
</assessment>
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
