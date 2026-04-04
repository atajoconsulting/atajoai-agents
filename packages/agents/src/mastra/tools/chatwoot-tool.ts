/**
 * @deprecated Dead code — this tool is not registered in any agent.
 * Message sending is handled directly via `lib/chatwoot-api.ts` in the workflow.
 * Safe to delete this file.
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sendChatwootMessage } from "../lib/chatwoot-api";
import { getConfig } from "../lib/config";

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
    const config = await getConfig();
    return sendChatwootMessage(
      { baseUrl: config.chatwootBaseUrl ?? "", apiToken: config.chatwootApiToken ?? "" },
      {
        accountId,
        conversationId,
        content,
        messageType,
        private: isPrivate,
      },
    );
  },
});
