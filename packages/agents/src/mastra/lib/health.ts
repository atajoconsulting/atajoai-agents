/**
 * Startup health checks.
 *
 * Called once after the Mastra instance is created to verify that all external
 * dependencies are reachable before the server starts accepting production traffic.
 * Failures are logged but never throw — the server still starts so that the
 * /health endpoint (or Mastra's built-in diagnostics) can surface the issue.
 */
import { env } from "@atajoai/shared";
import { redis } from "./redis";

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

async function checkQdrant(logger: Logger): Promise<void> {
  const url = `${env.QDRANT_URL}/healthz`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) {
    throw new Error(`Qdrant /healthz returned HTTP ${res.status}`);
  }
  logger.info(`[health] Qdrant OK (${url})`);
}

async function checkPostgres(logger: Logger): Promise<void> {
  const { createConnection } = await import("node:net");
  const url = new URL(env.MASTRA_DATABASE_URL);
  const host = url.hostname;
  const port = url.port ? parseInt(url.port, 10) : 5432;

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP connect to ${host}:${port} timed out`));
    }, 5_000);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    });

    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  logger.info(`[health] PostgreSQL OK (${host}:${port})`);
}

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

async function checkRedis(logger: Logger): Promise<void> {
  const pong = await redis.ping();
  if (pong !== "PONG") {
    throw new Error(`Redis ping returned: ${pong}`);
  }
  logger.info(`[health] Redis OK`);
}

export async function runStartupChecks(logger: Logger): Promise<void> {
  const checks: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: "Qdrant", fn: () => checkQdrant(logger) },
    { name: "PostgreSQL", fn: () => checkPostgres(logger) },
    { name: "Mistral", fn: () => checkMistral(logger) },
    { name: "Redis", fn: () => checkRedis(logger) },
  ];

  await Promise.all(
    checks.map(async ({ name, fn }) => {
      try {
        await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[health] WARN: ${name} check failed: ${msg}\n`);
      }
    }),
  );
}
