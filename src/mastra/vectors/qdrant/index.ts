import { QdrantVector } from "@mastra/qdrant";
import { env } from "../../env";

export const qdrantVector = new QdrantVector({
  id: "qdrant",
  url: env.QDRANT_URL,
  ...(env.QDRANT_API_KEY && { apiKey: env.QDRANT_API_KEY }),
});

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
  ]);
}

ensureQdrantSetup().catch((err) => {
  console.error(`[qdrant] Failed to ensure collection/index setup:`, err);
});
