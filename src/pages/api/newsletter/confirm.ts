/**
 * GET /api/newsletter/confirm?email=...&sig=...&t=...
 *
 * Verifies the email-bound HMAC signature, marks the subscriber confirmed,
 * and returns a small inline thank-you page. Returns the same friendly
 * message whether the email was already confirmed or not — but if the sig
 * is wrong, returns a generic error page (and a 400 status).
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import { newsletterSubscribers } from '../../../db/schema';
import { normaliseEmail, timingSafeEqual } from '../../../lib/booking/lookup';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const email = normaliseEmail(url.searchParams.get('email') ?? '');
  const sig = (url.searchParams.get('sig') ?? '').trim();
  const secret = env.BOOKING_TOKEN_SECRET;

  if (!email || !sig || !secret) {
    return htmlPage(
      'This link is incomplete',
      "We couldn't read the confirmation link. Please try again from the most recent email.",
      400,
    );
  }

  const expected = await hmacHexFromEmail(email, secret);
  if (!timingSafeEqual(sig, expected)) {
    return htmlPage(
      'This link is invalid',
      "We couldn't verify this confirmation. If you've subscribed more than once, please use the most recent email.",
      400,
    );
  }

  const db = getDb(env);
  const rows = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email))
    .limit(1);

  if (rows.length === 0) {
    return htmlPage(
      "You're not on the list yet",
      "We don't have a record of that email. Try subscribing again from kamalaretreats.com.",
      404,
    );
  }

  const row = rows[0]!;
  if (!row.confirmed_at) {
    await db
      .update(newsletterSubscribers)
      .set({ confirmed_at: new Date(), unsubscribed_at: null })
      .where(eq(newsletterSubscribers.email, email));
  }

  return htmlPage(
    "You're on the list.",
    "Thank you. A quiet letter, once a month — that's the deal. You can leave any time, and we'll never share your address.",
    200,
  );
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
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(`newsletter:${email}`)),
  );
  let hex = '';
  for (let i = 0; i < sigBytes.length; i++) {
    hex += sigBytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function htmlPage(title: string, message: string, status: number): Response {
  const body = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escape(title)} — Kamala Retreats</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100svh; display: grid; place-items: center; background: #f9f3f1; color: #2a2622; font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; padding: 2rem; }
  main { max-width: 32rem; text-align: center; }
  .eyebrow { font-size: 0.75rem; letter-spacing: 0.32em; text-transform: uppercase; color: #97742d; margin: 0 0 1rem 0; }
  h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; font-size: 2.25rem; margin: 0 0 1rem 0; line-height: 1.1; }
  p { color: #5a5048; line-height: 1.6; font-size: 1.0625rem; margin: 0 0 1.5rem 0; }
  a { color: #97742d; }
  .btn { display: inline-block; margin-top: 0.5rem; background: #2a2622; color: #f9f3f1; padding: 0.9rem 1.6rem; font-size: 0.75rem; letter-spacing: 0.18em; text-transform: uppercase; text-decoration: none; border-radius: 0.5rem; }
  .btn:hover { background: #745828; }
</style>
</head>
<body>
  <main>
    <p class="eyebrow">Kamala Retreats</p>
    <h1>${escape(title)}</h1>
    <p>${escape(message)}</p>
    <a class="btn" href="/">Back to Kamala</a>
  </main>
</body>
</html>`;
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
