/* ═══════════════════════════════════════════════════════════════════════════
   POWERBUILD TRACKER — mobile prototype (vanilla HTML/CSS/JS port)
   Faithful port of "AbsoluteMain.xlsx" (Powerbuilding Progressive Overload
   Tracker). All spreadsheet formulas are reimplemented in the helpers below.

   ┌─────────────────────── PLACEHOLDER INDEX ───────────────────────────┐
   │ Search for these tokens to swap in real assets later:               │
   │                                                                     │
   │ 1. PLACEHOLDER_BODY_GRAPH_SLOT  — future measurement graphs, Body   │
   │    tab bottom                                                       │
   │ 2. PLACEHOLDER_PLANNER_TAB_SLOT — future Program Planner card, in   │
   │    Profile (v1 intentionally ships without the planner tab; its     │
   │    deload radar lives on Home instead)                              │
   │                                                                     │
   │ Done: the Home logo and the tab-header brand mark now use           │
   │ logoC.png; the reserved Home banner slot was removed (the deload    │
   │ alert is the only banner that renders there).                       │
   └─────────────────────────────────────────────────────────────────────┘

   Spreadsheet → code map:
   · Week number        = MAX(1, INT((date-start)/7)+1)        → weekOf()
   · Muscle group       = INDEX/MATCH on Exercise Library      → muscleOf()
   · Est. 1RM (Epley)   = ROUND(weight*(1+reps/30),1)          → epley1RM()
   · Cardio equivalent  = minutes × RPE (session-RPE load)     → cardioScore()
   · "vs. Your Best"    = compare vs earlier rows, same lift   → computeBadges()
   · Dashboard row      = MAXIFS / COUNTIF / MAXIFS(date)      → dashboardRows()
   · Weekly volume      = SUMIFS(sets, week, muscle)           → volumeForWeek()
   · Deload radar       = 5 hard weeks, no light week          → deloadRadar()
   · Body trend check   = first/last/Δ/count                   → bodyTrend()
   ═══════════════════════════════════════════════════════════════════════════ */

"use strict";

/* ────────────────────────── DEFAULT LIBRARY ─────────────────────────
   Verbatim from the Exercise Library sheet (rows 6–46).              */

const DEFAULT_LIBRARY = [
  ["Bench Press (Barbell)","Chest","Compound","Barbell","Dumbbell Bench Press · Floor Press","Hits the mid chest and front delts. Pin your shoulder blades down and back the whole set. If the bar path bugs your shoulders, dumbbells or a floor press cut the painful bottom range."],
  ["Dumbbell Bench Press","Chest","Compound","Dumbbells","Machine Chest Press","Hits the mid chest and front delts. A freer path than a barbell, usually the shoulder-friendly choice, let the dumbbells drift a little at the bottom for a deeper stretch."],
  ["Incline Bench (Smith Machine)","Chest","Compound","Smith machine","Incline Dumbbell Press","Targets the upper chest and front delts. The Smith locks the path so you can push hard without a spotter, keep the bench around 30 degrees so it stays chest, not all shoulders."],
  ["Incline Dumbbell Press","Chest","Compound","Dumbbells","Incline Bench (Smith Machine)","Targets the upper chest and front delts. The go-to upper-chest builder, switch to the Smith version when you want to load heavier with confidence."],
  ["Machine Chest Press","Chest","Compound","Machine","Push-Up (weighted)","Hits the mid chest and triceps. Great for pushing close to failure without a spotter, squeeze hard at the end of every rep."],
  ["Cable Fly","Chest","Isolation","Cables","Pec Deck","Isolates the inner chest and front delts. Constant tension that stays easy on the shoulders when pressing feels grumpy, think about hugging a tree, don't press."],
  ["Lat Pulldown","Back","Compound","Machine/Cable","Pull-Up · Weighted Pull-Up","Builds the lats (back width) and biceps. A heavy vertical pull with zero spinal compression, a legit deadlift-day anchor for disc issues, drive your elbows down, not your hands back."],
  ["Pull-Up","Back","Compound","Bodyweight","Lat Pulldown","Builds the lats and biceps. When bodyweight gets easy, add weight, lead with your chest and pull your elbows to your ribs."],
  ["Weighted Pull-Up","Back","Compound","Bodyweight + belt","Heavy Lat Pulldown","Builds the lats and biceps. Same movement as a pull-up with more load, pick whichever version lets you load heavier that day."],
  ["Cable Row (Seated)","Back","Compound","Cables","Chest-Supported Row","Works the mid back (rhomboids) and lats. A horizontal pull staple, go chest-supported when you want the lower back fully out of it."],
  ["Chest-Supported Row (Machine)","Back","Compound","Machine","Cable Row · T-Bar Row","Works the mid back (rhomboids and traps) and lats. The pad braces you so your back just rows, the best row for protecting your spine, pause a beat at the squeeze."],
  ["T-Bar Row","Back","Compound","T-bar/Landmine","Chest-Supported Row","A big loader for the mid back (traps and rhomboids) and lats. Swap to a chest-supported row if your lower back starts rounding under fatigue."],
  ["Deadlift","Back","Compound","Barbell","Heavy Lat Pulldown · Weighted Pull-Up · Rack Pull","Trains the whole posterior chain, mainly the glutes, hamstrings and lower-back erectors. The classic but not mandatory, disc issues? Heavy vertical pulls and rows build the same pulling strength without the axial load. Train around pain, not through it."],
  ["Rack Pull","Back","Compound","Barbell + rack","Heavy Lat Pulldown","Loads the glutes, hamstrings and upper-back traps. A shortened-range deadlift from pins, less lower-back demand but still a heavy pull, set the pins just below the knee."],
  ["Face Pull","Back","Isolation","Cables","Rear Delt Fly","Targets the rear delts and upper-back traps. Cheap insurance for healthy shoulders, pull to your forehead and lead with your pinkies."],
  ["Overhead Press (Barbell)","Shoulders","Compound","Barbell","Dumbbell Shoulder Press · Landmine Press","Builds the front delts and triceps. If strict overhead bothers your shoulders, the landmine's angled path is the go-to, brace your glutes so you don't lean back."],
  ["Dumbbell Shoulder Press","Shoulders","Compound","Dumbbells","Machine Shoulder Press","Builds the front and side delts plus triceps. Friendlier than a barbell for most shoulders, use the machine version to push near failure safely."],
  ["Landmine Press","Shoulders","Compound","Barbell + landmine","Dumbbell Shoulder Press","Works the front delts and upper chest. The shoulder-friendly press when strict overhead is off the menu, press up and slightly forward."],
  ["Lateral Raise (Dumbbell)","Shoulders","Isolation","Dumbbells","Cable Lateral Raise","Isolates the side delts, the muscle that gives you width, plus a little upper trap. Light weight and strict form, lead with your elbows and don't swing."],
  ["Cable Lateral Raise","Shoulders","Isolation","Cables","Lateral Raise (Dumbbell)","Isolates the side delts and upper traps. Cables keep tension at the bottom where dumbbells give you a rest you didn't ask for, slow on the way down."],
  ["Cable Curl","Arms","Isolation","Cables","Dumbbell Curl · EZ-Bar Curl","Hits both heads of the biceps and the forearms. Constant tension through the whole curl, keep your elbows pinned to your sides."],
  ["Dumbbell Curl","Arms","Isolation","Dumbbells","Hammer Curl","Hits the biceps (short head) and forearms. Switch to a hammer grip if your wrists or elbows complain, no swinging for momentum."],
  ["Hammer Curl","Arms","Isolation","Dumbbells","Cable Rope Hammer Curl","Builds the brachialis and biceps for thicker-looking arms. Hold a neutral grip the whole way and control the lowering."],
  ["Skull Crusher","Arms","Isolation","EZ-bar/Dumbbells","Cable Overhead Extension","Targets the triceps, especially the long head. Elbows achy? Overhead cable extensions keep the stretch and drop the elbow stress, lower to your forehead."],
  ["Cable Pushdown","Arms","Isolation","Cables","Skull Crusher","Hits the triceps (lateral head) and forearms. The triceps workhorse, easy to load and easy on the joints, keep your elbows glued to your sides."],
  ["Cable Overhead Extension","Arms","Isolation","Cables","Skull Crusher","Stretches the triceps long head, which is where most of the growth is. Rotate it with skull crushers block to block."],
  ["Squat (Barbell)","Legs","Compound","Barbell","Hack Squat · Leg Press · Bulgarian Split Squat","Trains the quads and glutes. Also not mandatory, back or knee issues? The hack squat and leg press load the legs hard with your spine supported and you lose nothing that matters for muscle. Brace hard before you break parallel."],
  ["Hack Squat","Legs","Compound","Machine","Leg Press","Trains the quads (that outer sweep) and glutes. Squat-pattern loading with your back braced against a pad, a powerbuilder's best friend, feet low on the platform for more quad."],
  ["Leg Press","Legs","Compound","Machine","Hack Squat","Trains the quads and glutes. Push heavy loads with zero spinal loading, just don't ego-load the range, get your thighs to at least parallel."],
  ["Bulgarian Split Squat","Legs","Compound","Dumbbells + bench","Split Squat (supported)","Hammers the quads and glutes one leg at a time. Brutal but brilliant and back-friendly, hold something for balance until you're stable, that's smart, not weak."],
  ["Leg Extension","Legs","Isolation","Machine","—","Isolates all four heads of the quads, especially the teardrop. A must-have finisher, squeeze at the top and control the way down."],
  ["Hamstring Curl (Lying/Seated)","Legs","Isolation","Machine","Nordic Curl (assisted)","Isolates the hamstrings with a little calf. The direct hamstring work most programs forget, seated versions get a bigger stretch and grow more."],
  ["Romanian Deadlift (Dumbbell)","Legs","Compound","Dumbbells","Hamstring Curl · Hip Thrust","Trains the hamstrings and glutes. A hinge with lighter load than a barbell RDL, if any hinge aggravates your back, curls plus hip thrusts cover the same muscles."],
  ["Hip Thrust","Legs","Compound","Barbell + bench","Machine Hip Thrust","Builds the glutes and hamstrings. Real glute strength without spinal compression, pause and squeeze hard at the top of every rep."],
  ["Calf Raise (Standing)","Legs","Isolation","Machine","Seated Calf Raise","Targets the calves, mainly the gastrocnemius. Pause at the bottom stretch, that's where calves actually grow, full range and no bouncing."],
  ["Cable Crunch","Core","Isolation","Cables","Machine Crunch","Works the abs (rectus abdominis) and obliques. Loaded abs beat endless floor crunches, round your spine down rather than just bowing at the hips."],
  ["Hanging Knee Raise","Core","Isolation","Bodyweight","Captain's Chair Raise","Hits the lower abs and hip flexors. Go slow and controlled, if you swing you're just training momentum."],
  ["Plank (weighted)","Core","Isolation","Bodyweight","Ab Wheel Rollout","Trains the deep core (transverse abdominis) and abs. Anti-extension strength that protects your lower back rather than testing it, squeeze your glutes and don't let your hips sag."],
  ["Cardio: Incline Walk","Cardio","Cardio","Treadmill","Cycling · Rowing","Conditions your heart and lungs while lightly working the calves. Low-impact and joint-friendly, logged as minutes × intensity, set a steep incline and skip the handrails."],
  ["Cardio: Cycling","Cardio","Cardio","Bike","Incline Walk · Rowing","Conditions your heart and lungs and lightly taxes the quads. Zero impact, ideal on leg-day-adjacent days, keep the resistance honest instead of just spinning."],
  ["Cardio: Rowing","Cardio","Cardio","Rower","Cycling","Full-body conditioning that also hits the mid back. Drive with your legs first and keep your back neutral the whole stroke."],
].map(([name, muscle, type, equipment, alternatives, note], i) => ({
  id: "default-" + i, name, muscle, type, equipment, alternatives, note,
  image: "", video: "", custom: false,
}));

const MUSCLE_COLORS = {
  Chest: "#d05a50", Back: "#5d8bcc", Shoulders: "#e9b949", Arms: "#6aa465",
  Legs: "#aab4c0", Core: "#8fa39a", Cardio: "#a07ec2",
};
const EXTRA_COLORS = ["#c98f5a", "#7ea0b8", "#b0a06a", "#9a8fb8"];
const colorFor = (muscle, i = 0) =>
  MUSCLE_COLORS[muscle] || EXTRA_COLORS[i % EXTRA_COLORS.length];

/* ─────────────────────────── FORMULA HELPERS ────────────────────────── */

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const parseDay = (s) => new Date(s + "T00:00:00");
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);

/* Week: =MAX(1, INT((date - start)/7) + 1) */
const weekOf = (dateStr, startStr) =>
  !dateStr || !startStr ? 1 : Math.max(1, Math.floor(daysBetween(startStr, dateStr) / 7) + 1);

/* Est. 1RM (Epley): =ROUND(weight*(1+reps/30),1) */
const epley1RM = (weight, reps) =>
  weight > 0 && reps > 0 ? Math.round(weight * (1 + reps / 30) * 10) / 10 : null;

/* Cardio "1RM equivalent": session-RPE load (Foster) = minutes × RPE */
const cardioScore = (minutes, intensity) =>
  minutes > 0 && intensity > 0 ? Math.round(minutes * intensity) : null;

const isCardioEx = (ex) => ex && (ex.type === "Cardio" || ex.muscle === "Cardio");

const fmtDate = (s, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  s ? parseDay(s).toLocaleDateString(undefined, opts) : "—";
const fmtShort = (s) => fmtDate(s, { day: "numeric", month: "short" });

const chronoSort = (log) =>
  [...log].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));

/* ─────────────────────────── UNITS ──────────────────────────────────
   Gyms are inconsistent: the leg press is stamped in kg, the dumbbell rack
   is in lbs. So the unit lives on the ENTRY, picked right above the weight
   field, and you type whatever the machine says, no mental arithmetic.

   Profile → Default unit is only the starting pick for a new entry and the
   unit every comparison happens in: est. 1RM, PRs, goals and the progress
   graph all convert to that one unit so the numbers stay comparable no
   matter which plate stack they came from. Entries logged before units
   went per-exercise are stamped with the then-current default by migrate(),
   so nothing on record ever changes meaning. */

const UNITS = ["kg", "lbs"];
const LB_PER_KG = 2.2046226218;

const convertWeight = (w, from, to) =>
  !(w > 0) || from === to ? w : from === "kg" ? w * LB_PER_KG : w / LB_PER_KG;

/* the unit an entry was logged in — older entries fall back to the default */
const unitOf = (e) => (e && e.unit) || state.settings.units;

/* an entry's weight expressed in the default unit, for comparisons only */
const baseWeight = (e) => convertWeight(+e.weight, unitOf(e), state.settings.units);

const metricOf = (e) =>
  e.kind === "cardio" ? cardioScore(+e.minutes, +e.intensity) : epley1RM(baseWeight(e), +e.reps);

/* ───────────────────── DETAILED MODE: PER-SET LOGGING ────────────────
   An entry logged in Detailed mode carries a `setList`: one row per set,
   each with its own reps / weight / RPE. An entry logged in FSBS mode has
   no setList at all — it's a total-set count plus the numbers of the top set.

   Either way every entry keeps the same four headline fields filled in
   (sets / reps / weight / rpe). For a detailed entry those are DERIVED from
   its best set, the one with the highest estimated 1RM. That single rule is
   what makes the two modes interchangeable: flip back to FSBS and a detailed
   entry simply shows its best set, while weekly volume, PR badges, the
   dashboard and the charts all keep reading the fields they always read.
   Nothing is ever thrown away — the setList stays on the entry. */

const newSet = (reps = "", weight = "", rpe = "") => ({ id: uid(), reps, weight, rpe });
const isDetailed = (e) => Array.isArray(e && e.setList);
const setHasData = (s) => +s.reps > 0 && +s.weight > 0;
const filledSets = (e) => (e.setList || []).filter(setHasData);

/* The set with the highest estimated 1RM — the one that speaks for the whole
   exercise everywhere the app shows a single number. */
function bestSet(list) {
  let best = null, bestM = -Infinity;
  for (const s of list || []) {
    const m = epley1RM(+s.weight, +s.reps);
    if (m != null && m > bestM) { bestM = m; best = s; }
  }
  return best;
}

/* Refresh a detailed entry's headline fields from its sets. Call this after
   any change to setList. No-op for FSBS and cardio entries. */
function syncEntry(e) {
  if (!isDetailed(e) || e.kind === "cardio") return e;
  const filled = filledSets(e);
  const b = bestSet(filled);
  return { ...e, sets: filled.length, reps: b ? b.reps : "", weight: b ? b.weight : "", rpe: b ? b.rpe : "" };
}

/* Does a draft entry carry logged numbers yet? Entries dropped in from a preset
   start blank, they need sets/reps/weight (or minutes/intensity) filled in. */
const entryHasData = (e) =>
  e.kind === "cardio" ? +e.minutes > 0 && +e.intensity > 0
    : isDetailed(e) ? filledSets(e).length > 0
    : +e.sets > 0 && +e.reps > 0 && +e.weight > 0;

/* One-line summary of an entry, shared by the history list and the draft cards.
   "top" for a single logged top set, "best" when it's the pick of a full set
   list — same number either way, but the word tells you where it came from. */
function entrySummary(e, unit, withRpe = false) {
  if (e.kind === "cardio") return `${esc(e.minutes)} min × RPE ${esc(e.intensity)}`;
  const label = isDetailed(e) ? "best" : "top";
  /* always in the unit the set was actually logged in, never converted —
     what you typed is what you read back */
  return `${esc(e.sets)} sets · ${label} ${esc(e.reps)} × ${esc(e.weight)} ${unitOf(e)}` +
    (withRpe && e.rpe ? ` · RPE ${esc(e.rpe)}` : "");
}

/* "vs. Your Best" — compares against strictly earlier entries of the same
   exercise, exactly like the sheet's row-above MAXIFS window. */
function computeBadges(log) {
  const bests = {}; const out = {};
  for (const e of chronoSort(log)) {
    const m = metricOf(e);
    if (m == null) { out[e.id] = { badge: null, metric: null }; continue; }
    const prev = bests[e.exercise];
    let badge;
    if (prev === undefined) badge = "first";
    else if (m > prev) badge = "pr";
    else if (m === prev) badge = "match";
    else badge = "below";
    out[e.id] = { badge, metric: m, prevBest: prev ?? null };
    bests[e.exercise] = prev === undefined ? m : Math.max(prev, m);
  }
  return out;
}
const BADGE_TEXT = {
  first: "First log ✍️", pr: "Beat your best 💪",
  match: "Matched your best", below: "Below best, normal, keep going",
};
const BADGE_SHORT = { first: "First ✍️", pr: "PR 💪", match: "= Best", below: "" };

function muscleOf(name, library, fallback) {
  const ex = library.find((x) => x.name === name);
  return ex ? ex.muscle : fallback || "—";
}

/* Dashboard rows — first-appearance order, MAXIFS/COUNTIF equivalents */
function dashboardRows(log, library, goals) {
  const seen = new Map();
  for (const e of chronoSort(log)) {
    const m = metricOf(e);
    if (!seen.has(e.exercise))
      seen.set(e.exercise, { name: e.exercise, best: null, sessions: 0, last: e.date, cardio: e.kind === "cardio" });
    const r = seen.get(e.exercise);
    r.sessions += 1;
    if (e.date > r.last) r.last = e.date;
    if (m != null) r.best = r.best == null ? m : Math.max(r.best, m);
  }
  return [...seen.values()].map((r) => {
    const goal = goals[r.name];
    const progress = goal && r.best != null ? Math.min(1, r.best / goal) : goal ? 0 : null;
    return { ...r, muscle: muscleOf(r.name, library), goal: goal ?? null, progress };
  });
}

function weeklyTotals(log, startDate) {
  const sets = {}; const cardioMin = {};
  for (const e of log) {
    const w = weekOf(e.date, startDate);
    if (e.kind === "cardio") cardioMin[w] = (cardioMin[w] || 0) + (+e.minutes || 0);
    else sets[w] = (sets[w] || 0) + (+e.sets || 0);
  }
  return { sets, cardioMin };
}

/* Volume tab: SUMIFS(sets, week, muscle) — cardio counted in minutes */
function volumeForWeek(log, library, startDate, week) {
  const out = {};
  for (const e of log) {
    if (weekOf(e.date, startDate) !== week) continue;
    if (e.kind === "cardio") out.Cardio = (out.Cardio || 0) + (+e.minutes || 0);
    else {
      const m = muscleOf(e.exercise, library, e.muscle);
      out[m] = (out[m] || 0) + (+e.sets || 0);
    }
  }
  return out;
}

/* Deload radar — app version of the Planner's rule: 5 consecutive weeks of
   real training with no light week (≤50% of the window's biggest week). */
function deloadRadar(log, startDate) {
  const { sets, cardioMin } = weeklyTotals(log, startDate);
  const load = (w) => (sets[w] || 0) + (cardioMin[w] || 0) / 10;
  const cur = weekOf(todayStr(), startDate);
  const lastTrained = Math.max(0, ...Object.keys(sets).map(Number), ...Object.keys(cardioMin).map(Number));
  const end = Math.min(cur, lastTrained);
  if (end < 5) return null;
  const window = [end - 4, end - 3, end - 2, end - 1, end].map(load);
  if (window.some((v) => v <= 0)) return null;
  const max = Math.max(...window);
  if (window.some((v) => v <= max * 0.5)) return null;
  return { weeks: 5, endWeek: end };
}

