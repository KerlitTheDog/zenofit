/* Usernames and passwords, under a 10ms CPU budget.
 *
 * WHERE THE EXPENSIVE HALF HAPPENS, AND WHY IT IS NOT HERE.
 * A password has to be slow to check or a leaked table is a list of
 * passwords. The standard answer is PBKDF2 or argon2 at a high iteration
 * count, and a Worker on the free plan gets TEN MILLISECONDS of CPU per
 * request. PBKDF2-SHA256 at any count worth having spends several times
 * that, so a login would not merely be slow, it would be killed.
 *
 * So the browser does it. zenofit-cloud.js runs PBKDF2-SHA256, 210,000
 * iterations, salted with the username, and what reaches this file is 256
 * bits of derived key — never the password itself. That is worth saying
 * twice: THE SERVER NEVER SEES THE PASSWORD, in the request, in a log, or
 * in the database.
 *
 * What is stored is a plain salted SHA-256 of that key. A fast hash is the
 * right tool once the input is 256 random-looking bits: there is no
 * dictionary to run against it and nothing to guess. The slow part already
 * happened, on hardware we are not paying for.
 *
 * The salt for the client's PBKDF2 is derived from the username rather than
 * handed out by us, which means a login needs one request instead of two
 * and we never answer "does this account exist" before a password is even
 * offered. The cost is that two people with the same username would share a
 * salt, which cannot happen because the username is unique.
 */

const enc = new TextEncoder();

const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export function newSalt() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return hex(b.buffer);
}

/* One SHA-256 over salt + the client's derived key. Microseconds. */
export async function hashKey(salt, clientKey) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(String(salt) + ":" + String(clientKey))));
}

/* Constant time, so a wrong password cannot be narrowed down by how long it
 * took to say no. Both sides are fixed-length hex out of hashKey, but the
 * length is checked anyway rather than assumed. */
export function sameHash(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ── what a username is allowed to be ─────────────────────────────────
   Letters, digits, and the three separators people actually use, 3 to 24
   characters, starting with a letter or a digit. No spaces, because a
   trailing one is invisible and would make a name nobody can type again.
   No @ either: this is a username and looking like an email would promise
   a password reset that does not exist. */
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,23}$/;

export function cleanUsername(input) {
  const s = typeof input === "string" ? input.trim() : "";
  return NAME_RE.test(s) ? s : "";
}

/* The client's PBKDF2 output, as it should arrive: 64 hex characters. This
 * is a shape check and nothing more — it stops a literal password being
 * accepted by a client that skipped the derivation, which would otherwise
 * store something guessable under a fast hash. */
export function cleanKey(input) {
  return typeof input === "string" && /^[0-9a-f]{64}$/.test(input) ? input : "";
}
