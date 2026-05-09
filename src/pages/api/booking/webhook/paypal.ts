/**
 * POST /api/booking/webhook/paypal
 *
 * Verifies the PayPal webhook (TODO: real signature verification) and on a
 * payment-capture-complete event marks the matching booking paid.
 *
 * The booking code is carried on `purchase_units[0].reference_id`.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';

import { getDb } from '../../../../db/client';
import { bookings } from '../../../../db/schema';
import { PayPalProvider } from '../../../../lib/payments/paypal';
import { finaliseBookingByCode } from '../../../../lib/booking/finalise';

export const prerender = false;

const CAPTURE_EVENTS = new Set([
  'PAYMENT.CAPTURE.COMPLETED',
  'CHECKOUT.ORDER.APPROVED',
  'CHECKOUT.ORDER.COMPLETED',
]);

export const POST: APIRoute = async ({ request }) => {
  const verified = await PayPalProvider.verifyWebhook(request.clone(), env);
  if (!verified) {
    return new Response('Invalid signature', { status: 400 });
  }

  if (!CAPTURE_EVENTS.has(verified.event)) {
    return new Response('ok', { status: 200 });
  }

  let code: string | null = null;
  try {
    const body = (await request.clone().json()) as {
      resource?: {
        id?: string;
        purchase_units?: Array<{ reference_id?: string }>;
        supplementary_data?: { related_ids?: { order_id?: string } };
      };
    };
    code = body?.resource?.purchase_units?.[0]?.reference_id ?? null;
  } catch {
    // ignore
  }

  if (!code && verified.providerSessionId) {
    const db = getDb(env);
    const row = await db
      .select({ confirmation_code: bookings.confirmation_code })
      .from(bookings)
      .where(eq(bookings.payment_reference, verified.providerSessionId))
      .limit(1);
    code = row[0]?.confirmation_code ?? null;
  }

  if (!code) {
    return new Response('No booking found for event', { status: 200 });
  }

  const db = getDb(env);
  await finaliseBookingByCode(db, {
    code,
    providerSessionId: verified.providerSessionId,
    env,
  });

  return new Response('ok', { status: 200 });
};
