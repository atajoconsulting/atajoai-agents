import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const chatwootSendMessageTool = createTool({
  id: 'chatwoot-send-message',
  description: 'Send a message to a Chatwoot conversation',
  inputSchema: z.object({
    accountId: z.number().describe('Chatwoot account ID'),
    conversationId: z.number().describe('Chatwoot conversation ID'),
    content: z.string().describe('Message content to send'),
    messageType: z.enum(['outgoing', 'template']).default('outgoing').describe('Message type'),
    private: z.boolean().default(false).describe('Whether the message is private (internal note)'),
  }),
  outputSchema: z.object({
    id: z.number(),
    content: z.string(),
    message_type: z.string(),
    created_at: z.number(),
    conversation_id: z.number(),
  }),
  execute: async ({ accountId, conversationId, content, messageType, private: isPrivate }) => {
    const baseUrl = process.env.CHATWOOT_BASE_URL;
    const apiToken = process.env.CHATWOOT_API_TOKEN;

    if (!baseUrl || !apiToken) {
      throw new Error('CHATWOOT_BASE_URL and CHATWOOT_API_TOKEN environment variables are required');
    }

    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': apiToken,
      },
      body: JSON.stringify({
        content,
        message_type: messageType,
        private: isPrivate,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chatwoot API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      id: number;
      content: string;
      message_type: string;
      created_at: number;
      conversation_id: number;
    };

    return {
      id: data.id,
      content: data.content,
      message_type: data.message_type,
      created_at: data.created_at,
      conversation_id: data.conversation_id,
    };
  },
});
