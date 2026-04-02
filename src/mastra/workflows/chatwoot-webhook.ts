import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  assignChatwootConversation,
  sendChatwootMessage,
} from "../lib/chatwoot-api";
import {
  buildClarificationReply,
  buildGreetingReply,
  buildHandoffConfirmationReply,
  buildHandoffPrivateNote,
  buildKnowledgeFallback,
  buildOutOfScopeReply,
  buildSensitiveReply,
  buildUnavailableHandoffReply,
  evaluateOutboundReply,
  getOutboundStyleInstructions,
  judgeAnswerabilityResultSchema,
  localEvidenceSchema,
  looksLikeLocalInfoQuery,
  routeMessageResultSchema,
  sanitizeReplyResultSchema,
} from "../lib/outbound";
import { env } from "../env";
import { sanitizeOutboundStepScorers } from "../scorers/local-info";

const embedModel = new ModelRouterEmbeddingModel(env.EMBED_MODEL);
const RETRIEVAL_TOP_K = 6;

export const chatwootWebhookSchema = z.object({
  event: z.string().describe("Webhook event type"),
  id: z.number().optional().describe("Message ID"),
  content: z.string().nullable().optional().describe("Message content"),
  message_type: z
    .string()
    .optional()
    .describe("incoming, outgoing, or template"),
  private: z.boolean().optional(),
  sender: z
    .object({
      id: z.number().optional(),
      type: z.string().optional().describe("contact or user"),
      name: z.string().optional(),
    })
    .optional(),
  account: z.object({
    id: z.number(),
  }),
  conversation: z.object({
    id: z.number(),
  }),
});

const validationResultSchema = z.object({
  shouldProcess: z.boolean(),
  accountId: z.number(),
  conversationId: z.number(),
  messageContent: z.string(),
  senderName: z.string(),
  threadId: z.string(),
  resourceId: z.string(),
});

const routedResultSchema = validationResultSchema.extend({
  route: routeMessageResultSchema,
});

const retrievedResultSchema = routedResultSchema.extend({
  evidence: z.array(localEvidenceSchema),
});

const judgedResultSchema = retrievedResultSchema.extend({
  judgement: judgeAnswerabilityResultSchema,
});

const composedResultSchema = judgedResultSchema.extend({
  draftReply: z.string(),
  shouldSend: z.boolean(),
  handoffRequested: z.boolean(),
});

const sanitizedResultSchema = judgedResultSchema.extend({
  outboundReply: z.string(),
  shouldSend: z.boolean(),
  handoffRequested: z.boolean(),
  sanitize: sanitizeReplyResultSchema,
});

function getDefaultRoute() {
  return {
    intent: "needs_clarification" as const,
    requiresRetrieval: false,
    requiresClarification: false,
    requestedHandoff: false,
    sensitivity: "normal" as const,
  };
}

function getDefaultJudgement() {
  return {
    answerable: false,
    confidence: "low" as const,
    missingInfo: [] as string[],
    fallbackMode: "contact_phone" as const,
  };
}

function isHumanHandoffConfigured(): boolean {
  return (
    env.CHATWOOT_ENABLE_HUMAN_HANDOFF &&
    Boolean(env.CHATWOOT_HANDOFF_ASSIGNEE_ID || env.CHATWOOT_HANDOFF_TEAM_ID)
  );
}

function formatEvidenceForPrompt(
  evidence: z.infer<typeof localEvidenceSchema>[],
): string {
  if (evidence.length === 0) {
    return "No se recuperó evidencia.";
  }

  return evidence
    .map((chunk, index) => {
      const excerpt =
        chunk.content.length > 900
          ? `${chunk.content.slice(0, 900)}...`
          : chunk.content;

      return [
        `Fuente ${index + 1}`,
        `- Título: ${chunk.title}`,
        `- Origen: ${chunk.source}`,
        `- Score: ${chunk.score.toFixed(3)}`,
        `- Fragmento: ${excerpt}`,
      ].join("\n");
    })
    .join("\n\n");
}

function applyLocalIntentHeuristics(
  messageContent: string,
  route: z.infer<typeof routeMessageResultSchema>,
) {
  if (
    route.intent === "out_of_scope" &&
    route.sensitivity === "normal" &&
    looksLikeLocalInfoQuery(messageContent)
  ) {
    return {
      ...route,
      intent: "local_factual" as const,
      requiresRetrieval: true,
      requiresClarification: false,
    };
  }

  return route;
}

