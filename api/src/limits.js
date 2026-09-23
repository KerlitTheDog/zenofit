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

/* What has been counted under a key inside its window, 0 once the window
   has gone by. The wipe guard reads it to see a delete split over several
   pushes as the one delete it is. */
export async function countIn(env, key, windowMs) {
  const row = await env.DB.prepare(
    "SELECT window_start, count FROM rate_limits WHERE key = ?"
  ).bind(key).first();
  return row && Date.now() - row.window_start <= windowMs ? row.count : 0;
}
