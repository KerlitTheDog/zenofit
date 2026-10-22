-- Recovery codes: the way back into an account whose password is forgotten.
--
-- The server never sees a password, only a key the phone derives from it,
-- so it cannot send one or reset one by email (there is no email). Instead
-- an account holds a set of one-time codes, shown once when they are made
-- (at signup, or later from the account sheet with the password). Any one
-- of them, with the username, sets a new password (POST /v1/auth/recover).
--
-- A JSON array of the SHA-256 of each unused code, never the codes. NULL
-- means none were ever made. It lives on the user row, so deleting an
-- account deletes its codes with it. Additive: nothing is lost.

ALTER TABLE users ADD COLUMN recovery TEXT;
