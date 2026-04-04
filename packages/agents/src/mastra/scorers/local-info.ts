import { randomUUID } from "node:crypto";
import { createScorer, type ScorerRunInputForAgent, type ScorerRunOutputForAgent } from "@mastra/core/evals";
import {
  createAnswerRelevancyScorer,
  createContextPrecisionScorer,
  createFaithfulnessScorer,
  createTrajectoryScorerCode,
} from "@mastra/evals/scorers/prebuilt";
import { env } from "@atajoai/shared";
import {
  evaluateOutboundReply,
  isSubjectiveLocalQuery,
  type LocalEvidence,
} from "../lib/outbound";

function createSyntheticMessage(
  role: "user" | "assistant",
  text: string,
): ScorerRunOutputForAgent[number] {
  return {
    id: randomUUID(),
    role,
    createdAt: new Date(),
    content: {
      format: 2,
      content: text,
      parts: [{ type: "text", text }],
    },
  };
}

function createSyntheticAgentRun(question: string, reply: string): {
  input: ScorerRunInputForAgent;
  output: ScorerRunOutputForAgent;
} {
  return {
    input: {
      inputMessages: [createSyntheticMessage("user", question)],
      rememberedMessages: [],
      systemMessages: [],
      taggedSystemMessages: {},
    },
    output: [createSyntheticMessage("assistant", reply)],
  };
}

function getQuestion(run: { input?: any; output?: any }): string {
  return String(
    run.output?.messageContent ?? run.input?.messageContent ?? "",
  ).trim();
}

function getReply(run: { input?: any; output?: any }): string {
  return String(
    run.output?.outboundReply ?? run.output?.draftReply ?? "",
  ).trim();
}

function getIntent(run: { input?: any; output?: any }): string {
  return String(run.output?.route?.intent ?? run.input?.route?.intent ?? "");
}

function getEvidence(run: { input?: any; output?: any }): string[] {
  const rawEvidence =
    (run.output?.evidence as LocalEvidence[] | undefined) ??
    (run.input?.evidence as LocalEvidence[] | undefined) ??
    [];

  return rawEvidence
    .map((item) => item?.content?.trim())
    .filter((value): value is string => Boolean(value));
}

const answerRelevancyJudge = createAnswerRelevancyScorer({
  model: env.LLM_MODEL_SMALL,
});

export const localChannelRuleScorer = createScorer({
  id: "local-channel-rule-scorer",
  description:
    "Checks channel-safe formatting, leakage protection, concise length, and non-opinionated local tone.",
}).generateScore(({ run }) => {
  const reply = getReply(run);
  const evaluation = evaluateOutboundReply(reply);
  const issues: string[] = [];

  if (!evaluation.isSafeForOutbound) {
    issues.push(evaluation.reason);
  }

  if (/[A-ZÁÉÍÓÚÑ]{12,}/.test(reply)) {
    issues.push("all_caps");
  }

  if (/!!{2,}|\?\?{2,}|¡¡|¿¿/.test(reply)) {
    issues.push("excessive_punctuation");
  }

  if (isSubjectiveLocalQuery(getQuestion(run)) && /\b(el mejor|mi favorito|le recomiendo el mejor)\b/i.test(reply)) {
    issues.push("subjective_ranking");
  }

  return Math.max(0, 1 - issues.length * 0.25);
}).generateReason(({ run, score }) => {
  const reply = getReply(run);
  const evaluation = evaluateOutboundReply(reply);
  const reasons = [];

  if (!evaluation.isSafeForOutbound) {
    reasons.push(evaluation.reason);
  }

  if (/[A-ZÁÉÍÓÚÑ]{12,}/.test(reply)) {
    reasons.push("all_caps");
  }

  if (/!!{2,}|\?\?{2,}|¡¡|¿¿/.test(reply)) {
    reasons.push("excessive_punctuation");
  }

  if (isSubjectiveLocalQuery(getQuestion(run)) && /\b(el mejor|mi favorito|le recomiendo el mejor)\b/i.test(reply)) {
    reasons.push("subjective_ranking");
  }

  return reasons.length === 0
    ? `Score ${score}: salida apta para el canal ciudadano.`
    : `Score ${score}: incidencias detectadas -> ${reasons.join(", ")}.`;
});

