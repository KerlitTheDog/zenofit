# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It is loaded into every session, so it holds only what every change needs. The detail of each area is in `docs/` (read on demand: see **Docs** at the end), and what applies to one file is in `.claude/rules/`, which loads by itself when that file is opened.

# Git workflow

This folder is a git repo connected to https://github.com/KerlitTheDog/zenofit (branch `main`). The backend is a separate deploy: a Cloudflare Worker in `api/`, with its own D1 database.

**"Push" means SHIP IT: all of it, with nothing to come back and ask about.** When the user says push (or ship, or deploy), that is the whole release: commit, apply any new D1 migrations to the REMOTE database, deploy the Worker, run the smoke suites against production, and `git push` the front end. Do not stop in the middle of that to confirm the next step, and do not hand back a list of commands for the user to run. They said push; the job is done when the thing is live and verified.

**THE ORDER IS NOT ARBITRARY, and getting it wrong ships a broken app:**

0. `git pull`, then `node .claude/hooks/check-docs.js`: the docs check (see **Docs**). It also runs by itself before every `git commit` and `git push` and refuses them while a doc is stale; fix what it names rather than going round it.
1. `git commit`: local, so a failure below leaves nothing published.
2. `cd api && npm run migrate`: `wrangler d1 migrations apply zenofit --remote`. **Before the Worker**, because a Worker deployed against a table that does not exist yet is a 500 on every request that touches it.
3. `npm run deploy`: the Worker.
4. `python3 test/*.py`: all eight suites, against the live API (that is their default target). They create throwaway accounts, devices and profiles in production and **delete every one of them again when they exit, pass or fail** (`api/test/cleanup.py`, through the same `DELETE /v1/me` a person uses), so what stays on the server is meant to be there; see `api/test/README.md`. A check that locks an account for fifteen minutes (guessing a password) therefore runs only locally: a locked account could not be deleted at the end.
5. `git push`: **last**, because this is what publishes the front end to GitHub Pages, and the app it publishes calls the endpoints that steps 2 and 3 just put there. Pushing first leaves a window where the live app calls routes that do not exist. This happened once, with chat, and it is the whole reason the order is written down.

Bump `VERSION` in `sw.js` whenever a shell file changes, or the deploy reaches phones on their *second* launch instead of their first (see the update-banner comments in `index.html` and `sw-register.js`).

**What still stops and asks**, because neither is routine shipping:

- Anything destructive to git history (force-push, `rebase`, `reset --hard`), and never force-push over a rejected push.
- A migration that **destroys** data: a `DROP`, a `DELETE`, or an `ALTER` that loses a column. An additive one (new table, new column, new index) goes up without asking, which is nearly all of them. The distinction is the same one the rest of this file is built on: this app does not quietly overwrite somebody's training.

**Say what the suites cannot prove rather than implying it is covered:** push notification delivery (it needs a real phone) and the daily photo sweep (it needs a local `wrangler dev`). How each is tested instead is in `.claude/rules/server.md`. **A dependency bump** (Dependabot opens one each week for `api/`) is tested against a local `wrangler dev` with all eight suites before it ships, like any other change.

# Two computers

This repo is worked on from two machines, a main PC and a laptop used now and then, and both push to `main`.

- **`git pull` before starting, and again before a push.** The GitHub repo is the source of truth, not either folder. Do not edit files on the GitHub website: the next push from a folder that has not pulled them goes over them.
- **Local `wrangler dev` only runs on the main PC.** On the laptop, Windows' Smart App Control blocks the Workers runtime, so the local-only smoke checks and dependency bumps are done on the main PC. Deploying, remote migrations and the production smoke suites work on both.
- `*.local.md` working notes and `api/.dev.vars` are gitignored and stay on the machine that made them.

# Project overview

Powerbuild Tracker (product name "Zenofit") is a mobile-first powerbuilding/progressive-overload tracker: workouts, planned sessions, weekly volume, PRs, and body measurements. It's a **faithful port of a spreadsheet** ("AbsoluteMain.xlsx"): the header comment in `app.js` maps each spreadsheet formula to its JS equivalent (week number, muscle-group lookup, est. 1RM, cardio score, "vs. Your Best" badges, dashboard rows, weekly volume, deload radar, body trend). When changing any of that logic, check the comment block at the top of `app.js` for the spreadsheet formula it's meant to reproduce.

