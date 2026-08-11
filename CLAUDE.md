# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Git workflow

This folder is a git repo connected to https://github.com/KerlitTheDog/zenofit (branch `main`).

**Never push automatically. Always ask first.**

After editing files, stage and commit them if useful, but stop and ask the user before running `git push`. Summarize what's about to go up (which files, what changed) so they can decide. Wait for a clear yes.

This applies even to small or routine changes — the user wants a say in what reaches GitHub every time.

Also always ask first for anything destructive to git history (force-push, `rebase`, `reset --hard`), and never force-push over a rejected push.

Note: this local folder is the source of truth. Editing files directly on the GitHub website risks those edits being overwritten by the next push from here.

# Project overview

Powerbuild Tracker (product name "Zenofit") is a mobile-first powerbuilding/progressive-overload tracker: workouts, weekly volume, PRs, and body measurements. It's a **faithful port of a spreadsheet** ("AbsoluteMain.xlsx") — the header comment in `app.js` maps each spreadsheet formula to its JS equivalent (week number, muscle-group lookup, Epley 1RM, cardio score, "vs. Your Best" badges, dashboard rows, weekly volume, deload radar, body trend). When changing any of that logic, check the comment block at the top of `app.js` for the spreadsheet formula it's meant to reproduce.

It's a installable PWA (see `manifest.webmanifest`): standalone display, portrait-locked, with home-screen install providing real orientation lock on Android and enabling timer notifications on iOS.

# Running / testing

There is no build step, package manager, or test suite — this is plain HTML/CSS/JS loaded directly by the browser. To work on it, just open `index.html` (or serve the folder with any static file server) and reload after edits. There's no linter or formatter configured; match the existing style in the file you're editing.

# Architecture

Everything lives in three files: `index.html` (shell + theme-flash-prevention inline script), `styles.css` (all styling, theme-driven via CSS custom properties), and `app.js` (~3000 lines, the entire application).

**`app.js` is a hand-rolled single-file SPA framework** — no React/Vue/build tooling. Key pieces, in the order they appear in the file:

- **`DEFAULT_LIBRARY`** — the seeded exercise library (name, muscle, kind, equipment, alternative, cue notes), ported verbatim from the spreadsheet's Exercise Library sheet.
- **Pure calculation helpers** (`bestSet`, `syncEntry`, `computeBadges`, `dashboardRows`, `weeklyTotals`, `volumeForWeek`, `deloadRadar`, `bodyTrend`, etc.) — these are the spreadsheet-formula ports; keep them side-effect-free.
- **`state`** (persisted) vs **`ui`** (transient, in-memory only) — two separate global objects. `state` holds workout log, library, presets, goals, body measurements, settings; it's loaded via `loadState()`/`migrate()` and written to `localStorage` under key `powerbuild-tracker:v1` via `persist()`/`writeNow()` (debounced autosave, flushed on visibility change / pagehide / beforeunload). `ui` holds open sheets, form drafts, filters, etc., and is never persisted directly — but in-progress drafts (open workout sheet, entry form, set form, body form) are snapshotted into `state.drafts` so a killed/reloaded tab restores exactly where the user left off (see `snapshotDrafts()` and the `restoreDrafts` IIFE at the bottom of the file).
- **`migrate(s)`** — schema migration for `state` loaded from localStorage. Bump/extend this whenever the persisted shape changes, rather than assuming a fresh shape.
- **`render()`** — rebuilds the `#app` innerHTML from `state`/`ui` on every change. Sub-renderers per tab/screen (`renderHome`, `renderLog`, `renderHistory`, `renderVolume`, `renderProgress`, `renderLibrary`, `renderBody`, `renderTimers`, `renderProfile`, etc.) return HTML strings that `render()` assembles. `patch(p)` is the standard way to mutate `state` (shallow-merges, then persists + re-renders).
- **Event delegation, not per-element listeners.** Clicks are handled by a single `document.addEventListener("click", ...)` that dispatches on the closest `[data-action]` ancestor to the `actions` object (a big lookup table of action-name → handler, defined right before the click listener). Typed input is handled by delegated `input`/`change` listeners keyed on `data-bind` attributes, routed through `handleBind()`. When adding new interactive elements, follow this pattern (`data-action="my-action"` + an `actions.my-action` entry, or `data-bind="path.to.field"` + a branch in `handleBind`) rather than attaching listeners directly to DOM nodes — nodes are thrown away and re-created on every `render()`.
- **`data-stopprop`** marks elements (sheet backdrops, nested editors) where an outer `data-action` must not fire when a click lands on an inner one — see the click listener for the containment check.
- **Sheets/overlays** (`sheet()`, `fullScreen()`) are modal-style panels layered via `ui` flags (e.g. `ui.showProfile`, `ui.workoutSheet`, `ui.entryForm`) rather than routing.
- **Timers** (`QUICK_TIMERS` section) run on their own interval engine (`startTimerEngine`, `sweepTimers`, `fireTimer`) independent of `render()`, with Web Audio chime (`chime`/`unlockAudio`) and Notification API integration (`askNotifyPermission`, `notifyDone`).
- **Charts** (`drawLineChart`, `drawBarChart`, `monotonePath`, `niceTicks`) are hand-drawn SVG, no charting library.
- **Theming** is entirely CSS custom properties (`--bg`, `--text`, `--gold`, etc.) swapped via `data-theme="dark"|"light"` on `<html>`, set by `applyTheme()` and mirrored by the anti-flash inline script in `index.html` (reads the last saved theme before first paint to avoid a flicker).
- **Images** (exercise thumbnails, etc.) are downscaled and re-encoded client-side in `readImageScaled()` before being stored, to stay under the localStorage quota — don't store raw uploaded file data.

There are two placeholder slots called out in the top-of-file comment (`PLACEHOLDER_BODY_GRAPH_SLOT`, `PLACEHOLDER_PLANNER_TAB_SLOT`) marking intentionally-deferred features (body measurement graphs, a Program Planner tab) — grep for these tokens before assuming a feature is simply missing.
