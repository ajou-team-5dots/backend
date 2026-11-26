import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Secrets are compared as SHA-256 digests: every digest is 32 bytes, so timingSafeEqual never sees
 * a length mismatch, and the time taken reveals neither the secret nor its length.
 */
export const secretDigest = (secret: string): Buffer =>
  createHash('sha256').update(secret).digest();

/**
 * True when `presented` equals one of the secrets behind `digests`. Checks every one without
 * stopping at the first match, so timing does not tell which (or whether an earlier one) matched.
 * A non-string header (missing, or repeated and arriving as an array) never matches.
 */
export const matchesSecret = (presented: unknown, digests: readonly Buffer[]): boolean => {
  if (typeof presented !== 'string' || digests.length === 0) {
    return false;
  }
  const presentedDigest = secretDigest(presented);
  return digests.reduce(
    (found, digest) => timingSafeEqual(presentedDigest, digest) || found,
    false,
  );
};
