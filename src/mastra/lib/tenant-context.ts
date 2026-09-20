import type { RequestContext } from "@mastra/core/request-context";
import { getAppConfig, type ResolvedAppConfig } from "./config";

/**
 * Resolves the tenant id from a request context. Throws if it is missing —
 * the webhook workflow always sets it (validate-webhook aborts the run if
 * not), so a missing value here is a programming error rather than a
 * recoverable condition.
 */
export function getTenantIdFromContext(
  requestContext: RequestContext,
): string {
  const tenantId = requestContext.get("tenantId");
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new Error(
      "tenantId is missing from requestContext. The webhook route must set it before invoking an agent.",
    );
  }
  return tenantId;
}

export async function getConfigFromContext(
  requestContext: RequestContext,
): Promise<ResolvedAppConfig> {
  return getAppConfig(getTenantIdFromContext(requestContext));
}
