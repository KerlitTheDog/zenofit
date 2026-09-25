-- Deleting an account, and every phone it was signed in on finding out.
--
-- DELETE /v1/me removes the account and everything that is only its: the
-- user row, every profile it owns with all their items, seeds and grants,
-- the grants it holds on other people's profiles, its conversations, its
-- photos, its push subscriptions, timers and tokens. None of that needs a
-- schema change. This does.
--
-- A TOKEN THAT BELONGED TO A DELETED ACCOUNT IS STILL RECOGNISED. Every
-- other phone signed in to the account is holding a token and a copy of
-- the training, and the next time it asked the server anything it would
-- get the same 401 a logged-out token gets, which says nothing about the
-- copy it is holding: the training would sit on the laptop, signed in to
-- an account that no longer exists, for good. So the hashes of the
-- account's tokens are kept here, and a request carrying one is answered
-- `account_deleted`, which is what makes that phone remove the account's
-- training too. A hash of a random token names nobody, and nothing else
-- about the account is kept.

CREATE TABLE IF NOT EXISTS gone_tokens (
  token_hash TEXT PRIMARY KEY,         -- sha256 hex, as tokens.token_hash
  gone_at    INTEGER NOT NULL
);