export const localInfoAnswerRelevancyScorer = createScorer({
  id: "local-info-answer-relevancy",
  description:
    "Evaluates whether the final citizen reply actually addresses the local question.",
}).generateScore(async ({ run }) => {
  const question = getQuestion(run);
  const reply = getReply(run);

  if (!question || !reply) {
    return 1;
  }

  const syntheticRun = createSyntheticAgentRun(question, reply);
  const result = await answerRelevancyJudge.run({
    input: syntheticRun.input,
    output: syntheticRun.output,
  });

  return result.score;
}).generateReason(async ({ run, score }) => {
  const question = getQuestion(run);
  const reply = getReply(run);

  if (!question || !reply) {
    return `Score ${score}: no aplica porque no hubo respuesta final que evaluar.`;
  }

  const syntheticRun = createSyntheticAgentRun(question, reply);
  const result = await answerRelevancyJudge.run({
    input: syntheticRun.input,
    output: syntheticRun.output,
  });

  return result.reason ?? `Score ${score}: relevancia evaluada sin razón adicional.`;
});

export const localInfoFaithfulnessScorer = createScorer({
  id: "local-info-faithfulness",
  description:
    "Evaluates whether the final citizen reply is grounded in the retrieved local context.",
}).generateScore(async ({ run }) => {
  const intent = getIntent(run);
  const question = getQuestion(run);
  const reply = getReply(run);
  const evidence = getEvidence(run);

  if (!reply || !question || intent !== "local_factual" || evidence.length === 0) {
    return 1;
  }

  const syntheticRun = createSyntheticAgentRun(question, reply);
  const scorer = createFaithfulnessScorer({
    model: env.LLM_MODEL_SMALL,
    options: { context: evidence },
  });

  const result = await scorer.run({
    input: syntheticRun.input,
    output: syntheticRun.output,
  });

  return result.score;
}).generateReason(async ({ run, score }) => {
  const intent = getIntent(run);
  const question = getQuestion(run);
  const reply = getReply(run);
  const evidence = getEvidence(run);

  if (!reply || !question || intent !== "local_factual" || evidence.length === 0) {
    return `Score ${score}: no aplica porque no había contexto factual local suficiente para puntuar groundedness.`;
  }

  const syntheticRun = createSyntheticAgentRun(question, reply);
  const scorer = createFaithfulnessScorer({
    model: env.LLM_MODEL_SMALL,
    options: { context: evidence },
  });

  const result = await scorer.run({
    input: syntheticRun.input,
    output: syntheticRun.output,
  });

  return result.reason ?? `Score ${score}: groundedness evaluada sin razón adicional.`;
});

export const localInfoContextPrecisionScorer = createScorer({
  id: "local-info-context-precision",
  description:
    "Evaluates whether retrieved local context is relevant and well-positioned for the final reply.",
}).generateScore(async ({ run }) => {
  const intent = getIntent(run);
  const question = getQuestion(run);
  const reply = getReply(run);
  const evidence = getEvidence(run);

  if (!reply || !question || intent !== "local_factual" || evidence.length === 0) {
    return 1;
  }

  const syntheticRun = createSyntheticAgentRun(question, reply);
  const scorer = createContextPrecisionScorer({
    model: env.LLM_MODEL_SMALL,
    options: { context: evidence },
  });

  const result = await scorer.run({
    input: syntheticRun.input,
    output: syntheticRun.output,
  });

  return result.score;
}).generateReason(async ({ run, score }) => {
  const intent = getIntent(run);
  const question = getQuestion(run);
  const reply = getReply(run);
  const evidence = getEvidence(run);

  if (!reply || !question || intent !== "local_factual" || evidence.length === 0) {
    return `Score ${score}: no aplica porque no hubo retrieval local suficiente para medir context precision.`;
  }

  const syntheticRun = createSyntheticAgentRun(question, reply);
  const scorer = createContextPrecisionScorer({
    model: env.LLM_MODEL_SMALL,
    options: { context: evidence },
  });

  const result = await scorer.run({
    input: syntheticRun.input,
    output: syntheticRun.output,
  });

  return result.reason ?? `Score ${score}: context precision evaluada sin razón adicional.`;
});

export const localInfoTrajectoryScorer = createTrajectoryScorerCode({
  defaults: {
    maxSteps: 7,
    noRedundantCalls: true,
  },
});

export const localInfoRegisteredScorers = {
  localChannelRuleScorer,
  localInfoAnswerRelevancyScorer,
  localInfoFaithfulnessScorer,
  localInfoContextPrecisionScorer,
  localInfoTrajectoryScorer,
};

export const sanitizeOutboundStepScorers = {
  localChannelRule: {
    scorer: localChannelRuleScorer,
    sampling: { type: "ratio" as const, rate: 1 },
  },
  localAnswerRelevancy: {
    scorer: localInfoAnswerRelevancyScorer,
    sampling: { type: "ratio" as const, rate: 0.2 },
  },
  localFaithfulness: {
    scorer: localInfoFaithfulnessScorer,
    sampling: { type: "ratio" as const, rate: 0.2 },
  },
  localContextPrecision: {
    scorer: localInfoContextPrecisionScorer,
    sampling: { type: "ratio" as const, rate: 0.2 },
  },
};
