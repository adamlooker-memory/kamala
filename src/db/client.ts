/**
 * Drizzle client for Cloudflare D1.
 *
 * Usage in Astro endpoints / actions:
 *
 *   import { env } from 'cloudflare:workers';
 *   import { getDb } from '../db/client';
 *
 *   export const POST: APIRoute = async () => {
 *     const db = getDb(env);
 *     const rows = await db.select().from(retreats);
 *     return new Response(JSON.stringify(rows));
 *   };
 *
 * The `env` argument must contain a binding called `DB` pointing at the
 * Cloudflare D1 database (configured in `wrangler.toml` and surfaced through
 * Astro v6's Cloudflare adapter via the `cloudflare:workers` virtual module).
 */

import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

export type DbEnv = { DB: D1Database };

export type Db = DrizzleD1Database<typeof schema>;

/**
 * Build a typed Drizzle instance bound to the request's D1 database.
 * Cheap to call per-request — no global state, no connection pool.
 */
export function getDb(env: DbEnv): Db {
  return drizzle(env.DB, { schema });
}

export { schema };
