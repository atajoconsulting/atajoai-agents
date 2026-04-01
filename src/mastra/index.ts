import { Mastra } from "@mastra/core/mastra";
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
import { chatwootAgent } from "./agents/chatwoot-agent";
import { translatorAgent } from "./agents/translator-agent";
import { apiRoutes } from "./routes";
import { env } from "./env";

export const mastra = new Mastra({
  vectors: { qdrant: qdrantVector },
  workflows: { chatwootWebhookWorkflow, webIndexerWorkflow },
  agents: { chatwootAgent, translatorAgent },
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