function getJudgementForNonFactualRoute(
  route: z.infer<typeof routeMessageResultSchema>,
) {
  if (route.intent === "handoff_request") {
    return {
      answerable: false,
      confidence: "high" as const,
      missingInfo: [],
      fallbackMode: "handoff" as const,
    };
  }

  if (route.intent === "smalltalk_or_greeting") {
    return {
      answerable: true,
      confidence: "high" as const,
      missingInfo: [],
      fallbackMode: "none" as const,
    };
  }

  if (route.intent === "needs_clarification" || route.requiresClarification) {
    return {
      answerable: false,
      confidence: "medium" as const,
      missingInfo: [],
      fallbackMode: "clarify" as const,
    };
  }

  if (route.intent === "sensitive" || route.sensitivity === "sensitive") {
    return {
      answerable: false,
      confidence: "high" as const,
      missingInfo: [],
      fallbackMode: "safe_refusal" as const,
    };
  }

  return {
    answerable: false,
    confidence: "high" as const,
    missingInfo: [],
    fallbackMode: "contact_phone" as const,
  };
}

function buildSafeFallbackReply(
  inputData: z.infer<typeof judgedResultSchema> & {
    handoffRequested?: boolean;
  },
): string {
  if (inputData.handoffRequested) {
    return isHumanHandoffConfigured()
      ? buildHandoffConfirmationReply()
      : buildUnavailableHandoffReply(inputData.messageContent);
  }

  switch (inputData.route.intent) {
    case "smalltalk_or_greeting":
      return buildGreetingReply();
    case "out_of_scope":
      return buildOutOfScopeReply();
    case "sensitive":
      return buildSensitiveReply();
    case "needs_clarification":
      return buildClarificationReply(inputData.judgement.missingInfo);
    case "handoff_request":
      return buildUnavailableHandoffReply(inputData.messageContent);
    case "local_factual":
    default:
      return buildKnowledgeFallback(
        inputData.judgement.fallbackMode,
        inputData.messageContent,
      );
  }
}

async function retrieveLocalEvidence({
  mastra,
  queryText,
}: {
  mastra: any;
  queryText: string;
}): Promise<z.infer<typeof localEvidenceSchema>[]> {
  const vectorStore = mastra.getVector("qdrant");
  const { embeddings } = await embedModel.doEmbed({ values: [queryText] });
  const [queryVector] = embeddings;
  const results = await vectorStore.query({
    indexName: env.QDRANT_COLLECTION,
    queryVector,
    topK: RETRIEVAL_TOP_K,
  });

  const deduped = new Map<string, z.infer<typeof localEvidenceSchema>>();

  for (const result of results) {
    const metadata = result.metadata ?? {};
    const parsed = localEvidenceSchema.safeParse({
      documentId: String(metadata.documentId ?? result.id),
      title: String(metadata.title ?? "Información local"),
      source: String(metadata.source ?? "desconocido"),
      content: String(metadata.content ?? result.document ?? ""),
      chunkIndex: Number(metadata.chunkIndex ?? 0),
      score: Number(result.score ?? 0),
      lang:
        typeof metadata.lang === "string" ? metadata.lang : undefined,
    });

    if (!parsed.success || !parsed.data.content.trim()) {
      continue;
    }

    const key = `${parsed.data.documentId}:${parsed.data.chunkIndex}`;
    if (!deduped.has(key)) {
      deduped.set(key, parsed.data);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => b.score - a.score);
}

const validateWebhook = createStep({
  id: "validate-webhook",
  description:
    "Validates the incoming Chatwoot webhook and extracts relevant data",
  inputSchema: chatwootWebhookSchema,
  outputSchema: validationResultSchema,
  execute: async ({ inputData }) => {
    const skip = {
      shouldProcess: false,
      accountId: inputData.account.id,
      conversationId: inputData.conversation.id,
      messageContent: "",
      senderName: "",
      threadId: "",
      resourceId: "",
    };

    if (inputData.event !== "message_created") return skip;
    if (inputData.message_type !== "incoming") return skip;
    if (inputData.private) return skip;
    if (!inputData.content?.trim()) return skip;

    return {
      shouldProcess: true,
      accountId: inputData.account.id,
      conversationId: inputData.conversation.id,
      messageContent: inputData.content.trim(),
      senderName: inputData.sender?.name || "Ciudadano",
      threadId: `chatwoot-conv-${inputData.conversation.id}`,
      resourceId: `chatwoot-${inputData.conversation.id}`,
    };
  },
});

const routeMessage = createStep({
  id: "route-message",
  description: "Classifies the incoming message into a controlled intent",
  inputSchema: validationResultSchema,
  outputSchema: routedResultSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData.shouldProcess) {
      return { ...inputData, route: getDefaultRoute() };
    }

    const router = mastra?.getAgent("chatwootRouterAgent");
    if (!router) {
      throw new Error("Chatwoot router agent not found");
    }

    const response = await router.generate(
      [
        {
          role: "user",
          content: [
            "Clasifique el siguiente mensaje ciudadano.",
            "Devuelva solo el objeto estructurado solicitado.",
            `Mensaje: ${inputData.messageContent}`,
          ].join("\n\n"),
        },
      ],
      {
        maxSteps: 1,
        modelSettings: {
          temperature: 0,
        },
        structuredOutput: {
          schema: routeMessageResultSchema,
          jsonPromptInjection: true,
        },
      },
    );

    return {
      ...inputData,
      route: applyLocalIntentHeuristics(
        inputData.messageContent,
        routeMessageResultSchema.parse(response.object),
      ),
    };
  },
});

