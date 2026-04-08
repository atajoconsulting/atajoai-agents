import type { ResolvedAppConfig } from "./config";

export interface AssignConversationInput {
  accountId: number;
  conversationId: number;
  assigneeId?: number;
  teamId?: number;
}

export interface SendPrivateNoteInput {
  accountId: number;
  conversationId: number;
  content: string;
  private: boolean;
}

export interface HandoffLogger {
  warn(message: string): void;
}

export interface PerformChatwootHandoffParams {
  accountId: number;
  config: ResolvedAppConfig;
  conversationId: number;
  handoffConfigured: boolean;
  messageContent: string;
  senderName: string;
}

export interface PerformChatwootHandoffDeps {
  assignConversation: (input: AssignConversationInput) => Promise<unknown>;
  buildConfirmationReply: () => string;
  buildPrivateNote: (senderName: string, messageContent: string) => string;
  buildUnavailableReply: (
    messageContent: string,
    config: ResolvedAppConfig,
  ) => string;
  logger?: HandoffLogger;
  sendPrivateNote: (input: SendPrivateNoteInput) => Promise<unknown>;
}

export async function performChatwootHandoff(
  {
    accountId,
    config,
    conversationId,
    handoffConfigured,
    messageContent,
    senderName,
  }: PerformChatwootHandoffParams,
  {
    assignConversation,
    buildConfirmationReply,
    buildPrivateNote,
    buildUnavailableReply,
    logger,
    sendPrivateNote,
  }: PerformChatwootHandoffDeps,
): Promise<{ handoffPerformed: boolean; outboundReply: string }> {
  if (!handoffConfigured) {
    return {
      handoffPerformed: false,
      outboundReply: buildUnavailableReply(messageContent, config),
    };
  }

  try {
    await assignConversation({
      accountId,
      conversationId,
      assigneeId: config.handoffAssigneeId ?? undefined,
      teamId: config.handoffTeamId ?? undefined,
    });
  } catch (error) {
    logger?.warn(
      `Failed to hand off conversation ${conversationId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return {
      handoffPerformed: false,
      outboundReply: buildUnavailableReply(messageContent, config),
    };
  }

  try {
    await sendPrivateNote({
      accountId,
      conversationId,
      content: buildPrivateNote(senderName, messageContent),
      private: true,
    });
  } catch (error) {
    logger?.warn(
      `Handoff note failed for conversation ${conversationId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return {
    handoffPerformed: true,
    outboundReply: buildConfirmationReply(),
  };
}
