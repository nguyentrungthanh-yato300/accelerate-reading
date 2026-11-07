import "server-only";
import type { LanguageModel } from "ai";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, type ChunkPlan, type Language } from "@/db/schema";
import { generateChunks, type ChunkedSegment } from "@/lib/ai";
import { getUserModel } from "@/lib/ai-settings";
import { planFromSizes, ruleSizes, segmentTexts } from "@/lib/chunks";
import { parseBlocks, splitWords } from "@/lib/text";

export type ChunksResult = { plan: ChunkPlan | null; error?: string };

// The model's output is the text again, as JSON: small batches keep it within limits and, run in
// parallel, keep the wait short. Sizes are in units (words, syllables, characters), about 600 words.
const BATCH_UNITS: Record<Language, number> = { en: 600, vi: 800, zh: 1000 };
const PARALLEL_BATCHES = 4;
// Longer AI chunks are split again by the rules.
const MAX_AI_CHUNK: Record<Language, number> = { en: 7, vi: 8, zh: 10 };

/** Validates the model's chunks for one segment; null when the units did not come back unchanged. */
function sizesFromAi(words: string[], seg: ChunkedSegment | undefined, language: Language) {
  if (!seg) return null;
  const chunkWords = seg.chunks.map((c) => splitWords(c, language));
  const flat = chunkWords.flat();
  if (flat.length !== words.length || flat.some((w, i) => w !== words[i]) || chunkWords.some((c) => !c.length)) {
    return null;
  }
  const sizes: number[] = [];
  const hard = new Set<number>();
  chunkWords.forEach((c, i) => {
    const parts = c.length > MAX_AI_CHUNK[language] ? ruleSizes(c, language) : [c.length];
    for (const n of parts) {
      if (seg.hard.includes(i)) hard.add(sizes.length);
      sizes.push(n);
    }
  });
  return { sizes, hard };
}

async function aiPlan(model: LanguageModel, texts: string[], language: Language): Promise<ChunkPlan> {
  const segments = texts.map((t) => splitWords(t, language));

  const batches: number[][] = [[]];
  let count = 0;
  segments.forEach((words, i) => {
    if (count + words.length > BATCH_UNITS[language] && batches.at(-1)!.length) {
      batches.push([]);
      count = 0;
    }
    batches.at(-1)!.push(i);
    count += words.length;
  });

  const results = new Map<number, ChunkedSegment>();
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    await Promise.all(
      batches.slice(i, i + PARALLEL_BATCHES).map(async (batch) => {
        const out = await generateChunks(
          model,
          batch.map((s, local) => ({ id: local, text: texts[s] })),
          language,
        );
        for (const seg of out) if (batch[seg.id] !== undefined) results.set(batch[seg.id], seg);
      }),
    );
  }

  let fallbacks = 0;
  const sizes: number[][] = [];
  const hard: Set<number>[] = [];
  segments.forEach((words, s) => {
    const fromAi = sizesFromAi(words, results.get(s), language);
    if (!fromAi) fallbacks++;
    sizes.push(fromAi?.sizes ?? ruleSizes(words, language));
    hard.push(fromAi?.hard ?? new Set());
  });
  if (fallbacks) console.warn(`Chunking: ${fallbacks}/${segments.length} segments fell back to rules`);
  return planFromSizes("ai", sizes, hard);
}

/** Generates (once) and caches the AI phrase segmentation for a user's article. */
export async function ensureChunks(userId: string, articleId: number): Promise<ChunksResult> {
  const db = await getDb();
  const article = await db.query.articles.findFirst({
    where: and(eq(articles.id, articleId), eq(articles.userId, userId)),
  });
  if (!article) return { plan: null, error: "Article not found." };
  if (article.chunks) return { plan: article.chunks };

  const model = await getUserModel(userId);
  if (!model) return { plan: null, error: "Add your AI API key in Settings first." };
  try {
    const plan = await aiPlan(model, segmentTexts(parseBlocks(article.content)), article.language);
    await db.update(articles).set({ chunks: plan }).where(eq(articles.id, articleId));
    return { plan };
  } catch (e) {
    console.error("Chunking failed", e);
    return { plan: null, error: "Could not segment phrases with AI." };
  }
}
