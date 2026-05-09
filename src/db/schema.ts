/**
 * Drizzle schema for Kamala Retreats — Cloudflare D1 (SQLite dialect).
 *
 * Conventions:
 * - Money is stored as INTEGER pence (GBP only at launch; not VAT-registered).
 * - Timestamps are INTEGER unix seconds via `{ mode: 'timestamp' }`.
 * - Booleans are INTEGER 0/1 via `{ mode: 'boolean' }`.
 * - Free-form structured data (e.g. add-on selections, dietary choices) is stored
 *   as JSON in TEXT columns via `{ mode: 'json' }` with a typed `$type<...>()`.
 * - Sensitive values (lookup tokens, IPs, emails for rate-limit) are stored hashed.
 *
 * Single retreat at v1, but the model supports many.
 */

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ---------- Shared types ----------

export type Occupancy = 'pair' | 'solo';
export type PaymentProvider = 'stripe' | 'paypal';
export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'cancelled';
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled';
export type NewsletterSource =
  | 'footer'
  | 'waitlist'
  | 'booking'
  | 'popup'
  | 'other';

/** Selected add-ons snapshot saved on the booking. */
export type BookingAddonSelection = {
  add_on_id: number;
  /** unit price at time of booking, in pence */
  unit_price_pence: number;
  /** how many units (e.g. 2 = both guests get an in-room massage) */
  quantity: number;
};

/** Dietary / accessibility info captured per booking. */
export type DietaryInfo = {
  vegan?: boolean;
  extra_allergens?: string;
  notes?: string;
};

// ---------- Locations ----------

export const locations = sqliteTable(
  'locations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    /** Short marketing summary. */
    summary: text('summary'),
    country: text('country'),
    region: text('region'),
    /** Full address, may be `null` when `tbc_address = true`. */
    address: text('address'),
    /** True when address should not be revealed publicly yet. */
    tbc_address: integer('tbc_address', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** External Airbnb / venue listing for reference. */
    listing_url: text('listing_url'),
    lat: real('lat'),
    lng: real('lng'),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex('locations_slug_uq').on(t.slug)],
);

// ---------- Retreats ----------

export const retreats = sqliteTable(
  'retreats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    location_id: integer('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    /** Marketing tagline / sub-title. */
    tagline: text('tagline'),
    /** Long-form description (markdown ok). */
    description: text('description'),
    /** Friday check-in (timestamp in venue local time, stored as unix epoch). */
    starts_at: integer('starts_at', { mode: 'timestamp' }).notNull(),
    /** Sunday checkout. */
    ends_at: integer('ends_at', { mode: 'timestamp' }).notNull(),
    /** ISO-3166 / IANA tz, e.g. `Europe/London`. */
    timezone: text('timezone').notNull().default('Europe/London'),
    /** Currency code; locked to GBP for v1. */
    currency: text('currency').notNull().default('GBP'),
    /** Hide from public listings until ready. */
    is_published: integer('is_published', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** When sold out, switches site to waitlist mode. */
    is_sold_out: integer('is_sold_out', { mode: 'boolean' })
      .notNull()
      .default(false),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('retreats_slug_uq').on(t.slug),
    index('retreats_starts_at_idx').on(t.starts_at),
    index('retreats_location_id_idx').on(t.location_id),
  ],
);

// ---------- Room types (per retreat) ----------

export const roomTypes = sqliteTable(
  'room_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    retreat_id: integer('retreat_id')
      .notNull()
      .references(() => retreats.id, { onDelete: 'cascade' }),
    /** e.g. 'standard' | 'premium' | 'master' — unique per retreat. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Price for two guests sharing the room, in pence. */
    price_pair_pence: integer('price_pair_pence').notNull(),
    /** Price for a single guest occupying the room alone, in pence. */
    price_solo_pence: integer('price_solo_pence').notNull(),
    /** Total rooms of this type available for sale. */
    inventory_total: integer('inventory_total').notNull(),
    /** Display ordering for the UI. */
    sort_order: integer('sort_order').notNull().default(0),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('room_types_retreat_code_uq').on(t.retreat_id, t.code),
    index('room_types_retreat_idx').on(t.retreat_id),
  ],
);

// ---------- Add-ons (per retreat) ----------

export const addOns = sqliteTable(
  'add_ons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    retreat_id: integer('retreat_id')
      .notNull()
      .references(() => retreats.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Unit price (per person or per unit), in pence. */
    unit_price_pence: integer('unit_price_pence').notNull(),
    /** When false, hides from booking UI but preserves history. */
    is_active: integer('is_active', { mode: 'boolean' })
      .notNull()
      .default(true),
    sort_order: integer('sort_order').notNull().default(0),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('add_ons_retreat_code_uq').on(t.retreat_id, t.code),
    index('add_ons_retreat_idx').on(t.retreat_id),
  ],
);

// ---------- Practitioners ----------

