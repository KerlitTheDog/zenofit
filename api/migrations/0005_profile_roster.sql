-- The roster itself becomes account data, not device data.
--
-- Until now a profile's NAME and its POSITION in the list lived only on the
-- phone that made it. The server had a `name`, but it was set once when sync
-- was turned on and only ever read back by the account sheet, so signing in
-- on a second device produced the right training under the wrong names, in a
-- different order, and any profile the second device had not been told to
-- fetch was simply absent. "One account, the same profiles everywhere" was
-- never something this schema could answer.
--
-- Two columns is all it takes, because `profiles` already IS the roster: one
-- row per profile, owner_id saying whose account it belongs to.
--
-- name_updated_at is what makes a rename converge instead of flap. Two
-- devices that both hold a profile will both push a name at some point, and
-- without a stamp the last writer to reconnect wins regardless of who typed
-- more recently — so a phone coming back from a week in flight mode would
-- quietly undo a rename made on the laptop yesterday. It is the CLIENT's
-- clock, like items.client_updated_at, and it is used the same way: only to
-- refuse to go backwards, never to merge.
--
-- position is the order the user dragged the list into. NULL means "never
-- ordered", and those sort last by created_at, so every profile that existed
-- before this migration keeps the order it already had.

ALTER TABLE profiles ADD COLUMN position        INTEGER;
ALTER TABLE profiles ADD COLUMN name_updated_at INTEGER;

-- Every existing name was written at creation and has not moved since, so
-- that is its stamp. Without this they would all be NULL, which reads as
-- "older than anything", and the first device to sync would win by default
-- even if its copy of the name is the stale one.
UPDATE profiles SET name_updated_at = created_at WHERE name_updated_at IS NULL;
