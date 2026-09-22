-- Messages between accounts.
--
-- Everything else in this database belongs to a PROFILE: a log entry, a
-- goal, a body check-in, all of it filed under a training profile that can
-- be shared with a code. A message is not that. It belongs to an ACCOUNT --
-- to the person -- and it reaches another person, not another profile. So
-- none of it goes through `items`, nothing here syncs into `state`, and a
-- backup file carries none of it: a chat is not training data and restoring
-- last month's backup must not restore last month's conversation.
--
-- Shapes worth knowing:
--   chat_threads   one conversation. Only DMs exist today, but `kind` and a
--                  members table mean a group does not need a new schema.
--   chat_members   who is in it, and how far each of them has read.
--   chat_messages  the messages. Tombstoned, never DELETEd, so a client
--                  holding the thread can be told a message went.
--   chat_blocks    who refuses to hear from whom.
--
-- WHY dm_key EXISTS. "Open a chat with Kerlit" must find the conversation
-- you already have with Kerlit, not make a second one, and the two people
-- can arrive in either order. The key is both user ids sorted and joined,
-- so it is the same string whoever asks, and UNIQUE does the rest: two
-- phones tapping the same name at the same moment cannot produce two
-- threads holding half a conversation each.

CREATE TABLE IF NOT EXISTS chat_threads (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL DEFAULT 'dm',     -- 'dm' today; 'group' later
  title           TEXT,                           -- groups only; a DM is named by who is in it
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  last_message_at INTEGER,
  dm_key          TEXT                            -- '<idA>:<idB>', sorted. NULL for a group.
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_dm ON chat_threads (dm_key) WHERE dm_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_members (
  thread_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  joined_at    INTEGER NOT NULL,
  -- How far this person has read, as a message timestamp. An unread count is
  -- derived from it rather than stored, so it cannot drift out of step with
  -- the messages it is counting.
  last_read_at INTEGER NOT NULL DEFAULT 0,
  muted        INTEGER NOT NULL DEFAULT 0,        -- no push, still delivered
  left_at      INTEGER,
  PRIMARY KEY (thread_id, user_id)
);
-- The one query the chat list runs: "every thread this person is in".
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members (user_id, left_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  thread_id  TEXT NOT NULL,
  sender_id  TEXT NOT NULL,
  body       TEXT,                                -- NULL once deleted
  created_at INTEGER NOT NULL,                    -- SERVER clock, like items.updated_at
  -- The sender's own id for the message, and the reason a flaky connection
  -- cannot produce the same message twice: the app draws a message the
  -- instant it is typed and retries the send, so the second attempt has to
  -- land on the same row. UNIQUE per sender per thread is what makes it.
  client_id  TEXT,
  deleted    INTEGER NOT NULL DEFAULT 0
);
-- Paging a thread needs a total order, for the reason migration 0003 gives
-- about the change feed: two messages can share a millisecond.
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages (thread_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client
  ON chat_messages (thread_id, sender_id, client_id) WHERE client_id IS NOT NULL;

-- Anyone with an account can be found by name, which is what makes starting
-- a chat one tap and not a setup flow. This is the other half of that deal.
CREATE TABLE IF NOT EXISTS chat_blocks (
  user_id    TEXT NOT NULL,                       -- who is doing the blocking
  blocked_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_blocks_blocked ON chat_blocks (blocked_id);

-- A general per-key window, so the next thing needing a limit does not need
-- a table of its own. join_attempts stays where it is: it is already
-- deployed, already written to, and moving it would buy nothing.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,                  -- 'chat:send:<userId>'
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
