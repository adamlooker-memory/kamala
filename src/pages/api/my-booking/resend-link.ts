/**
 * POST /api/my-booking/resend-link
 *
 * Body: { code: string }
 *
 * Sends a fresh manage-booking link to the email on file for the booking
 * matching the code. Used as a recovery path when the user has the code but
 * has lost the original email. Always returns ok:true to avoid leaking
 * whether the code matched a real booking.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import { bookings, bookingLookupTokens } from '../../../db/schema';
import { isValidBookingCode, normaliseBookingCode } from '../../../db/codes';
import { mintLookupToken, sha256Hex } from '../../../lib/booking/lookup';
import { checkRateLimit, getClientIp } from '../../../lib/rate-limit';
import { sendManageBookingLink } from '../../../lib/email';

const Body = z.object({
  code: z.string().trim().min(1).max(40),
});

const TOKEN_TTL_SECONDS = 15 * 60;
const RATE_WINDOW_SECONDS = 15 * 60;
const RATE_MAX = 5;

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: true }); // generic
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: true });
  }

  const codeRaw = normaliseBookingCode(parsed.data.code);

  const ipHash = await sha256Hex(ip);
  const ipRl = await checkRateLimit({
    kv: env.RATE_LIMIT,
    bucket: 'resend-link:ip',
    key: ipHash,
    windowSeconds: RATE_WINDOW_SECONDS,
    max: RATE_MAX,
  });
  if (!ipRl.allowed) {
    return json(
      { ok: false, error: 'Too many attempts. Please wait a few minutes.' },
      429,
    );
  }

  if (!isValidBookingCode(codeRaw)) {
    return json({ ok: true });
  }

  const db = getDb(env);
  const row = await db
    .select({ id: bookings.id, lead_email: bookings.lead_email })
    .from(bookings)
    .where(eq(bookings.confirmation_code, codeRaw))
    .limit(1);

  if (row.length === 0) {
    return json({ ok: true });
  }

  const secret = env.BOOKING_TOKEN_SECRET;
  if (!secret) {
    console.error('[resend-link] BOOKING_TOKEN_SECRET not set');
    return json({ ok: true });
  }

  const candidate = row[0]!;
  const { token, tokenHash } = await mintLookupToken(secret);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

  await db.insert(bookingLookupTokens).values({
    booking_id: candidate.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    requested_ip_hash: ipHash,
  });

  const siteUrl = env.PUBLIC_SITE_URL || 'https://kamalaretreats.com';
  const manageUrl = `${siteUrl.replace(/\/$/, '')}/my-booking/${token}`;

  try {
    await sendManageBookingLink({
      env,
      to: candidate.lead_email,
      url: manageUrl,
      code: codeRaw,
    });
  } catch (err) {
    console.error('[resend-link] failed to send', err);
  }

  return json({ ok: true });
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
