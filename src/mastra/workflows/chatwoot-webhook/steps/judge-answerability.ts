import { createStep } from "@mastra/core/workflows";
import { judgeAnswerabilityResultSchema } from "../../../lib/outbound";
import { logStepMetrics, extractTokenUsage } from "../../../lib/metrics";
import { retrievedResultSchema, judgedResultSchema } from "../schemas";
import {
  getDefaultJudgement,
  getJudgementForNonFactualRoute,
  formatEvidenceForPrompt,
  LLM_TIMEOUT_MS,
} from "../helpers";

export const judgeAnswerability = createStep({
  id: "judge-answerability",
  description:
    "Determines whether the retrieved evidence is sufficient to answer safely",
  inputSchema: retrievedResultSchema,
  outputSchema: judgedResultSchema,
  execute: async ({ inputData, mastra }) => {
    const t0 = Date.now();
    const logger = mastra?.getLogger();

    if (!inputData.shouldProcess) {
      return { ...inputData, judgement: getDefaultJudgement() };
    }

    if (
      inputData.route.intent !== "local_factual" ||
      inputData.route.requiresClarification
    ) {
      return {
        ...inputData,
        judgement: getJudgementForNonFactualRoute(inputData.route),
      };
    }

    if (inputData.evidence.length === 0) {
      return { ...inputData, judgement: getDefaultJudgement() };
    }

    const judge = mastra?.getAgent("answerabilityJudgeAgent");
    if (!judge) {
      throw new Error("Answerability judge agent not found");
    }

    const response = await judge.generate(
      [
        {
          role: "user",
          content: [
            `Consulta: ${inputData.messageContent}`,
            `Evidencia:\n${formatEvidenceForPrompt(inputData.evidence)}`,
          ].join("\n\n"),
        },
      ],
      {
        maxSteps: 1,
        abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        memory: {
          thread: inputData.threadId,
          resource: inputData.resourceId,
          options: { lastMessages: 4, readOnly: true },
        },
        structuredOutput: {
          schema: judgeAnswerabilityResultSchema,
        },
      },
    );

    const judgement = judgeAnswerabilityResultSchema.parse(response.object);

    if (logger) {
      logStepMetrics(logger, "judge-answerability", {
        durationMs: Date.now() - t0,
        tokensUsed: extractTokenUsage(response),
        extra: {
          answerable: judgement.answerable,
          confidence: judgement.confidence,
        },
      });
    }

    return { ...inputData, judgement };
  },
});
