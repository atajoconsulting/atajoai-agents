import { z } from "zod";

export const webIndexerInputSchema = z.object({
  documentId: z.string(),
  source: z.string().optional(),
  title: z.string().optional(),
  urls: z.array(z.string()).min(1),
});

export type WebIndexerInput = z.infer<typeof webIndexerInputSchema>;

export const crawledPageSchema = z.object({
  documentId: z.string(),
  id: z.string(),
  url: z.string(),
  title: z.string(),
  text: z.string().optional(),
  /** ISO 639-1 code detected during crawl, e.g. "ca", "eu", "en" */
  detectedLang: z.string().optional(),
  httpStatus: z.number(),
  contentHash: z.string(),
  crawledAt: z.date(),
});

export const webIndexerOutputSchema = z.object({
  crawledPages: z.array(crawledPageSchema),
  indexed: z.number(),
  skipped: z.number(),
  errors: z.number(),
  chunkCount: z.number(),
});

export type CrawledPage = z.infer<typeof crawledPageSchema>;
export type WebIndexerOutput = z.infer<typeof webIndexerOutputSchema>;
