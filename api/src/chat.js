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

/* Long enough for anything anybody types into a gym app, short enough that
   a thread is never a payload problem. */
export const MAX_BODY = 2000;
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

/* A sliding-ish window on one key. Same crudeness as joinRateLimited, and
   enough for the same reason. */
async function limited(env, key, windowMs, max) {
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

/* Membership is the only access rule chat has. A thread you are not in is
   reported as absent rather than forbidden, exactly as a profile is: a 403
   would confirm the thread exists to somebody guessing ids. */
async function membership(env, threadId, userId) {
  return env.DB.prepare(
    "SELECT thread_id, user_id, last_read_at, muted FROM chat_members " +
    "WHERE thread_id = ? AND user_id = ? AND left_at IS NULL"
  ).bind(threadId, userId).first();
}

const shapeMessage = (r) => ({
  messageId: r.id,
  threadId: r.thread_id,
  from: r.sender_id,
  body: r.deleted ? null : r.body,
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
      "     ORDER BY x.created_at DESC, x.id DESC LIMIT 1) AS last_from " +
      "FROM chat_members m JOIN chat_threads t ON t.id = m.thread_id " +
      "WHERE m.user_id = ? AND m.left_at IS NULL " +
      "ORDER BY COALESCE(t.last_message_at, t.created_at) DESC LIMIT 100"
    ).bind(user.id, user.id).all();

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
          : { body: t.last_body, from: t.last_from, at: t.last_message_at },
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
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO chat_members (thread_id, user_id, joined_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(thread_id, user_id) DO UPDATE SET left_at = NULL"
      ).bind(threadId, user.id, now),
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
     */
    if (seg[3] === "messages" && seg.length === 4 && method === "GET") {
      const limit = Math.min(PAGE_MAX, Math.max(1, Number(url.searchParams.get("limit")) || PAGE_DEFAULT));
      const since = Number(url.searchParams.get("since"));
      const before = Number(url.searchParams.get("before"));
      const isSince = Number.isFinite(since) && since > 0;

      let rows;
      if (isSince) {
        rows = await env.DB.prepare(
          "SELECT * FROM chat_messages WHERE thread_id = ? AND created_at >= ? " +
          "ORDER BY created_at, id LIMIT ?"
        ).bind(threadId, since, limit + 1).all();
      } else if (Number.isFinite(before) && before > 0) {
        /* newest-first off the index, then flipped, so "the 60 before this"
           is one query rather than a count and an offset */
        rows = await env.DB.prepare(
          "SELECT * FROM chat_messages WHERE thread_id = ? AND created_at < ? " +
          "ORDER BY created_at DESC, id DESC LIMIT ?"
        ).bind(threadId, before, limit + 1).all();
      } else {
        rows = await env.DB.prepare(
          "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT ?"
        ).bind(threadId, limit + 1).all();
      }

      let list = rows.results || [];
      const hasMore = list.length > limit;
      if (hasMore) list = list.slice(0, limit);
      /* always handed over oldest-first, whichever way it was read */
      const asc = isSince ? list : list.slice().reverse();

      return json({
        threadId,
        messages: asc.map(shapeMessage),
        hasMore,
        lastReadAt: mine.last_read_at,
        serverNow: Date.now(),
      });
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

      /* Who else is here, and does any of them refuse to hear from me. A DM
         has exactly one other person, so a block is the whole answer; a
         group would drop the blocked member rather than the message. */
      const others = await env.DB.prepare(
        "SELECT user_id FROM chat_members WHERE thread_id = ? AND user_id != ? AND left_at IS NULL"
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
          "INSERT INTO chat_messages (id, thread_id, sender_id, body, created_at, client_id) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, threadId, user.id, text, now, clientId).run();
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

      /* Sending is reading: a message of your own must not come back as
         something you have not seen. */
      await env.DB.batch([
        env.DB.prepare("UPDATE chat_threads SET last_message_at = ? WHERE id = ?").bind(now, threadId),
        env.DB.prepare("UPDATE chat_members SET last_read_at = ? WHERE thread_id = ? AND user_id = ?")
          .bind(now, threadId, user.id),
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
        }),
        recipients: recipients.length,
        serverNow: now,
      }, 201);
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
