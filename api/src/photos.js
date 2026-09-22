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
 * WHEN ONE GOES. A photo is deleted once nothing holds it any more. The
 * holders are written down in `photo_refs` (migration 0008): every library
 * row that names the photo, in every profile, and every chat card that
 * shows it. A row that lets go of its photo, a deleted exercise, a deleted
 * profile and an unsent card each remove their holding, and a photo left
 * with none is MARKED (`orphaned_at`) rather than deleted there and then:
 * the daily sweep (sweepPhotos, the Worker's `scheduled` handler) deletes
 * it once PHOTO_GRACE_MS has passed. The grace is for the one ordinary
 * moment a photo has no holder at all -- the app uploads a picture BEFORE
 * it pushes the row that names it -- and a push that names a photo the
 * server no longer has is told so (`missingPhotos`), so the phone that
 * still holds the picture puts it back. Nobody is left pointing at nothing.
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

/* How long a library photo nobody holds is kept before the sweep takes it.
   Long enough for a phone that uploaded a picture and then lost its signal
   before pushing the row to come back, short enough that a photo somebody
   deleted is really gone within days. A chat photo that never made it into
   a message (a send that failed and was never retried) gets a week. The
   environment can shorten both, which is only ever done for a local test. */
export const PHOTO_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
export const CHAT_PHOTO_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const graceOf = (env, fallback) => {
  const v = env.PHOTO_GRACE_MS;
  return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback;
};

export const itemHolder = (profileId, itemId) => "item:" + profileId + ":" + itemId;
export const msgHolder = (messageId) => "msg:" + messageId;

/* D1 takes at most 100 bound parameters, so anything with an IN list goes
   through here in pieces */
const chunks = (list, n = 90) => {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};
const marks = (list) => list.map(() => "?").join(",");

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
  if (have) {
    /* asked for again, so about to be named again: an orphan's clock starts
       over rather than letting the sweep take it between here and the push */
    await env.DB.prepare("UPDATE photos SET orphaned_at = ? WHERE id = ? AND orphaned_at IS NOT NULL")
      .bind(Date.now(), id).run();
    return { status: 200, body: { photoId: id, stored: false } };
  }

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
     moment are both right, and whichever lands second has nothing to add.
     A library photo arrives UNHELD — the row naming it comes after — so its
     grace period starts now and the push that names it stops the clock. */
  const now = Date.now();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO photos (id, data, size, owner_id, thread_id, created_at, orphaned_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, data, data.length, user.id, threadId || null, now, threadId ? null : now).run();
  return { status: 201, body: { photoId: id, stored: true } };
}

/* ── WHO HOLDS WHAT ──────────────────────────────────────────────────────
   Point each holder at exactly the photos given for it (an empty list lets
   go of everything it held), then settle the photos that changed hands:
   anything newly held stops being an orphan, anything let go of with no
   other holder left becomes one. Returns the newly held ids the store does
   not have, so the caller can tell the phone that sent them.

   `want` maps holder -> array of photo ids. Holders not in it are untouched. */
export async function setHoldings(env, want) {
  const holders = Object.keys(want);
  if (!holders.length) return { missing: [] };
  const had = new Map(holders.map((h) => [h, new Set()]));
  for (const part of chunks(holders)) {
    const rows = await env.DB.prepare(
      "SELECT photo_id, holder FROM photo_refs WHERE holder IN (" + marks(part) + ")"
    ).bind(...part).all();
    for (const r of rows.results || []) had.get(r.holder).add(r.photo_id);
  }

  const stmts = [];
  const added = new Set(), dropped = new Set();
  for (const h of holders) {
    const next = new Set((want[h] || []).filter(isPhotoId));
    const prev = had.get(h);
    for (const id of prev) if (!next.has(id)) {
      stmts.push(env.DB.prepare("DELETE FROM photo_refs WHERE photo_id = ? AND holder = ?").bind(id, h));
      dropped.add(id);
    }
    for (const id of next) if (!prev.has(id)) {
      stmts.push(env.DB.prepare("INSERT OR IGNORE INTO photo_refs (photo_id, holder) VALUES (?, ?)").bind(id, h));
      added.add(id);
    }
  }
  for (const part of chunks(stmts, 50)) await env.DB.batch(part);

  const now = Date.now();
  for (const part of chunks([...added])) {
    await env.DB.prepare(
      "UPDATE photos SET orphaned_at = NULL WHERE id IN (" + marks(part) + ") AND orphaned_at IS NOT NULL"
    ).bind(...part).run();
  }
  /* Every photo named in this call is checked, not only the newly held
     ones: the sweep never takes a held photo, so a named one that is not
     here was lost some other way, and the phone naming it is the one that
     can put it back. */
  const missing = [];
  const named = [...new Set(Object.values(want).flat().filter(isPhotoId))];
  for (const part of chunks(named)) {
    const found = await env.DB.prepare("SELECT id FROM photos WHERE id IN (" + marks(part) + ")").bind(...part).all();
    const have = new Set((found.results || []).map((r) => r.id));
    for (const id of part) if (!have.has(id)) missing.push(id);
  }
  await markOrphans(env, [...dropped], now);
  return { missing };
}

