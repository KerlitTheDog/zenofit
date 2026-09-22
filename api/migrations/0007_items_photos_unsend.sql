-- Three things chat and sync could not do, all additive.
--
-- 1. A MESSAGE CAN CARRY A THING, not only words. `kind` says what it is and
--    `payload` is the thing itself, a snapshot the sender's app built (an
--    exercise, a preset, a logged day, a record, a rank card, a photo). NULL
--    kind is a plain text message, which is every row written before this.
--    `body` stays filled in for every kind: it is the one-line summary the
--    notification and the chat list show, and it is what an older build of
--    the app draws, so a phone a version behind reads "Exercise: Bench
--    Press" instead of a message that looks deleted.
--
-- 2. A MESSAGE CAN BE UNSENT. `deleted` has been here since 0006 and nothing
--    ever set it. Unsending blanks body and payload and stamps `deleted_at`,
--    and that stamp is what reaches the other phone: a poll asks for what
--    was unsent since the newest message it holds, because `created_at`
--    never moves and a message deleted after it was fetched would otherwise
--    stay on the other screen for ever. A row, never a DELETE, for the
--    reason 0001 gives about items: a row that is gone cannot be reported.
--
-- 3. PHOTOS HAVE A STORE OF THEIR OWN. An exercise photo used to ride
--    inside its library row, and a row over the item limit was sent without
--    it, so the other phone got the lift and a placeholder. A photo is now
--    uploaded once, here, and the row carries only its id.
--      library photos: id = sha-256 of the data URL, so the same picture is
--                      stored once however many devices upload it, and the
--                      server can check the bytes are the ones the id names.
--                      Readable by anybody signed in who has the id; an id
--                      is 256 bits nobody can guess, and it only ever
--                      travels inside a profile or a message.
--      chat photos:    thread_id set, readable only by that thread's
--                      members, and deleted when the message is unsent.

ALTER TABLE chat_messages ADD COLUMN kind TEXT;
ALTER TABLE chat_messages ADD COLUMN payload TEXT;
ALTER TABLE chat_messages ADD COLUMN deleted_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_chat_messages_unsent
  ON chat_messages (thread_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- And the other half of "as if it was never sent": a conversation with
-- nothing live in it is not listed for somebody who never opened it. Tapping
-- a name makes the thread for BOTH people, so without this, unsending the
-- only message leaves the other person holding an empty chat with you in it.
-- Set on the row of whoever asked to open the thread (POST /v1/chats).
ALTER TABLE chat_members ADD COLUMN opened_at INTEGER;

CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,            -- data:image/...;base64,...
  size       INTEGER NOT NULL,         -- LENGTH(data), for the per-account cap
  owner_id   TEXT NOT NULL,            -- whoever uploaded it first
  thread_id  TEXT,                     -- a chat photo's thread; NULL for a library photo
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos (owner_id);

-- Which kinds of notification a device has said no to ("chat", "timer"),
-- comma separated. NULL is all of them. Per SUBSCRIPTION, not per account:
-- messages on the phone and not on the laptop is an ordinary thing to want.
ALTER TABLE push_subs ADD COLUMN off_kinds TEXT;
