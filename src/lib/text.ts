import type { Language } from "@/db/schema";

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string };

const VI_CHARS =
  /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/gi;

/** Heuristic: text with a meaningful share of Vietnamese diacritics is Vietnamese. */
export function detectLanguage(text: string): Language {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return "en";
  const vi = text.match(VI_CHARS)?.length ?? 0;
  return vi / letters > 0.03 ? "vi" : "en";
}

/** Counts whitespace-separated tokens containing a letter or digit.
 * For Vietnamese this counts syllables ("tiếng"), which is the natural unit. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function unitLabel(language: Language): string {
  return language === "vi" ? "syllables" : "words";
}

/** Parses lightweight markdown (headings, lists, code fences, paragraphs). */
export function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push({ type: "paragraph", text: para.join(" ").trim() });
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
  const match = text.match(/^.+?[.!?](?=\s|$)/);
  const sentence = (match ? match[0] : text).trim();
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
