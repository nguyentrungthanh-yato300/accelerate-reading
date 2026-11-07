import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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

export type AiProvider = "google" | "anthropic" | "openai" | "deepseek" | "openai-compatible";

// --- Auth (Better Auth's core tables; column names follow its defaults) ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --- App ---

/** Each user's AI provider. The API key is stored encrypted (see src/lib/crypto.ts) and never
 * sent back to the browser. */
export const aiSettings = pgTable("ai_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").$type<AiProvider>().notNull(),
  model: text("model"),
  baseUrl: text("base_url"),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  /** Last 4 characters, to show which key is saved. */
  apiKeyHint: text("api_key_hint").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sourceUrl: text("source_url"),
    language: text("language").$type<Language>().notNull(),
    wordCount: integer("word_count").notNull(),
    quiz: jsonb("quiz").$type<Quiz>(),
    chunks: jsonb("chunks").$type<ChunkPlan>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("articles_user_id_idx").on(t.userId)],
);

export const readingSessions = pgTable(
  "reading_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    status: text("status").$type<SessionStatus>().notNull().default("reading"),
    mode: text("mode").$type<ReadingMode>().notNull(),
    purpose: text("purpose"),
    purposeType: text("purpose_type").$type<PurposeType>(),
    prediction: text("prediction"),
    preAnswers: jsonb("pre_answers").$type<string[]>(),
    previewMs: integer("preview_ms"),
    readMs: integer("read_ms"),
    pacerWpm: integer("pacer_wpm"),
    /** How the pacer's phrases were made; null when the pacer was off or used fixed 3-word chunks. */
    pacerChunks: text("pacer_chunks").$type<ChunkPlan["source"]>(),
    wpm: doublePrecision("wpm"),
    summary: text("summary"),
    summaryScore: doublePrecision("summary_score"),
    summaryFeedback: jsonb("summary_feedback").$type<SummaryFeedback>(),
    quizAnswers: jsonb("quiz_answers").$type<number[]>(),
    quizScore: doublePrecision("quiz_score"),
    effectiveWpm: doublePrecision("effective_wpm"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("reading_sessions_user_id_idx").on(t.userId)],
);

export type Article = typeof articles.$inferSelect;
export type ReadingSession = typeof readingSessions.$inferSelect;
