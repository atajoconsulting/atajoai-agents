import { z } from "zod";

/**
 * A chunk is the unit stored and retrieved in the vector database.
 * Each document is split into one or more chunks before indexing.
 */
export const ragChunkSchema = z.object({
  /** Unique chunk id: typically "<documentId>-<chunkIndex>" */
  id: z.string(),

  /** Id of the parent document this chunk belongs to */
  documentId: z.string(),

  /** Chunk text content that gets embedded */
  content: z.string(),

  /** Zero-based position of this chunk within the document */
  chunkIndex: z.number().int().nonnegative(),
});

/**
 * A document is the top-level unit ingested into the RAG pipeline.
 * It maps 1:N to ragChunkSchema once split.
 */
export const ragDocumentSchema = z.object({
  /** Stable unique id — e.g. SHA-256 of the canonical source URL or file path */
  id: z.string(),

  /** Human-readable title */
  title: z.string(),

  /** Full text content (original language) */
  content: z.string(),

  /** Translated content, populated only when content is not in Spanish */
  translatedContent: z.string().optional(),

  /** ISO 639-1 language code of the original content, e.g. "es", "ca", "en" */
  lang: z.string().optional(),

  /** Source URI: URL, file path, or any canonical reference */
  source: z.string(),

  /** Where the document came from: web, pdf, docx, etc. */
  sourceType: z.enum(["web", "pdf", "docx", "txt", "other"]).default("other"),

  /** SHA-256 hash of the content — used to detect changes and skip re-indexing */
  contentHash: z.string(),

  /** Arbitrary key-value metadata (section, tags, author, etc.) */
  metadata: z.record(z.string(), z.unknown()).optional(),

  indexedAt: z.date(),
});

export type RagDocument = z.infer<typeof ragDocumentSchema>;
export type RagChunk = z.infer<typeof ragChunkSchema>;
