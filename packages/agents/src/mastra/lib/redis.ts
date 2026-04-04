import Redis from "ioredis";
import { env } from "../env";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.connect().catch((err) => {
  process.stderr.write(
    `[redis] Failed to connect: ${err instanceof Error ? err.message : String(err)}\n`,
  );
});
