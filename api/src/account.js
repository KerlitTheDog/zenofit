/* Deleting an account, for good.
 *
 * WHAT GOES. Everything that is only this account's, which is more than
 * the user row: every profile it owns (including ones it deleted earlier,
 * which were only ever tombstoned) with all their items, seeds and grants;
 * the grants it holds on other people's profiles; its conversations; the
 * photos it uploaded that nobody else holds; its push subscriptions,
 * timers, tokens and rate-limit rows. The username is free again after.
 *
 * WHAT STAYS, and why each is not the account's to take:
 *   - rows it wrote into a profile somebody ELSE owns, through a write
 *     grant. They are that person's training now, in that person's log.
 *   - a library photo it uploaded that another account's library, or a
 *     card in a conversation it was not part of, still shows. Photos are
 *     stored once by content, so that picture is theirs as much as it was
 *     this account's. Its owner_id is left naming an account that no
 *     longer exists, which is an id and nothing else.
 *   - the copy of a shared profile kept on a grantee's phone. It leaves
 *     their list on their next roster pass, exactly as when an owner
 *     deletes one profile, and a read grant was never kept on the phone.
 *
 * A CONVERSATION GOES FOR BOTH PEOPLE. A DM exists because of the two of
 * them, and keeping the other half would leave somebody writing into a
 * thread with nobody in it, answered by no one and read by no one. So a DM
 * is deleted whole: both sides' messages, the pictures in it, both member
 * rows, the thread. The other phone drops it from its list on its next
 * poll, because a thread the list no longer names is pruned from the cache.
 * A GROUP (none exist yet, see chat.js) would be different: it has other
 * people still in it, so this account's messages there are unsent, exactly
 * as a person unsending them would, and only its membership goes.
 *
 * ONE TRANSACTION. Every statement below is one D1 batch, and a batch is
 * all or nothing: a deletion that fails half-way leaves the account exactly
 * as it was, still signed in, for the next attempt, rather than an account
 * whose profiles are gone and whose messages are not. That is also why the
 * statements are set-based (subqueries on the user id) rather than read,
 * looped over and deleted one by one: the free plan allows fifty queries a
 * request, and a loop per profile or per thread is how that runs out.
 *
 * ORDER MATTERS INSIDE THE BATCH, because later statements find their rows
 * through tables earlier ones have not emptied yet: the holders of photos
 * are read through the messages and profiles that hold them, the threads
 * through their members, and the members of a deleted DM through the
 * thread that is no longer there. The comments on each say which.
 */

/* Every DM this account is in, left or not. */
const DM_THREADS =
  "SELECT m.thread_id FROM chat_members m JOIN chat_threads t ON t.id = m.thread_id " +
  "WHERE m.user_id = ? AND t.kind = 'dm'";
/* Anything else it is in. Nothing can create one yet. */
const GROUP_THREADS =
  "SELECT m.thread_id FROM chat_members m JOIN chat_threads t ON t.id = m.thread_id " +
  "WHERE m.user_id = ? AND t.kind != 'dm'";
const OWNED = "SELECT id FROM profiles WHERE owner_id = ?";

/* Whether a holder in the photo index (photos.js) is one of this account's
   things: a library row of a profile it owns ('item:<profileId>:<itemId>',
   read as a key range and then by the profile id between the first two
   colons), or a card in a message that is about to go ('msg:<messageId>').
   `col` is the column holding the holder. Four user-id binds, in order. */
const heldByIt = (col) =>
  "(" + col + " >= 'item:' AND " + col + " < 'item;' " +
  "AND substr(" + col + ", 6, instr(substr(" + col + ", 6), ':') - 1) IN (" + OWNED + ")) " +
  "OR (" + col + " >= 'msg:' AND " + col + " < 'msg;' AND substr(" + col + ", 5) IN (" +
  "SELECT id FROM chat_messages WHERE thread_id IN (" + DM_THREADS + ") " +
  "OR (sender_id = ? AND thread_id IN (" + GROUP_THREADS + "))))";

/* Deletes `user` and everything above. Returns counts, for the caller to
   hand back (the smoke test reads them). Throws if the batch fails, and
   then nothing at all has been deleted. */
