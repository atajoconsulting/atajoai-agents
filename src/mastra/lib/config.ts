import type { AppConfig } from "../../generated/prisma/client";
import { prisma } from "./db/prisma";
import { redis } from "./db/redis";
import { DEFAULT_CONFIG } from "./default-config";
import { decryptToken, encryptToken } from "./crypto";
import { env } from "../env";
import { getGlobalConfig, type ResolvedGlobalConfig } from "./global-config";

const REDIS_CONFIG_PREFIX = "app:config";
const REDIS_TOKEN_PREFIX = "app:token";

export interface ResolvedAppConfig {
  id: string;
  orgName: string;
  orgPhone: string;
  orgSchedule: string;
  orgAddress: string;
  orgWebsite: string;
  orgEOffice: string;
  preferredLang: string;
  responseStyle: "brief_structured" | "brief_plain";
  llmModel: string;
  llmModelSmall: string;
  embedModel: string;
  retrievalTopK: number;
  retrievalFinalK: number;
  retrievalMinScore: number;
  customInstructions: string | null;
  greetingMessage: string;
  outOfScopeMessage: string;
  /** Whether the agent should attempt to handoff to a human. */
  enableHandoff: boolean;
  handoffTeamId: number | null;
  handoffAssigneeId: number | null;
  updatedAt: Date;
}

const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function assertTenantId(tenantId: string): void {
  if (typeof tenantId !== "string" || !TENANT_ID_PATTERN.test(tenantId)) {
    throw new Error(`Invalid tenantId: ${JSON.stringify(tenantId)}`);
  }
}

function redisConfigKey(tenantId: string): string {
  return `${REDIS_CONFIG_PREFIX}:${tenantId}`;
}

function redisTokenKey(tenantId: string): string {
  return `${REDIS_TOKEN_PREFIX}:${tenantId}`;
}

/** Inflight fetches per tenant — collapse concurrent DB hits into one query. */
const inflightConfig: Map<string, Promise<ResolvedAppConfig>> = new Map();

