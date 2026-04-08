import { redis } from "./db/redis";

const DEDUP_TTL_SECONDS = 300; // 5 minutes

/**
 * Checks if a webhook message has already been processed.
 * Uses Redis SET NX to atomically mark the message as processed.
 *
 * Fail-open: if Redis is unavailable, returns false (allow processing)
 * to avoid silently dropping messages.
 */
export async function isMessageProcessed(
  messageId: number,
): Promise<boolean> {
  try {
    const result = await redis.set(
      `webhook:msg:${messageId}`,
      "1",
      "EX",
      DEDUP_TTL_SECONDS,
      "NX",
    );
    // SET NX returns "OK" if the key was set (first time), null if it already existed
    return result !== "OK";
  } catch {
    // Fail-open: allow processing if Redis is down
    return false;
  }
}
