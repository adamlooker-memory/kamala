/**
 * POST /api/contact
 *
 * Body: { name, email, message }
 *
 * Validates, rate-limits per IP, and sends an internal notification to
 * NOTIFICATIONS_EMAIL. Returns 200 with { ok: true } on success.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { sha256Hex } from '../../lib/booking/lookup';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';
import { sendContactNotification } from '../../lib/email';

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(1).max(254).email(),
  message: z.string().trim().min(1).max(5000),
});

const RATE_WINDOW_SECONDS = 60 * 60;
const RATE_MAX = 10;

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);

  let payload: { name?: string; email?: string; message?: string } = {};
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      payload = (await request.json()) as typeof payload;
    } else {
      const form = await request.formData();
      payload.name = String(form.get('name') ?? '');
      payload.email = String(form.get('email') ?? '');
      payload.message = String(form.get('message') ?? '');
    }
  } catch {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: 'Please fill in your name, a valid email, and a message.',
      },
      400,
    );
  }

  const ipHash = await sha256Hex(ip);
  const rl = await checkRateLimit({
    kv: env.RATE_LIMIT,
    bucket: 'contact:ip',
    key: ipHash,
    windowSeconds: RATE_WINDOW_SECONDS,
    max: RATE_MAX,
  });
  if (!rl.allowed) {
    return json(
      {
        ok: false,
        error: 'Too many messages from this address. Please wait a little and try again.',
      },
      429,
    );
  }

  try {
    await sendContactNotification({
      env,
      name: parsed.data.name,
      email: parsed.data.email,
      message: parsed.data.message,
    });
  } catch (err) {
    console.error('[contact] failed to send notification', err);
    return json(
      {
        ok: false,
        error: "Something went wrong. Please email us directly at hello@kamalaretreats.com.",
      },
      500,
    );
  }

  return json({ ok: true });
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
