import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, type ChunkPlan, type Language } from "@/db/schema";
import { generateChunks, getModel, type ChunkedSegment } from "@/lib/ai";
import { planFromSizes, ruleSizes, segmentWords, splitWords } from "@/lib/chunks";
import { parseBlocks } from "@/lib/text";

export type ChunksResult = { plan: ChunkPlan | null; error?: string };

// The model's output is the text again, as JSON: small batches keep it within limits and, run in
// parallel, keep the wait short.
const BATCH_WORDS = 600;
const PARALLEL_BATCHES = 4;
// Longer AI chunks are split again by the rules.
const MAX_AI_CHUNK = 7;

/** Validates the model's chunks for one segment; null when the words did not come back unchanged. */
function sizesFromAi(words: string[], seg: ChunkedSegment | undefined, language: Language) {
  if (!seg) return null;
  const chunkWords = seg.chunks.map(splitWords);
  const flat = chunkWords.flat();
  if (flat.length !== words.length || flat.some((w, i) => w !== words[i]) || chunkWords.some((c) => !c.length)) {
    return null;
  }
  const sizes: number[] = [];
  const hard = new Set<number>();
  chunkWords.forEach((c, i) => {
    const parts = c.length > MAX_AI_CHUNK ? ruleSizes(c, language) : [c.length];
    for (const n of parts) {
      if (seg.hard.includes(i)) hard.add(sizes.length);
      sizes.push(n);
    }
  });
  return { sizes, hard };
}

async function aiPlan(segments: string[][], language: Language): Promise<ChunkPlan> {
  const model = getModel();
  if (!model) throw new Error("AI is not configured.");

  const batches: number[][] = [[]];
  let count = 0;
  segments.forEach((words, i) => {
    if (count + words.length > BATCH_WORDS && batches.at(-1)!.length) {
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
          batch.map((s, local) => ({ id: local, text: segments[s].join(" ") })),
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

/** Generates (once) and caches the AI phrase segmentation for an article. */
export async function ensureChunks(articleId: number): Promise<ChunksResult> {
  const db = await getDb();
  const article = await db.query.articles.findFirst({ where: eq(articles.id, articleId) });
  if (!article) return { plan: null, error: "Article not found." };
  if (article.chunks) return { plan: article.chunks };

  try {
    const plan = await aiPlan(segmentWords(parseBlocks(article.content)), article.language);
    await db.update(articles).set({ chunks: plan }).where(eq(articles.id, articleId));
    return { plan };
  } catch (e) {
    console.error("Chunking failed", e);
    return { plan: null, error: "Could not segment phrases with AI." };
  }
}
