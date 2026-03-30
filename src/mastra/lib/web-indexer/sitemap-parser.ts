const SITEMAP_CANDIDATES = [
  "/sitemap_index.xml",
  "/sitemap.xml",
  "/wp-sitemap.xml",
  "/wp-sitemap-posts-post-1.xml",
  "/page-sitemap.xml",
];

const FETCH_TIMEOUT = 10_000;

interface SitemapUrl {
  url: string;
  lastmod?: string;
}

interface SitemapDiscoveryResult {
  found: boolean;
  sitemapUrl?: string;
  urls: SitemapUrl[];
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { "User-Agent": "AtatoBot/1.0 (asistente municipal; contacto@atajo.es)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Parse <loc> and optional <lastmod> from a sitemap XML string.
 * Works for both <urlset> (regular sitemap) and <sitemapindex>.
 */
function parseLocTags(xml: string): SitemapUrl[] {
  const results: SitemapUrl[] = [];
  // Match <url> or <sitemap> blocks
  const blockRegex = /<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/gi;
  let block: RegExpExecArray | null;

  while ((block = blockRegex.exec(xml)) !== null) {
    const content = block[1];
    const locMatch = /<loc>([\s\S]*?)<\/loc>/i.exec(content);
    if (!locMatch) continue;
    const url = locMatch[1].trim();

    const lastmodMatch = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(content);
    const lastmod = lastmodMatch ? lastmodMatch[1].trim() : undefined;

    results.push({ url, lastmod });
  }

  return results;
}

async function fetchAndParseSitemap(
  url: string,
  visited = new Set<string>()
): Promise<SitemapUrl[]> {
  if (visited.has(url)) return [];
  visited.add(url);

  const xml = await fetchText(url);
  if (!xml) return [];

  const isSitemapIndex = xml.includes("<sitemapindex");

  if (isSitemapIndex) {
    // Sub-sitemaps: fetch each one recursively
    const subSitemaps = parseLocTags(xml);
    const allUrls: SitemapUrl[] = [];
    for (const sub of subSitemaps) {
      const urls = await fetchAndParseSitemap(sub.url, visited);
      allUrls.push(...urls);
    }
    return allUrls;
  }

  return parseLocTags(xml);
}

/**
 * Attempt to discover and parse a sitemap for the given origin.
 * Tries robots.txt first, then common paths.
 */
export async function discoverSitemap(
  startUrl: string
): Promise<SitemapDiscoveryResult> {
  const origin = new URL(startUrl).origin;

  // 1. Try robots.txt
  const robotsTxt = await fetchText(`${origin}/robots.txt`);
  if (robotsTxt) {
    const sitemapLines = robotsTxt
      .split("\n")
      .filter((line) => /^Sitemap:/i.test(line.trim()));

    for (const line of sitemapLines) {
      const sitemapUrl = line.replace(/^Sitemap:\s*/i, "").trim();
      if (!sitemapUrl) continue;
      const urls = await fetchAndParseSitemap(sitemapUrl);
      if (urls.length > 0) {
        return { found: true, sitemapUrl, urls };
      }
    }
  }

  // 2. Try common sitemap paths
  for (const path of SITEMAP_CANDIDATES) {
    const sitemapUrl = `${origin}${path}`;
    const xml = await fetchText(sitemapUrl);
    if (!xml) continue;
    const urls = await fetchAndParseSitemap(sitemapUrl);
    if (urls.length > 0) {
      return { found: true, sitemapUrl, urls };
    }
  }

  return { found: false, urls: [] };
}
