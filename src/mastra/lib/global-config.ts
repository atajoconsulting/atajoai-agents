import type { GlobalConfig } from "../../generated/prisma/client";
import { prisma } from "./db/prisma";
import { redis } from "./db/redis";
import { DEFAULT_CONFIG } from "./default-config";

const REDIS_KEY = "global:config";

export interface ResolvedGlobalConfig {
  llmModel: string;
  llmModelSmall: string;
  embedModel: string;
  retrievalTopK: number;
  retrievalFinalK: number;
  updatedAt: Date;
}

let inflightConfig: Promise<ResolvedGlobalConfig> | null = null;

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveConfig(record: GlobalConfig | null): ResolvedGlobalConfig {
  return {
    llmModel: trimOrNull(record?.llmModel) ?? DEFAULT_CONFIG.llmModel,
    llmModelSmall: trimOrNull(record?.llmModelSmall) ?? DEFAULT_CONFIG.llmModelSmall,
    embedModel: trimOrNull(record?.embedModel) ?? DEFAULT_CONFIG.embedModel,
    retrievalTopK: record?.retrievalTopK ?? DEFAULT_CONFIG.retrievalTopK,
    retrievalFinalK: record?.retrievalFinalK ?? DEFAULT_CONFIG.retrievalFinalK,
    updatedAt: record?.updatedAt ?? new Date(0),
  };
}

function deserializeConfig(raw: string): ResolvedGlobalConfig {
  const parsed = JSON.parse(raw);
  parsed.updatedAt = new Date(parsed.updatedAt);
  return parsed as ResolvedGlobalConfig;
}

async function fetchAndCache(): Promise<ResolvedGlobalConfig> {
  let record: GlobalConfig | null = null;
  try {
    record = await prisma.globalConfig.findUnique({ where: { id: "default" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[global-config] Failed to read from DB: ${msg}\n`);
  }

  const config = resolveConfig(record);

  try {
    await redis.set(REDIS_KEY, JSON.stringify(config));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[global-config] Redis SET failed: ${msg}\n`);
  }

  return config;
}

export async function getGlobalConfig(options?: {
  forceRefresh?: boolean;
}): Promise<ResolvedGlobalConfig> {
  if (!options?.forceRefresh) {
    try {
      const cached = await redis.get(REDIS_KEY);
      if (cached) return deserializeConfig(cached);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[global-config] Redis GET failed, falling back to DB: ${msg}\n`);
    }
  }

  if (inflightConfig) return inflightConfig;

  inflightConfig = fetchAndCache().finally(() => {
    inflightConfig = null;
  });
  return inflightConfig;
}

export async function updateGlobalConfig(
  data: Partial<Pick<ResolvedGlobalConfig, "llmModel" | "llmModelSmall" | "embedModel" | "retrievalTopK" | "retrievalFinalK">>,
): Promise<ResolvedGlobalConfig> {
  const createData: Record<string, unknown> = { id: "default" };
  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      createData[key] = value;
      updateData[key] = value;
    }
  }

  await prisma.globalConfig.upsert({
    where: { id: "default" },
    create: createData as any,
    update: updateData as any,
  });

  await invalidateGlobalConfigCache();
  return getGlobalConfig({ forceRefresh: true });
}

export async function invalidateGlobalConfigCache(): Promise<void> {
  inflightConfig = null;
  try {
    await redis.del(REDIS_KEY);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[global-config] Redis DEL failed: ${msg}\n`);
  }
}

export function serializeGlobalConfig(config: ResolvedGlobalConfig) {
  return {
    llmModel: config.llmModel,
    llmModelSmall: config.llmModelSmall,
    embedModel: config.embedModel,
    retrievalTopK: config.retrievalTopK,
    retrievalFinalK: config.retrievalFinalK,
    updatedAt: config.updatedAt,
  };
}
