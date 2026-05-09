/**
 * Server-side price + inventory calculation.
 *
 * Never trust client-supplied totals. Always recompute from D1 rows:
 *   - room_type unit price (pair vs solo)
 *   - per-person massage add-on (count = guest_count when selected)
 */

import type { AddOn, Occupancy, RoomType } from '../../db/schema';

export interface PriceBreakdown {
  subtotal_pence: number;
  addons_total_pence: number;
  total_pence: number;
  guest_count: number;
  /** Snapshot for `bookings.addons` JSON column. */
  addons_snapshot: Array<{
    add_on_id: number;
    unit_price_pence: number;
    quantity: number;
  }>;
}

export function priceBooking(opts: {
  roomType: Pick<RoomType, 'price_pair_pence' | 'price_solo_pence'>;
  occupancy: Occupancy;
  massageAddOn: AddOn | null;
  selectedMassage: boolean;
}): PriceBreakdown {
  const { roomType, occupancy, massageAddOn, selectedMassage } = opts;

  const guest_count = occupancy === 'pair' ? 2 : 1;
  const subtotal_pence =
    occupancy === 'pair' ? roomType.price_pair_pence : roomType.price_solo_pence;

  const addons_snapshot: PriceBreakdown['addons_snapshot'] = [];
  let addons_total_pence = 0;

  if (selectedMassage && massageAddOn) {
    const quantity = guest_count;
    const unit_price_pence = massageAddOn.unit_price_pence;
    addons_total_pence = unit_price_pence * quantity;
    addons_snapshot.push({
      add_on_id: massageAddOn.id,
      unit_price_pence,
      quantity,
    });
  }

  return {
    subtotal_pence,
    addons_total_pence,
    total_pence: subtotal_pence + addons_total_pence,
    guest_count,
    addons_snapshot,
  };
}
