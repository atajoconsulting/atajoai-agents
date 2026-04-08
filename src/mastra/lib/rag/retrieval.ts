export interface RetrievalQueryConfig {
  embedModel: string;
  retrievalTopK: number;
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
      embedModel: { $eq: config.embedModel },
    },
  };
}
