import "server-only";
import { and, asc, desc, eq, isNotNull, lte } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";
import { articles, sessions, type Language } from "@/db/schema";
import { MAX_PLAUSIBLE_WPM, PACER_MAX_WPM, PACER_MIN_WPM } from "@/lib/text";

export async function listArticles() {
  await connection();
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
    .orderBy(desc(articles.createdAt));
  const done = await db
    .select({ articleId: sessions.articleId, effectiveWpm: sessions.effectiveWpm, wpm: sessions.wpm })
    .from(sessions)
    .where(eq(sessions.status, "done"))
    .orderBy(asc(sessions.createdAt));
  const byArticle = new Map<number, { count: number; lastWpm: number | null }>();
  for (const s of done) {
    const prev = byArticle.get(s.articleId);
    byArticle.set(s.articleId, { count: (prev?.count ?? 0) + 1, lastWpm: s.wpm });
  }
  return rows.map((r) => ({ ...r, sessions: byArticle.get(r.id)?.count ?? 0, lastWpm: byArticle.get(r.id)?.lastWpm ?? null }));
}

export async function getArticle(id: number) {
  await connection();
  const db = await getDb();
  return db.query.articles.findFirst({ where: eq(articles.id, id) });
}

export async function getSessionWithArticle(id: number) {
  await connection();
  const db = await getDb();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!session) return null;
  const article = await db.query.articles.findFirst({ where: eq(articles.id, session.articleId) });
  if (!article) return null;
  return { session, article };
}

export async function listCompletedSessions() {
  await connection();
  const db = await getDb();
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      mode: sessions.mode,
      wpm: sessions.wpm,
      quizScore: sessions.quizScore,
      summaryScore: sessions.summaryScore,
      effectiveWpm: sessions.effectiveWpm,
      readMs: sessions.readMs,
      title: articles.title,
      language: articles.language,
      articleId: articles.id,
    })
    .from(sessions)
    .innerJoin(articles, eq(articles.id, sessions.articleId))
    .where(eq(sessions.status, "done"))
    .orderBy(desc(sessions.createdAt));
}

export type CompletedSession = Awaited<ReturnType<typeof listCompletedSessions>>[number];

/** Median reading speed of the last 5 plausible sessions in a language, used to suggest a pacer speed. */
export async function suggestedPacerWpm(language: Language): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ wpm: sessions.wpm })
    .from(sessions)
    .innerJoin(articles, eq(articles.id, sessions.articleId))
    .where(
      and(
        eq(articles.language, language),
        isNotNull(sessions.wpm),
        lte(sessions.wpm, MAX_PLAUSIBLE_WPM),
        eq(sessions.status, "done"),
      ),
    )
    .orderBy(desc(sessions.createdAt))
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
