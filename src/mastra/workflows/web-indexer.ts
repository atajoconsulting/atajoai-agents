import { createStep, createWorkflow } from "@mastra/core/workflows";
import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { createHash } from "node:crypto";
import {
  extractCleanText,
  isErrorPage,
  isSpaPage,
  webIndexerInputSchema,
  webIndexerOutputSchema,
  normalizeUrl,
} from "../lib/web-indexer";
import type { CrawledPage } from "../lib/web-indexer";
import { fetchPage } from "../lib/web-indexer/requester";
import { detectLang } from "../lib/language";
import { toRagDocument, indexDocuments } from "../lib/rag";
import { env } from "../env";

const crawlPages = createStep({
  id: "crawl-pages",
  description: "Fetches HTML pages, extracts clean text and detects language",
  inputSchema: webIndexerInputSchema,
  outputSchema: webIndexerOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const crawled: CrawledPage[] = [];

    // Deduplicate URLs after normalization so we never fetch the same page twice
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const rawUrl of inputData.urls) {
      const normalized = normalizeUrl(rawUrl);
      if (seen.has(normalized)) {
        logger.warn(`Skipping duplicate URL: ${normalized}`);
        continue;
      }
      seen.add(normalized);
      urls.push(normalized);
    }

    for (const url of urls) {
      const result = await fetchPage(url);
      logger.info(`Fetched ${url} (${result?.html.length ?? 0} chars)`);

      if (!result || result.status !== 200) {
        logger.error(`Failed to fetch ${url}`);
        continue;
      }

      const pageParsed = extractCleanText(result.html, url);

      if (isSpaPage(result.html, pageParsed.text)) {
        logger.warn(`Skipping SPA/empty page: ${url}`);
        continue;
      }

      if (isErrorPage(pageParsed.title, pageParsed.text)) {
        logger.warn(`Skipping error page: ${url} ("${pageParsed.title}")`);
        continue;
      }

      // Detect language here so toRagDocument() has it available
      const lang = await detectLang(pageParsed.text);

      crawled.push({
        id: createHash("sha256").update(url).digest("hex"),
        url,
        title: pageParsed.title,
        httpStatus: result.status,
        contentHash: createHash("sha256").update(pageParsed.text).digest("hex"),
        crawledAt: new Date(),
        text: pageParsed.text,
        detectedLang: lang ?? undefined,
      });
    }

    return { crawledPages: crawled };
  },
});

const indexCrawledPages = createStep({
  id: "index-crawled-pages",
  description:
    "Converts crawled pages to RagDocuments and indexes via the shared pipeline",
  inputSchema: webIndexerOutputSchema,
  outputSchema: webIndexerOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const vectorStore = mastra.getVector("qdrant");
    const embedModel = new ModelRouterEmbeddingModel(env.EMBED_MODEL);
    const translator = mastra.getAgent("translatorAgent");

    const documents = inputData.crawledPages
      .filter((p) => !!p.text?.trim())
      .map((p) => toRagDocument(p));

    const result = await indexDocuments(documents, {
      vectorStore,
      embedModel,
      translator,
      logger,
    });

    logger.info(
      `Web indexing complete: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`,
    );

    return inputData;
  },
});

const webIndexerWorkflow = createWorkflow({
  id: "web-indexer",
  inputSchema: webIndexerInputSchema,
  outputSchema: webIndexerOutputSchema,
})
  .then(crawlPages)
  .then(indexCrawledPages);

webIndexerWorkflow.commit();

export { webIndexerWorkflow };
