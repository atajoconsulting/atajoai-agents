import { env } from "../env";
import { prisma } from "./db/prisma";
import { redis } from "./db/redis";

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };
export type HealthStatus = "ok" | "error" | "skipped";

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
  message?: string;
}

/** Verify Qdrant is reachable via its healthz endpoint. */
async function checkQdrant(logger: Logger): Promise<void> {
  const url = `${env.QDRANT_URL}/healthz`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) {
    throw new Error(`Qdrant /healthz returned HTTP ${res.status}`);
  }
  logger.info(`[health] Qdrant OK (${url})`);
}

/** Verify PostgreSQL is reachable through Prisma. */
async function checkPostgres(logger: Logger): Promise<void> {
  await prisma.$queryRawUnsafe("SELECT 1");
  logger.info("[health] PostgreSQL OK");
}

/** Verify Mistral API key is valid by listing models (lightweight call). */
async function checkMistral(logger: Logger): Promise<void> {
  if (!env.MISTRAL_API_KEY) {
    logger.warn(`[health] MISTRAL_API_KEY not set — skipping Mistral check`);
    return;
  }
  const res = await fetch("https://api.mistral.ai/v1/models", {
    headers: { Authorization: `Bearer ${env.MISTRAL_API_KEY}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`Mistral /v1/models returned HTTP ${res.status}`);
  }
  logger.info(`[health] Mistral API OK`);
}

async function measureHealthCheck(
  name: string,
  fn: (logger: Logger) => Promise<void>,
  logger: Logger,
): Promise<ServiceHealth> {
  const startedAt = Date.now();

  try {
    await fn(logger);
    return {
      name,
      status: "ok",
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      name,
      status: "error",
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Verify Redis is reachable via PING. */
async function checkRedis(logger: Logger): Promise<void> {
  const result = await redis.ping();
  if (result !== "PONG") {
    throw new Error(`Redis PING returned unexpected response: ${result}`);
  }
  logger.info("[health] Redis OK");
}

export async function getSystemHealth(logger: Logger): Promise<ServiceHealth[]> {
  return Promise.all([
    measureHealthCheck("Qdrant", checkQdrant, logger),
    measureHealthCheck("PostgreSQL", checkPostgres, logger),
    measureHealthCheck("Redis", checkRedis, logger),
    measureHealthCheck("Mistral", checkMistral, logger),
  ]);
}

/**
 * Runs all startup checks concurrently.
 * Each failure is logged independently so a single bad dependency doesn't
 * mask others.
 */
export async function runStartupChecks(logger: Logger): Promise<void> {
  const checks = await getSystemHealth(logger);

  for (const check of checks) {
    if (check.status === "ok") {
      continue;
    }

    process.stderr.write(
      `[health] WARN: ${check.name} check failed: ${check.message ?? "unknown error"}\n`,
    );
  }
}
