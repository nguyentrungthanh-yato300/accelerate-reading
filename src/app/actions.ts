"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { articles, sessions, type Quiz, type ReadingMode, type SummaryFeedback } from "@/db/schema";
import { evaluateSummary, generateQuiz, getModel } from "@/lib/ai";
import { extractFromUrl } from "@/lib/extract";
import { countWords, detectLanguage } from "@/lib/text";

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

  const wordCount = countWords(content);
  if (wordCount < 50) return { error: "Please provide at least 50 words of text." };
  if (!title) {
    const firstLine = content.split("\n").find((l) => l.trim()) ?? "Untitled";
    title = firstLine.replace(/^#+\s*/, "").slice(0, 100);
  }

  const db = await getDb();
  const [row] = await db
    .insert(articles)
    .values({ title, content, sourceUrl: url || null, language: detectLanguage(content), wordCount })
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

/** Generates (once) and caches the comprehension quiz for an article. */
export async function ensureQuiz(articleId: number): Promise<{ quiz: Quiz | null; error?: string }> {
  const db = await getDb();
  const article = await db.query.articles.findFirst({ where: eq(articles.id, articleId) });
  if (!article) return { quiz: null, error: "Article not found." };
  if (article.quiz) return { quiz: article.quiz };

  const model = getModel();
  if (!model) return { quiz: null, error: "AI is not configured." };
  try {
    const quiz = await generateQuiz(model, article.content, article.language);
    await db.update(articles).set({ quiz }).where(eq(articles.id, articleId));
    return { quiz };
  } catch (e) {
    console.error("Quiz generation failed", e);
    return { quiz: null, error: "Could not generate questions. Check your AI configuration." };
  }
}

export async function startSession(input: {
  articleId: number;
  mode: ReadingMode;
  purpose: string;
  prediction: string;
  previewMs: number;
  pacerWpm: number | null;
}): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(sessions)
    .values({
      articleId: input.articleId,
      mode: input.mode,
      purpose: input.purpose.trim() || null,
      prediction: input.prediction.trim() || null,
      previewMs: Math.round(input.previewMs),
      pacerWpm: input.pacerWpm,
    })
    .returning({ id: sessions.id });
  return row.id;
}

export async function finishReading(sessionId: number, readMs: number): Promise<{ wpm: number }> {
  const db = await getDb();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) throw new Error("Session not found");
  const article = await db.query.articles.findFirst({ where: eq(articles.id, session.articleId) });
  if (!article) throw new Error("Article not found");

  const ms = Math.max(1000, Math.round(readMs));
  const wpm = article.wordCount / (ms / 60_000);
  await db.update(sessions).set({ readMs: ms, wpm, status: "recall" }).where(eq(sessions.id, sessionId));
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
