-- Zenofit backend, initial schema.
--
-- Shapes worth knowing before reading the rest:
--   users     one row per browser/install, not per person. A person with a
--             phone and a laptop is two users. Identity is a bearer token.
--   profiles  mirrors the app's local profile list. The owner is whoever
--             created it.
--   items     EVERY piece of profile data, one row per item, one shape for
--             all of it. Deletes are tombstones (deleted = 1), never DELETEs,
--             because a row that is gone has no updated_at to compare against
--             when two phones disagree.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  display_name TEXT,
  token_hash   TEXT NOT NULL,          -- sha256 hex of the bearer token
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_token ON users (token_hash);

CREATE TABLE IF NOT EXISTS profiles (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_profiles_owner ON profiles (owner_id);

CREATE TABLE IF NOT EXISTS items (
  profile_id TEXT    NOT NULL,
  collection TEXT    NOT NULL,         -- 'log', 'library', 'goals', 'settings', ...
  item_id    TEXT    NOT NULL,         -- the item's id, or the object key
  json       TEXT,                     -- NULL when deleted = 1
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, collection, item_id)
);
-- The only query the sync layer runs: "what changed in this profile since X".
CREATE INDEX IF NOT EXISTS idx_items_changes ON items (profile_id, updated_at);

CREATE TABLE IF NOT EXISTS seeds (
  seed       TEXT PRIMARY KEY,         -- '7KQ4-M2XP-9R', the code under the name
  profile_id TEXT NOT NULL,
  level      TEXT NOT NULL,            -- 'read' | 'write'
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_seeds_profile ON seeds (profile_id);

CREATE TABLE IF NOT EXISTS grants (
  profile_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  level      TEXT NOT NULL,
  seed       TEXT,                     -- which code they came in on
  joined_at  INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (profile_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_grants_user ON grants (user_id);

CREATE TABLE IF NOT EXISTS push_subs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,     -- the browser's push URL, the real identity
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  platform   TEXT,                     -- 'android' | 'ios' | 'desktop'
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs (user_id);

CREATE TABLE IF NOT EXISTS timers (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  label      TEXT,
  fire_at    INTEGER NOT NULL,         -- unix ms, server clock, absolute
  status     TEXT NOT NULL,            -- 'scheduled' | 'fired' | 'cancelled'
  payload    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timers_user ON timers (user_id, status);