function bodyTrend(body) {
  const rows = [...body].sort((a, b) => (a.date < b.date ? -1 : 1));
  const withBW = rows.filter((r) => r.weight !== "" && r.weight != null);
  const first = withBW[0]?.weight ?? null;
  const last = withBW[withBW.length - 1]?.weight ?? null;
  return {
    first, last,
    change: first != null && last != null && withBW.length > 1
      ? Math.round((last - first) * 10) / 10 : null,
    count: rows.length,
  };
}

/* ───────────────────────────── STORAGE ─────────────────────────────── */

const STORE_KEY = "powerbuild-tracker:v1";
const defaultState = () => ({
  version: 4,
  settings: { name: "", units: "kg", startDate: todayStr(), daysPerWeek: 4, theme: "dark", loggingMode: "fsbs" },
  library: DEFAULT_LIBRARY,
  log: [],        // {id,date,exercise,muscle,kind,sets,reps,weight,rpe,unit,minutes,intensity,notes,createdAt,setList?}
  body: [],       // {id,date,weight,waist,chest,arm,thigh,glutes,notes}
  goals: {},      // { [exerciseName]: number }
  volumeGoals: {},// { [muscleGroup]: targetSetsPerWeek } — user's own weekly set target
  presets: [],    // [{id,name,description,exercises:[{exercise,muscle,kind}],createdAt}] — reusable exercise bundles
  timers: [],     // [{id,name,duration,endsAt,remaining,doneAt,createdAt}] — Timer tab
  drafts: {},     // half-finished forms, restored after a crash/lock — see snapshotDrafts()
});

/* Bring an older saved state up to the current shape. Idempotent. */
function migrate(s) {
  const v = s.version || 1;
  if (v < 2) {
    /* v2 rewrote every built-in exercise's Details and added the image/video
       fields. Refresh the built-in library rows to the new content (matched by
       their stable "default-*" id) while keeping the user's custom exercises,
       and make sure every row has image/video keys so the editor works. */
    const byId = Object.fromEntries(DEFAULT_LIBRARY.map((d) => [d.id, d]));
    s.library = (s.library || []).map((ex) =>
      !ex.custom && byId[ex.id] ? { ...byId[ex.id] } : { image: "", video: "", ...ex });
    s.version = 2;
  }
  if (v < 3) {
    /* v3 added Detailed (per-set) logging, the Timer tab and crash-proof
       drafts. Existing logs have no setList, so they stay FSBS entries and
       keep rendering exactly as before. */
    if (!s.settings) s.settings = {};
    if (!s.settings.loggingMode) s.settings.loggingMode = "fsbs";
    if (!Array.isArray(s.timers)) s.timers = [];
    if (!s.drafts || typeof s.drafts !== "object") s.drafts = {};
    s.version = 3;
  }
  if (v < 4) {
    /* v4 moved the unit from a single global setting onto each entry. Every
       weight already on record was typed in the then-current default, so
       stamp that unit on it — otherwise switching the default later would
       silently reinterpret old numbers. Drafts get the same treatment. */
    if (!s.settings) s.settings = {};
    const u = s.settings.units || "kg";
    const stamp = (e) => (!e || e.kind === "cardio" || e.unit ? e : { ...e, unit: u });
    s.log = (s.log || []).map(stamp);
    if (s.drafts && typeof s.drafts === "object") {
      if (s.drafts.entry && s.drafts.entry.f) s.drafts.entry.f = stamp(s.drafts.entry.f);
      if (s.drafts.workout && Array.isArray(s.drafts.workout.entries))
        s.drafts.workout.entries = s.drafts.workout.entries.map(stamp);
    }
    s.version = 4;
  }
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const merged = { ...defaultState(), ...saved, settings: { ...defaultState().settings, ...saved.settings } };
      return migrate(merged);
    }
  } catch { /* first run — key doesn't exist yet */ }
  return defaultState();
}

let state = loadState();
let saveTimer = null;

/* ── CHECKPOINTING HALF-FINISHED WORK ───────────────────────────────────
   Anything you're in the middle of typing lives in `ui`, which is memory
   only. A phone locking the screen can evict the page at any moment, so
   before every write we copy the open forms into state.drafts. Reopening
   the app puts you back exactly where you were, mid-exercise, mid-set,
   nothing retyped. The drafts are cleared the moment a form is closed or
   committed, because snapshotDrafts() always mirrors the *current* ui.  */
const clone = (o) => (o == null ? null : JSON.parse(JSON.stringify(o)));

function snapshotDrafts() {
  state.drafts = {
    workout: clone(ui.workoutSheet),
    entry: clone(ui.entryForm),
    set: clone(ui.setForm),
    body: clone(ui.bodyForm),
    bodyWasNew: ui.bodyFormWasNew,
    savedAt: Date.now(),
  };
}

/* write straight through — used when the page is about to go away */
function writeNow() {
  clearTimeout(saveTimer); saveTimer = null;
  snapshotDrafts();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { console.error("save failed", e); }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 400);
}
function patch(p) { state = { ...state, ...p }; persist(); render(); }

/* The screen turning off, the app being swiped away, or the browser
   reclaiming memory all fire one of these first. Flush synchronously. */
document.addEventListener("visibilitychange", () => { if (document.hidden) writeNow(); });
window.addEventListener("pagehide", writeNow);
window.addEventListener("beforeunload", writeNow);

/* Stamp the active theme onto <html> so the CSS variable blocks apply. */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ─────────────────────────── UI STATE ──────────────────────────────── */

const ui = {
  tab: "home",
  logSeg: "history",
  showProfile: false,
  profileDraft: null,
  workoutSheet: null,   // {date, entries:[]} draft
  presetForm: null,     // {name, description} draft while saving the current day as a preset
  presetView: null,     // working copy of a saved preset being managed/edited
  picking: false,
  pickerQ: "",
  pickerQuick: null,    // {name, muscle}
  pickerSeg: "exercises", // exercises | presets — picker mode
  entryForm: null,      // {f, isDraft}
  setForm: null,        // {s, isNew} — the single-set editor inside a Detailed entry
  timerForm: null,      // {t, isNew} — the custom-timer editor
  timerToast: null,     // {id,name} — "time's up" banner, shown on any tab
  exWin: null,          // exercise detail window: {name} for an existing lift, or {isNew:true}
  exWinEdit: false,     // false = read-only view, true = editable
  exWinDraft: null,     // working copy while editing/creating
  exWinNewGroup: false, // "new muscle group" toggle inside the editor
  bodyForm: null,
  bodyFormWasNew: false,
  deloadOpen: false,
  accordions: {},   // all accordions start collapsed
  volumeWeek: null,
  progressSelected: null,
  goalEditing: null,    // exercise name whose goal is being edited
  goalVal: "",
  volGoalEditing: null, // muscle group whose set target is being edited
  volGoalVal: "",
  libraryQ: "",
  libraryFilter: "All",
  librarySeg: "exercises", // exercises | presets — Library sub-tab
};

function resetTransient() {
  ui.deloadOpen = false;
  ui.accordions = {};
  ui.progressSelected = null;
  ui.goalEditing = null;
  ui.volGoalEditing = null;
  ui.libraryQ = "";
  ui.libraryFilter = "All";
  ui.librarySeg = "exercises";
  ui.volumeWeek = weekOf(todayStr(), state.settings.startDate);
}

/* ─────────────────────────── HTML HELPERS ──────────────────────────── */

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const icon = (name, size = 16, extra = "") =>
  `<i data-lucide="${name}" width="${size}" height="${size}" ${extra}></i>`;

const chip = (children, color, style = "") =>
  `<span class="pb-chip" style="color:${color || "var(--muted)"};border-color:${(color || "var(--border)")}55;background:${(color || "#000")}14;${style}">${children}</span>`;

const sectionTitle = (children, right = "") =>
  `<div style="display:flex;align-items:baseline;justify-content:space-between;margin:2px 2px 10px"><div class="pb-label">${children}</div>${right}</div>`;

const placeholder = (token, height, children = "") =>
  `<div class="pb-placeholder" style="height:${height}px"><div style="padding:8px">${children || token}<div style="font-size:9px;margin-top:2px;opacity:.7">${children ? token : "swap me in code"}</div></div></div>`;

/* The unit dropdown that lives inside a weight field's label — tap "kg" and
   pick whatever the machine in front of you is stamped in. */
const unitSelect = (value) =>
  `<select class="pb-unit-select" data-bind="entryUnit" aria-label="Unit for this exercise">${
    UNITS.map((u) => `<option value="${u}"${value === u ? " selected" : ""}>${u}</option>`).join("")
  }</select>`;

/* A label with a control tucked into it. The fixed min-height keeps it level
   with the plain label of the field sitting next to it in the same row, so the
   two inputs still line up. */
const labelWith = (text, control = "") =>
  `<span style="display:inline-flex;align-items:center;gap:7px;min-height:26px">${text}${control}</span>`;

const field = (label, inner, hint = "") =>
  `<div style="margin-bottom:12px"><div class="pb-label" style="margin-bottom:6px">${label}</div>${inner}${hint ? `<div style="font-size:11.5px;color:var(--faint);margin-top:4px">${hint}</div>` : ""}</div>`;

const stat = (label, value, sub = "", color = "") =>
  `<div class="pb-card2" style="padding:10px 12px;flex:1;min-width:0">
    <div class="pb-num" style="font-size:26px;font-weight:700;color:${color || "var(--text)"};line-height:1">${value}</div>
    <div style="font-size:10.5px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">${label}</div>
    ${sub ? `<div style="font-size:11px;color:var(--faint)">${sub}</div>` : ""}
  </div>`;

function accordion(id, title, iconHtml, content) {
  const open = !!ui.accordions[id];
  /* content stays mounted in both states so the CSS grid-row transition can
     animate the height; `is-open` on the card drives the whole animation. */
  return `<div class="pb-card pb-acc${open ? " is-open" : ""}" style="margin-bottom:8px;overflow:hidden">
    <button data-action="toggle-accordion" data-id="${id}" style="width:100%;display:flex;align-items:center;gap:10px;padding:13px 14px;color:var(--text);font-weight:600;font-size:14.5px;text-align:left">
      ${iconHtml}<span style="flex:1">${title}</span>
      <span class="pb-acc-chevron" style="color:var(--muted)">${icon("chevron-down", 16)}</span>
    </button>
    <div class="pb-acc-body"><div class="pb-acc-inner" style="padding:0 14px 14px;font-size:13.5px;line-height:1.55;color:var(--muted)">${content}</div></div>
  </div>`;
}

/* Animate an accordion open/closed by transitioning its measured height, in
   place — no full re-render, so no flicker. Height is released to auto when the
   transition ends so the panel can still reflow if its content ever changes. */
function setAccordion(card, open) {
  const body = card.querySelector(".pb-acc-body");
  if (!body) return;
  if (body._accDone) { body.removeEventListener("transitionend", body._accDone); body._accDone = null; }
  const start = body.offsetHeight;               // current rendered height
  const end = open ? body.scrollHeight : 0;      // full content height, or collapsed
  body.style.height = start + "px";
  void body.offsetHeight;                          // lock the start so the change animates
  card.classList.toggle("is-open", open);          // chevron rotate + content fade
  body.style.height = end + "px";
  const done = (e) => {
    if (e.propertyName !== "height") return;
    body.style.height = open ? "auto" : "";
    body.removeEventListener("transitionend", done);
    body._accDone = null;
  };
  body._accDone = done;
  body.addEventListener("transitionend", done);
}

const B = (t) => `<b style="color:var(--text)">${t}</b>`;

/* chart data captured during render, drawn after mount */
let chartState = { line: null, bar: null };

/* ═══════════════════════ TRANSITION ENGINE ═════════════════════════
   The whole app re-renders on every interaction, so animations must only
   fire on a real change, never on every re-render. render() diffs the new
   frame against these two snapshots and, when something actually changed,
   plays a transition: a crossfade for the main content, a slide for a newly
   opened overlay, and a fade/slide-out for one that just closed. The stale
   outgoing DOM is re-appended as a throwaway "pb-trans" layer that animates
   out and then removes itself. */
let _lastTab = null;
let _lastOverlayKeys = new Set();

const reduceMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const setsEqual = (a, b) => {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
};

/* crossfade the outgoing main-content node out over the freshly rendered one */
function playMainCrossfade(root, oldNode, rect, scrollTop, dur) {
  oldNode.classList.add("pb-trans");
  Object.assign(oldNode.style, {
    position: "absolute", top: rect.top + "px", left: rect.left + "px",
    width: rect.width + "px", height: rect.height + "px",
    margin: "0", zIndex: "6", pointerEvents: "none",
  });
  root.appendChild(oldNode);
  oldNode.scrollTop = scrollTop;             // keep the frozen copy at the same scroll
  oldNode.style.transition = `opacity ${dur}ms ease`;
  requestAnimationFrame(() => { oldNode.style.opacity = "0"; });
  setTimeout(() => oldNode.remove(), dur + 60);
}

/* slide/fade a just-closed overlay out (its node is detached but intact) */
function playLayerExit(root, node) {
  node.classList.add("pb-trans");
  node.style.pointerEvents = "none";
  node.classList.remove("pb-sheet");                                   // don't replay the enter slide
  node.querySelectorAll(".pb-sheet").forEach((e) => e.classList.remove("pb-sheet"));
  root.appendChild(node);
  if (node.dataset.layer === "fs") {
    node.style.animation = "pbSheetOut .2s cubic-bezier(.4,0,1,1) forwards";
  } else {
    node.style.animation = "pbFadeOut .2s ease forwards";              // backdrop dims away
    const card = node.querySelector(".pb-sheet-card");
    if (card) card.style.animation = "pbSheetOut .2s cubic-bezier(.4,0,1,1) forwards";
  }
  setTimeout(() => node.remove(), 260);
}

/* ═════════════════════════════ RENDER ══════════════════════════════ */

const app = document.getElementById("app");

function render() {
  /* drop any still-animating layer from a previous, rapid render */
  app.querySelectorAll(".pb-trans").forEach((el) => el.remove());

  /* preserve scroll positions of marked containers */
  const scrolls = {};
  app.querySelectorAll("[data-scrollkey]").forEach((el) => { scrolls[el.dataset.scrollkey] = el.scrollTop; });

  /* snapshot the outgoing frame so transitions can animate against it */
  const oldMain = app.querySelector('[data-scrollkey^="main-"]');
  const oldMainHTML = oldMain ? oldMain.innerHTML : null;
  const oldMainScroll = oldMain ? oldMain.scrollTop : 0;
  const oldMainRect = oldMain
    ? { top: oldMain.offsetTop, left: oldMain.offsetLeft, width: oldMain.offsetWidth, height: oldMain.offsetHeight }
    : null;
  const oldOverlayEls = {};
  app.querySelectorAll("[data-overlay]").forEach((el) => { oldOverlayEls[el.dataset.overlay] = el; });
  const prevTab = _lastTab;
  const prevOverlayKeys = _lastOverlayKeys;

  const { settings, library, log, body, goals } = state;
  const unit = settings.units;
  const badges = computeBadges(log);
  const currentWeek = weekOf(todayStr(), settings.startDate);
  const radar = deloadRadar(log, settings.startDate);
  if (ui.volumeWeek == null) ui.volumeWeek = currentWeek;
  chartState = { line: null, bar: null };

  const tab = ui.tab;
  const titles = { log: "Workout Log", progress: "Progress", library: "Exercise Library", body: "Body Measurements", timer: "Timers" };

  /* the frame is locked to exactly one viewport height (100dvh tracks mobile
     browser chrome) so the content area scrolls internally and the bottom nav
     is always visible without scrolling the page */
  let html = `<div style="height:100vh;height:100dvh;background:var(--outer);display:flex;justify-content:center;overflow:hidden">
  <div class="pb-root" style="width:100%;max-width:412px;height:100%;position:relative;display:flex;flex-direction:column;border-left:1px solid var(--border-soft);border-right:1px solid var(--border-soft)">`;

  /* header (non-home tabs) */
  if (tab !== "home") {
    html += `<div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--border-soft)">
      <img src="logoC.png" alt="Powerbuild Tracker" width="30" height="30" style="width:30px;height:30px;object-fit:contain;border-radius:8px;display:block;flex-shrink:0">
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${titles[tab]}</div>
      ${chip("Wk " + currentWeek, "var(--gold)")}
      <button data-action="open-profile" style="color:var(--muted);padding:4px">${icon("settings", 20)}</button>
    </div>`;
  }

  /* content */
  html += `<div class="pb-scroll" data-scrollkey="main-${tab}" style="flex:1;min-height:0;overflow-y:auto;padding-bottom:120px">`;
  if (tab === "home") html += renderHome(settings, log, radar, currentWeek, unit, badges);
  if (tab === "log") html += renderLog(log, library, badges, settings, unit, currentWeek);
  if (tab === "progress") html += renderProgress(log, library, goals, badges, settings, unit);
  if (tab === "library") html += renderLibrary(library);
  if (tab === "body") html += renderBody(body, unit);
  if (tab === "timer") html += renderTimers();
  html += `</div>`;

  /* "time's up" banner — floats above the nav on whatever tab you're on, so a
     rest timer finishing while you're logging a set still gets your attention */
  if (ui.timerToast) {
    html += `<div class="pb-sheet" style="position:absolute;left:12px;right:12px;bottom:86px;z-index:40">
      <div class="pb-card pb-timer-done" style="display:flex;align-items:center;gap:11px;padding:13px 14px;border-color:rgba(233,185,73,.55);background:var(--surface)">
        ${icon("bell-ring", 20, 'style="color:var(--gold);flex-shrink:0"')}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;color:var(--gold)">Time's up</div>
          <div style="font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ui.timerToast.name)}</div>
        </div>
        <button data-action="toast-open" class="pb-btn pb-ghost" style="padding:7px 12px;font-size:12.5px">Open</button>
        <button data-action="toast-dismiss" style="color:var(--muted);padding:6px">${icon("x", 18)}</button>
      </div>
    </div>`;
  }

  /* FAB — always-visible overlay on Log & Body */
  if ((tab === "log" || tab === "body") && !ui.workoutSheet) {
    html += `<button data-action="fab" class="pb-btn pb-gold" style="position:absolute;right:18px;bottom:92px;width:56px;height:56px;border-radius:18px;box-shadow:0 8px 22px rgba(233,185,73,.35);z-index:30">${icon("plus", 26, 'stroke-width="2.6"')}</button>`;
  }

  /* bottom nav */
  const NAV = [
    ["home", "home", "Home"], ["log", "clipboard-list", "Log"], ["timer", "timer", "Timer"],
    ["progress", "trending-up", "Progress"], ["library", "book-open", "Library"], ["body", "ruler", "Body"],
  ];
  /* a running timer puts a live dot on its nav icon from anywhere in the app */
  const timersRunning = (state.timers || []).some((t) => t.endsAt || t.doneAt);
  html += `<div style="position:absolute;bottom:0;left:0;right:0;background:var(--nav-bg);backdrop-filter:blur(10px);border-top:1px solid var(--border-soft);display:flex;padding:8px 2px 14px;z-index:25">`;
  for (const [id, ic, label] of NAV) {
    const active = tab === id;
    const dot = id === "timer" && timersRunning
      ? `<span style="position:absolute;top:1px;right:50%;margin-right:-14px;width:7px;height:7px;border-radius:4px;background:var(--gold)"></span>` : "";
    html += `<button data-action="nav" data-id="${id}" style="position:relative;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;color:${active ? "var(--gold)" : "var(--faint)"};padding:4px 0">
      ${dot}${icon(ic, 21, `stroke-width="${active ? 2.4 : 2}"`)}
      <span style="font-size:9.5px;font-weight:700;letter-spacing:.02em">${label}</span>
    </button>`;
  }
  html += `</div>`;

  /* overlays */
  if (ui.workoutSheet) html += renderWorkoutSheet(ui.workoutSheet, library, log, settings, unit);
  if (ui.picking) html += renderExercisePicker(library);
  if (ui.entryForm) html += renderEntryFields(ui.entryForm, unit);
  /* the set editor speaks the unit of the exercise it belongs to, not the default */
  if (ui.setForm) html += renderSetForm(ui.setForm, ui.entryForm ? unitOf(ui.entryForm.f) : unit);
  if (ui.timerForm) html += renderTimerForm(ui.timerForm);
  if (ui.exWin) html += renderExerciseWindow(library);
  if (ui.bodyForm) html += renderBodyFormSheet(ui.bodyForm, unit);
  if (ui.presetForm) html += renderPresetForm();
  if (ui.presetView) html += renderPresetView();
  if (ui.showProfile) html += renderProfile(ui.profileDraft);

  html += `</div></div>`;
  app.innerHTML = html;

  /* restore scroll */
  app.querySelectorAll("[data-scrollkey]").forEach((el) => {
    if (scrolls[el.dataset.scrollkey] != null) el.scrollTop = scrolls[el.dataset.scrollkey];
  });

  if (window.lucide) lucide.createIcons();
  drawCharts();

  /* ── play transitions between the old frame and this one ───────────── */
  const root = app.querySelector(".pb-root");
  const newMain = app.querySelector('[data-scrollkey^="main-"]');
  const curOverlayKeys = new Set([...app.querySelectorAll("[data-overlay]")].map((e) => e.dataset.overlay));
  const overlaysChanged = !setsEqual(prevOverlayKeys, curOverlayKeys);

  if (root && !reduceMotion()) {
    /* an overlay that was open last frame and is gone now → slide it out */
    prevOverlayKeys.forEach((key) => {
      if (!curOverlayKeys.has(key) && oldOverlayEls[key]) playLayerExit(root, oldOverlayEls[key]);
    });
    /* crossfade the page body — but not while an overlay is opening/closing,
       since that overlay's own slide is the movement the eye should follow. */
    if (newMain && oldMain && oldMainRect && !overlaysChanged) {
      const tabChanged = prevTab != null && prevTab !== ui.tab;
      if (tabChanged || oldMainHTML !== newMain.innerHTML) {
        playMainCrossfade(root, oldMain, oldMainRect, oldMainScroll, tabChanged ? 210 : 150);
      }
    }
  }

  _lastTab = ui.tab;
  _lastOverlayKeys = curOverlayKeys;

  /* focus the live content, never an element inside a fading transition layer */
  const af = [...app.querySelectorAll("[data-autofocus]")].find((e) => !e.closest(".pb-trans"));
  if (af) af.focus();

  paintTimers();   // put the freshly mounted rings/digits at the right position
  persist();       // every frame is a save point — see snapshotDrafts()
}

