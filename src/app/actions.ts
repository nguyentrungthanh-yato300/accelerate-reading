"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import {
  articles,
  sessions,
  type ChunkPlan,
  type PurposeCoach,
  type PurposeType,
  type ReadingMode,
  type SummaryFeedback,
} from "@/db/schema";
import { coachPurpose, evaluateSummary, getModel } from "@/lib/ai";
import { extractFromUrl } from "@/lib/extract";
import { countWords, detectLanguage, unitLabel } from "@/lib/text";

export type FormState = { error?: string };

export async function createArticle(_prev: FormState, formData: FormData): Promise<FormState> {
  const url = String(formData.get("url") ?? "").trim();
  let title = String(formData.get("title") ?? "").trim();
  let content = String(formData.get("content") ?? "").trim();

  if (url) {
    try {
      new URL(url);
    } catch {
      return { error: "That URL is not valid." };
    }
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
    .values({ title, content, sourceUrl: url || null, language, wordCount })
    .returning({ id: articles.id });

  revalidatePath("/");
  redirect(`/read/${row.id}`);
}

export async function deleteArticle(id: number) {
  const db = await getDb();
  await db.delete(articles).where(eq(articles.id, id));
  revalidatePath("/");
  revalidatePath("/history");
}

/** AI feedback on the reader's purpose question, or suggested questions when it is empty. */
export async function checkPurpose(
  articleId: number,
  purpose: string,
): Promise<{ coach: PurposeCoach } | { error: string }> {
  const db = await getDb();
  const article = await db.query.articles.findFirst({ where: eq(articles.id, articleId) });
  if (!article) return { error: "Article not found." };
  const model = getModel();
  if (!model) return { error: "AI is not configured." };
  try {
    return { coach: await coachPurpose(model, { text: article.content, language: article.language, purpose }) };
  } catch (e) {
    console.error("Purpose coaching failed", e);
    return { error: "Could not check your question. Check your AI configuration." };
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
  const db = await getDb();
  const [row] = await db
    .insert(sessions)
    .values({
      articleId: input.articleId,
      mode: input.mode,
      purpose: input.purpose.trim() || null,
      purposeType: input.purposeType,
      prediction: input.prediction.trim() || null,
      preAnswers: input.preAnswers?.map((a) => a.trim()) ?? null,
      previewMs: Math.round(input.previewMs),
    })
    .returning({ id: sessions.id });
  return row.id;
}

export async function finishReading(
  sessionId: number,
  readMs: number,
  /** Time-weighted pacer speed and phrasing, when the pacer ran for most of the read. */
  pacer: { wpm: number; chunks: ChunkPlan["source"] } | null,
): Promise<{ wpm: number }> {
  const db = await getDb();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) throw new Error("Session not found");
  const article = await db.query.articles.findFirst({ where: eq(articles.id, session.articleId) });
  if (!article) throw new Error("Article not found");

  const ms = Math.max(1000, Math.round(readMs));
  const wpm = article.wordCount / (ms / 60_000);
  await db
    .update(sessions)
    .set({ readMs: ms, wpm, pacerWpm: pacer?.wpm ?? null, pacerChunks: pacer?.chunks ?? null, status: "recall" })
    .where(eq(sessions.id, sessionId));
  return { wpm };
}

export async function submitRecall(input: {
  sessionId: number;
  summary: string;
  answers: number[] | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await getDb();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, input.sessionId) });
  if (!session) return { ok: false, error: "Session not found." };
  const article = await db.query.articles.findFirst({ where: eq(articles.id, session.articleId) });
  if (!article) return { ok: false, error: "Article not found." };

  const quiz = article.quiz;
  let quizScore: number | null = null;
  if (quiz && input.answers && input.answers.length === quiz.questions.length) {
    const correct = quiz.questions.filter((q, i) => q.answerIndex === input.answers![i]).length;
    quizScore = correct / quiz.questions.length;
  }

  let feedback: SummaryFeedback | null = null;
  const model = getModel();
  if (model && quiz && input.summary.trim()) {
    try {
      feedback = await evaluateSummary(model, {
        text: article.content,
        language: article.language,
        keyPoints: quiz.keyPoints,
        summary: input.summary,
        purpose: session.purpose,
        prediction: session.prediction,
        mode: session.mode,
      });
    } catch (e) {
      console.error("Summary evaluation failed", e);
    }
  }

  await db
    .update(sessions)
    .set({
      summary: input.summary.trim() || null,
      quizAnswers: input.answers,
      quizScore,
      summaryFeedback: feedback,
      summaryScore: feedback?.score ?? null,
      effectiveWpm: quizScore !== null && session.wpm ? session.wpm * quizScore : null,
      status: "done",
      completedAt: new Date(),
    })
    .where(eq(sessions.id, input.sessionId));

  revalidatePath("/");
  revalidatePath("/history");
  return { ok: true };
}
