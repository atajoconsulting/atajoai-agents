import { z } from "zod";

export const webIndexerInputSchema = z.object({
  urls: z.array(z.string()),
});

export type WebIndexerInput = z.infer<typeof webIndexerInputSchema>;

export const crawledPageSchema = z.object({
  url: z.string(),
  title: z.string(),
  text: z.string().optional(),
  httpStatus: z.number(),
  contentHash: z.string(),
  crawledAt: z.date(),
});

export const webIndexerOutputSchema = z.object({
  crawledPages: z.array(crawledPageSchema),
});

export type CrawledPage = z.infer<typeof crawledPageSchema>;
export type WebIndexerOutput = z.infer<typeof webIndexerOutputSchema>;
