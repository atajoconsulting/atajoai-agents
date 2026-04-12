import { createStep } from "@mastra/core/workflows";
import {
  evaluateOutboundReply,
  buildReplyForIntent,
  buildKnowledgeFallback,
} from "../../../lib/outbound";
import { type ResolvedAppConfig } from "../../../lib/config";
import { logStepMetrics, extractTokenUsage } from "../../../lib/metrics";
import { sanitizeOutboundStepScorers } from "../../../scorers/local-info";
import { composedResultSchema, sanitizedResultSchema } from "../schemas";
import { formatEvidenceForPrompt, LLM_TIMEOUT_MS } from "../helpers";

export const sanitizeReply = createStep({
  id: "sanitize-outbound-reply",
  description:
    "Validates that the outbound text is safe for citizen-facing channels",
  scorers: sanitizeOutboundStepScorers,
  inputSchema: composedResultSchema,
  outputSchema: sanitizedResultSchema,
  execute: async ({ inputData, mastra }) => {
    const t0 = Date.now();
    const logger = mastra?.getLogger();
    const config: ResolvedAppConfig = inputData.config;

    if (!inputData.shouldSend) {
      return {
        ...inputData,
        outboundReply: "",
        sanitize: {
          isSafeForOutbound: true,
          reason: "skipped",
          repairedText: "",
        },
      };
    }

    const initialCheck = evaluateOutboundReply(inputData.draftReply, config);

    if (initialCheck.isSafeForOutbound) {
      if (logger) {
        logStepMetrics(logger, "sanitize-outbound-reply", {
          durationMs: Date.now() - t0,
          extra: { result: "pass" },
        });
      }
      return {
        ...inputData,
        outboundReply: initialCheck.repairedText,
        sanitize: initialCheck,
      };
    }

    const responder = mastra?.getAgent("chatwootResponderAgent");
    if (!responder) {
      throw new Error("Chatwoot responder agent not found");
    }

    const repaired = await responder.generate(
      [
        {
          role: "user",
          content: [
            `Reescriba este borrador. Problema detectado: ${initialCheck.reason}`,
            `Consulta original: ${inputData.messageContent}`,
            `Canal: ${inputData.channel}`,
            `<evidencia>\n${formatEvidenceForPrompt(inputData.evidence)}\n</evidencia>`,
            `Borrador a reparar:\n${inputData.draftReply}`,
            "Devuelva solo el texto final corregido.",
          ].join("\n\n"),
        },
      ],
      {
        maxSteps: 1,
        abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        modelSettings: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      },
    );

    const repairedCheck = evaluateOutboundReply(repaired.text, config);
    if (repairedCheck.isSafeForOutbound) {
      if (logger) {
        logStepMetrics(logger, "sanitize-outbound-reply", {
          durationMs: Date.now() - t0,
          tokensUsed: extractTokenUsage(repaired),
          extra: { result: "repaired" },
        });
      }
      return {
        ...inputData,
        outboundReply: repairedCheck.repairedText,
        sanitize: repairedCheck,
      };
    }

    // Final fallback: use deterministic safe reply
    const fallbackReply = buildReplyForIntent(
      inputData.route,
      inputData.judgement,
      inputData.messageContent,
      config,
    ) ?? buildKnowledgeFallback(
      inputData.judgement.fallbackMode,
      inputData.messageContent,
      config,
    );

    const fallbackCheck = evaluateOutboundReply(fallbackReply, config);

    if (logger) {
      logStepMetrics(logger, "sanitize-outbound-reply", {
        durationMs: Date.now() - t0,
        tokensUsed: extractTokenUsage(repaired),
        extra: { result: "fallback", reason: repairedCheck.reason },
      });
    }

    return {
      ...inputData,
      outboundReply: fallbackCheck.repairedText,
      sanitize: {
        isSafeForOutbound: fallbackCheck.isSafeForOutbound,
        reason: `fallback_applied:${repairedCheck.reason}`,
        repairedText: fallbackCheck.repairedText,
      },
    };
  },
});
