
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { chatwootWebhookWorkflow } from './workflows/chatwoot-webhook';
import { weatherAgent } from './agents/weather-agent';
import { chatwootAgent } from './agents/chatwoot-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { apiRoutes } from './routes';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, chatwootWebhookWorkflow },
  agents: { weatherAgent, chatwootAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'debug',
  }),
  server: {
    host: "0.0.0.0",
    port: 4111,
    apiRoutes,
  },
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(),
        ],
      },
    },
  }),
});