/* ───────────────────────────── HOME ───────────────────────────────── */

function renderHome(settings, log, radar, currentWeek, unit, badges) {
  const totalSets = log.filter((e) => e.kind !== "cardio").reduce((a, e) => a + (+e.sets || 0), 0);
  const prCount = Object.values(badges).filter((b) => b.badge === "pr").length;

  const deloadBanner = radar
    ? `<div class="pb-card" style="border-color:rgba(233,185,73,.4);background:rgba(233,185,73,.07)">
        <button data-action="toggle-deload" style="width:100%;display:flex;gap:10px;align-items:center;padding:12px 14px;text-align:left">
          ${icon("moon", 18, 'style="color:var(--gold);flex-shrink:0"')}
          <div style="flex:1">
            <div style="font-weight:700;font-size:13.5px;color:var(--gold)">💤 5 hard weeks, no deload, schedule one</div>
            <div style="font-size:12px;color:var(--muted)">Tap to see what a deload is and how to take one</div>
          </div>
          ${icon("chevron-down", 16, `style="color:var(--gold);transform:${ui.deloadOpen ? "rotate(180deg)" : "none"}"`)}
        </button>
        ${ui.deloadOpen ? `<div class="" style="padding:0 14px 14px;font-size:13px;line-height:1.55;color:var(--muted)">
          A ${B("deload")} is a planned easy week that lets your joints and nervous system catch up so the next block actually moves. It isn't lost progress, it's what makes progress stick.<br><br>
          ${B("How to take one:")} keep your normal exercises and schedule, cut to about ${B("half your usual sets")}, and load roughly ${B("60–70%")} of your recent top weights. Everything should feel crisp and easy. Sleep and eat like it's a training week, then come back and push.
        </div>` : ""}
      </div>`
    : "";  /* no banner when there's nothing to alert about */

  return `<div class="" style="padding:18px 16px 0">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:11px;min-width:0">
        <img src="logoC.png" alt="Powerbuild Tracker logo" width="46" height="46" style="width:46px;height:46px;object-fit:contain;border-radius:11px;display:block;flex-shrink:0">
        <div class="pb-num" style="line-height:1.05;min-width:0">
          <div style="font-size:20px;font-weight:700;letter-spacing:.02em;color:var(--text)">ZENOFIT</div>
          <div style="font-size:12.5px;font-weight:600;letter-spacing:.32em;color:var(--gold)">TRACKER</div>
        </div>
      </div>
      <button data-action="open-profile" style="color:var(--muted);padding:8px;flex-shrink:0">${icon("settings", 22)}</button>
    </div>

    <div class="pb-num" style="font-size:27px;font-weight:700;line-height:1.1">
      ${settings.name ? `Ready, ${esc(settings.name.split(" ")[0])}.` : "Ready to lift."}
    </div>
    <div style="color:var(--muted);font-size:13.5px;margin-top:3px;margin-bottom:16px">
      Week ${currentWeek} of your program · strength + muscle, tracked properly.
    </div>

    <button data-action="new-workout" class="pb-btn pb-gold" style="width:100%;padding:16px 0;font-size:16.5px;border-radius:14px">
      ${icon("plus", 20, 'stroke-width="2.6"')} Start New Workout
    </button>

    ${deloadBanner ? `<div style="margin-top:12px">${deloadBanner}</div>` : ""}

    <div style="display:flex;gap:8px;margin-top:14px">
      ${stat("Workouts", new Set(log.map((e) => e.date)).size)}
      ${stat("Total sets", totalSets)}
      ${stat("PRs beaten", prCount, "", "var(--gold)")}
    </div>

    <div style="margin-top:22px">
      ${sectionTitle("How this works")}

      ${accordion("howto", "How to use this (2 minutes)", icon("info", 16, 'style="color:var(--blue)"'), `
        ${B("1.")} Set your name, default unit and program start date in ${B("Profile")} (gear icon). The default is just where each new exercise starts, you can switch kg/lbs on any individual lift as you log it.<br>
        ${B("2.")} Each time you train, tap ${B("+")} and add one entry per exercise: the exercise, the ${B("weight and reps of your top set")}, how many ${B("total sets")} you did, and RPE. The top set drives your progress; total sets feed your weekly volume.<br>
        ${B("3.")} The app does the thinking: it estimates your 1-rep max, tells you if you beat your best, adds up weekly volume per muscle group, keeps your PRs on the Progress tab, and tracks any Goal 1RM you set.<br>
        ${B("4.")} Can't (or won't) do a lift? Open the ${B("Library")}. Squat, deadlift and the other "must-do" lifts all have real alternatives listed, with the reason you'd swap: bad back, bad knees, bad shoulders, we've got you.<br>
        ${B("5.")} Every week or two, glance at ${B("Volume")} (any muscle groups getting ignored?) and ${B("Progress")} (are the numbers creeping up?). Slow progress is still progress.<br>
        ${B("6.")} When the app flags five hard weeks in a row on the home screen, take the deload, a few weeks pushing strength, a few pushing size, and an easy week when your joints start writing complaint letters.
      `)}

      ${accordion("presets", "Preset workouts: save a day, reuse it forever", icon("layers", 16, 'style="color:var(--gold)"'), `
        A ${B("preset")} is a bundle of exercises saved under one name, ${B("“Back day”")}, “Push A”, “Legs (bad knee)”, so you never have to hunt down the same eight lifts one at a time again.<br><br>
        ${B("1. Build it.")} Start a workout and add the exercises you want in the bundle, then tap ${B("Save as Preset")} at the bottom of the day. Name it (a one-line description is optional) and it's saved. Already logged a day you'd happily repeat? Open it from ${B("Log → History")} and save it as a preset from there.<br><br>
        ${B("2. Use it.")} Two ways. From ${B("Library → Presets")}, tap ${B("Start workout")} and the whole bundle opens as a fresh day. Or, inside a workout you're already in, tap ${B("Add exercise")} and switch to the ${B("Presets")} tab to drop the bundle in next to whatever's already there, mix as many presets into one day as you like.<br><br>
        ${B("3. Fill it in.")} A preset saves the ${B("exercises, never the numbers")}. Every move arrives ${B("blank")} and outlined in gold, waiting for today's sets, reps and weight. That's on purpose, a preset is your plan, not last week's performance. Anything you leave blank is simply dropped when you save the day, so an untouched move never pollutes your history.<br><br>
        ${B("4. Keep it tidy.")} ${B("Library → Presets → Edit")} renames a bundle, trims exercises out of it, or deletes it. Editing or deleting a preset never touches the workouts you've already logged.
      `)}

      ${accordion("fsbs", "First set, best set (FSBS)", icon("flame", 16, 'style="color:var(--red)"'), `
        This tracker logs ${B("one weight and one rep number per exercise per session: your TOP set.")} On purpose. Go into every working set intending to empty the tank on the <i>first</i> one, that top set is the true measure of your strength that day, set before fatigue has a say. If your numbers drop on sets two, three, four, that's expected and it doesn't count against you. What counts is whether you beat your top set from last time.<br><br>
        Why not log every set? Because a mix of four different rep/weight combos per exercise makes "did I improve?" impossible to answer at a glance. One clean number, logged consistently, beats five messy ones. That's what ${B("Total Sets")} is for, it still feeds your weekly volume, but your strength progress is judged on the set that actually reflects your strength: the first one.<br><br>
        ${B("Not your philosophy?")} Fair. Open ${B("Profile → Logging mode")} and switch to ${B("Detailed")}: you then add sets one at a time inside an exercise, each with its own reps and weight, and your 1RM comes from whichever set scores highest. Switch back whenever, nothing gets deleted.
      `)}

      ${accordion("epley", "A note on the 1RM estimate", icon("trending-up", 16, 'style="color:var(--green)"'), `
        We use the ${B("Epley formula: weight × (1 + reps/30)")}. It's an estimate, not a promise, and it's most accurate under ~10 reps. Its real job is comparing you to last week's you, and it's great at that.
      `)}

      ${accordion("cardio", "Cardio: time × intensity", icon("timer", 16, 'style="color:#a07ec2"'), `
        Cardio isn't sets and reps. Cardio entries log ${B("minutes")} and ${B("intensity (RPE 1–10)")} instead, and the Volume tab counts cardio in minutes.<br><br>
        For progress, there's no 1RM for a bike, so the app uses ${B("session load = minutes × RPE")} (the sports-science "session-RPE" method). It behaves like a 1RM: beat your previous score and it's a cardio PR, and you can set score goals just like weight goals.
      `)}

      ${accordion("goal", "Chasing a number: set a Goal 1RM", icon("trophy", 16, 'style="color:var(--gold)"'), `
        On the Progress tab, every lift you've logged has a ${B("Goal")} cell. Type a target, say a 140 ${unit} bench, and the app fills a progress bar toward it and shows exactly how far you have left. The moment a logged top set pushes your estimated 1RM to that target, the status flips to 🏆 GOAL HIT! and your Goals-hit counter ticks up. Set numbers you'll have to fight for.
      `)}

      ${accordion("units", "A note on units", icon("ruler", 16, 'style="color:var(--steel)"'), `
        Gyms mix their gear: the leg press is stamped in kg, the dumbbell rack is in lbs. So the unit lives on ${B("each exercise")}, not on the whole app. When you log a lift, tap the little ${B("kg / lbs")} pill sitting in the ${B("weight")} label and pick whatever the machine actually says, then type the number off the plate. No converting in your head, no calculator.<br><br>
        ${B("What the setting does:")} ${B("Profile → Default unit")} is just the unit each new exercise starts on, plus the one every ${B("comparison")} is shown in, your estimated 1RM, PRs, goals and the progress graph. The app converts behind the scenes so a lbs machine and a kg machine can still be compared honestly. Your logged numbers are never rewritten: history always reads back exactly what you typed, in the unit you typed it in.
      `)}
    </div>

    <div style="height:8px"></div>
  </div>`;
}

/* ───────────────────────── LOG (history + volume) ─────────────────── */

function renderLog(log, library, badges, settings, unit, currentWeek) {
  const seg = ui.logSeg;
  const segs = [["history", "History"], ["volume", "Weekly Volume"]].map(([id, label]) =>
    `<button data-action="log-seg" data-id="${id}" class="pb-btn" style="flex:1;padding:8px 0;font-size:13px;border-radius:8px;background:${seg === id ? "var(--raise)" : "transparent"};color:${seg === id ? "var(--text)" : "var(--muted)"};border:${seg === id ? "1px solid var(--border)" : "1px solid transparent"}">${label}</button>`).join("");

  return `<div class="" style="padding:12px 16px 0">
    <div style="display:flex;background:var(--surface2);border-radius:11px;padding:3px;margin-bottom:14px;border:1px solid var(--border-soft)">${segs}</div>
    ${seg === "history" ? renderHistory(log, library, badges, settings, unit) : renderVolume(log, library, settings, currentWeek)}
  </div>`;
}

function renderHistory(log, library, badges, settings, unit) {
  if (!log.length)
    return `<div class="pb-card" style="padding:26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.6">
      ${icon("clipboard-list", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
      Nothing here yet. Tap <b style="color:var(--gold)">+</b> to log your first workout, one entry per exercise, top set only.
    </div>`;

  const byDate = {};
  for (const e of log) (byDate[e.date] = byDate[e.date] || []).push(e);
  const dates = Object.keys(byDate).sort().reverse();

  return dates.map((date) => {
    const entries = byDate[date].sort((a, b) => a.createdAt - b.createdAt);
    const wk = weekOf(date, settings.startDate);
    const sets = entries.filter((e) => e.kind !== "cardio").reduce((a, e) => a + (+e.sets || 0), 0);
    const mins = entries.filter((e) => e.kind === "cardio").reduce((a, e) => a + (+e.minutes || 0), 0);
    const rows = entries.map((e) => {
      const b = badges[e.id] || {};
      const muscle = e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, library, e.muscle);
      return `<div style="display:flex;align-items:center;border-bottom:1px solid var(--border-soft)">
        <button data-action="edit-entry" data-id="${e.id}" style="flex:1;min-width:0;text-align:left;padding:11px 4px 11px 14px;display:flex;gap:10px;align-items:center;color:var(--text)">
          <div style="width:4px;align-self:stretch;border-radius:2px;background:${colorFor(muscle)}"></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.exercise)}</div>
            <div style="font-size:12.5px;color:var(--muted);margin-top:1px">
              ${entrySummary(e, unit, true)}
            </div>
            ${e.notes ? `<div style="font-size:11.5px;color:var(--faint);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">“${esc(e.notes)}”</div>` : ""}
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${b.metric != null ? `<div class="pb-num" style="font-weight:700;font-size:17px;color:${b.badge === "pr" ? "var(--gold)" : "var(--text)"}">${b.metric}<span style="font-size:10.5px;color:var(--muted);font-weight:600"> ${e.kind === "cardio" ? "pts" : unit}</span></div>` : ""}
            ${BADGE_SHORT[b.badge] ? `<div style="font-size:10.5px;font-weight:700;color:${b.badge === "pr" ? "var(--gold)" : "var(--muted)"}">${BADGE_SHORT[b.badge]}</div>` : ""}
          </div>
        </button>
        <button data-action="open-exercise-window" data-name="${esc(e.exercise)}" title="Exercise details" style="flex-shrink:0;padding:12px 14px;color:var(--faint);align-self:stretch">${icon("info", 17)}</button>
      </div>`;
    }).join("");

    return `<div class="pb-card" style="margin-bottom:12px;overflow:hidden">
      <button data-action="edit-day" data-date="${date}" title="Edit this whole day" style="width:100%;display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--border-soft);color:var(--text);text-align:left">
        <div class="pb-num" style="font-weight:700;font-size:16.5px;flex:1">${fmtDate(date)}</div>
        ${chip("Week " + wk, "var(--gold)")}
        ${sets > 0 ? chip(sets + " sets") : ""}
        ${mins > 0 ? chip(mins + " min", "#a07ec2") : ""}
        ${icon("pencil", 14, 'style="color:var(--faint);flex-shrink:0;margin-left:2px"')}
      </button>
      ${rows}
    </div>`;
  }).join("");
}

/* ───────────────────────────── VOLUME ─────────────────────────────── */

function renderVolume(log, library, settings, currentWeek) {
  const week = ui.volumeWeek;
  const groups = [];
  for (const ex of library) if (!groups.includes(ex.muscle)) groups.push(ex.muscle);
  for (const e of log) { const m = e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, library, e.muscle); if (!groups.includes(m)) groups.push(m); }

  const vol = volumeForWeek(log, library, settings.startDate, week);
  const targets = state.volumeGoals || {};
  const strengthVals = groups.filter((g) => g !== "Cardio").map((g) => vol[g] || 0);
  const max = Math.max(1, ...strengthVals);

  const rows = groups.map((g, i) => {
    const isCardio = g === "Cardio";
    const v = vol[g] || 0;
    const unit = isCardio ? "min" : "sets";
    /* a personal weekly target takes over the assessment when the user sets one.
       Everyone's "enough" is different. Muscle groups target sets; cardio targets
       minutes. No target falls back to the relative "biggest group this week"
       heuristic (cardio without a target isn't flagged at all). */
    const target = targets[g] > 0 ? targets[g] : null;
    const editing = ui.volGoalEditing === g;

    const pct = target ? Math.min(1, v / target)
      : isCardio ? Math.min(1, v / 60)
      : v / max;

    let statusChip = "", neglected = false;
    if (target) {
      if (v === 0) { statusChip = chip("Neglected", "var(--red)"); neglected = true; }
      else if (v >= target) statusChip = chip("On target ✓", "var(--green)");
      else statusChip = chip(`${Math.round((target - v) * 10) / 10} ${unit} to go`, "var(--gold)");
    } else if (!isCardio) {
      if (v === 0) { statusChip = chip("Neglected", "var(--red)"); neglected = true; }
      else if (v > 0 && max >= 6 && v < max / 3) statusChip = chip("Low", "var(--gold)");
    }
    const barColor = target && v >= target ? "var(--green)" : colorFor(g, i);

    const targetControls = editing
      ? `<span style="display:flex;gap:6px;align-items:center">
          <input class="pb-input" type="number" inputmode="numeric" min="0" data-bind="volGoal" value="${esc(ui.volGoalVal)}" placeholder="${unit}" style="width:74px;padding:5px 8px;font-size:13px" data-autofocus>
          <button data-action="save-vol-goal" data-g="${esc(g)}" class="pb-btn pb-gold" style="width:30px;height:30px;border-radius:8px">${icon("check", 15)}</button>
        </span>`
      : `<button data-action="edit-vol-goal" data-g="${esc(g)}" class="pb-chip" style="color:var(--gold);border-color:rgba(233,185,73,.35);background:rgba(233,185,73,.08)">
          ${icon("pencil", 11)} Target${target ? ` · ${target} ${unit}` : ""}
        </button>`;

    return `<div style="padding:11px 0;border-bottom:${i < groups.length - 1 ? "1px solid var(--border-soft)" : "none"}">
      <div style="display:flex;align-items:baseline;gap:8px">
        <div style="font-weight:600;font-size:13.5px;flex:1;color:${neglected ? "var(--muted)" : "var(--text)"}">${esc(g)}</div>
        ${statusChip}
        <div class="pb-num" style="font-weight:700;font-size:17px">${v}${target ? `<span style="font-size:12px;color:var(--faint);font-weight:600">/${target}</span>` : ""}<span style="font-size:10.5px;color:var(--muted)"> ${unit}</span></div>
      </div>
      <div style="height:7px;background:var(--surface2);border-radius:4px;margin-top:6px;overflow:hidden">
        <div style="height:100%;width:${Math.round(pct * 100)}%;background:${barColor};border-radius:4px;transition:width .25s"></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <div style="flex:1"></div>
        ${targetControls}
      </div>
    </div>`;
  }).join("");

  return `<div class="">
    <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:6px">
      <button data-action="vol-prev" class="pb-btn pb-ghost" style="width:36px;height:36px">${icon("chevron-left", 17)}</button>
      <div style="text-align:center">
        <div class="pb-num" style="font-size:21px;font-weight:700">Week ${week}</div>
        <div style="font-size:11px;color:var(--faint)">${week === currentWeek ? "current week" : week > currentWeek ? "future" : "past"}</div>
      </div>
      <button data-action="vol-next" class="pb-btn pb-ghost" style="width:36px;height:36px">${icon("chevron-right", 17)}</button>
    </div>
    <div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:14px">
      Working sets per muscle group, the fastest way to spot a muscle you've been quietly ignoring.
    </div>
    <div class="pb-card" style="padding:6px 14px">${rows}</div>
    <div style="font-size:11.5px;color:var(--faint);margin:10px 4px 0;line-height:1.5">
      Tap <b style="color:var(--gold)">Target</b> to set your own weekly goal for a group, sets for a muscle or minutes for cardio, then each week is judged against your plan, not the biggest group. Enough is different for everyone. Without a target, "Low" means under a third of your biggest group this week.
    </div>
  </div>`;
}

/* ─────────────────────────── PROGRESS ─────────────────────────────── */

