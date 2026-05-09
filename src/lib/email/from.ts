/**
 * Sender identity for transactional email.
 *
 * TODO: `kamalaretreats.com` must be verified with Resend before any production
 * sends will succeed. Steps:
 *   1. Add the domain in Resend (https://resend.com/domains).
 *   2. Add the SPF/DKIM/DMARC TXT records to the DNS zone.
 *   3. Wait for verification.
 *   4. Confirm `RESEND_API_KEY` in production env.
 *
 * Until then, sends from this address will be rejected. The dev fallback in
 * `resend.ts` will log payloads to the console when `RESEND_API_KEY` is unset.
 */

export const FROM_NAME = 'Kamala Retreats';
export const FROM_ADDRESS = 'hello@kamalaretreats.com';

/** RFC 5322 formatted "Name <address>" for the Resend `from` field. */
export const FROM_HEADER = `${FROM_NAME} <${FROM_ADDRESS}>`;
