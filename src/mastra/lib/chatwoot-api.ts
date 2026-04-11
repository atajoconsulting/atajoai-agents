import { getAppConfig, getChatwootApiToken } from "./config";
import { withRetry, RetryableError } from "./retry";

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
  const [config, apiToken] = await Promise.all([getAppConfig(), getChatwootApiToken()]);
  if (!config.chatwootBaseUrl || !apiToken) {
    throw new Error(
      "Chatwoot API is not configured. Set chatwootBaseUrl and chatwootApiToken in app config.",
    );
  }

  const baseUrl = config.chatwootBaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}${path}`;

  return withRetry(
    async () => {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10_000),
        headers: {
          "Content-Type": "application/json",
          api_access_token: apiToken,
          ...(options.headers ?? {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        if (retryable) {
          throw new RetryableError(
            `Chatwoot API error (${response.status}): ${errorText}`,
            response.status,
          );
        }
        throw new Error(`Chatwoot API error (${response.status}): ${errorText}`);
      }

      return (await response.json()) as T;
    },
    { maxRetries: 3, baseDelayMs: 500 },
  );
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

export interface UnassignConversationParams {
  accountId: number;
  conversationId: number;
}

export async function unassignChatwootConversation(
  params: UnassignConversationParams,
): Promise<void> {
  await chatwootRequest<unknown>(
    `/api/v1/accounts/${params.accountId}/conversations/${params.conversationId}/assignments`,
    {
      method: "POST",
      body: JSON.stringify({ assignee_id: 0 }),
    },
  );
}
