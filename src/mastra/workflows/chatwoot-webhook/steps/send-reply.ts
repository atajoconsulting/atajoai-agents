import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  assignChatwootConversation,
  sendChatwootMessage,
} from "../../../lib/chatwoot-api";
import {
  hasHumanHandoffTarget,
  type ResolvedAppConfig,
} from "../../../lib/config";
import {
  buildHandoffConfirmationReply,
  buildHandoffPrivateNote,
  buildUnavailableHandoffReply,
} from "../../../lib/outbound";
import { performChatwootHandoff } from "../../../lib/handoff";
import { logStepMetrics } from "../../../lib/metrics";
import { sanitizedResultSchema } from "../schemas";

export const sendReplyOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.number().optional(),
  handoffPerformed: z.boolean(),
});

export const sendReply = createStep({
  id: "send-outbound-reply",
  description: "Sends the outbound message back to Chatwoot",
  inputSchema: sanitizedResultSchema,
  outputSchema: sendReplyOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const t0 = Date.now();
    const logger = mastra?.getLogger();
    const config: ResolvedAppConfig = inputData.config;

    if (!inputData.shouldSend) {
      return { success: true, handoffPerformed: false };
    }

    let outboundReply = inputData.outboundReply;
    let handoffPerformed = false;

    if (inputData.handoffRequested) {
      const handoffConfigured =
        config.enableHandoff && hasHumanHandoffTarget(config);

      const handoffResult = await performChatwootHandoff(
        {
          accountId: inputData.accountId,
          config,
          conversationId: inputData.conversationId,
          handoffConfigured,
          messageContent: inputData.messageContent,
          senderName: inputData.senderName,
        },
        {
          assignConversation: assignChatwootConversation,
          buildConfirmationReply: buildHandoffConfirmationReply,
          buildPrivateNote: buildHandoffPrivateNote,
          buildUnavailableReply: buildUnavailableHandoffReply,
          logger,
          sendPrivateNote: sendChatwootMessage,
        },
      );

      handoffPerformed = handoffResult.handoffPerformed;
      outboundReply = handoffResult.outboundReply;
    }

    const data = await sendChatwootMessage({
      accountId: inputData.accountId,
      conversationId: inputData.conversationId,
      content: outboundReply,
    });

    if (logger) {
      logStepMetrics(logger, "send-outbound-reply", {
        durationMs: Date.now() - t0,
        extra: { handoffPerformed },
      });
    }

    return { success: true, messageId: data.id, handoffPerformed };
  },
});
