/**
 * Inventory accounting for room types.
 *
 * A room is "taken" when:
 *   - a paid/confirmed booking holds it, OR
 *   - a non-expired, non-consumed booking_hold holds it.
 *
 * Returns the number of rooms still available for sale.
 */

import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { bookingHolds, bookings, roomTypes } from '../../db/schema';
import type { Db } from '../../db/client';

export async function countAvailableForRoomType(
  db: Db,
  roomTypeId: number,
): Promise<{ inventory_total: number; available: number }> {
  const rt = await db
    .select({ inventory_total: roomTypes.inventory_total })
    .from(roomTypes)
    .where(eq(roomTypes.id, roomTypeId))
    .limit(1);
  if (rt.length === 0) return { inventory_total: 0, available: 0 };

  const inventory_total = rt[0].inventory_total;

  const paidCountRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.room_type_id, roomTypeId),
        sql`(${bookings.payment_status} = 'paid' OR ${bookings.status} = 'confirmed')`,
      ),
    );
  const paidCount = Number(paidCountRow[0]?.n ?? 0);

  const now = new Date();
  const holdCountRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(bookingHolds)
    .where(
      and(
        eq(bookingHolds.room_type_id, roomTypeId),
        gt(bookingHolds.expires_at, now),
        isNull(bookingHolds.consumed_at),
      ),
    );
  const holdCount = Number(holdCountRow[0]?.n ?? 0);

  return {
    inventory_total,
    available: Math.max(0, inventory_total - paidCount - holdCount),
  };
}
