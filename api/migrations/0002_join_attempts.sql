-- Brute-force guard for POST /v1/join.
--
-- A seed is 50 bits, so guessing one blind is hopeless, but an attacker who
-- knows the format can still burn our free-tier request budget trying. The
-- limit is per user (joining requires a device token), which is simpler and
-- harder to dodge than per IP.

CREATE TABLE IF NOT EXISTS join_attempts (
  user_id      TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
