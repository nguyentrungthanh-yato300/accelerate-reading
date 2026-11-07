import "server-only";
import { and, asc, desc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, readingSessions, type Language } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { MAX_PLAUSIBLE_WPM, PACER_MAX_WPM, PACER_MIN_WPM } from "@/lib/text";

// Every query is scoped to the signed-in user (requireUser also marks the render as request-time).

export async function listArticles() {
  const { id: userId } = await requireUser();
  const db = await getDb();
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      language: articles.language,
      wordCount: articles.wordCount,
      sourceUrl: articles.sourceUrl,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(eq(articles.userId, userId))
    .orderBy(desc(articles.createdAt));
  const done = await db
    .select({ articleId: readingSessions.articleId, wpm: readingSessions.wpm })
    .from(readingSessions)
    .where(and(eq(readingSessions.userId, userId), eq(readingSessions.status, "done")))
    .orderBy(asc(readingSessions.createdAt));
  const byArticle = new Map<number, { count: number; lastWpm: number | null }>();
  for (const s of done) {
    const prev = byArticle.get(s.articleId);
    byArticle.set(s.articleId, { count: (prev?.count ?? 0) + 1, lastWpm: s.wpm });
  }
  return rows.map((r) => ({ ...r, sessions: byArticle.get(r.id)?.count ?? 0, lastWpm: byArticle.get(r.id)?.lastWpm ?? null }));
}

export async function getArticle(id: number) {
  const { id: userId } = await requireUser();
  const db = await getDb();
  return db.query.articles.findFirst({ where: and(eq(articles.id, id), eq(articles.userId, userId)) });
}

export async function getSessionWithArticle(id: number) {
  const { id: userId } = await requireUser();
  const db = await getDb();
  const session = await db.query.readingSessions.findFirst({
    where: and(eq(readingSessions.id, id), eq(readingSessions.userId, userId)),
  });
  if (!session) return null;
  const article = await db.query.articles.findFirst({
    where: and(eq(articles.id, session.articleId), eq(articles.userId, userId)),
  });
  if (!article) return null;
  return { session, article };
}

export async function listCompletedSessions() {
  const { id: userId } = await requireUser();
  const db = await getDb();
  return db
    .select({
      id: readingSessions.id,
      createdAt: readingSessions.createdAt,
      mode: readingSessions.mode,
      wpm: readingSessions.wpm,
      quizScore: readingSessions.quizScore,
      summaryScore: readingSessions.summaryScore,
      effectiveWpm: readingSessions.effectiveWpm,
      readMs: readingSessions.readMs,
      title: articles.title,
      language: articles.language,
      articleId: articles.id,
    })
    .from(readingSessions)
    .innerJoin(articles, eq(articles.id, readingSessions.articleId))
    .where(and(eq(readingSessions.userId, userId), eq(readingSessions.status, "done")))
    .orderBy(desc(readingSessions.createdAt));
}

export type CompletedSession = Awaited<ReturnType<typeof listCompletedSessions>>[number];

/** Median reading speed of the user's last 5 plausible sessions in a language, used to suggest a pacer speed. */
export async function suggestedPacerWpm(language: Language): Promise<number> {
  const { id: userId } = await requireUser();
  const db = await getDb();
  const rows = await db
    .select({ wpm: readingSessions.wpm })
    .from(readingSessions)
    .innerJoin(articles, eq(articles.id, readingSessions.articleId))
    .where(
      and(
        eq(readingSessions.userId, userId),
        eq(articles.language, language),
        isNotNull(readingSessions.wpm),
        lte(readingSessions.wpm, MAX_PLAUSIBLE_WPM),
        eq(readingSessions.status, "done"),
      ),
    )
    .orderBy(desc(readingSessions.createdAt))
    .limit(5);
  const values = rows.map((r) => r.wpm!).sort((a, b) => a - b);
  if (!values.length) return { en: 230, vi: 200, zh: 300 }[language];
  const median = Math.round(values[Math.floor(values.length / 2)] / 10) * 10;
  return Math.min(PACER_MAX_WPM, Math.max(PACER_MIN_WPM, median));
}

export type LanguageStats = {
  language: Language;
  sessions: number;
  avgWpm: number | null;
  avgComprehension: number | null;
  avgEffectiveWpm: number | null;
  firstEffectiveWpm: number | null;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Averages over the 5 most recent sessions, compared with the first 5. */
export function computeStats(all: CompletedSession[]): LanguageStats[] {
  return (["en", "vi", "zh"] as const).map((language) => {
    const rows = all.filter((s) => s.language === language); // newest first
    const recent = rows.slice(0, 5);
    const first = rows.slice(-5);
    const eff = (xs: CompletedSession[]) =>
      avg(xs.map((s) => s.effectiveWpm).filter((v): v is number => v !== null));
    return {
      language,
      sessions: rows.length,
      avgWpm: avg(recent.map((s) => s.wpm).filter((v): v is number => v !== null)),
      avgComprehension: avg(recent.map((s) => s.quizScore).filter((v): v is number => v !== null)),
      avgEffectiveWpm: eff(recent),
      firstEffectiveWpm: rows.length > 5 ? eff(first) : null,
    };
  });
}
