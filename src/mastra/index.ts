import { Mastra } from "@mastra/core/mastra";
import { seedDefaultConfig } from "./lib/seed";
import { qdrantVector } from "./vectors/qdrant";
import { PinoLogger } from "@mastra/loggers";
import {
  Observability,
  DefaultExporter,
  SensitiveDataFilter,
} from "@mastra/observability";
import { PostgresStore } from "@mastra/pg";
import { chatwootWebhookWorkflow } from "./workflows/chatwoot-webhook";
import { webIndexerWorkflow } from "./workflows/web-indexer";
import { documentIndexerWorkflow } from "./workflows/document-indexer";
import {
  chatwootResponderAgent,
  chatwootRouterAgent,
} from "./agents/chatwoot-agent";
import { answerabilityJudgeAgent } from "./agents/answerability-judge-agent";
import { localInfoRegisteredScorers } from "./scorers";
import { translatorAgent } from "./agents/translator-agent";
import { apiRoutes } from "./routes";
import { env } from "./env";
import { runStartupChecks } from "./lib/health";
import { getAppConfig } from "./lib/config";

export const mastra = new Mastra({
  // NOTE: runStartupChecks is called below after the instance is exported.
  vectors: { qdrant: qdrantVector },
  workflows: { chatwootWebhookWorkflow, webIndexerWorkflow, documentIndexerWorkflow },
  scorers: localInfoRegisteredScorers,
  agents: {
    chatwootRouterAgent,
    chatwootResponderAgent,
    answerabilityJudgeAgent,
    translatorAgent,
  },
  storage: new PostgresStore({
    id: "pg-storage",
    connectionString: env.DATABASE_URL,
    max: 30,
    idleTimeoutMillis: 60000,
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: env.NODE_ENV === "production" ? "info" : "debug",
  }),
  server: {
    host: "0.0.0.0",
    cors: false,
    middleware: [
      async (c, next) => {
        const config = await getAppConfig();
        c.header(
          "Access-Control-Allow-Origin",
          config.chatwootBaseUrl ?? "*",
        );
        c.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PATCH, DELETE, OPTIONS",
        );
        c.header(
          "Access-Control-Allow-Headers",
          "Content-Type, X-API-Key, Authorization",
        );

        if (c.req.method === "OPTIONS") {
          return new Response(null, { status: 204 });
        }

        await next();
      },
      async (c, next) => {
        const start = Date.now();
        await next();
        const logger = c.get("mastra").getLogger();
        logger.debug(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
      },
    ],
    build: {
      swaggerUI: true,
      openAPIDocs: true,
    },
    apiRoutes,
  },
  observability: new Observability({
    configs: {
      default: {
        serviceName: "mastra",
        exporters: [new DefaultExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});

seedDefaultConfig().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[seed] Unexpected error during config seed: ${msg}\n`);
});

if (env.ENABLE_STARTUP_CHECKS) {
  runStartupChecks(mastra.getLogger()).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[health] Unexpected error during startup checks: ${msg}\n`);
  });
}
