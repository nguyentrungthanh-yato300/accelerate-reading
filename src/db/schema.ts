import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type Language = "en" | "vi" | "zh";
export type ReadingMode = "skim" | "deep";
export type SessionStatus = "reading" | "recall" | "done";
/** What the reader's purpose question asks for; drives the suggested reading mode. */
export type PurposeType = "lookup" | "gist" | "mechanism" | "apply";

export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

/** Open question the reader guesses at before reading (pretesting effect). */
export type PreQuestion = {
  question: string;
  answer: string;
};

export type Quiz = {
  keyPoints: string[];
  questions: QuizQuestion[];
  /** Missing on quizzes cached before pre-questions existed. */
  preQuestions?: PreQuestion[];
};

/** A phrase for the pacer: words [start, end) by global word index (see segmentWords). */
export type Chunk = { start: number; end: number; hard: boolean };

export type ChunkPlan = {
  /** "ai": segmented by the model (segments it got wrong fall back to rules). */
  source: "ai" | "rules";
  chunks: Chunk[];
};

export type PurposeCoach = {
  purposeType: PurposeType;
  specific: boolean;
  answerable: boolean;
  feedback: string;
  suggestions: string[];
};

export type SummaryFeedback = {
  score: number;
  coveredPoints: string[];
  missedPoints: string[];
  inaccuracies: string[];
  purposeAnswered: boolean | null;
  /** Missing on sessions graded before prediction checks existed. */
  predictionCheck?: string | null;
  feedback: string;
};

export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceUrl: text("source_url"),
  language: text("language").$type<Language>().notNull(),
  wordCount: integer("word_count").notNull(),
  quiz: text("quiz", { mode: "json" }).$type<Quiz>(),
  chunks: text("chunks", { mode: "json" }).$type<ChunkPlan>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  status: text("status").$type<SessionStatus>().notNull().default("reading"),
  mode: text("mode").$type<ReadingMode>().notNull(),
  purpose: text("purpose"),
  purposeType: text("purpose_type").$type<PurposeType>(),
  prediction: text("prediction"),
  preAnswers: text("pre_answers", { mode: "json" }).$type<string[]>(),
  previewMs: integer("preview_ms"),
  readMs: integer("read_ms"),
  pacerWpm: integer("pacer_wpm"),
  /** How the pacer's phrases were made; null when the pacer was off or used fixed 3-word chunks. */
  pacerChunks: text("pacer_chunks").$type<ChunkPlan["source"]>(),
  wpm: real("wpm"),
  summary: text("summary"),
  summaryScore: real("summary_score"),
  summaryFeedback: text("summary_feedback", { mode: "json" }).$type<SummaryFeedback>(),
  quizAnswers: text("quiz_answers", { mode: "json" }).$type<number[]>(),
  quizScore: real("quiz_score"),
  effectiveWpm: real("effective_wpm"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export type Article = typeof articles.$inferSelect;
export type Session = typeof sessions.$inferSelect;
