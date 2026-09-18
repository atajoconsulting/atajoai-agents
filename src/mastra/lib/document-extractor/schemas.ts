import { z } from "zod";

const fileInputSchema = z.object({
  /** Base64-encoded file content */
  content: z.string(),
  /** Original file name */
  fileName: z.string(),
  /** File type */
  type: z.enum(["pdf", "docx", "txt"]),
  /** Optional human-readable title (defaults to fileName without extension) */
  title: z.string().optional(),
});

export const documentIndexerInputSchema = z.object({
  tenantId: z.string().min(1),
  files: z.array(fileInputSchema),
});

export const documentIndexerOutputSchema = z.object({
  indexed: z.number(),
  skipped: z.number(),
  errors: z.number(),
});
