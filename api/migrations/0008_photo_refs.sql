-- Who still needs a photo, so a photo nobody needs can leave the server.
--
-- 0007 gave photos a store of their own and the store only ever grew: a
-- picture removed from an exercise, replaced by a new one, or left behind
-- by a deleted exercise or a deleted profile stayed in the cloud for ever,
-- counting against its uploader's cap. It could not simply be deleted when
-- one row let go of it, because a photo's id is its content and more than
-- one thing can hold the same picture at once: another profile, another
-- account that added the exercise from a chat, a chat card still showing it.
--
-- So every holder is written down here, and a photo with no holders left
-- is marked (`orphaned_at`) and deleted by the daily sweep once a grace
-- period has passed. The grace is for the one ordinary moment a photo has
-- no holder at all: it is uploaded BEFORE the row that names it is pushed.
--
--   holder  'item:<profileId>:<itemId>'   a library row in a profile
--           'msg:<messageId>'             a chat card showing a library photo
--
-- A chat PHOTO (thread_id set) is not counted here: it belongs to the one
-- message that shows it and is deleted with it (see chat.js).

CREATE TABLE IF NOT EXISTS photo_refs (
  photo_id TEXT NOT NULL,
  holder   TEXT NOT NULL,
  PRIMARY KEY (photo_id, holder)
);
-- "what does this row / this message hold", asked on every push and unsend
CREATE INDEX IF NOT EXISTS idx_photo_refs_holder ON photo_refs (holder);

ALTER TABLE photos ADD COLUMN orphaned_at INTEGER;

-- Back-fill from what is already there: 0007 has been live, so library rows
-- naming a photo and chat cards showing one already exist. Only rows of a
-- profile that still exists hold anything.
INSERT OR IGNORE INTO photo_refs (photo_id, holder)
  SELECT pid, 'item:' || profile_id || ':' || item_id FROM (
    SELECT i.profile_id, i.item_id,
      CASE WHEN json_valid(i.json) THEN json_extract(i.json, '$.photoId') END AS pid
    FROM items i JOIN profiles p ON p.id = i.profile_id
    WHERE i.collection = 'library' AND i.deleted = 0 AND p.deleted_at IS NULL
  ) WHERE pid IS NOT NULL;

INSERT OR IGNORE INTO photo_refs (photo_id, holder)
  SELECT pid, 'msg:' || id FROM (
    SELECT m.id, CASE WHEN json_valid(m.payload) THEN json_extract(m.payload, '$.ex.photo') END AS pid
    FROM chat_messages m WHERE m.deleted = 0 AND m.payload IS NOT NULL
  ) WHERE pid IS NOT NULL;

INSERT OR IGNORE INTO photo_refs (photo_id, holder)
  SELECT json_extract(l.value, '$.photo'), 'msg:' || m.id
  FROM chat_messages m, json_each(m.payload, '$.lib') l
  WHERE m.deleted = 0 AND m.payload IS NOT NULL AND m.kind IN ('preset', 'workout')
    AND json_extract(l.value, '$.photo') IS NOT NULL;

-- Whatever nobody holds starts its grace period now, rather than having
-- been orphaned since it was uploaded.
UPDATE photos SET orphaned_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE thread_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM photo_refs r WHERE r.photo_id = photos.id);
