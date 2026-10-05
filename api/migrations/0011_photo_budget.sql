-- A ceiling on ALL photo data, beside the one each account already has.
--
-- Photos live in this database next to everybody's training, and on the
-- free plan a database holds 500 MB. Every upload now checks the total
-- photo data against a ceiling (PHOTO_BUDGET_CHARS, see photos.js) as well
-- as the uploading account's own share, in one aggregate query.
--
-- Without an index that query reads every picture in the table to add up
-- their sizes: `size` is stored after `data` in each row, so reaching it
-- means walking all of that row's overflow pages. This index holds the
-- two columns the query needs, so both sums are answered from the index
-- alone and no picture is read. The per-account sum (WHERE owner_id = ?)
-- has read every one of that account's pictures until now; it uses this
-- index too. Additive: nothing is dropped or rewritten.

CREATE INDEX IF NOT EXISTS idx_photos_owner_size ON photos (owner_id, size);
