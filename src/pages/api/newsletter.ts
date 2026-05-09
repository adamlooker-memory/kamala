/**
 * POST /api/newsletter
 *
 * Body: { email: string, source?: NewsletterSource }
 *
 * Inserts (or updates source on conflict) a row in `newsletter_subscribers`
 * and emails a double opt-in confirmation link. Always returns 200 to avoid
 * leaking which emails are on the list.
 *
 * Confirmation token: HMAC-signed (BOOKING_TOKEN_SECRET — reused), so the
 * confirm endpoint can validate without storing the plaintext.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { newsletterSubscribers, type NewsletterSource } from '../../db/schema';
import { mintLookupToken, normaliseEmail, sha256Hex } from '../../lib/booking/lookup';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';
import { sendNewsletterConfirmation } from '../../lib/email';

const Body = z.object({
  email: z.string().trim().min(1).max(254).email(),
  source: z
    .enum(['footer', 'waitlist', 'booking', 'popup', 'other'])
    .optional(),
});

const RATE_WINDOW_SECONDS = 60 * 60;
const RATE_MAX = 10;

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);

  // Accept JSON or form-encoded (the homepage form posts as form-urlencoded).
  let payload: { email?: string; source?: string } = {};
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      payload = (await request.json()) as typeof payload;
    } else {
      const form = await request.formData();
      payload.email = String(form.get('email') ?? '');
      const src = form.get('source');
      if (src) payload.source = String(src);
    }
  } catch {
    // generic ok
    return json({ ok: true });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return json({ ok: true });
  }

  const ipHash = await sha256Hex(ip);
  const rl = await checkRateLimit({
    kv: env.RATE_LIMIT,
    bucket: 'newsletter:ip',
    key: ipHash,
    windowSeconds: RATE_WINDOW_SECONDS,
    max: RATE_MAX,
  });
  if (!rl.allowed) {
    return json({ ok: true });
  }

  const email = normaliseEmail(parsed.data.email);
  const source: NewsletterSource = parsed.data.source ?? 'other';

  const db = getDb(env);

  // Upsert by email (idempotent): if the row exists and is still confirmed,
  // we still send a fresh confirm link (harmless), but we don't reset
  // confirmed_at.
  const existing = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(newsletterSubscribers).values({
      email,
      source,
    });
  } else {
    // Touch source if previously 'other' and a more specific one is given.
    if (existing[0]!.source === 'other' && source !== 'other') {
      await db
        .update(newsletterSubscribers)
        .set({ source })
        .where(eq(newsletterSubscribers.email, email));
    }
  }

  // Mint signed confirmation token. Encodes email so the confirm endpoint
  // doesn't need a separate table.
  const secret = env.BOOKING_TOKEN_SECRET;
  if (!secret) {
    console.error('[newsletter] BOOKING_TOKEN_SECRET not set');
    return json({ ok: true });
  }

  const { token } = await mintLookupToken(secret);
  // We bind the token to the email by including it in the URL and verifying
  // it via the email-hash on confirm. We sign a separate HMAC over the
  // email so an attacker can't substitute a different email.
  const emailSig = await hmacHexFromEmail(email, secret);

  const siteUrl = env.PUBLIC_SITE_URL || 'https://kamalaretreats.com';
  const confirmUrl = `${siteUrl.replace(/\/$/, '')}/api/newsletter/confirm?email=${encodeURIComponent(email)}&sig=${emailSig}&t=${token}`;

  try {
    await sendNewsletterConfirmation({ env, to: email, confirmUrl });
  } catch (err) {
    console.error('[newsletter] failed to send confirm email', err);
  }

  return json({ ok: true });
};

async function hmacHexFromEmail(email: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(`newsletter:${email}`)),
  );
  let hex = '';
  for (let i = 0; i < sig.length; i++) hex += sig[i]!.toString(16).padStart(2, '0');
  return hex;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