const retrieveContext = createStep({
  id: "retrieve-context",
  description: "Retrieves dense local evidence directly from Qdrant",
  inputSchema: routedResultSchema,
  outputSchema: retrievedResultSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData.shouldProcess || !inputData.route.requiresRetrieval) {
      return { ...inputData, evidence: [] };
    }

    const evidence = await retrieveLocalEvidence({
      mastra,
      queryText: inputData.messageContent,
    });

    return {
      ...inputData,
      evidence,
    };
  },
});

const judgeAnswerability = createStep({
  id: "judge-answerability",
  description:
    "Determines whether the retrieved evidence is sufficient to answer safely",
  inputSchema: retrievedResultSchema,
  outputSchema: judgedResultSchema,
  execute: async ({ inputData, mastra }) => {
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
      return {
        ...inputData,
        judgement: getDefaultJudgement(),
      };
    }

    const router = mastra?.getAgent("chatwootRouterAgent");
    if (!router) {
      throw new Error("Chatwoot router agent not found");
    }

    const response = await router.generate(
      [
        {
          role: "user",
          content: [
            "Evalúe si la evidencia recuperada basta para responder a la consulta con seguridad.",
            "Si falta información esencial, marque answerable=false y use un fallback conservador.",
            `Consulta: ${inputData.messageContent}`,
            `Evidencia:\n${formatEvidenceForPrompt(inputData.evidence)}`,
          ].join("\n\n"),
        },
      ],
      {
        maxSteps: 1,
        modelSettings: {
          temperature: 0,
        },
        structuredOutput: {
          schema: judgeAnswerabilityResultSchema,
          jsonPromptInjection: true,
        },
      },
    );

    return {
      ...inputData,
      judgement: judgeAnswerabilityResultSchema.parse(response.object),
    };
  },
});

const composeCitizenReply = createStep({
  id: "compose-citizen-reply",
  description: "Composes the citizen-facing message without tool access",
  inputSchema: judgedResultSchema,
  outputSchema: composedResultSchema,
  execute: async ({ inputData, mastra }) => {
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

    if (handoffRequested) {
      return {
        ...inputData,
        draftReply: isHumanHandoffConfigured()
          ? buildHandoffConfirmationReply()
          : buildUnavailableHandoffReply(inputData.messageContent),
        shouldSend: true,
        handoffRequested,
      };
    }

    if (inputData.route.intent === "smalltalk_or_greeting") {
      return {
        ...inputData,
        draftReply: buildGreetingReply(),
        shouldSend: true,
        handoffRequested: false,
      };
    }

    if (inputData.route.intent === "out_of_scope") {
      return {
        ...inputData,
        draftReply: buildOutOfScopeReply(),
        shouldSend: true,
        handoffRequested: false,
      };
    }

    if (
      inputData.route.intent === "sensitive" ||
      inputData.route.sensitivity === "sensitive"
    ) {
      return {
        ...inputData,
        draftReply: buildSensitiveReply(),
        shouldSend: true,
        handoffRequested: false,
      };
    }

    if (
      inputData.route.intent === "needs_clarification" ||
      inputData.route.requiresClarification ||
      inputData.judgement.fallbackMode === "clarify"
    ) {
      return {
        ...inputData,
        draftReply: buildClarificationReply(inputData.judgement.missingInfo),
        shouldSend: true,
        handoffRequested: false,
      };
    }

    if (!inputData.judgement.answerable || inputData.evidence.length === 0) {
      return {
        ...inputData,
        draftReply: buildKnowledgeFallback(
          inputData.judgement.fallbackMode,
          inputData.messageContent,
        ),
        shouldSend: true,
        handoffRequested: false,
      };
    }

    const responder = mastra?.getAgent("chatwootResponderAgent");
    if (!responder) {
      throw new Error("Chatwoot responder agent not found");
    }

    const response = await responder.generate(
      [
        {
          role: "user",
          content: [
            "Redacte la respuesta final para la ciudadanía.",
            `Consulta del ciudadano: ${inputData.messageContent}`,
            `Use solo esta evidencia:\n${formatEvidenceForPrompt(
              inputData.evidence,
            )}`,
            `Política del canal: ${getOutboundStyleInstructions()}`,
            "Si la consulta está formulada de manera subjetiva, no haga rankings ni preferencias personales; limite la respuesta a opciones factuales presentes en la evidencia.",
            "Si alguna parte no está completamente confirmada, indíquelo y remita al contacto municipal.",
            "Devuelva solo el texto final.",
          ].join("\n\n"),
        },
      ],
      {
        maxSteps: 1,
        memory: {
          thread: inputData.threadId,
          resource: inputData.resourceId,
        },
        modelSettings: {
          temperature: 0.2,
          maxOutputTokens: 350,
        },
      },
    );

    return {
      ...inputData,
      draftReply: response.text.trim(),
      shouldSend: true,
      handoffRequested: false,
    };
  },
});

