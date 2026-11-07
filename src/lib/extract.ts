import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** True for addresses on the server's own network: loopback, private, link-local (including cloud
 * metadata at 169.254.169.254), carrier-grade NAT, unique-local and unspecified. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
    return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  );
}

/** Rejects URLs that are not public http(s) addresses, so users can't make the server fetch from
 * its own network (SSRF). Checked again on every redirect. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That URL is not valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https links can be imported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new Error("Could not find that website.");
  if (addresses.some(isPrivateAddress)) throw new Error("That address can't be imported.");
  return url;
}

async function fetchPublic(raw: string): Promise<string> {
  let url = await assertPublicUrl(raw);
  for (let i = 0; ; i++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AccelerateReading/0.1)" },
      signal: AbortSignal.timeout(15_000),
      redirect: "manual",
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (i >= MAX_REDIRECTS) throw new Error("The page redirects too many times.");
      url = await assertPublicUrl(new URL(location, url).href);
      continue;
    }
    if (!res.ok) throw new Error(`Could not fetch the page (HTTP ${res.status}).`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("The page is too large.");
    const html = await res.text();
    if (html.length > MAX_BYTES) throw new Error("The page is too large.");
    return html;
  }
}

export async function extractFromUrl(url: string): Promise<{ title: string; content: string }> {
  const html = await fetchPublic(url);
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.content) throw new Error("Could not find readable content on that page.");

  const { document: contentDoc } = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`);
  const content = htmlToText(contentDoc.body as unknown as Element);
  if (!content.trim()) throw new Error("The page had no readable text.");
  return { title: article.title?.trim() || new URL(url).hostname, content };
}
