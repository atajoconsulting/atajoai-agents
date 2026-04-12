import { z } from "zod";
import {
  routeMessageResultSchema,
  localEvidenceSchema,
  judgeAnswerabilityResultSchema,
  sanitizeReplyResultSchema,
} from "../../lib/outbound";

const timestamp = z.union([z.string(), z.number()]);

export const accountSchema = z
  .object({
    id: z.number(),
    name: z.string().optional(),
  })
  .passthrough();

export const inboxSchema = z
  .object({
    id: z.number(),
    name: z.string().optional(),
  })
  .passthrough();

export const contentAttributesSchema = z
  .object({
    in_reply_to: z.string().nullable().optional(),
    deleted: z.boolean().nullable().optional(),
    external_error: z.string().nullable().optional(),
    translations: z.record(z.string(), z.unknown()).nullable().optional(),
    is_unsupported: z.boolean().nullable().optional(),
  })
  .passthrough();

export const senderSchema = z
  .object({
    id: z.number().optional(),
    type: z.string().optional(),
    name: z.string().optional(),
    email: z.string().nullable().optional(),
    phone_number: z.string().nullable().optional(),
    identifier: z.string().nullable().optional(),
    thumbnail: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    additional_attributes: z.record(z.string(), z.unknown()).optional(),
    custom_attributes: z.record(z.string(), z.unknown()).optional(),
    blocked: z.boolean().optional(),
    account: accountSchema.optional(),
  })
  .passthrough();

export const assigneeSchema = z
  .object({
    id: z.number(),
    name: z.string().nullable().optional(),
    available_name: z.string().nullable().optional(),
    avatar_url: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    availability_status: z.string().nullable().optional(),
    thumbnail: z.string().nullable().optional(),
  })
  .passthrough()
  .nullable();

export const conversationMetaSchema = z
  .object({
    sender: z
      .object({
        id: z.number().optional(),
        name: z.string().nullable().optional(),
        type: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    assignee: assigneeSchema.optional(),
    assignee_type: z.string().nullable().optional(),
    team: z
      .object({
        id: z.number(),
        name: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    hmac_verified: z.boolean().nullable().optional(),
  })
  .passthrough();

export const contactInboxSchema = z
  .object({
    id: z.number().optional(),
    contact_id: z.number().optional(),
    inbox_id: z.number().optional(),
    source_id: z.string().nullable().optional(),
    hmac_verified: z.boolean().optional(),
  })
  .passthrough();

export const pushEventMessageSchema = z
  .object({
    id: z.number().optional(),
    content: z.string().nullable().optional(),
    message_type: z.union([z.number(), z.string()]).optional(),
    content_type: z.union([z.number(), z.string()]).optional(),
    status: z.union([z.number(), z.string()]).optional(),
    private: z.boolean().optional(),
    source_id: z.string().nullable().optional(),
    sender_type: z.string().nullable().optional(),
    sender_id: z.number().nullable().optional(),
    created_at: timestamp.optional(),
    updated_at: timestamp.optional(),
  })
  .passthrough();

export const conversationSchema = z
  .object({
    id: z.number(),
    inbox_id: z.number().optional(),
    status: z.string().optional(),
    channel: z.string().nullable().optional(),
    can_reply: z.boolean().optional(),
    additional_attributes: z.record(z.string(), z.unknown()).optional(),
    custom_attributes: z.record(z.string(), z.unknown()).optional(),
    labels: z.array(z.string()).optional(),
    priority: z.string().nullable().optional(),
    snoozed_until: z.string().nullable().optional(),
    unread_count: z.number().optional(),
    first_reply_created_at: timestamp.nullable().optional(),
    waiting_since: z.number().nullable().optional(),
    agent_last_seen_at: z.number().nullable().optional(),
    contact_last_seen_at: z.number().nullable().optional(),
    last_activity_at: z.number().nullable().optional(),
    timestamp: z.number().nullable().optional(),
    created_at: timestamp.nullable().optional(),
    updated_at: timestamp.nullable().optional(),
    contact_inbox: contactInboxSchema.optional(),
    meta: conversationMetaSchema.optional(),
    messages: z.array(pushEventMessageSchema).optional(),
  })
  .passthrough();

export const chatwootWebhookSchema = z
  .object({
    event: z.string(),
    id: z.number().optional(),
    content: z.string().nullable().optional(),
    content_type: z.string().nullable().optional(),
    message_type: z.string().optional(),
    private: z.boolean().optional(),
    source_id: z.string().nullable().optional(),
    created_at: timestamp.optional(),
    additional_attributes: z.record(z.string(), z.unknown()).optional(),
    content_attributes: contentAttributesSchema.optional(),
    account: accountSchema.optional(),
    inbox: inboxSchema.optional(),
    sender: senderSchema.optional(),
    conversation: conversationSchema.optional(),
  })
  .passthrough();

export const validationResultSchema = z.object({
  shouldProcess: z.boolean(),
  accountId: z.number(),
  conversationId: z.number(),
  messageContent: z.string(),
  senderName: z.string(),
  threadId: z.string(),
  resourceId: z.string(),
  channel: z.string(),
  config: z.any(),
  inboxId: z.number().nullable(),
  conversationStatus: z.string().nullable(),
  currentAssigneeType: z.string().nullable(),
});

export const routedResultSchema = validationResultSchema.extend({
  route: routeMessageResultSchema,
  searchQuery: z.string(),
});

export const retrievedResultSchema = routedResultSchema.extend({
  evidence: z.array(localEvidenceSchema),
});

export const judgedResultSchema = retrievedResultSchema.extend({
  judgement: judgeAnswerabilityResultSchema,
});

export const composedResultSchema = judgedResultSchema.extend({
  draftReply: z.string(),
  shouldSend: z.boolean(),
  handoffRequested: z.boolean(),
});

export const sanitizedResultSchema = judgedResultSchema.extend({
  outboundReply: z.string(),
  shouldSend: z.boolean(),
  handoffRequested: z.boolean(),
  sanitize: sanitizeReplyResultSchema,
});
