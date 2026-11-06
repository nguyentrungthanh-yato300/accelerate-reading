import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type Language = "en" | "vi";
export type ReadingMode = "skim" | "deep";
export type SessionStatus = "reading" | "recall" | "done";

export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

export type Quiz = {
  keyPoints: string[];
  questions: QuizQuestion[];
};

export type SummaryFeedback = {
  score: number;
  coveredPoints: string[];
  missedPoints: string[];
  inaccuracies: string[];
  purposeAnswered: boolean | null;
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
  prediction: text("prediction"),
  previewMs: integer("preview_ms"),
  readMs: integer("read_ms"),
  pacerWpm: integer("pacer_wpm"),
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
