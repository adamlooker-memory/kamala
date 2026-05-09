# Database — Cloudflare D1 + Drizzle ORM

The Kamala site uses **Cloudflare D1** (SQLite at the edge) accessed via
**Drizzle ORM**. Schema lives in `src/db/schema.ts`, the request-scoped
client lives in `src/db/client.ts`, and migrations are written to `drizzle/`
by `drizzle-kit`.

> The Cloudflare adapter for Astro is configured separately. This doc
> assumes `locals.runtime.env.DB` will be available in endpoints once the
> adapter task lands.

---

## 1. One-time: create the D1 database

```sh
# Authenticates with Cloudflare if needed.
npx wrangler login

# Creates the D1 database. Take note of the printed `database_id`.
npx wrangler d1 create kamala
```

Copy the printed binding block into `wrangler.toml` (the Cloudflare adapter
task will create / own this file). It will look like:

```toml
[[d1_databases]]
binding       = "DB"            # must be "DB" — `getDb` reads env.DB
database_name = "kamala"
database_id   = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

If `astro.config.mjs` uses the Cloudflare adapter with platformProxy, the
binding will surface as `Astro.locals.runtime.env.DB` in routes/actions.

---

## 2. Apply the schema migration

Migrations are generated from `src/db/schema.ts` into `drizzle/`. To
regenerate after a schema edit:

```sh
npx drizzle-kit generate
```

The initial migration is `drizzle/0000_sour_vector.sql`.

Apply it locally (against the `wrangler dev` simulated D1):

```sh
npx wrangler d1 migrations apply kamala --local
```

Apply it to the real (remote) D1 database:

```sh
npx wrangler d1 migrations apply kamala --remote
```

> `wrangler d1 migrations apply` reads `migrations_dir` from `wrangler.toml`.
> Set it to `drizzle` when wiring up the Cloudflare adapter, e.g.:
>
> ```toml
> [[d1_databases]]
> binding         = "DB"
> database_name   = "kamala"
> database_id     = "..."
> migrations_dir  = "drizzle"
> ```
>
> If `migrations_dir` isn't set you can apply the SQL directly with
> `wrangler d1 execute kamala --local --file=drizzle/0000_sour_vector.sql`.

---

## 3. Seed the inaugural retreat

The seed script prints SQL — it does not touch D1 itself. Generate then
apply:

```sh
node scripts/seed.mjs > drizzle/seed.sql

# Local
npx wrangler d1 execute kamala --local  --file=drizzle/seed.sql

# Remote (production)
npx wrangler d1 execute kamala --remote --file=drizzle/seed.sql
```

The seed uses `INSERT OR IGNORE` against unique slugs / codes, so re-running
is safe but will not update existing rows. Edit `scripts/seed.mjs` to bump
prices/inventory and re-run.

---

## 4. Using the DB in code

```ts
// src/pages/api/example.ts
import type { APIRoute } from 'astro';
import { getDb } from '../../db/client';
import { retreats } from '../../db/schema';

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb(locals.runtime.env);
  const rows = await db.select().from(retreats);
  return new Response(JSON.stringify(rows), {
    headers: { 'content-type': 'application/json' },
  });
};
```

`getDb(env)` is cheap — call it per request. There is no global state.

### Booking confirmation codes

`src/db/codes.ts` exports `generateBookingCode()` which returns an 8-char
uppercase Crockford base32 string (alphabet excludes I, L, O, U). The
`bookings.confirmation_code` column has a unique index — callers should
retry on a unique-constraint violation. See the doc-comment in `codes.ts`
for the canonical retry pattern.

---

## 5. Resetting local D1

```sh
# Wipe and recreate locally.
rm -rf .wrangler/state/v3/d1
npx wrangler d1 migrations apply kamala --local
node scripts/seed.mjs | npx wrangler d1 execute kamala --local --command -
```

---

## 6. Schema overview

| Table                       | Purpose                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| `locations`                 | Venues. `tbc_address = 1` while the public address is hidden.          |
| `retreats`                  | A retreat instance (location + dates + currency + publish flag).       |
| `room_types`                | Per-retreat room tiers with pair/solo prices and inventory.            |
| `add_ons`                   | Per-retreat optional purchases (e.g. in-room massage).                 |
| `practitioners`             | Facilitators / teachers. Reusable across retreats.                     |
| `retreat_practitioners`     | M:N join, with optional `role` override per retreat.                   |
| `bookings`                  | Confirmed/pending bookings. Money is pence. Add-ons stored as JSON.    |
| `booking_holds`             | 10-min checkout-time inventory holds; expired rows are ignored.        |
| `booking_lookup_tokens`     | Hashed, single-use tokens for the email + code → signed URL flow.     |
| `booking_lookup_attempts`   | Hashed email + IP, used for rate-limiting the lookup form.             |
| `waitlist_entries`          | Email + retreat + preferences when a retreat is sold out.              |
| `newsletter_subscribers`    | Marketing list with source + double-opt-in confirmation timestamp.     |

All money columns are integer pence. All timestamps are integer unix epoch
seconds via Drizzle's `{ mode: 'timestamp' }`.
