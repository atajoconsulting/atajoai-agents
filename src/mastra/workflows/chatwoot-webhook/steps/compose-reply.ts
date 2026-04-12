import { createStep } from "@mastra/core/workflows";
import {
  buildReplyForIntent,
  type RouteMessageResult,
} from "../../../lib/outbound";
import { hasHumanHandoffTarget, type ResolvedAppConfig } from "../../../lib/config";
import { logStepMetrics, extractTokenUsage } from "../../../lib/metrics";
import { judgedResultSchema, composedResultSchema } from "../schemas";
import { formatEvidenceForPrompt, LLM_TIMEOUT_MS } from "../helpers";

export const composeCitizenReply = createStep({
  id: "compose-citizen-reply",
  description: "Composes the citizen-facing message without tool access",
  inputSchema: judgedResultSchema,
  outputSchema: composedResultSchema,
  execute: async ({ inputData, mastra }) => {
    const t0 = Date.now();
    const logger = mastra?.getLogger();
    const config: ResolvedAppConfig = inputData.config;

    if (!inputData.shouldProcess) {
      return {
        ...inputData,
        draftReply: "",
        shouldSend: false,
        handoffRequested: false,
      };
    }

    const handoffRequested =
      inputData.route.intent === "handoff_request" ||
      inputData.route.requestedHandoff;

    const handoffConfigured =
      config.enableHandoff && hasHumanHandoffTarget(config);

    // Use consolidated intent-to-reply mapping
    const deterministicReply = buildReplyForIntent(
      inputData.route,
      inputData.judgement,
      inputData.messageContent,
      config,
      { handoffConfigured },
    );

    if (deterministicReply !== null) {
      if (logger) {
        logStepMetrics(logger, "compose-citizen-reply", {
          durationMs: Date.now() - t0,
          extra: { source: "deterministic", intent: inputData.route.intent },
        });
      }

      return {
        ...inputData,
        draftReply: deterministicReply,
        shouldSend: true,
        handoffRequested,
      };
    }

    // Only local_factual with sufficient evidence reaches here
    const responder = mastra?.getAgent("chatwootResponderAgent");
    if (!responder) {
      throw new Error("Chatwoot responder agent not found");
    }

    const response = await responder.generate(
      [
        {
          role: "user",
          content: [
            `Consulta del ciudadano: ${inputData.messageContent}`,
            `Canal: ${inputData.channel}`,
            `<evidencia>\n${formatEvidenceForPrompt(inputData.evidence)}\n</evidencia>`,
            `Confianza en la evidencia: ${inputData.judgement.confidence}`,
          ].join("\n\n"),
        },
      ],
      {
        maxSteps: 1,
        abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        memory: {
          thread: inputData.threadId,
          resource: inputData.resourceId,
        },
        modelSettings: {
          temperature: 0.1,
          maxOutputTokens: 350,
        },
      },
    );

    if (logger) {
      logStepMetrics(logger, "compose-citizen-reply", {
        durationMs: Date.now() - t0,
        tokensUsed: extractTokenUsage(response),
        extra: { source: "llm" },
      });
    }

    return {
      ...inputData,
      draftReply: response.text.trim(),
      shouldSend: true,
      handoffRequested: false,
    };
  },
});
