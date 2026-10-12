---
paths:
  - "api/**"
---

# Working on the Worker (`api/`)

Loaded by itself whenever a file under `api/` is opened. What each feature does, server half included, is in its topic doc (docs/sync.md, docs/photos.md, docs/accounts.md, docs/sharing.md, docs/chat.md, docs/notifications.md, docs/timers.md): read the one you are touching.

- **Replies are written for people.** A refusal is `fail()` with a sentence of the route's own, never an exception's message; the detail goes to `wrangler tail` only. A new error code a person can meet gets its words in all three languages in the same commit (docs/sync.md).
- **D1 refuses a LIKE or GLOB pattern longer than 50 characters**, and only when it actually evaluates one, so a test passes and production fails. Match inside a payload with `json_extract`, never LIKE (docs/photos.md).
- **Statements are set-based, never a loop per row**: the free plan allows fifty D1 queries per request (docs/accounts.md, deleting an account).
- **Anything that mints an identity or can be looped is rate limited** through `limited` / `limitOf` in `limits.js`, keyed by `addressKey` (docs/accounts.md).
- **CORS is an allowlist** (`ALLOWED_ORIGINS` in `wrangler.toml`): a local preview must be served from one of those origins (port 8080) or it cannot log in.
- **Migrations**: an additive one ships without asking; a DROP, a DELETE or an ALTER that loses a column stops and asks (CLAUDE.md). Migrations go up before the Worker.
- **Local `wrangler dev` runs on the main PC only** (on the laptop, Windows blocks the Workers runtime), so the local-only checks and dependency bumps happen there (CLAUDE.md, *Two computers*).
- **The smoke suites** live in `test/` and `test/README.md` says how to run them: all eight after every deploy, against production by default.

**What the suites cannot prove, so say so rather than implying it is covered:** push notification DELIVERY. `VAPID_PRIVATE_KEY` is a Wrangler secret and is absent from `wrangler dev`, so neither a local run nor the smoke tests ever send a real push: they exercise the routes around it. The same goes for the **photo sweep**: production runs it once a day from a cron trigger and no request can set it off, so the checks that watch a photo actually leave run only against a local `npx wrangler dev --test-scheduled --var PHOTO_GRACE_MS:0` with `ZENOFIT_SWEEP=1` (see the top of `test/smoke_photos.py`); against production those checks are skipped and say so. A change to the push path (`api/src/push.js`, the `push` handler in `sw.js`, `enablePush` / `notifyEnable`) needs a real phone, installed to the home screen, with the app backgrounded. The Notifications window's own *Test a rest timer, 60 seconds* is that test, run from inside the installed app. The WebKit branch of the chat handler (`STRICT_PUSH`) needs an iPhone in particular. Chrome's half CAN be driven locally, which is how the notification fixes were proven: `wrangler dev` with a throwaway VAPID pair put in a scratch config's `[vars]` sends real pushes through Google's push service to a headless Chrome driven over the DevTools protocol (keep its --user-data-dir path short on Windows, or Cache Storage fails past MAX_PATH; minimise its window to put the app in the background).

Dependabot (`.github/dependabot.yml`) opens a pull request each week for an npm update in `api/`. Nothing merges by itself: a dependency bump is a change like any other, pulled here and tested against a local `wrangler dev` with all eight suites before it ships. The front end has no package manager; `lucide.min.js` and `fonts/` are updated by hand, as docs/architecture.md says.
