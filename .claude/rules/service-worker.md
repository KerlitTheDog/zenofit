---
paths:
  - "sw.js"
  - "sw-register.js"
---

# Working on the service worker (`sw.js`, `sw-register.js`)

Loaded by itself when either file is opened.

- **Bump `VERSION` in `sw.js` whenever a shell file changes**, or the deploy reaches phones on their second launch instead of their first.
- **`SHELL` lists only files that exist.** The install caches them with `addAll`, which fails as a whole when one is missing: the worker still installs, with nothing cached, and the app stops opening offline. Removing or renaming a shell file means editing `SHELL` in the same commit, and a new file the app needs offline joins it.
- **A cache that fails is no cache, never a failed request**, and a navigation is answered from the cached shell with its query ignored (docs/architecture.md, *One control means "show me what is actually there now"*; docs/chat.md, *BRING A FRIEND*).
- **The push handler** follows docs/notifications.md for messages and docs/timers.md for rests. A change to it needs a real phone, as `.claude/rules/server.md` says under what the suites cannot prove.
- **The update banner** (`updateReady` / `reloadOnce` in `sw-register.js`) is described in docs/architecture.md. Its words come from `i18n.js` (`update.ready`, `update.reload`, `update.later`) through `say()`, with English only as the fallback for a page where `T()` is missing.
