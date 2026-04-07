import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  assignChatwootConversation,
  sendChatwootMessage,
} from "../lib/chatwoot-api";
import { getAppConfig, hasHumanHandoffTarget } from "../lib/config";
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
  judgeAnswerabilityResultSchema,
  localEvidenceSchema,
  routeMessageResultSchema,
  sanitizeReplyResultSchema,
} from "../lib/outbound";
import { env } from "../env";
import { CHUNK_CONFIG } from "../lib/rag/chunker";
import { sanitizeOutboundStepScorers } from "../scorers/local-info";
const MAX_EVIDENCE_CHARS = CHUNK_CONFIG.maxSize; // keep in sync with chunker

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
  }).optional(),
  conversation: z.object({
    id: z.number(),
    channel: z.string().optional(),
  }).optional(),
});

const validationResultSchema = z.object({
  shouldProcess: z.boolean(),
  accountId: z.number(),
  conversationId: z.number(),
  messageContent: z.string(),
  senderName: z.string(),
  threadId: z.string(),
  resourceId: z.string(),
  channel: z.string(),
});

const routedResultSchema = validationResultSchema.extend({
  route: routeMessageResultSchema,
  searchQuery: z.string(),
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

const CHATWOOT_CHANNEL_MAP: Record<string, string> = {
  "Channel::WebWidget": "web",
  "Channel::FacebookPage": "facebook",
  "Channel::TwitterProfile": "twitter",
  "Channel::Whatsapp": "whatsapp",
  "Channel::Api": "api",
  "Channel::Email": "email",
  "Channel::Sms": "sms",
  "Channel::TwilioSms": "sms",
  "Channel::Telegram": "telegram",
  "Channel::Line": "line",
  "Channel::Instagram": "instagram",
  "Channel::Tiktok": "tiktok",
};

function normalizeChannel(raw?: string): string {
  if (!raw) return "web";
  return CHATWOOT_CHANNEL_MAP[raw] ?? "web";
}

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

async function isHumanHandoffConfigured(): Promise<boolean> {
  const config = await getAppConfig();
  return config.enableHandoff && hasHumanHandoffTarget(config);
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
        chunk.content.length > MAX_EVIDENCE_CHARS
          ? `${chunk.content.slice(0, MAX_EVIDENCE_CHARS)}...`
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

async function buildSafeFallbackReply(
  inputData: z.infer<typeof judgedResultSchema> & {
    handoffRequested?: boolean;
  },
): Promise<string> {
  if (inputData.handoffRequested) {
    return (await isHumanHandoffConfigured())
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
  if (!vectorStore) {
    process.stderr.write("[chatwoot-webhook] Qdrant vector store not registered — returning empty evidence\n");
    return [];
  }
  const config = await getAppConfig();
  const embedModel = new ModelRouterEmbeddingModel(config.embedModel);
  const { embeddings } = await embedModel.doEmbed({ values: [queryText] });
  const [queryVector] = embeddings;
  const results = await vectorStore.query({
    indexName: env.QDRANT_COLLECTION,
    queryVector,
    topK: config.retrievalTopK,
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

    // Dedup by exact chunk identity
    const key = `${parsed.data.documentId}:${parsed.data.chunkIndex}`;
    if (deduped.has(key)) {
      continue;
    }

    // Dedup overlapping chunks from the same document (adjacent indices)
    let isOverlapping = false;
    for (const existing of deduped.values()) {
      if (
        existing.documentId === parsed.data.documentId &&
        Math.abs(existing.chunkIndex - parsed.data.chunkIndex) <= 1
      ) {
        isOverlapping = true;
        break;
      }
    }

    if (!isOverlapping) {
      deduped.set(key, parsed.data);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, config.retrievalFinalK);
}

const validateWebhook = createStep({
  id: "validate-webhook",
  description:
    "Validates the incoming Chatwoot webhook and extracts relevant data",
  inputSchema: chatwootWebhookSchema,
  outputSchema: validationResultSchema,
  execute: async ({ inputData, abort }) => {

    const channel = normalizeChannel(inputData.conversation?.channel);

    const skip = {
      shouldProcess: false,
      accountId: 0,
      conversationId: 0,
      messageContent: "",
      senderName: "",
      threadId: "",
      resourceId: "",
      channel,
    }

    if (
      inputData.event !== "message_created" ||
      inputData.message_type !== "incoming" ||
      inputData.private ||
      !inputData.content?.trim() ||
      !inputData.account ||
      !inputData.conversation
    ) {
      abort();
      return skip;
    }

    return {
      shouldProcess: true,
      accountId: inputData.account.id,
      conversationId: inputData.conversation.id,
      messageContent: inputData.content.trim(),
      senderName: inputData.sender?.name || "Ciudadano",
      threadId: `chatwoot-conv-${inputData.conversation.id}`,
      resourceId: `chatwoot-${inputData.conversation.id}`,
      channel,
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
      return {
        ...inputData,
        route: getDefaultRoute(),
        searchQuery: inputData.messageContent,
      };
    }

    const router = mastra?.getAgent("chatwootRouterAgent");
    if (!router) {
      throw new Error("Chatwoot router agent not found");
    }

    const memoryOptions = {
      thread: inputData.threadId,
      resource: inputData.resourceId,
      options: { lastMessages: 4, readOnly: true },
    };

    const response = await router.generate(
      [
        {
          role: "user",
          content: `Clasifique el siguiente mensaje ciudadano.\n\nMensaje: ${inputData.messageContent}`,
        },
      ],
      {
        maxSteps: 1,
        memory: memoryOptions,
        structuredOutput: {
          schema: routeMessageResultSchema,
        },
      },
    );

    const route = routeMessageResultSchema.parse(response.object);

    let searchQuery = inputData.messageContent;
    if (route.requiresRetrieval) {
      const rewriteResponse = await router.generate(
        [
          {
            role: "user",
            content: [
              "Reescribe la siguiente consulta ciudadana como una búsqueda autocontenida.",
              "Si la consulta hace referencia a mensajes anteriores de la conversación, resuelve las referencias para que la búsqueda sea comprensible sin contexto previo.",
              "Si la consulta ya es autocontenida, devuélvela tal cual.",
              "Devuelve solo el texto de búsqueda, sin explicaciones.",
              `\nConsulta: ${inputData.messageContent}`,
            ].join("\n"),
          },
        ],
        {
          maxSteps: 1,
          memory: memoryOptions,
          modelSettings: { temperature: 0, maxOutputTokens: 100 },
        },
      );
      searchQuery = rewriteResponse.text.trim() || inputData.messageContent;
    }

    return { ...inputData, route, searchQuery };
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
      queryText: inputData.searchQuery,
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
      const handoffConfigured = await isHumanHandoffConfigured();
      return {
        ...inputData,
        draftReply: handoffConfigured
          ? await buildHandoffConfirmationReply()
          : await buildUnavailableHandoffReply(inputData.messageContent),
        shouldSend: true,
        handoffRequested,
      };
    }

    if (inputData.route.intent === "smalltalk_or_greeting") {
      return {
        ...inputData,
        draftReply: await buildGreetingReply(),
        shouldSend: true,
        handoffRequested: false,
      };
    }

    if (inputData.route.intent === "out_of_scope") {
      return {
        ...inputData,
        draftReply: await buildOutOfScopeReply(),
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
        draftReply: await buildSensitiveReply(),
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
        draftReply: await buildClarificationReply(inputData.judgement.missingInfo),
        shouldSend: true,
        handoffRequested: false,
      };
    }

    if (!inputData.judgement.answerable || inputData.evidence.length === 0) {
      return {
        ...inputData,
        draftReply: await buildKnowledgeFallback(
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
            `Consulta del ciudadano: ${inputData.messageContent}`,
            `Canal: ${inputData.channel}`,
            `<evidencia>\n${formatEvidenceForPrompt(inputData.evidence)}\n</evidencia>`,
            `Confianza en la evidencia: ${inputData.judgement.confidence}`,
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
          temperature: 0.1,
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

    const fallbackReply = await buildSafeFallbackReply(inputData);
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
      const config = await getAppConfig();
      const handoffConfigured =
        config.enableHandoff && hasHumanHandoffTarget(config);

      if (handoffConfigured) {
        try {
          await assignChatwootConversation({
            accountId: inputData.accountId,
            conversationId: inputData.conversationId,
            assigneeId: config.handoffAssigneeId ?? undefined,
            teamId: config.handoffTeamId ?? undefined,
          });

          handoffPerformed = true;

          await sendChatwootMessage({
            accountId: inputData.accountId,
            conversationId: inputData.conversationId,
            content: await buildHandoffPrivateNote(
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

          outboundReply = await buildUnavailableHandoffReply(inputData.messageContent);
        }
      } else {
        outboundReply = await buildUnavailableHandoffReply(inputData.messageContent);
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
