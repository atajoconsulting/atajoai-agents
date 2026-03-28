import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { sendChatwootMessage } from "../lib/chatwoot-api";

// Schema for the Chatwoot webhook payload (message_created event)
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

const validateWebhook = createStep({
  id: "validate-webhook",
  description:
    "Validates the incoming Chatwoot webhook and extracts relevant data",
  inputSchema: chatwootWebhookSchema,
  outputSchema: z.object({
    shouldProcess: z.boolean(),
    accountId: z.number(),
    conversationId: z.number(),
    messageContent: z.string(),
    senderName: z.string(),
    threadId: z.string(),
  }),
  execute: async ({ inputData }) => {
    const skip = {
      shouldProcess: false,
      accountId: inputData.account.id,
      conversationId: inputData.conversation.id,
      messageContent: "",
      senderName: "",
      threadId: "",
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
      senderName: inputData.sender?.name || "Customer",
      threadId: `chatwoot-conv-${inputData.conversation.id}`,
    };
  },
});

const generateResponse = createStep({
  id: "generate-response",
  description: "Generates an AI response using the chatwoot agent",
  inputSchema: z.object({
    shouldProcess: z.boolean(),
    accountId: z.number(),
    conversationId: z.number(),
    messageContent: z.string(),
    senderName: z.string(),
    threadId: z.string(),
  }),
  outputSchema: z.object({
    accountId: z.number(),
    conversationId: z.number(),
    responseContent: z.string(),
    processed: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData.shouldProcess) {
      return {
        accountId: inputData.accountId,
        conversationId: inputData.conversationId,
        responseContent: "",
        processed: false,
      };
    }

    const agent = mastra?.getAgent("chatwootAgent");
    if (!agent) {
      throw new Error("Chatwoot agent not found");
    }

    const response = await agent.generate(
      [
        {
          role: "user",
          content: inputData.messageContent,
        },
      ],
      {
        memory: {
          thread: inputData.threadId,
          resource: `chatwoot-${inputData.conversationId}`,
        },
      },
    );

    return {
      accountId: inputData.accountId,
      conversationId: inputData.conversationId,
      responseContent: response.text,
      processed: response.text != "",
    };
  },
});

const sendReply = createStep({
  id: "send-reply",
  description: "Sends the AI response back to Chatwoot",
  inputSchema: z.object({
    accountId: z.number(),
    conversationId: z.number(),
    responseContent: z.string(),
    processed: z.boolean(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData.processed) {
      return { success: true };
    }

    const data = await sendChatwootMessage({
      accountId: inputData.accountId,
      conversationId: inputData.conversationId,
      content: inputData.responseContent,
    });

    return { success: true, messageId: data.id };
  },
});

const chatwootWebhookWorkflow = createWorkflow({
  id: "chatwoot-webhook",
  inputSchema: chatwootWebhookSchema,
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
  }),
})
  .then(validateWebhook)
  .then(generateResponse)
  .then(sendReply);

chatwootWebhookWorkflow.commit();

export { chatwootWebhookWorkflow };
