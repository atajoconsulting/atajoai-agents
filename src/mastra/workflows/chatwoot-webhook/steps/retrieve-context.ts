import { createStep } from "@mastra/core/workflows";
import { logStepMetrics } from "../../../lib/metrics";
import { routedResultSchema, retrievedResultSchema } from "../schemas";
import { retrieveLocalEvidence } from "../helpers";

export const retrieveContext = createStep({
  id: "retrieve-context",
  description: "Retrieves dense local evidence directly from Qdrant",
  inputSchema: routedResultSchema,
  outputSchema: retrievedResultSchema,
  execute: async ({ inputData, mastra }) => {
    const t0 = Date.now();
    const logger = mastra?.getLogger();

    if (!inputData.shouldProcess || !inputData.route.requiresRetrieval) {
      return { ...inputData, evidence: [] };
    }

    const evidence = await retrieveLocalEvidence({
      mastra,
      queryText: inputData.searchQuery,
      config: inputData.config,
    });

    if (logger) {
      if (evidence.length === 0) {
        logger.warn("[retrieve-context] No evidence matched current embedModel");
      }

      logStepMetrics(logger, "retrieve-context", {
        durationMs: Date.now() - t0,
        extra: {
          evidenceCount: evidence.length,
          embedModel: inputData.config.embedModel,
        },
      });
    }

    return { ...inputData, evidence };
  },
});
