/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types';

type CloudflareEnv = {
  // D1
  DB: D1Database;

  // KV
  SESSION: KVNamespace;
  RATE_LIMIT: KVNamespace;

  // R2
  MEDIA: R2Bucket;

  // Vars
  PUBLIC_SITE_URL: string;
  NOTIFICATIONS_EMAIL: string;

  // Secrets (only present in deployed env / .dev.vars during local dev)
  RESEND_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  BOOKING_TOKEN_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
};

// Astro v6 + @astrojs/cloudflare exposes bindings via the `cloudflare:workers`
// virtual module instead of `Astro.locals.runtime.env`. We re-declare the
// module here so callers get a typed `env` import.
declare module 'cloudflare:workers' {
  export const env: CloudflareEnv;
}

declare namespace App {
  interface Locals {
    // `runtime` still surfaces non-env runtime data (e.g. `cf` properties and
    // the execution context). The `env` field has been removed in v6 — use
    // `import { env } from 'cloudflare:workers'` instead.
    runtime: {
      cf?: import('@cloudflare/workers-types').IncomingRequestCfProperties;
      ctx: ExecutionContext;
    };
  }
}
