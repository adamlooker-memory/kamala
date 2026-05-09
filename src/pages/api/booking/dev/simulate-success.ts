/**
 * POST /api/booking/dev/simulate-success?code=XXXXXXXX
 *
 * Dev-only endpoint that mimics what a real Stripe / PayPal webhook would do
 * after a successful payment: marks the booking paid, consumes the hold, and
 * fires the confirmation email stub.
 *
 * Guard: returns 404 outside of dev so it can never run in production.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { getDb } from '../../../../db/client';
import { isValidBookingCode, normaliseBookingCode } from '../../../../db/codes';
import { finaliseBookingByCode } from '../../../../lib/booking/finalise';

export const prerender = false;

function isDev(): boolean {
  return import.meta.env.DEV === true || import.meta.env.MODE !== 'production';
}

export const POST: APIRoute = async ({ url }) => {
  if (!isDev()) {
    return new Response('Not found', { status: 404 });
  }

  const code = normaliseBookingCode(url.searchParams.get('code') ?? '');
  if (!isValidBookingCode(code)) {
    return new Response(JSON.stringify({ error: 'Invalid code' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDb(env);
  const result = await finaliseBookingByCode(db, { code, env });

  if (!result.ok) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, alreadyPaid: result.alreadyPaid === true }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
};
