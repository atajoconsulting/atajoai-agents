export interface RetrievalQueryConfig {
  embedModel: string;
  retrievalTopK: number;
  tenantId: string;
}

export function buildEvidenceQuery(
  indexName: string,
  queryVector: number[],
  config: RetrievalQueryConfig,
) {
  return {
    indexName,
    queryVector,
    topK: config.retrievalTopK,
    filter: {
      // AND across embedModel and tenantId — each tenant only ever
      // sees its own indexed chunks even though they live in the same
      // Qdrant collection.
      must: [
        { key: "embedModel", match: { value: config.embedModel } },
        { key: "tenantId", match: { value: config.tenantId } },
      ],
    },
  };
}
