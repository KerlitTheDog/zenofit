-- Usernames and passwords on the users that already exist, and more than one
-- device per user.
--
-- A user row is minted by POST /v1/devices and has only ever been a device:
-- one phone, one token, no way back in once that token is gone. An account is
-- that same row, claimed. Nothing is moved and no second users table appears,
-- so a profile's owner_id keeps pointing at exactly what it pointed at before
-- and somebody who registers today keeps the training they synced yesterday.
--
-- username_lc is what UNIQUE is enforced on: people do not remember the case
-- they typed, and "Kerlit" and "kerlit" being two accounts is a support
-- problem nobody needs. `username` keeps what they actually typed, to show
-- back to them.
--
-- pw_hash is a SHA-256 of (pw_salt + a key the CLIENT already derived with
-- PBKDF2). The expensive half deliberately happens in the browser: a Worker
-- on the free plan gets 10ms of CPU per request, and PBKDF2 at any honest
-- iteration count spends several times that. See api/src/auth.js.

ALTER TABLE users ADD COLUMN username    TEXT;
ALTER TABLE users ADD COLUMN username_lc TEXT;
ALTER TABLE users ADD COLUMN pw_hash     TEXT;
ALTER TABLE users ADD COLUMN pw_salt     TEXT;
ALTER TABLE users ADD COLUMN claimed_at  INTEGER;

-- Partial, so every device-only row with a NULL username does not collide
-- with every other one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users (username_lc) WHERE username_lc IS NOT NULL;

-- ── one account, several phones ────────────────────────────────────────────
-- users.token_hash holds exactly one token, which was right while a user WAS
-- a device. The moment you can sign in somewhere else, signing in on the new
-- phone would have overwritten the old phone's token and quietly logged it
-- out — the opposite of what an account is for. So tokens move to their own
-- table, one row per device, and revoking one leaves the others alone.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash   TEXT PRIMARY KEY,       -- sha256 hex of the bearer token
  user_id      TEXT NOT NULL,
  label        TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens (user_id);

-- Every device already out there keeps working: its existing token becomes
-- the first row of its own account. Without this, deploying the new
-- authenticate would sign out every phone that has ever used the app.
INSERT OR IGNORE INTO tokens (token_hash, user_id, label, created_at, last_seen_at)
  SELECT token_hash, id, 'device', created_at, last_seen_at FROM users;
