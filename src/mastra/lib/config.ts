import type { AppConfig } from "../../generated/prisma/client";
import { prisma } from "./db/prisma";
import { redis } from "./db/redis";
import { DEFAULT_CONFIG } from "./default-config";
import { decryptToken, encryptToken } from "./crypto";
import { env } from "../env";

export const DEFAULT_APP_CONFIG_ID = "default";

const REDIS_KEY = "app:config:default";
const REDIS_TOKEN_KEY = "app:token:chatwoot";

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
  llmModelMedium: string;
  llmModelSmall: string;
  embedModel: string;
  retrievalTopK: number;
  retrievalFinalK: number;
  retrievalMinScore: number;
  customInstructions: string | null;
  greetingMessage: string;
  outOfScopeMessage: string;
  chatwootBaseUrl: string | null;
  enableHandoff: boolean;
  handoffTeamId: number | null;
  handoffAssigneeId: number | null;
  updatedAt: Date;
}

let inflightConfig: Promise<ResolvedAppConfig> | null = null;

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

function resolveConfig(record: AppConfig | null): ResolvedAppConfig {
  return {
    id: record?.id ?? DEFAULT_APP_CONFIG_ID,
    orgName: trimOrNull(record?.orgName) ?? DEFAULT_CONFIG.orgName,
    orgPhone: trimOrNull(record?.orgPhone) ?? DEFAULT_CONFIG.orgPhone,
    orgSchedule: trimOrNull(record?.orgSchedule) ?? DEFAULT_CONFIG.orgSchedule,
    orgAddress: trimOrNull(record?.orgAddress) ?? DEFAULT_CONFIG.orgAddress,
    orgWebsite: trimOrNull(record?.orgWebsite) ?? DEFAULT_CONFIG.orgWebsite,
    orgEOffice:
      trimOrNull(record?.orgEOffice) ?? DEFAULT_CONFIG.orgEOffice,
    preferredLang:
      trimOrNull(record?.preferredLang) ?? DEFAULT_CONFIG.preferredLang,
    responseStyle:
      record?.responseStyle === "brief_plain" ||
      record?.responseStyle === "brief_structured"
        ? record.responseStyle
        : DEFAULT_CONFIG.responseStyle,
    llmModel: trimOrNull(record?.llmModel) ?? DEFAULT_CONFIG.llmModel,
    llmModelMedium: trimOrNull(record?.llmModelMedium) ?? DEFAULT_CONFIG.llmModelMedium,
    llmModelSmall: trimOrNull(record?.llmModelSmall) ?? DEFAULT_CONFIG.llmModelSmall,
    embedModel: trimOrNull(record?.embedModel) ?? DEFAULT_CONFIG.embedModel,
    retrievalTopK: record?.retrievalTopK ?? DEFAULT_CONFIG.retrievalTopK,
    retrievalFinalK: record?.retrievalFinalK ?? DEFAULT_CONFIG.retrievalFinalK,
    retrievalMinScore: DEFAULT_CONFIG.retrievalMinScore,
    customInstructions: trimOrNull(record?.customInstructions),
    greetingMessage: trimOrNull(record?.greetingMessage) ?? DEFAULT_CONFIG.greetingMessage,
    outOfScopeMessage: trimOrNull(record?.outOfScopeMessage) ?? DEFAULT_CONFIG.outOfScopeMessage,
    chatwootBaseUrl: trimOrNull(record?.chatwootBaseUrl) ?? DEFAULT_CONFIG.chatwootBaseUrl,
    enableHandoff: record?.enableHandoff ?? DEFAULT_CONFIG.enableHandoff,
    handoffTeamId: parseOptionalInteger(record?.handoffTeamId) ?? DEFAULT_CONFIG.handoffTeamId,
    handoffAssigneeId: parseOptionalInteger(record?.handoffAssigneeId) ?? DEFAULT_CONFIG.handoffAssigneeId,
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

async function fetchAndCache(): Promise<ResolvedAppConfig> {
  let record: AppConfig | null = null;

  try {
    record = await prisma.appConfig.findUnique({
      where: { id: DEFAULT_APP_CONFIG_ID },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[config] Failed to read AppConfig from DB: ${message}\n`);
  }

  const config = resolveConfig(record);

  try {
    await redis.set(REDIS_KEY, JSON.stringify(config));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[config] Redis SET failed, config uncached: ${msg}\n`);
  }

  return config;
}

export async function getAppConfig(options?: {
  forceRefresh?: boolean;
}): Promise<ResolvedAppConfig> {
  if (!options?.forceRefresh) {
    try {
      const cached = await redis.get(REDIS_KEY);
      if (cached) {
        return deserializeConfig(cached);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[config] Redis GET failed, falling back to DB: ${msg}\n`);
    }
  }

  if (inflightConfig) {
    return inflightConfig;
  }

  inflightConfig = fetchAndCache().finally(() => {
    inflightConfig = null;
  });

  return inflightConfig;
}

export async function invalidateAppConfigCache(): Promise<void> {
  inflightConfig = null;
  try {
    await redis.del(REDIS_KEY);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[config] Redis DEL failed, cache will expire via TTL: ${msg}\n`);
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
    llmModel: config.llmModel,
    llmModelMedium: config.llmModelMedium,
    llmModelSmall: config.llmModelSmall,
    embedModel: config.embedModel,
    retrievalTopK: config.retrievalTopK,
    retrievalFinalK: config.retrievalFinalK,
    retrievalMinScore: config.retrievalMinScore,
    customInstructions: config.customInstructions,
    greetingMessage: config.greetingMessage,
    outOfScopeMessage: config.outOfScopeMessage,
    chatwootBaseUrl: config.chatwootBaseUrl,
    enableHandoff: config.enableHandoff,
    handoffTeamId: config.handoffTeamId,
    handoffAssigneeId: config.handoffAssigneeId,
    updatedAt: config.updatedAt,
  };
}

export function hasHumanHandoffTarget(config: ResolvedAppConfig): boolean {
  return Boolean(config.handoffAssigneeId || config.handoffTeamId);
}

export async function getChatwootApiToken(): Promise<string | null> {
  try {
    const cached = await redis.get(REDIS_TOKEN_KEY);
    if (cached) {
      return decryptToken(cached);
    }
  } catch {}

  let token: string | null = null;
  try {
    const record = await prisma.appConfig.findUnique({
      where: { id: DEFAULT_APP_CONFIG_ID },
      select: { chatwootApiToken: true },
    });
    if (record?.chatwootApiToken) {
      token = decryptToken(record.chatwootApiToken);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[config] Failed to read chatwootApiToken from DB: ${msg}\n`);
  }

  token ??= env.CHATWOOT_API_TOKEN ?? null;

  if (token) {
    try {
      await redis.set(REDIS_TOKEN_KEY, encryptToken(token));
    } catch {}
  }

  return token;
}

export async function invalidateChatwootApiTokenCache(): Promise<void> {
  try {
    await redis.del(REDIS_TOKEN_KEY);
  } catch {}
}
