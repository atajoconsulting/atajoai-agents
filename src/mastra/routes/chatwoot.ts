import { registerApiRoute } from '@mastra/core/server';
import { sendChatwootMessage } from '../lib/chatwoot-api';
import { launchChatwootWorkflowRun } from '../lib/chatwoot-workflow-launcher';
import { getAppConfig } from '../lib/config';

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
              additionalProperties: true,
              properties: {
                event: { type: 'string', description: 'message_created | message_updated | conversation_resolved | conversation_opened | webwidget_triggered' },
                id: { type: 'number', description: 'Message primary key' },
                content: { type: ['string', 'null'] },
                content_type: { type: 'string', description: 'text | input_text | cards | form | incoming_email | ...' },
                message_type: { type: 'string', description: 'incoming | outgoing | template' },
                private: { type: 'boolean' },
                source_id: { type: ['string', 'null'], description: 'External message ID (e.g. WhatsApp)' },
                created_at: { type: 'string', description: 'ISO 8601' },
                content_attributes: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    in_reply_to: { type: ['string', 'null'] },
                    deleted: { type: ['boolean', 'null'] },
                    is_unsupported: { type: ['boolean', 'null'] },
                  },
                },
                account: {
                  type: 'object',
                  additionalProperties: true,
                  properties: { id: { type: 'number' }, name: { type: 'string' } },
                },
                inbox: {
                  type: 'object',
                  additionalProperties: true,
                  properties: { id: { type: 'number' }, name: { type: 'string' } },
                },
                sender: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    id: { type: 'number' },
                    type: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: ['string', 'null'] },
                    phone_number: { type: ['string', 'null'] },
                    identifier: { type: ['string', 'null'] },
                    blocked: { type: 'boolean' },
                  },
                },
                conversation: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    id: { type: 'number', description: 'display_id (human-readable)' },
                    inbox_id: { type: 'number' },
                    status: { type: 'string', description: 'open | resolved | pending | snoozed' },
                    channel: { type: ['string', 'null'] },
                    can_reply: { type: 'boolean' },
                    labels: { type: 'array', items: { type: 'string' } },
                    priority: { type: ['string', 'null'] },
                    meta: {
                      type: 'object',
                      additionalProperties: true,
                      properties: {
                        assignee: {
                          type: ['object', 'null'],
                          properties: {
                            id: { type: 'number' },
                            name: { type: 'string' },
                            type: { type: 'string', description: 'user | agent_bot' },
                          },
                        },
                        assignee_type: { type: ['string', 'null'], description: 'User | AgentBot | null' },
                        team: {
                          type: ['object', 'null'],
                          properties: { id: { type: 'number' }, name: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
              required: ['event'],
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