function renderProgress(log, library, goals, badges, settings, unit) {
  const rows = dashboardRows(log, library, goals);
  const selected = ui.progressSelected;
  const sel = selected && rows.some((r) => r.name === selected) ? selected : rows[0]?.name || null;

  if (!rows.length)
    return `<div class="" style="padding:16px">
      <div class="pb-card" style="padding:26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.6">
        ${icon("trending-up", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
        Builds itself from your Workout Log, log any lift and it appears here automatically. Nothing here yet? Log your first set and it shows up.
      </div>
    </div>`;

  const glance = {
    logged: log.length,
    sets: log.filter((e) => e.kind !== "cardio").reduce((a, e) => a + (+e.sets || 0), 0),
    prs: Object.values(badges).filter((b) => b.badge === "pr").length,
    goalsHit: rows.filter((r) => r.goal != null && r.best != null && r.best >= r.goal).length,
  };

  const selRow = rows.find((r) => r.name === sel);
  const series = sel
    ? chronoSort(log).filter((e) => e.exercise === sel).map((e) => ({ ...e, m: metricOf(e) })).filter((e) => e.m != null)
    : [];
  const chartData = series.map((e) => ({ x: fmtShort(e.date), y: e.m }));

  const { sets: wkSets } = weeklyTotals(log, settings.startDate);
  const maxWk = Math.max(1, ...Object.keys(wkSets).map(Number));
  const wkData = Array.from({ length: maxWk }, (_, i) => ({ w: "W" + (i + 1), sets: wkSets[i + 1] || 0 }));

  if (chartData.length >= 2) chartState.line = { data: chartData, goal: selRow?.goal ?? null };
  chartState.bar = { data: wkData };

  const goalRows = rows.map((r, i) => renderGoalRow(r, unit, i === rows.length - 1, sel === r.name)).join("");

  const detail = series.length > 0
    ? `<div class="pb-card pb-scroll" data-scrollkey="prog-detail" style="margin-bottom:20px;max-height:210px;overflow-y:auto">
        ${[...series].reverse().map((e) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border-soft);font-size:13px">
          <span style="color:var(--muted);width:84px;flex-shrink:0">${fmtShort(e.date)}</span>
          <span style="flex:1;color:var(--faint);font-size:12px">${e.kind === "cardio" ? `${esc(e.minutes)} min × RPE ${esc(e.intensity)}` : `${esc(e.reps)} × ${esc(e.weight)} ${unitOf(e)}`}</span>
          <span class="pb-num" style="font-weight:700;font-size:15.5px;color:${badges[e.id]?.badge === "pr" ? "var(--gold)" : "var(--text)"}">${e.m}</span>
        </div>`).join("")}
      </div>`
    : "";

  return `<div class="" style="padding:12px 16px 0">
    <div style="display:flex;gap:8px;margin-bottom:18px">
      ${stat("Entries", glance.logged)}
      ${stat("Sets", glance.sets)}
      ${stat("PRs 💪", glance.prs, "", "var(--gold)")}
      ${stat("Goals 🏆", glance.goalsHit, "", "var(--green)")}
    </div>

    ${sectionTitle("Your lifts: goals, bests & PRs")}
    <div class="pb-card" style="margin-bottom:20px;overflow:hidden">${goalRows}</div>

    ${sectionTitle("Progress graph", `<span style="font-size:11px;color:var(--faint)">${selRow?.cardio ? "session load (min × RPE)" : `est. 1RM (${unit})`}</span>`)}
    <div class="pb-card" style="padding:14px 8px 6px;margin-bottom:12px">
      <div style="padding:0 8px 10px">
        <select class="pb-input" data-bind="progressSel" style="font-weight:600">
          ${rows.map((r) => `<option value="${esc(r.name)}"${r.name === sel ? " selected" : ""}>${esc(r.name)}</option>`).join("")}
        </select>
      </div>
      ${chartData.length >= 2
        ? `<div id="lineChart" style="position:relative;width:100%;height:210px"></div>`
        : `<div style="height:130px;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:13px;text-align:center;padding:0 24px;line-height:1.5">
            Watch the numbers become a line, log ${sel ? "this lift" : "a lift"} at least twice and the chart fills in.
          </div>`}
    </div>

    ${detail}

    ${sectionTitle("Weekly total sets")}
    <div class="pb-card" style="padding:14px 8px 4px;margin-bottom:16px">
      <div id="barChart" style="position:relative;width:100%;height:140px"></div>
    </div>
  </div>`;
}

function renderGoalRow(r, unit, last, active) {
  const editing = ui.goalEditing === r.name;
  const hit = r.goal != null && r.best != null && r.best >= r.goal;
  const status = r.goal == null ? "Set a goal →" : hit ? "🏆 GOAL HIT!" : r.best == null ? "Log a set to start"
    : `${(Math.round((r.goal - r.best) * 10) / 10)} ${r.cardio ? "pts" : unit} to go`;

  const goalControls = editing
    ? `<span data-stopprop style="display:flex;gap:6px;align-items:center">
        <input class="pb-input" type="number" inputmode="decimal" data-bind="goal" value="${esc(ui.goalVal)}" placeholder="goal" style="width:78px;padding:5px 8px;font-size:13px" data-autofocus>
        <button data-action="save-goal" data-name="${esc(r.name)}" class="pb-btn pb-gold" style="width:30px;height:30px;border-radius:8px">${icon("check", 15)}</button>
      </span>`
    : `<button data-action="edit-goal" data-name="${esc(r.name)}" class="pb-chip" style="color:var(--gold);border-color:rgba(233,185,73,.35);background:rgba(233,185,73,.08)">
        ${icon("pencil", 11)} Goal ${r.goal != null ? `· ${r.goal}` : ""}
      </button>`;

  return `<div data-action="select-progress" data-name="${esc(r.name)}" style="padding:12px 14px;border-bottom:${last ? "none" : "1px solid var(--border-soft)"};background:${active ? "rgba(233,185,73,.05)" : "transparent"};cursor:pointer">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:8px;height:8px;border-radius:4px;background:${colorFor(r.muscle)};flex-shrink:0"></div>
      <div style="font-weight:600;font-size:14px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>
      <div class="pb-num" style="font-weight:700;font-size:17px;color:var(--text)">
        ${r.best ?? "—"}<span style="font-size:10.5px;color:var(--muted);font-weight:600"> ${r.cardio ? "pts" : unit}</span>
      </div>
      <button data-action="open-exercise-window" data-name="${esc(r.name)}" title="Exercise details" style="flex-shrink:0;color:var(--faint);padding:2px">${icon("info", 15)}</button>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:7px">
      <div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${Math.round((r.progress ?? 0) * 100)}%;background:${hit ? "var(--green)" : "var(--gold)"};transition:width .25s"></div>
      </div>
      <div style="font-size:11.5px;font-weight:700;color:${hit ? "var(--green)" : "var(--muted)"};flex-shrink:0">${status}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:7px">
      <span style="font-size:11px;color:var(--faint)">${r.sessions} session${r.sessions !== 1 ? "s" : ""} · last ${fmtShort(r.last)}</span>
      <div style="flex:1"></div>
      ${goalControls}
    </div>
  </div>`;
}

/* ─────────────────────────── LIBRARY ──────────────────────────────── */

function libraryGroups(library) {
  const g = []; for (const ex of library) if (!g.includes(ex.muscle)) g.push(ex.muscle); return g;
}

/* An exercise you added on the fly while logging (quick-add from the picker)
   arrives with nothing but a name and a muscle group. That, and only that, is
   what earns the blue NEW flag: it's a to-do, not a badge. Fill in equipment,
   alternatives or details and the flag disappears, at which point the exercise
   is indistinguishable from the built-in ones, which is the point. */
const needsDetails = (ex) => !!(ex && ex.custom) && !ex.equipment && !ex.alternatives && !ex.note;

const newFlag = (ex) => needsDetails(ex)
  ? '<span style="font-size:10px;color:var(--blue);margin-left:6px;font-weight:700;letter-spacing:.06em">NEW</span>'
  : "";

function renderLibraryList(library) {
  const q = ui.libraryQ, filter = ui.libraryFilter;
  const groups = libraryGroups(library);
  const shown = library.filter((ex) =>
    (filter === "All" || ex.muscle === filter) &&
    (!q || ex.name.toLowerCase().includes(q.toLowerCase())));

  return groups.filter((g) => shown.some((x) => x.muscle === g)).map((g) => `<div style="margin-bottom:16px">
    ${sectionTitle(`<span style="color:${colorFor(g)}">${esc(g)}</span>`)}
    <div class="pb-card" style="overflow:hidden">
      ${shown.filter((x) => x.muscle === g).map((ex, i, arr) => `<button data-action="open-exercise-window" data-name="${esc(ex.name)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px;text-align:left;color:var(--text);border-bottom:${i < arr.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        ${ex.image ? `<img src="${esc(ex.image)}" alt="" style="width:38px;height:38px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--border)">` : ""}
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${esc(ex.name)}${newFlag(ex)}</div>
          <div style="font-size:11.5px;color:var(--faint)">${esc(ex.type)}${ex.equipment ? ` · ${esc(ex.equipment)}` : ""}</div>
        </div>
        ${ex.video ? icon("youtube", 15, 'style="color:var(--red);flex-shrink:0"') : ""}
        ${icon("info", 15, 'style="color:var(--faint);flex-shrink:0"')}
      </button>`).join("")}
    </div>
  </div>`).join("");
}

/* reusable "History / Weekly Volume"-style pill toggle */
function segControl(action, seg, items) {
  return `<div style="display:flex;background:var(--surface2);border-radius:11px;padding:3px;margin-bottom:14px;border:1px solid var(--border-soft)">${
    items.map(([id, label]) =>
      `<button data-action="${action}" data-id="${id}" class="pb-btn" style="flex:1;padding:8px 0;font-size:13px;border-radius:8px;background:${seg === id ? "var(--raise)" : "transparent"};color:${seg === id ? "var(--text)" : "var(--muted)"};border:${seg === id ? "1px solid var(--border)" : "1px solid transparent"}">${label}</button>`).join("")
  }</div>`;
}

function renderLibrary(library) {
  const seg = ui.librarySeg;
  return `<div class="" style="padding:12px 16px 0">
    ${segControl("library-seg", seg, [["exercises", "Exercises"], ["presets", "Presets"]])}
    ${seg === "presets" ? renderPresets() : renderExercisesLibrary(library)}
  </div>`;
}

function renderExercisesLibrary(library) {
  const groups = libraryGroups(library);
  const incomplete = library.filter(needsDetails);

  return `
    <div style="position:relative;margin-bottom:10px">
      ${icon("search", 16, 'style="position:absolute;left:12px;top:12px;color:var(--faint)"')}
      <input class="pb-input" style="padding-left:36px" placeholder="Search exercises…" data-bind="libq" value="${esc(ui.libraryQ)}">
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding-bottom:10px">
      ${["All", ...groups].map((g) => `<button data-action="lib-filter" data-id="${esc(g)}" class="pb-chip" style="flex-shrink:0;padding:6px 12px;font-size:12.5px;color:${ui.libraryFilter === g ? "var(--gold-ink)" : "var(--muted)"};background:${ui.libraryFilter === g ? "var(--gold)" : "var(--surface2)"};border-color:${ui.libraryFilter === g ? "var(--gold)" : "var(--border)"}">${esc(g)}</button>`).join("")}
    </div>

    ${incomplete.length > 0 ? `<div class="pb-card" style="border-color:rgba(93,139,204,.35);background:rgba(93,139,204,.06);padding:11px 12px 9px;margin-bottom:10px;font-size:12.5px;color:var(--muted);line-height:1.5">
      <b style="color:var(--blue)">Added from your log, details missing:</b>
      <div style="margin:7px 0 8px">
        ${incomplete.map((x) => `<button data-action="open-exercise-window" data-name="${esc(x.name)}" style="display:flex;align-items:center;gap:8px;width:100%;padding:4px 0;color:var(--text);font-size:13px;font-weight:600;text-align:left">
          <span style="width:5px;height:5px;border-radius:3px;background:var(--blue);flex-shrink:0"></span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span>
          ${icon("chevron-right", 14, 'style="color:var(--faint);flex-shrink:0"')}
        </button>`).join("")}
      </div>
      Tap one to fill in its equipment &amp; alternatives when you're ready.
    </div>` : ""}

    <button data-action="add-exercise" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:14px;margin-bottom:12px;border-style:dashed;border-color:var(--border)">
      ${icon("plus", 17)} Add custom exercise
    </button>

    <div id="libList">${renderLibraryList(library)}</div>
    <div style="font-size:12px;color:var(--faint);line-height:1.55;margin:0 4px 10px">
      No two bodies are the same. If a lift doesn't work for you, herniated disc, cranky knees, grumpy shoulders, the alternatives listed give you a legit substitute and the reason it works. Swapping isn't cheating; it's programming.
    </div>`;
}

/* ─────────────────────────── PRESETS ──────────────────────────────────
   A preset is a saved bundle of exercises (identity only, no numbers). Build
   one from a workout day (Log → Save as Preset), reuse it any time to drop the
   whole bundle into a new day, then just fill in the sets and reps.        */

/* A fresh, blank draft entry. In Detailed mode a strength entry starts with an
   empty setList, which is the flag that makes it log set by set. */
function newEntry(name, muscle, kind, createdAt = Date.now()) {
  const e = {
    id: uid(), exercise: name, muscle, kind: kind || "strength",
    sets: "", reps: "", weight: "", rpe: "", minutes: "", intensity: "", notes: "",
    unit: state.settings.units,   // starting pick, changeable per exercise
    createdAt,
  };
  if (e.kind !== "cardio" && state.settings.loggingMode === "detailed") e.setList = [];
  return e;
}

/* Turn a preset's exercises into fresh, blank draft entries. */
function presetToEntries(p) {
  const base = Date.now();
  return (p.exercises || []).map((ex, i) => newEntry(ex.exercise, ex.muscle, ex.kind, base + i));
}

const presetCountLabel = (n) => `${n} ${n === 1 ? "move" : "moves"}`;

/* the exercise list shown inside a preset card — color dot + name per row */
const presetExerciseList = (exs) =>
  (exs || []).map((ex) => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)">
    <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(ex.muscle)};flex-shrink:0"></span>${esc(ex.exercise)}
  </div>`).join("");

function renderPresets() {
  const presets = state.presets || [];
  if (!presets.length)
    return `<div class="pb-card" style="padding:26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.65">
      ${icon("layers", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
      No presets yet. Start a workout in the <b style="color:var(--gold)">Log</b> tab, add the exercises you tend to do together, then tap <b style="color:var(--gold)">Save as Preset</b>. Your bundle lands here, ready to drop into any future day.
    </div>`;

  return presets.map((p) => {
    const exs = p.exercises || [];
    return `<div class="pb-card" style="margin-bottom:12px;overflow:hidden">
      <div style="padding:13px 14px">
        <div style="display:flex;align-items:baseline;gap:8px">
          <div class="pb-num" style="font-weight:700;font-size:16.5px;flex:1;min-width:0">${esc(p.name)}</div>
          ${chip(presetCountLabel(exs.length), "var(--gold)")}
        </div>
        ${p.description ? `<div style="font-size:12.5px;color:var(--muted);margin-top:3px">${esc(p.description)}</div>` : ""}
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:11px">${presetExerciseList(exs)}</div>
      </div>
      <div style="display:flex;border-top:1px solid var(--border-soft)">
        <button data-action="start-workout-from-preset" data-id="${esc(p.id)}" style="flex:1;padding:12px;color:var(--gold);font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px">${icon("play", 14)} Start workout</button>
        <button data-action="open-preset" data-id="${esc(p.id)}" style="flex:1;padding:12px;color:var(--muted);font-weight:600;font-size:13px;border-left:1px solid var(--border-soft);display:flex;align-items:center;justify-content:center;gap:6px">${icon("pencil", 13)} Edit</button>
      </div>
    </div>`;
  }).join("") + `<div style="font-size:12px;color:var(--faint);line-height:1.55;margin:2px 4px 10px">
      Presets save the <i>exercises</i>, not the numbers. When you use one, each move comes in blank so you log fresh sets, reps and weight every session, that's what keeps your progress honest.
    </div>`;
}

/* full-screen editor for a saved preset (rename, trim exercises, delete) */
function renderPresetView() {
  const p = ui.presetView;
  const exs = p.exercises || [];
  const canSave = !!(p.name && p.name.trim());
  return sheet("Edit preset", "presetView", `
    ${field("Name", `<input class="pb-input" data-bind="presetView.name" value="${esc(p.name)}" placeholder="Back &amp; Shoulder day">`)}
    ${field("Description", `<input class="pb-input" data-bind="presetView.description" value="${esc(p.description)}" placeholder="lat pulldown focus">`, "Optional, a quick reminder of what's inside.")}
    ${sectionTitle(`Exercises · ${presetCountLabel(exs.length)}`)}
    <div class="pb-card" style="overflow:hidden;margin-bottom:16px">
      ${exs.length ? exs.map((ex, i) => `<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:${i < exs.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(ex.muscle)};flex-shrink:0"></span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${esc(ex.exercise)}</div>
          <div style="font-size:11.5px;color:var(--faint)">${esc(ex.muscle)}${ex.kind === "cardio" ? " · cardio" : ""}</div>
        </div>
        <button data-action="remove-preset-exercise" data-i="${i}" title="Remove from preset" style="color:var(--red);padding:6px">${icon("x", 16)}</button>
      </div>`).join("") : `<div style="padding:16px;text-align:center;color:var(--faint);font-size:12.5px;line-height:1.5">No exercises left. Delete this preset, or build a new one from a workout.</div>`}
    </div>
    <button data-action="save-preset-edits" ${canSave ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${canSave ? 1 : 0.45}">${icon("check", 16)} Save changes</button>
    <button data-action="delete-preset" data-id="${esc(p.id)}" class="pb-btn" style="width:100%;padding:12px 0;margin-top:10px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">${icon("trash-2", 15)} Delete preset</button>
  `);
}

/* the "Save as Preset" bottom sheet, opened from the workout day window */
function renderPresetForm() {
  const f = ui.presetForm;
  const draft = ui.workoutSheet;
  const exs = draft ? draft.entries : [];
  const canSave = !!(f.name && f.name.trim()) && exs.length > 0;
  return sheet("Save as Preset", "presetForm", `
    <div style="font-size:13px;color:var(--muted);line-height:1.55;margin-bottom:14px">
      Save this day's ${exs.length} exercise${exs.length === 1 ? "" : "s"} as a reusable bundle. Only the exercises are kept, not the sets, reps or weight, so you can drop them into any future day and just log fresh numbers.
    </div>
    ${field("Preset name *", `<input class="pb-input" data-bind="preset.name" value="${esc(f.name)}" placeholder="e.g. Back &amp; Shoulder day" data-autofocus>`)}
    ${field("Description", `<input class="pb-input" data-bind="preset.description" value="${esc(f.description)}" placeholder="e.g. lat pulldown focus">`, "Optional, a quick hint about what's inside.")}
    ${sectionTitle(`Included · ${presetCountLabel(exs.length)}`)}
    <div class="pb-card" style="overflow:hidden;margin-bottom:16px">
      ${exs.map((e, i) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:${i < exs.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, state.library, e.muscle))};flex-shrink:0"></span>
        <div style="font-weight:600;font-size:13.5px">${esc(e.exercise)}</div>
      </div>`).join("")}
    </div>
    <button id="presetSaveBtn" data-action="commit-preset" ${canSave ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${canSave ? 1 : 0.45}">${icon("bookmark-plus", 16)} Save preset</button>
  `);
}

/* Pull the 11-char video id out of the common YouTube URL shapes. */
function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* Read an uploaded image and downscale it so a data URL of a phone photo
   doesn't blow past the localStorage quota. Longest side capped, re-encoded
   as JPEG. Falls back to the raw data URL if the decode ever fails. */
function readImageScaled(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1000;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const s = Math.min(MAX / width, MAX / height);
        width = Math.round(width * s); height = Math.round(height * s);
      }
      try {
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        c.getContext("2d").drawImage(img, 0, 0, width, height);
        cb(c.toDataURL("image/jpeg", 0.82));
      } catch { cb(reader.result); }
    };
    img.onerror = () => cb(reader.result);
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ─────────────────── EXERCISE DETAIL WINDOW (view + edit) ───────────
   One full-screen window (same feel as New Workout) that every "info"
   button opens. It's read-only by default; the Edit button flips it to
   the editable form. Also handles creating a brand-new custom exercise. */

function renderExerciseWindow(library) {
  const editing = ui.exWinEdit;
  const isNew = !!(ui.exWin && ui.exWin.isNew);
  /* the record on screen: the live draft while editing, else the library row.
     If the lift was deleted from the library we still show what we know. */
  const ex = editing
    ? ui.exWinDraft
    : (library.find((x) => x.name === ui.exWin.name) ||
        { name: ui.exWin.name, muscle: "—", type: "", equipment: "", alternatives: "", note: "", image: "", video: "", custom: false, missing: true });

  const canSave = !!(ex.name && ex.name.trim() && ex.muscle && ex.muscle.trim());
  const headerRight = editing
    ? `<button data-action="exwin-save" id="exwinSaveBtn" class="pb-btn pb-gold" style="padding:8px 16px;font-size:13.5px;opacity:${canSave ? 1 : 0.45}" ${canSave ? "" : "disabled"}>${icon("check", 15)} Save</button>`
    : (ex.missing ? "" : `<button data-action="exwin-edit" class="pb-btn pb-ghost" style="padding:8px 14px;font-size:13.5px">${icon("pencil", 14)} Edit</button>`);

  return fullScreen(90, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="${editing ? "exwin-cancel" : "exwin-close"}" style="color:var(--muted);padding:4px">${icon(editing ? "arrow-left" : "x", 21)}</button>
      <div class="pb-num" style="font-size:18px;font-weight:700;flex:1">${isNew ? "New exercise" : editing ? "Edit exercise" : "Exercise"}</div>
      ${headerRight}
    </div>
    <div class="pb-scroll" data-scrollkey="exwin" style="flex:1;overflow-y:auto;padding:16px 16px 40px">
      ${editing ? exWindowEditBody(ex, library) : exWindowViewBody(ex)}
    </div>
  `, "exWin");
}

function exWindowViewBody(ex) {
  const vid = youtubeId(ex.video);
  const detailField = (label, v, empty) => `<div style="margin-bottom:16px">
    <div class="pb-label" style="margin-bottom:5px">${label}</div>
    <div style="font-size:14px;color:${v ? "var(--text)" : "var(--faint)"};line-height:1.55">${v ? esc(v) : empty}</div>
  </div>`;

  return `
    <div class="pb-num" style="font-size:23px;font-weight:700;line-height:1.15;margin-bottom:9px">${esc(ex.name)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      ${chip(esc(ex.muscle), colorFor(ex.muscle))}
      ${ex.type ? chip(esc(ex.type)) : ""}
      ${needsDetails(ex) ? chip("NEW", "var(--blue)") : ""}
    </div>

    ${ex.image
      ? `<img src="${esc(ex.image)}" alt="${esc(ex.name)}" style="width:100%;max-height:300px;object-fit:cover;border-radius:14px;border:1px solid var(--border);margin-bottom:18px;display:block">`
      : ""}

    ${vid
      ? `<div style="margin-bottom:18px">
          <div class="pb-label" style="margin-bottom:6px">Tutorial</div>
          <div style="position:relative;width:100%;padding-bottom:56.25%;border-radius:14px;overflow:hidden;border:1px solid var(--border);background:#000">
            <iframe src="https://www.youtube.com/embed/${vid}" title="Tutorial video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
          </div>
        </div>`
      : (ex.video
          ? `<div style="margin-bottom:18px">
              <div class="pb-label" style="margin-bottom:6px">Tutorial</div>
              <a href="${esc(ex.video)}" target="_blank" rel="noopener" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;color:var(--blue)">${icon("external-link", 15)} Open tutorial link</a>
            </div>`
          : "")}

    ${detailField("Details", ex.note, ex.missing ? "This exercise is no longer in your library." : "No details yet. Tap Edit to add the muscles it works and a tip.")}
    ${detailField("Equipment", ex.equipment, "Not filled in yet")}
    ${detailField("Alternatives", ex.alternatives, "Not filled in yet")}
  `;
}

