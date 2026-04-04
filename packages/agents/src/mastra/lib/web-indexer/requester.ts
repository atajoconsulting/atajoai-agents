import { Agent } from "undici";

const CRAWL_TIMEOUT = 10_000;

const tlsPermissiveDispatcher = new Agent({
  connect: { rejectUnauthorized: false },
});

export async function fetchPage(
  url: string,
  userAgent = `AtajoAIBot/1.0 (asistente municipal)`,
): Promise<{ html: string; status: number; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(CRAWL_TIMEOUT),
      // @ts-expect-error -- dispatcher is a valid undici option for Node's native fetch
      dispatcher: tlsPermissiveDispatcher,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es,ca,eu,gl,en",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    const html = await res.text();
    return { html, status: res.status, contentType };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[requester] Failed to fetch ${url}: ${msg}\n`);
    return null;
  }
}
