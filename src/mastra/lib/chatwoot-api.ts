import { getAppConfig } from "./config";

export interface SendMessageParams {
  accountId: number;
  conversationId: number;
  content: string;
  messageType?: "outgoing" | "template";
  private?: boolean;
}

export interface SendMessageResult {
  id: number;
  content: string;
  message_type: string;
  created_at: number;
  conversation_id: number;
}

export interface AssignConversationParams {
  accountId: number;
  conversationId: number;
  assigneeId?: number;
  teamId?: number;
}

export interface AssignConversationResult {
  id: number;
  name?: string;
  email?: string;
  role?: string;
}

async function chatwootRequest<T>(
  path: string,
  options: RequestInit,
): Promise<T> {
  const config = await getAppConfig();
  if (!config.chatwootBaseUrl || !config.chatwootApiToken) {
    throw new Error(
      "Chatwoot API is not configured. Set chatwootBaseUrl and chatwootApiToken in app config or env",
    );
  }

  const baseUrl = config.chatwootBaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      api_access_token: config.chatwootApiToken,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chatwoot API error (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function sendChatwootMessage(
  params: SendMessageParams,
): Promise<SendMessageResult> {
  return chatwootRequest<SendMessageResult>(
    `/api/v1/accounts/${params.accountId}/conversations/${params.conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        content: params.content,
        message_type: params.messageType ?? "outgoing",
        private: params.private ?? false,
      }),
    },
  );
}

export async function assignChatwootConversation(
  params: AssignConversationParams,
): Promise<AssignConversationResult> {
  if (!params.assigneeId && !params.teamId) {
    throw new Error(
      "Chatwoot handoff requires assigneeId or teamId configuration",
    );
  }

  return chatwootRequest<AssignConversationResult>(
    `/api/v1/accounts/${params.accountId}/conversations/${params.conversationId}/assignments`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(params.assigneeId ? { assignee_id: params.assigneeId } : {}),
        ...(params.teamId ? { team_id: params.teamId } : {}),
      }),
    },
  );
}