function exWindowEditBody(f, library) {
  const groups = libraryGroups(library);
  const vid = youtubeId(f.video);
  const musclePicker = ui.exWinNewGroup
    ? `<input class="pb-input" data-bind="exwin.muscle" value="${esc(f.muscle)}" placeholder="New muscle group…" data-autofocus>`
    : `<select class="pb-input" data-bind="exwinMuscle">
        <option value="" disabled${f.muscle === "" ? " selected" : ""}>Choose group…</option>
        ${groups.map((g) => `<option value="${esc(g)}"${f.muscle === g ? " selected" : ""}>${esc(g)}</option>`).join("")}
        <option value="__new">＋ New group…</option>
      </select>`;

  const imageBlock = f.image
    ? `<div style="position:relative;margin-bottom:8px">
        <img src="${esc(f.image)}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;border:1px solid var(--border);display:block">
        <button type="button" data-action="exwin-remove-image" class="pb-btn" style="position:absolute;top:8px;right:8px;width:34px;height:34px;border-radius:10px;background:rgba(0,0,0,.55);color:#fff">${icon("trash-2", 16)}</button>
      </div>
      <label class="pb-btn pb-ghost" style="width:100%;padding:10px 0;font-size:13.5px;cursor:pointer">
        ${icon("image", 15)} Replace photo
        <input type="file" accept="image/*" data-filebind="exwin.image" style="display:none">
      </label>`
    : `<label class="pb-placeholder" style="height:120px;cursor:pointer;flex-direction:column;gap:8px;color:var(--faint)">
        ${icon("image-plus", 22)}
        <span style="font-size:12px;letter-spacing:.04em;text-transform:none;font-weight:600">Tap to upload a photo of your machine</span>
        <input type="file" accept="image/*" data-filebind="exwin.image" style="display:none">
      </label>`;

  return `
    ${field("Name *", `<input class="pb-input" data-bind="exwin.name" value="${esc(f.name)}" placeholder="e.g. Pendlay Row">`)}
    ${field("Muscle group trained *", musclePicker, "Only name and muscle group are required, the rest is optional but recommended.")}
    ${field("Type", `<select class="pb-input" data-bind="exwin.type">${["Compound", "Isolation", "Cardio"].map((t) => `<option${f.type === t ? " selected" : ""}>${t}</option>`).join("")}</select>`)}

    ${field("Photo", imageBlock, "Snap the exact machine at your gym so this exercise always looks familiar.")}

    ${field("Tutorial video (YouTube link)", `<input class="pb-input" type="url" inputmode="url" data-bind="exwin.video" value="${esc(f.video)}" placeholder="https://youtube.com/watch?v=…">`,
      vid ? "Looks good, this plays right inside the exercise." : (f.video ? "Couldn't read a YouTube id from that, it'll show as a plain link." : "Paste a link and the tutorial plays inside the app."))}

    ${field("Details", `<textarea class="pb-input" rows="4" data-bind="exwin.note" placeholder="The 2 main muscles it trains, plus a tip or when to swap it…" style="resize:none">${esc(f.note)}</textarea>`, "The 2 main muscles trained in plain terms (mid chest, tricep long head, quads…), plus a tip or a reason to swap.")}
    ${field("Equipment", `<input class="pb-input" data-bind="exwin.equipment" value="${esc(f.equipment)}" placeholder="Barbell, cables…">`)}
    ${field("Alternatives", `<input class="pb-input" data-bind="exwin.alternatives" value="${esc(f.alternatives)}" placeholder="Exercise A · Exercise B">`)}

    ${!(ui.exWin && ui.exWin.isNew) ? `<button data-action="exwin-delete" class="pb-btn" style="width:100%;padding:12px 0;margin-top:6px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} Delete exercise
    </button>` : ""}
  `;
}

/* ─────────────────────── WORKOUT SHEET (new day) ──────────────────── */

function renderWorkoutSheet(draft, library, log, settings, unit) {
  const wk = weekOf(draft.date, settings.startDate);
  /* when editing an existing day, its own rows already live in the log — drop
     them from the comparison base so the "vs your best" preview isn't counting
     the very rows being edited. */
  const baseLog = draft.editing ? log.filter((e) => !(draft.originalIds || []).includes(e.id)) : log;
  const combined = [...baseLog, ...draft.entries.map((e) => ({ ...e, date: draft.date }))];
  const badges = computeBadges(combined);

  /* entries with no numbers yet (typically dropped in from a preset) don't get
     saved and don't count toward the workout — they're a "fill me in" prompt. */
  const filledCount = draft.entries.filter(entryHasData).length;
  const emptyCount = draft.entries.length - filledCount;
  const saveLabel = filledCount ? `${draft.editing ? "Update" : "Save"} workout (${filledCount})`
    : draft.entries.length ? "Fill in exercise data to save"
    : "Nothing to save yet";

  const entries = draft.entries.map((e) => {
    const b = badges[e.id] || {};
    const empty = !entryHasData(e);
    return `<div class="pb-card" style="display:flex;align-items:center;margin-bottom:8px;overflow:hidden${empty ? ";border:1px dashed rgba(233,185,73,.55)" : ""}">
      <button data-action="edit-draft-entry" data-id="${e.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:12px 4px 12px 14px;text-align:left;color:var(--text)">
        <div style="width:4px;align-self:stretch;border-radius:2px;background:${colorFor(e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, library, e.muscle))}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${esc(e.exercise)}</div>
          <div style="font-size:12px;color:${empty ? "var(--gold)" : "var(--muted)"}">
            ${empty
              ? (e.kind === "cardio" ? "No data yet · tap to add time & intensity"
                : isDetailed(e) ? "No sets yet · tap to log them one by one"
                : "No data yet · tap to add sets, reps & weight")
              : entrySummary(e, unit)}
          </div>
        </div>
        ${b.metric != null ? `<div class="pb-num" style="font-weight:700;font-size:16px;color:${b.badge === "pr" ? "var(--gold)" : "var(--text)"}">${b.metric}</div>` : ""}
        ${icon("pencil", 14, 'style="color:var(--faint);flex-shrink:0"')}
      </button>
      <button data-action="open-exercise-window" data-name="${esc(e.exercise)}" title="Exercise details" style="flex-shrink:0;padding:12px 14px;color:var(--faint);align-self:stretch;border-left:1px solid var(--border-soft)">${icon("info", 16)}</button>
    </div>`;
  }).join("");

  return fullScreen(50, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-worksheet" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${draft.editing ? "Edit Workout" : "New Workout"}</div>
      ${chip("Week " + wk, "var(--gold)")}
      ${draft.editing ? `<button data-action="delete-day" title="Delete this whole day" style="color:var(--red);padding:4px">${icon("trash-2", 19)}</button>` : ""}
    </div>

    <div class="pb-scroll" data-scrollkey="worksheet" style="flex:1;overflow-y:auto;padding:14px 16px 120px">
      ${field("Date", `<input type="date" class="pb-input" data-bind="draft.date" value="${esc(draft.date)}">`)}

      ${sectionTitle("Exercises this session")}
      ${draft.entries.length === 0 ? `<div class="pb-card" style="padding:20px;text-align:center;color:var(--faint);font-size:13px;line-height:1.5;margin-bottom:10px">
        ${state.settings.loggingMode === "detailed"
          ? `One entry per exercise, then log <b style="color:var(--muted)">every set</b> inside it.`
          : `One entry per exercise. Log your <b style="color:var(--muted)">top set</b>, first set, best set.`}
      </div>` : ""}
      ${entries}

      <button data-action="open-picker" class="pb-btn pb-ghost" style="width:100%;padding:13px 0;border-style:dashed;margin-top:4px">
        ${icon("plus", 17)} Add exercise
      </button>
    </div>

    <div style="position:absolute;bottom:0;left:0;right:0;padding:12px 16px 18px;background:linear-gradient(transparent, var(--bg) 30%)">
      ${emptyCount ? `<div style="font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:8px;line-height:1.45">${emptyCount} exercise${emptyCount > 1 ? "s" : ""} still need${emptyCount > 1 ? "" : "s"} data, ${emptyCount > 1 ? "they" : "it"} won't be saved until you fill ${emptyCount > 1 ? "them" : "it"} in.</div>` : ""}
      ${draft.entries.length ? `<button data-action="save-as-preset" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:14.5px;margin-bottom:8px">
        ${icon("bookmark-plus", 16)} Save as Preset
      </button>` : ""}
      <button data-action="commit-workout" class="pb-btn pb-gold" style="width:100%;padding:15px 0;font-size:16px;opacity:${filledCount ? 1 : 0.5}">
        ${icon("check", 18)} ${saveLabel}
      </button>
    </div>
  `, "workoutSheet");
}

/* exercise picker with quick-add (name + muscle only, like the sheet) */
function renderPickerList(library) {
  const q = ui.pickerQ, quick = ui.pickerQuick;
  const groups = libraryGroups(library);
  const match = library.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  const exact = library.some((x) => x.name.toLowerCase() === q.trim().toLowerCase());

  let html = "";
  if (q.trim() && !exact && !quick) {
    html += `<button data-action="quick-add-start" class="pb-btn pb-ghost" style="width:100%;padding:12px 14px;justify-content:flex-start;margin-bottom:10px;border-color:rgba(233,185,73,.4);color:var(--gold)">
      ${icon("plus", 16)} Add “${esc(q.trim())}” to the library
    </button>`;
  }
  if (quick) {
    html += `<div class="pb-card" style="padding:14px;margin-bottom:12px">
      <div style="font-weight:700;font-size:14px;margin-bottom:10px">“${esc(quick.name)}”, which muscle does it train?</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${groups.map((g) => `<button data-action="quick-add-muscle" data-g="${esc(g)}" class="pb-chip" style="padding:8px 14px;font-size:13px;color:${colorFor(g)};border-color:${colorFor(g)}55;background:${colorFor(g)}14">${esc(g)}</button>`).join("")}
      </div>
      <div style="font-size:11.5px;color:var(--faint);margin-top:10px">Name + muscle is all it needs to appear in the log. Fill in the rest later in the Library.</div>
    </div>`;
  }
  html += groups.filter((g) => match.some((x) => x.muscle === g)).map((g) => `<div style="margin-bottom:14px">
    ${sectionTitle(`<span style="color:${colorFor(g)}">${esc(g)}</span>`)}
    <div class="pb-card" style="overflow:hidden">
      ${match.filter((x) => x.muscle === g).map((ex, i, arr) => `<div style="display:flex;align-items:center;border-bottom:${i < arr.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        <button data-action="pick-exercise" data-id="${ex.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:12px 4px 12px 14px;text-align:left;color:var(--text)">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px">${esc(ex.name)}</div>
            <div style="font-size:11.5px;color:var(--faint)">${esc(ex.equipment || ex.type)}</div>
          </div>
          ${icon("plus", 16, 'style="color:var(--gold);flex-shrink:0"')}
        </button>
        <button data-action="open-exercise-window" data-name="${esc(ex.name)}" title="Exercise details" style="flex-shrink:0;padding:12px 14px;color:var(--faint);align-self:stretch">${icon("info", 16)}</button>
      </div>`).join("")}
    </div>
  </div>`).join("");
  return html;
}

/* preset bundles shown inside the picker — tap to drop the whole bundle in */
function renderPresetPickerList() {
  const presets = state.presets || [];
  if (!presets.length)
    return `<div class="pb-card" style="padding:22px;text-align:center;color:var(--muted);font-size:13px;line-height:1.65">
      ${icon("layers", 24, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
      No presets yet. Add the exercises for this day, then use <b style="color:var(--gold)">Save as Preset</b> at the bottom of the workout to bundle them for next time.
    </div>`;

  return presets.map((p) => {
    const exs = p.exercises || [];
    return `<div class="pb-card" style="margin-bottom:12px;overflow:hidden">
      <div style="padding:13px 14px">
        <div style="display:flex;align-items:baseline;gap:8px">
          <div class="pb-num" style="font-weight:700;font-size:16px;flex:1;min-width:0">${esc(p.name)}</div>
          ${chip(presetCountLabel(exs.length), "var(--gold)")}
        </div>
        ${p.description ? `<div style="font-size:12.5px;color:var(--muted);margin-top:3px">${esc(p.description)}</div>` : ""}
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:11px">${presetExerciseList(exs)}</div>
      </div>
      <button data-action="apply-preset" data-id="${esc(p.id)}" class="pb-btn pb-gold" style="width:100%;padding:12px 0;font-size:14px;border-radius:0">
        ${icon("plus", 16)} Add ${exs.length === 1 ? "this exercise" : `all ${exs.length}`} to workout
      </button>
    </div>`;
  }).join("") + `<div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin:2px 4px 0">Exercises come in blank, tap each one afterwards to fill in the sets, reps and weight.</div>`;
}

function renderExercisePicker(library) {
  const seg = ui.pickerSeg;
  return fullScreen(60, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px">
      <button data-action="close-picker" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
      <div style="position:relative;flex:1">
        ${seg === "exercises"
          ? `${icon("search", 15, 'style="position:absolute;left:11px;top:12px;color:var(--faint)"')}
             <input class="pb-input" style="padding-left:34px" placeholder="Search or type a new exercise…" data-bind="pickq" value="${esc(ui.pickerQ)}" data-autofocus>`
          : `<div class="pb-num" style="font-size:17px;font-weight:700;padding:8px 2px">Add a preset bundle</div>`}
      </div>
    </div>
    <div style="padding:0 16px 4px">
      ${segControl("picker-seg", seg, [["exercises", "Exercises"], ["presets", "Presets"]])}
    </div>
    <div class="pb-scroll" data-scrollkey="picker" style="flex:1;overflow-y:auto;padding:4px 16px 30px">
      ${seg === "presets"
        ? `<div id="presetPickList">${renderPresetPickerList()}</div>`
        : `<div id="pickList">${renderPickerList(library)}</div>`}
    </div>
  `, "picker");
}

/* entry form — strength: sets/reps/weight/RPE · cardio: minutes/intensity */
function entryComputed() {
  const { f, isDraft } = ui.entryForm;
  const cardio = f.kind === "cardio";
  /* metricOf converts the entry's own unit to the default one, so the live
     "vs your best" below compares like with like */
  const metric = metricOf(f);

  /* live "vs your best" preview against everything chronologically earlier */
  let preview = null;
  if (metric != null) {
    const draft = ui.workoutSheet;
    const editingIds = draft && draft.editing ? new Set(draft.originalIds || []) : null;
    const priorLog = editingIds ? state.log.filter((e) => !editingIds.has(e.id)) : state.log;
    const base = isDraft
      ? [...priorLog, ...(draft ? draft.entries.map((e) => ({ ...e, date: draft.date })) : [])].filter((e) => e.id !== f.id)
      : state.log.filter((e) => e.id !== f.id);
    const date = f.date || (isDraft && draft ? draft.date : null) || todayStr();
    const earlier = chronoSort(base).filter((e) => e.exercise === f.exercise &&
      (e.date < date || (e.date === date && e.createdAt < f.createdAt)));
    const prev = earlier.reduce((m, e) => { const v = metricOf(e); return v == null ? m : Math.max(m, v); }, -Infinity);
    preview = prev === -Infinity ? "first" : metric > prev ? "pr" : metric === prev ? "match" : "below";
  }
  const valid = entryHasData(f);
  return { cardio, metric, preview, valid };
}

/* ── the set list inside a Detailed entry ──────────────────────────────
   Deliberately the same shape as the exercise list on the workout day: an
   "Add set" button on top, then one tappable card per set that opens the
   little editor. Add as many as you want, edit or drop any of them. */
function renderSetList(f, unit) {
  const list = f.setList || [];
  const filled = filledSets(f);
  const top = bestSet(filled);

  const rows = list.map((s, i) => {
    const m = epley1RM(+s.weight, +s.reps);
    const isBest = top && s.id === top.id && filled.length > 1;
    const blank = !setHasData(s);
    return `<div class="pb-card" style="display:flex;align-items:center;margin-bottom:8px;overflow:hidden${blank ? ";border:1px dashed rgba(233,185,73,.55)" : ""}">
      <button data-action="edit-set" data-id="${s.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:11px 4px 11px 12px;text-align:left;color:var(--text)">
        <div class="pb-num" style="width:24px;height:24px;border-radius:7px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:var(--muted);flex-shrink:0">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14.5px;color:${blank ? "var(--gold)" : "var(--text)"}">
            ${blank ? "Tap to fill in reps &amp; weight" : `${esc(s.reps)} × ${esc(s.weight)} ${unit}`}
          </div>
          ${!blank ? `<div style="font-size:11.5px;color:var(--faint)">est. 1RM ${m}${s.rpe ? ` · RPE ${esc(s.rpe)}` : ""}</div>` : ""}
        </div>
        ${isBest ? chip("Best", "var(--gold)") : ""}
        ${icon("pencil", 14, 'style="color:var(--faint);flex-shrink:0"')}
      </button>
      <button data-action="remove-set" data-id="${s.id}" title="Remove set" style="flex-shrink:0;padding:12px 13px;color:var(--red);align-self:stretch;border-left:1px solid var(--border-soft)">${icon("x", 16)}</button>
    </div>`;
  }).join("");

  return `
    ${sectionTitle(`Sets${filled.length ? ` · ${filled.length}` : ""}`, list.length ? `<span style="font-size:11px;color:var(--faint)">tap a set to edit it</span>` : "")}
    <button data-action="add-set" class="pb-btn pb-ghost" style="width:100%;padding:13px 0;border-style:dashed;margin-bottom:10px">
      ${icon("plus", 17)} Add set
    </button>
    ${list.length ? rows : `<div class="pb-card" style="padding:20px;text-align:center;color:var(--faint);font-size:13px;line-height:1.55;margin-bottom:10px">
      No sets yet. Tap <b style="color:var(--gold)">Add set</b> after each one you finish, reps and weight, as many as you do.
    </div>`}`;
}

function renderEntryFields(form, unit) {
  const { f, isDraft } = form;
  const { cardio, metric, preview, valid } = entryComputed();
  const detailed = isDetailed(f);
  const eUnit = unitOf(f);

  const inputs = cardio
    ? `<div style="display:flex;gap:10px">
        <div style="flex:1">${field("Time (minutes)", `<input class="pb-input" type="number" inputmode="decimal" data-bind="entry.minutes" value="${esc(f.minutes)}" placeholder="30">`)}</div>
        <div style="flex:1">${field("Intensity (RPE 1–10)", `<input class="pb-input" type="number" inputmode="decimal" min="1" max="10" data-bind="entry.intensity" value="${esc(f.intensity)}" placeholder="6">`)}</div>
      </div>`
    : detailed
    ? renderSetList(f, eUnit)
    : `<div style="display:flex;gap:10px">
        <div style="flex:1">${field("Total sets", `<input class="pb-input" type="number" inputmode="numeric" data-bind="entry.sets" value="${esc(f.sets)}" placeholder="3">`)}</div>
        <div style="flex:1">${field("Top set reps", `<input class="pb-input" type="number" inputmode="numeric" data-bind="entry.reps" value="${esc(f.reps)}" placeholder="8">`)}</div>
      </div>
      <div style="display:flex;gap:10px">
        <div style="flex:1">${field(labelWith("Top set weight", unitSelect(eUnit)), `<input class="pb-input" type="number" inputmode="decimal" data-bind="entry.weight" value="${esc(f.weight)}" placeholder="80">`,
          "Log what the machine says, the unit is per exercise.")}</div>
        <div style="flex:1">${field(labelWith("RPE (1–10)"), `<input class="pb-input" type="number" inputmode="decimal" min="1" max="10" step="0.5" data-bind="entry.rpe" value="${esc(f.rpe)}" placeholder="8">`, "10 = nothing left")}</div>
      </div>`;

  /* An entry keeps whatever shape it was logged in, so nothing is ever lost by
     flipping the setting. This is the one-way door out of a single top set, and
     only offered while Detailed mode is on. */
  const convert = !cardio && !detailed && state.settings.loggingMode === "detailed"
    ? `<button data-action="entry-to-detailed" class="pb-btn pb-ghost" style="width:100%;padding:11px 0;font-size:13.5px;margin-bottom:14px;border-style:dashed;color:var(--gold);border-color:rgba(233,185,73,.45)">
        ${icon("list-plus", 15)} Log this one set by set
      </button>
      <div style="font-size:11.5px;color:var(--faint);margin:-8px 2px 14px;line-height:1.5">Logged before you switched modes. Converting keeps the top set as set 1, then you add the rest.</div>`
    : "";

  return fullScreen(70, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 6px">
      <button data-action="close-entry" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
      <div style="flex:1">
        <div class="pb-num" style="font-size:18px;font-weight:700;line-height:1.15">${esc(f.exercise)}</div>
        <div style="font-size:11.5px;color:var(--faint)">${cardio ? "Cardio · time × intensity" : detailed ? "Strength · every set" : "Strength · top set"}</div>
      </div>
      <button data-action="delete-entry-form" style="color:var(--red);padding:6px">${icon("trash-2", 18)}</button>
    </div>

    <div class="pb-scroll" data-scrollkey="entryform" style="flex:1;overflow-y:auto;padding:10px 16px 120px">
      ${!isDraft ? field("Date", `<input type="date" class="pb-input" data-bind="entry.date" value="${esc(f.date)}">`) : ""}
      ${convert}
      ${inputs}
      ${field("Personal notes", `<textarea class="pb-input" rows="2" data-bind="entry.notes" placeholder="Felt strong · slow eccentric · new grip…" style="resize:none">${esc(f.notes)}</textarea>`,
        detailed ? "One note for the whole exercise, it covers every set above." : "")}

      <!-- live computed row — the sheet's Est. 1RM + "vs. Your Best" -->
      <div class="pb-card2" style="padding:12px 14px;display:flex;align-items:center;gap:12px;margin-top:4px">
        <div>
          <div class="pb-label">${cardio ? "Session load" : detailed ? `Est. 1RM · best set (${unit})` : `Est. 1RM (${unit})`}</div>
          <div id="entryMetric" class="pb-num" style="font-size:30px;font-weight:700;color:var(--gold);line-height:1.05">${metric ?? "—"}</div>
        </div>
        <div id="entryBadge" style="flex:1;text-align:right;font-size:13px;font-weight:700;color:${preview === "pr" ? "var(--gold)" : preview === "first" ? "var(--blue)" : "var(--muted)"}">
          ${preview ? BADGE_TEXT[preview] : cardio ? "minutes × RPE" : "weight × (1 + reps/30)"}
        </div>
      </div>
      ${!cardio && eUnit !== unit ? `<div style="font-size:11.5px;color:var(--faint);margin:8px 2px 0;line-height:1.5">
        Logged in <b style="color:var(--muted)">${eUnit}</b>, converted to <b style="color:var(--muted)">${unit}</b> here so PRs, goals and the graph stay comparable. Your typed numbers are kept exactly as entered.
      </div>` : ""}
      ${detailed ? `<div style="font-size:11.5px;color:var(--faint);margin:8px 2px 0;line-height:1.5">
        Your <b style="color:var(--muted)">highest</b> estimated 1RM across every set above is what counts toward PRs and the Progress graph. All the sets stay saved either way.
      </div>` : ""}
    </div>

    <div style="position:absolute;bottom:0;left:0;right:0;padding:12px 16px 18px;background:linear-gradient(transparent, var(--bg) 30%)">
      <button id="entrySaveBtn" data-action="save-entry-form" ${valid ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:15px 0;font-size:16px;opacity:${valid ? 1 : 0.45}">
        ${icon("check", 18)} ${isDraft ? "Add to workout" : "Save changes"}
      </button>
    </div>
  `, "entryForm");
}

/* the single-set editor — same idea as the entry form, one level down */
function renderSetForm(form, unit) {
  const { s, isNew, index } = form;
  const m = epley1RM(+s.weight, +s.reps);
  const ok = setHasData(s);
  return sheet(isNew ? `Add set ${index + 1}` : `Edit set ${index + 1}`, "setForm", `
    <div style="display:flex;gap:10px">
      <div style="flex:1">${field(labelWith("Reps"), `<input class="pb-input" type="number" inputmode="numeric" min="1" data-bind="set.reps" value="${esc(s.reps)}" placeholder="8" data-autofocus>`)}</div>
      <div style="flex:1">${field(labelWith("Weight", unitSelect(unit)), `<input class="pb-input" type="number" inputmode="decimal" min="0" step="0.5" data-bind="set.weight" value="${esc(s.weight)}" placeholder="80">`,
        "Applies to every set of this exercise.")}</div>
    </div>
    ${field("RPE (1–10)", `<input class="pb-input" type="number" inputmode="decimal" min="1" max="10" step="0.5" data-bind="set.rpe" value="${esc(s.rpe)}" placeholder="8">`, "Optional. 10 = nothing left in the tank.")}

    <div class="pb-card2" style="padding:11px 14px;display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div>
        <div class="pb-label">Est. 1RM (${unit})</div>
        <div id="setMetric" class="pb-num" style="font-size:26px;font-weight:700;color:var(--gold);line-height:1.05">${m ?? "—"}</div>
      </div>
      <div style="flex:1;text-align:right;font-size:12px;color:var(--faint)">weight × (1 + reps/30)</div>
    </div>

    <button id="setSaveBtn" data-action="save-set" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">
      ${icon("check", 17)} ${isNew ? "Add set" : "Save set"}
    </button>
    ${!isNew ? `<button data-action="delete-set" class="pb-btn" style="width:100%;padding:12px 0;margin-top:8px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} Remove this set
    </button>` : ""}
  `, 100);
}

/* live 1RM + save-button state while typing in the set editor */
function updateSetPreview() {
  if (!ui.setForm) return;
  const s = ui.setForm.s;
  const m = epley1RM(+s.weight, +s.reps);
  const el = document.getElementById("setMetric");
  const btn = document.getElementById("setSaveBtn");
  if (el) el.textContent = m ?? "—";
  if (btn) { const ok = setHasData(s); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
}

function updateEntryPreview() {
  if (!ui.entryForm) return;
  const { cardio, metric, preview, valid } = entryComputed();
  const m = document.getElementById("entryMetric");
  const b = document.getElementById("entryBadge");
  const s = document.getElementById("entrySaveBtn");
  if (m) m.textContent = metric ?? "—";
  if (b) {
    b.style.color = preview === "pr" ? "var(--gold)" : preview === "first" ? "var(--blue)" : "var(--muted)";
    b.textContent = preview ? BADGE_TEXT[preview] : cardio ? "minutes × RPE" : "weight × (1 + reps/30)";
  }
  if (s) { s.disabled = !valid; s.style.opacity = valid ? 1 : 0.45; }
}

/* ─────────────────────────── BODY TAB ─────────────────────────────── */

function renderBody(body, unit) {
  const t = bodyTrend(body);
  const rows = [...body].sort((a, b) => (a.date < b.date ? 1 : -1));

  const list = rows.length === 0
    ? `<div class="pb-card" style="padding:26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.6">
        ${icon("ruler", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
        The workout log for your body. Tap <b style="color:var(--gold)">+</b> to add your first check-in, once a week or two, same time of day, before food.
      </div>`
    : `<div class="pb-card" style="overflow:hidden;margin-bottom:14px">
        ${rows.map((r, i) => `<button data-action="edit-body" data-id="${r.id}" style="width:100%;text-align:left;padding:12px 14px;display:flex;gap:10px;align-items:center;color:var(--text);border-bottom:${i < rows.length - 1 ? "1px solid var(--border-soft)" : "none"}">
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px">${fmtDate(r.date)}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">
              ${[["Waist", r.waist], ["Chest", r.chest], ["Arm", r.arm], ["Thigh", r.thigh], ["Glutes", r.glutes]]
                .filter(([, v]) => v).map(([k, v]) => `${k} ${esc(v)}`).join(" · ") || "—"}
            </div>
          </div>
          ${r.weight ? `<div class="pb-num" style="font-weight:700;font-size:18px">${esc(r.weight)}<span style="font-size:10.5px;color:var(--muted)"> ${unit}</span></div>` : ""}
          ${icon("chevron-right", 15, 'style="color:var(--faint)"')}
        </button>`).join("")}
      </div>`;

  return `<div class="" style="padding:12px 16px 0">
    <div style="display:flex;gap:8px;margin-bottom:16px">
      ${stat("Starting", t.first ?? "—", unit)}
      ${stat("Latest", t.last ?? "—", unit)}
      ${stat("Change", t.change == null ? "—" : (t.change > 0 ? "+" : "") + t.change, unit, t.change > 0 ? "var(--green)" : t.change < 0 ? "var(--blue)" : "")}
      ${stat("Check-ins", t.count)}
    </div>

    ${list}

    <div style="font-size:12px;color:var(--faint);line-height:1.55;margin:0 4px 14px">
      The scale lies daily but tells the truth monthly, trust the trend, not the Tuesday. Tape measurements: flexed, same spots each time, and measure a muscle <i>before</i> you train it (or on a rest day), pump inflates the number and hides your real trend.
    </div>

    <!-- PLACEHOLDER_BODY_GRAPH_SLOT — future measurement graphs -->
    ${placeholder("PLACEHOLDER_BODY_GRAPH_SLOT", 90, "measurement graphs, coming later")}
    <div style="height:14px"></div>
  </div>`;
}

function renderBodyFormSheet(f, unit) {
  const isNew = ui.bodyFormWasNew;
  const num = (label, bind, val) => `<div style="flex:1">${field(label, `<input class="pb-input" type="number" inputmode="decimal" data-bind="${bind}" value="${esc(val)}">`)}</div>`;
  return sheet(isNew ? "New check-in" : "Edit check-in", "bodyForm", `
    ${field("Date", `<input type="date" class="pb-input" data-bind="body.date" value="${esc(f.date)}">`)}
    <div style="display:flex;gap:10px">${num(`Bodyweight (${unit})`, "body.weight", f.weight)}${num("Waist (cm/in)", "body.waist", f.waist)}</div>
    <div style="display:flex;gap:10px">${num("Chest (cm/in)", "body.chest", f.chest)}${num("Arm (cm/in)", "body.arm", f.arm)}</div>
    <div style="display:flex;gap:10px">${num("Thigh (cm/in)", "body.thigh", f.thigh)}${num("Glutes/Hips (cm/in)", "body.glutes", f.glutes)}</div>
    ${field("Notes", `<textarea class="pb-input" rows="2" data-bind="body.notes" style="resize:none">${esc(f.notes)}</textarea>`)}
    <button data-action="save-body" class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15px;margin-top:4px">${icon("check", 17)} Save check-in</button>
    ${!isNew ? `<button data-action="delete-body" class="pb-btn" style="width:100%;padding:12px 0;margin-top:8px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} Delete
    </button>` : ""}
  `);
}

/* ═══════════════════════════ TIMERS ════════════════════════════════
   A timer is {id,name,duration,endsAt,remaining,doneAt}. `endsAt` is an
   absolute timestamp rather than a ticking countdown, so a running timer
   stays honest through a re-render, a backgrounded tab, or the app being
   closed and reopened: anything that ran out while you were away is caught
   the moment you come back. Saved timers are reusable — start, pause,
   reset, start again — and any number can run at once.               */

const QUICK_TIMERS = [30, 60, 90, 120, 180, 300];
const RING_C = 326.73;   /* 2πr for the r=52 progress ring below */

function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
           : `${m}:${String(s).padStart(2, "0")}`;
}

const timerRemaining = (t) =>
  t.endsAt ? Math.max(0, (t.endsAt - Date.now()) / 1000)
    : t.remaining != null ? t.remaining
    : t.duration;

const timerPhase = (t) =>
  t.endsAt ? "running" : t.doneAt ? "done" : t.remaining != null ? "paused" : "idle";

/* ── the alert: sound, buzz, system notification, in-app banner ─────── */

let audioCtx = null;
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* audio is a nicety, never a blocker */ }
}

function chime() {
  unlockAudio();
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
      const at = t0 + i * 0.34;
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(i === 2 ? 1175 : 880, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.32, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(at); osc.stop(at + 0.32);
    }
  } catch { /* ignore */ }
}

