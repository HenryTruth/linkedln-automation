import type { ConnectionOptions } from "bullmq";

export function getConnection(): ConnectionOptions {
  const raw = process.env.REDIS_URL ?? "redis://localhost:6379";
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    password: url.password || undefined,
    maxRetriesPerRequest: null, // required by BullMQ
  };
}
