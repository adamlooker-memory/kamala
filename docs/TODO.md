# Kamala Retreats — outstanding launch work

Tracking what's left to do, in order. Phase 1 + 2 are done (site live at `kamalaretreats.pages.dev`, D1 provisioned and seeded with the inaugural retreat).

---

## Phase 3 — Custom domain + transactional email

**Goal:** real domain (`kamalaretreats.com`) and live transactional email. Without this, booking confirmations / manage-booking links / contact form / newsletter all just log to the worker console — they never actually send.

### 3.1 Point `kamalaretreats.com` at Cloudflare

If the domain is *already* on Cloudflare, skip to 3.2.

If it's at another registrar:
1. Cloudflare dashboard → top of sidebar → **Add a domain** → enter `kamalaretreats.com` → choose Free plan.
2. Cloudflare scans your existing DNS; review and accept.
3. At your current registrar, change the nameservers to the two Cloudflare gives you.
4. Wait for propagation (10 min – 24 hr).

### 3.2 Attach the domain to the Pages project
1. Pages project (`kamala`) → **Custom domains** → **Set up a custom domain** → enter `kamalaretreats.com`.
2. Repeat for `www.kamalaretreats.com`.
3. Cloudflare auto-creates the DNS records and provisions SSL (~5 min).

After this, `https://kamalaretreats.com` serves the same site as `kamalaretreats.pages.dev`.

### 3.3 Sign up to Resend and verify the domain
1. Sign up at [resend.com](https://resend.com).
2. **Domains** → **Add domain** → `kamalaretreats.com`.
3. Resend gives 3 DNS records (one TXT for SPF, two CNAMEs for DKIM). Add them in Cloudflare DNS.
4. Click **Verify** in Resend. Wait until all three go green (usually <5 min).

### 3.4 Generate API key + HMAC secret
- Resend → **API Keys** → **Create API Key** → name "Production" → copy the `re_...` key.
- In terminal: `openssl rand -hex 32` → copy the 64-char hex output.

### 3.5 Set both secrets on the Pages project
Pages project → **Settings** → **Variables and secrets** → **Add** under **Production**:

| Name | Value | Type |
|---|---|---|
| `RESEND_API_KEY` | `re_...` from Resend | Encrypted |
| `BOOKING_TOKEN_SECRET` | the openssl hex output | Encrypted |

Save → **Deployments** → **Retry deployment** so the worker picks up the new secrets.

### 3.6 Test it
- Submit the contact form on `kamalaretreats.com/contact` → check `adam@trustedmarketing.co.uk` for the notification email.
- Subscribe to the newsletter → check the inbox you used for the double-opt-in confirmation.

---

## Phase 4 — Payments (Stripe + PayPal)

**Goal:** real card payments. Until this is done, the booking flow uses dev-stub providers; clicking "Pay with Stripe" / "Pay with PayPal" redirects to a fake-checkout simulator that won't work in production.

### 4.1 Stripe
1. Sign up at [stripe.com](https://stripe.com). Activate the account (real business details).
2. **Developers** → **API keys** → copy the **Secret key** (starts `sk_live_...`).
3. **Developers** → **Webhooks** → **Add endpoint**:
   - URL: `https://kamalaretreats.com/api/booking/webhook/stripe`
   - Events: `checkout.session.completed`, `checkout.session.expired`
   - Copy the **Signing secret** (starts `whsec_...`).
4. Set both as Pages secrets (Settings → Variables and secrets):
   - `STRIPE_SECRET_KEY` = `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`
5. Tell Claude — replace the `TODO` blocks in `src/lib/payments/stripe.ts` with the real `fetch` calls.

### 4.2 PayPal
1. Sign up at [paypal.com/business](https://paypal.com/business). Activate.
2. [developer.paypal.com](https://developer.paypal.com) → **Apps & Credentials** → **Live** → **Create App**. Copy **Client ID** and **Secret**.
3. Same dashboard → **Webhooks** → **Add Webhook**:
   - URL: `https://kamalaretreats.com/api/booking/webhook/paypal`
   - Event: `PAYMENT.CAPTURE.COMPLETED`
   - Copy the **Webhook ID**.
4. Set three Pages secrets:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_WEBHOOK_ID`
5. Add `PAYPAL_WEBHOOK_ID` to `src/env.d.ts` (currently undeclared).
6. Tell Claude — wire the real implementation in `src/lib/payments/paypal.ts`.

---

## Other open items (no rush, no order)

### Provisioning
- **R2 bucket** (`kamala-media`) — was looping on activation. Re-try when ready. Not used in v1, but needed before any media uploads (journal, retreat photos).

### Holly's content (TBC pills currently visible on the live site)
- Holly's first-person About paragraph (`/about`)
- Practitioner bios for Lacey Shakti + Phoenix Breathwork Method (`/practitioners`)
- Names for the sound healing + cacao/reishi practitioners
- Real photography (everywhere — currently `<Placeholder>` blocks)
- Welcome pack PDF (drop at `public/welcome-pack.pdf`)
- Inaugural cohort testimonial copy (`/`)
- Contact email + Instagram handle (`/contact`)
- Confirmation of the 2-rooms-per-type inventory at the venue

### Schema / code follow-ups (low priority)
- Add `retreats.summary` (short marketing lead, distinct from full description).
- Add `retreats.cover_image_url` (R2 key) so pages stop falling back to `Placeholder`.
- Add `retreats.status` text enum (`draft|open|sold_out|past`) — currently using `is_published` + `is_sold_out` booleans.
- Add `bookings.hold_token TEXT` so webhooks consume exactly the right inventory hold.
- Optional `retreat_itinerary` table — currently the itinerary is hardcoded in `src/components/retreats/Itinerary.astro` because every retreat shares the same arc.

### Compliance
- Privacy policy + Terms list Cloudflare and Resend as sub-processors. Re-review before launch with whatever payment processor is live (add Stripe / PayPal at that point).
