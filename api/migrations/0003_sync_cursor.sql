-- Paging a change feed needs a total order, not just a timestamp.
--
-- Many items get written in the same millisecond: one save of a workout day
-- stamps every set in it. Paging on updated_at alone means the rows sharing
-- the boundary millisecond are either skipped or repeated, depending on which
-- way the comparison leans. Ordering by (updated_at, collection, item_id)
-- makes every row distinct, so a cursor can point at exactly one of them.

CREATE INDEX IF NOT EXISTS idx_items_feed
  ON items (profile_id, updated_at, collection, item_id);

-- The client's own stamp, kept beside the server's.
--
-- items.updated_at orders the change feed and belongs to the server, because
-- a phone that is seconds off must not be able to win by being wrong.
-- client_updated_at is the app's own "when was this edited", and exists for
-- one narrow purpose: refusing to let a stale push overwrite a newer stored
-- row. That is not a merge policy, which stays on the client. It only stops
-- the server from going backwards, which would otherwise strand a newer edit
-- on the device that made it until that device happened to write again.
ALTER TABLE items ADD COLUMN client_updated_at INTEGER;