const sanitizeReply = createStep({
  id: "sanitize-outbound-reply",
  description:
    "Validates that the outbound text is safe for citizen-facing channels",
  scorers: sanitizeOutboundStepScorers,
  inputSchema: composedResultSchema,
  outputSchema: sanitizedResultSchema,
  execute: async ({ inputData, mastra }) => {
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

    const initialCheck = evaluateOutboundReply(inputData.draftReply);
    if (initialCheck.isSafeForOutbound) {
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
            "Reescriba este borrador para un canal ciudadano multicanal.",
            `Problema detectado: ${initialCheck.reason}`,
            `Consulta original: ${inputData.messageContent}`,
            `Borrador a reparar:\n${inputData.draftReply}`,
            `Política del canal: ${getOutboundStyleInstructions()}`,
            "Devuelva solo el texto final para la ciudadanía, sin explicar cambios.",
          ].join("\n\n"),
        },
      ],
      {
        maxSteps: 1,
        modelSettings: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      },
    );

    const repairedCheck = evaluateOutboundReply(repaired.text);
    if (repairedCheck.isSafeForOutbound) {
      return {
        ...inputData,
        outboundReply: repairedCheck.repairedText,
        sanitize: repairedCheck,
      };
    }

    const fallbackReply = buildSafeFallbackReply(inputData);
    const fallbackCheck = evaluateOutboundReply(fallbackReply);

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

const sendReply = createStep({
  id: "send-outbound-reply",
  description: "Sends the outbound message back to Chatwoot",
  inputSchema: sanitizedResultSchema,
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
    handoffPerformed: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData.shouldSend) {
      return { success: true, handoffPerformed: false };
    }

    let outboundReply = inputData.outboundReply;
    let handoffPerformed = false;

    if (inputData.handoffRequested) {
      if (isHumanHandoffConfigured()) {
        try {
          await assignChatwootConversation({
            accountId: inputData.accountId,
            conversationId: inputData.conversationId,
            assigneeId: env.CHATWOOT_HANDOFF_ASSIGNEE_ID,
            teamId: env.CHATWOOT_HANDOFF_TEAM_ID,
          });

          handoffPerformed = true;

          await sendChatwootMessage({
            accountId: inputData.accountId,
            conversationId: inputData.conversationId,
            content: buildHandoffPrivateNote(
              inputData.senderName,
              inputData.messageContent,
            ),
            private: true,
          });
        } catch (error) {
          const logger = mastra?.getLogger();
          logger?.warn(
            `Failed to hand off conversation ${inputData.conversationId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );

          outboundReply = buildUnavailableHandoffReply(inputData.messageContent);
        }
      } else {
        outboundReply = buildUnavailableHandoffReply(inputData.messageContent);
      }
    }

    const data = await sendChatwootMessage({
      accountId: inputData.accountId,
      conversationId: inputData.conversationId,
      content: outboundReply,
    });

    return { success: true, messageId: data.id, handoffPerformed };
  },
});

const chatwootWebhookWorkflow = createWorkflow({
  id: "chatwoot-webhook",
  inputSchema: chatwootWebhookSchema,
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
    handoffPerformed: z.boolean(),
  }),
})
  .then(validateWebhook)
  .then(routeMessage)
  .then(retrieveContext)
  .then(judgeAnswerability)
  .then(composeCitizenReply)
  .then(sanitizeReply)
  .then(sendReply);

chatwootWebhookWorkflow.commit();

export { chatwootWebhookWorkflow };
