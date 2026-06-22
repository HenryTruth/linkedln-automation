import type { NextFunction, Request, Response } from "express";
import { Redis } from "ioredis";

const WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.API_RATE_LIMIT_MAX ?? 120);
const WINDOW_S = Math.ceil(WINDOW_MS / 1000);

let redis: InstanceType<typeof Redis> | null = null;

function getRedis(): InstanceType<typeof Redis> | null {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
    redis.on("error", () => { /* suppress — falls back to in-memory */ });
    return redis;
  } catch {
    return null;
  }
}

// In-memory fallback for local dev without Redis.
const buckets = new Map<string, { count: number; resetAt: number }>();

async function checkLimit(key: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const client = getRedis();

  if (client) {
    try {
      const redisKey = `rl:${key}`;
      const count = await client.incr(redisKey);
      if (count === 1) await client.expire(redisKey, WINDOW_S);
      if (count > MAX_REQUESTS) {
        const ttl = await client.ttl(redisKey);
        return { allowed: false, retryAfter: ttl > 0 ? ttl : WINDOW_S };
      }
      return { allowed: true, retryAfter: 0 };
    } catch {
      // Redis unavailable — fall through to in-memory
    }
  }

  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  bucket.count++;
  if (bucket.count > MAX_REQUESTS) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

export async function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? "unknown";
  const { allowed, retryAfter } = await checkLimit(key);
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  next();
}
