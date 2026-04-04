import { registerApiRoute } from '@mastra/core/server';
import { sendChatwootMessage } from '../lib/chatwoot-api';
import { getConfig } from '../lib/config';

const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_MAX = 10;
const requestTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0]! < now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RATE_LIMIT_MAX) {
    return true;
  }
  requestTimestamps.push(now);
  return false;
}

export const chatwootRoutes = [
  registerApiRoute('/chatwoot/webhook', {
    method: 'POST',
    openapi: {
      summary: 'Chatwoot Webhook',
      description: 'Receive and process Chatwoot webhook events',
      tags: ['Chatwoot'],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                event: { type: 'string' },
                content: { type: 'string' },
                message_type: { type: 'string' },
                private: { type: 'boolean' },
                sender: {},
                account: {
                  type: 'object',
                  properties: { id: { type: 'number' } },
                },
                conversation: {
                  type: 'object',
                  properties: { id: { type: 'number' } },
                },
              }
            },
          }
        }
      }
    },
    handler: async (c) => {
      if (isRateLimited()) {
        return c.json({ error: 'Too many requests' }, 429);
      }

      const mastra = c.get('mastra');
      const logger = mastra.getLogger();
      const body = await c.req.json();

      logger.info('Received event:', { event: body.event });

      const accountId: number | undefined = body.account?.id;
      const conversationId: number | undefined = body.conversation?.id;

      const workflow = mastra.getWorkflow('chatwootWebhookWorkflow');
      const run = await workflow.createRun();

      run.start({ inputData: body }).then((result: unknown) => {
        logger.info('Workflow completed', { result });
      }).catch(async (error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('Workflow error', { error: msg });

        if (accountId !== undefined && conversationId !== undefined) {
          try {
            const config = await getConfig();
            if (config.chatwootBaseUrl && config.chatwootApiToken) {
              await sendChatwootMessage(
                { baseUrl: config.chatwootBaseUrl, apiToken: config.chatwootApiToken },
                {
                  accountId,
                  conversationId,
                  content: `Lo sentimos, ha ocurrido un error procesando tu mensaje. Por favor, inténtalo de nuevo o contacta con nosotros en el ${config.orgPhone ?? "teléfono municipal"}.`,
                },
              );
            }
          } catch (sendErr: unknown) {
            const sendMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
            process.stderr.write(
              `[chatwoot-route] Failed to send fallback error message ` +
              `(account=${accountId}, conversation=${conversationId}): ${sendMsg}\n`,
            );
          }
        }
      });

      return c.json({ status: 'accepted' }, 200);
    },
  }),
];
