/**
 * POST /api/booking/webhook/stripe
 *
 * Verifies the Stripe signature (real implementation TODO; signature
 * verification stubbed in dev) and on `checkout.session.completed` marks the
 * matching booking paid + fires the confirmation email.
 *
 * The `client_reference_id` carried on the Checkout session is the booking
 * confirmation code — that's how we link the event back to a booking.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';

import { getDb } from '../../../../db/client';
import { bookings } from '../../../../db/schema';
import { StripeProvider } from '../../../../lib/payments/stripe';
import { finaliseBookingByCode } from '../../../../lib/booking/finalise';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const verified = await StripeProvider.verifyWebhook(request.clone(), env);
  if (!verified) {
    return new Response('Invalid signature', { status: 400 });
  }

  if (verified.event !== 'checkout.session.completed') {
    // Acknowledge other events without action.
    return new Response('ok', { status: 200 });
  }

  // Try to read the booking code from the body. Stripe puts it on
  // `data.object.client_reference_id`. We re-parse a clone of the body.
  let code: string | null = null;
  try {
    const body = (await request.clone().json()) as {
      data?: {
        object?: {
          client_reference_id?: string;
          metadata?: { booking_code?: string };
        };
      };
    };
    code =
      body?.data?.object?.client_reference_id ??
      body?.data?.object?.metadata?.booking_code ??
      null;
  } catch {
    // ignore
  }

  // Fall back: look up by payment_reference (Stripe session id).
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
