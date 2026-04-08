/**
 * Structured step metrics for observability.
 * Emits JSON-structured log lines that can be parsed by log aggregation tools.
 */
export interface StepMetrics {
  durationMs: number;
  tokensUsed?: { prompt: number; completion: number };
  model?: string;
  extra?: Record<string, unknown>;
}

export function logStepMetrics(
  logger: { info: (msg: string, data?: Record<string, unknown>) => void },
  stepId: string,
  metrics: StepMetrics,
): void {
  logger.info("[step-metrics]", {
    step: stepId,
    durationMs: metrics.durationMs,
    ...(metrics.tokensUsed && {
      tokensPrompt: metrics.tokensUsed.prompt,
      tokensCompletion: metrics.tokensUsed.completion,
      tokensTotal: metrics.tokensUsed.prompt + metrics.tokensUsed.completion,
    }),
    ...(metrics.model && { model: metrics.model }),
    ...metrics.extra,
  });
}

/**
 * Extracts token usage from a Mastra agent.generate() response.
 */
export function extractTokenUsage(
  response: { usage?: Record<string, unknown> },
): StepMetrics["tokensUsed"] | undefined {
  const usage = response.usage;
  if (!usage) return undefined;
  const prompt = typeof usage.promptTokens === "number" ? usage.promptTokens : 0;
  const completion = typeof usage.completionTokens === "number" ? usage.completionTokens : 0;
  return { prompt, completion };
}
