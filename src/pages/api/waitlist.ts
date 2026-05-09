/**
 * POST /api/waitlist
 *
 * Body (JSON):
 *   {
 *     email: string,
 *     retreat_id?: number,           // when omitted, accepts a generic capture if any retreat exists
 *     room_type_id_pref?: number,
 *     occupancy_pref?: 'pair' | 'solo',
 *     source?: string,               // for analytics; ignored on persistence
 *   }
 *
 * Behaviour:
 * - Validates with Zod.
 * - Rate-limits by IP via the RATE_LIMIT KV namespace: 5 / 15 min.
 * - Inserts into `waitlist_entries`. Uniqueness on (retreat_id, email) ⇒
 *   on conflict respond 200 { ok: true, already: true } (idempotent).
 * - When retreat_id is omitted, the row is attached to the next upcoming
 *   published retreat (the schema's NOT NULL constraint demands a row),
 *   and the response carries `attached_retreat_id` so the client can show
 *   "added to next retreat" copy if it wants.
 *
 * Returns: 200 ok | 400 validation | 429 rate-limited | 500 server.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { and, asc, eq, gte } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { retreats, waitlistEntries } from '../../db/schema';

export const prerender = false;

const Body = z.object({
  email: z.string().email().max(254),
  retreat_id: z.number().int().positive().optional(),
  room_type_id_pref: z.number().int().positive().optional(),
  occupancy_pref: z.enum(['pair', 'solo']).optional(),
  source: z.string().max(64).optional(),
  first_name: z.string().max(120).optional(),
  last_name: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function getClientIp(request: Request): string {
  const cf = request.headers.get('CF-Connecting-IP');
  if (cf) return cf;
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return 'unknown';
}

/** Simple sliding-window-ish rate limit: 5 per IP per 15 min. */
async function rateLimit(
  kv: KVNamespace | undefined,
  ip: string,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  if (!kv) return { ok: true }; // dev fallback: skip
  const key = `waitlist:rl:${ip}`;
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) || 0 : 0;
  const limit = 5;
  const windowSec = 15 * 60;
  if (count >= limit) {
    return { ok: false, retryAfter: windowSec };
  }
  await kv.put(key, String(count + 1), { expirationTtl: windowSec });
  return { ok: true };
}

export const POST: APIRoute = async ({ request }) => {
  if (!env?.DB) {
    return jsonResponse(500, { error: 'Database unavailable' });
  }

  // ---- Rate limit ------------------------------------------------------
  const ip = getClientIp(request);
  const rl = await rateLimit(env.RATE_LIMIT, ip);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(rl.retryAfter),
        },
      },
    );
  }

  // ---- Parse + validate body ------------------------------------------
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(400, {
      error: 'Validation failed',
      issues: parsed.error.flatten(),
    });
  }
  const data = parsed.data;
  const email = data.email.trim().toLowerCase();

  const db = getDb(env as any);

  // ---- Resolve retreat_id ----------------------------------------------
  let retreatId = data.retreat_id ?? null;
  if (retreatId !== null) {
    const exists = await db
      .select({ id: retreats.id })
      .from(retreats)
      .where(eq(retreats.id, retreatId))
      .limit(1);
    if (exists.length === 0) {
      return jsonResponse(400, { error: 'Unknown retreat_id' });
    }
  } else {
    // Attach to the next upcoming published retreat (schema requires non-null).
    const upcoming = await db
      .select({ id: retreats.id })
      .from(retreats)
      .where(and(eq(retreats.is_published, true), gte(retreats.ends_at, new Date())))
      .orderBy(asc(retreats.starts_at))
      .limit(1);
    if (upcoming.length === 0) {
      return jsonResponse(400, {
        error: 'No upcoming retreat to attach this entry to',
      });
    }
    retreatId = upcoming[0].id;
  }

  // ---- Insert (idempotent on (retreat_id, email)) ----------------------
  try {
    await db.insert(waitlistEntries).values({
      retreat_id: retreatId,
      email,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      room_type_id_pref: data.room_type_id_pref ?? null,
      occupancy_pref: data.occupancy_pref ?? null,
      notes: data.notes ?? null,
    });
    return jsonResponse(200, { ok: true, already: false, attached_retreat_id: retreatId });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (
      msg.includes('UNIQUE') ||
      msg.includes('unique') ||
      msg.includes('constraint')
    ) {
      return jsonResponse(200, { ok: true, already: true, attached_retreat_id: retreatId });
    }
    console.error('waitlist insert failed', err);
    return jsonResponse(500, { error: 'Failed to add to waitlist' });
  }
};

// Reject other methods politely.
export const ALL: APIRoute = ({ request }) => {
  if (request.method === 'POST') return new Response('ok'); // unreachable
  return new Response('Method Not Allowed', { status: 405 });
};
