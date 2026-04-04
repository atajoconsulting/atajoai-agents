import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import type { Agent } from "@mastra/core/agent";
import { v5 as uuidv5 } from "uuid";
import { chunkText, type ChunkResult } from "./chunker";
import { detectLang } from "../language";
import type { RagDocument } from "./schemas";
import { env } from "@atajoai/shared";

const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // UUID v5 DNS namespace

/** Max parallel translation calls per document to avoid rate-limiting */
const TRANSLATION_CONCURRENCY = 5;

export interface IndexDocumentsOptions {
  vectorStore: ReturnType<import("@mastra/core").Mastra["getVector"]>;
  embedModel: ModelRouterEmbeddingModel;
  translator: Agent;
  logger: ReturnType<import("@mastra/core").Mastra["getLogger"]>;
}

export interface IndexDocumentsResult {
  indexed: number;
  skipped: number;
  errors: number;
  chunkCount: number;
  /** Chunks where translation failed and original text was used as fallback. */
  translationFallbacks: number;
}

/**
 * Shared indexing pipeline for web pages and documents.
 *
 * Per document:
 * 1. Chunk the ORIGINAL content
 * 2. Detect language on the full original content (once, more reliable than per-chunk)
 * 3. If not Spanish, translate each chunk to Spanish in batches
 * 4. Embed the Spanish version of each chunk
 * 5. Upsert to Qdrant:
 *    - content = original-language text (what the agent sees)
 *    - searchContent = Spanish text (what was embedded)
 */
export async function indexDocuments(
  documents: RagDocument[],
  options: IndexDocumentsOptions,
): Promise<IndexDocumentsResult> {
  const { vectorStore, embedModel, translator, logger } = options;
  let indexed = 0;
  let skipped = 0;
  let errors = 0;
  let chunkCount = 0;
  let translationFallbacks = 0;

  for (const doc of documents) {
    if (!doc.content?.trim()) {
      skipped++;
      continue;
    }

    try {
      // 1. Chunk the original content
      const chunks = await chunkText(doc.content, {
        documentId: doc.id,
        title: doc.title,
        source: doc.source,
        sourceType: doc.sourceType,
      });

      if (chunks.length === 0) {
        logger.warn(`No chunks produced for document: ${doc.source}`);
        skipped++;
        continue;
      }

      // 2. Detect language — use pre-set lang from doc or detect from full content
      const lang = doc.lang ?? (await detectLang(doc.content)) ?? "es";

      // 3. Translate each chunk to Spanish if needed
      const { texts: spanishTexts, fallbacks } = await translateChunks(chunks, lang, translator, logger);
      translationFallbacks += fallbacks;

      // 4. Embed the Spanish versions
      const { embeddings } = await embedModel.doEmbed({ values: spanishTexts });

      // 5. Build deterministic IDs and metadata, then upsert
      const ids = chunks.map((_, i) =>
        uuidv5(`${doc.id}-${i}`, UUID_NAMESPACE),
      );

      const metadata = chunks.map((chunk, i) => ({
        documentId: doc.id,
        title: doc.title,
        source: doc.source,
        sourceType: doc.sourceType,
        lang,
        contentHash: doc.contentHash,
        chunkIndex: i,
        content: chunk.text,          // original language — for agent evidence
        searchContent: spanishTexts[i], // Spanish — what was embedded
        indexedAt: (doc.indexedAt ?? new Date()).toISOString(),
      }));

      await vectorStore.upsert({
        indexName: env.QDRANT_COLLECTION,
        vectors: embeddings,
        ids,
        metadata,
        deleteFilter: { documentId: doc.id },
      });

      chunkCount += chunks.length;
      logger.info(
        `Indexed ${chunks.length} chunks for ${doc.source} [lang=${lang}]`,
      );
      indexed++;
    } catch (error) {
      logger.error(
        `Failed indexing ${doc.source}: ${error instanceof Error ? error.message : String(error)}`,
      );
      errors++;
    }
  }

  if (translationFallbacks > 0) {
    logger.warn(
      `Translation fallbacks: ${translationFallbacks} chunk(s) used original text instead of Spanish — search recall may be reduced for non-Spanish documents.`,
    );
  }

  return { indexed, skipped, errors, chunkCount, translationFallbacks };
}

/**
 * Translates chunks to Spanish.
 * If the document is already in Spanish, returns original texts directly.
 * Translates in concurrent batches; falls back to original text on error.
 */
async function translateChunks(
  chunks: ChunkResult[],
  lang: string,
  translator: Agent,
  logger: ReturnType<import("@mastra/core").Mastra["getLogger"]>,
): Promise<{ texts: string[]; fallbacks: number }> {
  if (lang === "es") {
    return { texts: chunks.map((c) => c.text), fallbacks: 0 };
  }

  const texts: string[] = new Array(chunks.length);
  let fallbacks = 0;

  for (let i = 0; i < chunks.length; i += TRANSLATION_CONCURRENCY) {
    const batch = chunks.slice(i, i + TRANSLATION_CONCURRENCY);

    const translations = await Promise.all(
      batch.map(async (chunk, batchIdx) => {
        try {
          const response = await translator.generate([
            {
              role: "user",
              content: `Translate the following text to Spanish:\n\n${chunk.text}`,
            },
          ]);
          return { text: response.text, failed: false };
        } catch (err) {
          logger.warn(
            `Translation failed for chunk ${i + batchIdx}, using original text: ${err instanceof Error ? err.message : String(err)}`,
          );
          // Fallback: use original text (search recall degrades but indexing continues)
          return { text: chunk.text, failed: true };
        }
      }),
    );

    for (let j = 0; j < translations.length; j++) {
      texts[i + j] = translations[j].text;
      if (translations[j].failed) fallbacks++;
    }
  }

  return { texts, fallbacks };
}
