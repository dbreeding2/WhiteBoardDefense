export interface StudentMetadata {
  studentName: string;
  paperTitle: string;
  courseName: string;
  pastedText: string;
  fileName?: string;
  activityType?: string;
}

export interface DefenseQuestion {
  id: string;
  num: number;
  questionText: string;
  focusConcept: string;
  reviewNotes?: string;
}

export interface WhiteboardSnapshot {
  questionIndex: number;
  imageBase64: string; // "data:image/png;base64,..."
  timestamp: string;
}

export interface DrawingStroke {
  id: string;
  type: "pencil" | "rectangle" | "circle" | "text" | "eraser" | "block" | "arrow";
  color: string;
  width: number;
  points?: { x: number; y: number }[]; // for pencil
  x?: number; // for shapes / text
  y?: number;
  w?: number;
  h?: number;
  x2?: number; // for arrows start/end
  y2?: number;
  text?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'student' | 'system' | 'instructor';
  text: string;
  timestamp: string;
  snapshotUsed?: number; // Index of the whiteboard snapshot reference
}

export interface AssessmentCategory {
  name: string;
  score: number; // 0 to 10
  feedback: string;
}

export interface AIPreparedAssessment {
  overallScore: number; // 0 to 100
  suspicionLevel: 'Low' | 'Medium' | 'High'; // AI-generated vs self-written
  suspicionReasoning: string;
  categories: AssessmentCategory[];
  keyFindings: string[];
  gapsIdentified: string[];
  recommendedGrade: string;
}

export interface SessionState {
  currentStage: 'setup' | 'review' | 'session' | 'followup' | 'report';
  studentName: string;
  paperTitle: string;
  courseName: string;
  pastedText: string;
  questions: DefenseQuestion[];
  sessionId: string; // 6 characters
  currentQuestionIndex: number;
  canvasSyncTimestamp: number;
  role: 'both' | 'student' | 'instructor';
  snapshots: string[]; // array of base64 images corresponding to index 0-7
  chatHistory: ChatMessage[];
  assessment: AIPreparedAssessment | null;
  activityType?: string;
}