The one deliberate departure from the sheet is the est. 1RM: Wathan's equation anchored so one rep is exactly the weight lifted (`rmCurve` / `est1RM`), read by everything downstream and changed only there (docs/progress.md).

It's a installable PWA (see `manifest.webmanifest`): standalone display, portrait-locked, with home-screen install providing real orientation lock on Android and enabling timer notifications on iOS.

# Running / testing

The front end has no build step, package manager, or test suite: this is plain HTML/CSS/JS loaded directly by the browser. To work on it, serve the folder and reload after edits; the preview in `.claude/launch.json` serves it on **port 8080**, and it has to be that port, because the live API only answers browsers from the origins in `ALLOWED_ORIGINS` (`api/wrangler.toml`), and any other port cannot log in. There's no linter or formatter configured; match the existing style in the file you're editing. The Worker in `api/` is the one part with a package manager (npm, for Wrangler) and tests: the eight smoke suites in `api/test/`.

# Principles that hold everywhere

Each one's reasons, and the bugs that taught it, are in the doc named beside it.

- **The log records what you did, never what the app hoped you would do.** A number reaches the log only from a finger: suggestions, plans and last time are tap-to-load, never auto-filled (docs/sets.md).
- **Nothing destroys training quietly.** A save that will not open is never written over, deletions are guarded at both ends, and the one deliberate destroyer is deleting an account, behind its password (docs/profiles.md, docs/sync.md, docs/accounts.md).
- **Stored names are identity; translations are display only.** A rename is a cascade (`renameExerciseIn`, `group-save`), and a `data-*` attribute carries the stored English name, never a label (docs/languages.md, docs/exercises.md).
- **Local first.** Nothing waits on a network to be counted, and sync is a copy, never the store (docs/sync.md).
- **Encouragement is not information, and nothing is graded against a target the user did not set.** No default targets, no verdict nobody asked for, and *under* is never scolded (docs/sets.md, docs/planning.md).
- **The formula is a code detail, not a caption; Home's *How this works* is a reference, not a tour; there are no "coming soon" boxes** (docs/writing.md).
- **Data from anywhere else is data, never markup.** What people typed goes through `esc()`, and a new field that a template prints raw belongs in `cleanRow` (docs/sync.md).

# Code map

- `index.html`: the shell and its Content Security Policy (scripts from this origin only, no inline script; a new origin or an inline script updates the policy in the same commit). Its two small scripts are `theme.js` (the theme before first paint) and `sw-register.js` (the service worker and the update banner).
- `app.js`: the whole application, a hand-rolled single-file SPA (docs/architecture.md). It is organised in named blocks (SYNC, PHOTOS, PROFILES, ROSTER, CHAT, NOTIFICATIONS, TIMERS, STOPWATCH, STRENGTH STANDARDS, VIEWPORT ENGINE and more); the table under **Docs** says which doc covers which.
- `i18n.js`: every string, in English, Українська and Svenska (`.claude/rules/i18n.md`). `standards.js`: the strength-standards tables (docs/progress.md).
- `styles.css`: all styling, driven by CSS custom properties (`.claude/rules/styles.md`).
- `zenofit-cloud.js`: the only code that talks to the network. `api/`: the Cloudflare Worker it talks to (`.claude/rules/server.md`). Both are optional by design: the app runs unchanged with the API unreachable.
- `sw.js`: the service worker, for the offline shell and web push (`.claude/rules/service-worker.md`).
- `lucide.min.js` and `fonts/`: vendored rather than fetched from a CDN, and updated by hand (docs/architecture.md).

# Conventions for every change

