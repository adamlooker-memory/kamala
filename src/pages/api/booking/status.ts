/**
 * GET /api/booking/status?code=XXXXXXXX
 *
 * Used by the confirmation page to poll for payment completion.
 * Cache-Control: no-store.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';

import { getDb } from '../../../db/client';
import { bookings } from '../../../db/schema';
import { isValidBookingCode, normaliseBookingCode } from '../../../db/codes';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const raw = url.searchParams.get('code') ?? '';
  const code = normaliseBookingCode(raw);

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  if (!isValidBookingCode(code)) {
    return new Response(JSON.stringify({ error: 'Invalid code' }), {
      status: 400,
      headers,
    });
  }

  const db = getDb(env);
  const row = await db
    .select({
      status: bookings.status,
      payment_status: bookings.payment_status,
    })
    .from(bookings)
    .where(eq(bookings.confirmation_code, code))
    .limit(1);

  if (row.length === 0) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers,
    });
  }

  return new Response(
    JSON.stringify({
      status: row[0].status,
      payment_status: row[0].payment_status,
    }),
    { status: 200, headers },
  );
};
