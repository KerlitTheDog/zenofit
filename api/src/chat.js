/* Messages between accounts.
 *
 * WHY THIS IS NOT SYNC. Everything in sync.js moves rows of a PROFILE
 * between a person's own devices, and the transport there is deliberately
 * dumb because the app owns the merge. A message is a different animal in
 * every one of those respects: it belongs to an account rather than a
 * profile, it travels to somebody ELSE, it is never edited so there is
 * nothing to merge, and it is append-only so "what is new" is a question
 * with one honest answer. Pushing it through `items` would have meant
 * filing a conversation under a training profile -- the wrong owner, shared
 * with whoever holds that profile's code, and carried away in a backup file.
 *
 * So: its own tables (migration 0006), its own routes, and no contact with
 * `items`, `profiles`, seeds or grants.
 *
 * THE SERVER'S CLOCK STAMPS A MESSAGE, for the same reason it stamps an
 * item: a phone that is three seconds off must not be able to sort itself
 * above the reply it is answering. `clientId` is the app's own handle on a
 * message it has already drawn on screen, and it exists so a retry lands on
 * the same row instead of sending twice.
 */

import { limited } from "./limits.js";
import { cleanDataUrl, sha256Hex, storePhoto, setHoldings, msgHolder, payloadPhotoIds, isPhotoId } from "./photos.js";

/* Long enough for anything anybody types into a gym app, short enough that
   a thread is never a payload problem. */
export const MAX_BODY = 2000;

/* ── WHAT A MESSAGE CAN CARRY ──────────────────────────────────────────
   Words, or a thing from the app: an exercise, a preset, a logged day, a
   personal record, a strength-standard rank, a photo. The thing travels as
   a SNAPSHOT the sender's app built, not as a pointer into their profile,
   because the person receiving it has no access to that profile and never
   should: they get a copy, look at it, and may keep one of their own.

   The server does not read these. It checks the kind is one it knows, the
   payload is an object and not an essay, and -- for a photo -- that the
   picture it names was uploaded into THIS thread, so nobody can point a
   message at a photo from somebody else's conversation. Everything else
   about a payload is the app's business, and the app treats one arriving
   from somebody else as data to be escaped, never as markup. */
export const KINDS = new Set(["text", "image", "exercise", "preset", "workout", "plan", "record", "rank"]);
export const MAX_PAYLOAD = 32 * 1024;

/* A photo sent in a conversation lives in the photo store with its thread
   on it (see photos.js), readable by that thread's members and nobody else. */
export const chatPhotoId = (threadId, data) => sha256Hex(threadId + ":" + data);
export const PAGE_DEFAULT = 60;
export const PAGE_MAX = 200;

/* Per minute, per account. Not a spam defence -- a chat between five people
   cannot be spammed into a bill -- it is the same guard join_attempts has:
   nothing in a loop should be able to burn the free request budget. */
const SEND_WINDOW_MS = 60_000;
const SEND_MAX_PER_WINDOW = 60;

/* How much of a message goes in a notification. The rest is behind the tap. */
const PREVIEW = 120;

export const cleanBody = (v) => {
  if (typeof v !== "string") return "";
  /* Trailing whitespace is invisible, and a message of nothing but it is a
     misfire rather than a message. Inner newlines are kept: people write
     lists. */
  const s = v.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
  return s.slice(0, MAX_BODY);
};

export const cleanClientId = (v) =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;

/* Both ids, sorted, so the same pair of people always produces the same key
   whichever of them tapped first. The UNIQUE index on it is what stops two
   taps at once becoming two half-conversations. */
export const dmKey = (a, b) => (a < b ? a + ":" + b : b + ":" + a);

const preview = (s) => (s.length > PREVIEW ? s.slice(0, PREVIEW - 1) + "…" : s);

/* Membership is the only access rule chat has. A thread you are not in is
   reported as absent rather than forbidden, exactly as a profile is: a 403
   would confirm the thread exists to somebody guessing ids. */
