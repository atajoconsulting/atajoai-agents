import { MDocument } from "@mastra/rag";

export const CHUNK_CONFIG = {
  strategy: "recursive" as const,
  maxSize: 900,
  overlap: 100,
};

export interface ChunkResult {
  text: string;
  metadata: Record<string, unknown>;
}

/**
 * Chunks a text string using the centralized strategy.
 * This is the single point of change for chunking configuration.
 *
 * @param text - The original-language text to chunk
 * @param docMetadata - Document-level metadata attached to every chunk
 */
export async function chunkText(
  text: string,
  docMetadata: Record<string, unknown> = {},
): Promise<ChunkResult[]> {
  const doc = MDocument.fromText(text, docMetadata);
  const chunks = await doc.chunk({
    strategy: CHUNK_CONFIG.strategy,
    maxSize: CHUNK_CONFIG.maxSize,
    overlap: CHUNK_CONFIG.overlap,
  });
  return chunks.map((c) => ({ text: c.text, metadata: c.metadata ?? {} }));
}
