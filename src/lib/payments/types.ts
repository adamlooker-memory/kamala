/**
 * Payment provider abstraction.
 *
 * Both Stripe and PayPal are required at launch but neither account exists yet.
 * Providers expose a unified `createCheckout` -> hosted-checkout-url flow and a
 * `verifyWebhook` to validate inbound events. In dev (or when secrets are
 * absent) the providers return a /dev/fake-checkout URL so the booking flow can
 * be exercised end-to-end.
 */

// Mirrors the `cloudflare:workers` `env` shape — we import the type rather
// than the value so this module stays free of side-effect imports.
import type { env } from 'cloudflare:workers';
export type ProviderEnv = typeof env;

export interface CheckoutInput {
  bookingId: string;
  code: string;
  amountPence: number;
  currency: 'GBP';
  leadEmail: string;
  successUrl: string;
  cancelUrl: string;
  description: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
  providerSessionId: string;
}

export interface VerifiedWebhook {
  event: string;
  providerSessionId: string;
}

export interface PaymentProvider {
  name: 'stripe' | 'paypal';
  createCheckout(
    input: CheckoutInput,
    env: ProviderEnv,
  ): Promise<CheckoutResult>;
  verifyWebhook(
    req: Request,
    env: ProviderEnv,
  ): Promise<VerifiedWebhook | null>;
}
