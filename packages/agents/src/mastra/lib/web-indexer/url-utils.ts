
const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "sessionid", "PHPSESSID", "session_id",
  "fbclid", "gclid", "ref",
  "lang",
  "avia-element-paging",
  "paged",
];

export function normalizeUrl(url: string, baseProtocol = "https:"): string {
  try {
    const u = new URL(url);

    // Force HTTPS
    u.protocol = baseProtocol;

    // Remove trailing slash (except root)
    if (u.pathname !== "/") {
      u.pathname = u.pathname.replace(/\/$/, "");
    }

    // Remove fragments
    u.hash = "";

    // Remove tracking/session params
    TRACKING_PARAMS.forEach((p) => u.searchParams.delete(p));

    return u.toString();
  } catch {
    return url;
  }
}


const NON_HTML_EXTENSIONS = new Set([
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico", ".webp",
  ".mp4", ".mp3", ".avi", ".mov",
  ".zip", ".rar", ".tar", ".gz",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".css", ".js", ".json", ".xml", ".woff", ".woff2", ".ttf", ".eot",
]);

function getExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const lastDot = pathname.lastIndexOf(".");
    if (lastDot === -1) return "";
    return pathname.slice(lastDot).toLowerCase().split("?")[0];
  } catch {
    return "";
  }
}

export function isPdfUrl(url: string): boolean {
  return getExtension(url) === ".pdf";
}


const EXCLUDED_PATH_PATTERNS = [
  /\/wp-admin\//i,
  /\/wp-login/i,
  /\/wp-json\//i,
  /\/wp-cron/i,
  /\/feed\//i,
  /\/rss\//i,
  /\/atom\//i,
  /[?&]s=/i,           // WordPress search
  /\/search/i,
  /\/buscar/i,
  /\/tag\//i,
  /\/category\//i,
  /\/etiqueta\//i,
  /\/categoria\//i,
  /\/autor\//i,
  /\/author\//i,
  /\/print\//i,
  /\/imprimir\//i,
  /\/version-imprimible\//i,
  /\/cdn-cgi\//i,
  /\/__\//i,
  /\/trackback\//i,
  /\/comentario\//i,
  /\/comment-page-/i,
  /\/page\/\d+/i,       // WordPress pagination
];

export function isExcludedUrl(url: string): boolean {
  const ext = getExtension(url);
  if (NON_HTML_EXTENSIONS.has(ext)) return true;

  try {
    const u = new URL(url);
    const full = u.pathname + u.search;
    return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(full));
  } catch {
    return true;
  }
}


export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function isSameDomain(url: string, domain: string): boolean {
  return extractDomain(url) === domain;
}


/**
 * Extracts absolute URLs from anchor href attributes in raw HTML.
 * Uses a simple regex to avoid pulling in cheerio here.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }
    try {
      const absolute = new URL(href, baseUrl).toString();
      links.push(absolute);
    } catch {
      // ignore invalid URLs
    }
  }

  return links;
}
