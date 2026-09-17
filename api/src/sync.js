/* Sync transport rules.
 *
 * This file holds the two decisions that must not live in a route handler:
 * what is allowed to leave a phone, and how big a thing may be.
 *
 * It deliberately knows nothing about merging. What a log entry means, and
 * which of two edits wins, is app.js's business. The server's only opinions
 * are: the timestamp is mine, the allowlist is closed, and a delete is a row
 * rather than an absence.
 */

/* Closed allowlist. A collection that is not named here is rejected with the
 * name in the error, not dropped quietly, so a mistake on the client surfaces
 * as a failing request instead of data that silently never syncs.
 *
 * Excluded on purpose:
 *   drafts   a snapshot of a half-typed form, mid-set. Never anyone else's.
 *   timers   each carries a handle on a push alarm booked for ONE device.
 *            Same class as the device token: it must not travel.
 */
export const COLLECTIONS = new Set([
  "log",
  "body",
  "goals",
  "volumeGoals",
  "presets",
  "plans",
  "deloads",
  "dayDrafts",
  "unlogged",
  "library",
  "groups",
  "settings",
]);

/* `settings` is one row per key, so the split runs per key rather than per
 * collection. theme and lang describe the phone, not the training: syncing
 * them would flip her app to dark because he prefers it. */
export const SETTINGS_KEYS = new Set(["units", "startDate", "weekMode", "sex", "name"]);

/* D1 caps a row at 2 MB. 512 KB leaves room for the row's other columns and
 * still fits any sane exercise photo. An oversized item is named in the error
 * so the offending exercise can be found, rather than failing the whole
 * push with no clue which item did it. */
export const MAX_ITEM_BYTES = 512 * 1024;
export const MAX_ITEMS_PER_PUSH = 200;
export const MAX_PUSH_BODY_BYTES = 4 * 1024 * 1024;

/* A page is capped by both count and bytes. Count alone is not enough: 200
 * library rows with photos is a response nothing wants to receive on mobile
 * data. */
export const PAGE_DEFAULT = 200;
export const PAGE_MAX = 500;
export const PAGE_BYTE_BUDGET = 900 * 1024;

/* D1 allows 100 bound parameters per query, so a push cannot be one big
 * INSERT. Statements go through db.batch() instead, one per item. */
export const BATCH_CHUNK = 50;

/* ── THE LAST THING STANDING BETWEEN A BUG AND EVERYBODY'S TRAINING ────
 * A tombstone is the one write here that cannot be undone and that reaches
 * every device on the account at once. The client decides to send one by
 * INFERENCE — it holds a mark with no item behind it — so any bug that
 * empties or half-fills a phone's local copy arrives at this endpoint
 * indistinguishable from a person deleting their whole log.
 *
 * Three such bugs shipped. They were fixed on the client, which protects
 * exactly the devices running the fixed client: the app is served from a
 * cache-first service worker, so an old build can go on pushing for days,
 * and it only takes one to empty the profile for everyone. This is the
 * half of the fix that does not depend on which build is asking.
 *
 * The rule is deliberately crude, because a sharp one would need to know
 * what the client meant. A batch may not delete more than half of what the
 * profile is currently holding, once it is deleting more than a handful.
 * Ordinary tidying — scrapping a day, clearing a few goals, renaming a
 * group — is single figures and never comes near it. `allowWipe` is the
 * escape, and the client only sets it when the user has said "replace what
 * is there" out loud, behind a confirm: restoring a backup, or a reset.
 *
 * Counted per batch rather than per push, because a push arrives as up to
 * 200 items at a time and there is no transaction spanning them. Halving
 * rather than comparing outright is what makes that safe: a wipe split
 * across two batches is caught on the first, not after the first has
 * already landed.                                                        */
export const WIPE_FLOOR = 10;

export function wipeRefused(deletions, liveCount) {
  return deletions >= WIPE_FLOOR && deletions * 2 > liveCount;
}

export function validateItem(item) {
  if (!item || typeof item !== "object") return "item is not an object";

  const { collection, itemId } = item;
  if (typeof collection !== "string" || !COLLECTIONS.has(collection)) {
    return "unknown collection: " + String(collection);
  }
  if (typeof itemId !== "string" || !itemId || itemId.length > 200) {
    return "bad itemId in " + collection;
  }
  if (collection === "settings" && !SETTINGS_KEYS.has(itemId)) {
    return "setting '" + itemId + "' is device-local and does not sync";
  }

  if (item.deleted) return null;          // a tombstone carries no payload

  if (item.json === undefined) return "missing json for " + collection + "/" + itemId;

  let encoded;
  try { encoded = JSON.stringify(item.json); }
  catch { return "json is not serialisable for " + collection + "/" + itemId; }

  if (encoded.length > MAX_ITEM_BYTES) {
    return collection + "/" + itemId + " is " + Math.round(encoded.length / 1024) +
           " KB, over the " + Math.round(MAX_ITEM_BYTES / 1024) + " KB limit";
  }
  return null;
}

/* The cursor is the last row of a page, not a timestamp, so a millisecond
 * shared by twenty rows cannot drop or repeat one of them. It is opaque to
 * the client on purpose: the shape is free to change. */
export function encodeCursor(row) {
  return btoa(JSON.stringify([row.updated_at, row.collection, row.item_id]))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor) {
  try {
    const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const [updatedAt, collection, itemId] = JSON.parse(atob(b64));
    if (typeof updatedAt !== "number" || typeof collection !== "string" || typeof itemId !== "string") {
      return null;
    }
    return { updatedAt, collection, itemId };
  } catch { return null; }
}
