import type { Language, PurposeType, ReadingMode } from "@/db/schema";

/** The goal sets how much detail is "understood enough", so each purpose type implies a reading mode. */
export const PURPOSE_TYPES: Record<PurposeType, { label: string; mode: ReadingMode; hint: string }> = {
  lookup: { label: "Find a fact", mode: "skim", hint: "Scan for the part that answers it and skip the rest." },
  gist: { label: "Get the gist", mode: "skim", hint: "Follow the structure; don't stop on details." },
  mechanism: { label: "Understand how/why", mode: "deep", hint: "Slow down on explanations and trade-offs." },
  apply: { label: "Decide or apply", mode: "deep", hint: "Read closely and note what you would do differently." },
};

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string };

const VI_CHARS =
  /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/gi;

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", vi: "Vietnamese", zh: "Chinese" };

const HAN = /\p{Script=Han}/u;
const HAN_ALL = /\p{Script=Han}/gu;

/** Heuristic: mostly Han characters is Chinese; a meaningful share of Vietnamese diacritics is
 * Vietnamese; anything else is English. */
export function detectLanguage(text: string): Language {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return "en";
  if ((text.match(HAN_ALL)?.length ?? 0) / letters > 0.3) return "zh";
  const vi = text.match(VI_CHARS)?.length ?? 0;
  return vi / letters > 0.03 ? "vi" : "en";
}

// Chinese has no spaces between words, so each Han character is a unit, carrying the closing
// punctuation that follows it (，。、）” …) but not opening brackets or quotes, which belong to what
// comes next; runs of other characters (Latin words, numbers) stay whole.
const ZH_TOKEN = /\p{Script=Han}[\p{Pe}\p{Pf}\p{Po}]*|[^\s\p{Script=Han}]+/gu;

/** Splits text into units and the whitespace between them, in order; joining the parts gives the
 * text back. Units are words in English, syllables in Vietnamese and characters in Chinese. */
export function splitParts(text: string, language: Language): string[] {
  const parts = text.split(/(\s+)/).filter(Boolean);
  if (language !== "zh") return parts;
  return parts.flatMap((p) => (/\s/.test(p) ? [p] : (p.match(ZH_TOKEN) ?? [p])));
}

/** The units of a text (see splitParts), without whitespace. The reader renders one span per unit. */
export function splitWords(text: string, language: Language): string[] {
  return splitParts(text, language).filter((p) => !/^\s+$/.test(p));
}

/** Counts units that contain a letter or digit: words in English, syllables ("tiếng") in Vietnamese,
 * characters (字) in Chinese — each language's natural unit for reading speed. */
export function countWords(text: string, language: Language): number {
  return splitWords(text, language).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Above this, a "reading" was really a skip-through; such sessions shouldn't steer the pacer. */
export const MAX_PLAUSIBLE_WPM = 900;
export const PACER_MIN_WPM = 100;
export const PACER_MAX_WPM = 600;

export function unitLabel(language: Language): string {
  return { en: "words", vi: "syllables", zh: "characters" }[language];
}

/** Joins wrapped lines of a paragraph; Chinese lines join without a space. */
function joinLines(lines: string[]): string {
  return lines.reduce((acc, line) => {
    if (!acc) return line;
    return HAN.test(acc.at(-1)!) && HAN.test(line[0]) ? acc + line : `${acc} ${line}`;
  }, "");
}

/** Parses lightweight markdown (headings, lists, code fences, paragraphs). */
export function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push({ type: "paragraph", text: joinLines(para).trim() });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "list", items: list });
    list = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushPara();
      flushList();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    const item = trimmed.match(/^(?:[-*+•]|\d+[.)])\s+(.*)$/);
    if (item) {
      flushPara();
      list.push(item[1]);
      continue;
    }
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  return blocks;
}

function firstSentence(text: string, maxWords = 30): string {
  // Chinese full stops need no following space.
  const match = text.match(/^.+?(?:[.!?](?=\s|$)|[。！？])/);
  const sentence = (match ? match[0] : text).trim();
  // Chinese: cap by characters, about two per English word of meaning.
  if (HAN.test(sentence)) {
    const chars = Array.from(sentence);
    return chars.length > maxWords * 2 ? chars.slice(0, maxWords * 2).join("") + "…" : sentence;
  }
  const words = sentence.split(/\s+/);
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") + "…" : sentence;
}

export type PreviewItem = { kind: "heading"; level: number; text: string } | { kind: "lead"; text: string };

/** Builds a skeleton of the text: headings plus the first sentence of each section
 * (or of each paragraph when the text has no headings). */
export function buildPreview(blocks: Block[]): PreviewItem[] {
  const hasHeadings = blocks.some((b) => b.type === "heading");
  const items: PreviewItem[] = [];
  let needLead = true;
  for (const b of blocks) {
    if (b.type === "heading") {
      items.push({ kind: "heading", level: b.level, text: b.text });
      needLead = true;
    } else if (b.type === "paragraph" && (needLead || !hasHeadings)) {
      items.push({ kind: "lead", text: firstSentence(b.text) });
      needLead = false;
    } else if (b.type === "list" && needLead) {
      items.push({ kind: "lead", text: "• " + b.items.map((i) => firstSentence(i, 6)).join("  • ") });
      needLead = false;
    }
  }
  return items;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "–";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}
