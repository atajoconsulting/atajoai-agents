import { registerApiRoute } from '@mastra/core/server';
import { sendChatwootMessage } from '../lib/chatwoot-api';
import { launchChatwootWorkflowRun } from '../lib/chatwoot-workflow-launcher';
import { getAppConfig } from '../lib/config';

export const chatwootRoutes = [
  registerApiRoute('/chatwoot/webhook', {
    method: 'POST',
    requiresAuth: true,
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
      const mastra = c.get('mastra');
      const logger = mastra.getLogger();
      const body = await c.req.json();

      logger.info('Received event:', { event: body.event });

      const accountId: number | undefined = body.account?.id;
      const conversationId: number | undefined = body.conversation?.id;

      // Fire-and-forget: respond 200 immediately so Chatwoot doesn't time out.
      // On failure, send a fallback message so the citizen is never left hanging.
      await launchChatwootWorkflowRun({
        body,
        logger,
        mastra,
        onRunError: async () => {
          if (accountId === undefined || conversationId === undefined) {
            return;
          }

          await getAppConfig()
            .then((config) =>
              sendChatwootMessage({
                accountId,
                conversationId,
                content:
                  `Lo sentimos, ha ocurrido un error procesando tu mensaje. ` +
                  `Por favor, inténtalo de nuevo o contacta con nosotros en el ${config.orgPhone}.`,
              }),
            )
            .catch((sendErr: unknown) => {
              const sendMsg =
                sendErr instanceof Error ? sendErr.message : String(sendErr);
              logger.error(
                `[chatwoot-route] Failed to send fallback error message ` +
                `(account=${accountId}, conversation=${conversationId}): ${sendMsg}`,
              );
            });
        },
      });

      return c.json({ status: 'accepted' }, 200);
    },
  }),
];
