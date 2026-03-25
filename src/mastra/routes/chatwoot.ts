import { registerApiRoute } from '@mastra/core/server';

export const chatwootRoutes = [
  registerApiRoute('/chatwoot/webhook', {
    method: 'POST',
    handler: async (c) => {
      const mastra = c.get('mastra');
      const logger = mastra.getLogger();
      const body = await c.req.json();

      logger.info('[Chatwoot Webhook] Received event:', { event: body.event });

      const workflow = mastra.getWorkflow('chatwootWebhookWorkflow');
      const run = await workflow.createRun();

      // Fire-and-forget: respond 200 inmediatamente para que Chatwoot no haga timeout
      run.start({ inputData: body }).then((result: unknown) => {
        logger.info('[Chatwoot Webhook] Workflow completed', { result });
      }).catch((error: unknown) => {
        logger.error('[Chatwoot Webhook] Workflow error', { error });
      });

      return c.json({ status: 'accepted' }, 200);
    },
  }),
];
