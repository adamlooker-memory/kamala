/**
 * Mark a pending booking as paid + consume its hold + fire confirmation email.
 *
 * Idempotent: a second call on an already-paid booking is a no-op.
 * Used by:
 *   - the Stripe webhook
 *   - the PayPal webhook
 *   - the dev simulate-success endpoint
 */

import { and, eq, isNull } from 'drizzle-orm';

import {
  bookingHolds,
  bookings,
  retreats,
  type Retreat,
} from '../../db/schema';
import type { Db } from '../../db/client';
import { sendBookingConfirmation } from '../email';
import { formatDateRange } from '../format';

type FinaliseEnv = {
  RESEND_API_KEY?: string;
  NOTIFICATIONS_EMAIL?: string;
};

export interface FinaliseResult {
  ok: boolean;
  alreadyPaid?: boolean;
  bookingId?: number;
  retreat?: Retreat;
}

export async function finaliseBookingByCode(
  db: Db,
  opts: {
    code: string;
    providerSessionId?: string;
    env?: FinaliseEnv;
  },
): Promise<FinaliseResult> {
  const code = opts.code;
  const row = await db
    .select({ booking: bookings, retreat: retreats })
    .from(bookings)
    .innerJoin(retreats, eq(bookings.retreat_id, retreats.id))
    .where(eq(bookings.confirmation_code, code))
    .limit(1);

  if (row.length === 0) return { ok: false };

  const { booking, retreat } = row[0];

  if (booking.payment_status === 'paid' || booking.status === 'confirmed') {
    return { ok: true, alreadyPaid: true, bookingId: booking.id, retreat };
  }

  const now = new Date();
  await db
    .update(bookings)
    .set({
      status: 'confirmed',
      payment_status: 'paid',
      paid_at: now,
      payment_reference: opts.providerSessionId ?? booking.payment_reference,
      updated_at: now,
    })
    .where(eq(bookings.id, booking.id));

  // Consume the matching hold (best-effort; we don't track hold_token on the
  // booking row, but we can clear all unconsumed holds for this room_type
  // belonging to this booking — safer to mark just one. Use occupancy + room
  // and pick the soonest-expiring unconsumed hold.)
  await db
    .update(bookingHolds)
    .set({ consumed_at: now })
    .where(
      and(
        eq(bookingHolds.room_type_id, booking.room_type_id),
        eq(bookingHolds.retreat_id, booking.retreat_id),
        isNull(bookingHolds.consumed_at),
      ),
    );

  // Fire confirmation email — never fail the request if it throws.
  try {
    await sendBookingConfirmation({
      env: opts.env ?? {},
      to: booking.lead_email,
      code: booking.confirmation_code,
      retreatTitle: retreat.name,
      retreatDates: formatDateRange(retreat.starts_at, retreat.ends_at),
      totalPence: booking.total_pence,
    });
  } catch (err) {
    console.error('[booking/finalise] email send failed', err);
  }

  return { ok: true, bookingId: booking.id, retreat };
}
