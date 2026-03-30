import * as cheerio from "cheerio";

const NOISE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  ".breadcrumb",
  ".pagination",
  ".sidebar",
  ".widget",
  '[class*="menu"]',
  '[class*="cookie"]',
  '[class*="banner"]',
  '[class*="social"]',
  '[class*="share"]',
  '[class*="related"]',
  '[class*="comment"]',
  "script",
  "style",
  "noscript",
  "iframe",
  ".wp-block-navigation",
  "#wpadminbar",
];

const MAIN_CONTENT_SELECTORS = [
  "main",
  "article",
  '[role="main"]',
  ".content",
  ".entry-content",
  ".post-content",
  "#content",
  ".page-content",
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve a potentially relative URL against the page's base URL.
 * Returns the href untouched when baseUrl is not provided or parsing fails.
 */
function resolveUrl(href: string, baseUrl?: string): string {
  if (!baseUrl || /^https?:\/\//i.test(href) || href.startsWith("mailto:")) {
    return href;
  }
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

/**
 * Walk a cheerio node tree depth-first and produce a lightweight
 * markdown-like string that preserves semantic structure (headings,
 * paragraphs, lists, links, images) while remaining compact enough
 * to embed / index.
 */
function toStructuredText(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root: cheerio.Cheerio<any>,
  baseUrl?: string,
): string {
  const parts: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(nodes: cheerio.Cheerio<any>): void {
    nodes.contents().each((_, node) => {
      // --- Text node ---
      if (node.type === "text") {
        const t = ((node as any).data as string) ?? "";
        // collapse inner whitespace but keep a single space
        const cleaned = t.replace(/\s+/g, " ");
        if (cleaned.trim()) parts.push(cleaned);
        return;
      }

      if (node.type !== "tag" && node.type !== "script") return;
      const el = node as any;
      const tag = el.tagName?.toLowerCase();
      if (!tag) return;

      const $el = $(el);

      // --- Headings → markdown headings ---
      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        const prefix = "#".repeat(level);
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text) parts.push(`\n\n${prefix} ${text}\n\n`);
        return;
      }

      // --- Images → alt text annotation ---
      if (tag === "img") {
        const alt = ($el.attr("alt") ?? "").trim();
        const src = $el.attr("src") ?? "";
        if (alt) {
          const resolved = resolveUrl(src, baseUrl);
          parts.push(`[imagen: ${alt}](${resolved})`);
        }
        return;
      }

      // --- Links → inline with resolved URL ---
      if (tag === "a") {
        const href = $el.attr("href") ?? "";
        const label = $el.text().replace(/\s+/g, " ").trim();
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
          // just emit the label
          if (label) parts.push(label);
          return;
        }
        const resolved = resolveUrl(href, baseUrl);
        if (label && label !== resolved) {
          parts.push(`${label} (${resolved})`);
        } else {
          parts.push(resolved);
        }
        return;
      }

      // --- Lists — recurse into each <li> so nested links are resolved ---
      if (tag === "ul" || tag === "ol") {
        parts.push("\n");
        let idx = 0;
        $el.children("li").each((_, li) => {
          idx++;
          const bullet = tag === "ol" ? `${idx}. ` : "- ";
          // Collect structured content inside the <li>
          const inner = toStructuredText($, $(li), baseUrl).replace(/\n+/g, " ").trim();
          if (inner) parts.push(`${bullet}${inner}\n`);
        });
        parts.push("\n");
        return;
      }
      if (tag === "li") {
        // handled by parent ul/ol; fallback for orphan <li>
        const inner = toStructuredText($, $el, baseUrl).replace(/\n+/g, " ").trim();
        if (inner) parts.push(`- ${inner}\n`);
        return;
      }

      // --- Table cells → separate with " | " ---
      if (tag === "td" || tag === "th") {
        const inner = toStructuredText($, $el, baseUrl).replace(/\n+/g, " ").trim();
        if (inner) parts.push(` ${inner} |`);
        return;
      }

      // --- Table rows → newline per row ---
      if (tag === "tr") {
        parts.push("\n|");
        walk($el);
        return;
      }

      // --- Tables → block with newlines ---
      if (tag === "table") {
        parts.push("\n");
        walk($el);
        parts.push("\n");
        return;
      }

      // --- Block elements → paragraph breaks ---
      const BLOCK_TAGS = new Set([
        "p", "div", "section", "blockquote", "figure", "figcaption",
        "details", "summary", "dt", "dd",
      ]);
      if (BLOCK_TAGS.has(tag)) {
        parts.push("\n\n");
        walk($el);
        parts.push("\n\n");
        return;
      }

      // --- <br> → newline ---
      if (tag === "br") {
        parts.push("\n");
        return;
      }

      // --- Everything else: recurse ---
      walk($el);
    });
  }

  walk(root);

  // Clean up excessive blank lines
  return parts
    .join("")
    .replace(/[ \t]+/g, " ")       // collapse horizontal whitespace
    .replace(/\n{3,}/g, "\n\n")    // max 1 blank line
    .replace(/^ +/gm, "")          // trim leading spaces per line
    .trim();
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export function extractCleanText(
  html: string,
  baseUrl?: string,
): {
  title: string;
  text: string;
  breadcrumb: string;
} {
  const $ = cheerio.load(html);

  // Extract breadcrumb before removing it
  const breadcrumb = $(
    '.breadcrumb, [class*="breadcrumb"], nav[aria-label*="breadcrumb"]'
  )
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  // Remove noise elements
  NOISE_SELECTORS.forEach((sel) => $(sel).remove());

  // Extract title — prefer <h1>, fallback to <title> without site suffix
  const h1Text = $("h1").first().text().replace(/\s+/g, " ").trim();
  const titleTag = $("title").text().replace(/\s+/g, " ").trim();
  const title = h1Text || titleTag.replace(/\s*[|–—-]\s*[^|–—-]+$/, "").trim() || titleTag;

  // Find main content area
  let mainContent = $();
  for (const sel of MAIN_CONTENT_SELECTORS) {
    const found = $(sel).first();
    if (found.length) {
      mainContent = found;
      break;
    }
  }

  const textSource = mainContent.length ? mainContent : $("body");
  const text = toStructuredText($, textSource, baseUrl);

  return { title, text, breadcrumb };
}

/**
 * Returns true if the page looks like a dynamic SPA with very little text
 * relative to its HTML size.
 */
export function isSpaPage(html: string, text: string): boolean {
  if (html.length === 0) return false;
  const ratio = text.length / html.length;
  return ratio < 0.05 && text.length < 300;
}

/**
 * Returns true if the title or text suggests this is a 404/error page.
 */
export function isErrorPage(title: string, text: string): boolean {
  const lower = (title + " " + text.slice(0, 200)).toLowerCase();
  return (
    lower.includes("página no encontrada") ||
    lower.includes("page not found") ||
    lower.includes("404") ||
    lower.includes("not found") ||
    lower.includes("error 404")
  );
}
