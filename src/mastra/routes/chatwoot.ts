import { registerApiRoute } from '@mastra/core/server';

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
                sender: {}
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

      const workflow = mastra.getWorkflow('chatwootWebhookWorkflow');
      const run = await workflow.createRun();

      // Fire-and-forget: respond 200 inmediatamente para que Chatwoot no haga timeout
      run.start({ inputData: body }).then((result: unknown) => {
        logger.info('Workflow completed', { result });

      }).catch((error: unknown) => {
        logger.error('Workflow error', { error });
      });

      return c.json({ status: 'accepted' }, 200);
    },
  }),
];