export async function deleteAccount(env, user) {
  const uid = user.id;
  const now = Date.now();
  const q = (sql, ...binds) => env.DB.prepare(sql).bind(...binds);

  /* A rest still counting down is called off at its Durable Object, so no
     alarm is left holding this account's id until it fires. Not part of
     the transaction and allowed to fail: an alarm that does go off finds
     no timer row and no subscription, and sends nothing. Capped, because
     each one is a subrequest and a real phone has one or two at most. */
  const due = await env.DB.prepare(
    "SELECT id FROM timers WHERE user_id = ? AND status = 'scheduled' LIMIT 10"
  ).bind(uid).all();
  await Promise.all((due.results || []).map((t) =>
    env.TIMER.get(env.TIMER.idFromName(t.id)).fetch("https://do/cancel", { method: "POST" }).catch(() => null)));

  const loginKey = user.username_lc ? ":" + user.username_lc : null;
  const u4 = [uid, uid, uid, uid];     // heldByIt's binds

  /* the ones whose counts are handed back */
  const photoStmts = [
    /* every picture sent in a DM, whoever sent it: the conversation it
       belongs to is going */
    q("DELETE FROM photos WHERE thread_id IS NOT NULL AND id IN (" +
      "SELECT CASE WHEN json_valid(payload) THEN json_extract(payload, '$.photo') END FROM chat_messages " +
      "WHERE kind = 'image' AND thread_id IN (" + DM_THREADS + "))", uid),
    /* every picture this account sent in any conversation */
    q("DELETE FROM photos WHERE owner_id = ? AND thread_id IS NOT NULL", uid),
    /* every library picture it uploaded that nothing holds now */
    q("DELETE FROM photos WHERE owner_id = ? AND thread_id IS NULL " +
      "AND NOT EXISTS (SELECT 1 FROM photo_refs r WHERE r.photo_id = photos.id)", uid),
  ];
  const dmMessages = q("DELETE FROM chat_messages WHERE thread_id IN (" + DM_THREADS + ")", uid);
  const dmThreads = q("DELETE FROM chat_threads WHERE kind = 'dm' AND id IN (SELECT thread_id FROM chat_members WHERE user_id = ?)", uid);
  const items = q("DELETE FROM items WHERE profile_id IN (" + OWNED + ")", uid);
  const profiles = q("DELETE FROM profiles WHERE owner_id = ?", uid);

  const stmts = [
    /* first, while the tokens are still here: every phone signed in to
       this account is told what happened the next time it asks anything
       (see gone_tokens in migration 0010) */
    q("INSERT OR IGNORE INTO gone_tokens (token_hash, gone_at) SELECT token_hash, ? FROM tokens WHERE user_id = ?", now, uid),

    /* ── photos ── A library picture that nothing but this account holds
       starts the usual grace period (markOrphans in photos.js), marked
       while its holders can still be told apart from everybody else's;
       then the holders go (found through the profiles and messages that
       are still here); then the pictures that are this account's: every
       one in a conversation that is going, every one it sent anywhere,
       and every library one it uploaded that nothing holds now. A picture
       somebody else uploaded is left to the sweep, and one somebody else
       still holds is left alone. One statement each, whatever the count. */
    q("UPDATE photos SET orphaned_at = ? WHERE thread_id IS NULL AND orphaned_at IS NULL " +
      "AND id IN (SELECT photo_id FROM photo_refs WHERE " + heldByIt("holder") + ") " +
      "AND NOT EXISTS (SELECT 1 FROM photo_refs r WHERE r.photo_id = photos.id AND NOT (" + heldByIt("r.holder") + "))",
      now, ...u4, ...u4),
    q("DELETE FROM photo_refs WHERE " + heldByIt("holder"), ...u4),
    ...photoStmts,

    /* ── conversations ── a group keeps going without this account: its
       messages there are unsent (body and payload gone, deleted_at set,
       which is how the other phones learn to drop them) and the thread's
       last line falls back to what was live before */
    q("UPDATE chat_messages SET deleted = 1, body = NULL, payload = NULL, deleted_at = ? " +
      "WHERE sender_id = ? AND deleted = 0 AND thread_id IN (" + GROUP_THREADS + ")", now, uid, uid),
    q("UPDATE chat_threads SET last_message_at = (SELECT MAX(x.created_at) FROM chat_messages x " +
      "WHERE x.thread_id = chat_threads.id AND x.deleted = 0) WHERE id IN (" + GROUP_THREADS + ")", uid),
    /* a DM goes whole: its messages, then the thread (found through this
       account's membership), then both member rows, found as the rows of
       this account's threads whose thread is no longer there */
    dmMessages,
    dmThreads,
    q("DELETE FROM chat_members WHERE thread_id IN (SELECT thread_id FROM chat_members WHERE user_id = ?) " +
      "AND NOT EXISTS (SELECT 1 FROM chat_threads t WHERE t.id = chat_members.thread_id)", uid),
    q("DELETE FROM chat_members WHERE user_id = ?", uid),
    q("DELETE FROM chat_blocks WHERE user_id = ? OR blocked_id = ?", uid, uid),

    /* ── profiles ── what is in them, the codes into them, everybody's
       access to them and this account's access to anybody else's, then the
       profiles themselves, last, because everything above finds its rows
       through them */
    items,
    q("DELETE FROM seeds WHERE profile_id IN (" + OWNED + ")", uid),
    q("DELETE FROM grants WHERE user_id = ? OR profile_id IN (" + OWNED + ")", uid, uid),
    /* the counters kept under this account's name or its profiles' ids,
       and its failed logins, which carry its username; a login key is
       'login:<address>:<username>' and a username has no colon, so the
       tail is exact */
    loginKey
      ? q("DELETE FROM rate_limits WHERE key IN (?, ?) OR key IN (SELECT 'wipe:' || id FROM profiles WHERE owner_id = ?) " +
          "OR (key >= 'login:' AND key < 'login;' AND substr(key, ?) = ?)",
          "chat:send:" + uid, "photo:up:" + uid, uid, -loginKey.length, loginKey)
      : q("DELETE FROM rate_limits WHERE key IN (?, ?) OR key IN (SELECT 'wipe:' || id FROM profiles WHERE owner_id = ?)",
          "chat:send:" + uid, "photo:up:" + uid, uid),
    profiles,

    /* ── the account itself ── */
    q("DELETE FROM push_subs WHERE user_id = ?", uid),
    q("DELETE FROM timers WHERE user_id = ?", uid),
    q("DELETE FROM join_attempts WHERE user_id = ?", uid),
    q("DELETE FROM tokens WHERE user_id = ?", uid),
    q("DELETE FROM users WHERE id = ?", uid),
  ];

  const res = await env.DB.batch(stmts);
  const n = (stmt) => { const r = res[stmts.indexOf(stmt)]; return (r && r.meta && r.meta.changes) || 0; };
  return {
    profiles: n(profiles),
    items: n(items),
    threads: n(dmThreads),
    messages: n(dmMessages),
    photos: photoStmts.reduce((sum, s) => sum + n(s), 0),
  };
}
