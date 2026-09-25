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

Each creates throwaway devices and profiles, exercises its routes, and deletes
the profiles at the end. The devices are left behind; they are a few rows and
cost nothing. `smoke_delete.py` deletes its accounts outright, through the
route it tests, except the one its password-limit check locks for a while.

Any of them runs against a local `wrangler dev` instead:

    ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_roster.py

Note: Cloudflare answers `error code: 1010` to a bare Python user-agent before
the Worker ever runs, which is why the script sends a browser one.
