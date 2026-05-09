/**
 * Thin Resend HTTP client.
 *
 * No SDK — Resend's npm package pulls in Node-only deps that don't run on
 * the Cloudflare edge. We POST to https://api.resend.com/emails directly.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendEmailInput {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
}

export class ResendError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'ResendError';
    this.status = status;
    this.body = body;
  }
}

/**
 * POST to Resend's /emails endpoint.
 * Throws `ResendError` on non-2xx responses.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const payload: Record<string, unknown> = {
    from: input.from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  if (input.replyTo) payload.reply_to = input.replyTo;

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();

  if (!res.ok) {
    throw new ResendError(
      `Resend returned ${res.status}`,
      res.status,
      bodyText,
    );
  }

  let parsed: { id?: string } = {};
  try {
    parsed = JSON.parse(bodyText) as { id?: string };
  } catch {
    // fall through with empty id
  }
  return { id: parsed.id ?? '' };
}
