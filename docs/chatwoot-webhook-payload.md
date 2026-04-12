# Chatwoot Agent Bot Webhook Payload Reference

Reference document for building a Zod schema that matches the JSON payload Chatwoot sends to agent bot webhook endpoints.

---

## Event: `message_created`

This is the primary event the workflow processes. The payload is built by `Message#webhook_data` merged with `{ event: "message_created" }`.

```jsonc
{
  "event": "message_created",                    // string: "message_created" | "message_updated" | "conversation_resolved" | "conversation_opened" | "webwidget_triggered"

  // ─── Message fields ───────────────────────────────────────
  "id": 12345,                                    // number: message primary key
  "content": "Hola, necesito ayuda",              // string | null: message text
  "content_type": "text",                         // string: "text" | "input_text" | "input_textarea" | "input_email" | "input_select" | "cards" | "form" | "article" | "incoming_email" | "input_csat" | "integrations" | "sticker" | "voice_call"
  "message_type": "incoming",                     // string: "incoming" | "outgoing" | "template"
  "private": false,                               // boolean: private/internal note
  "source_id": "wamid.abc123",                    // string | null: external message ID (e.g. WhatsApp)
  "created_at": "2026-04-12T10:30:00.000Z",       // string (ISO 8601)
  "additional_attributes": {},                     // object: channel-specific extra data
  "content_attributes": {                          // object: structured metadata (all keys optional)
    "in_reply_to": "source-id-123",               // string | null
    "deleted": false,                              // boolean | null
    "external_error": null,                        // string | null
    "translations": {},                            // object | null
    "is_unsupported": false                        // boolean | null
  },

  // ─── Account ──────────────────────────────────────────────
  "account": {
    "id": 1,                                       // number
    "name": "Acme Support"                         // string
  },

  // ─── Inbox ────────────────────────────────────────────────
  "inbox": {
    "id": 10,                                      // number
    "name": "Website Chat"                         // string
  },

  // ─── Top-level Sender (Contact#webhook_data) ──────────────
  // Polymorphic: Contact, User, or AgentBot. For incoming messages this is always a Contact.
  "sender": {
    "id": 200,                                     // number
    "name": "Jane Doe",                            // string
    "email": "customer@example.com",               // string | null
    "phone_number": "+34600000000",                // string | null
    "identifier": "ext-contact-id",                // string | null
    "thumbnail": "https://...",                    // string
    "avatar": "https://...",                       // string
    "additional_attributes": {},                   // object
    "custom_attributes": {},                       // object
    "blocked": false,                              // boolean
    "account": {                                   // nested Account#webhook_data
      "id": 1,
      "name": "Acme Support"
    }
  },

  // ─── Conversation ─────────────────────────────────────────
  "conversation": {
    "id": 42,                                      // number: display_id (human-readable, NOT the DB primary key)
    "inbox_id": 10,                                // number
    "status": "open",                              // string: "open" | "resolved" | "pending" | "snoozed"
    "channel": "Channel::WebWidget",               // string | null: "Channel::WebWidget" | "Channel::Whatsapp" | "Channel::Api" | "Channel::Email" | "Channel::Telegram" | "Channel::FacebookPage" | "Channel::Sms" | "Channel::TwilioSms" | "Channel::Line" | "Channel::Instagram" | "Channel::Tiktok" | "Channel::TwitterProfile"
    "can_reply": true,                             // boolean
    "additional_attributes": {},                   // object
    "custom_attributes": {},                       // object
    "labels": ["vip", "billing"],                  // string[]
    "priority": null,                              // string | null: "low" | "medium" | "high" | "urgent" | null
    "snoozed_until": null,                         // string | null (ISO 8601)
    "unread_count": 3,                             // number
    "first_reply_created_at": "2026-04-11T14:00:00.000Z", // string | null
    "waiting_since": 1712830200,                   // number (unix timestamp, 0 if null)
    "agent_last_seen_at": 1712916000,              // number (unix timestamp)
    "contact_last_seen_at": 1712916500,            // number (unix timestamp)
    "last_activity_at": 1712916600,                // number (unix timestamp)
    "timestamp": 1712916600,                       // number (same as last_activity_at)
    "created_at": 1712743200,                      // number (unix timestamp)
    "updated_at": 1712916600.123456,               // number (unix timestamp with microseconds)

    // ─── conversation.contact_inbox ─────────────────────────
    "contact_inbox": {
      "id": 500,                                   // number
      "contact_id": 200,                           // number
      "inbox_id": 10,                              // number
      "source_id": "widget-session-abc123",        // string
      "hmac_verified": false,                      // boolean
      "pubsub_token": "token-xyz",                 // string
      "created_at": "2026-04-10T08:00:00.000Z",   // string
      "updated_at": "2026-04-10T08:00:00.000Z"    // string
    },

    // ─── conversation.meta ──────────────────────────────────
    // THIS IS WHERE ASSIGNEE INFO LIVES
    "meta": {
      "sender": {                                  // Contact#push_event_data — always present
        "id": 200,                                 // number
        "name": "Jane Doe",                        // string
        "email": "customer@example.com",           // string | null
        "phone_number": "+34600000000",            // string | null
        "identifier": "ext-contact-id",            // string | null
        "thumbnail": "https://...",                // string
        "additional_attributes": {},               // object
        "custom_attributes": {},                   // object
        "blocked": false,                          // boolean
        "type": "contact"                          // string: always "contact"
      },

      // assignee: null if unassigned
      // User#push_event_data when assigned to a human agent:
      "assignee": {
        "id": 5,                                   // number
        "name": "Agent Smith",                     // string
        "available_name": "Agent Smith",           // string
        "avatar_url": "https://...",               // string
        "type": "user",                            // string: "user"
        "availability_status": "online",           // string: "online" | "offline" | "busy"
        "thumbnail": "https://..."                 // string
      },
      // AgentBot#push_event_data when assigned to a bot:
      // "assignee": {
      //   "id": 99,                               // number
      //   "name": "Support Bot",                  // string
      //   "avatar_url": "https://...",            // string
      //   "type": "agent_bot"                     // string: "agent_bot"
      // },

      "assignee_type": "User",                    // string | null: "User" | "AgentBot" | null
      "team": {                                    // object | null
        "id": 3,                                   // number
        "name": "Sales Team"                       // string
      },
      "hmac_verified": false                       // boolean | null
    },

    // ─── conversation.messages ──────────────────────────────
    // Array with 0 or 1 elements: the last chat message (push_event_data format)
    // NOTE: In push_event_data, message_type and content_type are INTEGER enums, not strings!
    "messages": [
      {
        "id": 12345,                               // number
        "content": "Hola, necesito ayuda",         // string | null
        "account_id": 1,                           // number
        "inbox_id": 10,                            // number
        "conversation_id": 42,                     // number (display_id)
        "message_type": 0,                         // number: 0=incoming, 1=outgoing, 2=activity, 3=template
        "content_type": 0,                         // number: 0=text, etc.
        "status": 0,                               // number: 0=sent, 1=delivered, 2=read, 3=failed
        "private": false,                          // boolean
        "source_id": "wamid.abc123",               // string | null
        "sender_type": "Contact",                  // string | null: "Contact" | "User" | "AgentBot"
        "sender_id": 200,                          // number | null
        "additional_attributes": {},               // object
        "content_attributes": {},                  // object
        "external_source_ids": {},                 // object | null
        "sentiment": null,                         // object | null
        "processed_message_content": null,         // string | null
        "created_at": 1712916600,                  // number (unix timestamp)
        "updated_at": "2026-04-12T10:30:00.000Z",  // string
        "sender": {                                // Contact or User push_event_data
          "id": 200,
          "name": "Jane Doe",
          "type": "contact"
          // ... same as meta.sender
        },
        "conversation": {
          "assignee_id": 5,                        // number | null
          "unread_count": 3,                       // number
          "last_activity_at": 1712916600,          // number
          "contact_inbox": {
            "source_id": "widget-session-abc123"   // string
          }
        }
      }
    ]
  }
}
```