export const practitioners = sqliteTable(
  'practitioners',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    /** Short bio / blurb. */
    bio: text('bio'),
    /** Speciality, e.g. 'Gong & Kundalini Yoga'. */
    discipline: text('discipline'),
    instagram_url: text('instagram_url'),
    website_url: text('website_url'),
    image_url: text('image_url'),
    /** When practitioner not yet confirmed (e.g. sound healing TBC). */
    is_tbc: integer('is_tbc', { mode: 'boolean' }).notNull().default(false),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex('practitioners_slug_uq').on(t.slug)],
);

// ---------- Retreat <-> Practitioner join ----------

export const retreatPractitioners = sqliteTable(
  'retreat_practitioners',
  {
    retreat_id: integer('retreat_id')
      .notNull()
      .references(() => retreats.id, { onDelete: 'cascade' }),
    practitioner_id: integer('practitioner_id')
      .notNull()
      .references(() => practitioners.id, { onDelete: 'cascade' }),
    /** Optional override / role for this retreat. */
    role: text('role'),
    sort_order: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({
      columns: [t.retreat_id, t.practitioner_id],
      name: 'retreat_practitioners_pk',
    }),
    index('retreat_practitioners_retreat_idx').on(t.retreat_id),
    index('retreat_practitioners_practitioner_idx').on(t.practitioner_id),
  ],
);

// ---------- Bookings ----------

export const bookings = sqliteTable(
  'bookings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 8-char Crockford base32, uppercase, unique. Generated in app code. */
    confirmation_code: text('confirmation_code').notNull(),

    retreat_id: integer('retreat_id')
      .notNull()
      .references(() => retreats.id, { onDelete: 'restrict' }),
    room_type_id: integer('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'restrict' }),

    /** 'pair' = 2 guests sharing, 'solo' = 1 guest sole-occupying. */
    occupancy: text('occupancy').$type<Occupancy>().notNull(),

    /** Number of guests on this booking (1 for solo, 2 for pair). */
    guest_count: integer('guest_count').notNull(),

    /** Lead booker. */
    lead_first_name: text('lead_first_name').notNull(),
    lead_last_name: text('lead_last_name').notNull(),
    lead_email: text('lead_email').notNull(),
    lead_phone: text('lead_phone'),

    /** Second guest, when occupancy = 'pair'. Stored optionally. */
    guest2_first_name: text('guest2_first_name'),
    guest2_last_name: text('guest2_last_name'),
    guest2_email: text('guest2_email'),

    /** Per-guest dietary / accessibility notes (JSON-encoded). */
    dietary_lead: text('dietary_lead', { mode: 'json' }).$type<DietaryInfo>(),
    dietary_guest2: text('dietary_guest2', {
      mode: 'json',
    }).$type<DietaryInfo>(),

    /** Snapshot of selected add-ons + their prices at time of booking. */
    addons: text('addons', { mode: 'json' })
      .$type<BookingAddonSelection[]>()
      .notNull()
      .default(sql`(json_array())`),

    /** Free-form requests / message from booker. */
    notes: text('notes'),

    /** Money breakdown — snapshot, never recomputed. All in pence. */
    subtotal_pence: integer('subtotal_pence').notNull(),
    addons_total_pence: integer('addons_total_pence').notNull().default(0),
    total_pence: integer('total_pence').notNull(),
    currency: text('currency').notNull().default('GBP'),

    /** Booking lifecycle. */
    status: text('status').$type<BookingStatus>().notNull().default('pending'),

    /** Payment metadata. */
    payment_provider: text('payment_provider').$type<PaymentProvider>(),
    payment_status: text('payment_status')
      .$type<PaymentStatus>()
      .notNull()
      .default('pending'),
    /** Stripe PaymentIntent id or PayPal order id. */
    payment_reference: text('payment_reference'),
    paid_at: integer('paid_at', { mode: 'timestamp' }),

    /** Marketing opt-in captured at booking. */
    marketing_opt_in: integer('marketing_opt_in', { mode: 'boolean' })
      .notNull()
      .default(false),

    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('bookings_confirmation_code_uq').on(t.confirmation_code),
    index('bookings_retreat_idx').on(t.retreat_id),
    index('bookings_room_type_idx').on(t.room_type_id),
    index('bookings_lead_email_idx').on(t.lead_email),
    index('bookings_status_idx').on(t.status),
  ],
);

// ---------- Booking holds (10-min inventory hold during checkout) ----------

export const bookingHolds = sqliteTable(
  'booking_holds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Opaque hold token (uuid). */
    hold_token: text('hold_token').notNull(),
    retreat_id: integer('retreat_id')
      .notNull()
      .references(() => retreats.id, { onDelete: 'cascade' }),
    room_type_id: integer('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'cascade' }),
    occupancy: text('occupancy').$type<Occupancy>().notNull(),
    /** Hashed email of the prospective booker. */
    email_hash: text('email_hash'),
    /** Expires 10 min after creation. Cleaner job/query filters expired rows. */
    expires_at: integer('expires_at', { mode: 'timestamp' }).notNull(),
    /** Set when hold has been consumed by a successful booking. */
    consumed_at: integer('consumed_at', { mode: 'timestamp' }),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('booking_holds_token_uq').on(t.hold_token),
    index('booking_holds_room_type_idx').on(t.room_type_id),
    index('booking_holds_expires_at_idx').on(t.expires_at),
  ],
);

