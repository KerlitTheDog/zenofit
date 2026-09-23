-- Four things the audit of 2026-09-23 found the schema could not say. All
-- additive: new columns and one index, nothing dropped, nothing rewritten.
--
-- 1. WHERE A SHARED PROFILE SITS IN *YOUR* LIST. `profiles.position` is the
--    owner's order, and the order route used to write it for anybody who
--    could write to the profile, so somebody you shared with dragging their
--    own list reshuffled yours. The grantee's own place for it lives on
--    their grant instead. NULL is "never ordered", which the app sorts last
--    in the order it already had, exactly as profiles.position is read.
ALTER TABLE grants ADD COLUMN position INTEGER;

-- 2. REMOVED IS NOT THE SAME AS LEFT. Both set revoked_at, and a grant could
--    be re-opened by joining again on the code it came in on, so "Remove
--    this person? They lose access straight away" lasted until they typed
--    the code again. Set only when the OWNER removes somebody; a code made
--    after it lets them back, a code that already existed does not.
ALTER TABLE grants ADD COLUMN removed_at INTEGER;

-- 3. A PROFILE CREATE THAT CAN BE RETRIED. The creating device's own id for
--    the profile. A create whose reply was lost on the way back used to be
--    sent again as a second profile; with the key it finds the first one.
ALTER TABLE profiles ADD COLUMN client_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_client_key
  ON profiles (owner_id, client_key) WHERE client_key IS NOT NULL;

-- 4. A CHANGE-FEED STAMP THAT ONLY GOES FORWARDS IN THE ORDER ROWS LAND.
--    items.updated_at was Date.now() taken before a push's writes, so a
--    push that started first but committed second wrote rows OLDER than a
--    cursor another device had already moved past, and that device never
--    saw them. The stamp is now taken inside each write's own transaction
--    from this counter: MAX(counter + 1, now), per profile.
ALTER TABLE profiles ADD COLUMN item_seq INTEGER NOT NULL DEFAULT 0;
