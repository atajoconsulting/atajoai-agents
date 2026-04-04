import { z } from "zod";

const fileInputSchema = z.object({
  documentId: z.string(),
  /** Base64-encoded file content */
  content: z.string(),
  /** Original file name */
  fileName: z.string(),
  /** File type */
  type: z.enum(["pdf", "docx", "txt"]),
  /** Canonical source identifier for this file */
  source: z.string(),
  /** Optional S3 key for traceability */
  s3Key: z.string().optional(),
  /** Optional human-readable title (defaults to fileName without extension) */
  title: z.string().optional(),
});

export const documentIndexerInputSchema = z.object({
  files: z.array(fileInputSchema),
});

export const documentIndexerOutputSchema = z.object({
  indexed: z.number(),
  skipped: z.number(),
  errors: z.number(),
  chunkCount: z.number(),
});
