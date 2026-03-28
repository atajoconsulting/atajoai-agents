import { env } from '../env';

export interface SendMessageParams {
  accountId: number;
  conversationId: number;
  content: string;
  messageType?: 'outgoing' | 'template';
  private?: boolean;
}

export interface SendMessageResult {
  id: number;
  content: string;
  message_type: string;
  created_at: number;
  conversation_id: number;
}

export async function sendChatwootMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const url = `${env.CHATWOOT_BASE_URL}/api/v1/accounts/${params.accountId}/conversations/${params.conversationId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': env.CHATWOOT_API_TOKEN,
    },
    body: JSON.stringify({
      content: params.content,
      message_type: params.messageType ?? 'outgoing',
      private: params.private ?? false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chatwoot API error (${response.status}): ${errorText}`);
  }

  return await response.json() as Promise<SendMessageResult>;
}
