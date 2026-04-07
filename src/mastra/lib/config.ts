import { env } from "../env";
import type { AppConfig } from "../../generated/prisma/client";
import { prisma } from "./db/prisma";
import { redis } from "./db/redis";

export const DEFAULT_APP_CONFIG_ID = "default";

const REDIS_KEY = "app:config:default";
const REDIS_TTL_SECONDS = 60;

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
  customInstructions: string | null;
  greetingMessage: string | null;
  outOfScopeMessage: string | null;
  chatwootBaseUrl: string | null;
  chatwootApiToken: string | null;
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
    orgName: trimOrNull(record?.orgName) ?? env.MUNICIPALITY_NAME,
    orgPhone: trimOrNull(record?.orgPhone) ?? env.MUNICIPALITY_PHONE,
    orgSchedule: trimOrNull(record?.orgSchedule) ?? env.MUNICIPALITY_SCHEDULE,
    orgAddress: trimOrNull(record?.orgAddress) ?? env.MUNICIPALITY_ADDRESS,
    orgWebsite: trimOrNull(record?.orgWebsite) ?? env.MUNICIPALITY_WEBSITE,
    orgEOffice:
      trimOrNull(record?.orgEOffice) ?? env.MUNICIPALITY_ELECTRONIC_OFFICE_URL,
    preferredLang:
      trimOrNull(record?.preferredLang) ?? env.MUNICIPALITY_PREFERRED_LANGUAGE,
    responseStyle:
      record?.responseStyle === "brief_plain" ||
      record?.responseStyle === "brief_structured"
        ? record.responseStyle
        : env.OUTBOUND_RESPONSE_STYLE,
    llmModel: trimOrNull(record?.llmModel) ?? env.LLM_MODEL,
    llmModelMedium: trimOrNull(record?.llmModelMedium) ?? env.LLM_MODEL_MEDIUM,
    llmModelSmall: trimOrNull(record?.llmModelSmall) ?? env.LLM_MODEL_SMALL,
    embedModel: trimOrNull(record?.embedModel) ?? env.EMBED_MODEL,
    retrievalTopK: record?.retrievalTopK ?? 12,
    retrievalFinalK: record?.retrievalFinalK ?? 4,
    customInstructions: trimOrNull(record?.customInstructions),
    greetingMessage: trimOrNull(record?.greetingMessage),
    outOfScopeMessage: trimOrNull(record?.outOfScopeMessage),
    chatwootBaseUrl: trimOrNull(record?.chatwootBaseUrl) ?? env.CHATWOOT_BASE_URL ?? null,
    chatwootApiToken:
      trimOrNull(record?.chatwootApiToken) ?? env.CHATWOOT_API_TOKEN ?? null,
    enableHandoff: record?.enableHandoff ?? env.CHATWOOT_ENABLE_HUMAN_HANDOFF,
    handoffTeamId:
      parseOptionalInteger(record?.handoffTeamId) ?? env.CHATWOOT_HANDOFF_TEAM_ID ?? null,
    handoffAssigneeId:
      parseOptionalInteger(record?.handoffAssigneeId) ??
      env.CHATWOOT_HANDOFF_ASSIGNEE_ID ??
      null,
    updatedAt: record?.updatedAt ?? new Date(0),
  };
}

function maskSecret(value: string | null): string | null {
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
    await redis.set(REDIS_KEY, JSON.stringify(config), "EX", REDIS_TTL_SECONDS);
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
    customInstructions: config.customInstructions,
    greetingMessage: config.greetingMessage,
    outOfScopeMessage: config.outOfScopeMessage,
    chatwootBaseUrl: config.chatwootBaseUrl,
    chatwootApiTokenMasked: maskSecret(config.chatwootApiToken),
    hasChatwootApiToken: Boolean(config.chatwootApiToken),
    enableHandoff: config.enableHandoff,
    handoffTeamId: config.handoffTeamId,
    handoffAssigneeId: config.handoffAssigneeId,
    updatedAt: config.updatedAt,
  };
}

export function hasHumanHandoffTarget(config: ResolvedAppConfig): boolean {
  return Boolean(config.handoffAssigneeId || config.handoffTeamId);
}
