import { createStep, createWorkflow } from "@mastra/core/workflows";
import {
  extractCleanText,
  isErrorPage,
  isSpaPage,
  webIndexerInputSchema,
  webIndexerOutputSchema,
} from "../lib/web-indexer";
import { fetchPage } from "../lib/web-indexer/requester";
import { CrawledPage, normalizeUrl } from "../lib/web-indexer";
import { detectLang } from "../lib/language";
import { toRagDocument } from "../lib/rag";
import { MDocument } from "@mastra/rag";
import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { env } from "../env";
import { createHash } from "node:crypto";
import { v5 as uuidv5 } from "uuid";

const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // UUID v5 DNS namespace


const crawlPages = createStep({
  id: "crawl-pages",
  description: "Extracts text from ",
  inputSchema: webIndexerInputSchema,
  outputSchema: webIndexerOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { urls } = inputData;
    const logger = mastra.getLogger();

    const crawled = new Array<CrawledPage>();

    for (let i = 0; i < urls.length; i++) {
      const url = normalizeUrl(urls[i]);

      const result = await fetchPage(url);
      logger.info(`Fetched ${url} (${result?.html.length} chars)`);

      if (result?.status !== 200 || !result) {
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

      crawled.push({
        id: createHash("sha256").update(url).digest("hex"),
        url,
        title: pageParsed.title,
        httpStatus: result.status,
        contentHash: createHash("sha256").update(pageParsed.text).digest("hex"),
        crawledAt: new Date(),
        text: pageParsed.text,
      });
    }

    return { crawledPages: crawled };
  },
});

const translatePages = createStep({
  id: "translate-pages",
  description:
    "Detects the language of each crawled page and translates non-Spanish content to Spanish",
  inputSchema: webIndexerOutputSchema,
  outputSchema: webIndexerOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const translator = mastra.getAgent("translatorAgent");

    const translated = await Promise.all(
      inputData.crawledPages.map(async (page): Promise<CrawledPage> => {
        if (!page.text) return page;

        const lang = await detectLang(page.text);

        if (!lang || lang === "es")
          return { ...page, detectedLang: lang ?? "es" };

        logger.info(`Translating page ${page.url} from [${lang}] to Spanish`);

        const response = await translator.generate([
          {
            role: "user",
            content: `Translate the following text to Spanish:\n\n${page.text}`,
          },
        ]);

        return {
          ...page,
          detectedLang: lang,
          translatedText: response.text,
        };
      }),
    );

    return { crawledPages: translated };
  },
});

const indexPages = createStep({
  id: "index-pages",
  description: "Chunks and indexes crawled pages into Qdrant using embeddings",
  inputSchema: webIndexerOutputSchema,
  outputSchema: webIndexerOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const vectorStore = mastra.getVector("qdrant");
    const embedModel = new ModelRouterEmbeddingModel(env.EMBED_MODEL);

    for (const page of inputData.crawledPages) {
      if (!page.text) continue;

      try {
        const ragDocument = toRagDocument(page);
        const textToIndex =
          ragDocument.translatedContent ?? ragDocument.content;

        const doc = MDocument.fromMarkdown(textToIndex, {
          documentId: ragDocument.id,
          title: ragDocument.title,
          source: ragDocument.source,
          sourceType: ragDocument.sourceType,
          lang: ragDocument.lang,
          contentHash: ragDocument.contentHash,
        });

        const chunks = await doc.chunk({
          strategy: "recursive",
          maxSize: 900,
          overlap: 100,
        });

        if (chunks.length === 0) {
          logger.warn(`Skipping page with no chunks: ${ragDocument.source}`);
          continue;
        }

        const texts = chunks.map((chunk) => chunk.text);
        const { embeddings } = await embedModel.doEmbed({ values: texts });
        const ids = chunks.map((_, i) =>
          uuidv5(`${ragDocument.id}-${i}`, UUID_NAMESPACE),
        );
        const metadata = chunks.map((chunk, i) => ({
          ...chunk.metadata,
          documentId: ragDocument.id,
          title: ragDocument.title,
          source: ragDocument.source,
          sourceType: ragDocument.sourceType,
          lang: ragDocument.lang ?? "es",
          contentHash: ragDocument.contentHash,
          chunkIndex: i,
          content: chunk.text,
          indexedAt: ragDocument.indexedAt.toISOString(),
        }));

        await vectorStore.upsert({
          indexName: env.QDRANT_COLLECTION,
          vectors: embeddings,
          ids,
          metadata,
        });

        logger.info(
          `Indexed ${chunks.length} chunks for ${ragDocument.source}`,
        );
      } catch (error) {
        logger.error(
          `Failed indexing ${page.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return inputData;
  },
});

const webIndexerWorkflow = createWorkflow({
  id: "web-indexer",
  inputSchema: webIndexerInputSchema,
  outputSchema: webIndexerOutputSchema,
})
  .then(crawlPages)
  .then(translatePages)
  .then(indexPages);

webIndexerWorkflow.commit();

export { webIndexerWorkflow };
