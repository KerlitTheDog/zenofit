-- An account's pinned profiles, and how each one's badge looks (the app's
-- PINNED PROFILES: letters or an icon, colour, shape, filled or outlined).
--
-- They belong to the account, not to a phone: log in to an account on any
-- phone and its badges are there, the way its profile list is. A JSON object
-- keyed by profile id, written whole with the moment it was edited
-- (pins_at), and the later edit wins, as a profile's name does. NULL means
-- nothing pinned yet. It lives on the user row, so deleting the account
-- deletes it. Additive: nothing is lost.

ALTER TABLE users ADD COLUMN pins TEXT;
ALTER TABLE users ADD COLUMN pins_at INTEGER;