// ---------- Booking lookup tokens (passwordless airline-style flow) ----------

export const bookingLookupTokens = sqliteTable(
  'booking_lookup_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    booking_id: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    /** Hashed token (e.g. SHA-256). The plaintext is mailed to the user once. */
    token_hash: text('token_hash').notNull(),
    /** Short TTL (e.g. 30 min) — single-use. */
    expires_at: integer('expires_at', { mode: 'timestamp' }).notNull(),
    /** Marked when the token has been redeemed (one-shot). */
    consumed_at: integer('consumed_at', { mode: 'timestamp' }),
    /** IP that requested the token (hashed). */
    requested_ip_hash: text('requested_ip_hash'),
    /** IP that consumed the token (hashed). */
    consumed_ip_hash: text('consumed_ip_hash'),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('booking_lookup_tokens_hash_uq').on(t.token_hash),
    index('booking_lookup_tokens_booking_idx').on(t.booking_id),
    index('booking_lookup_tokens_expires_at_idx').on(t.expires_at),
  ],
);

// ---------- Booking lookup attempts (rate limiting) ----------

export const bookingLookupAttempts = sqliteTable(
  'booking_lookup_attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** SHA-256 of normalised email. */
    email_hash: text('email_hash').notNull(),
    /** SHA-256 of requesting IP. */
    ip_hash: text('ip_hash').notNull(),
    /** Whether the (email + code) combo matched a real booking. */
    success: integer('success', { mode: 'boolean' }).notNull().default(false),
    /** Optional User-Agent string for forensics. */
    user_agent: text('user_agent'),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('booking_lookup_attempts_email_hash_idx').on(t.email_hash),
    index('booking_lookup_attempts_ip_hash_idx').on(t.ip_hash),
    index('booking_lookup_attempts_created_at_idx').on(t.created_at),
  ],
);

// ---------- Waitlist ----------

export const waitlistEntries = sqliteTable(
  'waitlist_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    retreat_id: integer('retreat_id')
      .notNull()
      .references(() => retreats.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    first_name: text('first_name'),
    last_name: text('last_name'),
    /** Preferred room type if any. */
    room_type_id_pref: integer('room_type_id_pref').references(
      () => roomTypes.id,
      { onDelete: 'set null' },
    ),
    occupancy_pref: text('occupancy_pref').$type<Occupancy>(),
    /** Free-form note from prospect. */
    notes: text('notes'),
    /** Set when the prospect has been contacted with availability. */
    notified_at: integer('notified_at', { mode: 'timestamp' }),
    /** Set when the prospect has converted into a booking. */
    converted_booking_id: integer('converted_booking_id').references(
      () => bookings.id,
      { onDelete: 'set null' },
    ),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('waitlist_retreat_email_uq').on(t.retreat_id, t.email),
    index('waitlist_retreat_idx').on(t.retreat_id),
    index('waitlist_email_idx').on(t.email),
  ],
);

// ---------- Newsletter subscribers ----------

export const newsletterSubscribers = sqliteTable(
  'newsletter_subscribers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    /** Where this email came from. */
    source: text('source').$type<NewsletterSource>().notNull().default('other'),
    /** Marketing consent confirmed (double opt-in). */
    confirmed_at: integer('confirmed_at', { mode: 'timestamp' }),
    /** When the subscriber unsubscribed (kept for suppression list). */
    unsubscribed_at: integer('unsubscribed_at', { mode: 'timestamp' }),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('newsletter_email_uq').on(t.email),
    index('newsletter_source_idx').on(t.source),
  ],
);

// ---------- Type helpers ----------

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Retreat = typeof retreats.$inferSelect;
export type NewRetreat = typeof retreats.$inferInsert;
export type RoomType = typeof roomTypes.$inferSelect;
export type NewRoomType = typeof roomTypes.$inferInsert;
export type AddOn = typeof addOns.$inferSelect;
export type NewAddOn = typeof addOns.$inferInsert;
export type Practitioner = typeof practitioners.$inferSelect;
export type NewPractitioner = typeof practitioners.$inferInsert;
export type RetreatPractitioner = typeof retreatPractitioners.$inferSelect;
export type NewRetreatPractitioner = typeof retreatPractitioners.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingHold = typeof bookingHolds.$inferSelect;
export type NewBookingHold = typeof bookingHolds.$inferInsert;
export type BookingLookupToken = typeof bookingLookupTokens.$inferSelect;
export type NewBookingLookupToken = typeof bookingLookupTokens.$inferInsert;
export type BookingLookupAttempt = typeof bookingLookupAttempts.$inferSelect;
export type NewBookingLookupAttempt =
  typeof bookingLookupAttempts.$inferInsert;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type NewNewsletterSubscriber =
  typeof newsletterSubscribers.$inferInsert;
