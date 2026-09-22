# API smoke test

Black-box test of the deployed Worker. No mocks, no local server: it talks to
the real `zenofit-api` and the real D1, which is the only way to catch the
things that actually break (CORS headers, an access check that passes locally
because the binding is missing, a migration that was never applied).

Run all five after every `wrangler deploy`:

    python3 test/smoke.py          # devices, profiles, seeds, grants, CORS
    python3 test/smoke_auth.py     # usernames, passwords, one account many phones
    python3 test/smoke_sync.py     # the items inside a profile, and read grants
    python3 test/smoke_roster.py   # the profile LIST: names, order, membership
    python3 test/smoke_chat.py     # messages between accounts: threads, unread, blocks

Each creates throwaway devices and profiles, exercises its routes, and deletes
the profiles at the end. The devices are left behind; they are a few rows and
cost nothing.

Any of them runs against a local `wrangler dev` instead:

    ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_roster.py

Note: Cloudflare answers `error code: 1010` to a bare Python user-agent before
the Worker ever runs, which is why the script sends a browser one.
