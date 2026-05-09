/**
 * Zod schemas for the booking flow.
 *
 * The shape mirrors what the client form posts to /api/booking/create.
 * Server always recomputes totals from the DB — `total_pence` from the client
 * is treated as a sanity check, not a source of truth.
 */

import { z } from 'zod';

const trimmed = (max = 200) =>
  z
    .string()
    .trim()
    .max(max);

const optionalTrimmed = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const dietarySchema = z
  .object({
    vegan: z.boolean().optional(),
    extra_allergens: optionalTrimmed(500),
    notes: optionalTrimmed(1000),
  })
  .optional();

export const guestSchema = z.object({
  first_name: trimmed(80).min(1, 'First name is required'),
  last_name: trimmed(80).min(1, 'Last name is required'),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional()
    .or(z.literal('').transform(() => undefined)),
  dietary: dietarySchema,
});

export const createBookingSchema = z.object({
  retreat_slug: trimmed(120).min(1),
  room_type_id: z.coerce.number().int().positive(),
  occupancy: z.enum(['pair', 'solo']),

  lead: guestSchema.extend({
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
    phone: optionalTrimmed(40),
  }),
  guest2: guestSchema.optional(),

  emergency_contact_name: optionalTrimmed(120),
  emergency_contact_phone: optionalTrimmed(40),

  /** ID of the in-room massage add-on, if any. Server validates. */
  addon_massage: z.boolean().optional().default(false),

  hear_about_us: optionalTrimmed(200),

  /** Required acknowledgement of the no-refunds policy. */
  terms_accepted: z
    .boolean()
    .refine((v) => v === true, {
      message: 'You must accept the terms to continue',
    }),

  marketing_opt_in: z.boolean().optional().default(false),

  /** Client-rendered total in pence — server recomputes and rejects mismatch. */
  client_total_pence: z.coerce.number().int().nonnegative().optional(),

  /** 'stripe' | 'paypal' */
  provider: z.enum(['stripe', 'paypal']),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