/* Asked for on the first Start — a permission prompt needs a user gesture. */
function askNotifyPermission() {
  try {
    if (window.Notification && Notification.permission === "default") Notification.requestPermission();
  } catch { /* unsupported */ }
}

function notifyDone(t) {
  try {
    if (window.Notification && Notification.permission === "granted") {
      const n = new Notification(t.name || "Timer", {
        body: `${fmtClock(t.duration)} is up.`,
        icon: "logoC.png", badge: "logoC.png", tag: "pbt-" + t.id, renotify: true,
      });
      n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n.close(); };
    }
  } catch { /* some browsers only allow notifications from a service worker */ }
}

function fireTimer(t) {
  t.endsAt = null; t.remaining = null; t.doneAt = Date.now();
  try { if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]); } catch { /* ignore */ }
  chime();
  notifyDone(t);
  ui.timerToast = { id: t.id, name: t.name || "Timer" };
}

/* Fire anything that has run out. Returns true when something changed, so the
   caller knows a re-render is due. */
function sweepTimers() {
  const due = (state.timers || []).filter((t) => t.endsAt && t.endsAt <= Date.now());
  if (!due.length) return false;
  due.forEach(fireTimer);
  writeNow();
  return true;
}

/* Repaint running cards in place — never a full render, so the countdown can't
   flicker the page or steal focus from a field you're typing in. */
function paintTimers() {
  for (const t of state.timers || []) {
    if (!t.endsAt) continue;
    const left = timerRemaining(t);
    const digits = document.getElementById("tmr-time-" + t.id);
    if (digits) digits.textContent = fmtClock(left);
    const ring = document.getElementById("tmr-ring-" + t.id);
    if (ring) {
      const frac = t.duration > 0 ? Math.max(0, Math.min(1, left / t.duration)) : 0;
      ring.setAttribute("stroke-dashoffset", (RING_C * (1 - frac)).toFixed(2));
    }
  }
}

let timerEngine = null;
function startTimerEngine() {
  if (timerEngine) return;
  timerEngine = setInterval(() => {
    if (sweepTimers()) { render(); return; }
    paintTimers();
  }, 250);
}
/* Background tabs get throttled hard, so also sweep the instant we're back. */
document.addEventListener("visibilitychange", () => { if (!document.hidden && sweepTimers()) render(); });
window.addEventListener("focus", () => { if (sweepTimers()) render(); });

function startTimer(t) {
  unlockAudio();          // both need the user gesture that got us here
  askNotifyPermission();
  const secs = t.remaining != null ? t.remaining : t.duration;
  t.endsAt = Date.now() + Math.max(1, secs) * 1000;
  t.remaining = null; t.doneAt = null;
  if (ui.timerToast && ui.timerToast.id === t.id) ui.timerToast = null;
  writeNow(); render();
}

/* ── the tab ───────────────────────────────────────────────────────── */

function timerActiveCard(t) {
  const phase = timerPhase(t);
  const left = timerRemaining(t);
  const done = phase === "done";
  const frac = t.duration > 0 ? Math.max(0, Math.min(1, left / t.duration)) : 0;
  const ringColor = done ? "var(--green)" : phase === "paused" ? "var(--steel)" : "var(--gold)";

  const controls = done
    ? `<button data-action="timer-start" data-id="${t.id}" class="pb-btn pb-gold" style="flex:1;padding:9px 0;font-size:13px">${icon("rotate-ccw", 14)} Again</button>
       <button data-action="timer-reset" data-id="${t.id}" class="pb-btn pb-ghost" style="flex:1;padding:9px 0;font-size:13px">${icon("check", 14)} Done</button>`
    : phase === "paused"
    ? `<button data-action="timer-start" data-id="${t.id}" class="pb-btn pb-gold" style="flex:1;padding:9px 0;font-size:13px">${icon("play", 14)} Resume</button>
       <button data-action="timer-reset" data-id="${t.id}" class="pb-btn pb-ghost" style="flex:1;padding:9px 0;font-size:13px">${icon("rotate-ccw", 14)} Reset</button>`
    : `<button data-action="timer-pause" data-id="${t.id}" class="pb-btn pb-ghost" style="flex:1;padding:9px 0;font-size:13px">${icon("pause", 14)} Pause</button>
       <button data-action="timer-reset" data-id="${t.id}" class="pb-btn pb-ghost" style="flex:1;padding:9px 0;font-size:13px">${icon("square", 13)} Stop</button>`;

  return `<div class="pb-card${done ? " pb-timer-done" : ""}" style="padding:15px 14px;margin-bottom:10px;display:flex;align-items:center;gap:15px;${done ? "border-color:rgba(106,164,101,.55)" : phase === "running" ? "border-color:rgba(233,185,73,.4)" : ""}">
    <div style="position:relative;width:108px;height:108px;flex-shrink:0">
      <svg width="108" height="108" viewBox="0 0 120 120" style="display:block;transform:rotate(-90deg)">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface2)" stroke-width="9"/>
        <circle id="tmr-ring-${t.id}" cx="60" cy="60" r="52" fill="none" stroke="${ringColor}" stroke-width="9"
                stroke-linecap="round" stroke-dasharray="${RING_C}" stroke-dashoffset="${(RING_C * (1 - frac)).toFixed(2)}"
                style="transition:stroke-dashoffset .25s linear"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div id="tmr-time-${t.id}" class="pb-num" style="font-size:${done ? 19 : 25}px;font-weight:700;line-height:1;color:${done ? "var(--green)" : "var(--text)"}">${done ? "DONE" : fmtClock(left)}</div>
        <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-top:3px">${done ? "time's up" : phase === "paused" ? "paused" : "remaining"}</div>
      </div>
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.name)}</div>
      <div style="font-size:12px;color:var(--faint);margin-top:2px">${fmtClock(t.duration)} timer</div>
      <div style="display:flex;gap:7px;margin-top:12px">${controls}</div>
    </div>
  </div>`;
}

function timerIdleRow(t, last) {
  return `<div style="display:flex;align-items:center;border-bottom:${last ? "none" : "1px solid var(--border-soft)"}">
    <button data-action="timer-start" data-id="${t.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:12px 4px 12px 14px;text-align:left;color:var(--text)">
      <span style="width:34px;height:34px;border-radius:11px;background:rgba(233,185,73,.12);border:1px solid rgba(233,185,73,.3);display:flex;align-items:center;justify-content:center;color:var(--gold);flex-shrink:0">${icon("play", 15, 'fill="currentColor"')}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.name)}</div>
        <div class="pb-num" style="font-size:12.5px;color:var(--muted)">${fmtClock(t.duration)}</div>
      </div>
    </button>
    <button data-action="timer-edit" data-id="${t.id}" title="Edit timer" style="flex-shrink:0;padding:12px 14px;color:var(--faint);align-self:stretch">${icon("pencil", 16)}</button>
  </div>`;
}

function renderTimers() {
  const timers = state.timers || [];
  const active = timers.filter((t) => timerPhase(t) !== "idle");
  const idle = timers.filter((t) => timerPhase(t) === "idle");

  return `<div class="" style="padding:14px 16px 0">
    ${sectionTitle("Quick start")}
    <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:20px">
      ${QUICK_TIMERS.map((s) => `<button data-action="quick-timer" data-s="${s}" class="pb-chip pb-num" style="padding:9px 15px;font-size:14px;font-weight:700;color:var(--gold);border-color:rgba(233,185,73,.35);background:rgba(233,185,73,.08)">${fmtClock(s)}</button>`).join("")}
    </div>

    ${active.length ? `${sectionTitle(`Running · ${active.length}`)}${active.map(timerActiveCard).join("")}<div style="height:12px"></div>` : ""}

    ${sectionTitle("Your timers")}
    ${idle.length
      ? `<div class="pb-card" style="overflow:hidden;margin-bottom:12px">${idle.map((t, i) => timerIdleRow(t, i === idle.length - 1)).join("")}</div>`
      : `<div class="pb-card" style="padding:${timers.length ? "16px" : "26px"};text-align:center;color:var(--muted);font-size:13.5px;line-height:1.6;margin-bottom:12px">
          ${timers.length ? "Every timer you've saved is running right now." : `${icon("timer", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}No timers saved yet. Tap a quick-start time above, or build your own with the button below, rest between sets, a plank hold, an interval, whatever you need.`}
        </div>`}

    <button data-action="timer-add" class="pb-btn pb-ghost" style="width:100%;padding:13px 0;font-size:14px;border-style:dashed;margin-bottom:14px">
      ${icon("plus", 17)} New timer
    </button>

    <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:0 4px 10px">
      Run as many at once as you like, each keeps its own countdown. When one finishes you get a notification, a buzz and a chime. Timers count in real time, so one that runs out while you're on another tab still lands the moment it's up, and one that ends while the app is closed alerts you as soon as you open it again.
    </div>
    <div style="height:8px"></div>
  </div>`;
}

function renderTimerForm(form) {
  const { t, isNew } = form;
  const total = Math.max(0, (+t.min || 0) * 60 + (+t.sec || 0));
  const ok = total > 0;
  return sheet(isNew ? "New timer" : "Edit timer", "timerForm", `
    ${field("Name", `<input class="pb-input" data-bind="timer.name" value="${esc(t.name)}" placeholder="Rest between sets" ${isNew ? "data-autofocus" : ""}>`, "Optional. It's what the notification says.")}
    <div style="display:flex;gap:10px">
      <div style="flex:1">${field("Minutes", `<input class="pb-input" type="number" inputmode="numeric" min="0" max="180" data-bind="timer.min" value="${esc(t.min)}" placeholder="2">`)}</div>
      <div style="flex:1">${field("Seconds", `<input class="pb-input" type="number" inputmode="numeric" min="0" max="59" data-bind="timer.sec" value="${esc(t.sec)}" placeholder="30">`)}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:7px;margin:-4px 0 16px">
      ${QUICK_TIMERS.map((s) => `<button data-action="timer-preset" data-s="${s}" class="pb-chip pb-num" style="padding:7px 13px;font-size:13px;font-weight:700;color:var(--muted)">${fmtClock(s)}</button>`).join("")}
    </div>
    <div class="pb-card2" style="padding:11px 14px;margin-bottom:14px;display:flex;align-items:baseline;gap:10px">
      <div class="pb-label">Total</div>
      <div id="timerTotal" class="pb-num" style="font-size:24px;font-weight:700;color:${ok ? "var(--gold)" : "var(--faint)"};line-height:1">${ok ? fmtClock(total) : "—"}</div>
    </div>
    <button id="timerSaveBtn" data-action="timer-save" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">${icon("check", 17)} ${isNew ? "Save timer" : "Save changes"}</button>
    ${!isNew ? `<button data-action="timer-delete" class="pb-btn" style="width:100%;padding:12px 0;margin-top:8px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} Delete timer
    </button>` : ""}
  `);
}

