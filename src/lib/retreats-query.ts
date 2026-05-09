/**
 * Query helpers used by the retreats listing + detail pages.
 *
 * Note on schema vs. spec:
 * - The brief mentions a `retreats.status` enum and a `retreats.summary`
 *   column. The current Drizzle schema instead exposes `is_published` and
 *   `is_sold_out` booleans, plus `tagline` / `description`. We adapt:
 *   - Public listings: `is_published = 1`. (Drafts are unpublished.)
 *   - "Past" filter: `ends_at < now`.
 *   - Lead price = min over room_types per retreat.
 *   - Inventory remaining = inventory_total - count(bookings.status = 'confirmed' or paid).
 * - Bookings have both a lifecycle `status` and a `payment_status`. We treat
 *   a room as occupied when `payment_status = 'paid'` OR `status = 'confirmed'`.
 */

import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import {
  addOns,
  bookings,
  locations,
  practitioners,
  retreats,
  retreatPractitioners,
  roomTypes,
  type AddOn,
  type Location,
  type Practitioner,
  type Retreat,
  type RoomType,
} from '../db/schema';
import type { Db } from '../db/client';

export type RetreatListItem = {
  retreat: Retreat;
  location: Location;
  /** Lowest pence price across all room types (pair or solo, whichever cheapest). */
  lead_price_pence: number | null;
  /** Total rooms left across all room types. */
  rooms_remaining: number;
  /** Convenience: is the whole retreat sold out (flag OR computed). */
  is_sold_out: boolean;
};

export type RoomTypeWithInventory = RoomType & {
  /** Rooms remaining = inventory_total - bookings paid/confirmed. */
  remaining: number;
};

export type RetreatDetail = {
  retreat: Retreat;
  location: Location;
  room_types: RoomTypeWithInventory[];
  add_ons: AddOn[];
  practitioners: (Practitioner & { role: string | null })[];
};

/**
 * List all publicly-visible retreats (published, not in the past) with
 * everything the listing page needs.
 */
export async function listPublicRetreats(db: Db): Promise<RetreatListItem[]> {
  const now = new Date();

  const rows = await db
    .select({ retreat: retreats, location: locations })
    .from(retreats)
    .innerJoin(locations, eq(retreats.location_id, locations.id))
    .where(and(eq(retreats.is_published, true), gte(retreats.ends_at, now)))
    .orderBy(asc(retreats.starts_at));

  if (rows.length === 0) return [];

  const retreatIds = rows.map((r) => r.retreat.id);

  // Pull all room types for these retreats in one go.
  const allRoomTypes = await db
    .select()
    .from(roomTypes)
    .where(inArray(roomTypes.retreat_id, retreatIds));

  // Pull booking counts per room type (treat paid OR confirmed as occupied).
  const bookingCounts = await db
    .select({
      room_type_id: bookings.room_type_id,
      occupied: sql<number>`count(*)`.as('occupied'),
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.room_type_id, allRoomTypes.map((rt) => rt.id).length
          ? allRoomTypes.map((rt) => rt.id)
          : [-1]),
        sql`(${bookings.payment_status} = 'paid' OR ${bookings.status} = 'confirmed')`,
      ),
    )
    .groupBy(bookings.room_type_id);

  const occupiedByRoomType = new Map<number, number>();
  for (const r of bookingCounts) {
    occupiedByRoomType.set(r.room_type_id, Number(r.occupied) || 0);
  }

  const result: RetreatListItem[] = rows.map(({ retreat, location }) => {
    const rts = allRoomTypes.filter((rt) => rt.retreat_id === retreat.id);

    let leadPrice: number | null = null;
    let remaining = 0;
    for (const rt of rts) {
      const occupied = occupiedByRoomType.get(rt.id) ?? 0;
      const left = Math.max(0, rt.inventory_total - occupied);
      remaining += left;
      const cheap = Math.min(rt.price_pair_pence, rt.price_solo_pence);
      if (leadPrice === null || cheap < leadPrice) leadPrice = cheap;
    }

    return {
      retreat,
      location,
      lead_price_pence: leadPrice,
      rooms_remaining: remaining,
      is_sold_out: retreat.is_sold_out || remaining === 0,
    };
  });

  return result;
}

/** Retreat detail by slug; returns null if missing or not visible. */
export async function getRetreatBySlug(
  db: Db,
  slug: string,
): Promise<RetreatDetail | null> {
  const head = await db
    .select({ retreat: retreats, location: locations })
    .from(retreats)
    .innerJoin(locations, eq(retreats.location_id, locations.id))
    .where(eq(retreats.slug, slug))
    .limit(1);

  if (head.length === 0) return null;
  const { retreat, location } = head[0];
  if (!retreat.is_published) return null;

  const rts = await db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.retreat_id, retreat.id))
    .orderBy(asc(roomTypes.sort_order));

  const addons = await db
    .select()
    .from(addOns)
    .where(and(eq(addOns.retreat_id, retreat.id), eq(addOns.is_active, true)))
    .orderBy(asc(addOns.sort_order));

  const pracJoin = await db
    .select({
      practitioner: practitioners,
      role: retreatPractitioners.role,
      sort_order: retreatPractitioners.sort_order,
    })
    .from(retreatPractitioners)
    .innerJoin(
      practitioners,
      eq(retreatPractitioners.practitioner_id, practitioners.id),
    )
    .where(eq(retreatPractitioners.retreat_id, retreat.id))
    .orderBy(asc(retreatPractitioners.sort_order));

  // Booking counts per room type for this retreat.
  let occupiedByRoomType = new Map<number, number>();
  if (rts.length > 0) {
    const counts = await db
      .select({
        room_type_id: bookings.room_type_id,
        occupied: sql<number>`count(*)`.as('occupied'),
      })
      .from(bookings)
      .where(
        and(
          inArray(
            bookings.room_type_id,
            rts.map((rt) => rt.id),
          ),
          sql`(${bookings.payment_status} = 'paid' OR ${bookings.status} = 'confirmed')`,
        ),
      )
      .groupBy(bookings.room_type_id);
    occupiedByRoomType = new Map(
      counts.map((c) => [c.room_type_id, Number(c.occupied) || 0]),
    );
  }

  const room_types: RoomTypeWithInventory[] = rts.map((rt) => ({
    ...rt,
    remaining: Math.max(
      0,
      rt.inventory_total - (occupiedByRoomType.get(rt.id) ?? 0),
    ),
  }));

  return {
    retreat,
    location,
    room_types,
    add_ons: addons,
    practitioners: pracJoin.map((p) => ({ ...p.practitioner, role: p.role })),
  };
}

// Re-export `lt` so the page can compute "past" if needed in future.
export { lt };
