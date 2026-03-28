import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sendChatwootMessage } from "../lib/chatwoot-api";

export const chatwootSendMessageTool = createTool({
  id: "chatwoot-send-message",
  description: "Send a message to a Chatwoot conversation",
  inputSchema: z.object({
    accountId: z.number().describe("Chatwoot account ID"),
    conversationId: z.number().describe("Chatwoot conversation ID"),
    content: z.string().describe("Message content to send"),
    messageType: z
      .enum(["outgoing", "template"])
      .default("outgoing")
      .describe("Message type"),
    private: z
      .boolean()
      .default(false)
      .describe("Whether the message is private (internal note)"),
  }),
  outputSchema: z.object({
    id: z.number(),
    content: z.string(),
    message_type: z.string(),
    created_at: z.number(),
    conversation_id: z.number(),
  }),
  execute: async ({
    accountId,
    conversationId,
    content,
    messageType,
    private: isPrivate,
  }) => {
    return sendChatwootMessage({
      accountId,
      conversationId,
      content,
      messageType,
      private: isPrivate,
    });
  },
});
