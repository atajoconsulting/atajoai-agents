import { createStep } from "@mastra/core/workflows";
import { type ResolvedAppConfig, getAppConfig } from "../../../lib/config";
import { isMessageProcessed } from "../../../lib/dedup";
import { isRateLimited } from "../../../lib/rate-limit";
import { logStepMetrics } from "../../../lib/metrics";
import { env } from "../../../env";
import { chatwootWebhookSchema, validationResultSchema } from "../schemas";
import { normalizeChannel, MAX_INPUT_LENGTH } from "../helpers";

export const validateWebhook = createStep({
  id: "validate-webhook",
  description:
    "Validates the incoming Chatwoot webhook, deduplicates, rate-limits, and extracts relevant data",
  inputSchema: chatwootWebhookSchema,
  outputSchema: validationResultSchema,
  execute: async ({ inputData, mastra, abort, requestContext }) => {
    const t0 = Date.now();
    const logger = mastra?.getLogger();
    const channel = normalizeChannel(inputData.conversation?.channel);

    // The tenant travels in the URL, not in the Chatwoot payload, so the
    // route puts it on the run's request context. Fall back to the body for
    // callers that still inline it.
    const tenantId =
      (requestContext?.get("tenantId") as string | undefined) ??
      inputData.tenantId;

    const skip = {
      shouldProcess: false,
      tenantId: tenantId ?? "",
      accountId: 0,
      conversationId: 0,
      messageContent: "",
      senderName: "",
      threadId: "",
      resourceId: "",
      channel,
      config: {} as ResolvedAppConfig,
      inboxId: null,
      conversationStatus: null,
      currentAssigneeType: null,
    };

    if (!tenantId) {
      logger?.error("[validate] Webhook arrived without tenantId — skipping");
      abort();
      return skip;
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

    // Skip if conversation is already assigned to a human agent (post-handoff)
    const assigneeType = inputData.conversation?.meta?.assignee_type ?? null;
    if (assigneeType === "User") {
      logger?.debug("[validate] Conversation assigned to human — skipping");
      abort();
      return skip;
    }

    // Dedup by message ID
    if (inputData.id && (await isMessageProcessed(inputData.id))) {
      logger?.debug("[validate] Duplicate message — skipping");
      abort();
      return skip;
    }

    // Rate limiting per conversation
    if (
      await isRateLimited(
        inputData.conversation.id,
        env.RATE_LIMIT_PER_CONVERSATION,
        env.RATE_LIMIT_WINDOW_SECONDS,
      )
    ) {
      logger?.warn("[validate] Rate limited conversation — skipping");
      abort();
      return skip;
    }

    // Fetch the tenant's config once for the entire pipeline.
    // The webhook will be ignored if the tenant has never been provisioned
    // (e.g. the AgentBot was deleted but the webhook is still queued).
    const config = await getAppConfig(tenantId);
    if (!config) {
      logger?.error(`[validate] No AppConfig for tenant=${tenantId} — skipping`);
      abort();
      return skip;
    }

    // Per-tenant memory keys keep conversation history isolated between
    // tenants and between bots in the same account.
    const result = {
      shouldProcess: true,
      tenantId,
      accountId: inputData.account.id,
      conversationId: inputData.conversation.id,
      messageContent: inputData.content.trim().slice(0, MAX_INPUT_LENGTH),
      senderName: inputData.sender?.name || "Ciudadano",
      threadId: `${tenantId}-conv-${inputData.conversation.id}`,
      resourceId: `${tenantId}-${inputData.conversation.id}`,
      channel,
      config,
      inboxId: inputData.inbox?.id ?? inputData.conversation?.inbox_id ?? null,
      conversationStatus: inputData.conversation?.status ?? null,
      currentAssigneeType: assigneeType,
    };

    if (logger) {
      logStepMetrics(logger, "validate-webhook", {
        durationMs: Date.now() - t0,
        extra: { tenantId },
      });
    }

    return result;
  },
});
