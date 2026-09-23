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
 * Phase 6 adds chat, which lives in chat.js and touches none of the above:
 * a message belongs to an ACCOUNT and travels to another person, where
 * everything else here belongs to a profile and travels between devices.
 * Phase 7 gives photos a store of their own (photos.js), so a library row
 * carries a photo's id instead of the photo, and a message can carry a
 * thing from the app as well as words.
 */

import { cleanUsername, cleanKey, newSalt, hashKey, sameHash } from "./auth.js";
import { newSeed, normalizeSeed } from "./seeds.js";
import { accessFor, canRead, canWrite, canAdmin } from "./access.js";
import { sendToUser } from "./push.js";
import { chatRoute } from "./chat.js";
import { photoRoute, setHoldings, dropHoldingsUnder, itemHolder, sweepPhotos } from "./photos.js";
import { overLimit, recordMiss, countIn } from "./limits.js";
import {
  validateItem, encodeCursor, decodeCursor,
  MAX_ITEMS_PER_PUSH, MAX_PUSH_BODY_BYTES,
  PAGE_DEFAULT, PAGE_MAX, PAGE_BYTE_BUDGET, BATCH_CHUNK,
  wipeRefused, WIPE_FLOOR, WIPE_WINDOW_MS,
} from "./sync.js";
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

/* ── A PASSWORD CAN ONLY BE GUESSED SO FAST ─────────────────────────────
   The expensive half of a password check happens in the browser (auth.js),
   which is the right call for a 10ms Worker and also means the server's
   half costs nothing to ask — so nothing stopped anybody asking it a
   thousand times a minute. Failures are counted, never successes, so a
   person logging in correctly is never refused because of somebody else:
   per address AND name (the account being guessed at from one place), and
   per address alone (one password tried against many names). Login and
   Storage check's verify share the counters, or one would be the way
   round the other. */
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_PER_NAME = 10;
const LOGIN_MAX_PER_ADDRESS = 100;
const clientAddress = (request) =>
  request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "local";
const loginKeys = (request, usernameLc) => {
  const ip = clientAddress(request);
  return { name: "login:" + ip + ":" + (usernameLc || "?"), addr: "login:" + ip };
};
async function loginBlocked(env, keys) {
  return (await overLimit(env, keys.name, LOGIN_WINDOW_MS, LOGIN_MAX_PER_NAME)) ||
         (await overLimit(env, keys.addr, LOGIN_WINDOW_MS, LOGIN_MAX_PER_ADDRESS));
}
async function loginMissed(env, keys) {
  await recordMiss(env, keys.name, LOGIN_WINDOW_MS);
  await recordMiss(env, keys.addr, LOGIN_WINDOW_MS);
}
const tooManyLogins = () =>
  fail(429, "too_many_attempts", "Too many wrong passwords. Wait a few minutes and try again.");

async function authenticate(request, env) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  /* Through `tokens`, not users.token_hash: an account can be signed in on
     more than one phone and each one carries its own. See migration 0004,
     which back-fills every existing device's token into a row of its own so
     this change signs nobody out. */
  const hash = await sha256Hex(m[1].trim());
  const user = await env.DB.prepare(
    "SELECT u.id, u.display_name, u.created_at, u.username FROM tokens t " +
    "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?"
  ).bind(hash).first();
  if (!user) return null;

  /* Fire and forget. A failed heartbeat must never fail the request. */
  const now = Date.now();
  env.DB.prepare("UPDATE tokens SET last_seen_at = ? WHERE token_hash = ?").bind(now, hash).run().catch(() => {});
  env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, user.id).run().catch(() => {});

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

/* A row whose json will not parse is a row we wrote wrong. Returning null
   keeps the feed moving instead of failing a whole page over one bad item. */
