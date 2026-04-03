import { createHash } from "node:crypto";
import type { CrawledPage } from "../web-indexer";
import { RagDocument, ragDocumentSchema, SourceType } from "./schemas";

/**
 * Converts a CrawledPage (web-indexer output) to a RagDocument.
 * Language detection is expected to have already run (page.detectedLang).
 * Translation is NOT done here — it happens per-chunk inside indexer.ts.
 */
export function toRagDocument(page: CrawledPage): RagDocument {
  return ragDocumentSchema.parse({
    id: page.id,
    title: page.title,
    content: page.text,
    lang: page.detectedLang,
    source: page.url,
    sourceType: "web",
    contentHash: page.contentHash,
    metadata: {
      httpStatus: page.httpStatus,
      crawledAt: page.crawledAt.toISOString(),
    },
    indexedAt: new Date(),
  });
}

export interface FileDocumentInput {
  /** Original file name or canonical path */
  filePath: string;
  /** Extracted plain text */
  text: string;
  /** Document title (from metadata or file name) */
  title: string;
  /** File type */
  sourceType: Extract<SourceType, "pdf" | "docx" | "txt">;
  /** Pre-detected language code, if available */
  lang?: string;
  /** Optional extra metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a RagDocument from an extracted file (PDF, DOCX, TXT).
 */
export function fileToRagDocument(input: FileDocumentInput): RagDocument {
  const contentHash = createHash("sha256").update(input.text).digest("hex");
  const id = createHash("sha256").update(input.filePath).digest("hex");

  return ragDocumentSchema.parse({
    id,
    title: input.title,
    content: input.text,
    lang: input.lang,
    source: input.filePath,
    sourceType: input.sourceType,
    contentHash,
    metadata: input.metadata ?? {},
    indexedAt: new Date(),
  });
}