async function membership(env, threadId, userId) {
  return env.DB.prepare(
    "SELECT thread_id, user_id, last_read_at, muted FROM chat_members " +
    "WHERE thread_id = ? AND user_id = ? AND left_at IS NULL"
  ).bind(threadId, userId).first();
}

function parsePayload(text) {
  if (text == null) return null;
  try { const v = JSON.parse(text); return v && typeof v === "object" ? v : null; } catch { return null; }
}

const shapeMessage = (r) => ({
  messageId: r.id,
  threadId: r.thread_id,
  from: r.sender_id,
  body: r.deleted ? null : r.body,
  kind: r.kind || "text",
  payload: r.deleted ? null : parsePayload(r.payload),
  at: r.created_at,
  clientId: r.client_id || null,
  deleted: !!r.deleted,
});

/* Whether either of two people has blocked the other, and which. One query,
   because the consequence is the same either way: no messages pass. */
async function blockedBetween(env, a, b) {
  const row = await env.DB.prepare(
    "SELECT user_id FROM chat_blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)"
  ).bind(a, b, b, a).first();
  return row ? row.user_id : null;
}

/* ── the routes ───────────────────────────────────────────────────────────
 * Returns a Response, or null when nothing here matches, so index.js can
 * carry on down its own list. `ctx` carries the pieces index.js owns (its
 * reply helpers, its id generator, the push sender) rather than this file
 * growing a second copy of each.
 */
