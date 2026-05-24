import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const IN_FLIGHT_TTL_SECONDS = 30;
const KEY_PREFIX = "idempotency:";

export type IdempotencyResult =
  | { status: "hit"; response: NextResponse }
  | { status: "miss"; key: string }
  | { status: "in_flight" }
  | { status: "no_key" };

interface StoredResponse {
  statusCode: number;
  body: unknown;
  cachedAt: string;
}

export async function checkIdempotency(
  req: NextRequest,
  namespace: string
): Promise<IdempotencyResult> {
  // Graceful degradation: if Redis is unavailable, skip idempotency entirely
  if (!redis) return { status: "no_key" };

  const rawKey = req.headers.get("idempotency-key");
  if (!rawKey) return { status: "no_key" };

  // Sanitize key
  if (rawKey.length > 255 || !/^[\w\-]+$/.test(rawKey)) {
    return { status: "no_key" };
  }

  const redisKey = `${KEY_PREFIX}${namespace}:${rawKey}`;

  try {
    const existing = await redis.get(redisKey);

    if (existing === "in_flight") {
      return { status: "in_flight" };
    }

    if (existing !== null) {
      const parsed: StoredResponse = JSON.parse(existing);
      const response = NextResponse.json(parsed.body, {
        status: parsed.statusCode,
        headers: {
          "X-Idempotency-Replayed": "true",
          "X-Idempotency-Cached-At": parsed.cachedAt,
        },
      });
      return { status: "hit", response };
    }

    // Atomic lock acquisition
    const acquired = await redis.set(redisKey, "in_flight", "EX", IN_FLIGHT_TTL_SECONDS, "NX");

    if (acquired === null) {
      return { status: "in_flight" };
    }

    return { status: "miss", key: redisKey };
  } catch (err) {
    // Redis error — degrade gracefully, let request proceed without idempotency
    console.error("[Idempotency] Redis error, skipping:", (err as Error).message);
    return { status: "no_key" };
  }
}

export async function storeIdempotencyResponse(
  redisKey: string,
  statusCode: number,
  body: unknown
): Promise<void> {
  if (!redis) return;
  try {
    const payload: StoredResponse = {
      statusCode,
      body,
      cachedAt: new Date().toISOString(),
    };
    await redis.set(redisKey, JSON.stringify(payload), "EX", IDEMPOTENCY_TTL_SECONDS);
  } catch (err) {
    console.error("[Idempotency] Failed to store response:", (err as Error).message);
  }
}

export async function clearIdempotencyLock(redisKey: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(redisKey);
  } catch (err) {
    console.error("[Idempotency] Failed to clear lock:", (err as Error).message);
  }
}