---

## Other Event Payloads

### `conversation_resolved` / `conversation_opened`

The payload IS the conversation object directly (NOT wrapped in a `conversation` key):

```jsonc
{
  "event": "conversation_resolved",
  "id": 42,                           // display_id
  "inbox_id": 10,
  "status": "resolved",
  "channel": "Channel::WebWidget",
  "meta": { "sender": {}, "assignee": {}, "assignee_type": "User", "team": null },
  "labels": [],
  "messages": [],
  // ... all other conversation fields at top level
}
```

### `webwidget_triggered`

```jsonc
{
  "event": "webwidget_triggered",
  "id": 500,                          // contact_inbox.id
  "contact": { /* Contact#webhook_data */ },
  "inbox": { /* Inbox#webhook_data */ },
  "account": { /* Account#webhook_data */ },
  "current_conversation": { /* Conversation#webhook_data or null */ },
  "source_id": "widget-session-abc123",
  "event_info": { /* event-specific data */ }
}
```

---

## Key Notes for Building the Zod Schema

1. **`conversation.id` is `display_id`**, not the database primary key. It's the human-readable conversation number.

2. **`conversation.meta.assignee`** can be `null` (unassigned), a User object (with `type: "user"`), or an AgentBot object (with `type: "agent_bot"`).

3. **`conversation.meta.assignee_type`** is a separate string field: `"User"`, `"AgentBot"`, or `null`.

4. **Top-level `message_type` is a string** (`"incoming"`), but **`conversation.messages[].message_type` is a number** (`0`). Same for `content_type`.

5. **`sender` appears in 3 places** with slightly different shapes:
   - Top-level `sender`: uses `webhook_data` (Contact includes `account` and `avatar` keys)
   - `conversation.meta.sender`: uses `push_event_data` (Contact includes `type: "contact"`, no `account`)
   - `conversation.messages[].sender`: uses `push_event_data`

6. **Use `.passthrough()`** or loose schemas for deeply nested objects you don't need — Chatwoot adds fields across versions and the schema should be forward-compatible.

7. **Timestamps are mixed**: some are ISO 8601 strings, some are unix integers, some are floats. Check each field.

8. **`conversation.messages`** is an array of 0 or 1 elements (the last chat message only).

---

## Source Files (Chatwoot codebase)

| What | File |
|---|---|
| Listener that builds payload | `app/listeners/agent_bot_listener.rb` |
| Conversation presenter | `app/presenters/conversations/event_data_presenter.rb` |
| Message#webhook_data | `app/models/message.rb:173` |
| Message#push_event_data | `app/models/message.rb:146` |
| Contact#webhook_data | `app/models/contact.rb:165` |
| Contact#push_event_data | `app/models/contact.rb:150` |
| User#webhook_data | `app/models/user.rb:155` |
| User#push_event_data | `app/models/user.rb:143` |
| AgentBot#push_event_data | `app/models/agent_bot.rb:45` |
| Account#webhook_data | `app/models/account.rb:171` |
| Inbox#webhook_data | `app/models/inbox.rb:178` |
| Team#push_event_data | `app/models/team.rb:62` |
| Attachment#push_event_data | `app/models/attachment.rb:45` |
| HTTP dispatch | `lib/webhooks/trigger.rb` |
