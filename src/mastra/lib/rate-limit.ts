import { redis } from "./db/redis";

const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_WINDOW_SECONDS = 60;

/**
 * Sliding-window rate limiter using Redis sorted sets.
 *
 * Fail-open: if Redis is unavailable, returns false (allow processing)
 * to avoid silently dropping messages.
 */
export async function isRateLimited(
  conversationId: number,
  maxRequests = DEFAULT_MAX_REQUESTS,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
): Promise<boolean> {
  const key = `ratelimit:conv:${conversationId}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.expire(key, windowSeconds);

    const results = await pipeline.exec();
    if (!results) return false;

    // zcard result is at index 1: [error, count]
    const [zcardErr, count] = results[1] as [Error | null, number];
    if (zcardErr) return false;

    return count >= maxRequests;
  } catch {
    // Fail-open: allow processing if Redis is down
    return false;
  }
}
