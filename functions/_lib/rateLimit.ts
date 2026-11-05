import { HttpError } from "./http";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    cleanup(now);
    return;
  }
  existing.count += 1;
  if (existing.count > limit) {
    throw new HttpError(
      429,
      "rate_limited",
      "Too many requests. Try again later.",
    );
  }
}

function cleanup(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
