import { z } from "zod";

/** Source type enum shared across all RAG schemas */
export const sourceTypeSchema = z.enum(["web", "pdf", "docx", "txt", "other"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

/**
 * A document is the top-level unit ingested into the RAG pipeline.
 * It maps 1:N to chunks once split by the indexer.
 *
 * Note: translation is NOT done at document level — it happens per-chunk
 * inside indexer.ts so that original text is preserved in Qdrant.
 */
export const ragDocumentSchema = z.object({
  /** Stable unique id — linked to IndexedDocument.id in the app database */
  id: z.string(),

  /** Human-readable title */
  title: z.string(),

  /** Full text content in original language */
  content: z.string(),

  /** ISO 639-1 language code of the original content, e.g. "es", "ca", "en" */
  lang: z.string().optional(),

  /** Source URI: URL, file path, or any canonical reference */
  source: z.string(),

  /** Where the document came from */
  sourceType: sourceTypeSchema.default("other"),

  /** SHA-256 hash of the content — used to detect changes and skip re-indexing */
  contentHash: z.string(),

  /** Arbitrary key-value metadata (section, tags, author, etc.) */
  metadata: z.record(z.string(), z.unknown()).optional(),

  indexedAt: z.date(),
});

export type RagDocument = z.infer<typeof ragDocumentSchema>;

/**
 * The payload stored per chunk in Qdrant.
 * Matches exactly what indexer.ts writes and chatwoot-webhook.ts reads.
 *
 * Key fields:
 * - content: original-language text (what the agent sees as evidence)
 * - searchContent: Spanish text that was embedded (for search recall)
 */
export const qdrantChunkPayloadSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  source: z.string(),
  sourceType: sourceTypeSchema,
  /** Original language code */
  lang: z.string(),
  contentHash: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  /** Original-language chunk text — shown to the agent as evidence */
  content: z.string(),
  /** Spanish chunk text — what was embedded, kept for debugging/audit */
  searchContent: z.string(),
  indexedAt: z.string(),
});

export type QdrantChunkPayload = z.infer<typeof qdrantChunkPayloadSchema>;
