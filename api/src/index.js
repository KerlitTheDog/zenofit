/* Zenofit API, Cloudflare Worker.
 *
 * Identity model: one record per browser install, not per person. A phone and
 * a laptop are two users. On first launch the app calls POST /v1/devices once,
 * stores {userId, token} in its own localStorage key (never inside `state`, so
 * it cannot ride along in a backup file), and sends the token as a bearer on
 * every later call. Only the sha256 of the token is stored here.
 *
 * Profile ids are generated HERE, not by the app. The app keeps its own local
 * id and stores the server's id beside it as `remoteId`. That is what lets a
 * profile someone shared with you become a normal local profile of yours, with
 * its own local id, pointing at the same remote data.
 *
 * Phase 2 and 3: identity, profiles, seeds, grants.
 * Phase 4 adds /v1/profiles/:id/changes, Phase 5 adds push and timers.
 */

import { newSeed, normalizeSeed } from "./seeds.js";
import { accessFor, canRead, canWrite, canAdmin } from "./access.js";
import { sendToUser } from "./push.js";
export { TimerAlarm } from "./timer.js";

const JOIN_WINDOW_MS = 60_000;
const JOIN_MAX_PER_WINDOW = 10;
const MAX_NAME = 80;
/* A timer further out than this is almost certainly a bug or a bad clock,
   and every accepted one holds a Durable Object alarm until it fires. */
const MAX_TIMER_AHEAD_MS = 24 * 60 * 60 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const fail = (status, code, message) => json({ error: code, message }, status);

/* Not found and not yours are the same reply, on purpose: probing for profile
   ids should tell an outsider nothing. */
const gone = () => fail(404, "not_found", "No such profile, or you do not have access to it.");

/* ---- CORS -----------------------------------------------------------------
 * An allowlist, not "*", because these requests carry a bearer token.       */
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const newId = () => crypto.randomUUID();

function newToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const cleanName = (v, fallback = null) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_NAME) : fallback;

async function authenticate(request, env) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const user = await env.DB.prepare(
    "SELECT id, display_name, created_at FROM users WHERE token_hash = ?"
  ).bind(await sha256Hex(m[1].trim())).first();
  if (!user) return null;

  /* Fire and forget. A failed heartbeat must never fail the request. */
  env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?")
    .bind(Date.now(), user.id).run().catch(() => {});

  return user;
}

async function readJson(request, limit = 1_000_000) {
  const raw = await request.text();
  if (raw.length > limit) throw new Error("body too large");
  if (!raw) return {};
  return JSON.parse(raw);
}

/* One INSERT, one seed, used by both "create a profile" and "rotate". */
async function issueSeed(env, profileId, level) {
  const seed = newSeed();
  await env.DB.prepare(
    "INSERT INTO seeds (seed, profile_id, level, created_at) VALUES (?, ?, ?, ?)"
  ).bind(seed, profileId, level, Date.now()).run();
  return seed;
}

/* Per-user sliding-ish window. Crude, and enough: a seed is 50 bits, this
   exists to stop someone burning the free request budget, not to stop a
   cryptographic attack. */
async function joinRateLimited(env, userId) {
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT window_start, count FROM join_attempts WHERE user_id = ?"
  ).bind(userId).first();

  if (!row || now - row.window_start > JOIN_WINDOW_MS) {
    await env.DB.prepare(
      "INSERT INTO join_attempts (user_id, window_start, count) VALUES (?, ?, 1) " +
      "ON CONFLICT(user_id) DO UPDATE SET window_start = excluded.window_start, count = 1"
    ).bind(userId, now).run();
    return false;
  }

  if (row.count >= JOIN_MAX_PER_WINDOW) return true;

  await env.DB.prepare("UPDATE join_attempts SET count = count + 1 WHERE user_id = ?")
    .bind(userId).run();
  return false;
}

/* ---- routes --------------------------------------------------------------- */

