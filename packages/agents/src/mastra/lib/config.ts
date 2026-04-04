import { getAppConfig } from "@atajoai/shared";
import type { AppConfig } from "@atajoai/shared";
import { redis } from "./redis";

const CACHE_KEY = "app:config";

let memoryCache: AppConfig | null = null;

export async function getConfig(): Promise<AppConfig> {
  if (memoryCache) return memoryCache;

  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    memoryCache = JSON.parse(cached);
    return memoryCache!;
  }

  const config = await getAppConfig();
  await redis.set(CACHE_KEY, JSON.stringify(config));
  memoryCache = config;
  return config;
}

export function getConfigSync(): AppConfig | null {
  return memoryCache;
}

export async function invalidateConfig(): Promise<void> {
  await redis.del(CACHE_KEY);
  memoryCache = null;
}

// Warm the cache at startup
getConfig().catch((err) => {
  process.stderr.write(
    `[config] Failed to warm cache: ${err instanceof Error ? err.message : String(err)}\n`,
  );
});
