/**
 * Payment provider factory.
 *
 *   import { getProvider } from '../lib/payments';
 *   const provider = getProvider('stripe');
 */

import { StripeProvider } from './stripe';
import { PayPalProvider } from './paypal';
import type { PaymentProvider } from './types';

export type { PaymentProvider, CheckoutInput, CheckoutResult } from './types';

const PROVIDERS: Record<PaymentProvider['name'], PaymentProvider> = {
  stripe: StripeProvider,
  paypal: PayPalProvider,
};

export function getProvider(name: PaymentProvider['name']): PaymentProvider {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown payment provider: ${name}`);
  return p;
}
