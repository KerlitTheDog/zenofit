/* A sliding-ish window on one key, in the `rate_limits` table (0006).
 *
 * Same crudeness as joinRateLimited in index.js, and enough for the same
 * reason: nothing here is a defence against a determined attacker, it is
 * the guard that stops anything stuck in a loop from burning the free
 * request budget. Shared by chat (sending) and photos (uploading), which is
 * why it left chat.js: the next thing needing a limit uses a new key, not
 * a new table. */
export async function limited(env, key, windowMs, max) {
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT window_start, count FROM rate_limits WHERE key = ?"
  ).bind(key).first();

  if (!row || now - row.window_start > windowMs) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) " +
      "ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1"
    ).bind(key, now).run();
    return false;
  }
  if (row.count >= max) return true;
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return false;
}

/* ── COUNTING ONLY WHAT WENT WRONG ──────────────────────────────────────
   `limited` counts every request, which is right for sending and
   uploading. A password check wants the other shape: somebody logging in
   correctly must never be the reason the next person is refused, so the
   check and the count are two calls — `overLimit` asks without counting,
   `recordMiss` counts a failure once it has happened. */
export async function overLimit(env, key, windowMs, max) {
  const row = await env.DB.prepare(
    "SELECT window_start, count FROM rate_limits WHERE key = ?"
  ).bind(key).first();
  return !!row && Date.now() - row.window_start <= windowMs && row.count >= max;
}

export async function recordMiss(env, key, windowMs, n = 1) {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET " +
    "  count = CASE WHEN ? - window_start > ? THEN excluded.count ELSE count + excluded.count END, " +
    "  window_start = CASE WHEN ? - window_start > ? THEN excluded.window_start ELSE window_start END"
  ).bind(key, now, n, now, windowMs, now, windowMs).run();
}

/* A ceiling read from the environment ([vars] in wrangler.toml, or a
   `wrangler dev --var NAME:VALUE` for a local test), falling back to the
   number the code was written with when the value is missing or is not a
   positive number. [vars] arrive as strings. */
export function limitOf(env, name, fallback) {
  const v = Number(env && env[name]);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}

/* ── A SPENT COUNTER DOES NOT STAY ─────────────────────────────────────
   Nothing ever deleted a row here once its window was over, so the table
   only grew, and what it grows with is personal: a login key is an IP
   address and a username, a signup key an address. A counter is kept for
   as long as it can still refuse something, and a day on top, then the
   daily cron (`scheduled` in index.js) deletes it, together with the old
   join_attempts rows, which are the same thing in a table of their own.
   The longest window anything here uses is an hour (the signup and search
   ceilings), so a row whose window began a day and an hour ago is over
   for every key. Two statements in one batch whatever the count, against
   the fifty queries the free plan allows per invocation. The environment
   may shorten the wait, which is only ever done for a local test. */
export const LIMIT_ROW_KEEP_MS = 25 * 60 * 60 * 1000;

export async function sweepLimits(env, now = Date.now()) {
  const v = env && env.LIMIT_ROW_KEEP_MS;
  const keep = v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : LIMIT_ROW_KEEP_MS;
  const [rates, joins] = await env.DB.batch([
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - keep),
    env.DB.prepare("DELETE FROM join_attempts WHERE window_start < ?").bind(now - keep),
  ]);
  return {
    rateLimits: (rates.meta && rates.meta.changes) || 0,
    joinAttempts: (joins.meta && joins.meta.changes) || 0,
  };
}

/* What has been counted under a key inside its window, 0 once the window
   has gone by. The wipe guard reads it to see a delete split over several
   pushes as the one delete it is. */
export async function countIn(env, key, windowMs) {
  const row = await env.DB.prepare(
    "SELECT window_start, count FROM rate_limits WHERE key = ?"
  ).bind(key).first();
  return row && Date.now() - row.window_start <= windowMs ? row.count : 0;
}
