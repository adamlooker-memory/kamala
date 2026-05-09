#!/usr/bin/env node
/**
 * Astro 6's Cloudflare adapter outputs the new Workers + Static Assets format:
 *   dist/server/entry.mjs   ← the worker
 *   dist/server/chunks/*    ← code-split chunks
 *   dist/server/wrangler.json
 *   dist/client/*           ← static assets (bundled JS/CSS, /brand, favicon, ...)
 *
 * Cloudflare Pages expects:
 *   dist/_worker.js/index.js + sibling chunks
 *   dist/[static assets at root]
 *   dist/_routes.json   ← optional, bypasses worker for asset paths
 *
 * This script re-shapes the build output so a Pages deployment serves it correctly.
 * Run it after `astro build`.
 */

import { rename, readdir, rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const DIST   = join(projectRoot, 'dist');
const SERVER = join(DIST, 'server');
const CLIENT = join(DIST, 'client');
const WORKER = join(DIST, '_worker.js');

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

if (!(await exists(SERVER))) {
  console.error('[postbuild-pages] dist/server not found — run `astro build` first.');
  process.exit(1);
}

// 1. Move dist/server → dist/_worker.js
if (await exists(WORKER)) await rm(WORKER, { recursive: true, force: true });
await rename(SERVER, WORKER);

// 2. Rename the worker entry.
await rename(join(WORKER, 'entry.mjs'), join(WORKER, 'index.js'));

// 3. Drop the generated wrangler.json — Pages reads project-root wrangler.toml.
await rm(join(WORKER, 'wrangler.json'), { force: true });

// 4. Hoist client static assets up to dist/ root.
if (await exists(CLIENT)) {
  for (const entry of await readdir(CLIENT)) {
    const from = join(CLIENT, entry);
    const to = join(DIST, entry);
    if (await exists(to)) await rm(to, { recursive: true, force: true });
    await rename(from, to);
  }
  await rm(CLIENT, { recursive: true, force: true });
}

// 5. _routes.json — let Pages serve static assets directly from CDN, send everything else to the worker.
const routes = {
  version: 1,
  include: ['/*'],
  exclude: [
    '/_astro/*',
    '/brand/*',
    '/favicon.ico',
    '/favicon.svg',
    '/robots.txt',
    '/sitemap.xml',
    '/welcome-pack.pdf',
  ],
};
await writeFile(join(DIST, '_routes.json'), JSON.stringify(routes, null, 2));

console.log('[postbuild-pages] restructured dist/ for Cloudflare Pages');
