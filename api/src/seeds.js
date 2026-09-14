/* Seed codes: the short thing under a profile name that someone types in to
 * get access.
 *
 * Alphabet is Crockford base32, which drops I, L, O and U so a code can be
 * read out loud or copied off a screen without the classic 1/I and 0/O
 * mix-ups. Ten characters is 50 bits: not guessable, and still short enough
 * to say over the phone.
 *
 * A seed is a capability, not a password. Whoever holds it gets the level it
 * carries, which is why it is displayed to its owner and why revoking is one
 * UPDATE.                                                                   */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newSeed() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % 32];
  return out.slice(0, 4) + "-" + out.slice(4, 8) + "-" + out.slice(8);
}

/* Accept what a human actually types: lower case, missing dashes, and the
 * characters the alphabet deliberately excludes. Returns "" when the input
 * cannot be a seed, so callers can reject without a second check.           */
export function normalizeSeed(input) {
  if (typeof input !== "string") return "";
  const cleaned = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");
  if (cleaned.length !== 10) return "";
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return "";
  return cleaned.slice(0, 4) + "-" + cleaned.slice(4, 8) + "-" + cleaned.slice(8);
}
