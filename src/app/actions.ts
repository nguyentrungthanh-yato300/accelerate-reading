"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import {
  aiSettings,
  articles,
  readingSessions,
  type AiProvider,
  type ChunkPlan,
  type ExplanationFeedback,
  type PurposeCoach,
  type PurposeType,
  type ReadingMode,
  type SummaryFeedback,
} from "@/db/schema";
import { coachPurpose, evaluateExplanation, evaluateSummary } from "@/lib/ai";
import { getUserModel } from "@/lib/ai-settings";
import { INVITE_COOKIE, isValidInvite } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/dal";
import { extractFromUrl } from "@/lib/extract";
import { AI_PROVIDERS } from "@/lib/providers";
import { countWords, detectLanguage, unitLabel } from "@/lib/text";

export type FormState = { error?: string; ok?: boolean };

// Server Actions are reachable by direct POST, so each one checks the user and, for existing
// records, that the record belongs to them.

async function ownArticle(userId: string, articleId: number) {
  const db = await getDb();
  return db.query.articles.findFirst({ where: and(eq(articles.id, articleId), eq(articles.userId, userId)) });
}

async function ownSession(userId: string, sessionId: number) {
  const db = await getDb();
  const session = await db.query.readingSessions.findFirst({
    where: and(eq(readingSessions.id, sessionId), eq(readingSessions.userId, userId)),
  });
  const article = session && (await ownArticle(userId, session.articleId));
  return session && article ? { session, article } : null;
}

