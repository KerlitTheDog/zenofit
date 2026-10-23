-- What the account has agreed to, and when (docs/privacy.md).
--
-- terms_version / terms_at: the version of the Terms of use and Privacy
-- policy accepted (with the 13+ confirmation), and when. Recorded at signup,
-- or from the one-time sheet an account made before them sees on its next
-- launch. A new version is asked for again.
--
-- health_at: when the account gave its explicit consent to body
-- measurements and the sex setting, which are data concerning health under
-- GDPR article 9. NULL means not given, or withdrawn (withdrawing deletes
-- that data from every profile the account owns).
--
-- Additive: nothing is lost.

ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_at INTEGER;
ALTER TABLE users ADD COLUMN health_at INTEGER;
