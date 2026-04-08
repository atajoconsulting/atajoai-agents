export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  retryableStatuses?: number[];
}

export class RetryableError extends Error {
  readonly status?: number;

  constructor(
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "RetryableError";
    this.status = status;
  }
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if (typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (
    cause &&
    typeof cause === "object" &&
    typeof (cause as { code?: unknown }).code === "string"
  ) {
    return (cause as { code: string }).code;
  }

  return undefined;
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return true;
  }

  const code = getErrorCode(error);
  if (code && RETRYABLE_NETWORK_CODES.has(code)) {
    return true;
  }

  return (
    error.message.includes("fetch failed") ||
    error.message.includes("ECONNREFUSED") ||
    error.message.includes("ETIMEDOUT")
  );
}

/**
 * Executes a function with exponential backoff and jitter.
 * Only retries on RetryableError or network errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) break;

      if (!isRetryableError(error)) throw lastError;

      const delay =
        baseDelayMs * Math.pow(2, attempt) +
        Math.random() * (baseDelayMs / 2);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
