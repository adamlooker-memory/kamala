/**
 * Stripe payment provider.
 *
 * In dev (or when STRIPE_SECRET_KEY is missing/empty) `createCheckout` returns a
 * stubbed URL pointing at `/dev/fake-checkout` so the booking flow can be
 * exercised without a Stripe account. When a real key is present the real
 * implementation will be wired (see TODO below).
 *
 * NOTE: We deliberately do NOT install the `stripe` SDK yet — the real flow is
 * a single `fetch` to `https://api.stripe.com/v1/checkout/sessions`.
 */

import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  ProviderEnv,
  VerifiedWebhook,
} from './types';

function devCheckoutUrl(input: CheckoutInput): string {
  const params = new URLSearchParams({
    provider: 'stripe',
    code: input.code,
  });
  return `/dev/fake-checkout?${params.toString()}`;
}

export const StripeProvider: PaymentProvider = {
  name: 'stripe',

  async createCheckout(
    input: CheckoutInput,
    env: ProviderEnv,
  ): Promise<CheckoutResult> {
    const key = env.STRIPE_SECRET_KEY;

    if (!key || key === '') {
      // Dev / pre-launch stub.
      return {
        checkoutUrl: devCheckoutUrl(input),
        providerSessionId: `dev_stripe_${input.code}`,
      };
    }

    // TODO: real implementation when Stripe account exists.
    //
    //   const body = new URLSearchParams();
    //   body.set('mode', 'payment');
    //   body.set('success_url', input.successUrl);
    //   body.set('cancel_url', input.cancelUrl);
    //   body.set('customer_email', input.leadEmail);
    //   body.set('client_reference_id', input.code);
    //   body.set('line_items[0][price_data][currency]', input.currency.toLowerCase());
    //   body.set('line_items[0][price_data][unit_amount]', String(input.amountPence));
    //   body.set('line_items[0][price_data][product_data][name]', input.description);
    //   body.set('line_items[0][quantity]', '1');
    //   body.set('payment_intent_data[metadata][booking_code]', input.code);
    //
    //   const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    //     method: 'POST',
    //     headers: {
    //       Authorization: `Bearer ${key}`,
    //       'Content-Type': 'application/x-www-form-urlencoded',
    //     },
    //     body,
    //   });
    //   if (!res.ok) throw new Error(`Stripe checkout failed: ${res.status}`);
    //   const json = (await res.json()) as { id: string; url: string };
    //   return { checkoutUrl: json.url, providerSessionId: json.id };

    // Until then, fall back to the dev stub even when a key is set so we never
    // accidentally hit the real Stripe API with placeholder data.
    return {
      checkoutUrl: devCheckoutUrl(input),
      providerSessionId: `dev_stripe_${input.code}`,
    };
  },

  async verifyWebhook(
    req: Request,
    env: ProviderEnv,
  ): Promise<VerifiedWebhook | null> {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    const sigHeader = req.headers.get('stripe-signature');

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return null;
    }

    // In dev (no secret), accept the body at face value so the simulator works.
    if (!secret || secret === '') {
      const event =
        (payload as { type?: string } | null)?.type ??
        'checkout.session.completed';
      const session =
        (payload as { data?: { object?: { id?: string } } } | null)?.data
          ?.object?.id ?? '';
      return { event, providerSessionId: String(session) };
    }

    // TODO: real signature verification.
    //   - Parse `sigHeader` (`t=...,v1=...`).
    //   - HMAC-SHA256 of `${t}.${rawBody}` keyed by `secret`.
    //   - Compare against v1 in constant time.
    //   - Reject if timestamp is older than 5 min.
    //
    // Wrapped in try/catch as per spec: failures are logged but don't crash.
    try {
      if (!sigHeader) return null;
      // Placeholder: trust the body for now. Replace with real verification.
      const event =
        (payload as { type?: string } | null)?.type ??
        'checkout.session.completed';
      const session =
        (payload as { data?: { object?: { id?: string } } } | null)?.data
          ?.object?.id ?? '';
      return { event, providerSessionId: String(session) };
    } catch (err) {
      console.error('[stripe] webhook verification error', err);
      return null;
    }
  },
};
