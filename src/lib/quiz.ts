import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, type Quiz } from "@/db/schema";
import { generateQuiz } from "@/lib/ai";
import { getUserModel } from "@/lib/ai-settings";

export type QuizResult = { quiz: Quiz | null; error?: string };

/** Generates (once) and caches the comprehension quiz and warm-up questions for a user's article. */
export async function ensureQuiz(userId: string, articleId: number): Promise<QuizResult> {
  const db = await getDb();
  const article = await db.query.articles.findFirst({
    where: and(eq(articles.id, articleId), eq(articles.userId, userId)),
  });
  if (!article) return { quiz: null, error: "Article not found." };
  if (article.quiz) return { quiz: article.quiz };

  const model = await getUserModel(userId);
  if (!model) return { quiz: null, error: "Add your AI API key in Settings first." };
  try {
    const quiz = await generateQuiz(model, article.content, article.language);
    await db.update(articles).set({ quiz }).where(eq(articles.id, articleId));
    return { quiz };
  } catch (e) {
    console.error("Quiz generation failed", e);
    return { quiz: null, error: "Could not generate questions. Check your AI settings." };
  }
}
