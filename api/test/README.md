# API smoke test

Black-box test of the deployed Worker. No mocks, no local server: it talks to
the real `zenofit-api` and the real D1, which is the only way to catch the
things that actually break (CORS headers, an access check that passes locally
because the binding is missing, a migration that was never applied).

Run all eight after every `wrangler deploy`:

    python3 test/smoke.py          # devices, profiles, seeds, grants, removal, CORS
    python3 test/smoke_auth.py     # usernames, passwords, one account many phones,
                                   # logout, wrong-password limits
    python3 test/smoke_sync.py     # the items inside a profile, read grants, the wipe
                                   # guard across batches, stamp order, future clocks
    python3 test/smoke_roster.py   # the profile LIST: names, order (yours and theirs),
                                   # membership, a create sent twice
    python3 test/smoke_chat.py     # messages between accounts: threads, unread, blocks,
                                   # things in a message, unsending, chat photos
    python3 test/smoke_photos.py   # the photo store an exercise photo lives in
    python3 test/smoke_push.py     # VAPID config, push subscriptions and per-kind prefs, timers
                                   # (two checks need the production secret and fail under wrangler dev)
    python3 test/smoke_delete.py   # deleting an account: the password, what goes and what stays,
                                   # every token told `account_deleted`, the name free again

Each creates throwaway accounts, devices and profiles and exercises its
routes, and every one of them is deleted again when the suite exits, pass or
fail: each suite's `call()` hands its replies to `cleanup.py`, which writes
down what `POST /v1/devices` and `/v1/auth/register` made and deletes it at
exit through `DELETE /v1/me`, the route a person uses (an account whose token
was logged out signs in again first). Its last printed line says how many were
deleted, and names any that were not. The checks that lock an account for
fifteen minutes (guessing a password, in `smoke_auth.py` and
`smoke_delete.py`) run only locally with `ZENOFIT_LIMITS=1`, from an address of
their own, because the lock covers `DELETE /v1/me` too and would stop the
cleanup deleting that account.

Any of them runs against a local `wrangler dev` instead:

    ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_roster.py

Checks that trip a limit or fill storage run ONLY against a local `wrangler
dev`, and say so when skipped. Tripping a limit against production would lock
the tester's own address:

    ZENOFIT_LIMITS=1   smoke_auth.py and smoke_chat.py ask until refused: the
                       ceilings on devices, registrations and name checks per
                       address (each from an address of its own), and on
                       searches per account. The defaults are fine.
    ZENOFIT_SWEEP=1    smoke_photos.py and smoke_auth.py set off the daily sweep
                       by hand; needs `wrangler dev --test-scheduled --var
                       PHOTO_GRACE_MS:0 --var LIMIT_ROW_KEEP_MS:3000`.
    ZENOFIT_BUDGET=1   smoke_photos.py fills the photo store to its ceiling and
                       empties it again (needs ZENOFIT_SWEEP=1 as well, and
                       `--var PHOTO_BUDGET_CHARS:4000000` on the same wrangler dev).

A full run counts against the ceilings on the address it comes from (28 devices
and 26 registrations per run), so three full runs fit in one hour.

Everything at once, locally:

    npx wrangler dev --test-scheduled --var PHOTO_GRACE_MS:0 --var LIMIT_ROW_KEEP_MS:3000 --var PHOTO_BUDGET_CHARS:4000000
    ZENOFIT_API=http://127.0.0.1:8787 ZENOFIT_SWEEP=1 ZENOFIT_LIMITS=1 ZENOFIT_BUDGET=1 python3 test/<suite>.py

Note: Cloudflare answers `error code: 1010` to a bare Python user-agent before
the Worker ever runs, which is why the script sends a browser one.
