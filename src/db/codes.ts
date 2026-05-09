/**
 * Booking confirmation codes.
 *
 * Format: 8-character uppercase Crockford base32.
 * Alphabet: 0123456789ABCDEFGHJKMNPQRSTVWXYZ (no I, L, O, U).
 *   - Drops I/L/O to avoid confusion with 1/0.
 *   - Drops U to avoid accidental profanity in generated codes.
 *
 * Search space: 32^8 = ~1.0995 x 10^12 codes. Plenty of headroom; collisions
 * are vanishingly rare at our scale.
 *
 * Collision handling
 * ------------------
 * The `bookings.confirmation_code` column has a UNIQUE index. The caller is
 * expected to retry on a unique-constraint violation, e.g.:
 *
 *   for (let attempt = 0; attempt < 5; attempt++) {
 *     const code = generateBookingCode();
 *     try {
 *       await db.insert(bookings).values({ ...row, confirmation_code: code });
 *       return code;
 *     } catch (err) {
 *       if (isUniqueConstraintError(err)) continue;
 *       throw err;
 *     }
 *   }
 *   throw new Error('Could not allocate booking code after 5 attempts');
 *
 * D1 / SQLite throws an error containing `UNIQUE constraint failed:
 * bookings.confirmation_code` — match on that string (or check error.cause)
 * to detect a collision.
 */

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 8;

/**
 * Generate a fresh 8-character Crockford base32 booking code.
 *
 * Uses `crypto.getRandomValues` (available in Workers, modern Node, and
 * browsers) to produce unbiased random characters. Mod-bias is avoided by
 * masking each random byte to 5 bits: 32 possible values map 1:1 onto the
 * 32-character alphabet.
 */
export function generateBookingCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Mask to 5 bits (0-31) so every value indexes a real alphabet char.
    out += CROCKFORD_ALPHABET[bytes[i]! & 0x1f];
  }
  return out;
}

/**
 * Best-effort check: does this string look like a booking code?
 * Useful for input normalisation before a DB lookup.
 *
 * Crockford normalisation: uppercase, then map I/L -> 1, O -> 0.
 * (We do NOT map U because it isn't in the alphabet anyway and we'd rather
 * reject the input than silently accept it.)
 */
export function normaliseBookingCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/I|L/g, '1')
    .replace(/O/g, '0')
    .replace(/[\s-]+/g, '');
}

/** Validates the code is 8 chars and in the Crockford alphabet. */
export function isValidBookingCode(input: string): boolean {
  if (input.length !== CODE_LENGTH) return false;
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (!CROCKFORD_ALPHABET.includes(input[i]!)) return false;
  }
  return true;
}

export const BOOKING_CODE_ALPHABET = CROCKFORD_ALPHABET;
export const BOOKING_CODE_LENGTH = CODE_LENGTH;