export async function createArticle(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const url = String(formData.get("url") ?? "").trim();
  let title = String(formData.get("title") ?? "").trim();
  let content = String(formData.get("content") ?? "").trim();

  if (url) {
    try {
      const extracted = await extractFromUrl(url);
      content = extracted.content;
      title ||= extracted.title;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not import that URL." };
    }
  }

  const language = detectLanguage(content);
  const wordCount = countWords(content, language);
  // About 50 words' worth of text; a Chinese word averages about two characters.
  const minUnits = language === "zh" ? 100 : 50;
  if (wordCount < minUnits) return { error: `Please provide at least ${minUnits} ${unitLabel(language)} of text.` };
  if (!title) {
    const firstLine = content.split("\n").find((l) => l.trim()) ?? "Untitled";
    title = firstLine.replace(/^#+\s*/, "").slice(0, 100);
  }

  const db = await getDb();
  const [row] = await db
    .insert(articles)
    .values({ userId: user.id, title, content, sourceUrl: url || null, language, wordCount })
    .returning({ id: articles.id });

  revalidatePath("/");
  redirect(`/read/${row.id}`);
}

export async function deleteArticle(id: number) {
  const user = await requireUser();
  const db = await getDb();
  await db.delete(articles).where(and(eq(articles.id, id), eq(articles.userId, user.id)));
  revalidatePath("/");
  revalidatePath("/history");
}

/** AI feedback on the reader's purpose question, or suggested questions when it is empty. */
export async function checkPurpose(
  articleId: number,
  purpose: string,
): Promise<{ coach: PurposeCoach } | { error: string }> {
  const user = await requireUser();
  const article = await ownArticle(user.id, articleId);
  if (!article) return { error: "Article not found." };
  const model = await getUserModel(user.id);
  if (!model) return { error: "Add your AI API key in Settings first." };
  try {
    return { coach: await coachPurpose(model, { text: article.content, language: article.language, purpose }) };
  } catch (e) {
    console.error("Purpose coaching failed", e);
    return { error: "Could not check your question. Check your AI settings." };
  }
}

export async function startSession(input: {
  articleId: number;
  mode: ReadingMode;
  purpose: string;
  purposeType: PurposeType | null;
  prediction: string;
  preAnswers: string[] | null;
  previewMs: number;
}): Promise<number> {
  const user = await requireUser();
  if (!(await ownArticle(user.id, input.articleId))) throw new Error("Article not found");
  const db = await getDb();
  const [row] = await db
    .insert(readingSessions)
    .values({
      userId: user.id,
      articleId: input.articleId,
      mode: input.mode,
      purpose: input.purpose.trim() || null,
      purposeType: input.purposeType,
      prediction: input.prediction.trim() || null,
      preAnswers: input.preAnswers?.map((a) => a.trim()) ?? null,
      previewMs: Math.round(input.previewMs),
    })
    .returning({ id: readingSessions.id });
  return row.id;
}

export async function finishReading(
  sessionId: number,
  readMs: number,
  /** Time-weighted pacer speed and phrasing, when the pacer ran for most of the read. */
  pacer: { wpm: number; chunks: ChunkPlan["source"] } | null,
): Promise<{ wpm: number }> {
  const user = await requireUser();
  const own = await ownSession(user.id, sessionId);
  if (!own) throw new Error("Session not found");

  const ms = Math.max(1000, Math.round(readMs));
  const wpm = own.article.wordCount / (ms / 60_000);
  const db = await getDb();
  await db
    .update(readingSessions)
    .set({ readMs: ms, wpm, pacerWpm: pacer?.wpm ?? null, pacerChunks: pacer?.chunks ?? null, status: "recall" })
    .where(eq(readingSessions.id, sessionId));
  return { wpm };
}

export async function submitRecall(input: {
  sessionId: number;
  summary: string;
  answers: number[] | null;
  /** The optional 60-second explanation from the Explain step. */
  explanation: { text: string; ms: number; spoken: boolean } | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const own = await ownSession(user.id, input.sessionId);
  if (!own) return { ok: false, error: "Session not found." };
  const { session, article } = own;

  const quiz = article.quiz;
  let quizScore: number | null = null;
  if (quiz && input.answers && input.answers.length === quiz.questions.length) {
    const correct = quiz.questions.filter((q, i) => q.answerIndex === input.answers![i]).length;
    quizScore = correct / quiz.questions.length;
  }

  const explanation = input.explanation?.text.trim() ? input.explanation : null;
  const model = await getUserModel(user.id);
  // Both reviews run at once, so the Explain step adds no wait.
  const [feedback, explanationFeedback] = await Promise.all([
    model && quiz && input.summary.trim()
      ? evaluateSummary(model, {
          text: article.content,
          language: article.language,
          keyPoints: quiz.keyPoints,
          summary: input.summary,
          purpose: session.purpose,
          prediction: session.prediction,
          mode: session.mode,
        }).catch((e): SummaryFeedback | null => {
          console.error("Summary evaluation failed", e);
          return null;
        })
      : null,
    model && quiz && explanation
      ? evaluateExplanation(model, {
          text: article.content,
          language: article.language,
          keyPoints: quiz.keyPoints,
          explanation: explanation.text,
          seconds: explanation.ms / 1000,
          spoken: explanation.spoken,
        }).catch((e): ExplanationFeedback | null => {
          console.error("Explanation evaluation failed", e);
          return null;
        })
      : null,
  ]);

  const db = await getDb();
  await db
    .update(readingSessions)
    .set({
      summary: input.summary.trim() || null,
      quizAnswers: input.answers,
      quizScore,
      summaryFeedback: feedback,
      summaryScore: feedback?.score ?? null,
      explanation: explanation?.text.trim() ?? null,
      explanationMs: explanation ? Math.round(explanation.ms) : null,
      explanationSpoken: explanation?.spoken ?? null,
      explanationFeedback,
      // One number for trends: the mean of the three 0-10 scores, as 0-100.
      explanationScore: explanationFeedback
        ? ((explanationFeedback.clarity + explanationFeedback.completeness + explanationFeedback.accuracy) / 3) * 10
        : null,
      effectiveWpm: quizScore !== null && session.wpm ? session.wpm * quizScore : null,
      status: "done",
      completedAt: new Date(),
    })
    .where(eq(readingSessions.id, input.sessionId));

  revalidatePath("/");
  revalidatePath("/history");
  return { ok: true };
}

/** Saves the user's AI provider; the API key is encrypted before it is stored. Leaving the key
 * empty keeps the saved one (for changing only the provider's model or URL). */
export async function saveAiSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const provider = String(formData.get("provider") ?? "") as AiProvider;
  if (!(provider in AI_PROVIDERS)) return { error: "Choose a provider." };
  const model = String(formData.get("model") ?? "").trim() || null;
  const baseUrl = String(formData.get("baseUrl") ?? "").trim() || null;
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (AI_PROVIDERS[provider].needsBaseUrl) {
    if (!baseUrl || !/^https:\/\//.test(baseUrl)) return { error: "Enter the provider's https:// base URL." };
    if (!model) return { error: "Enter a model id." };
  }

  const db = await getDb();
  const existing = await db.query.aiSettings.findFirst({ where: eq(aiSettings.userId, user.id) });
  if (!apiKey && !existing) return { error: "Enter your API key." };

  const values = {
    provider,
    model,
    baseUrl: AI_PROVIDERS[provider].needsBaseUrl ? baseUrl : null,
    ...(apiKey && { apiKeyEncrypted: encrypt(apiKey), apiKeyHint: apiKey.slice(-4) }),
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(aiSettings).set(values).where(eq(aiSettings.userId, user.id));
  } else {
    await db.insert(aiSettings).values({ userId: user.id, ...values, apiKeyEncrypted: values.apiKeyEncrypted!, apiKeyHint: values.apiKeyHint! });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAiSettings() {
  const user = await requireUser();
  const db = await getDb();
  await db.delete(aiSettings).where(eq(aiSettings.userId, user.id));
  revalidatePath("/", "layout");
}

/** Before a new user signs up with a provider: checks the invite code and keeps it in a short-lived
 * cookie, which the auth server checks again when it creates the account. */
export async function prepareSignup(code: string): Promise<{ ok: boolean }> {
  if (!isValidInvite(code)) return { ok: false };
  (await cookies()).set(INVITE_COOKIE, code.trim(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return { ok: true };
}
