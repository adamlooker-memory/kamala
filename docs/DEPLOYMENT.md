# Deployment & Cloudflare Access

This is the runbook for taking the Kamala Retreats site from local dev to production. All access listed here belongs on a checklist before launch.

---

## 1. What Adam needs to provision on Cloudflare

The site runs on Cloudflare Pages + Workers and needs four resources plus a domain. Provision in this order:

```sh
# Authenticate the local CLI once.
npx wrangler login

# 1. The primary application database.
npx wrangler d1 create kamala
#    → copy the printed `database_id` into wrangler.toml under [[d1_databases]]

# 2. KV namespace used by @astrojs/cloudflare for sessions.
npx wrangler kv namespace create SESSION
#    → copy the printed `id` into wrangler.toml under [[kv_namespaces]] (binding "SESSION")

# 3. KV namespace used by booking idempotency + rate limiting.
npx wrangler kv namespace create RATE_LIMIT
#    → copy the printed `id` into wrangler.toml under [[kv_namespaces]] (binding "RATE_LIMIT")

# 4. R2 bucket for journal media + image originals (not strictly needed at v1 launch).
npx wrangler r2 bucket create kamala-media

# 5. Pages project (do this from the dashboard or via CI):
#    Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git
#    Repo: github.com/adamlooker-memory/kamala
#    Build command: npm run build
#    Build output:  dist
#    Compatibility flags: nodejs_compat
```

Once the four IDs are pasted, **uncomment the binding blocks in `wrangler.toml`**.

### Domain
- DNS for `kamalaretreats.com` needs to point at the Cloudflare Pages project (or a Worker route).
- SSL is automatic once the domain is added under the Pages project's "Custom domains".

---

## 2. Schema & seed (run once, after D1 exists)

```sh
# Apply the schema.
npx wrangler d1 migrations apply kamala --local
npx wrangler d1 migrations apply kamala --remote

# Generate the seed SQL (idempotent INSERTs for the inaugural retreat).
node scripts/seed.mjs > drizzle/seed.sql

# Run it locally and remotely.
npx wrangler d1 execute kamala --local  --file=drizzle/seed.sql
npx wrangler d1 execute kamala --remote --file=drizzle/seed.sql
```

Adding new retreats is done by editing `scripts/seed.mjs` (or running ad-hoc `wrangler d1 execute` SQL). No admin UI exists by design — Adam updates retreats via Claude Code.

---

## 3. Secrets

These are not stored in `wrangler.toml`. Set them via `wrangler secret put` for production, or `.dev.vars` for local development (already gitignored).

| Secret | When to set | What it does |
| --- | --- | --- |
| `BOOKING_TOKEN_SECRET` | Before launch | HMAC key for manage-booking lookup tokens and newsletter confirmation links. Use a 32+ byte random string. |
| `RESEND_API_KEY` | Before launch | Resend API key for transactional email. Until set, all sends fall back to `console.info` and don't actually deliver. |
| `STRIPE_SECRET_KEY` | When Stripe account exists | Flips Stripe out of dev-stub mode. The dev-stub returns a fake-checkout URL until this is present. |
| `STRIPE_WEBHOOK_SECRET` | When Stripe account exists | Verifies the `stripe-signature` header on incoming webhooks. |
| `PAYPAL_CLIENT_ID` | When PayPal account exists | Same role as Stripe key. |
| `PAYPAL_CLIENT_SECRET` | When PayPal account exists | OAuth secret for PayPal API. |
| `PAYPAL_WEBHOOK_ID` | When PayPal account exists | Required by PayPal's webhook signature verification. (Add to `env.d.ts` when wiring it for real.) |
| `TURNSTILE_SECRET_KEY` | Optional | Cloudflare Turnstile bot protection on public forms. The contact form is wired but no-op without this. |

Set with:

```sh
echo "value..." | npx wrangler secret put BOOKING_TOKEN_SECRET
```

### Resend domain verification

`hello@kamalaretreats.com` is the configured `From` address. Before any production emails leave the system:

