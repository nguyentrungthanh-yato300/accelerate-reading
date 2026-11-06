import "server-only";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/** Converts readable article HTML into the lightweight markdown the reader understands. */
function htmlToText(root: Element): string {
  const out: string[] = [];
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      const text = (child.textContent ?? "").replace(/\s+/g, " ").trim();
      if (/^h[1-6]$/.test(tag)) {
        if (text) out.push(`${"#".repeat(Number(tag[1]))} ${text}`);
      } else if (tag === "p" || tag === "blockquote") {
        if (text) out.push(text);
      } else if (tag === "pre") {
        out.push("```\n" + (child.textContent ?? "").trimEnd() + "\n```");
      } else if (tag === "ul" || tag === "ol") {
        const items = Array.from(child.querySelectorAll(":scope > li"))
          .map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean);
        if (items.length) out.push(items.map((i) => `- ${i}`).join("\n"));
      } else if (tag === "table" || tag === "figure" || tag === "img") {
        // skipped: not part of the reading text
      } else if (child.children.length) {
        walk(child);
      } else if (text) {
        out.push(text);
      }
    }
  };
  walk(root);
  return out.join("\n\n");
}

export async function extractFromUrl(url: string): Promise<{ title: string; content: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AccelerateReading/0.1)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Could not fetch the page (HTTP ${res.status}).`);
  const html = await res.text();
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.content) throw new Error("Could not find readable content on that page.");

  const { document: contentDoc } = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`);
  const content = htmlToText(contentDoc.body as unknown as Element);
  if (!content.trim()) throw new Error("The page had no readable text.");
  return { title: article.title?.trim() || new URL(url).hostname, content };
}
