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

Everything lives in four files: `index.html` (shell + theme-flash-prevention inline script), `styles.css` (all styling, theme-driven via CSS custom properties), `i18n.js` (every string, in three languages), and `app.js` (the entire application).

# Languages

English, Українська and Svenska. `i18n.js` holds `UI[lang]` (all interface copy, keyed by dotted name) and `EX[lang]` (the 41 built-in exercises as `[name, equipment, alternatives, note]`, in the same order as `DEFAULT_LIBRARY`). English lives in `UI.en` and in `DEFAULT_LIBRARY` itself. `T("key", vars)` looks a string up and falls back to English then to the key, so a partial translation is always safe; `TN("day", n)` picks plural forms (one/other for en+sv, one/few/many for uk). Long copy carries its own `*bold*` and `_italic_`.

Adding or removing a language means editing `LANGS`, `LOCALES` and the matching `UI`/`EX` blocks. `resolveLang()` coerces anything not in `LANGS` to English, so a saved setting for a language that has since been dropped degrades quietly — and `migrate()` rewrites it on load.

**The rule that keeps data safe: translations are display only.** Everything persisted stays in English, because those strings are identity — a log entry points at `"Bench Press (Barbell)"`, a goal is filed under it, an exercise sits in the group `"Chest"`. Switching language must never orphan a logged workout. So:

- `exLabelOf(ex)` / `exLabel(name)` / `exFieldOf(ex, field)` translate built-in exercises via their stable `default-N` id; a custom exercise, or a built-in field the user has edited, is shown exactly as typed.
- `groupLabel(name)` translates a group only if it carries a `key`; renaming one drops the key, because the name is theirs now. Same trick for seeded timers (`timerLabel`, `key: "rest"`).
- **`data-*` attributes are lookup keys and must carry the stored English name**, never a label. Translating one silently breaks the click handler that resolves it.
- Dates go through `fmtDate`/`fmtShort`, which use `localeTag()` so they follow the app's language rather than the device's.

**`app.js` is a hand-rolled single-file SPA framework** — no React/Vue/build tooling. Key pieces, in the order they appear in the file:

