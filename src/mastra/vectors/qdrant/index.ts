import { QdrantVector } from "@mastra/qdrant";
import { env } from "../../env";

export const qdrantVector = new QdrantVector({
  id: "qdrant",
  url: env.QDRANT_URL,
  ...(env.QDRANT_API_KEY && { apiKey: env.QDRANT_API_KEY }),
});

type QdrantClientFromVector = (typeof qdrantVector extends { client: infer C } ? C : never);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getQdrantClient(): any {
  return (qdrantVector as any).client;
}

async function ensureQdrantSetup(): Promise<void> {
  await qdrantVector.createIndex({
    indexName: env.QDRANT_COLLECTION,
    dimension: env.QDRANT_VECTOR_SIZE,
    metric: "cosine",
  });

  await Promise.all([
    qdrantVector.createPayloadIndex({
      indexName: env.QDRANT_COLLECTION,
      fieldName: "documentId",
      fieldSchema: "keyword",
    }),
    qdrantVector.createPayloadIndex({
      indexName: env.QDRANT_COLLECTION,
      fieldName: "contentHash",
      fieldSchema: "keyword",
    }),
    qdrantVector.createPayloadIndex({
      indexName: env.QDRANT_COLLECTION,
      fieldName: "source",
      fieldSchema: "keyword",
    }),
    qdrantVector.createPayloadIndex({
      indexName: env.QDRANT_COLLECTION,
      fieldName: "sourceType",
      fieldSchema: "keyword",
    }),
    qdrantVector.createPayloadIndex({
      indexName: env.QDRANT_COLLECTION,
      fieldName: "lang",
      fieldSchema: "keyword",
    }),
    qdrantVector.createPayloadIndex({
      indexName: env.QDRANT_COLLECTION,
      fieldName: "searchContent",
      fieldSchema: "text",
    }),
  ]);
}

export let qdrantReady = false;

ensureQdrantSetup()
  .then(() => {
    qdrantReady = true;
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[qdrant] FATAL: Failed to ensure collection/index setup: ${msg}\n`);
    // Don't exit — Qdrant may become available later, but callers can check qdrantReady
  });
