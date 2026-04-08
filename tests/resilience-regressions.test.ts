import assert from "node:assert/strict";
import test from "node:test";

const REQUIRED_ENV = {
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  DATABASE_URL: "postgres://user:pass@localhost:5432/app",
  EMBED_MODEL: "test-embed-model",
  LLM_MODEL: "openai/gpt-5.4-mini",
  LLM_MODEL_MEDIUM: "openai/gpt-5.4-mini",
  LLM_MODEL_SMALL: "openai/gpt-5.4-mini",
  NODE_ENV: "test",
  REDIS_URL: "redis://localhost:6379",
};

for (const [key, value] of Object.entries(REQUIRED_ENV)) {
  process.env[key] ??= value;
}

const { launchChatwootWorkflowRun } = await import(
  "../src/mastra/lib/chatwoot-workflow-launcher.ts"
);
const { performChatwootHandoff } = await import(
  "../src/mastra/lib/handoff.ts"
);
const { buildEvidenceQuery } = await import(
  "../src/mastra/lib/rag/retrieval.ts"
);
const { withRetry } = await import("../src/mastra/lib/retry.ts");

function createResolvedConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "default",
    orgName: "Ayuntamiento de Prueba",
    orgPhone: "010",
    orgSchedule: "lunes a viernes",
    orgAddress: "Plaza Mayor, 1",
    orgWebsite: "https://ayuntamiento.test",
    orgEOffice: "https://sede.ayuntamiento.test",
    preferredLang: "es",
    responseStyle: "brief_structured",
    llmModel: "openai/gpt-5.4-mini",
    llmModelMedium: "openai/gpt-5.4-mini",
    llmModelSmall: "openai/gpt-5.4-mini",
    embedModel: "embed-current",
    retrievalTopK: 12,
    retrievalFinalK: 4,
    retrievalMinScore: 0.35,
    customInstructions: null,
    greetingMessage: null,
    outOfScopeMessage: null,
    chatwootBaseUrl: "https://chatwoot.test",
    chatwootApiToken: "token",
    enableHandoff: true,
    handoffTeamId: null,
    handoffAssigneeId: 42,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("withRetry retries TimeoutError values", async () => {
  let attempts = 0;

  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        );
      }

      return "ok";
    },
    { maxRetries: 3, baseDelayMs: 0 },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("withRetry does not retry non-retryable errors", async () => {
  let attempts = 0;

  await assert.rejects(
    withRetry(
      async () => {
        attempts += 1;
        throw new Error("boom");
      },
      { maxRetries: 3, baseDelayMs: 0 },
    ),
    /boom/,
  );

  assert.equal(attempts, 1);
});

test("launchChatwootWorkflowRun releases the semaphore if createRun fails", async () => {
  let releases = 0;

  await assert.rejects(
    launchChatwootWorkflowRun({
      body: { hello: "world" },
      logger: {
        error() {},
        info() {},
      },
      mastra: {
        getWorkflow() {
          return {
            async createRun() {
              throw new Error("createRun failed");
            },
          };
        },
      },
      semaphore: {
        release() {
          releases += 1;
        },
      },
    }),
    /createRun failed/,
  );

  assert.equal(releases, 1);
});

test("launchChatwootWorkflowRun releases once after async run failure", async () => {
  let releases = 0;
  let loggedErrors = 0;

  await launchChatwootWorkflowRun({
    body: { hello: "world" },
    logger: {
      error() {
        loggedErrors += 1;
      },
      info() {},
    },
    mastra: {
      getWorkflow() {
        return {
          async createRun() {
            return {
              async start() {
                throw new Error("run failed");
              },
            };
          },
        };
      },
    },
    semaphore: {
      release() {
        releases += 1;
      },
    },
  });

  await flushAsyncWork();

  assert.equal(loggedErrors, 1);
  assert.equal(releases, 1);
});

test("performChatwootHandoff keeps confirmation if the private note fails", async () => {
  let noteAttempts = 0;
  const warnings: string[] = [];

  const result = await performChatwootHandoff(
    {
      accountId: 1,
      config: createResolvedConfig(),
      conversationId: 2,
      handoffConfigured: true,
      messageContent: "Quiero hablar con una persona",
      senderName: "Ciudadano",
    },
    {
      async assignConversation() {},
      buildConfirmationReply() {
        return "He trasladado su conversación al equipo de atención municipal.";
      },
      buildPrivateNote(senderName, messageContent) {
        return `${senderName}: ${messageContent}`;
      },
      buildUnavailableReply() {
        return "Ahora mismo este canal no permite derivarle directamente.";
      },
      logger: {
        warn(message) {
          warnings.push(message);
        },
      },
      async sendPrivateNote() {
        noteAttempts += 1;
        throw new Error("note failed");
      },
    },
  );

  assert.equal(result.handoffPerformed, true);
  assert.match(result.outboundReply, /He trasladado su conversacion|He trasladado su conversación/);
  assert.equal(noteAttempts, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /Handoff note failed/);
});

test("performChatwootHandoff degrades only when assignment fails", async () => {
  let noteAttempts = 0;

  const result = await performChatwootHandoff(
    {
      accountId: 1,
      config: createResolvedConfig(),
      conversationId: 2,
      handoffConfigured: true,
      messageContent: "Quiero hablar con una persona",
      senderName: "Ciudadano",
    },
    {
      async assignConversation() {
        throw new Error("assign failed");
      },
      buildConfirmationReply() {
        return "He trasladado su conversación al equipo de atención municipal.";
      },
      buildPrivateNote(senderName, messageContent) {
        return `${senderName}: ${messageContent}`;
      },
      buildUnavailableReply() {
        return "Ahora mismo este canal no permite derivarle directamente.";
      },
      async sendPrivateNote() {
        noteAttempts += 1;
      },
    },
  );

  assert.equal(result.handoffPerformed, false);
  assert.match(result.outboundReply, /no permite derivarle directamente/);
  assert.equal(noteAttempts, 0);
});

test("buildEvidenceQuery filters strictly by the active embedModel", () => {
  const query = buildEvidenceQuery("documents", [0.25, 0.75], {
    embedModel: "embed-v2",
    retrievalTopK: 8,
  });

  assert.deepEqual(query, {
    indexName: "documents",
    queryVector: [0.25, 0.75],
    topK: 8,
    filter: {
      embedModel: {
        $eq: "embed-v2",
      },
    },
  });
});
