/**
 * Tiny KV-backed fixed-window rate limiter.
 *
 * Stores a counter under `<bucket>:<key>` with a TTL equal to the window. On
 * each call we increment via read-then-write (no atomicity) — good enough at
 * Kamala's scale and for adversaries with one IP. The first hit in a window
 * sets the TTL; subsequent hits keep it (KV doesn't extend TTL on a put with
 * the same expiration unless we re-set it).
 */

import type { KVNamespace } from '@cloudflare/workers-types';

export interface RateLimitInput {
  kv: KVNamespace;
  /** Logical bucket name, e.g. 'lookup:ip' or 'newsletter:ip'. */
  bucket: string;
  /** The identifier to rate-limit on (already hashed if it's PII). */
  key: string;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Max hits allowed in a window (inclusive). */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Hits including the current one. */
  count: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
}

/**
 * Increment-and-check.
 */
export async function checkRateLimit(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const { kv, bucket, key, windowSeconds, max } = input;
  const fullKey = `rl:${bucket}:${key}`;

  const current = await kv.get(fullKey);
  const count = current ? parseInt(current, 10) || 0 : 0;
  const next = count + 1;

  // Always re-write so the TTL refreshes — slight clock-shift but simple.
  await kv.put(fullKey, String(next), { expirationTtl: windowSeconds });

  return {
    allowed: next <= max,
    count: next,
    retryAfterSeconds: windowSeconds,
  };
}

/** Best-effort client IP from the request. */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
