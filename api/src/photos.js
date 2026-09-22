/* Photos: a store of their own, beside the items rather than inside them.
 *
 * WHY THEY LEFT THE ITEMS. An exercise photo used to be a field on its
 * library row, which made it by far the biggest thing sync ever moved: a
 * 1000px JPEG in base64 is 100-700 KB, against a few hundred bytes for the
 * lift it belongs to. A row over the item limit was sent without its photo
 * so that the lift could still travel, and the other phone got a
 * placeholder where the machine should have been. Every pull of a library
 * also re-sent every photo on the page it happened to be on.
 *
 * So a photo is uploaded ONCE, here, and the row carries only its id. The
 * id is the SHA-256 of the data URL, which buys three things at once: the
 * same picture uploaded by two devices is one row, a device can ask "do you
 * have these" before spending the upload, and the server can check that
 * the bytes it is handed are the bytes the id names -- so nobody can store
 * a different picture under an id somebody else's library points at.
 *
 * WHO MAY READ ONE. A library photo is readable by anybody signed in who
 * holds its id. The id is 256 bits of hash nobody can guess, and it only
 * ever travels inside a profile (to whoever the profile is shared with) or
 * inside a message (to whoever it was sent to), which are exactly the
 * people who should see it. A chat photo is stricter, because a photo sent
 * in a conversation is not a picture of a machine: it is readable only by
 * the members of its thread, and it goes when the message is unsent. See
 * chat.js for that half.
 *
 * WHY A DATA URL AND NOT BYTES. The app stores and draws data URLs, the
 * id is a hash of the string, and a Worker on the free plan has ten
 * milliseconds of CPU per request. Keeping the string as it is means the
 * server never decodes base64 in either direction: it hashes what it is
 * sent and hands back what it stored.
 */

import { limited } from "./limits.js";

/* A 1000px JPEG at the app's own quality is 100-300 KB of base64 and the
   worst real one seen was about 700 KB. This leaves room for that and
   keeps every row well under D1's 2 MB ceiling. */
export const MAX_PHOTO_CHARS = 1_400_000;

/* Per account, counted over what it uploaded first. Generous for a
   library of machines and a chat's worth of pictures, and a ceiling on
   what one account stuck in a loop can cost everybody else. */
export const MAX_ACCOUNT_PHOTO_CHARS = 150 * 1024 * 1024;

const UPLOAD_WINDOW_MS = 10 * 60_000;
const UPLOAD_MAX_PER_WINDOW = 150;

export const isPhotoId = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/* The three formats the app writes (WebP where the browser can encode it,
   JPEG otherwise, PNG from an old fallback) and nothing else: a data URL
   is drawn straight into an <img>, and an image/svg+xml one can carry
   script. */
export function cleanDataUrl(v) {
  if (typeof v !== "string" || v.length > MAX_PHOTO_CHARS) return null;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) ? v : null;
}

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* One upload, whichever kind. Returns {status, body}: the caller owns its
   reply helpers. An id already stored is a success, not a conflict --
   the whole point of a content id is that asking twice is free. */
export async function storePhoto(env, user, id, data, threadId) {
  const have = await env.DB.prepare("SELECT id FROM photos WHERE id = ?").bind(id).first();
  if (have) return { status: 200, body: { photoId: id, stored: false } };

  if (await limited(env, "photo:up:" + user.id, UPLOAD_WINDOW_MS, UPLOAD_MAX_PER_WINDOW)) {
    return { status: 429, body: { error: "too_fast", message: "Too many photos at once. Wait a few minutes." } };
  }
  const used = await env.DB.prepare(
    "SELECT COALESCE(SUM(size), 0) AS n FROM photos WHERE owner_id = ?"
  ).bind(user.id).first();
  if ((used ? used.n : 0) + data.length > MAX_ACCOUNT_PHOTO_CHARS) {
    return { status: 413, body: { error: "photo_quota", message: "This account has stored as many photos as it can." } };
  }

  /* OR IGNORE, because two devices uploading the same picture at the same
     moment are both right, and whichever lands second has nothing to add */
  await env.DB.prepare(
    "INSERT OR IGNORE INTO photos (id, data, size, owner_id, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, data, data.length, user.id, threadId || null, Date.now()).run();
  return { status: 201, body: { photoId: id, stored: true } };
}

/* Returns a Response, or null when the path is not one of ours. */
export async function photoRoute(ctx) {
  const { request, env, method, seg, user, json, fail, readJson } = ctx;
  if (seg[1] !== "photos") return null;

  /* ---- which of these do you already have -------------------------------
     Asked before uploading, so a device that received a photo the old way
     (inside its row) and has just worked out its id does not send three
     hundred kilobytes the server is already holding. */
  if (seg[2] === "have" && seg.length === 3 && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.filter(isPhotoId).slice(0, 90) : [];
    if (!ids.length) return json({ have: [] });
    const rows = await env.DB.prepare(
      "SELECT id FROM photos WHERE id IN (" + ids.map(() => "?").join(",") + ")"
    ).bind(...ids).all();
    return json({ have: (rows.results || []).map((r) => r.id) });
  }

  if (seg.length !== 3 || !isPhotoId(seg[2])) return null;
  const id = seg[2];

  /* ---- upload a library photo -------------------------------------------
     PUT, because the client names the resource: the id is the hash of what
     it is about to send, and the server's only job is to check that. */
  if (method === "PUT") {
    let body;
    try { body = await readJson(request, MAX_PHOTO_CHARS + 4096); }
    catch { return fail(413, "too_large", "That photo is too big."); }
    const data = cleanDataUrl(body && body.data);
    if (!data) return fail(400, "bad_photo", "That is not a JPEG, PNG or WebP data URL, or it is too big.");
    if ((await sha256Hex(data)) !== id) {
      return fail(400, "bad_photo_id", "That photo does not match its id.");
    }
    const res = await storePhoto(env, user, id, data, null);
    return json(res.body, res.status);
  }

  /* ---- read one ---------------------------------------------------------
     Immutable by construction (the id IS the content), so the reply says
     so and a browser never asks twice. A chat photo answers to its thread's
     members only, and "not yours" is the same 404 as "not there". */
  if (method === "GET") {
    const row = await env.DB.prepare("SELECT id, data, thread_id FROM photos WHERE id = ?").bind(id).first();
    if (row && row.thread_id) {
      const member = await env.DB.prepare(
        "SELECT 1 AS ok FROM chat_members WHERE thread_id = ? AND user_id = ? AND left_at IS NULL"
      ).bind(row.thread_id, user.id).first();
      if (!member) return fail(404, "not_found", "No such photo.");
    }
    if (!row) return fail(404, "not_found", "No such photo.");
    const res = json({ photoId: row.id, data: row.data });
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "private, max-age=31536000, immutable");
    return new Response(res.body, { status: 200, headers });
  }

  return null;
}
