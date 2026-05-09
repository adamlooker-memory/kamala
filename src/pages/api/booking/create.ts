/**
 * POST /api/booking/create
 *
 * Body: see `createBookingSchema`.
 * Headers: optional `Idempotency-Key` (cached for 24h via RATE_LIMIT KV).
 *
 * Flow:
 *   1. Validate input.
 *   2. Look up retreat + room_type. Verify retreat published & not in past.
 *   3. Recompute totals. If client passed a different total, fail.
 *   4. Verify inventory.
 *   5. Place 10-minute hold.
 *   6. Insert booking with retry-on-collision for confirmation_code.
 *   7. Call PaymentProvider.createCheckout.
 *   8. Return { checkoutUrl, code }.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';

import { getDb } from '../../../db/client';
import {
  addOns,
  bookingHolds,
  bookings,
  retreats,
  roomTypes,
} from '../../../db/schema';
import { generateBookingCode } from '../../../db/codes';
import { createBookingSchema } from '../../../lib/booking/schema';
import { countAvailableForRoomType } from '../../../lib/booking/inventory';
import { priceBooking } from '../../../lib/booking/pricing';
import { getProvider } from '../../../lib/payments';

export const prerender = false;

const HOLD_TTL_MS = 10 * 60 * 1000; // 10 minutes
const IDEMPOTENCY_TTL_S = 24 * 60 * 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(msg);
}

function uuid(): string {
  // Workers / modern runtimes expose crypto.randomUUID.
  return crypto.randomUUID();
}

export const POST: APIRoute = async ({ request, url }) => {
  const db = getDb(env);

  // ---- Idempotency check ----
  const idemKey = request.headers.get('Idempotency-Key');
  const kvKey = idemKey ? `idem:${idemKey}` : null;
  if (kvKey && env.RATE_LIMIT) {
    try {
      const cached = await env.RATE_LIMIT.get(kvKey);
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Idempotent-Replay': '1',
          },
        });
      }
    } catch {
      // KV unavailable in some local setups — degrade gracefully.
    }
  }

  // ---- Parse + validate ----
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: 'Validation failed',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      400,
    );
  }
  const input = parsed.data;

  // ---- Retreat + room type ----
  const retreatRow = await db
    .select()
    .from(retreats)
    .where(eq(retreats.slug, input.retreat_slug))
    .limit(1);
  if (retreatRow.length === 0) {
    return json({ error: 'Retreat not found' }, 404);
  }
  const retreat = retreatRow[0];
  if (!retreat.is_published) {
    return json({ error: 'Retreat is not open for booking' }, 409);
  }
  if (retreat.is_sold_out) {
    return json({ error: 'Retreat is sold out' }, 409);
  }
  if (retreat.ends_at.getTime() < Date.now()) {
    return json({ error: 'Retreat has already ended' }, 409);
  }

  const rtRow = await db
    .select()
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.id, input.room_type_id),
        eq(roomTypes.retreat_id, retreat.id),
      ),
    )
    .limit(1);
  if (rtRow.length === 0) {
    return json({ error: 'Room type not available for this retreat' }, 400);
  }
  const roomType = rtRow[0];

  // ---- Add-on (in-room massage) ----
  let massageAddOn = null;
  if (input.addon_massage) {
    const addonRow = await db
      .select()
      .from(addOns)
      .where(
        and(
          eq(addOns.retreat_id, retreat.id),
          eq(addOns.code, 'in_room_massage'),
          eq(addOns.is_active, true),
        ),
      )
      .limit(1);
    if (addonRow.length === 0) {
      return json(
        { error: 'In-room massage is not available for this retreat' },
        400,
      );
    }
    massageAddOn = addonRow[0];
  }

  // ---- Server-side pricing ----
  const price = priceBooking({
    roomType,
    occupancy: input.occupancy,
    massageAddOn,
    selectedMassage: input.addon_massage === true,
  });

  if (
    typeof input.client_total_pence === 'number' &&
    input.client_total_pence !== price.total_pence
  ) {
    return json(
      {
        error: 'Pricing mismatch — please refresh and try again',
        server_total_pence: price.total_pence,
      },
      409,
    );
  }

  // ---- Pair guest validation ----
  if (input.occupancy === 'pair') {
    if (!input.guest2 || !input.guest2.first_name || !input.guest2.last_name) {
      return json({ error: 'A second guest is required for pair bookings' }, 400);
    }
  }

  // ---- Inventory check ----
  const availability = await countAvailableForRoomType(db, roomType.id);
  if (availability.available < 1) {
    return json(
      { error: 'This room type has just sold out — please pick another' },
      409,
    );
  }

  // ---- 10-minute hold ----
  const holdToken = uuid();
  const holdExpiresAt = new Date(Date.now() + HOLD_TTL_MS);
  await db.insert(bookingHolds).values({
    hold_token: holdToken,
    retreat_id: retreat.id,
    room_type_id: roomType.id,
    occupancy: input.occupancy,
    expires_at: holdExpiresAt,
  });

  // ---- Insert booking with code retry ----
  let bookingId: number | null = null;
  let confirmationCode: string | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateBookingCode();
    try {
      const inserted = await db
        .insert(bookings)
        .values({
          confirmation_code: code,
          retreat_id: retreat.id,
          room_type_id: roomType.id,
          occupancy: input.occupancy,
          guest_count: price.guest_count,
          lead_first_name: input.lead.first_name,
          lead_last_name: input.lead.last_name,
          lead_email: input.lead.email,
          lead_phone: input.lead.phone ?? null,
          guest2_first_name: input.guest2?.first_name ?? null,
          guest2_last_name: input.guest2?.last_name ?? null,
          guest2_email: input.guest2?.email ?? null,
          dietary_lead: input.lead.dietary ?? null,
          dietary_guest2: input.guest2?.dietary ?? null,
          addons: price.addons_snapshot,
          notes: [
            input.emergency_contact_name &&
              `Emergency contact: ${input.emergency_contact_name}`,
            input.emergency_contact_phone &&
              `Emergency phone: ${input.emergency_contact_phone}`,
            input.hear_about_us && `Heard about us: ${input.hear_about_us}`,
          ]
            .filter(Boolean)
            .join('\n') || null,
          subtotal_pence: price.subtotal_pence,
          addons_total_pence: price.addons_total_pence,
          total_pence: price.total_pence,
          currency: 'GBP',
          status: 'pending',
          payment_provider: input.provider,
          payment_status: 'pending',
          payment_reference: null,
          marketing_opt_in: input.marketing_opt_in === true,
        })
        .returning({ id: bookings.id });
      bookingId = inserted[0]?.id ?? null;
      confirmationCode = code;
      break;
    } catch (err) {
      if (isUniqueConstraintError(err)) continue;
      throw err;
    }
  }

  if (!bookingId || !confirmationCode) {
    return json(
      { error: 'Could not allocate a booking code, please try again' },
      500,
    );
  }

  // ---- Create checkout session ----
  const provider = getProvider(input.provider);
  const baseUrl = env.PUBLIC_SITE_URL || `${url.protocol}//${url.host}`;
  const successUrl = `${baseUrl}/book/confirmation/${confirmationCode}`;
  const cancelUrl = `${baseUrl}/book/${retreat.slug}?cancelled=1`;

  let checkout;
  try {
    checkout = await provider.createCheckout(
      {
        bookingId: String(bookingId),
        code: confirmationCode,
        amountPence: price.total_pence,
        currency: 'GBP',
        leadEmail: input.lead.email,
        successUrl,
        cancelUrl,
        description: `Kamala Retreats — ${retreat.name}`,
      },
      env,
    );
  } catch (err) {
    console.error('[booking/create] provider failure', err);
    return json(
      { error: 'Could not start payment, please try again in a moment' },
      502,
    );
  }

  // Stash the provider session id on the booking.
  await db
    .update(bookings)
    .set({
      payment_reference: checkout.providerSessionId,
      updated_at: new Date(),
    })
    .where(eq(bookings.id, bookingId));

  const responseBody = JSON.stringify({
    checkoutUrl: checkout.checkoutUrl,
    code: confirmationCode,
  });

  if (kvKey && env.RATE_LIMIT) {
    try {
      await env.RATE_LIMIT.put(kvKey, responseBody, {
        expirationTtl: IDEMPOTENCY_TTL_S,
      });
    } catch {
      // best-effort
    }
  }

  return new Response(responseBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
