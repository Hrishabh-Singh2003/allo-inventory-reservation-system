import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;

  if (!url) {
    console.warn(
      "[Redis] REDIS_URL is not set. Idempotency support is DISABLED. " +
        "Add REDIS_URL to your .env file to enable it."
    );
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    connectTimeout: 3000,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  client.on("error", (err) => {
    // Log but don't crash — idempotency degrades gracefully when Redis is down
    console.error("[Redis] Connection error:", err.message);
  });

  return client;
}

// May be null when REDIS_URL is not configured
export const redis: Redis | null =
  globalForRedis.redis !== undefined ? globalForRedis.redis : createRedisClient();

if (process.env.NODE_ENV !== "production") {
  (globalThis as any).redis = redis;
}
