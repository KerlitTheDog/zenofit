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
