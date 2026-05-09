import type { Config } from 'drizzle-kit';

/**
 * Drizzle config for Cloudflare D1.
 *
 * `drizzle-kit generate` reads `src/db/schema.ts` and writes SQL migrations
 * into `drizzle/`. Apply them locally / remotely via:
 *
 *   wrangler d1 migrations apply kamala --local
 *   wrangler d1 migrations apply kamala --remote
 *
 * (or `wrangler d1 execute kamala --file=drizzle/0000_*.sql` for a one-shot.)
 */
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  // No `dbCredentials` here — we apply migrations via wrangler, not via the
  // D1 HTTP API. Set CLOUDFLARE_* env vars + `dbCredentials` if you ever want
  // `drizzle-kit push` / `drizzle-kit studio` against a remote D1.
  verbose: true,
  strict: true,
} satisfies Config;