/* live total + save-button state while typing a duration */
function updateTimerPreview() {
  if (!ui.timerForm) return;
  const t = ui.timerForm.t;
  const total = Math.max(0, (+t.min || 0) * 60 + (+t.sec || 0));
  const ok = total > 0;
  const el = document.getElementById("timerTotal");
  const btn = document.getElementById("timerSaveBtn");
  if (el) { el.textContent = ok ? fmtClock(total) : "—"; el.style.color = ok ? "var(--gold)" : "var(--faint)"; }
  if (btn) { btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
}

/* ─────────────────────────── PROFILE ──────────────────────────────── */

function renderProfile(f) {
  return fullScreen(80, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-profile" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">Profile</div>
      <button data-action="save-profile" class="pb-btn pb-gold" style="padding:8px 16px;font-size:13.5px">Save</button>
    </div>
    <div class="pb-scroll" data-scrollkey="profile" style="flex:1;overflow-y:auto;padding:16px 16px 40px">
      ${field("Your name", `<input class="pb-input" data-bind="profile.name" value="${esc(f.name)}" placeholder="John Lifter">`)}
      ${field("Default unit", `<div style="display:flex;gap:8px">
        ${UNITS.map((u) => `<button data-action="profile-units" data-u="${u}" class="pb-btn" style="flex:1;padding:11px 0;background:${f.units === u ? "var(--gold)" : "var(--surface2)"};color:${f.units === u ? "var(--gold-ink)" : "var(--muted)"};border:1px solid ${f.units === u ? "var(--gold)" : "var(--border)"}">${u}</button>`).join("")}
      </div>`, "The unit each new exercise starts on, and the one all your est. 1RMs, PRs, goals and graphs are shown in. You can still switch the unit on any individual exercise while you log it, right above the weight field.")}
      ${field("Theme", `<div style="display:flex;gap:8px">
        ${[["dark", "Dark", "moon"], ["light", "Light", "sun"]].map(([t, label, ic]) => {
          const on = (f.theme || "dark") === t;
          return `<button data-action="profile-theme" data-t="${t}" class="pb-btn" style="flex:1;padding:11px 0;background:${on ? "var(--gold)" : "var(--surface2)"};color:${on ? "var(--gold-ink)" : "var(--muted)"};border:1px solid ${on ? "var(--gold)" : "var(--border)"}">${icon(ic, 15)} ${label}</button>`;
        }).join("")}
      </div>`, "Dark is a Discord-style grey palette (default). Light is easier in a bright room.")}
      ${field("Program start date", `<input type="date" class="pb-input" data-bind="profile.startDate" value="${esc(f.startDate)}">`, "Week numbers count from this date.")}
      ${field("Training days / week", `<input class="pb-input" type="number" inputmode="numeric" min="1" max="7" data-bind="profile.daysPerWeek" value="${esc(f.daysPerWeek)}">`)}

      <div class="pb-hairline" style="margin:18px 0"></div>
      ${sectionTitle("How you log")}
      ${field("Logging mode", `<div style="display:flex;gap:8px">
        ${[["fsbs", "FSBS", "flame"], ["detailed", "Detailed", "list-checks"]].map(([m, label, ic]) => {
          const on = (f.loggingMode || "fsbs") === m;
          return `<button data-action="profile-mode" data-m="${m}" class="pb-btn" style="flex:1;padding:11px 0;background:${on ? "var(--gold)" : "var(--surface2)"};color:${on ? "var(--gold-ink)" : "var(--muted)"};border:1px solid ${on ? "var(--gold)" : "var(--border)"}">${icon(ic, 15)} ${label}</button>`;
        }).join("")}
      </div>`)}
      <div class="pb-card2" style="padding:12px 13px;font-size:12.5px;color:var(--muted);line-height:1.6;margin:-4px 0 12px">
        <b style="color:var(--text)">FSBS, first set best set.</b> Fast and simple. Per exercise you log one top set plus how many sets you did in total. In and out, minimum typing.<br><br>
        <b style="color:var(--text)">Detailed, every set.</b> For the thorough. Add sets one at a time inside an exercise, each with its own reps and weight, exactly the way you add exercises to a day. Your estimated 1RM comes from your <b style="color:var(--text)">best</b> set.<br><br>
        Switching is safe and you can do it whenever. Nothing is deleted: workouts you logged set by set keep every set in storage and just show their best one while you're in FSBS. Flip back and they're all still there.
      </div>

      <div class="pb-hairline" style="margin:18px 0"></div>

      <!-- PLACEHOLDER_PLANNER_TAB_SLOT — Program Planner ships in a later version -->
      ${sectionTitle("Coming later")}
      ${placeholder("PLACEHOLDER_PLANNER_TAB_SLOT", 72, "program planner, strength / hypertrophy / deload blocks")}

      <div class="pb-hairline" style="margin:18px 0"></div>
      ${sectionTitle("Data")}
      <button data-action="reset-all" class="pb-btn" style="width:100%;padding:13px 0;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
        ${icon("trash-2", 16)} Reset all data
      </button>
      <div style="font-size:11.5px;color:var(--faint);margin-top:10px;line-height:1.5">
        Your data is saved automatically on this device as you go.
      </div>
    </div>
  `, "profile");
}

/* ────────────────────────── SHEET / SHELL ─────────────────────────── */

/* `key` identifies the overlay across renders; the enter slide only plays when
   the overlay is newly opened (absent from the previous frame), so re-rendering
   while it's already open never re-slides it. */
function fullScreen(z, children, key) {
  const enter = key && !_lastOverlayKeys.has(key) ? " pb-sheet" : "";
  return `<div class="${enter}" data-overlay="${key || ""}" data-layer="fs" style="position:absolute;inset:0;z-index:${z};background:var(--bg);display:flex;flex-direction:column">${children}</div>`;
}

function sheet(title, target, children, z = 60) {
  const enter = !_lastOverlayKeys.has(target) ? " pb-sheet" : "";
  return `<div data-overlay="${target}" data-layer="sheet" data-action="overlay-close" data-target="${target}" style="position:absolute;inset:0;z-index:${z};display:flex;flex-direction:column;justify-content:flex-end;background:rgba(0,0,0,.55)">
    <div class="pb-sheet-card pb-scroll${enter}" data-stopprop style="background:var(--surface);border-top:1px solid var(--border);border-radius:18px 18px 0 0;padding:16px 18px 26px;max-height:88%;overflow-y:auto">
      <div style="display:flex;align-items:center;margin-bottom:14px">
        <div class="pb-num" style="font-size:18.5px;font-weight:700;flex:1">${title}</div>
        <button data-action="overlay-close" data-target="${target}" style="color:var(--muted);padding:4px">${icon("x", 20)}</button>
      </div>
      ${children}
    </div>
  </div>`;
}

/* ═══════════════════════════ SVG CHARTS ════════════════════════════
   Hand-rolled equivalents of the recharts Line/Bar charts.           */

function niceTicks(min, max, count = 5, integers = false) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(step0))));
  const norm = step0 / mag;
  let step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  if (integers) step = Math.max(1, Math.round(step));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/* monotone cubic interpolation (Fritsch–Carlson) — recharts' type="monotone" */
function monotonePath(pts) {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const dx = [], d = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; d[i] = (pts[i + 1].y - pts[i].y) / dx[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; }
    else {
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
  }
  let path = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    path += `C${(pts[i].x + dx[i] / 3).toFixed(2)},${(pts[i].y + m[i] * dx[i] / 3).toFixed(2)},${(pts[i + 1].x - dx[i] / 3).toFixed(2)},${(pts[i + 1].y - m[i + 1] * dx[i] / 3).toFixed(2)},${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return path;
}

const tooltipHTML = (label, name, value, color) =>
  `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;font-size:12.5px;color:var(--text);padding:8px 12px;white-space:nowrap">
    <div style="color:var(--muted);margin-bottom:2px">${esc(label)}</div>
    <div style="color:${color}">${name} : ${value}</div>
  </div>`;

/* resolve a CSS theme variable to a concrete color for use in SVG attributes */
const themeColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function drawCharts() {
  drawLineChart();
  drawBarChart();
}

function drawLineChart() {
  const wrap = document.getElementById("lineChart");
  if (!wrap || !chartState.line) return;
  const { data, goal } = chartState.line;
  const W = wrap.clientWidth || 340, H = 210;
  const left = 46, right = W - 14, top = 6, bottom = H - 30;
  const plotW = right - left, plotH = bottom - top;

  const cGrid = themeColor("--border-soft"), cAxis = themeColor("--border"), cTick = themeColor("--faint"),
        cGold = themeColor("--gold"), cDot = themeColor("--bg"), cGreen = themeColor("--green");

  const vals = data.map((d) => d.y);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 5);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const yOf = (v) => bottom - ((v - yMin) / (yMax - yMin)) * plotH;
  const n = data.length;
  const xOf = (i) => n === 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1);

  const pts = data.map((d, i) => ({ x: +xOf(i).toFixed(2), y: +yOf(d.y).toFixed(2) }));

  let svg = `<svg width="${W}" height="${H}" style="display:block">`;
  /* grid */
  for (const t of ticks) svg += `<line x1="${left}" x2="${right}" y1="${yOf(t).toFixed(2)}" y2="${yOf(t).toFixed(2)}" stroke="${cGrid}" stroke-dasharray="3 5"/>`;
  for (let i = 0; i < n; i++) svg += `<line x1="${pts[i].x}" x2="${pts[i].x}" y1="${top}" y2="${bottom}" stroke="${cGrid}" stroke-dasharray="3 5"/>`;
  /* axes */
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="${cAxis}"/>`;
  for (const t of ticks) svg += `<text x="${left - 6}" y="${(yOf(t) + 3.5).toFixed(2)}" fill="${cTick}" font-size="10.5" text-anchor="end">${t}</text>`;
  const skip = Math.max(1, Math.ceil(n / 7));
  for (let i = 0; i < n; i++) {
    if (i % skip !== 0 && i !== n - 1) continue;
    svg += `<text x="${pts[i].x}" y="${bottom + 14}" fill="${cTick}" font-size="10.5" text-anchor="middle">${esc(data[i].x)}</text>`;
  }
  /* goal reference line (drawn only inside the domain, like recharts) */
  if (goal != null && goal >= yMin && goal <= yMax) {
    const gy = yOf(goal).toFixed(2);
    svg += `<line x1="${left}" x2="${right}" y1="${gy}" y2="${gy}" stroke="${cGreen}" stroke-dasharray="5 4"/>`;
    svg += `<text x="${right - 3}" y="${(yOf(goal) - 4).toFixed(2)}" fill="${cGreen}" font-size="10" text-anchor="end">goal</text>`;
  }
  /* line + dots */
  svg += `<path d="${monotonePath(pts)}" fill="none" stroke="${cGold}" stroke-width="2.4"/>`;
  for (const p of pts) svg += `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${cGold}" stroke="${cDot}" stroke-width="1.5"/>`;
  svg += `<circle id="lineActiveDot" r="5" fill="${cGold}" stroke="${cDot}" stroke-width="1.5" style="display:none"/>`;
  svg += `</svg>`;
  wrap.innerHTML = svg + `<div id="lineTip" style="position:absolute;display:none;pointer-events:none;z-index:5"></div>`;

  const tip = wrap.querySelector("#lineTip");
  const dot = wrap.querySelector("#lineActiveDot");
  wrap.onmousemove = (e) => {
    const r = wrap.getBoundingClientRect();
    const mx = e.clientX - r.left;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.x - mx); if (d < bd) { bd = d; best = i; } });
    const p = pts[best];
    dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); dot.style.display = "";
    tip.innerHTML = tooltipHTML(data[best].x, "y", data[best].y, cGold);
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(2, p.x + 12), W - tw - 2) + "px";
    tip.style.top = Math.max(2, p.y - 40) + "px";
  };
  wrap.onmouseleave = () => { tip.style.display = "none"; dot.style.display = "none"; };
}