1. Sign up at resend.com.
2. Add `kamalaretreats.com` as a verified domain.
3. Add the SPF / DKIM / DMARC DNS records Resend gives you. (DNS lives at Cloudflare since the domain runs through Pages.)
4. Confirm verification in the Resend dashboard.

Without verification, emails will be rejected at send time even with a valid API key.

---

## 4. Local development

```sh
# Install deps (once).
npm install

# Copy env example and fill in any local secrets you want.
cp .dev.vars.example .dev.vars

# Start the dev server.
npm run dev
# → http://localhost:4321

# When you change the schema:
npx drizzle-kit generate                # generates a new migration in /drizzle
npx wrangler d1 migrations apply kamala --local
```

The dev server boots without any Cloudflare resources — it just won't have D1/KV bindings and any DB-touching page will 500 (which is the expected state until D1 is provisioned). All brand pages, legal pages, and the homepage work standalone.

---

## 5. Deployment

The Cloudflare Pages project should be wired to the GitHub repo via the dashboard.

- **Repository:** `github.com/adamlooker-memory/kamala`
- **Build command:** `npm run build`
- **Build output:** `dist`
- **Compat flags:** `nodejs_compat`
- **Production branch:** `main`

Bindings (D1, KV, R2) are configured via `wrangler.toml` and re-declared in the Pages dashboard's Settings → Bindings tab (Pages reads both during build).

Pushes to `main` deploy to production. PRs auto-deploy to preview URLs (`*.pages.dev`).

---

## 6. Known follow-ups (post-launch backlog)

These came up during the build. None block v1 launch.

### Schema
- Add `retreats.summary` (short marketing lead, distinct from full description).
- Add `retreats.cover_image_url` (R2 key) so pages stop falling back to `Placeholder`.
- Add `retreats.status` text enum (`draft|open|sold_out|past`) — currently using `is_published` + `is_sold_out` booleans, which the retreats agent had to substitute against.
- Add `bookings.hold_token TEXT` so webhooks consume exactly the right hold rather than any matching one.
- Add `paypal_webhook_id` to `env.d.ts` and wrangler secrets.
- Optional: `retreat_itinerary` table — currently the itinerary is hardcoded in `src/components/retreats/Itinerary.astro` because every retreat shares the same arc.
- Optional: `locations.public_blurb` separate from `summary` for the detail-page location section.

### UX
- Real photography. All images are currently `<Placeholder>` blocks.
- Holly's first-person About page paragraph (TBC pill in `src/pages/about.astro`).
- Practitioner bios and portraits for Lacey Shakti + Phoenix Breathwork Method.
- Confirm sound healing + cacao/reishi practitioners (currently TBC badges).
- Welcome pack PDF — `/welcome-pack.pdf` is a placeholder link in `my-booking/[token].astro`.
- Inaugural cohort testimonial copy.
- Confirm contact email + Instagram handle for the contact page.
- Confirm 2-room-per-type inventory at the venue (Holly to confirm).

### Defensive code (low priority)
- `src/pages/book/[slug].astro` and `book/confirmation/[code].astro` 500 when `env.DB` is undefined. Add an empty-state fallback for early dev so the booking flow degrades gracefully.

### Payments
- Stripe + PayPal accounts not yet provisioned. Once real keys exist, replace the TODO blocks in `src/lib/payments/stripe.ts` and `src/lib/payments/paypal.ts` with the real `fetch` calls (the request shapes are documented inline).
- Wire webhooks: Stripe → `https://kamalaretreats.com/api/booking/webhook/stripe`, PayPal → `https://kamalaretreats.com/api/booking/webhook/paypal`.

### Compliance
- Privacy policy and Terms list Cloudflare and Resend as sub-processors. Re-review before launch with whatever payment processor is live.

---

## 7. Quick sanity check

```sh
npm run build               # should complete cleanly
npm run dev                 # http://localhost:4321
curl -sI http://localhost:4321/         | head -1   # 200
curl -sI http://localhost:4321/retreats | head -1   # 200 (empty state until D1 provisioned)
```
