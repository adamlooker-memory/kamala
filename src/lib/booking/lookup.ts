/**
 * Booking lookup helpers — passwordless airline-style flow.
 *
 * Token shape (returned to user, used in the URL):
 *   {opaque-32-bytes-hex}.{hmac-sha256-of-opaque-bytes-hex}
 *
 * The DB stores `sha256(token)` — never the plaintext. So even with full DB
 * access, an attacker cannot mint a working URL.
 *
 * The HMAC half adds defence-in-depth: the token verifier rejects anything
 * the server didn't sign, so a leaked DB row alone isn't enough either.
 */

const enc = new TextEncoder();

/** Lowercase hex of the given bytes. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/** SHA-256 → hex. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

/** SHA-256 of arbitrary bytes → hex. */
export async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Constant-time string equality. Both inputs must be strings; lengths can
 * differ. Designed for short tokens / hashes where leaking length is fine.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Mint a fresh lookup token: random opaque + HMAC-SHA256 over the opaque
 * bytes. Returns the plaintext token (to be emailed) and the storage hash
 * (to be saved in `booking_lookup_tokens.token_hash`).
 */
export async function mintLookupToken(
  secret: string,
): Promise<{ token: string; tokenHash: string }> {
  const opaque = new Uint8Array(32);
  crypto.getRandomValues(opaque);
  const opaqueHex = bytesToHex(opaque);
  const key = await hmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, opaque),
  );
  const sigHex = bytesToHex(sig);
  const token = `${opaqueHex}.${sigHex}`;
  const tokenHash = await sha256Hex(token);
  return { token, tokenHash };
}

/**
 * Verify a token's HMAC and return its hash for DB lookup.
 * Returns null if the token format is wrong or the HMAC doesn't verify.
 */
export async function verifyAndHashLookupToken(
  token: string,
  secret: string,
): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [opaqueHex, sigHex] = parts;
  if (!opaqueHex || !sigHex) return null;
  if (opaqueHex.length !== 64 || sigHex.length !== 64) return null;

  const opaque = hexToBytes(opaqueHex);
  const sig = hexToBytes(sigHex);
  if (!opaque || !sig) return null;

  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, sig, opaque);
  if (!ok) return null;

  return sha256Hex(token);
}

/** Normalise email for hashing (rate-limit + DB lookup). */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
