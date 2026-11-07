import type { Chunk, ChunkPlan, Language } from "@/db/schema";
import { splitWords, type Block } from "@/lib/text";

/** The text of each run the pacer walks through, in render order: each heading, paragraph and
 * list item is one segment. Code blocks are not paced. Chunks never cross segments. */
export function segmentTexts(blocks: Block[]): string[] {
  return blocks.flatMap((b) =>
    b.type === "heading" || b.type === "paragraph" ? [b.text] : b.type === "list" ? b.items : [],
  );
}

/** The units (words, syllables or characters) of each segment; see splitWords. */
export function segmentWords(blocks: Block[], language: Language): string[][] {
  return segmentTexts(blocks).map((t) => splitWords(t, language));
}

// Phrase boundaries usually fall before these function words.
const BREAK_BEFORE: Record<Language, Set<string>> = {
  en: new Set(
    ("of in on at for to with from by about into through over under between after before during without " +
      "and or but which that who whom whose when where while because if so as than then unless until")
      .split(" "),
  ),
  vi: new Set(
    ("và hoặc nhưng của để khi nếu thì mà với trong cho từ theo bằng là các những vì nên do tại sau trước " +
      "giữa trên dưới qua cũng đã đang sẽ")
      .split(" "),
  ),
  // Matched against dictionary words (see zhWordStarts), not single characters.
  zh: new Set(
    ("和 或 但 但是 而 而且 并 并且 与 及 以及 在 对 对于 从 向 把 被 让 使 将 因为 所以 因此 如果 若 则 就 也 都 " +
      "通过 根据 由于 为了 关于 然后 当")
      .split(" "),
  ),
};
const MAX_RULE_CHUNK: Record<Language, number> = { en: 4, vi: 5, zh: 6 };

const bare = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const endsClause = (w: string) => /[,;:.!?)\]"”，、；：。！？）」』】]$/.test(w);

/** Chinese units are characters, so the rules need word boundaries to avoid cutting a word:
 * maps each unit index where a dictionary word starts to that word. Null without Intl.Segmenter. */
function zhWordStarts(words: string[]): Map<number, string> | null {
  if (typeof Intl === "undefined" || !("Segmenter" in Intl)) return null;
  const byOffset = new Map<number, string>();
  for (const s of new Intl.Segmenter("zh", { granularity: "word" }).segment(words.join(""))) {
    byOffset.set(s.index, s.segment);
  }
  const byUnit = new Map<number, string>();
  let offset = 0;
  words.forEach((w, i) => {
    const word = byOffset.get(offset);
    if (word !== undefined) byUnit.set(i, word);
    offset += w.length;
  });
  return byUnit;
}

/** Chunk sizes for one segment from punctuation and function words (no AI). */
export function ruleSizes(words: string[], language: Language): number[] {
  const zhStarts = language === "zh" ? zhWordStarts(words) : null;
  const max = MAX_RULE_CHUNK[language];
  const sizes: number[] = [];
  let size = 0;
  words.forEach((w, i) => {
    size++;
    const next = words[i + 1];
    // In Chinese, break only where a word starts; a long word may stretch a chunk up to twice the max.
    const canBreak = !zhStarts || zhStarts.has(i + 1);
    const nextWord = zhStarts ? zhStarts.get(i + 1) : next && bare(next);
    const breakHere =
      next === undefined ||
      endsClause(w) ||
      size >= max * 2 ||
      (canBreak && (size >= max || (size >= 2 && !!nextWord && BREAK_BEFORE[language].has(nextWord))));
    if (breakHere) {
      sizes.push(size);
      size = 0;
    }
  });
  return sizes;
}

/** Turns per-segment chunk sizes into a plan over global word indices. */
export function planFromSizes(
  source: ChunkPlan["source"],
  segmentSizes: number[][],
  hard: Set<number>[] = [],
): ChunkPlan {
  const chunks: Chunk[] = [];
  let start = 0;
  segmentSizes.forEach((sizes, s) =>
    sizes.forEach((n, c) => {
      chunks.push({ start, end: start + n, hard: hard[s]?.has(c) ?? false });
      start += n;
    }),
  );
  return { source, chunks };
}

export function rulePlan(segments: string[][], language: Language): ChunkPlan {
  return planFromSizes(
    "rules",
    segments.map((words) => ruleSizes(words, language)),
  );
}

// Extra time, in "average word" units, after a chunk that ends a clause, a sentence or a segment.
// Readers linger at these points to integrate meaning (sentence wrap-up effect).
const PAUSE = { clause: 0.5, sentence: 1, segment: 1.5 };
// Dense chunks (new terms, definitions, mechanisms) get more time.
const HARD_FACTOR = 1.35;

export const endsSentence = (word: string) => /(?:[.!?]["”)]?|[。！？][”」』）]?)$/.test(word);

function wordWeight(word: string, language: Language): number {
  // Vietnamese syllables and Chinese characters are units of similar length; Latin words inside
  // Chinese text (product names, code) are weighed like English.
  if (language === "vi" || (language === "zh" && /\p{Script=Han}/u.test(word))) return 1;
  const letters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
  return Math.min(1.8, Math.max(0.7, 0.6 + letters * 0.08));
}

/** Milliseconds to show each chunk. Time follows word length, density and pauses, while the
 * total stays at what the chosen pace allows, so the average speed equals `wpm`. */
export function chunkDurations(plan: ChunkPlan, segments: string[][], wpm: number, language: Language): number[] {
  const words = segments.flat();
  const ends = segmentEnds(segments);

  const weights = plan.chunks.map((c) => {
    let w = 0;
    for (let i = c.start; i < c.end; i++) w += wordWeight(words[i], language);
    if (c.hard) w *= HARD_FACTOR;
    const last = words[c.end - 1] ?? "";
    if (ends.has(c.end)) w += PAUSE.segment;
    else if (endsSentence(last)) w += PAUSE.sentence;
    else if (/[,;:，、；：]$/.test(last)) w += PAUSE.clause;
    return w;
  });
  const total = (words.length / wpm) * 60_000;
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => (w / sum) * total);
}

/** Global word index just past the end of each segment. */
export function segmentEnds(segments: string[][]): Set<number> {
  const ends = new Set<number>();
  let end = 0;
  for (const s of segments) ends.add((end += s.length));
  return ends;
}