- **`DEFAULT_LIBRARY`** — the seeded exercise library (name, muscle, kind, equipment, alternative, cue notes), ported verbatim from the spreadsheet's Exercise Library sheet.
- **Pure calculation helpers** (`bestSet`, `syncEntry`, `computeBadges`, `dashboardRows`, `weeklyTotals`, `volumeForWeek`, `deloadRadar`, `bodyTrend`, etc.) — these are the spreadsheet-formula ports; keep them side-effect-free.
- **`state`** (persisted) vs **`ui`** (transient, in-memory only) — two separate global objects. `state` holds workout log, library, muscle `groups`, presets, timers, goals, body measurements, `dayDrafts`, settings; it's loaded via `loadState()`/`migrate()` and written to `localStorage` under key `powerbuild-tracker:v1` via `persist()`/`writeNow()` (debounced autosave, flushed on visibility change / pagehide / beforeunload). `ui` holds open sheets, form drafts, filters, etc., and is never persisted directly — but in-progress drafts (open workout sheet, entry form, set form, body form) are snapshotted into `state.drafts` so a killed/reloaded tab restores exactly where the user left off (see `snapshotDrafts()` and the `restoreDrafts` IIFE at the bottom of the file).
- **Two unrelated things are called "drafts."** `state.drafts` is the crash/lock snapshot of whatever form is open right now. `state.dayDrafts` is deliberate: backing out of a half-built workout parks the whole day there (`closeWorksheet()`/`stashDayDraft()`), it renders above the history in the Log tab, and nothing in it counts toward sets, PRs, volume or the charts until the day is actually committed.
- **Muscle groups are records, not a colour map.** `state.groups` is `[{name, key?, color}]`, seeded from `DEFAULT_GROUPS`; `colorFor()` reads it, so recolouring a group repaints every surface at once. **Its order is the order groups appear in everywhere**, and the user sets that by dragging in the group manager (`startGroupDrag`/`reorderGroups`, pointer events rather than HTML5 drag-and-drop, which never fires on touch). Renaming a group in `actions["group-save"]` has to carry the library, log, presets, volume goals and the active filter with it; deleting one tips whatever is still in it into the bucket rather than refusing.
- **Deloads are planned, never inferred.** `state.deloads` is `[{id, start, end}]` with inclusive ISO dates, set by tapping two days on the Weekly Volume calendar. `deloadStatus()` decides what the home banner says: nothing, a countdown once the start is within `DELOAD_HEADSUP` days, then a day-N-of-M badge while it runs. The old five-hard-weeks radar is gone — it was guessing at something only the lifter knows.
- **The Weekly Volume calendar** (`renderCalendar`) layers three independent things on each day cell: a tint for the program week whose numbers are shown below, a dashed gold band for a deload, and dots for the muscle groups trained. Calendar maths is all ISO strings (`isoOf`, `monthOf`, `addMonths`, `monthGrid`, `weekRange`) built from local date parts, so a daylight-saving shift can't move a day.
- **`UNCATEGORIZED` is a bucket, not a group.** It is never in `state.groups` and is the destination for exercises whose group got deleted. Two list functions keep the distinction: **`libraryGroups()`** is what the user can *choose* (filter chips, the muscle dropdown, quick-add chips, the group manager) and never contains it; **`allGroups()`** is what must be *shown* (library sections, the exercise picker) and appends it last when anything is in it. It has no target control in the Volume tab, its name is refused in the group editor, and it disappears on its own once every exercise has been re-filed.
- **Numbers accept a comma or a period.** Every numeric field is `${NUM}` (a text input with `data-num`, not `type="number"`, which discards the "wrong" separator). `handleBind()` strips non-numeric characters and stores the value period-separated via `decimalize()`; the field itself keeps whatever the user typed. Add new numeric fields with `${NUM}`, never `type="number"`.
- **`migrate(s)`** — schema migration for `state` loaded from localStorage. Bump/extend this whenever the persisted shape changes, rather than assuming a fresh shape.
- **`render()`** — rebuilds the `#app` innerHTML from `state`/`ui` on every change. Sub-renderers per tab/screen (`renderHome`, `renderLog`, `renderHistory`, `renderVolume`, `renderProgress`, `renderLibrary`, `renderBody`, `renderTimers`, `renderProfile`, etc.) return HTML strings that `render()` assembles. `patch(p)` is the standard way to mutate `state` (shallow-merges, then persists + re-renders).
- **Event delegation, not per-element listeners.** Clicks are handled by a single `document.addEventListener("click", ...)` that dispatches on the closest `[data-action]` ancestor to the `actions` object (a big lookup table of action-name → handler, defined right before the click listener). Typed input is handled by delegated `input`/`change` listeners keyed on `data-bind` attributes, routed through `handleBind()`. When adding new interactive elements, follow this pattern (`data-action="my-action"` + an `actions.my-action` entry, or `data-bind="path.to.field"` + a branch in `handleBind`) rather than attaching listeners directly to DOM nodes — nodes are thrown away and re-created on every `render()`.
- **`data-stopprop`** marks elements (sheet backdrops, nested editors) where an outer `data-action` must not fire when a click lands on an inner one — see the click listener for the containment check.
- **Sheets/overlays** (`sheet()`, `fullScreen()`) are modal-style panels layered via `ui` flags (e.g. `ui.showProfile`, `ui.showBody`, `ui.workoutSheet`, `ui.entryForm`, `ui.groupSheet`) rather than routing. Body measurements is one of these windows, opened from the ruler button next to the header gear — it is not a bottom-nav tab.
- **Timers** run on their own interval engine (`startTimerEngine`, `sweepTimers`, `fireTimer`) independent of `render()`, with Web Audio chime (`chime`/`unlockAudio`) and Notification API integration (`askNotifyPermission`, `notifyDone`). One timer can be on screen several times at once — its card on the Timer tab, its dial on Home (up to 3 pinned, `pinnedTimers()`), its row in the list embedded at the bottom of the workout and exercise windows (`renderTimerList()`) — so `paintTimers()` addresses every copy by `[data-tmr-time]` / `[data-tmr-ring]`, never by a single element id. Because that list is embedded inside overlays, the timer editor sheet sits at `z-index` 120, above all of them.
- **Charts** (`drawLineChart`, `drawBarChart`, `monotonePath`, `niceTicks`) are hand-drawn SVG, no charting library.
- **Theming** is entirely CSS custom properties (`--bg`, `--text`, `--gold`, etc.) swapped via `data-theme="dark"|"light"` on `<html>`, set by `applyTheme()` and mirrored by the anti-flash inline script in `index.html` (reads the last saved theme before first paint to avoid a flicker).
- **Images** (exercise thumbnails, etc.) are downscaled and re-encoded client-side in `readImageScaled()` before being stored, to stay under the localStorage quota — don't store raw uploaded file data.

There are two placeholder slots called out in the top-of-file comment (`PLACEHOLDER_BODY_GRAPH_SLOT`, `PLACEHOLDER_PLANNER_TAB_SLOT`) marking intentionally-deferred features (body measurement graphs, a Program Planner tab) — grep for these tokens before assuming a feature is simply missing.