function drawBarChart() {
  const wrap = document.getElementById("barChart");
  if (!wrap || !chartState.bar) return;
  const { data } = chartState.bar;
  const W = wrap.clientWidth || 340, H = 140;
  const left = 42, right = W - 14, top = 4, bottom = H - 26;
  const plotW = right - left, plotH = bottom - top;

  const cGrid = themeColor("--border-soft"), cAxis = themeColor("--border"),
        cTick = themeColor("--faint"), cBlue = themeColor("--blue");

  const maxV = Math.max(1, ...data.map((d) => d.sets));
  const ticks = niceTicks(0, maxV, 5, true).filter((t) => Number.isInteger(t));
  const yMax = ticks[ticks.length - 1];
  const yOf = (v) => bottom - (v / yMax) * plotH;
  const n = data.length;
  const band = plotW / n;
  const barW = Math.min(26, band * 0.7);

  let svg = `<svg width="${W}" height="${H}" style="display:block">`;
  for (const t of ticks) svg += `<line x1="${left}" x2="${right}" y1="${yOf(t).toFixed(2)}" y2="${yOf(t).toFixed(2)}" stroke="${cGrid}" stroke-dasharray="3 5"/>`;
  svg += `<rect id="barCursor" x="0" y="${top}" width="${band.toFixed(2)}" height="${plotH}" fill="${cBlue}" opacity="0.12" style="display:none"/>`;
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="${cAxis}"/>`;
  for (const t of ticks) svg += `<text x="${left - 6}" y="${(yOf(t) + 3.5).toFixed(2)}" fill="${cTick}" font-size="10.5" text-anchor="end">${t}</text>`;
  const skip = Math.max(1, Math.ceil(n / 10));
  data.forEach((d, i) => {
    const cx = left + band * i + band / 2;
    if (i % skip === 0 || i === n - 1)
      svg += `<text x="${cx.toFixed(2)}" y="${bottom + 13}" fill="${cTick}" font-size="10.5" text-anchor="middle">${esc(d.w)}</text>`;
    if (d.sets > 0) {
      const x = cx - barW / 2, y = yOf(d.sets), h = bottom - y;
      const rr = Math.min(4, barW / 2, h);
      svg += `<path d="M${x.toFixed(2)},${bottom} L${x.toFixed(2)},${(y + rr).toFixed(2)} Q${x.toFixed(2)},${y.toFixed(2)} ${(x + rr).toFixed(2)},${y.toFixed(2)} L${(x + barW - rr).toFixed(2)},${y.toFixed(2)} Q${(x + barW).toFixed(2)},${y.toFixed(2)} ${(x + barW).toFixed(2)},${(y + rr).toFixed(2)} L${(x + barW).toFixed(2)},${bottom} Z" fill="${cBlue}"/>`;
    }
  });
  svg += `</svg>`;
  wrap.innerHTML = svg + `<div id="barTip" style="position:absolute;display:none;pointer-events:none;z-index:5"></div>`;

  const tip = wrap.querySelector("#barTip");
  const cursor = wrap.querySelector("#barCursor");
  wrap.onmousemove = (e) => {
    const r = wrap.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const i = Math.max(0, Math.min(n - 1, Math.floor((mx - left) / band)));
    cursor.setAttribute("x", (left + band * i).toFixed(2)); cursor.style.display = "";
    tip.innerHTML = tooltipHTML(data[i].w, "sets", data[i].sets, cBlue);
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(2, left + band * i + band / 2 + 10), W - tw - 2) + "px";
    tip.style.top = "8px";
  };
  wrap.onmouseleave = () => { tip.style.display = "none"; cursor.style.display = "none"; };
}

window.addEventListener("resize", drawCharts);

/* ═══════════════════════════ EVENTS ════════════════════════════════ */

const newBodyRow = () => ({ id: uid(), date: todayStr(), weight: "", waist: "", chest: "", arm: "", thigh: "", glutes: "", notes: "" });

function commitWorkout(draft) {
  /* only real, filled-in entries get logged — blank preset placeholders are
     dropped so they never pollute the history with empty rows. */
  const filled = draft.entries.filter(entryHasData).map(syncEntry);
  if (!filled.length) return;   // nothing to save yet — leave the sheet open
  if (draft.editing) {
    /* editing a logged day: replace that day's old rows with the current set,
       keeping each surviving row's original createdAt so ordering is stable. */
    const originalIds = new Set(draft.originalIds || []);
    const now = Date.now();
    const kept = state.log.filter((e) => !originalIds.has(e.id));
    const stamped = filled.map((e, i) => ({
      ...e, date: draft.date,
      createdAt: e.createdAt != null ? e.createdAt : now + i,
    }));
    ui.workoutSheet = null;
    patch({ log: [...kept, ...stamped] });
    return;
  }
  const stamped = filled.map((e, i) => ({ ...e, date: draft.date, createdAt: Date.now() + i }));
  ui.workoutSheet = null;
  patch({ log: [...state.log, ...stamped] });
}

const actions = {
  "nav": (el) => {
    const id = el.dataset.id;
    if (ui.tab === id) return;
    ui.tab = id;
    resetTransient();
    render();
  },
  "open-profile": () => { ui.profileDraft = { ...state.settings }; ui.showProfile = true; render(); },
  "close-profile": () => { ui.showProfile = false; ui.profileDraft = null; applyTheme(state.settings.theme); render(); },
  "save-profile": () => { const f = ui.profileDraft; ui.showProfile = false; ui.profileDraft = null; applyTheme(f.theme); patch({ settings: f }); },
  "profile-units": (el) => { ui.profileDraft.units = el.dataset.u; render(); },
  "profile-theme": (el) => { ui.profileDraft.theme = el.dataset.t; applyTheme(el.dataset.t); render(); },
  "profile-mode": (el) => { ui.profileDraft.loggingMode = el.dataset.m; render(); },
  "reset-all": () => {
    if (confirm("Reset ALL data, workouts, library changes, goals, measurements and settings? This cannot be undone.")) {
      ui.showProfile = false; ui.profileDraft = null;
      const fresh = defaultState();
      applyTheme(fresh.settings.theme);
      patch(fresh);
    }
  },
  "new-workout": () => { ui.tab = "log"; ui.logSeg = "history"; resetTransient(); ui.workoutSheet = { date: todayStr(), entries: [] }; render(); },
  "fab": () => {
    if (ui.tab === "log") ui.workoutSheet = { date: todayStr(), entries: [] };
    else { ui.bodyForm = newBodyRow(); ui.bodyFormWasNew = true; }
    render();
  },
  "toggle-deload": () => { ui.deloadOpen = !ui.deloadOpen; render(); },
  "toggle-accordion": (el) => {
    const id = el.dataset.id;
    ui.accordions[id] = !ui.accordions[id];
    /* animate the existing card in place — a full render() would rebuild the
       whole page and cause the flicker the user reported. */
    const card = el.closest(".pb-acc");
    if (card) setAccordion(card, ui.accordions[id]);
    else render();
  },
  "log-seg": (el) => {
    ui.logSeg = el.dataset.id;
    if (ui.logSeg === "volume") ui.volumeWeek = weekOf(todayStr(), state.settings.startDate);
    render();
  },
  "vol-prev": () => { ui.volumeWeek = Math.max(1, ui.volumeWeek - 1); render(); },
  "vol-next": () => { ui.volumeWeek = ui.volumeWeek + 1; render(); },
  "edit-vol-goal": (el) => {
    ui.volGoalEditing = el.dataset.g;
    ui.volGoalVal = state.volumeGoals[el.dataset.g] ?? "";
    render();
  },
  "save-vol-goal": (el) => {
    const g = el.dataset.g;
    const v = ui.volGoalVal === "" ? null : Math.max(0, Math.round(+ui.volGoalVal));
    const vg = { ...state.volumeGoals };
    if (v) vg[g] = v; else delete vg[g];   // 0, blank or garbage clears the target
    ui.volGoalEditing = null; ui.volGoalVal = "";
    patch({ volumeGoals: vg });
  },
  "edit-entry": (el) => {
    const e = state.log.find((x) => x.id === el.dataset.id);
    if (e) { ui.entryForm = { f: { ...e }, isDraft: false }; render(); }
  },
  "select-progress": (el) => { ui.progressSelected = el.dataset.name; render(); },
  "edit-goal": (el) => {
    const rows = dashboardRows(state.log, state.library, state.goals);
    const r = rows.find((x) => x.name === el.dataset.name);
    ui.goalEditing = el.dataset.name;
    ui.goalVal = r?.goal ?? "";
    render();
  },
  "save-goal": (el) => {
    const name = el.dataset.name;
    const v = ui.goalVal === "" ? null : +ui.goalVal;
    const g = { ...state.goals };
    if (v) g[name] = v; else delete g[name];
    ui.goalEditing = null; ui.goalVal = "";
    patch({ goals: g });
  },
  "lib-filter": (el) => { ui.libraryFilter = el.dataset.id; render(); },
  "add-exercise": () => {
    ui.exWinDraft = { id: uid(), name: "", muscle: "", type: "Compound", equipment: "", alternatives: "", note: "", image: "", video: "", custom: true };
    ui.exWin = { isNew: true }; ui.exWinEdit = true; ui.exWinNewGroup = false; render();
  },
  /* open the detail window (read-only) — every "info" button lands here.
     Exercises are keyed by name across the app, so we look up by name. */
  "open-exercise-window": (el) => {
    ui.exWin = { name: el.dataset.name };
    ui.exWinEdit = false; ui.exWinDraft = null; ui.exWinNewGroup = false; render();
  },
  "exwin-close": () => { ui.exWin = null; ui.exWinEdit = false; ui.exWinDraft = null; ui.exWinNewGroup = false; render(); },
  "exwin-edit": () => {
    const ex = state.library.find((x) => x.name === ui.exWin.name);
    if (!ex) return;
    ui.exWinDraft = { image: "", video: "", ...ex };
    ui.exWinEdit = true; ui.exWinNewGroup = false; render();
  },
  "exwin-cancel": () => {
    if (ui.exWin && ui.exWin.isNew) ui.exWin = null;
    ui.exWinEdit = false; ui.exWinDraft = null; ui.exWinNewGroup = false; render();
  },
  "exwin-remove-image": () => { if (ui.exWinDraft) { ui.exWinDraft.image = ""; render(); } },
  "exwin-save": () => {
    const f = ui.exWinDraft;
    if (!f || !(f.name.trim() && f.muscle.trim())) return;
    const ex = { ...f, name: f.name.trim(), muscle: f.muscle.trim() };
    const exists = state.library.some((x) => x.id === ex.id);
    ui.exWin = { name: ex.name }; ui.exWinEdit = false; ui.exWinDraft = null; ui.exWinNewGroup = false;
    patch({ library: exists ? state.library.map((x) => (x.id === ex.id ? ex : x)) : [...state.library, ex] });
  },
  "exwin-delete": () => {
    if (confirm("Delete this exercise from the library? Logged workouts keep their data.")) {
      const id = ui.exWinDraft && ui.exWinDraft.id;
      const name = ui.exWin && ui.exWin.name;
      ui.exWin = null; ui.exWinEdit = false; ui.exWinDraft = null; ui.exWinNewGroup = false;
      patch({ library: state.library.filter((x) => (id ? x.id !== id : x.name !== name)) });
    }
  },
  "close-worksheet": () => { ui.workoutSheet = null; ui.picking = false; ui.entryForm = null; ui.setForm = null; render(); },
  "commit-workout": () => commitWorkout(ui.workoutSheet),
  /* reopen a logged day in the full workout window so the whole session can be
     edited (fix a mistake, add/remove a lift, or save it as a preset). */
  "edit-day": (el) => {
    const date = el.dataset.date;
    const entries = state.log.filter((e) => e.date === date)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((e) => ({ ...e }));
    if (!entries.length) return;
    ui.workoutSheet = { date, entries, editing: true, originalIds: entries.map((e) => e.id) };
    ui.picking = false; ui.entryForm = null;
    render();
  },
  "delete-day": () => {
    const draft = ui.workoutSheet;
    if (!draft || !draft.editing) return;
    if (confirm("Delete this whole day and every exercise logged in it? This cannot be undone.")) {
      const ids = new Set(draft.originalIds || []);
      ui.workoutSheet = null;
      patch({ log: state.log.filter((e) => !ids.has(e.id)) });
    }
  },

  /* ── presets ──────────────────────────────────────────────────────── */
  "library-seg": (el) => { ui.librarySeg = el.dataset.id; render(); },
  "save-as-preset": () => {
    if (!ui.workoutSheet || !ui.workoutSheet.entries.length) return;
    ui.presetForm = { name: "", description: "" };
    render();
  },
  "commit-preset": () => {
    const f = ui.presetForm, draft = ui.workoutSheet;
    if (!f || !draft || !f.name.trim() || !draft.entries.length) return;
    const exercises = draft.entries.map((e) => ({
      exercise: e.exercise,
      muscle: e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, state.library, e.muscle),
      kind: e.kind || "strength",
    }));
    const preset = { id: uid(), name: f.name.trim(), description: (f.description || "").trim(), exercises, createdAt: Date.now() };
    ui.presetForm = null;
    patch({ presets: [...(state.presets || []), preset] });  // sheet closes back to the workout draft
  },
  "apply-preset": (el) => {
    const p = (state.presets || []).find((x) => x.id === el.dataset.id);
    if (!p || !ui.workoutSheet) return;
    ui.workoutSheet.entries = [...ui.workoutSheet.entries, ...presetToEntries(p)];
    ui.picking = false; ui.pickerQ = ""; ui.pickerQuick = null; ui.pickerSeg = "exercises";
    render();
  },
  "start-workout-from-preset": (el) => {
    const p = (state.presets || []).find((x) => x.id === el.dataset.id);
    if (!p) return;
    ui.tab = "log"; ui.logSeg = "history"; resetTransient();
    ui.workoutSheet = { date: todayStr(), entries: presetToEntries(p) };
    render();
  },
  "open-preset": (el) => {
    const p = (state.presets || []).find((x) => x.id === el.dataset.id);
    if (p) { ui.presetView = JSON.parse(JSON.stringify(p)); render(); }  // edit a working copy
  },
  "remove-preset-exercise": (el) => {
    if (!ui.presetView) return;
    ui.presetView.exercises.splice(+el.dataset.i, 1);
    render();
  },
  "save-preset-edits": () => {
    const p = ui.presetView;
    if (!p || !p.name.trim()) return;
    const np = { ...p, name: p.name.trim(), description: (p.description || "").trim() };
    ui.presetView = null;
    patch({ presets: (state.presets || []).map((x) => (x.id === np.id ? np : x)) });
  },
  "delete-preset": (el) => {
    if (confirm("Delete this preset? Your logged workouts are not affected.")) {
      const id = (el && el.dataset.id) || (ui.presetView && ui.presetView.id);
      ui.presetView = null;
      patch({ presets: (state.presets || []).filter((x) => x.id !== id) });
    }
  },
  "open-picker": () => { ui.picking = true; ui.pickerQ = ""; ui.pickerQuick = null; ui.pickerSeg = "exercises"; render(); },
  "close-picker": () => { ui.picking = false; ui.pickerQ = ""; ui.pickerQuick = null; render(); },
  "picker-seg": (el) => { ui.pickerSeg = el.dataset.id; if (el.dataset.id === "exercises") { ui.pickerQuick = null; } render(); },
  "quick-add-start": () => { ui.pickerQuick = { name: ui.pickerQ.trim(), muscle: "" }; render(); },
  "quick-add-muscle": (el) => {
    const g = el.dataset.g;
    const ex = { id: uid(), name: ui.pickerQuick.name, muscle: g, type: g === "Cardio" ? "Cardio" : "Compound", equipment: "", alternatives: "", note: "", custom: true };
    ui.picking = false; ui.pickerQ = ""; ui.pickerQuick = null;
    ui.entryForm = { f: newEntry(ex.name, ex.muscle, isCardioEx(ex) ? "cardio" : "strength"), isDraft: true };
    patch({ library: [...state.library, ex] });
  },
  "pick-exercise": (el) => {
    const ex = state.library.find((x) => x.id === el.dataset.id);
    if (!ex) return;
    ui.picking = false; ui.pickerQ = ""; ui.pickerQuick = null;
    ui.entryForm = { f: newEntry(ex.name, ex.muscle, isCardioEx(ex) ? "cardio" : "strength"), isDraft: true };
    render();
  },
  "edit-draft-entry": (el) => {
    const e = ui.workoutSheet.entries.find((x) => x.id === el.dataset.id);
    if (e) { ui.entryForm = { f: { ...e }, isDraft: true }; render(); }
  },
  "close-entry": () => {
    const { f, isDraft } = ui.entryForm;
    /* backing out of an exercise you've filled in but never added to the day
       throws real work away — in Detailed mode that can be a whole set list */
    const orphan = isDraft && entryHasData(f) && !ui.workoutSheet.entries.some((x) => x.id === f.id);
    if (orphan && !confirm("Discard this exercise? It hasn't been added to the workout yet.")) return;
    ui.entryForm = null; ui.setForm = null; render();
  },

  /* ── per-set logging (Detailed mode) ──────────────────────────────── */
  "add-set": () => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f || !isDetailed(f)) return;
    /* prefill from the previous set — most people repeat the weight and adjust */
    const prev = f.setList[f.setList.length - 1];
    ui.setForm = { s: newSet(prev ? prev.reps : "", prev ? prev.weight : "", prev ? prev.rpe : ""), isNew: true, index: f.setList.length };
    render();
  },
  "edit-set": (el) => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f || !isDetailed(f)) return;
    const i = f.setList.findIndex((x) => x.id === el.dataset.id);
    if (i < 0) return;
    ui.setForm = { s: { ...f.setList[i] }, isNew: false, index: i };
    render();
  },
  "save-set": () => {
    const form = ui.setForm, f = ui.entryForm && ui.entryForm.f;
    if (!form || !f || !setHasData(form.s)) return;
    const list = form.isNew
      ? [...f.setList, form.s]
      : f.setList.map((x) => (x.id === form.s.id ? form.s : x));
    ui.entryForm.f = syncEntry({ ...f, setList: list });
    ui.setForm = null;
    render();
  },
  "delete-set": () => {
    const form = ui.setForm, f = ui.entryForm && ui.entryForm.f;
    if (!form || !f) return;
    ui.entryForm.f = syncEntry({ ...f, setList: f.setList.filter((x) => x.id !== form.s.id) });
    ui.setForm = null;
    render();
  },
  "remove-set": (el) => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f || !isDetailed(f)) return;
    ui.entryForm.f = syncEntry({ ...f, setList: f.setList.filter((x) => x.id !== el.dataset.id) });
    render();
  },
  /* one-way, opt-in upgrade of an older single-top-set entry */
  "entry-to-detailed": () => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f || isDetailed(f) || f.kind === "cardio") return;
    const seed = +f.reps > 0 && +f.weight > 0 ? [newSet(f.reps, f.weight, f.rpe)] : [];
    ui.entryForm.f = syncEntry({ ...f, setList: seed });
    render();
  },

  /* ── timers ───────────────────────────────────────────────────────── */
  "quick-timer": (el) => {
    const secs = +el.dataset.s;
    const name = "Rest " + fmtClock(secs);
    let t = (state.timers || []).find((x) => x.duration === secs && x.name === name);
    if (!t) {
      t = { id: uid(), name, duration: secs, endsAt: null, remaining: null, doneAt: null, createdAt: Date.now() };
      state.timers = [...(state.timers || []), t];
    }
    startTimer(t);
  },
  "timer-add": () => { ui.timerForm = { t: { id: uid(), name: "", min: "", sec: "" }, isNew: true }; render(); },
  "timer-edit": (el) => {
    const t = (state.timers || []).find((x) => x.id === el.dataset.id);
    if (!t) return;
    ui.timerForm = { t: { id: t.id, name: t.name, min: Math.floor(t.duration / 60) || "", sec: t.duration % 60 || "" }, isNew: false };
    render();
  },
  "timer-preset": (el) => {
    if (!ui.timerForm) return;
    const s = +el.dataset.s;
    ui.timerForm.t.min = Math.floor(s / 60) || "";
    ui.timerForm.t.sec = s % 60 || "";
    render();
  },
  "timer-save": () => {
    const form = ui.timerForm;
    if (!form) return;
    const duration = Math.max(0, (+form.t.min || 0) * 60 + (+form.t.sec || 0));
    if (!duration) return;
    const name = (form.t.name || "").trim() || fmtClock(duration) + " timer";
    const existing = (state.timers || []).find((x) => x.id === form.t.id);
    /* editing the length of a running timer restarts it cleanly rather than
       leaving a countdown that no longer matches its own dial */
    const row = existing
      ? { ...existing, name, duration, endsAt: null, remaining: null, doneAt: null }
      : { id: form.t.id, name, duration, endsAt: null, remaining: null, doneAt: null, createdAt: Date.now() };
    ui.timerForm = null;
    patch({ timers: existing ? state.timers.map((x) => (x.id === row.id ? row : x)) : [...(state.timers || []), row] });
  },
  "timer-delete": () => {
    const form = ui.timerForm;
    if (!form || !confirm("Delete this timer?")) return;
    const id = form.t.id;
    ui.timerForm = null;
    if (ui.timerToast && ui.timerToast.id === id) ui.timerToast = null;
    patch({ timers: (state.timers || []).filter((x) => x.id !== id) });
  },
  "timer-start": (el) => {
    const t = (state.timers || []).find((x) => x.id === el.dataset.id);
    if (t) startTimer(t);
  },
  "timer-pause": (el) => {
    const t = (state.timers || []).find((x) => x.id === el.dataset.id);
    if (!t || !t.endsAt) return;
    t.remaining = Math.ceil(timerRemaining(t));
    t.endsAt = null;
    writeNow(); render();
  },
  "timer-reset": (el) => {
    const t = (state.timers || []).find((x) => x.id === el.dataset.id);
    if (!t) return;
    t.endsAt = null; t.remaining = null; t.doneAt = null;
    if (ui.timerToast && ui.timerToast.id === t.id) ui.timerToast = null;
    writeNow(); render();
  },
  "toast-dismiss": () => {
    const id = ui.timerToast && ui.timerToast.id;
    const t = (state.timers || []).find((x) => x.id === id);
    if (t) { t.doneAt = null; t.remaining = null; }
    ui.timerToast = null;
    writeNow(); render();
  },
  "toast-open": () => { ui.timerToast = null; ui.tab = "timer"; resetTransient(); render(); },
  "delete-entry-form": () => {
    const { f, isDraft } = ui.entryForm;
    if (isDraft) {
      ui.workoutSheet.entries = ui.workoutSheet.entries.filter((x) => x.id !== f.id);
      ui.entryForm = null; ui.setForm = null; render();
    } else if (confirm("Delete this entry?")) {
      ui.entryForm = null; ui.setForm = null;
      patch({ log: state.log.filter((e) => e.id !== f.id) });
    }
  },
  "save-entry-form": () => {
    const { isDraft } = ui.entryForm;
    /* drop half-typed placeholder sets and refresh the headline numbers before
       anything leaves the form */
    const f = syncEntry(isDetailed(ui.entryForm.f)
      ? { ...ui.entryForm.f, setList: filledSets(ui.entryForm.f) }
      : ui.entryForm.f);
    if (!entryHasData(f)) return;
    if (isDraft) {
      const exists = ui.workoutSheet.entries.some((x) => x.id === f.id);
      ui.workoutSheet.entries = exists
        ? ui.workoutSheet.entries.map((x) => (x.id === f.id ? f : x))
        : [...ui.workoutSheet.entries, f];
      ui.entryForm = null; ui.setForm = null; render();
    } else {
      ui.entryForm = null; ui.setForm = null;
      patch({ log: state.log.map((e) => (e.id === f.id ? f : e)) });
    }
  },
  "edit-body": (el) => {
    const r = state.body.find((x) => x.id === el.dataset.id);
    if (r) { ui.bodyForm = { ...r }; ui.bodyFormWasNew = r.weight === "" && r.waist === "" && r.notes === ""; render(); }
  },
  "save-body": () => {
    const row = ui.bodyForm;
    const exists = state.body.some((b) => b.id === row.id);
    ui.bodyForm = null;
    patch({ body: exists ? state.body.map((b) => (b.id === row.id ? row : b)) : [...state.body, row] });
  },
  "delete-body": () => {
    if (confirm("Delete this check-in?")) {
      const id = ui.bodyForm.id; ui.bodyForm = null;
      patch({ body: state.body.filter((b) => b.id !== id) });
    }
  },
  "overlay-close": (el) => {
    const t = el.dataset.target;
    if (t === "bodyForm") ui.bodyForm = null;
    else if (t === "presetForm") ui.presetForm = null;
    else if (t === "presetView") ui.presetView = null;
    else if (t === "setForm") ui.setForm = null;
    else if (t === "timerForm") ui.timerForm = null;
    render();
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  /* stopPropagation equivalent: if the click landed inside a [data-stopprop]
     element that sits BETWEEN the target and the resolved action element,
     the outer action must not fire (sheet backdrops, goal editor row). */
  const stop = e.target.closest("[data-stopprop]");
  if (stop && el !== stop && el.contains(stop)) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el, e);
});

function handleBind(el) {
  const bind = el.dataset.bind;
  if (!bind) return;
  const v = el.value;
  if (bind === "libq") {
    ui.libraryQ = v;
    const list = document.getElementById("libList");
    if (list) { list.innerHTML = renderLibraryList(state.library); if (window.lucide) lucide.createIcons(); }
  } else if (bind === "pickq") {
    ui.pickerQ = v;
    const list = document.getElementById("pickList");
    if (list) { list.innerHTML = renderPickerList(state.library); if (window.lucide) lucide.createIcons(); }
  } else if (bind === "goal") {
    ui.goalVal = v;
  } else if (bind === "volGoal") {
    ui.volGoalVal = v;
  } else if (bind === "preset.name") {
    ui.presetForm.name = v;
    const btn = document.getElementById("presetSaveBtn");
    if (btn) { const ok = !!(v.trim() && ui.workoutSheet && ui.workoutSheet.entries.length); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
  } else if (bind === "preset.description") {
    ui.presetForm.description = v;
  } else if (bind.startsWith("presetView.")) {
    ui.presetView[bind.slice(11)] = v;
  } else if (bind === "draft.date") {
    ui.workoutSheet.date = v; render();
  } else if (bind === "progressSel") {
    ui.progressSelected = v; render();
  } else if (bind === "exwinMuscle") {
    if (v === "__new") { ui.exWinNewGroup = true; ui.exWinDraft.muscle = ""; render(); }
    else { ui.exWinDraft.muscle = v; render(); }
  } else if (bind === "entryUnit") {
    /* the unit belongs to the whole exercise, so it can be changed from the
       entry form or from any of its set editors. A discrete tap, not typing —
       a full render keeps the set list, the 1RM card and the workout card
       behind it all speaking the same unit. */
    if (ui.entryForm) { ui.entryForm.f.unit = v; render(); }
  } else if (bind.startsWith("entry.")) {
    ui.entryForm.f[bind.slice(6)] = v; updateEntryPreview();
  } else if (bind.startsWith("set.")) {
    ui.setForm.s[bind.slice(4)] = v; updateSetPreview();
  } else if (bind.startsWith("timer.")) {
    ui.timerForm.t[bind.slice(6)] = v; updateTimerPreview();
  } else if (bind.startsWith("exwin.")) {
    ui.exWinDraft[bind.slice(6)] = v;
    const btn = document.getElementById("exwinSaveBtn");
    if (btn) { const ok = ui.exWinDraft.name.trim() && ui.exWinDraft.muscle.trim(); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
  } else if (bind.startsWith("body.")) {
    ui.bodyForm[bind.slice(5)] = v;
  } else if (bind.startsWith("profile.")) {
    ui.profileDraft[bind.slice(8)] = v;
  }
  /* every field is a checkpoint — nothing typed is ever only in memory */
  persist();
}

document.addEventListener("input", (e) => {
  if (e.target.matches("select")) return; // selects handled on change
  handleBind(e.target);
});
document.addEventListener("change", (e) => {
  if (e.target.matches('input[type="file"]')) { handleFile(e.target); return; }
  if (e.target.matches("select, input[type=date]")) handleBind(e.target);
});

/* file uploads (exercise photo) — read, downscale, stash on the draft, redraw */
function handleFile(el) {
  const file = el.files && el.files[0];
  if (!file) return;
  if (el.dataset.filebind === "exwin.image" && ui.exWinDraft) {
    readImageScaled(file, (dataUrl) => { ui.exWinDraft.image = dataUrl; render(); });
  }
  el.value = ""; // let the same file be re-picked later
}

/* Lock zoom on mobile. iOS Safari ignores user-scalable=no in the viewport tag,
   but it does honour a prevented pinch gesture, so block those explicitly.
   (Double-tap zoom is killed by touch-action:manipulation in the CSS.) */
["gesturestart", "gesturechange", "gestureend"].forEach((evt) =>
  document.addEventListener(evt, (e) => e.preventDefault(), { passive: false }));

/* ─────────────────────── ORIENTATION: PORTRAIT ─────────────────────────
   Best effort at a real lock, in order of how well it actually works:

   1. manifest.webmanifest declares "orientation": "portrait". Install the app
      to the home screen on Android and the OS genuinely refuses to rotate it —
      this is the only true lock a web app can get, and it needs no code.
   2. The Screen Orientation API below. Chrome/Android honours it once the
      document is fullscreen; everywhere else it throws and we move on.
   3. iOS Safari supports neither, for any web page, installed or not. There
      the portrait notice in styles.css remains the fallback.               */
function lockPortrait() {
  try {
    const so = screen.orientation;
    if (so && so.lock) so.lock("portrait").catch(() => { /* not permitted here */ });
  } catch { /* API absent */ }
}
lockPortrait();
/* the lock is only granted from a user gesture on some builds, so retry once */
window.addEventListener("click", function once() {
  window.removeEventListener("click", once);
  lockPortrait();
}, { once: true });

/* ─────────────────────────────── GO ────────────────────────────────── */

/* Put back whatever was half-finished when the app last went away — the open
   workout, the exercise you were mid-way through, even the set editor. */
(function restoreDrafts() {
  const d = state.drafts || {};
  if (d.workout) ui.workoutSheet = d.workout;
  if (d.entry) ui.entryForm = d.entry;
  if (d.set && ui.entryForm) ui.setForm = d.set;
  if (d.body) { ui.bodyForm = d.body; ui.bodyFormWasNew = !!d.bodyWasNew; }
  if (ui.workoutSheet || ui.entryForm) ui.tab = "log";
  else if (ui.bodyForm) ui.tab = "body";
})();

applyTheme(state.settings.theme);
sweepTimers();          // anything that ran out while the app was closed
render();
startTimerEngine();