function safeParse(text) {
  if (text == null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/* The kinds a device may turn off, stored as a sorted comma list so the
   same choice is always the same string. Anything else is dropped rather
   than refused: an app newer than this server may know a kind it does
   not, and that is no reason to fail the whole subscription. */
const PUSH_KINDS = ["chat", "timer"];
const offKinds = (v) => {
  const list = Array.isArray(v) ? PUSH_KINDS.filter((k) => v.includes(k)) : [];
  return list.length ? list.join(",") : null;
};
const offList = (s) => (s ? String(s).split(",").filter(Boolean) : []);

/* ---- routes --------------------------------------------------------------- */

async function route(request, env, url, ctx) {
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
    const now = Date.now();
    const hash = await sha256Hex(token);
    await env.DB.prepare(
      "INSERT INTO users (id, display_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, name, hash, now, now).run();
    /* and the same token as a row of its own, because that is what
       authenticate reads now */
    await env.DB.prepare(
      "INSERT INTO tokens (token_hash, user_id, label, created_at, last_seen_at) VALUES (?, ?, 'device', ?, ?)"
    ).bind(hash, id, now, now).run();

    /* The only time the token is ever readable. */
    return json({ userId: id, token, displayName: name }, 201);
  }

  /* The app reads its VAPID public key from here instead of hardcoding it, so
     rotating the key pair does not need an app release. No auth: this value is
     public by design and the app needs it before it has anything else. */
  if (p === "/v1/config" && method === "GET") {
    return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY || null });
  }

  /* ---- accounts ----------------------------------------------------------
   * Sign in and you get a token like any device gets one, and every profile
   * you own comes with you, because an account IS the user row a device was
   * already using. See migration 0004 and api/src/auth.js.
   *
   * Both of these sit ABOVE the authenticate() line on purpose: signing in is
   * the one thing you must be able to do without already being somebody. But
   * register reads the Authorization header itself, because there is a real
   * difference between "claim the device I am already using" and "make me a
   * new account", and only the first keeps the training already synced.     */

  if (p === "/v1/auth/register" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const username = cleanUsername(body.username);
    const key = cleanKey(body.key);
    if (!username) return fail(400, "bad_username", "3 to 24 characters: letters, digits, dot, dash or underscore, starting with a letter or digit.");
    if (!key) return fail(400, "bad_request", "Missing or malformed key. The app derives this from the password.");

    const lc = username.toLowerCase();
    const taken = await env.DB.prepare("SELECT id FROM users WHERE username_lc = ?").bind(lc).first();
    if (taken) return fail(409, "name_taken", "That username is already in use.");

    const salt = newSalt();
    const hash = await hashKey(salt, key);
    const now = Date.now();

    /* Already a device? Then this is a claim, not a signup, and the row it
       claims is the one that owns whatever has already been synced. Turning
       up with no token instead makes a fresh account, which is what a second
       person on a shared phone actually wants. */
    const existing = await authenticate(request, env);
    if (existing) {
      if (existing.username) return fail(409, "already_claimed", "This device is already signed in to an account.");
      await env.DB.prepare(
        "UPDATE users SET username = ?, username_lc = ?, pw_hash = ?, pw_salt = ?, claimed_at = ? WHERE id = ?"
      ).bind(username, lc, hash, salt, now, existing.id).run();
      return json({ userId: existing.id, username, claimed: true });
    }

    const id = newId();
    const token = newToken();
    const th = await sha256Hex(token);
    await env.DB.prepare(
      "INSERT INTO users (id, display_name, token_hash, created_at, last_seen_at, username, username_lc, pw_hash, pw_salt, claimed_at) " +
      "VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, th, now, now, username, lc, hash, salt, now).run();
    await env.DB.prepare(
      "INSERT INTO tokens (token_hash, user_id, label, created_at, last_seen_at) VALUES (?, ?, 'signin', ?, ?)"
    ).bind(th, id, now, now).run();
    return json({ userId: id, username, token, claimed: false }, 201);
  }

  if (p === "/v1/auth/login" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const username = cleanUsername(body.username);
    const key = cleanKey(body.key);

    const keys = loginKeys(request, username && username.toLowerCase());
    if (await loginBlocked(env, keys)) return tooManyLogins();

    /* One reply for every way this can fail, and the same amount of work
       done either way: a wrong username and a wrong password have to be
       indistinguishable, or the endpoint is a list of who has an account. */
    const row = username && key
      ? await env.DB.prepare("SELECT id, username, pw_hash, pw_salt FROM users WHERE username_lc = ?").bind(username.toLowerCase()).first()
      : null;
    const salt = (row && row.pw_salt) || "00000000000000000000000000000000";
    const attempt = await hashKey(salt, key || "0".repeat(64));
    if (!row || !row.pw_hash || !sameHash(attempt, row.pw_hash)) {
      await loginMissed(env, keys);
      return fail(401, "bad_login", "That username and password do not match an account.");
    }

    /* A token per device, so signing in here does not sign out the phone in
       the gym bag. */
    const token = newToken();
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO tokens (token_hash, user_id, label, created_at, last_seen_at) VALUES (?, ?, 'signin', ?, ?)"
    ).bind(await sha256Hex(token), row.id, now, now).run();
    return json({ userId: row.id, username: row.username, token });
  }

  /* ── PROVING YOU KNOW A PASSWORD, WITHOUT SIGNING IN ─────────────────
     Storage check holds training left on a phone by accounts that are not
     signed in there any more, and handing that out is gated on the
     password of the account it belongs to. Login would answer the
     question too, but it mints a token every time it is asked, and a
     token nobody will ever use is a credential left lying around. So this
     is login's check and nothing after it: same one reply for every
     failure, same work either way, and no row written. */
  if (p === "/v1/auth/verify" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const username = cleanUsername(body.username);
    const key = cleanKey(body.key);
    const keys = loginKeys(request, username && username.toLowerCase());
    if (await loginBlocked(env, keys)) return tooManyLogins();
    const row = username && key
      ? await env.DB.prepare("SELECT id, username, pw_hash, pw_salt FROM users WHERE username_lc = ?").bind(username.toLowerCase()).first()
      : null;
    const salt = (row && row.pw_salt) || "00000000000000000000000000000000";
    const attempt = await hashKey(salt, key || "0".repeat(64));
    if (!row || !row.pw_hash || !sameHash(attempt, row.pw_hash)) {
      await loginMissed(env, keys);
      return fail(401, "bad_login", "That username and password do not match an account.");
    }
    return json({ userId: row.id, username: row.username });
  }

  /* Is this name free? Asked while somebody is still typing it, so it is
     cheap and says nothing a registration attempt would not say a second
     later anyway. */
  if (p === "/v1/auth/available" && method === "GET") {
    const username = cleanUsername(url.searchParams.get("username") || "");
    if (!username) return json({ username: null, available: false, reason: "bad_username" });
    const taken = await env.DB.prepare("SELECT id FROM users WHERE username_lc = ?").bind(username.toLowerCase()).first();
    return json({ username, available: !taken });
  }

  /* Everything past here needs a token. */
  const user = await authenticate(request, env);
  if (!user) return fail(401, "unauthorized", "Missing or unknown device token.");

  if (p === "/v1/me" && method === "GET") {
    return json({ userId: user.id, displayName: user.display_name, createdAt: user.created_at });
  }

  /* ── LOGGING OUT ENDS THE TOKEN, NOT ONLY THE PHONE'S COPY OF IT ────────
     The app used to log out by forgetting the token and nothing else, so
     every token ever issued stayed good for ever: one copied off a borrowed
     phone before its owner logged out still read every profile in the
     account. This revokes the token the request came in on and no other —
     the phone in the gym bag is signed in with its own and stays that way. */
  if (p === "/v1/auth/logout" && method === "POST") {
    const h = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
    const hash = await sha256Hex(h[1].trim());
    await env.DB.prepare("DELETE FROM tokens WHERE token_hash = ? AND user_id = ?").bind(hash, user.id).run();
    return json({ loggedOut: true });
  }

  /* ---- chat --------------------------------------------------------------
   * Its own file, and one line here, because chat shares nothing with the
   * rest of this router but the token it was let in on: no profile, no
   * grant, no item. See the top of chat.js for why it is not sync.
   *
   * It is handed this file's reply helpers rather than growing its own, and
   * `waitUntil` so a message can be stored and answered without waiting on
   * a push service. Returns null when the path is not one of its own, and
   * the list below carries on.                                            */
  if (seg[0] === "v1" && (seg[1] === "chats" || (seg[1] === "users" && seg[2] === "search"))) {
    const res = await chatRoute({
      request, env, url, method, seg, user,
      json, fail, readJson, newId, sendToUser,
      waitUntil: ctx && ctx.waitUntil ? (p2) => ctx.waitUntil(p2) : null,
    });
    if (res) return res;
  }

  /* ---- photos -------------------------------------------------------------
   * Their own file for the same reason chat has one: they are not items and
   * never touch the item routes. A library row names its photo by id and
   * the photo itself is fetched from here, once, by whoever needs it. */
  if (seg[0] === "v1" && seg[1] === "photos") {
    const res = await photoRoute({ request, env, method, seg, user, json, fail, readJson });
    if (res) return res;
  }

  if (p === "/v1/me" && method === "PUT") {
    const body = await readJson(request).catch(() => ({}));
    const name = cleanName(body.displayName);
    await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(name, user.id).run();
    return json({ userId: user.id, displayName: name });
  }

  /* ---- profiles ---------------------------------------------------------- */

  /* Everything you can see: what you made, plus what you joined.
     THIS IS THE ROSTER, and a second device builds its whole profile list
     from it — names, order and all — so it carries `position` and
     `nameUpdatedAt` rather than just enough to draw a row in one sheet.
     NULL positions sort last so profiles that predate the column keep the
     order they already had. */
  if (p === "/v1/profiles" && method === "GET") {
    const owned = await env.DB.prepare(
      "SELECT id, name, owner_id, created_at, updated_at, position, name_updated_at, client_key FROM profiles " +
      "WHERE owner_id = ? AND deleted_at IS NULL " +
      "ORDER BY CASE WHEN position IS NULL THEN 1 ELSE 0 END, position, created_at"
    ).bind(user.id).all();

    /* WHO OWNS IT, BY NAME. The roster has always carried `isOwner`, which
       answers "is this mine" and nothing else: every profile somebody
       shared with you read as simply not-yours, with no way on the client
       to say whose it actually is. That is fine until a phone has been
       signed in to more than one account, at which point "not yours" is
       the one thing a list of profiles must not be vague about. LEFT JOIN
       because an owner who never claimed their device has no username, and
       a missing name is not a reason to drop the row.

       A shared profile's POSITION is the grantee's own (grants.position,
       migration 0009), never the owner's: where it sits in your list is
       yours to drag, and where it sits in theirs is not yours to change. */
    const joined = await env.DB.prepare(
      "SELECT p.id, p.name, p.owner_id, p.created_at, p.updated_at, g.position AS position, p.name_updated_at, " +
      "       g.level, u.username AS owner_name " +
      "FROM grants g JOIN profiles p ON p.id = g.profile_id " +
      "LEFT JOIN users u ON u.id = p.owner_id " +
      "WHERE g.user_id = ? AND g.revoked_at IS NULL AND p.deleted_at IS NULL ORDER BY g.joined_at"
    ).bind(user.id).all();

    const shape = (r, level) => ({
      profileId: r.id, name: r.name, level,
      isOwner: r.owner_id === user.id,
      /* yours is owned by whoever is asking, so there is nothing to look up */
      ownerName: r.owner_id === user.id ? user.username : (r.owner_name || null),
      position: r.position, nameUpdatedAt: r.name_updated_at,
      createdAt: r.created_at, updatedAt: r.updated_at,
      /* the creating device's own id for it, so that device can tell its
         own profile from one it has never seen (see POST below) */
      ...(r.client_key ? { clientKey: r.client_key } : {}),
    });

    return json({
      profiles: [
        ...(owned.results || []).map((r) => shape(r, "owner")),
        ...(joined.results || []).map((r) => shape(r, r.level)),
      ],
    });
  }

  /* The order the list is dragged into, which is a property of the account
     rather than of the phone it was dragged on. One call rather than a PUT
     per profile: a drag moves one row and renumbers every row after it, and
     six round trips for one gesture is how a reorder ends up half-applied.

     ── YOUR LIST, NEVER SOMEBODY ELSE'S ───────────────────────────────
     This used to write profiles.position for anything the caller could
     WRITE to, and profiles.position is the owner's order. So somebody you
     had shared a profile with, dragging two of their own profiles, moved
     yours down your list on your phone. A profile you own is ordered on
     the profile; one shared with you is ordered on your own grant, which
     is what GET /v1/profiles hands back to you and to nobody else. */
  if (p === "/v1/profiles/order" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const order = Array.isArray(body.order) ? body.order.filter((x) => typeof x === "string") : null;
    if (!order) return fail(400, "bad_request", "Send { order: [profileId, ...] }.");
    if (order.length > 200) return fail(400, "too_many", "That is not a profile list.");

    const now = Date.now();
    const done = [];
    for (let i = 0; i < order.length; i++) {
      const { level } = await accessFor(env, user.id, order[i]);
      if (level === "owner") {
        await env.DB.prepare("UPDATE profiles SET position = ?, updated_at = ? WHERE id = ?")
          .bind(i, now, order[i]).run();
      } else if (canRead(level)) {
        await env.DB.prepare("UPDATE grants SET position = ? WHERE profile_id = ? AND user_id = ? AND revoked_at IS NULL")
          .bind(i, order[i], user.id).run();
      } else continue;
      done.push(order[i]);
    }
    return json({ ordered: done.length, profileIds: done, updatedAt: now });
  }

  if (p === "/v1/profiles" && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const name = cleanName(body.name, "My profile");
    const id = newId();
    const now = Date.now();
    const position = Number.isFinite(body.position) ? Math.trunc(body.position) : null;
    /* The client's clock, and only ever compared with itself — see the
       migration for why a name needs a stamp at all. */
    const nameAt = Number.isFinite(body.nameUpdatedAt) ? body.nameUpdatedAt : now;

    /* ── THE SAME CREATE, SENT TWICE, IS ONE PROFILE ─────────────────────
       A create whose reply was lost on gym wifi used to be sent again by
       the next roster pass as a second profile, and both then turned up on
       every device. `clientKey` is the device's own id for the profile it
       is putting into the account: asked for a second time, the first one
       is handed back. Old builds send none and are unaffected. */
    const clientKey = typeof body.clientKey === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(body.clientKey) ? body.clientKey : null;
    const sameCreate = async () => {
      const had = await env.DB.prepare(
        "SELECT id, name, position, name_updated_at, created_at, deleted_at FROM profiles WHERE owner_id = ? AND client_key = ?"
      ).bind(user.id, clientKey).first();
      if (!had) return null;
      if (had.deleted_at) {
        /* deleted since: the key is free again, and this is a new profile */
        await env.DB.prepare("UPDATE profiles SET client_key = NULL WHERE id = ?").bind(had.id).run();
        return null;
      }
      const s = await env.DB.prepare(
        "SELECT seed FROM seeds WHERE profile_id = ? AND revoked_at IS NULL ORDER BY created_at LIMIT 1"
      ).bind(had.id).first();
      return json({ profileId: had.id, name: had.name, level: "owner", isOwner: true, seed: s ? s.seed : null,
        position: had.position, nameUpdatedAt: had.name_updated_at, createdAt: had.created_at, existing: true });
    };
    if (clientKey) { const again = await sameCreate(); if (again) return again; }

    try {
      await env.DB.prepare(
        "INSERT INTO profiles (id, owner_id, name, created_at, updated_at, position, name_updated_at, client_key) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, user.id, name, now, now, position, nameAt, clientKey).run();
    } catch (e) {
      /* two copies of the same create landing at once: the index let one in */
      const again = clientKey ? await sameCreate() : null;
      if (again) return again;
      throw e;
    }

    /* Every profile ships with one write seed, so sharing is one tap and not
       a setup flow. The owner can revoke or rotate it later. */
    const seed = await issueSeed(env, id, "write");

    return json({ profileId: id, name, level: "owner", isOwner: true, seed, position, nameUpdatedAt: nameAt, createdAt: now }, 201);
  }

  if (seg[0] === "v1" && seg[1] === "profiles" && seg[2] && seg.length === 3) {
    const { level, profile } = await accessFor(env, user.id, seg[2]);

    if (method === "GET") {
      if (!canRead(level)) return gone();
      return json({
        profileId: profile.id, name: profile.name, level,
        isOwner: level === "owner",
        position: profile.position, nameUpdatedAt: profile.name_updated_at,
        createdAt: profile.created_at, updatedAt: profile.updated_at,
      });
    }

    /* ── A RENAME IS A SYNCED EDIT, WITH THE SAME GUARD ITEMS GET ───────
       The roster is account data now, so two devices can both rename the
       same profile and both push. `nameUpdatedAt` is the client's clock
       and is used exactly as items.client_updated_at is: never to merge,
       only to refuse to go backwards — otherwise a phone reconnecting
       after a week in flight mode would undo yesterday's rename on the
       laptop simply by being the last to speak. A refused rename is not
       an error; it comes back 200 with the name that won, so the caller
       can take that as the answer instead of retrying forever. */
    if (method === "PUT") {
      if (!canWrite(level)) return gone();
      const body = await readJson(request).catch(() => ({}));
      const now = Date.now();
      const at = Number.isFinite(body.nameUpdatedAt) ? body.nameUpdatedAt : now;

      if (Number.isFinite(body.position)) {
        /* the owner's order is the owner's; see /v1/profiles/order */
        if (level === "owner") {
          await env.DB.prepare("UPDATE profiles SET position = ?, updated_at = ? WHERE id = ?")
            .bind(Math.trunc(body.position), now, profile.id).run();
        } else {
          await env.DB.prepare("UPDATE grants SET position = ? WHERE profile_id = ? AND user_id = ? AND revoked_at IS NULL")
            .bind(Math.trunc(body.position), profile.id, user.id).run();
        }
      }

      if (body.name === undefined) {
        const row = await env.DB.prepare("SELECT name, name_updated_at FROM profiles WHERE id = ?").bind(profile.id).first();
        return json({ profileId: profile.id, name: row.name, nameUpdatedAt: row.name_updated_at, updatedAt: now });
      }

      const name = cleanName(body.name);
      if (!name) return fail(400, "bad_request", "A profile needs a name.");

      const stored = profile.name_updated_at;
      if (stored != null && stored > at) {
        return json({ profileId: profile.id, name: profile.name, nameUpdatedAt: stored, stale: true, updatedAt: now });
      }
      await env.DB.prepare("UPDATE profiles SET name = ?, name_updated_at = ?, updated_at = ? WHERE id = ?")
        .bind(name, at, now, profile.id).run();
      return json({ profileId: profile.id, name, nameUpdatedAt: at, updatedAt: now });
    }

    if (method === "DELETE") {
      /* Owner only, and a tombstone rather than a DELETE: someone else may be
         holding this profile on their phone and needs to be told it is gone,
         not left syncing into a hole. */
      if (!canAdmin(level)) return gone();
      const now = Date.now();
      await env.DB.prepare("UPDATE profiles SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(now, now, profile.id).run();
      /* its rows are gone for everybody, so nothing of it holds a photo any
         more: whatever only it held is left for the sweep (photos.js) */
      await dropHoldingsUnder(env, itemHolder(profile.id, ""));
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
      "SELECT s.seed, s.level, s.profile_id, s.created_at AS seed_at, p.name, p.owner_id, p.deleted_at, u.username AS owner_name " +
      "FROM seeds s JOIN profiles p ON p.id = s.profile_id " +
      "LEFT JOIN users u ON u.id = p.owner_id " +
      "WHERE s.seed = ? AND s.revoked_at IS NULL"
    ).bind(seed).first();

    if (!row || row.deleted_at) return fail(404, "bad_code", "That code does not work.");

    if (row.owner_id === user.id) {
      return json({ profileId: row.profile_id, name: row.name, level: "owner", isOwner: true, alreadyMine: true });
    }

    /* ── REMOVED MEANS REMOVED ────────────────────────────────────────────
       "Remove this person? They lose access straight away." It revoked the
       grant and left the code alone, so the person typed the same code
       again and was straight back in, at the same level, writing. The
       owner removing somebody now shuts every code that existed at that
       moment to THAT person; a code made afterwards is the owner inviting
       them back, and works as any code does. Leaving on your own is not
       this (removed_at stays NULL), so changing your mind is still free. */
    const prior = await env.DB.prepare(
      "SELECT removed_at FROM grants WHERE profile_id = ? AND user_id = ?"
    ).bind(row.profile_id, user.id).first();
    if (prior && prior.removed_at && row.seed_at <= prior.removed_at) {
      return fail(404, "bad_code", "That code does not work.");
    }

    /* ── THE CODE YOU CAME IN ON DECIDES YOUR LEVEL, BOTH WAYS ──────────
       This used to keep the better of the two — a write grant survived a
       later join on a read code — reasoning that only the owner revoking
       should take access away. Both halves of that were wrong.

       It is the OWNER who mints a code, so handing somebody a read code IS
       the owner taking write access away; the person typing it cannot
       promote themselves with a code they were never given. And the cost
       of getting it backwards is the worst kind: sharing read-only to
       somebody who had once been given write left a profile that said
       "read only" on one phone and was fully editable on the other, with
       her sets syncing back into his log and nothing anywhere saying why.

       Nobody is let in by this that was not let in before: an unknown or
       revoked code is already a 404 above, and a grant is still only ever
       created by a code the owner issued.                               */
    await env.DB.prepare(
      "INSERT INTO grants (profile_id, user_id, level, seed, joined_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(profile_id, user_id) DO UPDATE SET " +
      "  level = excluded.level, seed = excluded.seed, revoked_at = NULL, removed_at = NULL"
    ).bind(row.profile_id, user.id, row.level, seed, Date.now()).run();

    const after = await env.DB.prepare(
      "SELECT level FROM grants WHERE profile_id = ? AND user_id = ?"
    ).bind(row.profile_id, user.id).first();

    return json({ profileId: row.profile_id, name: row.name, level: after.level, isOwner: false,
      ownerName: row.owner_name || null }, 201);
  }

  /* ---- who has access ---------------------------------------------------- */

  if (seg[0] === "v1" && seg[1] === "profiles" && seg[2] && seg[3] === "grants") {
    const { level, profile } = await accessFor(env, user.id, seg[2]);
    if (!canRead(level)) return gone();

    /* ── LEAVING IS NOT AN ADMIN ACTION ────────────────────────────────
       Every other verb on this route is the owner deciding about someone
       else. This one is a person deciding about themselves, and without
       it "delete" on a profile somebody shared with you could only ever
       be local: the grant survived, the profile kept coming back in
       GET /v1/profiles, every other device the account was signed in on
       kept its copy, and the account sheet went on offering to fetch the
       thing that had just been deleted. There was no way to say no.

       It revokes the caller's OWN grant and nothing else. "me" is
       accepted alongside the real id so a client does not have to be
       sure which user it currently is. An owner has no grant to revoke —
       leaving your own profile is deleting it — so that is refused with
       the verb that does work rather than a silent no-op. */
    if (method === "DELETE" && seg.length === 5 && (seg[4] === "me" || seg[4] === user.id)) {
      if (level === "owner") {
        return fail(400, "owner_cannot_leave", "You own this profile. Delete it instead of leaving it.");
      }
      await env.DB.prepare(
        "UPDATE grants SET revoked_at = ? WHERE profile_id = ? AND user_id = ? AND revoked_at IS NULL"
      ).bind(Date.now(), profile.id, user.id).run();
      return json({ profileId: profile.id, userId: user.id, left: true });
    }

    if (!canAdmin(level)) return gone();

    if (seg.length === 4 && method === "GET") {
      /* The USERNAME as well: display_name is only ever set on the device
         rows of old, and every account made with a username has it NULL, so
         the owner's list of who is in read "Someone" for every one of them
         and there was no telling two people apart before removing one. */
      const rows = await env.DB.prepare(
        "SELECT g.user_id, g.level, g.joined_at, u.display_name, u.username " +
        "FROM grants g LEFT JOIN users u ON u.id = g.user_id " +
        "WHERE g.profile_id = ? AND g.revoked_at IS NULL ORDER BY g.joined_at"
      ).bind(profile.id).all();
      return json({
        grants: (rows.results || []).map((r) => ({
          userId: r.user_id, displayName: r.display_name || r.username || null,
          username: r.username || null, level: r.level, joinedAt: r.joined_at,
        })),
      });
    }

    /* ── CHANGING SOMEBODY'S LEVEL WITHOUT THROWING THEM OUT ────────────
       Revoke used to be the only way to take write access back, and
       revoking is a blunt instrument: the person loses the profile, has to
       be sent a new code, and rejoins as a stranger. "I'd rather she just
       looked at it now" is an ordinary thing to want, so it gets its own
       verb. Owner only, like everything else on this route. */
    if (seg.length === 5 && method === "PUT") {
      const body = await readJson(request).catch(() => ({}));
      const lvl = body.level === "write" ? "write" : body.level === "read" ? "read" : null;
      if (!lvl) return fail(400, "bad_request", "level must be 'read' or 'write'.");
      const res = await env.DB.prepare(
        "UPDATE grants SET level = ? WHERE profile_id = ? AND user_id = ? AND revoked_at IS NULL"
      ).bind(lvl, profile.id, seg[4]).run();
      if (!res.meta || !res.meta.changes) return fail(404, "not_found", "Nobody here by that id.");
      return json({ profileId: profile.id, userId: seg[4], level: lvl });
    }

    if (seg.length === 5 && method === "DELETE") {
      /* removed_at as well as revoked_at: see REMOVED MEANS REMOVED in /v1/join */
      const now = Date.now();
      await env.DB.prepare(
        "UPDATE grants SET revoked_at = ?, removed_at = ? WHERE profile_id = ? AND user_id = ? AND revoked_at IS NULL"
      ).bind(now, now, profile.id, seg[4]).run();
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
      "INSERT INTO push_subs (id, user_id, endpoint, p256dh, auth, platform, created_at, off_kinds) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(endpoint) DO UPDATE SET " +
      "  user_id = excluded.user_id, p256dh = excluded.p256dh, " +
      "  auth = excluded.auth, platform = excluded.platform, off_kinds = excluded.off_kinds"
    ).bind(
      newId(), user.id, endpoint, keys.p256dh, keys.auth,
      typeof body.platform === "string" ? body.platform.slice(0, 20) : null,
      Date.now(), offKinds(body.off)
    ).run();

    return json({ subscribed: true, off: offList(offKinds(body.off)) }, 201);
  }

  /* ── WHICH KINDS THIS DEVICE WANTS ─────────────────────────────────────
     One switch turns notifications on for a device, and each kind can then
     be turned off on its own: messages on the phone and not on the laptop,
     or rest timers without the chat. Kept on the SUBSCRIPTION because that
     is what a device is to the push service, and checked in sendToUser so a
     message this device said no to is never sent to it at all -- the other
     way round, a push the phone has to swallow, is one Safari revokes the
     subscription over after a handful. */
  if (p === "/v1/push/prefs" && method === "PUT") {
    const body = await readJson(request).catch(() => ({}));
    if (typeof body.endpoint !== "string") return fail(400, "bad_request", "Which subscription?");
    const off = offKinds(body.off);
    const res = await env.DB.prepare("UPDATE push_subs SET off_kinds = ? WHERE endpoint = ? AND user_id = ?")
      .bind(off, body.endpoint, user.id).run();
    if (!res.meta || !res.meta.changes) return fail(404, "not_found", "This device is not subscribed.");
    return json({ off: offList(off) });
  }

  if (p === "/v1/push/subscribe" && method === "DELETE") {
    const body = await readJson(request).catch(() => ({}));
    if (typeof body.endpoint !== "string") return fail(400, "bad_request", "Which subscription?");
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?")
      .bind(body.endpoint, user.id).run();
    return json({ unsubscribed: true });
  }

  /* How many devices this account can be reached on, and -- given the
     endpoint of the one asking -- whether THIS device is one of them and
     which kinds it has turned off. The notifications window reads it. */
  if (p === "/v1/push/status" && method === "GET") {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?"
    ).bind(user.id).first();
    const endpoint = url.searchParams.get("endpoint");
    const me = endpoint ? await env.DB.prepare(
      "SELECT off_kinds FROM push_subs WHERE endpoint = ? AND user_id = ?"
    ).bind(endpoint, user.id).first() : null;
    return json({
      subscriptions: row ? row.n : 0, configured: !!env.VAPID_PRIVATE_KEY,
      thisDevice: endpoint ? !!me : null, off: me ? offList(me.off_kinds) : [],
    });
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

  /* ---- sync ---------------------------------------------------------------
   *
   * Two routes, and between them they are the whole transport. They carry no
   * merge policy: what a log entry means, and which of two edits wins, is the
   * app's decision. A server holding a second opinion about that is how two
   * systems end up disagreeing.
   *
   * What the server does insist on:
   *   - items.updated_at is the SERVER's clock. A phone here was 2.8 seconds
   *     off, and client-stamped ordering hands the win to whichever device is
   *     most wrong.
   *   - a delete is a row with deleted = 1, never a missing row. The app
   *     deletes by filtering an array, so an entry that vanished locally but
   *     still exists on the other phone would otherwise be pushed back.
   *   - the allowlist is closed, so "sync the profile" can never quietly grow
   *     into "sync the half-typed form and the device's theme".
   */

  if (seg[0] === "v1" && seg[1] === "profiles" && seg[2] && seg[3] === "changes" &&
      seg.length === 4 && method === "GET") {
    const { level, profile } = await accessFor(env, user.id, seg[2]);
    if (!canRead(level)) return gone();

    const limit = Math.min(PAGE_MAX, Math.max(1, Number(url.searchParams.get("limit")) || PAGE_DEFAULT));
    const cursorParam = url.searchParams.get("cursor");
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;
    if (cursorParam && !cursor) return fail(400, "bad_cursor", "That cursor is not readable.");

    /* A cursor resumes at an exact row. `since` is the cruder entry point for
       a first pull: a bare millisecond cannot separate rows that share it, so
       a since-pull may repeat the rows on its boundary. Repeats are harmless,
       because the client upserts, and losses are not, so the comparison leans
       that way deliberately. Carry the cursor back for every later pull. */
    const sinceMs = cursor ? cursor.updatedAt
                           : Math.max(0, Number(url.searchParams.get("since")) || 0);
    const afterCol = cursor ? cursor.collection : "";
    const afterId = cursor ? cursor.itemId : "";

    const res = await env.DB.prepare(
      "SELECT collection, item_id, json, updated_at, deleted, client_updated_at FROM items " +
      "WHERE profile_id = ? AND (" +
      "  updated_at > ? OR (updated_at = ? AND (collection > ? OR (collection = ? AND item_id > ?)))" +
      ") ORDER BY updated_at, collection, item_id LIMIT ?"
    ).bind(profile.id, sinceMs, sinceMs, afterCol, afterCol, afterId, limit + 1).all();

    const rows = res.results || [];
    const moreByCount = rows.length > limit;
    const page = moreByCount ? rows.slice(0, limit) : rows;

    /* Capped by bytes as well as by count. Two hundred library rows with
       photos in them is not a response anyone wants on mobile data. */
    const items = [];
    let bytes = 0;
    let truncated = false;
    for (const r of page) {
      const size = (r.json ? r.json.length : 0) + 64;
      if (items.length && bytes + size > PAGE_BYTE_BUDGET) { truncated = true; break; }
      bytes += size;
      items.push({
        collection: r.collection,
        itemId: r.item_id,
        json: r.deleted ? null : safeParse(r.json),
        updatedAt: r.updated_at,
        clientUpdatedAt: r.client_updated_at,
        deleted: !!r.deleted,
      });
    }

    const last = page[items.length - 1];
    return json({
      items,
      cursor: last ? encodeCursor(last) : (cursorParam || null),
      hasMore: truncated || moreByCount,
      serverNow: Date.now(),
      level,
    });
  }

  if (seg[0] === "v1" && seg[1] === "profiles" && seg[2] && seg[3] === "items" &&
      seg.length === 4 && method === "POST") {
    const { level, profile } = await accessFor(env, user.id, seg[2]);

    /* A read grant gets 403, not 404 and not a silent success. The holder is
       not a stranger probing for ids, they are someone who was let in to look,
       and saying so plainly is the point. A client-side check is a suggestion;
       this is the thing that enforces it. */
    if (!canRead(level)) return gone();
    if (!canWrite(level)) {
      return fail(403, "read_only", "You have read access to this profile, not write access.");
    }

    let body;
    try { body = await readJson(request, MAX_PUSH_BODY_BYTES); }
    catch { return fail(413, "too_large", "That push is too big. Send fewer items."); }

    const incoming = Array.isArray(body.items) ? body.items : null;
    if (!incoming) return fail(400, "bad_request", "Send { items: [...] }.");
    if (incoming.length > MAX_ITEMS_PER_PUSH) {
      return fail(400, "too_many", "At most " + MAX_ITEMS_PER_PUSH + " items per push.");
    }
    if (!incoming.length) {
      return json({ accepted: 0, skipped: 0, staleItems: [], serverNow: Date.now() });
    }

    /* Validate everything before writing anything. A push that half-lands
       leaves the client unable to say what it still owes. */
    for (const item of incoming) {
      const problem = validateItem(item);
      if (problem) return fail(400, "bad_item", problem);
    }

    /* ── A BATCH THAT IS MOSTLY DELETIONS DOES NOT GET THE BENEFIT OF THE
       DOUBT ────────────────────────────────────────────────────────────
       See the block above wipeRefused in sync.js for why this lives here
       and not only on the client. Counted before anything is written, and
       answered with 409 rather than 400: nothing about the request is
       malformed, it is the one shape of valid request this refuses. */
    const deletions = incoming.reduce((n, i) => n + (i.deleted ? 1 : 0), 0);
    /* Summed with whatever this profile has had deleted in the last
       WIPE_WINDOW_MS, because a wipe arrives as several batches (see the
       block in sync.js). `before` is what the profile held when that run of
       deletions began: what it holds now plus what the run already took.
       Only read at all when this push deletes something, and only counted
       once past the floor, so an ordinary push costs no extra query. */
    const wipeKey = "wipe:" + profile.id;
    let wipePrior = 0;
    if (deletions && body.allowWipe !== true) {
      wipePrior = await countIn(env, wipeKey, WIPE_WINDOW_MS);
      const run = wipePrior + deletions;
      if (run >= WIPE_FLOOR) {
        const held = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM items WHERE profile_id = ? AND deleted = 0"
        ).bind(profile.id).first();
        const live = (held && held.n) || 0;
        if (wipeRefused(run, live + wipePrior)) {
          return fail(409, "wipe_refused",
            "That would delete " + run + " items from a profile holding " + (live + wipePrior) +
            ". Refused. If you meant it, restore a backup or reset the profile.");
        }
      }
    }

    const now = Date.now();
    const keyOf = (c, i) => JSON.stringify([c, i]);

    /* The stale-push guard. Armed only for items that carry clientUpdatedAt,
       so it does nothing until the app starts stamping its writes. It is not
       a merge policy: it never combines anything, it only refuses to let the
       stored row go backwards, which would otherwise strand a newer edit on
       the device that made it until that device happened to write again. */
    const stored = new Map();
    const stamped = incoming.filter((i) => Number.isFinite(i.clientUpdatedAt));
    for (let i = 0; i < stamped.length; i += BATCH_CHUNK) {
      const chunk = stamped.slice(i, i + BATCH_CHUNK);
      const found = await env.DB.batch(chunk.map((item) =>
        env.DB.prepare(
          "SELECT collection, item_id, client_updated_at FROM items " +
          "WHERE profile_id = ? AND collection = ? AND item_id = ?"
        ).bind(profile.id, item.collection, item.itemId)
      ));
      for (const r of found) {
        const row = (r.results || [])[0];
        if (row && row.client_updated_at != null) {
          stored.set(keyOf(row.collection, row.item_id), row.client_updated_at);
        }
      }
    }

    /* ── A CLOCK FROM THE FUTURE DOES NOT GET TO WIN FOR EVER ────────────
       clientUpdatedAt is the device's own clock, trusted only to refuse
       going backwards — which a stamp from next century turns into a lock:
       every honest edit of that row after it is "stale", on every device,
       for good. Phones are seconds off, not days, so a stamp is held to at
       most CLOCK_AHEAD_MS past this server's clock, on the way in and when
       an old one is read back. */
    const CLOCK_AHEAD_MS = 10 * 60_000;
    const clampStamp = (v) => (Number.isFinite(v) ? Math.min(v, now + CLOCK_AHEAD_MS) : v);
    for (const item of incoming) if (Number.isFinite(item.clientUpdatedAt)) item.clientUpdatedAt = clampStamp(item.clientUpdatedAt);

    const toWrite = [];
    const stale = [];
    for (const item of incoming) {
      const found = stored.get(keyOf(item.collection, item.itemId));
      const ours = found != null ? clampStamp(found) : found;
      if (Number.isFinite(item.clientUpdatedAt) && ours != null && ours > item.clientUpdatedAt) {
        stale.push({ collection: item.collection, itemId: item.itemId, storedClientUpdatedAt: ours });
        continue;
      }
      toWrite.push(item);
    }

    /* D1 allows 100 bound parameters per query, so this cannot be one large
       INSERT with a values list. One statement per item through batch() stays
       inside that limit and is a single round trip per chunk.

       ── THE STAMP IS TAKEN WHERE THE ROWS LAND ───────────────────────────
       updated_at used to be `now`, read before any of this ran. Two pushes
       racing — or one push's later chunks against somebody's pull — could
       therefore commit rows stamped OLDER than a cursor another device had
       already moved past, and that device never saw them. Each chunk is one
       transaction (a D1 batch is), and its first statement moves the
       profile's own counter to MAX(counter + 1, now); every row in the chunk
       takes that value. So a chunk that commits later always carries a
       larger stamp than every row already visible, which is the one thing a
       cursor needs to be true. It is still a clock reading to the
       millisecond in practice, and the cursor's shape does not change. */
    const stampNext = () =>
      env.DB.prepare("UPDATE profiles SET item_seq = MAX(item_seq + 1, ?) WHERE id = ?").bind(Date.now(), profile.id);
    for (let i = 0; i < toWrite.length; i += BATCH_CHUNK) {
      const chunk = toWrite.slice(i, i + BATCH_CHUNK);
      await env.DB.batch([stampNext(), ...chunk.map((item) =>
        env.DB.prepare(
          "INSERT INTO items (profile_id, collection, item_id, json, updated_at, deleted, client_updated_at) " +
          "VALUES (?, ?, ?, ?, (SELECT item_seq FROM profiles WHERE id = ?), ?, ?) " +
          "ON CONFLICT(profile_id, collection, item_id) DO UPDATE SET " +
          "  json = excluded.json, updated_at = excluded.updated_at, " +
          "  deleted = excluded.deleted, client_updated_at = excluded.client_updated_at"
        ).bind(
          profile.id, item.collection, item.itemId,
          item.deleted ? null : JSON.stringify(item.json),
          profile.id,
          item.deleted ? 1 : 0,
          Number.isFinite(item.clientUpdatedAt) ? item.clientUpdatedAt : null
        )
      )]);
    }

    if (toWrite.length) {
      await env.DB.prepare("UPDATE profiles SET updated_at = ? WHERE id = ?")
        .bind(now, profile.id).run().catch(() => {});
    }

    /* the deletions this push really made join the run the wipe guard sums */
    const deleted = toWrite.reduce((n, i) => n + (i.deleted ? 1 : 0), 0);
    if (deleted && body.allowWipe !== true) {
      try { await recordMiss(env, wipeKey, WIPE_WINDOW_MS, deleted); }
      catch (e) { console.error("wipe count failed; the rows are written", e && e.message ? e.message : e); }
    }

    /* ── A LIBRARY ROW HOLDS THE PHOTO IT NAMES, AND ONLY THAT ONE ───────
       Every library row written here is pointed at the photo it names now,
       which lets go of the one it named before: a photo replaced, removed,
       or left behind by a deleted exercise. What nothing holds any more is
       left for the sweep (photos.js). And a row naming a photo this server
       does not have is reported back, so the phone that pushed it -- which
       uploads before it pushes, and remembers what it uploaded -- forgets
       that and sends the picture again: nothing is left pointing at a hole. */
    const holdings = {};
    for (const item of toWrite) {
      if (item.collection !== "library") continue;
      const pid = !item.deleted && item.json && typeof item.json.photoId === "string" ? item.json.photoId : null;
      holdings[itemHolder(profile.id, item.itemId)] = pid ? [pid] : [];
    }
    let missingPhotos = [];
    try { missingPhotos = (await setHoldings(env, holdings)).missing; }
    catch (e) { console.error("photo holdings failed; the rows are written", e && e.message ? e.message : e); }

    return json({
      accepted: toWrite.length,
      skipped: stale.length,
      staleItems: stale,
      missingPhotos,
      updatedAt: now,
      serverNow: now,
    });
  }

  return fail(404, "not_found", "No route for " + method + " " + p);
}

export default {
  /* Once a day (the cron in wrangler.toml): photos nothing has held for the
     whole grace period, and chat photos no message shows. See photos.js. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      sweepPhotos(env)
        .then((r) => console.log("photo sweep", JSON.stringify(r)))
        .catch((e) => console.error("photo sweep failed", e && e.message ? e.message : e))
    );
  },

  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const res = await route(request, env, new URL(request.url), ctx);
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
