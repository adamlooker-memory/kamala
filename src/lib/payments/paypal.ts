/**
 * PayPal payment provider.
 *
 * Mirrors the Stripe provider: dev-stub URL until PAYPAL_CLIENT_ID +
 * PAYPAL_CLIENT_SECRET are present. Real implementation will use the REST
 * Orders v2 API directly via `fetch`. We deliberately do NOT install the
 * `@paypal/checkout-server-sdk` package.
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
    provider: 'paypal',
    code: input.code,
  });
  return `/dev/fake-checkout?${params.toString()}`;
}

export const PayPalProvider: PaymentProvider = {
  name: 'paypal',

  async createCheckout(
    input: CheckoutInput,
    env: ProviderEnv,
  ): Promise<CheckoutResult> {
    const clientId = env.PAYPAL_CLIENT_ID;
    const clientSecret = env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId === '' || clientSecret === '') {
      return {
        checkoutUrl: devCheckoutUrl(input),
        providerSessionId: `dev_paypal_${input.code}`,
      };
    }

    // TODO: real implementation when PayPal account exists.
    //
    //   1. OAuth: POST https://api.paypal.com/v1/oauth2/token
    //      Authorization: Basic base64(clientId:clientSecret)
    //      body: grant_type=client_credentials
    //
    //   2. Create order: POST https://api.paypal.com/v2/checkout/orders
    //      Authorization: Bearer <token>
    //      body: {
    //        intent: 'CAPTURE',
    //        purchase_units: [{
    //          reference_id: input.code,
    //          description: input.description,
    //          amount: {
    //            currency_code: input.currency,
    //            value: (input.amountPence / 100).toFixed(2),
    //          },
    //        }],
    //        application_context: {
    //          return_url: input.successUrl,
    //          cancel_url: input.cancelUrl,
    //          shipping_preference: 'NO_SHIPPING',
    //          user_action: 'PAY_NOW',
    //        },
    //      }
    //
    //   3. Pluck `links[rel=approve].href` for `checkoutUrl`, `id` for
    //      `providerSessionId`.

    return {
      checkoutUrl: devCheckoutUrl(input),
      providerSessionId: `dev_paypal_${input.code}`,
    };
  },

  async verifyWebhook(
    req: Request,
    env: ProviderEnv,
  ): Promise<VerifiedWebhook | null> {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return null;
    }

    const event =
      (payload as { event_type?: string } | null)?.event_type ?? 'PAYMENT.CAPTURE.COMPLETED';
    const resource =
      (payload as { resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } } | null)?.resource;
    const orderId =
      resource?.supplementary_data?.related_ids?.order_id ??
      resource?.id ??
      '';

    // Dev: accept at face value so the simulator works.
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
      return { event, providerSessionId: String(orderId) };
    }

    // TODO: real signature verification.
    //   POST https://api.paypal.com/v1/notifications/verify-webhook-signature
    //   with the headers (PAYPAL-TRANSMISSION-*) plus the raw body and the
    //   webhook id (env var to be added). Treat verification_status === 'SUCCESS'
    //   as valid.
    try {
      return { event, providerSessionId: String(orderId) };
    } catch (err) {
      console.error('[paypal] webhook verification error', err);
      return null;
    }
  },
};
