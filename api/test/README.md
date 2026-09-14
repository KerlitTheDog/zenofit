# API smoke test

Black-box test of the deployed Worker. No mocks, no local server: it talks to
the real `zenofit-api` and the real D1, which is the only way to catch the
things that actually break (CORS headers, an access check that passes locally
because the binding is missing, a migration that was never applied).

Run it after every `wrangler deploy`:

    python3 test/smoke.py

It creates throwaway devices and one profile, exercises every route, and
deletes the profile at the end. The devices are left behind; they are a few
rows and cost nothing.

Note: Cloudflare answers `error code: 1010` to a bare Python user-agent before
the Worker ever runs, which is why the script sends a browser one.