async function route(request, env, url) {
  const method = request.method;
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const seg = p.split("/").filter(Boolean);          // ['v1','profiles','<id>','seeds']

  /* Liveness. Also proves the D1 binding works, which is the thing that is
     actually wrong when a fresh deploy misbehaves. */
  if (p === "/health" && method === "GET") {
    let db = "unknown";
    try { await env.DB.prepare("SELECT 1").first(); db = "ok"; }
    catch (e) { db = "error: " + (e && e.message ? e.message : String(e)); }
    return json({ ok: db === "ok", service: "zenofit-api", db, time: Date.now() });
  }

  /* First launch. The app stores the result and never calls this again;
     calling it twice makes two devices, which is correct, not a bug. */
  if (p === "/v1/devices" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const id = newId();
    const token = newToken();
    const name = cleanName(body.displayName);
    await env.DB.prepare(
      "INSERT INTO users (id, display_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, name, await sha256Hex(token), Date.now(), Date.now()).run();

    /* The only time the token is ever readable. */
    return json({ userId: id, token, displayName: name }, 201);
  }

  /* The app reads its VAPID public key from here instead of hardcoding it, so
     rotating the key pair does not need an app release. No auth: this value is
     public by design and the app needs it before it has anything else. */
  if (p === "/v1/config" && method === "GET") {
    return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY || null });
  }

  /* Everything past here needs a token. */
  const user = await authenticate(request, env);
  if (!user) return fail(401, "unauthorized", "Missing or unknown device token.");

  if (p === "/v1/me" && method === "GET") {
    return json({ userId: user.id, displayName: user.display_name, createdAt: user.created_at });
  }

  if (p === "/v1/me" && method === "PUT") {
    const body = await readJson(request).catch(() => ({}));
    const name = cleanName(body.displayName);
    await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(name, user.id).run();
    return json({ userId: user.id, displayName: name });
  }

  /* ---- profiles ---------------------------------------------------------- */

  /* Everything you can see: what you made, plus what you joined. */
  if (p === "/v1/profiles" && method === "GET") {
    const owned = await env.DB.prepare(
      "SELECT id, name, owner_id, created_at, updated_at FROM profiles " +
      "WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at"
    ).bind(user.id).all();

    const joined = await env.DB.prepare(
      "SELECT p.id, p.name, p.owner_id, p.created_at, p.updated_at, g.level " +
      "FROM grants g JOIN profiles p ON p.id = g.profile_id " +
      "WHERE g.user_id = ? AND g.revoked_at IS NULL AND p.deleted_at IS NULL ORDER BY g.joined_at"
    ).bind(user.id).all();

    const shape = (r, level) => ({
      profileId: r.id, name: r.name, level,
      isOwner: r.owner_id === user.id,
      createdAt: r.created_at, updatedAt: r.updated_at,
    });

    return json({
      profiles: [
        ...(owned.results || []).map((r) => shape(r, "owner")),
        ...(joined.results || []).map((r) => shape(r, r.level)),
      ],
    });
  }

  if (p === "/v1/profiles" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const name = cleanName(body.name, "My profile");
    const id = newId();
    const now = Date.now();

    await env.DB.prepare(
      "INSERT INTO profiles (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, user.id, name, now, now).run();

    /* Every profile ships with one write seed, so sharing is one tap and not
       a setup flow. The owner can revoke or rotate it later. */
    const seed = await issueSeed(env, id, "write");

    return json({ profileId: id, name, level: "owner", isOwner: true, seed, createdAt: now }, 201);
  }

  if (seg[0] === "v1" && seg[1] === "profiles" && seg[2] && seg.length === 3) {
    const { level, profile } = await accessFor(env, user.id, seg[2]);

    if (method === "GET") {
      if (!canRead(level)) return gone();
      return json({
        profileId: profile.id, name: profile.name, level,
        isOwner: level === "owner",
        createdAt: profile.created_at, updatedAt: profile.updated_at,
      });
    }

    if (method === "PUT") {
      if (!canWrite(level)) return gone();
      const body = await readJson(request).catch(() => ({}));
      const name = cleanName(body.name);
      if (!name) return fail(400, "bad_request", "A profile needs a name.");
      const now = Date.now();
      await env.DB.prepare("UPDATE profiles SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name, now, profile.id).run();
      return json({ profileId: profile.id, name, updatedAt: now });
    }

    if (method === "DELETE") {
      /* Owner only, and a tombstone rather than a DELETE: someone else may be
         holding this profile on their phone and needs to be told it is gone,
         not left syncing into a hole. */
      if (!canAdmin(level)) return gone();
      const now = Date.now();
      await env.DB.prepare("UPDATE profiles SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(now, now, profile.id).run();
      return json({ profileId: profile.id, deletedAt: now });
    }
  }

  /* ---- seeds ------------------------------------------------------------- */

  if (seg[0] === "v1" && seg[1] === "profiles" && seg[2] && seg[3] === "seeds" && seg.length === 4) {
    const { level, profile } = await accessFor(env, user.id, seg[2]);
    if (!canAdmin(level)) return gone();

    if (method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT seed, level, created_at FROM seeds WHERE profile_id = ? AND revoked_at IS NULL ORDER BY created_at"
      ).bind(profile.id).all();
      return json({
        seeds: (rows.results || []).map((r) => ({ seed: r.seed, level: r.level, createdAt: r.created_at })),
      });
    }

    if (method === "POST") {
      const body = await readJson(request).catch(() => ({}));
      const lvl = body.level === "read" ? "read" : "write";

      /* Rotating means the old code stops working. Everyone who joined on it
         keeps their grant: a grant is a person, a seed is only the doorway. */
      if (body.rotate) {
        await env.DB.prepare(
          "UPDATE seeds SET revoked_at = ? WHERE profile_id = ? AND revoked_at IS NULL"
        ).bind(Date.now(), profile.id).run();
      }

      const seed = await issueSeed(env, profile.id, lvl);
      return json({ seed, level: lvl }, 201);
    }
  }

  if (seg[0] === "v1" && seg[1] === "seeds" && seg[2] && seg.length === 3 && method === "DELETE") {
    const seed = normalizeSeed(decodeURIComponent(seg[2]));
    if (!seed) return fail(400, "bad_request", "That is not a code.");

    const row = await env.DB.prepare("SELECT profile_id FROM seeds WHERE seed = ?").bind(seed).first();
    if (!row) return fail(404, "not_found", "No such code.");

    const { level } = await accessFor(env, user.id, row.profile_id);
    if (!canAdmin(level)) return gone();

    await env.DB.prepare("UPDATE seeds SET revoked_at = ? WHERE seed = ? AND revoked_at IS NULL")
      .bind(Date.now(), seed).run();
    return json({ seed, revoked: true });
  }

  /* ---- joining ----------------------------------------------------------- */

  if (p === "/v1/join" && method === "POST") {
    if (await joinRateLimited(env, user.id)) {
      return fail(429, "too_many_attempts", "Too many codes tried. Wait a minute.");
    }

    const body = await readJson(request).catch(() => ({}));
    const seed = normalizeSeed(body.seed);
    if (!seed) return fail(400, "bad_code", "That code is not the right shape.");

    const row = await env.DB.prepare(
      "SELECT s.seed, s.level, s.profile_id, p.name, p.owner_id, p.deleted_at " +
      "FROM seeds s JOIN profiles p ON p.id = s.profile_id " +
      "WHERE s.seed = ? AND s.revoked_at IS NULL"
    ).bind(seed).first();

    if (!row || row.deleted_at) return fail(404, "bad_code", "That code does not work.");

    if (row.owner_id === user.id) {
      return json({ profileId: row.profile_id, name: row.name, level: "owner", isOwner: true, alreadyMine: true });
    }

    /* Re-joining on a better seed upgrades you; a worse one does not quietly
       demote you, because the owner revoking is the way to take access away. */
    await env.DB.prepare(
      "INSERT INTO grants (profile_id, user_id, level, seed, joined_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(profile_id, user_id) DO UPDATE SET " +
      "  level = CASE WHEN excluded.level = 'write' THEN 'write' ELSE grants.level END, " +
      "  seed = excluded.seed, revoked_at = NULL"
    ).bind(row.profile_id, user.id, row.level, seed, Date.now()).run();

    const after = await env.DB.prepare(
      "SELECT level FROM grants WHERE profile_id = ? AND user_id = ?"
    ).bind(row.profile_id, user.id).first();

    return json({ profileId: row.profile_id, name: row.name, level: after.level, isOwner: false }, 201);
  }

  /* ---- who has access ---------------------------------------------------- */

  if (seg[0] === "v1" && seg[1] === "profiles" && seg[2] && seg[3] === "grants") {
    const { level, profile } = await accessFor(env, user.id, seg[2]);
    if (!canAdmin(level)) return gone();

    if (seg.length === 4 && method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT g.user_id, g.level, g.joined_at, u.display_name " +
        "FROM grants g LEFT JOIN users u ON u.id = g.user_id " +
        "WHERE g.profile_id = ? AND g.revoked_at IS NULL ORDER BY g.joined_at"
      ).bind(profile.id).all();
      return json({
        grants: (rows.results || []).map((r) => ({
          userId: r.user_id, displayName: r.display_name, level: r.level, joinedAt: r.joined_at,
        })),
      });
    }

    if (seg.length === 5 && method === "DELETE") {
      await env.DB.prepare(
        "UPDATE grants SET revoked_at = ? WHERE profile_id = ? AND user_id = ? AND revoked_at IS NULL"
      ).bind(Date.now(), profile.id, seg[4]).run();
      return json({ profileId: profile.id, userId: seg[4], revoked: true });
    }
  }

  /* ---- push subscriptions ------------------------------------------------ */

  if (p === "/v1/push/subscribe" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const keys = body.keys || {};

    if (!endpoint.startsWith("https://") || !keys.p256dh || !keys.auth) {
      return fail(400, "bad_subscription", "That is not a usable push subscription.");
    }

    /* The endpoint is the real identity of a subscription. The same browser
       re-subscribing hands back the same endpoint, and a phone that has been
       handed to someone else may hand it back under a different user, so the
       row follows the endpoint, not the user. */
    await env.DB.prepare(
      "INSERT INTO push_subs (id, user_id, endpoint, p256dh, auth, platform, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(endpoint) DO UPDATE SET " +
      "  user_id = excluded.user_id, p256dh = excluded.p256dh, " +
      "  auth = excluded.auth, platform = excluded.platform"
    ).bind(
      newId(), user.id, endpoint, keys.p256dh, keys.auth,
      typeof body.platform === "string" ? body.platform.slice(0, 20) : null,
      Date.now()
    ).run();

    return json({ subscribed: true }, 201);
  }

  if (p === "/v1/push/subscribe" && method === "DELETE") {
    const body = await readJson(request).catch(() => ({}));
    if (typeof body.endpoint !== "string") return fail(400, "bad_request", "Which subscription?");
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?")
      .bind(body.endpoint, user.id).run();
    return json({ unsubscribed: true });
  }

  if (p === "/v1/push/status" && method === "GET") {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?"
    ).bind(user.id).first();
    return json({ subscriptions: row ? row.n : 0, configured: !!env.VAPID_PRIVATE_KEY });
  }

  /* Sends immediately. The only honest way to find out whether push survives
     this particular phone, in a pocket, with the screen off. */
  if (p === "/v1/push/test" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const result = await sendToUser(env, user.id, {
      title: cleanName(body.title, "Zenofit"),
      body: cleanName(body.body, "Test notification. If you can see this, push works."),
      tag: "test",
      kind: "test",
      url: "./",
      requireInteraction: false,
    });
    return json(result);
  }

  /* ---- scheduled timers -------------------------------------------------- */

  if (p === "/v1/timers" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT id, label, fire_at, status FROM timers WHERE user_id = ? AND status = 'scheduled' ORDER BY fire_at"
    ).bind(user.id).all();
    return json({
      timers: (rows.results || []).map((r) => ({
        timerId: r.id, label: r.label, fireAt: r.fire_at, status: r.status,
      })),
    });
  }

  if (p === "/v1/timers" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const now = Date.now();

    /* Two ways to say when.
     *
     * durationMs is the honest one for a rest timer: "90 seconds from now",
     * resolved against the SERVER clock. A phone whose clock is three seconds
     * off then still gets its alarm exactly 90 seconds later, because its own
     * idea of the time never enters the calculation. Real phones are seconds
     * off routinely, and on a 90 second rest that is the difference between
     * a working timer and an annoying one.
     *
     * fireAt stays for a genuine wall-clock moment, like a planned session.  */
    const duration = Number(body.durationMs);
    const fireAt = Number.isFinite(duration) ? now + duration : Number(body.fireAt);

    if (!Number.isFinite(fireAt)) {
      return fail(400, "bad_request", "Send durationMs (ms from now) or fireAt (absolute ms).");
    }
    if (fireAt <= now + 1000) return fail(400, "too_soon", "That time has already passed.");
    if (fireAt > now + MAX_TIMER_AHEAD_MS) return fail(400, "too_far", "Timers cannot be set more than a day ahead.");

    const timerId = newId();
    const label = cleanName(body.label, null);

    await env.DB.prepare(
      "INSERT INTO timers (id, user_id, label, fire_at, status, payload, created_at) " +
      "VALUES (?, ?, ?, ?, 'scheduled', ?, ?)"
    ).bind(timerId, user.id, label, fireAt, JSON.stringify(body.payload || null), now).run();

    const stub = env.TIMER.get(env.TIMER.idFromName(timerId));
    await stub.fetch("https://do/schedule", {
      method: "POST",
      body: JSON.stringify({
        timerId, userId: user.id, fireAt,
        title: cleanName(body.title, label || "Timer done"),
        body: cleanName(body.body, ""),
      }),
    });

    /* The client compares its own clock to this and corrects for drift, which
       is why the timer is stored as an absolute time and not a countdown. */
    return json({ timerId, fireAt, serverNow: now, label }, 201);
  }

  if (seg[0] === "v1" && seg[1] === "timers" && seg[2] && seg.length === 3 && method === "DELETE") {
    const timerId = seg[2];
    /* Only a timer that is still scheduled can be cancelled. Without the status
       check, cancelling twice wakes the Durable Object again for nothing and
       reports success for an alarm that no longer exists. */
    const row = await env.DB.prepare(
      "SELECT id FROM timers WHERE id = ? AND user_id = ? AND status = 'scheduled'"
    ).bind(timerId, user.id).first();
    if (!row) return fail(404, "not_found", "No such timer, or it already went off.");

    const stub = env.TIMER.get(env.TIMER.idFromName(timerId));
    await stub.fetch("https://do/cancel", { method: "POST" }).catch(() => {});

    await env.DB.prepare("UPDATE timers SET status = 'cancelled' WHERE id = ?").bind(timerId).run();
    return json({ timerId, cancelled: true });
  }

  return fail(404, "not_found", "No route for " + method + " " + p);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const res = await route(request, env, new URL(request.url));
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      /* Never leak a stack to the browser, but keep it in `wrangler tail`. */
      console.error("unhandled", e && e.stack ? e.stack : e);
      return new Response(
        JSON.stringify({ error: "server_error", message: "Something broke on our side." }),
        { status: 500, headers: { "content-type": "application/json", ...cors } }
      );
    }
  },
};