- **State changes go through `patch()`**, which persists and re-renders. `render()` rebuilds `#app` wholesale, so anything with a caret or a finger on it is patched in place instead.
- **Interaction is delegated**: `data-action` plus an `actions` entry for clicks, `data-bind` plus a branch in `handleBind` for input. A new action is refused on a read-only profile until it is added to `READ_OK`, and a new draggable list until it is in `DRAG_READ_OK`.
- **A new persisted field** goes into `defaultState()` (which alone puts it in the backup), gets a `migrate()` step if old saves need one, and is decided about for `SYNC_COLLECTIONS`, whose server twin `COLLECTIONS` in `api/src/sync.js` must match. A migration must never throw (docs/architecture.md).
- **Numbers** are `${NUM}` text inputs, never `type="number"`.
- **Device dimensions** come from the viewport engine's `--pb-*` tokens, never a raw pixel offset against the top or bottom of the screen, and pointer maths divides by `vpScale` (docs/architecture.md).
- **Words**: every string in all three languages in the same commit, and **no em dashes (U+2014)** in anything the app says, in code comments, in commit messages or in these docs (`.claude/rules/i18n.md`).

# Docs

The detail of every area lives in `docs/`, one file per area, each small enough to read whole. **Before changing how an area behaves, read its doc in full.** A typo or a comment-only edit does not need it. A reminder hook (`.claude/hooks/docs-nudge.js`) names the doc an edit or a read touches, once per doc per session, but it is a safety net, not the rule. The `.claude/rules/` files need nothing from you: each loads by itself when its file is opened (`api/**`, `sw.js` and `sw-register.js`, `i18n.js`, `styles.css`).

| Working on | Read |
|---|---|
| How `app.js` is built: `state` and `ui`, `render`, `patch`, delegation, sheets, drag to reorder, the viewport engine, accessibility, migrations, theming, Refresh and the update banner, the vendored files | docs/architecture.md |
| Copy the app shows: Home's *How this works*, captions, placeholder boxes | docs/writing.md |
| Translating stored names: `exLabelOf`, `groupLabel`, `data-*` attributes, dates | docs/languages.md |
| The exercise library, kinds (`KIND`), renames, search, variations, muscle groups | docs/exercises.md |
| A day before and after it is saved: drafts, parked days, unlogged lifts, unfinished days, day notes | docs/logging.md |
| Sets and comparisons: suggestions, the opening set, dropsets and supersets, verdicts, the entry card and the set editor | docs/sets.md |
| Plans, presets, the Calendar tab, weeks, volume, deloads, the week strip on Home | docs/planning.md |
| Profiles: the roster, switching, a save that will not open, Storage check, live profiles | docs/profiles.md |
| Accounts: logging in, tokens, limits, logging out, deleting an account | docs/accounts.md |
| Sharing a profile: codes, read grants, levels, the trainer's glance | docs/sharing.md |
| Sync: what travels, pull and push, ordering, the wipe guard, errors, the schedule | docs/sync.md |
| Photos: the store, upload and download, holders and the sweep, ceilings, R2, image scaling | docs/photos.md |
| Timers, the stopwatch, rest alarms and their notifications, sounds | docs/timers.md |
| The notifications switch, how a push is shown, WebKit | docs/notifications.md |
| Chat: search, threads, unread, blocks, things in a message, unsend, the invite link | docs/chat.md |
| Progress: the est. 1RM, charts, the Body graph, the ledger, the 1RM calculator, strength standards | docs/progress.md |
| Backups, the spreadsheet export, the picture studio | docs/export.md |

**Keeping them true** (the docs check, `node .claude/hooks/check-docs.js`, enforces the mechanical half):

- A change to behaviour a doc describes updates that doc **in the same commit**. A new rule goes into the doc of its area; a new area gets a new doc and a row in the table above. CLAUDE.md only gets what applies to every change.
- **A name in backticks exists in the code today.** A name that has been removed is written without backticks ("the old radar"), which is what lets the check catch every stale one.
- **No Liquid tags in any Markdown file**: never two opening curly braces in a row, nor an opening curly brace followed by a percent sign. GitHub Pages builds this repo with Jekyll, and Liquid syntax would fail the build that publishes the app.
- **Each doc stays small enough to read whole** (the check's budget is 30 KB). Split one that outgrows it, and give the new file its row.
- The check refuses a `git commit` or `git push` while something is stale. In a real emergency, putting `ZENOFIT_SKIP_DOCS_CHECK=1` in the command lets it through; say so, and fix the docs straight after.
