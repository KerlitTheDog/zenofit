/* Sending a web push.
 *
 * What actually reaches the phone: a notification shown by sw.js. The page is
 * frozen or gone by then, so nothing in app.js runs and no sound the app knows
 * how to play is available. The OS notification sound IS the alert.
 *
 * Encryption and the VAPID signature are RFC 8291 and RFC 8292. Hand-rolling
 * them is a good way to ship something Apple silently drops, so this uses a
 * library that does both with Web Crypto and runs on Workers.
 */

import { buildPushPayload } from "@block65/webcrypto-web-push";

const vapidFrom = (env) => ({
  subject: env.VAPID_SUBJECT,
  publicKey: env.VAPID_PUBLIC_KEY,
  privateKey: env.VAPID_PRIVATE_KEY,
});

/* Send to every device this user has registered.
 *
 * Returns a per-device result so a caller can log what happened. A dead
 * subscription (404 or 410) is deleted on the spot: a browser that was
 * reinstalled or had notifications turned off never comes back to the same
 * endpoint, and keeping it means paying for a failed request forever.
 *
 * `opts.ttl` is how long, in seconds, the push service holds this for a
 * phone it cannot reach right now. Five minutes unless the caller says
 * otherwise, which is right for a rest timer: one that rings twenty minutes
 * late is worse than one that never rings.
 *
 * `opts.endpoint` narrows it to ONE of the user's devices, for a push that
 * belongs to a phone rather than to the account (a rest timer). If that
 * endpoint is not this user's any more — logged out, handed to somebody
 * else, notifications switched off — nothing is sent: ringing the
 * account's other devices instead is exactly what the narrowing is for. */
export async function sendToUser(env, userId, message, opts = {}) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    return { sent: 0, failed: 0, skipped: "vapid keys not configured" };
  }

  const subs = await env.DB.prepare(
    "SELECT id, endpoint, p256dh, auth, off_kinds FROM push_subs WHERE user_id = ?"
  ).bind(userId).all();

  /* A device that has turned this kind off is not sent it at all (see
     /v1/push/prefs). Never a test: a test is somebody asking whether push
     reaches this phone, and answering "it would, but you said no to
     messages" by showing nothing is the wrong answer to that question. */
  const mine = subs.results || [];
  const all = opts.endpoint ? mine.filter((r) => r.endpoint === opts.endpoint) : mine;
  if (opts.endpoint && !all.length) return { sent: 0, failed: 0, skipped: "that device is not subscribed" };
  const rows = message.kind === "test" ? all
    : all.filter((r) => !String(r.off_kinds || "").split(",").includes(message.kind));
  if (!rows.length) return { sent: 0, failed: 0, skipped: all.length ? "turned off for " + message.kind : "no subscriptions" };

  const vapid = vapidFrom(env);
  let sent = 0, failed = 0;
  const dead = [];

  for (const row of rows) {
    /* Two failure kinds, and they must not be treated the same.
     *
     * Building the payload is pure crypto over the keys we stored. If it
     * throws, those keys can never work: the subscription was stored
     * malformed, or truncated. Retrying it every time a timer fires is a
     * request paid for forever, so it goes. */
    let payload;
    try {
      payload = await buildPushPayload(
        { data: message, options: { ttl: opts.ttl || 300, urgency: "high" } },
        { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } },
        vapid
      );
    } catch (e) {
      console.error("unusable subscription, dropping", row.id, e && e.message ? e.message : e);
      dead.push(row.id);
      failed++;
      continue;
    }

    /* The send itself is a network call. A timeout or a 500 from the push
     * service says nothing about this subscription, so it is kept. */
    try {
      const res = await fetch(row.endpoint, payload);

      if (res.status === 404 || res.status === 410) {
        /* The browser was reinstalled, or notifications were turned off. That
           endpoint never comes back. */
        dead.push(row.id);
        failed++;
      } else if (res.ok) {
        sent++;
      } else {
        failed++;
        console.warn("push rejected", res.status, await res.text().catch(() => ""));
      }
    } catch (e) {
      failed++;
      console.error("push send failed", e && e.message ? e.message : e);
    }
  }

  if (dead.length) {
    await env.DB.prepare(
      "DELETE FROM push_subs WHERE id IN (" + dead.map(() => "?").join(",") + ")"
    ).bind(...dead).run();
  } else if (sent) {
    await env.DB.prepare("UPDATE push_subs SET last_ok_at = ? WHERE user_id = ?")
      .bind(Date.now(), userId).run().catch(() => {});
  }

  return { sent, failed, pruned: dead.length };
}
