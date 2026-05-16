/**
 * Webhook signature verification (D1-T2).
 *
 * Mirrors the verification logic in Frihet ERP `functions/src/webhookVerification.ts`:
 *  - Constant-time HMAC compare via `crypto.timingSafeEqual`
 *  - Trim incoming signature value to defang whitespace-asymmetry attacks
 *  - Length-mismatch pre-guard so `timingSafeEqual` never throws
 *  - Hex format validation — `Buffer.from('XYZ', 'hex')` silently strips
 *    non-hex bytes and can produce a buffer whose length accidentally
 *    matches the expected digest. Reject early.
 *  - Optional timestamp replay-protection (default tolerance 300s)
 *
 * Synchronous, Node-only (uses `node:crypto`). For non-Node runtimes use
 * the static `Webhooks.verifySignature` (async) on the SDK resource instead.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookSignaturePayload } from '../types/webhookEvents.js';

/** Hex SHA-256 digest is exactly 64 hex chars (32 bytes). */
const SHA256_HEX_LEN = 64;
const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Verify a Frihet webhook signature synchronously.
 *
 * Accepts the same header format as `verifySaltEdgeSignature` server-side:
 *   `timestamp=<unix>, signature=<hex64>`
 *
 * Also accepts a bare hex string with optional `sha256=` prefix for
 * compatibility with the legacy `Webhooks.verifySignature` static helper.
 *
 * @returns `true` if (a) the signature is a valid SHA-256 HMAC of `payload`
 *          using `secret`, AND (b) the timestamp (when present) is within
 *          `maxAgeSeconds` of `Date.now()`. `false` for every other input
 *          shape — invalid hex, length mismatch, expired timestamp,
 *          missing components, empty strings. Never throws on bad input.
 */
export function webhookSignatureVerify(
  payload: string,
  signature: string,
  secret: string,
  maxAgeSeconds?: number,
): boolean;
export function webhookSignatureVerify(input: WebhookSignaturePayload): boolean;
export function webhookSignatureVerify(
  payloadOrInput: string | WebhookSignaturePayload,
  signature?: string,
  secret?: string,
  maxAgeSeconds = 300,
): boolean {
  let payload: string;
  let sig: string;
  let sec: string;
  let maxAge: number;

  if (typeof payloadOrInput === 'object' && payloadOrInput !== null) {
    payload = payloadOrInput.payload;
    sig = payloadOrInput.signature;
    sec = payloadOrInput.secret;
    maxAge = payloadOrInput.maxAgeSeconds ?? 300;
  } else {
    payload = payloadOrInput;
    sig = signature ?? '';
    sec = secret ?? '';
    maxAge = maxAgeSeconds;
  }

  if (!payload || !sig || !sec) {
    return false;
  }

  // Extract signature component. Three accepted shapes:
  //   1. "timestamp=<unix>, signature=<hex64>"     (Frihet / Salt Edge)
  //   2. "sha256=<hex64>"                          (GitHub-style, legacy)
  //   3. "<hex64>"                                 (raw)
  let received: string;
  let timestamp: number | null = null;

  const tsMatch = sig.match(/timestamp=(\d+)/);
  if (tsMatch) {
    const parsed = parseInt(tsMatch[1], 10);
    if (Number.isFinite(parsed)) timestamp = parsed;
  }

  const sigMatch = sig.match(/signature=\s*([^,]+)/);
  if (sigMatch) {
    received = sigMatch[1].trim();
  } else if (sig.startsWith('sha256=')) {
    received = sig.slice('sha256='.length).trim();
  } else {
    received = sig.trim();
  }

  // Hex sanity. `Buffer.from('XYZ', 'hex')` silently strips non-hex
  // characters and pads odd-length input — both can defeat the length
  // pre-check below. Reject anything that is not exactly 64 hex chars.
  if (received.length !== SHA256_HEX_LEN || !HEX_RE.test(received)) {
    return false;
  }

  // Optional replay protection. Reject timestamps too old or in the
  // future. `maxAge <= 0` disables the check (caller's explicit opt-out).
  if (timestamp !== null && maxAge > 0) {
    const now = Math.floor(Date.now() / 1000);
    const age = now - timestamp;
    if (age < 0 || age > maxAge) {
      return false;
    }
  }

  const expected = createHmac('sha256', sec).update(payload).digest('hex');

  // Length pre-check BEFORE timingSafeEqual — which throws on length
  // mismatch. With the hex sanity gate above both sides should be 64 chars,
  // but keep this defensive (e.g. if HMAC primitive ever changes algorithm).
  if (received.length !== expected.length) {
    return false;
  }

  const receivedBuf = Buffer.from(received, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  if (receivedBuf.length !== expectedBuf.length) {
    return false;
  }

  // gemini-proof:ok — timingSafeEqual used correctly, buffers same length.
  return timingSafeEqual(receivedBuf, expectedBuf);
}
