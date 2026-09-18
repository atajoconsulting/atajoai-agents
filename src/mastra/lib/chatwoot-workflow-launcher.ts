import { RequestContext } from "@mastra/core/request-context";

export interface ChatwootWorkflowRun {
  start(input: {
    inputData: unknown;
    requestContext?: RequestContext;
  }): Promise<unknown>;
}

export interface ChatwootWorkflow {
  createRun(): Promise<ChatwootWorkflowRun>;
}

export interface ChatwootWorkflowRegistry {
  getWorkflow(name: "chatwootWebhookWorkflow"): ChatwootWorkflow | undefined;
}

export interface ChatwootWorkflowLogger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface SemaphoreReleaser {
  release(): void;
}

export interface LaunchChatwootWorkflowParams {
  body: unknown;
  logger: ChatwootWorkflowLogger;
  mastra: ChatwootWorkflowRegistry;
  /** Tenant id injected into the run's request context so that every
   *  downstream agent picks up the correct per-tenant config. */
  tenantId: string;
  onRunError?: (error: unknown) => Promise<void> | void;
  semaphore?: SemaphoreReleaser;
}

export async function launchChatwootWorkflowRun({
  body,
  logger,
  mastra,
  tenantId,
  onRunError,
  semaphore,
}: LaunchChatwootWorkflowParams): Promise<void> {
  let releaseAttachedToRun = false;

  try {
    const workflow = mastra.getWorkflow("chatwootWebhookWorkflow");
    if (!workflow) {
      throw new Error("Chatwoot webhook workflow not found");
    }

    const requestContext = new RequestContext();
    requestContext.set("tenantId", tenantId);

    const run = await workflow.createRun();
    const runPromise = run.start({ inputData: body, requestContext });
    releaseAttachedToRun = true;

    void runPromise
      .then(() => {
        logger.info("Workflow completed", { tenantId });
      })
      .catch(async (error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("Workflow error", { error: msg, tenantId });
        await onRunError?.(error);
      })
      .finally(() => {
        semaphore?.release();
      });
  } finally {
    if (!releaseAttachedToRun) {
      semaphore?.release();
    }
  }
}
