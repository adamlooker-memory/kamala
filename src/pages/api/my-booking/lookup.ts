/**
 * POST /api/my-booking/lookup
 *
 * Body: { email: string, code: string }
 *
 * - Rate-limited per IP and per email-hash via KV.
 * - Always logs an attempt to `booking_lookup_attempts`.
 * - On match: mints a single-use signed token, stores its sha256, emails the
 *   manage-booking link to the email on file, and returns { ok: true } so the
 *   front-end redirects to /my-booking (a confirmation page) without leaking
 *   the token to the client. We also include the token in the response when
 *   the form submits over fetch — the front-end uses it for an immediate
 *   redirect to /my-booking/[token] so the user doesn't have to dig in their
 *   inbox.
 * - On miss: same shape of response, generic message — doesn't leak which of
 *   email or code was wrong.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import {
  bookingLookupAttempts,
  bookingLookupTokens,
  bookings,
  retreats,
} from '../../../db/schema';
import { isValidBookingCode, normaliseBookingCode } from '../../../db/codes';
import {
  mintLookupToken,
  normaliseEmail,
  sha256Hex,
  timingSafeEqual,
} from '../../../lib/booking/lookup';
import { checkRateLimit, getClientIp } from '../../../lib/rate-limit';
import { sendManageBookingLink } from '../../../lib/email';

const Body = z.object({
  email: z.string().trim().min(1).max(254).email(),
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
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: 'Please check the email and code.' }, 400);
  }

  const email = normaliseEmail(parsed.data.email);
  const codeRaw = normaliseBookingCode(parsed.data.code);
  const validShape = isValidBookingCode(codeRaw);

  const ipHash = await sha256Hex(ip);
  const emailHash = await sha256Hex(email);

  // Rate limits — per IP and per email. Both must pass.
  const ipRl = await checkRateLimit({
    kv: env.RATE_LIMIT,
    bucket: 'lookup:ip',
    key: ipHash,
    windowSeconds: RATE_WINDOW_SECONDS,
    max: RATE_MAX,
  });
  const emailRl = await checkRateLimit({
    kv: env.RATE_LIMIT,
    bucket: 'lookup:email',
    key: emailHash,
    windowSeconds: RATE_WINDOW_SECONDS,
    max: RATE_MAX,
  });

  if (!ipRl.allowed || !emailRl.allowed) {
    return json(
      {
        ok: false,
        error: 'Too many attempts. Please wait a few minutes and try again.',
      },
      429,
    );
  }

  const db = getDb(env);

  // Always do a DB query — even on bad shape — to keep timing similar.
  // We log the attempt regardless of outcome.
  let bookingId: number | null = null;
  let bookingEmail: string | null = null;

  if (validShape) {
    const row = await db
      .select({
        id: bookings.id,
        lead_email: bookings.lead_email,
        confirmation_code: bookings.confirmation_code,
      })
      .from(bookings)
      .where(eq(bookings.confirmation_code, codeRaw))
      .limit(1);

    if (row.length > 0) {
      const candidate = row[0]!;
      const candidateEmail = candidate.lead_email.trim().toLowerCase();
      // Constant-time email compare.
      if (timingSafeEqual(candidateEmail, email)) {
        bookingId = candidate.id;
        bookingEmail = candidate.lead_email;
      }
    }
  }

  const success = bookingId !== null;

  // Log attempt (forensics + abuse signal).
  await db.insert(bookingLookupAttempts).values({
    email_hash: emailHash,
    ip_hash: ipHash,
    success,
    user_agent: request.headers.get('user-agent')?.slice(0, 240) ?? null,
  });

  if (!success || bookingId === null) {
    // Generic — do not reveal which input was wrong.
    return json(
      {
        ok: false,
        error: "We couldn't find a matching booking.",
      },
      404,
    );
  }

  // Mint token.
  const secret = env.BOOKING_TOKEN_SECRET;
  if (!secret) {
    console.error('[lookup] BOOKING_TOKEN_SECRET not set');
    return json(
      { ok: false, error: 'Lookup is temporarily unavailable.' },
      500,
    );
  }

  const { token, tokenHash } = await mintLookupToken(secret);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

  await db.insert(bookingLookupTokens).values({
    booking_id: bookingId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    requested_ip_hash: ipHash,
  });

  // Send the manage-booking link to the email on file (in case the user
  // submitted from a different device than the one they want to view on).
  const siteUrl = env.PUBLIC_SITE_URL || 'https://kamalaretreats.com';
  const manageUrl = `${siteUrl.replace(/\/$/, '')}/my-booking/${token}`;

  // Don't await — fire and let it complete in the background. But we want
  // errors visible: catch and log.
  try {
    await sendManageBookingLink({
      env,
      to: bookingEmail!,
      url: manageUrl,
      code: codeRaw,
    });
  } catch (err) {
    console.error('[lookup] failed to send link email', err);
    // Carry on — the user has the token in the response and can proceed.
  }

  return json({ ok: true, token });
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