export async function chatRoute(ctx) {
  const { request, env, url, method, seg, user, json, fail, readJson, newId, sendToUser } = ctx;

  /* ---- finding somebody -------------------------------------------------
   * Prefix search on the username, which is the only name an account has
   * that is unique and typed by its owner. Deliberately a PREFIX and not a
   * contains: a substring search over every account is a directory, and
   * "who is on this app" is not a question a stranger gets to ask.
   *
   * Only claimed accounts appear. A device that has never registered has no
   * username, cannot be addressed, and is not a person as far as this is
   * concerned.
   */
  if (seg[1] === "users" && seg[2] === "search" && seg.length === 3 && method === "GET") {
    const raw = (url.searchParams.get("q") || "").trim().toLowerCase();
    const q = raw.replace(/[^a-z0-9._-]/g, "");
    /* Two characters, so the first keystroke does not hand back an
       alphabet's worth of accounts. */
    if (q.length < 2) return json({ q: raw, users: [] });

    /* LIKE with an escaped prefix: _ and % are wildcards in SQL and legal
       in a username, so "a_" must not match "ab". */
    const like = q.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
    const rows = await env.DB.prepare(
      "SELECT u.id, u.username, u.display_name FROM users u " +
      "WHERE u.username_lc LIKE ? ESCAPE '\\' AND u.id != ? " +
      "  AND NOT EXISTS (SELECT 1 FROM chat_blocks b " +
      "    WHERE (b.user_id = ? AND b.blocked_id = u.id) OR (b.user_id = u.id AND b.blocked_id = ?)) " +
      "ORDER BY LENGTH(u.username_lc), u.username_lc LIMIT 15"
    ).bind(like, user.id, user.id, user.id).all();

    return json({
      q: raw,
      users: (rows.results || []).map((r) => ({
        userId: r.id, username: r.username, displayName: r.display_name,
      })),
    });
  }

  if (seg[1] !== "chats") return null;

  /* ---- blocking ---------------------------------------------------------
   * Above the thread routes, because "blocks" would otherwise be read as a
   * thread id. The other half of a searchable username: a block is one
   * direction in the table and both in effect, since one that still let
   * their side send would only be a filter on my own screen.
   */
  if (seg[2] === "blocks") {
    if (seg.length === 3 && method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT b.blocked_id, u.username, b.created_at FROM chat_blocks b " +
        "LEFT JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC"
      ).bind(user.id).all();
      return json({
        blocks: (rows.results || []).map((r) => ({
          userId: r.blocked_id, username: r.username, at: r.created_at,
        })),
      });
    }

    if (seg.length === 3 && method === "POST") {
      const body = await readJson(request).catch(() => ({}));
      const other = typeof body.userId === "string" ? body.userId : "";
      if (!other || other === user.id) return fail(400, "bad_request", "Who?");
      await env.DB.prepare(
        "INSERT INTO chat_blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(user_id, blocked_id) DO NOTHING"
      ).bind(user.id, other, Date.now()).run();
      return json({ userId: other, blocked: true }, 201);
    }

    if (seg.length === 4 && method === "DELETE") {
      await env.DB.prepare("DELETE FROM chat_blocks WHERE user_id = ? AND blocked_id = ?")
        .bind(user.id, seg[3]).run();
      return json({ userId: seg[3], blocked: false });
    }
  }

  /* ---- the thread list --------------------------------------------------
   * One row per conversation, carrying the last message and how many of
   * them this person has not read. The count is DERIVED rather than stored:
   * a stored counter is a second opinion about the messages, and the one
   * thing worse than a wrong badge is a wrong badge nobody can explain.
   */
  if (seg.length === 2 && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT t.id, t.kind, t.title, t.created_at, t.last_message_at, m.last_read_at, m.muted, " +
      "  (SELECT COUNT(*) FROM chat_messages x WHERE x.thread_id = t.id AND x.deleted = 0 " +
      "     AND x.created_at > m.last_read_at AND x.sender_id != ?) AS unread, " +
      "  (SELECT x.body FROM chat_messages x WHERE x.thread_id = t.id AND x.deleted = 0 " +
      "     ORDER BY x.created_at DESC, x.id DESC LIMIT 1) AS last_body, " +
      "  (SELECT x.sender_id FROM chat_messages x WHERE x.thread_id = t.id AND x.deleted = 0 " +
      "     ORDER BY x.created_at DESC, x.id DESC LIMIT 1) AS last_from, " +
      "  (SELECT x.kind FROM chat_messages x WHERE x.thread_id = t.id AND x.deleted = 0 " +
      "     ORDER BY x.created_at DESC, x.id DESC LIMIT 1) AS last_kind " +
      "FROM chat_members m JOIN chat_threads t ON t.id = m.thread_id " +
      "WHERE m.user_id = ? AND m.left_at IS NULL " +
      /* ── A CONVERSATION NOBODY HAS SAID ANYTHING IN IS NOT IN YOUR LIST ──
         unless you opened it yourself. Tapping somebody's name makes the
         thread for both people, and used to put an empty conversation in
         the OTHER person's list before a word was written. With unsending
         it matters more: take back the only message you sent and they
         would be left looking at a chat with you in it and nothing in it,
         which is not "as if it was never sent". last_message_at is NULL
         exactly when there is nothing live in the thread. */
      "  AND (t.last_message_at IS NOT NULL OR t.created_by = ? OR m.opened_at IS NOT NULL) " +
      "ORDER BY COALESCE(t.last_message_at, t.created_at) DESC LIMIT 100"
    ).bind(user.id, user.id, user.id).all();

    const threads = rows.results || [];
    if (!threads.length) return json({ chats: [], serverNow: Date.now() });

    /* Everybody else in those threads, in one query rather than one per
       thread: a DM is named by who is in it, so this IS the name. */
    const ids = threads.map((t) => t.id);
    const marks = ids.map(() => "?").join(",");
    const people = await env.DB.prepare(
      "SELECT cm.thread_id, u.id, u.username, u.display_name FROM chat_members cm " +
      "JOIN users u ON u.id = cm.user_id " +
      "WHERE cm.thread_id IN (" + marks + ") AND cm.user_id != ?"
    ).bind(...ids, user.id).all();

    const byThread = new Map();
    for (const r of people.results || []) {
      if (!byThread.has(r.thread_id)) byThread.set(r.thread_id, []);
      byThread.get(r.thread_id).push({ userId: r.id, username: r.username, displayName: r.display_name });
    }

    return json({
      chats: threads.map((t) => ({
        threadId: t.id,
        kind: t.kind,
        title: t.title,
        members: byThread.get(t.id) || [],
        unread: t.unread || 0,
        muted: !!t.muted,
        lastReadAt: t.last_read_at,
        lastMessage: t.last_body == null ? null
          : { body: t.last_body, from: t.last_from, at: t.last_message_at, kind: t.last_kind || "text" },
        createdAt: t.created_at,
        lastMessageAt: t.last_message_at,
      })),
      serverNow: Date.now(),
    });
  }

  /* ---- open a chat with somebody ----------------------------------------
   * Find-or-create, and never a second one. Tapping a name is not "make me
   * a conversation", it is "take me to the conversation with this person",
   * which is the same request whether or not it exists yet.
   */
  if (seg.length === 2 && method === "POST") {
    const body = await readJson(request).catch(() => ({}));
    const other = typeof body.userId === "string" ? body.userId : "";
    if (!other || other === user.id) return fail(400, "bad_request", "Who do you want to talk to?");

    const them = await env.DB.prepare(
      "SELECT id, username, display_name FROM users WHERE id = ? AND username_lc IS NOT NULL"
    ).bind(other).first();
    if (!them) return fail(404, "not_found", "No account by that id.");

    const who = await blockedBetween(env, user.id, other);
    if (who) {
      return who === user.id
        ? fail(409, "you_blocked", "You have blocked this person. Unblock them to write to them.")
        : fail(403, "blocked", "You cannot start a chat with this person.");
    }

    const key = dmKey(user.id, other);
    const now = Date.now();
    const existing = await env.DB.prepare("SELECT id FROM chat_threads WHERE dm_key = ?").bind(key).first();

    let threadId = existing && existing.id;
    if (!threadId) {
      threadId = newId();
      try {
        await env.DB.prepare(
          "INSERT INTO chat_threads (id, kind, created_by, created_at, dm_key) VALUES (?, 'dm', ?, ?, ?)"
        ).bind(threadId, user.id, now, key).run();
      } catch {
        /* The UNIQUE index caught a simultaneous create. Whoever won made
           the thread we wanted anyway, so take theirs. */
        const race = await env.DB.prepare("SELECT id FROM chat_threads WHERE dm_key = ?").bind(key).first();
        if (!race) return fail(500, "server_error", "Could not open that chat.");
        threadId = race.id;
      }
    }

    /* Both rows, every time. Clearing `left_at` on conflict is what makes
       writing to somebody you had previously cleared out of your list put
       the thread back, for both of you, without making a second one. */
    /* `opened_at` is on the caller's row only: it is what keeps a thread
       with nothing in it yet in the list of the person who asked for it,
       and out of the list of the person who has not heard from them. */
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO chat_members (thread_id, user_id, joined_at, opened_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(thread_id, user_id) DO UPDATE SET left_at = NULL, opened_at = excluded.opened_at"
      ).bind(threadId, user.id, now, now),
      env.DB.prepare(
        "INSERT INTO chat_members (thread_id, user_id, joined_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(thread_id, user_id) DO UPDATE SET left_at = NULL"
      ).bind(threadId, other, now),
    ]);

    return json({
      threadId,
      kind: "dm",
      members: [{ userId: them.id, username: them.username, displayName: them.display_name }],
      created: !existing,
    }, existing ? 200 : 201);
  }

  /* everything past here is about one thread, and needs to be in it */
  if (seg.length >= 3 && seg[2]) {
    const threadId = seg[2];
    const mine = await membership(env, threadId, user.id);
    /* Same reply for "no such thread" and "not yours", for the reason the
       profile routes give. */
    if (!mine) return fail(404, "not_found", "No such chat, or you are not in it.");

    /* ---- the messages -------------------------------------------------
     * `since` pulls what is new, `before` pages backwards into history,
     * and the default is the tail of the thread. A `since` pull is
     * inclusive of its boundary millisecond and the app dedupes by id, for
     * the reason the change feed gives: a repeat is harmless and a gap is
     * not.
     *
     * AN UNSENT MESSAGE IS NOT IN ANY PAGE. It is not drawn as a "message
     * deleted" row either: unsending means the other person sees what they
     * would have seen had it never been sent. So every page leaves them
     * out, and a `since` pull also names the ones unsent since then
     * (`unsent`), because a message is unsent AFTER it was fetched and its
     * `created_at` never moves -- without the list, the copy already on the
     * other phone would stay there for ever. A tail or a `before` page
     * needs no list: it is a complete window, and the app drops anything it
     * holds inside that window that the page does not mention.
     */
    if (seg[3] === "messages" && seg.length === 4 && method === "GET") {
      const limit = Math.min(PAGE_MAX, Math.max(1, Number(url.searchParams.get("limit")) || PAGE_DEFAULT));
      const since = Number(url.searchParams.get("since"));
      const before = Number(url.searchParams.get("before"));
      const isSince = Number.isFinite(since) && since > 0;

      let rows;
      if (isSince) {
        rows = await env.DB.prepare(
          "SELECT * FROM chat_messages WHERE thread_id = ? AND deleted = 0 AND created_at >= ? " +
          "ORDER BY created_at, id LIMIT ?"
        ).bind(threadId, since, limit + 1).all();
      } else if (Number.isFinite(before) && before > 0) {
        /* newest-first off the index, then flipped, so "the 60 before this"
           is one query rather than a count and an offset */
        rows = await env.DB.prepare(
          "SELECT * FROM chat_messages WHERE thread_id = ? AND deleted = 0 AND created_at < ? " +
          "ORDER BY created_at DESC, id DESC LIMIT ?"
        ).bind(threadId, before, limit + 1).all();
      } else {
        rows = await env.DB.prepare(
          "SELECT * FROM chat_messages WHERE thread_id = ? AND deleted = 0 ORDER BY created_at DESC, id DESC LIMIT ?"
        ).bind(threadId, limit + 1).all();
      }

      let list = rows.results || [];
      const hasMore = list.length > limit;
      if (hasMore) list = list.slice(0, limit);
      /* always handed over oldest-first, whichever way it was read */
      const asc = isSince ? list : list.slice().reverse();

      let unsent = [];
      if (isSince) {
        const gone = await env.DB.prepare(
          "SELECT id FROM chat_messages WHERE thread_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ?"
        ).bind(threadId, since).all();
        unsent = (gone.results || []).map((r) => r.id);
      }

      return json({
        threadId,
        messages: asc.map(shapeMessage),
        unsent,
        hasMore,
        lastReadAt: mine.last_read_at,
        serverNow: Date.now(),
      });
    }

    /* ---- a photo for this conversation ----------------------------------
     * Uploaded before the message that shows it, and filed under the
     * thread: only its members can read it (photos.js), and unsending the
     * message deletes it. The id is a hash of the thread and the picture,
     * so a retried upload lands on the row the first one made.
     */
    if (seg[3] === "photos" && seg.length === 4 && method === "POST") {
      let body;
      try { body = await readJson(request, 1_500_000); }
      catch { return fail(413, "too_large", "That photo is too big."); }
      const data = cleanDataUrl(body && body.data);
      if (!data) return fail(400, "bad_photo", "That is not a JPEG, PNG or WebP data URL, or it is too big.");
      const res = await storePhoto(env, user, await chatPhotoId(threadId, data), data, threadId);
      return json(res.body, res.status);
    }

    /* ---- send -----------------------------------------------------------
     * The reply carries the stored message, stamp and all, because the app
     * has already drawn its own copy and needs to replace it with the one
     * that exists. A retry of the same clientId gets the row that landed
     * the first time rather than a second message.
     */
    if (seg[3] === "messages" && seg.length === 4 && method === "POST") {
      if (await limited(env, "chat:send:" + user.id, SEND_WINDOW_MS, SEND_MAX_PER_WINDOW)) {
        return fail(429, "too_fast", "Too many messages. Wait a moment.");
      }

      const body = await readJson(request, 64 * 1024).catch(() => ({}));
      const text = cleanBody(body.body);
      if (!text) return fail(400, "empty", "There is nothing in that message.");
      const clientId = cleanClientId(body.clientId);

      /* A thing, if it carries one. `body` is still required: it is the
         one line the notification, the chat list and an older build show. */
      const kind = body.kind == null ? "text" : String(body.kind);
      if (!KINDS.has(kind)) return fail(400, "bad_kind", "Unknown message kind: " + kind.slice(0, 40));
      let payload = null;
      if (kind !== "text") {
        if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
          return fail(400, "bad_payload", "A " + kind + " message needs a payload object.");
        }
        payload = JSON.stringify(body.payload);
        if (payload.length > MAX_PAYLOAD) return fail(400, "bad_payload", "That is too much to send in one message.");
        if (kind === "image") {
          const pid = body.payload.photo;
          const ok = typeof pid === "string" && await env.DB.prepare(
            "SELECT 1 AS ok FROM photos WHERE id = ? AND thread_id = ?"
          ).bind(pid, threadId).first();
          if (!ok) return fail(400, "bad_payload", "Upload the photo to this chat before sending it.");
        }
      }

      /* Who else is here, and does any of them refuse to hear from me. A DM
         has exactly one other person, so a block is the whole answer; a
         group would drop the blocked member rather than the message.

         EVERYBODY in the thread, including somebody who has cleared it out
         of their list. Only counting the ones still listing it meant a
         message to somebody who had removed the chat went to nobody — no
         list entry, no badge, no notification, while the sender saw it as
         sent — and it meant a block was never checked once the blocker had
         also removed the chat, so the messages piled up for them to find. */
      const others = await env.DB.prepare(
        "SELECT user_id FROM chat_members WHERE thread_id = ? AND user_id != ?"
      ).bind(threadId, user.id).all();
      const recipients = (others.results || []).map((r) => r.user_id);

      if (recipients.length === 1) {
        const who = await blockedBetween(env, user.id, recipients[0]);
        if (who) {
          return who === user.id
            ? fail(409, "you_blocked", "You have blocked this person. Unblock them to write to them.")
            : fail(403, "blocked", "This person is not accepting messages from you.");
        }
      }

      const now = Date.now();
      const id = newId();

      try {
        await env.DB.prepare(
          "INSERT INTO chat_messages (id, thread_id, sender_id, body, created_at, client_id, kind, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(id, threadId, user.id, text, now, clientId, kind === "text" ? null : kind, payload).run();
      } catch (e) {
        /* The UNIQUE index on (thread, sender, clientId) fired: this is a
           retry of a message that already landed. Hand back the one that is
           there -- sending it twice is the failure mode the id exists to
           prevent. */
        if (clientId) {
          const already = await env.DB.prepare(
            "SELECT * FROM chat_messages WHERE thread_id = ? AND sender_id = ? AND client_id = ?"
          ).bind(threadId, user.id, clientId).first();
          if (already) return json({ message: shapeMessage(already), duplicate: true, serverNow: Date.now() });
        }
        throw e;
      }

      /* A card showing a library photo HOLDS it (photos.js): the person it
         was sent to can still open the card after the sender has deleted
         the exercise, and the picture has to still be there when they do. */
      const shown = kind !== "text" && kind !== "image" ? payloadPhotoIds(body.payload) : [];
      if (shown.length) {
        try { await setHoldings(env, { [msgHolder(id)]: shown }); }
        catch (e) { console.error("photo holdings failed; the message is stored", e && e.message ? e.message : e); }
      }

      /* Sending is reading: a message of your own must not come back as
         something you have not seen.

         And writing to somebody puts the conversation back in their list,
         which is exactly what "Remove this chat" promises them: "writing to
         them again brings this same chat back, messages and all". It is the
         other person writing that has to bring it back — they are the one
         who cannot know it was removed. */
      await env.DB.batch([
        env.DB.prepare("UPDATE chat_threads SET last_message_at = ? WHERE id = ?").bind(now, threadId),
        env.DB.prepare("UPDATE chat_members SET last_read_at = ? WHERE thread_id = ? AND user_id = ?")
          .bind(now, threadId, user.id),
        env.DB.prepare("UPDATE chat_members SET left_at = NULL WHERE thread_id = ? AND user_id != ? AND left_at IS NOT NULL")
          .bind(threadId, user.id),
      ]);

      /* ── THE NOTIFICATION ──────────────────────────────────────────
         Sent from here rather than waited for by the other phone, because
         the whole point is reaching a phone with the app CLOSED, and that
         is what push is for. It never delays the reply: a push service
         being slow must not make sending a message slow, and a message
         that is stored has been sent whether or not the other phone rings.

         A muted member is delivered to and not announced. Whether the
         notification is SHOWN is sw.js's decision -- a focused window gets
         the message handed straight to the page instead -- because only
         the other device knows whether somebody is already looking at it. */
      const notify = await env.DB.prepare(
        "SELECT user_id FROM chat_members WHERE thread_id = ? AND user_id != ? AND left_at IS NULL AND muted = 0"
      ).bind(threadId, user.id).all();

      const from = user.username || user.display_name || "Zenofit";
      const fan = (notify.results || []).map((r) => sendToUser(env, r.user_id, {
        title: from,
        body: preview(text),
        tag: "chat-" + threadId,
        kind: "chat",
        id: threadId,
        url: "./",
        requireInteraction: false,
      }).catch(() => null));

      if (ctx.waitUntil) ctx.waitUntil(Promise.all(fan));
      else await Promise.all(fan);

      return json({
        message: shapeMessage({
          id, thread_id: threadId, sender_id: user.id, body: text,
          created_at: now, client_id: clientId, deleted: 0,
          kind: kind === "text" ? null : kind, payload,
        }),
        recipients: recipients.length,
        serverNow: now,
      }, 201);
    }

    /* ---- unsend ----------------------------------------------------------
     * DELETE FOR EVERYONE, and only by the person who sent it. The row
     * stays as a tombstone -- body and payload gone, `deleted_at` stamped --
     * because the other phone may already hold the message and has to be
     * told to drop it (see the `unsent` list above); a row that is gone
     * cannot be reported. Everything that counts or previews a thread
     * already reads live messages only, so the unread badge, the chat
     * list's last line and its order all fall back to whatever was there
     * before, which is exactly "as if it was never sent".
     *
     * A photo sent with it is deleted outright: it was uploaded into this
     * thread for this message, and keeping the picture after the message
     * is unsent would keep the one thing somebody most wanted gone.
     */
    if (seg[3] === "messages" && seg.length === 5 && method === "DELETE") {
      const row = await env.DB.prepare(
        "SELECT id, sender_id, kind, payload, deleted, deleted_at FROM chat_messages WHERE id = ? AND thread_id = ?"
      ).bind(seg[4], threadId).first();
      if (!row) return fail(404, "not_found", "No such message.");
      if (row.sender_id !== user.id) {
        return fail(403, "not_yours", "Only the person who sent a message can delete it.");
      }
      /* twice is fine: the second tap on a flaky connection is the same wish */
      if (row.deleted) return json({ threadId, messageId: row.id, unsent: true, deletedAt: row.deleted_at });

      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE chat_messages SET deleted = 1, body = NULL, payload = NULL, deleted_at = ? WHERE id = ?"
        ).bind(now, row.id),
        /* the list sorts by the newest LIVE message, and NULL is what hides
           a thread with nothing left in it from somebody who never opened it */
        env.DB.prepare(
          "UPDATE chat_threads SET last_message_at = " +
          "(SELECT MAX(created_at) FROM chat_messages WHERE thread_id = ? AND deleted = 0) WHERE id = ?"
        ).bind(threadId, threadId),
      ]);

      /* a card lets go of the library photos it was showing */
      try { await setHoldings(env, { [msgHolder(row.id)]: [] }); }
      catch (e) { console.error("photo holdings failed; the message is unsent", e && e.message ? e.message : e); }

      const pid = row.kind === "image" ? (parsePayload(row.payload) || {}).photo : null;
      if (typeof pid === "string") {
        /* unless another live message in the same thread still shows it,
           which only a retry that landed twice could have produced */
        /* an exact match on the photo the payload names: D1 refuses a LIKE
           pattern longer than 50 characters, and a photo id is 64 */
        const still = await env.DB.prepare(
          "SELECT 1 AS ok FROM chat_messages WHERE thread_id = ? AND deleted = 0 AND kind = 'image' " +
          "AND json_extract(payload, '$.photo') = ? LIMIT 1"
        ).bind(threadId, pid).first();
        if (!still) {
          await env.DB.prepare("DELETE FROM photos WHERE id = ? AND thread_id = ?").bind(pid, threadId).run();
        }
      }
      return json({ threadId, messageId: row.id, unsent: true, deletedAt: now });
    }

    /* ---- a photo whose message never went -------------------------------
     * The app uploads a photo before the message that shows it. If the
     * message then fails and is discarded, the photo is in the thread with
     * nothing showing it, and "delete" on the phone has to mean deleted
     * here too. Only its uploader may, and never while a live message in
     * the thread still shows it.
     */
    if (seg[3] === "photos" && seg.length === 5 && method === "DELETE") {
      const pid = seg[4];
      if (!isPhotoId(pid)) return fail(404, "not_found", "No such photo.");
      const row = await env.DB.prepare(
        "SELECT id, owner_id FROM photos WHERE id = ? AND thread_id = ?"
      ).bind(pid, threadId).first();
      if (!row) return json({ photoId: pid, deleted: false });
      if (row.owner_id !== user.id) return fail(403, "not_yours", "Only the person who uploaded a photo can delete it.");
      const shown = await env.DB.prepare(
        "SELECT 1 AS ok FROM chat_messages WHERE thread_id = ? AND deleted = 0 AND kind = 'image' " +
        "AND json_extract(payload, '$.photo') = ? LIMIT 1"
      ).bind(threadId, pid).first();
      if (shown) return fail(409, "in_use", "A message still shows this photo. Unsend the message instead.");
      await env.DB.prepare("DELETE FROM photos WHERE id = ? AND thread_id = ?").bind(pid, threadId).run();
      return json({ photoId: pid, deleted: true });
    }

    /* ---- how far I have read --------------------------------------------
     * Only ever forwards. An `at` older than the stored one is a late
     * request from a screen that has since been scrolled, and honouring it
     * would make the badge come back.
     */
    if (seg[3] === "read" && seg.length === 4 && method === "POST") {
      const body = await readJson(request).catch(() => ({}));
      const now = Date.now();
      const at = Number.isFinite(body.at) ? Math.min(body.at, now) : now;
      await env.DB.prepare(
        "UPDATE chat_members SET last_read_at = ? WHERE thread_id = ? AND user_id = ? AND last_read_at < ?"
      ).bind(at, threadId, user.id, at).run();
      const row = await membership(env, threadId, user.id);
      return json({ threadId, lastReadAt: row ? row.last_read_at : at });
    }

    /* Quiet, not gone: still delivered, just not announced. */
    if (seg[3] === "mute" && seg.length === 4 && (method === "POST" || method === "DELETE")) {
      const on = method === "POST" ? 1 : 0;
      await env.DB.prepare("UPDATE chat_members SET muted = ? WHERE thread_id = ? AND user_id = ?")
        .bind(on, threadId, user.id).run();
      return json({ threadId, muted: !!on });
    }

    /* ---- leave ----------------------------------------------------------
     * Yours only. The messages stay where they are: the other person's copy
     * of a conversation is not mine to delete, and writing to them again
     * puts the thread back rather than starting a second one.
     */
    if (seg.length === 3 && method === "DELETE") {
      await env.DB.prepare(
        "UPDATE chat_members SET left_at = ? WHERE thread_id = ? AND user_id = ?"
      ).bind(Date.now(), threadId, user.id).run();
      return json({ threadId, left: true });
    }
  }

  return null;
}
