import { createStep, createWorkflow } from "@mastra/core/workflows";
import {
  extractCleanText,
  isErrorPage,
  isSpaPage,
  webIndexerInputSchema,
  webIndexerOutputSchema,
} from "../lib/web-indexer";
import { fetchPage } from "../lib/web-indexer/requester";
import { CrawledPage } from "../lib/web-indexer";
import { createHash } from "node:crypto";

const crawlPages = createStep({
  id: "crawl-pages",
  description: "Extracts text from ",
  inputSchema: webIndexerInputSchema,
  outputSchema: webIndexerOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { urls } = inputData;
    const runId = (inputData as { _runId?: string })._runId;
    const logger = mastra.getLogger();

    const crawled = new Array<CrawledPage>();

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

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

const webIndexerWorkflow = createWorkflow({
  id: "web-indexer",
  inputSchema: webIndexerInputSchema,
  outputSchema: webIndexerOutputSchema,
}).then(crawlPages);

webIndexerWorkflow.commit();

export { webIndexerWorkflow };
