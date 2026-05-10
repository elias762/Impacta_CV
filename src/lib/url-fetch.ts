/**
 * Fetch a public URL and return clean-ish text. Used to pull client / project context
 * from a company website during the briefing wizard.
 */
const MAX_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 12_000;

export async function fetchUrlAsText(url: string): Promise<{
  url: string;
  title: string | null;
  text: string;
}> {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error("Only http(s) URLs are supported");
  }

  const res = await fetch(u.toString(), {
    headers: {
      "User-Agent": "ImpactaCVs/0.1 (+staffing-prototype)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${u.host}`);

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(`Page too large (${(buf.byteLength / 1024).toFixed(0)} KB)`);
  }
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  const rawTitle = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  const title = rawTitle ? decodeEntities(rawTitle) : null;
  const text = htmlToText(html).slice(0, MAX_TEXT_CHARS);
  return { url: u.toString(), title, text };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, " ");
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/section|\/article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
