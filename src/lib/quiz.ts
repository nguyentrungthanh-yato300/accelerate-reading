import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, type Quiz } from "@/db/schema";
import { generateQuiz, getModel } from "@/lib/ai";

export type QuizResult = { quiz: Quiz | null; error?: string };

/** Generates (once) and caches the comprehension quiz and warm-up questions for an article. */
export async function ensureQuiz(articleId: number): Promise<QuizResult> {
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