/* Everything one holder prefix holds -- every row of a profile being
   deleted -- let go of at once. A range rather than LIKE, so the holder
   index answers it. */
export async function dropHoldingsUnder(env, prefix) {
  const hi = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
  const rows = await env.DB.prepare(
    "SELECT photo_id FROM photo_refs WHERE holder >= ? AND holder < ?"
  ).bind(prefix, hi).all();
  const ids = [...new Set((rows.results || []).map((r) => r.photo_id))];
  if (!ids.length) return 0;
  await env.DB.prepare("DELETE FROM photo_refs WHERE holder >= ? AND holder < ?").bind(prefix, hi).run();
  await markOrphans(env, ids, Date.now());
  return ids.length;
}

async function markOrphans(env, ids, now) {
  for (const part of chunks(ids)) {
    await env.DB.prepare(
      "UPDATE photos SET orphaned_at = ? WHERE id IN (" + marks(part) + ") AND thread_id IS NULL AND orphaned_at IS NULL " +
      "AND NOT EXISTS (SELECT 1 FROM photo_refs r WHERE r.photo_id = photos.id)"
    ).bind(now, ...part).run();
  }
}

/* The library photos a chat card shows: an exercise or a record's own, its
   parent's when it is a variation, and every lift of a preset, a logged
   day or a planned day. Read loosely, because a payload is the sending
   app's shape and the server only needs the ids out of it. */
export function payloadPhotoIds(payload) {
  const out = new Set();
  const take = (snap) => {
    if (!snap || typeof snap !== "object") return;
    if (isPhotoId(snap.photo)) out.add(snap.photo);
    if (snap.parent && typeof snap.parent === "object" && isPhotoId(snap.parent.photo)) out.add(snap.parent.photo);
  };
  if (payload && typeof payload === "object") {
    take(payload.ex);
    if (Array.isArray(payload.lib)) payload.lib.slice(0, 200).forEach(take);
  }
  return [...out];
}

/* ── THE SWEEP ───────────────────────────────────────────────────────────
   Once a day, from the Worker's `scheduled` handler. A library photo goes
   when it has been unheld for the whole grace period AND is still unheld
   now; a chat photo goes when no live message in its thread shows it, a
   week after it was uploaded. Both conditions are re-checked in the DELETE
   itself, so a holder that turned up since the photo was marked saves it. */
export async function sweepPhotos(env, now = Date.now()) {
  const lib = await env.DB.prepare(
    "DELETE FROM photos WHERE thread_id IS NULL AND orphaned_at IS NOT NULL AND orphaned_at <= ? " +
    "AND NOT EXISTS (SELECT 1 FROM photo_refs r WHERE r.photo_id = photos.id)"
  ).bind(now - graceOf(env, PHOTO_GRACE_MS)).run();
  const chat = await env.DB.prepare(
    "DELETE FROM photos WHERE thread_id IS NOT NULL AND created_at <= ? AND NOT EXISTS (" +
    "  SELECT 1 FROM chat_messages m WHERE m.thread_id = photos.thread_id AND m.deleted = 0 AND m.kind = 'image' " +
    "  AND json_extract(m.payload, '$.photo') = photos.id)"
  ).bind(now - graceOf(env, CHAT_PHOTO_GRACE_MS)).run();
  return {
    library: (lib.meta && lib.meta.changes) || 0,
    chat: (chat.meta && chat.meta.changes) || 0,
  };
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
    const have = (rows.results || []).map((r) => r.id);
    /* a phone asking about an id is about to name it in a row: an orphan's
       clock starts over, as it does for an upload of one already here */
    if (have.length) {
      await env.DB.prepare(
        "UPDATE photos SET orphaned_at = ? WHERE id IN (" + have.map(() => "?").join(",") + ") AND orphaned_at IS NOT NULL"
      ).bind(Date.now(), ...have).run();
    }
    return json({ have });
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