function parseOptionalInteger(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveConfig(
  record: AppConfig | null,
  tenantId: string,
  global: ResolvedGlobalConfig,
): ResolvedAppConfig {
  return {
    id: record?.id ?? tenantId,
    // --- per-tenant (org, behavior, handoff) ---
    orgName: trimOrNull(record?.orgName) ?? DEFAULT_CONFIG.orgName,
    orgPhone: trimOrNull(record?.orgPhone) ?? DEFAULT_CONFIG.orgPhone,
    orgSchedule: trimOrNull(record?.orgSchedule) ?? DEFAULT_CONFIG.orgSchedule,
    orgAddress: trimOrNull(record?.orgAddress) ?? DEFAULT_CONFIG.orgAddress,
    orgWebsite: trimOrNull(record?.orgWebsite) ?? DEFAULT_CONFIG.orgWebsite,
    orgEOffice: trimOrNull(record?.orgEOffice) ?? DEFAULT_CONFIG.orgEOffice,
    preferredLang: trimOrNull(record?.preferredLang) ?? DEFAULT_CONFIG.preferredLang,
    responseStyle:
      record?.responseStyle === "brief_plain" ||
      record?.responseStyle === "brief_structured"
        ? record.responseStyle
        : DEFAULT_CONFIG.responseStyle,
    customInstructions: trimOrNull(record?.customInstructions),
    greetingMessage: trimOrNull(record?.greetingMessage) ?? DEFAULT_CONFIG.greetingMessage,
    outOfScopeMessage: trimOrNull(record?.outOfScopeMessage) ?? DEFAULT_CONFIG.outOfScopeMessage,
    enableHandoff: record?.enableHandoff ?? DEFAULT_CONFIG.enableHandoff,
    handoffTeamId: parseOptionalInteger(record?.handoffTeamId) ?? DEFAULT_CONFIG.handoffTeamId,
    handoffAssigneeId: parseOptionalInteger(record?.handoffAssigneeId) ?? DEFAULT_CONFIG.handoffAssigneeId,
    // --- global (models, retrieval) with per-tenant overrides ---
    llmModel: trimOrNull(record?.llmModel) ?? global.llmModel,
    llmModelSmall: trimOrNull(record?.llmModelSmall) ?? global.llmModelSmall,
    embedModel: trimOrNull(record?.embedModel) ?? global.embedModel,
    retrievalTopK: global.retrievalTopK,
    retrievalFinalK: global.retrievalFinalK,
    retrievalMinScore: DEFAULT_CONFIG.retrievalMinScore,
    updatedAt: record?.updatedAt ?? new Date(0),
  };
}

export function maskSecret(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

function deserializeConfig(raw: string): ResolvedAppConfig {
  const parsed = JSON.parse(raw);
  parsed.updatedAt = new Date(parsed.updatedAt);
  return parsed as ResolvedAppConfig;
}

async function fetchAndCache(tenantId: string): Promise<ResolvedAppConfig> {
  const [record, global] = await Promise.all([
    prisma.appConfig.findUnique({ where: { id: tenantId } }).catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[config] Failed to read AppConfig from DB (tenant=${tenantId}): ${msg}\n`);
      return null;
    }),
    getGlobalConfig(),
  ]);

  const config = resolveConfig(record, tenantId, global);

  try {
    await redis.set(redisConfigKey(tenantId), JSON.stringify(config));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[config] Redis SET failed, config uncached (tenant=${tenantId}): ${msg}\n`);
  }

  return config;
}

export async function getAppConfig(
  tenantId: string,
  options?: { forceRefresh?: boolean },
): Promise<ResolvedAppConfig> {
  assertTenantId(tenantId);

  if (!options?.forceRefresh) {
    try {
      const cached = await redis.get(redisConfigKey(tenantId));
      if (cached) {
        return deserializeConfig(cached);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[config] Redis GET failed, falling back to DB (tenant=${tenantId}): ${msg}\n`);
    }
  }

  const inflight = inflightConfig.get(tenantId);
  if (inflight) {
    return inflight;
  }

  const promise = fetchAndCache(tenantId).finally(() => {
    inflightConfig.delete(tenantId);
  });
  inflightConfig.set(tenantId, promise);
  return promise;
}

export async function invalidateAppConfigCache(tenantId: string): Promise<void> {
  assertTenantId(tenantId);
  inflightConfig.delete(tenantId);
  try {
    await redis.del(redisConfigKey(tenantId));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[config] Redis DEL failed, cache will expire via TTL (tenant=${tenantId}): ${msg}\n`);
  }
}

export function serializeAppConfig(config: ResolvedAppConfig) {
  return {
    id: config.id,
    orgName: config.orgName,
    orgPhone: config.orgPhone,
    orgSchedule: config.orgSchedule,
    orgAddress: config.orgAddress,
    orgWebsite: config.orgWebsite,
    orgEOffice: config.orgEOffice,
    preferredLang: config.preferredLang,
    responseStyle: config.responseStyle,
    customInstructions: config.customInstructions,
    greetingMessage: config.greetingMessage,
    outOfScopeMessage: config.outOfScopeMessage,
    enableHandoff: config.enableHandoff,
    handoffTeamId: config.handoffTeamId,
    handoffAssigneeId: config.handoffAssigneeId,
    llmModel: config.llmModel,
    llmModelSmall: config.llmModelSmall,
    embedModel: config.embedModel,
    updatedAt: config.updatedAt,
  };
}

export function hasHumanHandoffTarget(config: ResolvedAppConfig): boolean {
  return Boolean(config.handoffAssigneeId || config.handoffTeamId);
}

export async function getChatwootApiToken(tenantId: string): Promise<string | null> {
  assertTenantId(tenantId);

  try {
    const cached = await redis.get(redisTokenKey(tenantId));
    if (cached) {
      return decryptToken(cached);
    }
  } catch {}

  let token: string | null = null;
  try {
    const record = await prisma.appConfig.findUnique({
      where: { id: tenantId },
      select: { chatwootApiToken: true },
    });
    if (record?.chatwootApiToken) {
      token = decryptToken(record.chatwootApiToken);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[config] Failed to read chatwootApiToken from DB (tenant=${tenantId}): ${msg}\n`);
  }

  if (token) {
    try {
      await redis.set(redisTokenKey(tenantId), encryptToken(token));
    } catch {}
  }

  return token;
}

export async function invalidateChatwootApiTokenCache(tenantId: string): Promise<void> {
  assertTenantId(tenantId);
  try {
    await redis.del(redisTokenKey(tenantId));
  } catch {}
}
