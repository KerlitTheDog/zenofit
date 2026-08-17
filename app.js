/* ═══════════════════════════════════════════════════════════════════════════
   POWERBUILD TRACKER — mobile prototype (vanilla HTML/CSS/JS port)
   Faithful port of "AbsoluteMain.xlsx" (Powerbuilding Progressive Overload
   Tracker). All spreadsheet formulas are reimplemented in the helpers below.

   ┌─────────────────────── PLACEHOLDER INDEX ───────────────────────────┐
   │ Search for these tokens to swap in real assets later:               │
   │                                                                     │
   │ 1. PLACEHOLDER_BODY_GRAPH_SLOT  — future measurement graphs, Body   │
   │    tab bottom                                                       │
   │ 2. PLACEHOLDER_RANKS_SLOT       — future ranks & strength standards,│
   │    the second segment of the Progress tab                           │
   │                                                                     │
   │ Done: the Home logo and the tab-header brand mark now use           │
   │ logoC.png; the reserved Home banner slot was removed (the deload    │
   │ alert is the only banner that renders there); the Profile's         │
   │ Program Planner slot is gone (the deload calendar in Weekly Volume  │
   │ covers the part that matters).                                      │
   └─────────────────────────────────────────────────────────────────────┘

   Spreadsheet → code map:
   · Week number        = MAX(1, INT((date-start)/7)+1)        → weekOf()
   · Muscle group       = INDEX/MATCH on Exercise Library      → muscleOf()
   · Est. 1RM           = was ROUND(weight*(1+reps/30),1);     → est1RM()
                          now Wathan anchored at one rep, see the
                          comment over rmCurve() for why it changed
   · Cardio equivalent  = minutes × RPE (session-RPE load)     → cardioScore()
   · "vs. Your Best"    = compare vs earlier rows, same lift   → computeBadges()
   · Dashboard row      = MAXIFS / COUNTIF / MAXIFS(date)      → dashboardRows()
   · Weekly volume      = SUMIFS(sets, week, muscle)           → volumeForWeek()
   · Deload             = planned by hand, not inferred        → deloadStatus()
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

/* ───────────────────────── MUSCLE GROUPS ────────────────────────────
   The seven groups below are only the SEEDS. Every group the app knows
   about lives in `state.groups` as {name, color}, which the user can
   recolour, rename or extend from the Library (the ＋ chip next to the
   last category) and from the muscle picker inside a workout. Colours
   are read back through colorFor(), so a recoloured group repaints
   everywhere at once: library sections, the stripe down the left of each
   logged exercise, volume bars, preset dots, progress dots.          */

/* `key` marks a group the app shipped: it's what lets the NAME be shown in
   the user's language while the stored name — which every exercise, preset
   and weekly target points at — stays fixed. Rename one and the key drops,
   because it's their word now, not ours. */
const DEFAULT_GROUPS = [
  { name: "Chest", key: "Chest", color: "#d05a50" }, { name: "Back", key: "Back", color: "#5d8bcc" },
  { name: "Shoulders", key: "Shoulders", color: "#e9b949" }, { name: "Arms", key: "Arms", color: "#6aa465" },
  { name: "Legs", key: "Legs", color: "#aab4c0" }, { name: "Core", key: "Core", color: "#8fa39a" },
  { name: "Cardio", key: "Cardio", color: "#a07ec2" },
];
/* fallback ring for a muscle that somehow isn't a registered group */
const EXTRA_COLORS = ["#c98f5a", "#7ea0b8", "#b0a06a", "#9a8fb8"];
/* the palette offered when picking a group colour (a custom one is also allowed) */
const GROUP_SWATCHES = [
  "#d05a50", "#c98f5a", "#e9b949", "#b0a06a", "#6aa465", "#8fa39a",
  "#5d8bcc", "#7ea0b8", "#a07ec2", "#9a8fb8", "#aab4c0", "#8a8f97",
];

/* ── THE UNCATEGORIZED BUCKET ──────────────────────────────────────────
   Deleting a group used to be blocked while anything was still in it,
   which made a group you'd outgrown permanent. Now its exercises are
   tipped into "Uncategorized" instead.

   It is not a group the user owns: it is never in state.groups, never
   offered as something to pick, never listed in the group manager, never
   a filter chip, and it can't be renamed, recoloured or deleted. It only
   ever appears as the last section of the library, holding the exercises
   that are waiting to be re-filed. Give one of them a real group and the
   bucket empties itself out of existence. */
const UNCATEGORIZED = "Uncategorized";
const UNCAT_COLOR = "#6f747c";

const groupList = () =>
  (state && Array.isArray(state.groups) && state.groups.length ? state.groups : DEFAULT_GROUPS)
    .filter((g) => g.name !== UNCATEGORIZED);
const groupNames = () => groupList().map((g) => g.name);
const groupColor = (name) => {
  if (name === UNCATEGORIZED) return UNCAT_COLOR;
  const g = groupList().find((x) => x.name === name);
  return g ? g.color : null;
};
const colorFor = (muscle, i = 0) =>
  groupColor(muscle) || EXTRA_COLORS[i % EXTRA_COLORS.length];

/* ═══════════════════ NAMES: STORED vs SHOWN ═══════════════════════════
   Everything the app stores is keyed by its English name — an entry points
   at "Bench Press (Barbell)", a goal is filed under it, an exercise sits in
   the group "Chest". Those strings are identity and are never rewritten,
   or switching language would orphan every workout on record.

   These helpers are the display layer. Each asks one question: did the APP
   choose this name, or did the USER? Ours gets translated, theirs is shown
   back exactly as typed.                                                */

const langCode = () => (state && state.settings && state.settings.lang) || "en";

/* id → position in DEFAULT_LIBRARY, which is the row the EX arrays line up with */
const DEFAULT_INDEX = Object.fromEntries(DEFAULT_LIBRARY.map((d, i) => [d.id, i]));
const exRow = (ex) => {
  const i = ex && !ex.custom ? DEFAULT_INDEX[ex.id] : undefined;
  const table = EX[langCode()];
  return i != null && table ? table[i] : null;
};

/* a muscle group's label — built-ins carry a `key`, renamed ones don't */
function groupLabel(name) {
  if (name === UNCATEGORIZED) return T("group.Uncategorized");
  const g = ((state && state.groups) || DEFAULT_GROUPS).find((x) => x.name === name);
  return g && g.key ? T("group." + g.key) : name;
}

function exLabelOf(ex) {
  const row = exRow(ex);
  return row ? row[0] : (ex ? ex.name : "");
}

/* an exercise's label, looked up from the log by its stored name */
function exLabel(name) {
  const ex = ((state && state.library) || []).find((x) => x.name === name);
  return ex ? exLabelOf(ex) : name;
}

/* …and the prose fields, which the user may have overwritten */
function exFieldOf(ex, field) {
  const own = ex ? ex[field] : "";
  const row = exRow(ex);
  if (!row) return own;
  const i = DEFAULT_INDEX[ex.id];
  const col = { equipment: 1, alternatives: 2, note: 3 }[field];
  /* a built-in the user edited is theirs now, so leave it alone */
  return own === DEFAULT_LIBRARY[i][field] ? row[col] : own;
}

/* a timer the app seeded keeps a key so "Rest 1:00" can speak Swedish;
   the moment the user renames it, the key is dropped and this returns theirs */
const timerLabel = (t) => (t && t.key === "rest" ? `${T("timer.rest")} ${fmtClock(t.duration)}` : (t ? t.name : ""));

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

/* ── EST. 1RM: WATHAN'S CURVE, ANCHORED AT ONE REP ────────────────────
   The spreadsheet estimated a max with Epley, weight × (1 + reps/30), and
   Epley has a flaw you can see with your own eyes: one rep at 30 kg comes
   back as a 31 kg max. It is a straight line fitted to multi-rep sets, so
   it never passes through the one point every lifter can verify — the set
   they just did FOR a single IS their max that day, not 3.3% under it.

   The replacement is Wathan's equation, which LeSuer et al. (1997) found
   the most accurate of the published estimates across bench, squat and
   deadlift:  1RM = 100·w / (48.8 + 53.4·e^(−0.075·reps)).

   Wathan still reads a single as 98.3% of the max, so it is divided by its
   own one-rep value. That pins reps = 1 to exactly the weight lifted and
   leaves the shape of the curve untouched everywhere else:

       1RM = weight ÷ rmCurve(reps)
       rmCurve(reps) = (48.8 + 53.4·e^(−0.075·reps)) ÷ (48.8 + 53.4·e^(−0.075))

   Scored against the NSCA rep-max table and the RTS/RPE-10 chart over reps
   1–12, this beat every other candidate (mean error 0.7% of the max, vs
   1.2% Brzycki, 1.3% Epley, 3.0% Lombardi, 3.3% Mayhew, 3.4% O'Conner) and
   it is exact at one rep. It also stays sane past 30 reps, where Brzycki
   and Lander run through zero into negative weights.

   rmCurve(reps) doubles as the calculator's percentage table: it is what
   one working set is worth as a share of the max. calcReps(pct) is that
   curve inverted — how many reps a percentage is good for. It floors,
   because a table that rounds a percentage UP to a rep you can't finish is
   the one way a chart like this can hurt you.                            */
const RM_A = 48.8, RM_B = 53.4, RM_K = 0.075;
const RM_ONE = RM_A + RM_B * Math.exp(-RM_K);        // the raw curve at 1 rep

/* what a set of `reps` is worth as a fraction of the max (1.0 at one rep) */
const rmCurve = (reps) => (RM_A + RM_B * Math.exp(-RM_K * reps)) / RM_ONE;

const est1RM = (weight, reps) =>
  weight > 0 && reps > 0 ? Math.round((weight / rmCurve(reps)) * 10) / 10 : null;

const calcPct = (reps) => rmCurve(reps);

/* The curve flattens onto an asymptote at 48.8/RM_ONE ≈ 49.6% of the max,
   so percentages at or under that have no honest rep answer at all — they
   come back as Infinity and the table prints them as "off the scale"
   rather than inventing a number. */
const calcReps = (pct) => {
  const x = (pct * RM_ONE - RM_A) / RM_B;
  return x > 0 ? Math.floor(-Math.log(x) / RM_K) : Infinity;
};

/* one decimal, no dangling ".0" — 133.3 kg, but 120 kg */
const trimNum = (n) => String(Math.round(n * 10) / 10);

/* Cardio "1RM equivalent": session-RPE load (Foster) = minutes × RPE */
const cardioScore = (minutes, intensity) =>
  minutes > 0 && intensity > 0 ? Math.round(minutes * intensity) : null;

/* Whether a lift is logged in minutes × RPE rather than sets × weight. The
   Cardio muscle group is what says so; `type` is only still consulted because
   exercises created before the compound/isolation/cardio picker was dropped
   may carry "Cardio" there and nothing else. */
const isCardioEx = (ex) => ex && (ex.type === "Cardio" || ex.muscle === "Cardio");

/* …and the same question asked of a group name, for a record being saved */
const cardioType = (muscle) => (muscle === "Cardio" ? "Cardio" : "");

/* Dates follow the app's language, not the device's: someone reading the app
   in Svenska on an English phone should get "24 aug", not "Aug 24". */
const fmtDate = (s, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  s ? parseDay(s).toLocaleDateString(localeTag(), opts) : "—";
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
  e.kind === "cardio" ? cardioScore(+e.minutes, +e.intensity) : est1RM(baseWeight(e), +e.reps);

/* ─────────────────────── PER-SET LOGGING ────────────────────────────
   Every new entry carries a `setList`: one row per set, each with its own
   reps / weight / RPE. It is the only way the app logs now.

   A handful of entries on record predate that — they were logged as a
   total-set count plus the numbers of one top set, and they have no
   setList. They are left exactly as they were rather than rewritten
   (guessing four sets out of one would invent history), so `isDetailed`
   still asks the question and the entry form still offers to convert one
   on demand.

   Either shape keeps the same four headline fields filled in (sets / reps
   / weight / rpe). For an entry with a set list those are DERIVED from its
   best set, the one with the highest estimated 1RM, which is what lets
   weekly volume, PR badges, the dashboard and the charts all keep reading
   the fields they always read. Nothing is ever thrown away — the setList
   stays on the entry. */

const newSet = (reps = "", weight = "", rpe = "") => ({ id: uid(), reps, weight, rpe });
const isDetailed = (e) => Array.isArray(e && e.setList);
const setHasData = (s) => +s.reps > 0 && +s.weight > 0;
const filledSets = (e) => (e.setList || []).filter(setHasData);

/* The set with the highest estimated 1RM — the one that speaks for the whole
   exercise everywhere the app shows a single number. */
function bestSet(list) {
  let best = null, bestM = -Infinity;
  for (const s of list || []) {
    const m = est1RM(+s.weight, +s.reps);
    if (m != null && m > bestM) { bestM = m; best = s; }
  }
  return best;
}

/* Refresh an entry's headline fields from its sets. Call this after any
   change to setList. No-op for cardio and for legacy top-set entries. */
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
  get first() { return T("badge.first"); }, get pr() { return T("badge.pr"); },
  get match() { return T("badge.match"); }, get below() { return T("badge.below"); },
};
const BADGE_SHORT = {
  get first() { return T("badge.firstShort"); }, get pr() { return T("badge.prShort"); },
  get match() { return T("badge.matchShort"); }, below: "",
};

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

/* ── DELOADS: PLANNED, NOT GUESSED ────────────────────────────────────
   The app used to infer a deload was due by watching for five hard weeks
   in a row. It was guessing at something only the lifter knows — a light
   week can be a planned taper, a holiday, or flu — so now the deload is
   something you PUT IN THE CALENDAR: pick a start day and an end day and
   the app counts you down to it.

   A deload is stored as {id, start, end} with inclusive ISO dates, kept
   sorted by start. Days inside one are marked out on the calendar, and
   the home banner appears once the start is within DELOAD_HEADSUP days
   and stays up until the last day is behind you. */

const DELOAD_HEADSUP = 7;   // days of warning before a planned deload starts

const deloadsSorted = (list) => [...(list || [])].sort((a, b) => (a.start < b.start ? -1 : 1));

const inDeload = (d, dayStr) => !!d && dayStr >= d.start && dayStr <= d.end;
const deloadOn = (list, dayStr) => (list || []).find((d) => inDeload(d, dayStr)) || null;
const deloadLength = (d) => (d ? daysBetween(d.start, d.end) + 1 : 0);

/* What, if anything, the home screen should be saying about a deload today. */
function deloadStatus(list, today = todayStr()) {
  const all = deloadsSorted(list);
  const active = all.find((d) => inDeload(d, today));
  if (active) {
    return {
      phase: "active", d: active,
      day: daysBetween(active.start, today) + 1,
      total: deloadLength(active),
      left: daysBetween(today, active.end),
    };
  }
  const next = all.find((d) => d.start > today);
  if (next) {
    const away = daysBetween(today, next.start);
    if (away <= DELOAD_HEADSUP) return { phase: "soon", d: next, away };
  }
  return null;
}

/* ── CALENDAR ARITHMETIC ──────────────────────────────────────────────
   Everything is done on ISO "YYYY-MM-DD" strings, which sort and compare
   as plain text, and on local Date objects built from local parts, which
   never trip over a daylight-saving shift the way UTC maths can. */

const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const monthOf = (dayStr) => String(dayStr).slice(0, 7);          // "2026-08"

function addMonths(monthStr, n) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* The days a program week covers, so the calendar can shade the week whose
   numbers are on screen. Week 1 starts on the program's start date. */
function weekRange(week, startStr) {
  const s = parseDay(startStr);
  const from = new Date(s.getFullYear(), s.getMonth(), s.getDate() + (week - 1) * 7);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
  return { from: isoOf(from), to: isoOf(to) };
}

/* The 6×7 block of days a month grid draws, Monday-first, including the
   leading and trailing days of the neighbouring months that fill it out. */
function monthGrid(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;   // Sunday(0) → 6, Monday(1) → 0
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(y, m - 1, 1 - lead + i);
    return { iso: isoOf(d), day: d.getDate(), inMonth: d.getMonth() === m - 1 };
  });
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

/* The timers the app ships with. They used to be the hard-coded "Quick start"
   chips at the top of the Timer tab; they're now ordinary saved timers, so they
   can be renamed, re-timed, pinned or deleted like any other. */
const SEED_TIMERS = [30, 60, 90, 120, 180, 300];

/* What a timer alerts with, until the user says otherwise. The sounds
   themselves are SOUND_LIB, further down with the rest of the timer
   engine; these two live here because seedTimers() below runs while the
   app is still loading and needs them. */
const DEFAULT_SOUND = "chime";
const DEFAULT_VOLUME = 0.8;

/* `key: "rest"` marks a name the app chose rather than the user, so it can
   be shown translated. Renaming the timer drops the key — see timer-save. */
const seedTimers = () =>
  SEED_TIMERS.map((secs, i) => ({
    id: "seed-timer-" + secs, name: "Rest " + fmtClock(secs), key: "rest", duration: secs,
    endsAt: null, remaining: null, doneAt: null, pinned: i < 3, createdAt: Date.now() + i,
    sound: DEFAULT_SOUND, volume: DEFAULT_VOLUME,
  }));

const defaultState = () => ({
  version: 8,
  settings: { name: "", units: "kg", startDate: todayStr(), daysPerWeek: 4, theme: "dark", lang: "en" },
  library: DEFAULT_LIBRARY,
  groups: DEFAULT_GROUPS.map((g) => ({ ...g })),   // [{name,key?,color}] — user-editable
  log: [],        // {id,date,exercise,muscle,kind,sets,reps,weight,rpe,unit,minutes,intensity,notes,createdAt,setList?}
  body: [],       // {id,date,weight,waist,chest,arm,thigh,glutes,notes}
  goals: {},      // { [exerciseName]: number }
  volumeGoals: {},// { [muscleGroup]: targetSetsPerWeek } — user's own weekly set target
  presets: [],    // [{id,name,description,pinned,exercises:[{exercise,muscle,kind}],createdAt}]
  timers: seedTimers(), // [{id,name,duration,endsAt,remaining,doneAt,pinned,createdAt}]
  dayDrafts: [],  // [{id,date,entries,savedAt}] — workout days you backed out of, see closeWorksheet()
  deloads: [],    // [{id,start,end}] — planned easy weeks, inclusive ISO dates
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
    /* v3 added per-set logging, the Timer tab and crash-proof drafts.
       Existing logs have no setList, so they stay top-set entries and keep
       rendering exactly as before. */
    if (!s.settings) s.settings = {};
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
  if (v < 5) {
    /* v5 is the "one mode, one timer list" release:
       · FSBS is gone — the app always logs set by set now. Entries already on
         record keep their shape (an old top-set row has no setList and still
         renders as one), so no history is rewritten; only the setting goes.
       · Muscle groups became real, editable records instead of a hard-coded
         colour map. Seed them from the defaults plus anything the user's own
         library invented, so nothing loses its colour.
       · The Quick-start chips became ordinary saved timers.
       · Workout days you back out of are kept as drafts. */
    if (!s.settings) s.settings = {};
    delete s.settings.loggingMode;
    if (!Array.isArray(s.groups) || !s.groups.length) s.groups = DEFAULT_GROUPS.map((g) => ({ ...g }));
    /* Any group the user invented before groups were records of their own is
       registered here, keeping the colour it was already being drawn with. */
    const known = new Set([...s.groups.map((g) => g.name), UNCATEGORIZED]);
    let extra = 0;
    for (const ex of s.library || []) {
      if (ex.muscle && !known.has(ex.muscle)) {
        known.add(ex.muscle);
        s.groups.push({ name: ex.muscle, color: EXTRA_COLORS[extra++ % EXTRA_COLORS.length] });
      }
    }
    if (!Array.isArray(s.timers)) s.timers = [];
    /* keep the user's own timers, add any seed length they don't already have */
    const haveDur = new Set(s.timers.map((t) => t.duration));
    for (const t of seedTimers()) if (!haveDur.has(t.duration)) s.timers.push(t);
    s.timers = s.timers.map((t) => ({ pinned: false, ...t }));
    if (!Array.isArray(s.dayDrafts)) s.dayDrafts = [];
    s.presets = (s.presets || []).map((p) => ({ pinned: false, ...p }));
    s.version = 5;
  }
  if (v < 6) {
    /* v6 adds the interface language and hands deloads to the user: the old
       radar guessed one was due from five hard weeks, this one only ever
       tells you about a period you put in the calendar yourself. There's
       nothing to convert — a guess isn't data — so planned deloads start
       empty.

       It also stamps a `key` on the records the app itself named, which is
       what lets those names be translated while the stored name (which
       every exercise and target points at) stays exactly where it was. */
    if (!s.settings) s.settings = {};
    if (!s.settings.lang) s.settings.lang = "en";
    if (!Array.isArray(s.deloads)) s.deloads = [];
    const seeded = new Set(DEFAULT_GROUPS.map((g) => g.name));
    s.groups = (s.groups || []).map((g) => (seeded.has(g.name) && !g.key ? { ...g, key: g.name } : g));
    s.timers = (s.timers || []).map((t) =>
      String(t.id).startsWith("seed-timer-") && !t.key ? { ...t, key: "rest" } : t);
    s.version = 6;
  }
  if (v < 7) {
    /* v7 dropped Russian. Anyone saved on a language the app no longer
       ships is moved to English rather than left staring at raw keys. */
    if (!s.settings) s.settings = {};
    s.settings.lang = resolveLang(s.settings.lang);
    s.version = 7;
  }
  if (v < 8) {
    /* v8 gave every timer its own alert: a sound and a volume. Timers that
       predate it keep doing exactly what they did before — the default is
       the chime that used to be the only option. */
    s.timers = (s.timers || []).map((t) => ({ sound: DEFAULT_SOUND, volume: DEFAULT_VOLUME, ...t }));
    s.version = 8;
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
  profileLangWas: null,   // the saved language, so a previewed one can be backed out of
  showBody: false,      // Body measurements — a window off the header, not a tab
  groupSheet: false,    // the "muscle groups" manager
  groupForm: null,      // {name, color, orig, then} — add/edit one group
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
  bodyForm: null,
  bodyFormWasNew: false,
  deloadOpen: false,
  calMonth: null,       // "YYYY-MM" the volume calendar is showing
  deloadPick: null,     // {start} while tapping out a new deload's two ends
  deloadForm: null,     // {id, start, end, isNew} — the deload editor
  accordions: {},   // all accordions start collapsed
  volumeWeek: null,
  progSeg: "progress",  // progress | placeholder — Progress sub-tab
  progressSelected: null,
  /* the progress graph is an instrument, not a picture: chartView is the
     slice of the series on screen (float index bounds), chartSel the entry
     whose dot is open, chartFull which graph has taken over the screen.
     There are two graphs — "main" on the Progress tab and "ex" inside the
     exercise window — and each keeps its own zoom and its own selection. */
  chartView: { main: null, ex: null },   // {lo, hi} — null means "the whole series"
  chartSel: { main: null, ex: null },    // id of the logged entry behind the selected dot
  chartFull: null,      // "main" | "ex" | null
  calc: { weight: "", reps: "", unit: null },  // the 1RM calculator's fields
  calcResult: null,     // {weight, reps, oneRM, unit} — the last calculation
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
  ui.deloadPick = null;
  ui.calMonth = monthOf(todayStr());
  ui.accordions = {};
  ui.progSeg = "progress";
  ui.progressSelected = null;
  ui.chartView = { main: null, ex: null }; ui.chartSel = { main: null, ex: null }; ui.chartFull = null;
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

/* ── NUMBER FIELDS: comma or period, same number ──────────────────────
   Half the world types 82,5 and half types 82.5, and a phone keypad hands
   you whichever one its locale feels like. <input type="number"> silently
   throws away the value when it sees the "wrong" separator, so every number
   field in the app is a plain text field with a decimal keypad instead:
   NUM below stamps that plus `data-num`, which tells handleBind() to strip
   anything that isn't a digit or a separator and to store the value with a
   period. What you see stays exactly what you typed; everything downstream
   (est. 1RM, volume, PRs, goals, graphs) reads one canonical form.     */

const NUM = 'type="text" inputmode="decimal" autocomplete="off" data-num';
const EM_DASH = "—";

/* the stored form of a typed number: 82,5 → 82.5 */
const decimalize = (v) => String(v ?? "").replace(/,/g, ".");

const icon = (name, size = 16, extra = "") =>
  `<i data-lucide="${name}" width="${size}" height="${size}" ${extra}></i>`;

const chip = (children, color, style = "") =>
  `<span class="pb-chip" style="color:${color || "var(--muted)"};border-color:${(color || "var(--border)")}55;background:${(color || "#000")}14;${style}">${children}</span>`;

const sectionTitle = (children, right = "") =>
  `<div style="display:flex;align-items:baseline;justify-content:space-between;margin:2px 2px 10px"><div class="pb-label">${children}</div>${right}</div>`;

const placeholder = (token, height, children = "") =>
  `<div class="pb-placeholder" style="height:${height}px"><div style="padding:8px">${children || token}<div style="font-size:9px;margin-top:2px;opacity:.7">${children ? token : "swap me in code"}</div></div></div>`;

/* The unit dropdown that lives inside a weight field's label — tap "kg" and
   pick whatever the machine in front of you is stamped in. The calculator
   has one of its own, so the binding is a parameter. */
const unitSelect = (value, bind = "entryUnit") =>
  `<select class="pb-unit-select" data-bind="${bind}" aria-label="${T("profile.unit")}">${
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

/* Chart data captured during render, drawn after mount. `line` is the
   Progress tab's graph, `exLine` the copy inside the exercise window; they
   are separate so one can be open on top of the other without either one
   redrawing itself with the other's lift. */
let chartState = { line: null, exLine: null, bar: null };

/* the series a given graph is showing, by scope */
const lineOf = (scope) => (scope === "ex" ? chartState.exLine : chartState.line);

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
  if (ui.volumeWeek == null) ui.volumeWeek = currentWeek;
  chartState = { line: null, exLine: null, bar: null };

  const tab = ui.tab;
  const titles = { log: T("title.log"), progress: T("title.progress"), library: T("title.library"), timer: T("title.timers"), calc: T("title.calc") };

  /* the frame is locked to exactly one viewport height (100dvh tracks mobile
     browser chrome) so the content area scrolls internally and the bottom nav
     is always visible without scrolling the page */
  let html = `<div style="height:100vh;height:100dvh;background:var(--outer);display:flex;justify-content:center;overflow:hidden">
  <div class="pb-root" style="width:100%;max-width:412px;height:100%;position:relative;display:flex;flex-direction:column;border-left:1px solid var(--border-soft);border-right:1px solid var(--border-soft)">`;

  /* header (non-home tabs) */
  if (tab !== "home") {
    html += `<div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--border-soft)">
      <img src="logoC.png" alt="${T("a11y.logo")}" width="30" height="30" style="width:30px;height:30px;object-fit:contain;border-radius:8px;display:block;flex-shrink:0">
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${titles[tab]}</div>
      ${chip(T("common.wkShort", { n: currentWeek }), "var(--gold)")}
      <button data-action="open-body" title="${T("a11y.bodyBtn")}" style="color:var(--muted);padding:4px">${icon("ruler", 20)}</button>
      <button data-action="open-profile" style="color:var(--muted);padding:4px">${icon("settings", 20)}</button>
    </div>`;
  }

  /* content */
  html += `<div class="pb-scroll" data-scrollkey="main-${tab}" style="flex:1;min-height:0;overflow-y:auto;padding-bottom:120px">`;
  if (tab === "home") html += renderHome(settings, currentWeek, unit);
  if (tab === "log") html += renderLog(log, library, badges, settings, unit, currentWeek);
  if (tab === "progress") html += renderProgress(log, library, goals, badges, settings, unit);
  if (tab === "library") html += renderLibrary(library);
  if (tab === "timer") html += renderTimers();
  if (tab === "calc") html += renderCalc();
  html += `</div>`;

  /* "time's up" banner — floats above the nav on whatever tab you're on, so a
     rest timer finishing while you're logging a set still gets your attention */
  if (ui.timerToast) {
    html += `<div class="pb-sheet" style="position:absolute;left:12px;right:12px;bottom:86px;z-index:40">
      <div class="pb-card pb-timer-done" style="display:flex;align-items:center;gap:11px;padding:13px 14px;border-color:rgba(233,185,73,.55);background:var(--surface)">
        ${icon("bell-ring", 20, 'style="color:var(--gold);flex-shrink:0"')}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;color:var(--gold)">${T("timers.timesUp")}</div>
          <div style="font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ui.timerToast.name)}</div>
        </div>
        <button data-action="toast-open" class="pb-btn pb-ghost" style="padding:7px 12px;font-size:12.5px">${T("common.open")}</button>
        <button data-action="toast-dismiss" style="color:var(--muted);padding:6px">${icon("x", 18)}</button>
      </div>
    </div>`;
  }

  /* FAB — always-visible overlay on Log */
  if (tab === "log" && !ui.workoutSheet) {
    html += `<button data-action="fab" class="pb-btn pb-gold" style="position:absolute;right:18px;bottom:92px;width:56px;height:56px;border-radius:18px;box-shadow:0 8px 22px rgba(233,185,73,.35);z-index:30">${icon("plus", 26, 'stroke-width="2.6"')}</button>`;
  }

  /* bottom nav */
  const NAV = [
    ["home", "home", T("nav.home")], ["log", "clipboard-list", T("nav.log")], ["timer", "timer", T("nav.timer")],
    ["progress", "trending-up", T("nav.progress")], ["calc", "calculator", T("nav.calc")],
    ["library", "book-open", T("nav.library")],
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
  if (ui.presetForm) html += renderPresetForm();
  if (ui.presetView) html += renderPresetView();
  if (ui.chartFull) html += renderChartFull();
  if (ui.showProfile) html += renderProfile(ui.profileDraft);
  if (ui.showBody) html += renderBodyWindow(body, unit);
  if (ui.bodyForm) html += renderBodyFormSheet(ui.bodyForm, unit);
  if (ui.groupSheet) html += renderGroupSheet(library);
  if (ui.groupForm) html += renderGroupForm();
  if (ui.deloadForm) html += renderDeloadForm();

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

/* ── the pinned module ────────────────────────────────────────────────
   The strip of home screen between "Start New Workout" and the how-it-works
   accordions is the app's launchpad: the presets you actually repeat, and
   the timers you actually reach for, both one tap away. Pin a preset from
   Library → Presets, a timer from the Timer tab. */

const PIN_RING_C = 201.06;   /* 2πr for the r=32 dial below */

function renderPinnedPresets() {
  const pinned = (state.presets || []).filter((p) => p.pinned);
  if (!pinned.length)
    return `<div style="font-size:12.5px;color:var(--faint);line-height:1.5;padding:0 2px">
      ${T("home.noPinnedPresets", { icon: icon("pin", 11) })}
    </div>`;

  return `<div class="pb-card2" style="overflow:hidden">
    ${pinned.map((p, i) => {
      const exs = p.exercises || [];
      return `<button data-action="start-workout-from-preset" data-id="${esc(p.id)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 12px;text-align:left;color:var(--text);border-bottom:${i < pinned.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
          <div style="font-size:11.5px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.description ? esc(p.description) : TN("move", exs.length)}</div>
        </div>
        ${chip(TN("move", exs.length), "var(--gold)")}
        ${icon("play", 14, 'style="color:var(--gold);flex-shrink:0"')}
      </button>`;
    }).join("")}
  </div>`;
}

/* One pinned timer: a round dial you tap to start, pause or clear, with the
   explicit pause / reset pair underneath — mid-set, with a bar in your
   hands, "tap the dial and hope it did the right thing" isn't good enough,
   so every pinned dial gets the same buttons the Timer tab's cards have,
   wherever it appears: Home, the workout window and the exercise window. */
function pinnedTimerDial(t) {
  const phase = timerPhase(t);
  const left = timerRemaining(t);
  const done = phase === "done";
  const frac = t.duration > 0 ? Math.max(0, Math.min(1, left / t.duration)) : 0;
  /* an idle dial is a full but quiet ring — clearly "ready", not "finished" */
  const color = done ? "var(--green)" : phase === "paused" ? "var(--steel)" : phase === "idle" ? "var(--raise)" : "var(--gold)";
  const action = done ? "timer-reset" : phase === "running" ? "timer-pause" : "timer-start";

  const dial = `<button data-action="${action}" data-id="${t.id}" style="width:100%;min-width:0;display:flex;flex-direction:column;align-items:center;gap:7px;padding:2px;color:var(--text)">
    <div class="${done ? "pb-timer-done " : ""}" style="position:relative;width:74px;height:74px;border-radius:50%">
      <svg width="74" height="74" viewBox="0 0 74 74" style="display:block;transform:rotate(-90deg)">
        <circle cx="37" cy="37" r="32" fill="none" stroke="var(--surface2)" stroke-width="6"/>
        <circle data-tmr-ring="${t.id}" data-ring-c="${PIN_RING_C}" cx="37" cy="37" r="32" fill="none" stroke="${color}" stroke-width="6"
                stroke-linecap="round" stroke-dasharray="${PIN_RING_C}" stroke-dashoffset="${(PIN_RING_C * (1 - frac)).toFixed(2)}"
                style="transition:stroke-dashoffset .25s linear"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
        <div data-tmr-time="${t.id}" class="pb-num" style="font-size:${done ? 13 : 17}px;font-weight:700;line-height:1;color:${done ? "var(--green)" : phase === "idle" ? "var(--muted)" : "var(--text)"}">${done ? T("timers.doneWord") : fmtClock(left)}</div>
      </div>
    </div>
    <div style="font-size:11px;font-weight:600;color:var(--muted);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(timerLabel(t))}</div>
  </button>`;

  /* an idle dial has nothing to pause or reset, so it stays a bare dial and
     the row doesn't jump around when one of three timers starts */
  const ctl = (a, ic, label, gold) =>
    `<button data-action="${a}" data-id="${t.id}" title="${label}" aria-label="${label}" class="pb-btn ${gold ? "pb-gold" : "pb-ghost"}" style="flex:1;min-width:0;padding:7px 0">${icon(ic, 13)}</button>`;
  const pair = phase === "idle" ? ""
    : done
      ? ctl("timer-start", "rotate-ccw", T("timers.again"), true) + ctl("timer-reset", "check", T("timers.doneBtn"))
      : phase === "paused"
        ? ctl("timer-start", "play", T("timers.resume"), true) + ctl("timer-reset", "rotate-ccw", T("timers.reset"))
        : ctl("timer-pause", "pause", T("timers.pause")) + ctl("timer-reset", "square", T("timers.stop"));

  return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center">
    ${dial}
    ${pair ? `<div style="display:flex;gap:5px;margin-top:8px;width:100%">${pair}</div>` : ""}
  </div>`;
}

function renderPinnedModule() {
  const timers = pinnedTimers();
  return `<div class="pb-card" style="margin-top:14px;padding:13px 14px 15px">
    ${sectionTitle(T("home.pinnedPresets"))}
    ${renderPinnedPresets()}
    <div class="pb-hairline" style="margin:15px 0 12px"></div>
    ${sectionTitle(T("home.pinnedTimers"))}
    ${timers.length
      ? `<div style="display:flex;align-items:flex-start;gap:6px">${timers.map((t) => pinnedTimerDial(t)).join("")}</div>`
      : `<div style="font-size:12.5px;color:var(--faint);line-height:1.5;padding:0 2px">
          ${T("home.noPinnedTimers", { icon: icon("pin", 11) })}
        </div>`}
  </div>`;
}

/* The deload banner: only ever about a period the user planned themselves,
   counting down to it and then through it. Tap to unfold what a deload is
   and how to run one. */
function renderDeloadBanner(status) {
  if (!status) return "";
  const active = status.phase === "active";
  const title = active ? T("deload.activeTitle", { n: status.day, total: status.total })
    : status.away === 0 ? T("deload.today")
    : status.away === 1 ? T("deload.tomorrow")
    : T("deload.inDays", { n: status.away });
  const sub = active
    ? (status.left === 0 ? T("deload.lastDay") : T("deload.toGo", { days: TN("day", status.left), end: fmtShort(status.d.end) }))
    : T("deload.tapHow", { from: fmtShort(status.d.start), to: fmtShort(status.d.end) });

  return `<div class="pb-card" style="border-color:rgba(233,185,73,.4);background:rgba(233,185,73,.07)">
    <button data-action="toggle-deload" style="width:100%;display:flex;gap:10px;align-items:center;padding:12px 14px;text-align:left">
      ${icon("moon", 18, 'style="color:var(--gold);flex-shrink:0"')}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13.5px;color:var(--gold)">${title}</div>
        <div style="font-size:12px;color:var(--muted)">${sub}</div>
      </div>
      ${icon("chevron-down", 16, `style="color:var(--gold);transform:${ui.deloadOpen ? "rotate(180deg)" : "none"}"`)}
    </button>
    ${ui.deloadOpen ? `<div style="padding:0 14px 14px;font-size:13px;line-height:1.55;color:var(--muted)">${T("deload.what")}</div>` : ""}
  </div>`;
}

function renderHome(settings, currentWeek, unit) {
  const deloadBanner = renderDeloadBanner(deloadStatus(state.deloads));

  return `<div class="" style="padding:18px 16px 0">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:11px;min-width:0">
        <img src="logoC.png" alt="${T("a11y.logo")}" width="46" height="46" style="width:46px;height:46px;object-fit:contain;border-radius:11px;display:block;flex-shrink:0">
        <div class="pb-num" style="line-height:1.05;min-width:0">
          <div style="font-size:20px;font-weight:700;letter-spacing:.02em;color:var(--text)">ZENOFIT</div>
          <div style="font-size:12.5px;font-weight:600;letter-spacing:.32em;color:var(--gold)">${T("app.tagline")}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
        <button data-action="open-body" title="${T("a11y.bodyBtn")}" style="color:var(--muted);padding:8px">${icon("ruler", 22)}</button>
        <button data-action="open-profile" style="color:var(--muted);padding:8px">${icon("settings", 22)}</button>
      </div>
    </div>

    <div class="pb-num" style="font-size:27px;font-weight:700;line-height:1.1">
      ${settings.name ? T("home.readyName", { name: esc(settings.name.split(" ")[0]) }) : T("home.ready")}
    </div>
    <div style="color:var(--muted);font-size:13.5px;margin-top:3px;margin-bottom:16px">
      ${T("home.weekLine", { n: currentWeek })}
    </div>

    <button data-action="new-workout" class="pb-btn pb-gold" style="width:100%;padding:16px 0;font-size:16.5px;border-radius:14px">
      ${icon("plus", 20, 'stroke-width="2.6"')} ${T("home.start")}
    </button>

    ${deloadBanner ? `<div style="margin-top:12px">${deloadBanner}</div>` : ""}

    ${renderPinnedModule()}

    <div style="margin-top:22px">
      ${sectionTitle(T("home.howThisWorks"))}

      ${accordion("howto", T("acc.howto.title"), icon("info", 16, 'style="color:var(--blue)"'), T("acc.howto.body"))}
      ${accordion("presets", T("acc.presets.title"), icon("layers", 16, 'style="color:var(--gold)"'), T("acc.presets.body"))}
      ${accordion("sets", T("acc.sets.title"), icon("list-checks", 16, 'style="color:var(--red)"'), T("acc.sets.body"))}
      ${accordion("onerm", T("acc.rm.title"), icon("trending-up", 16, 'style="color:var(--green)"'), T("acc.rm.body", { unit }))}
      ${accordion("cardio", T("acc.cardio.title"), icon("timer", 16, 'style="color:#a07ec2"'), T("acc.cardio.body"))}
      ${accordion("goal", T("acc.goal.title"), icon("trophy", 16, 'style="color:var(--gold)"'), T("acc.goal.body", { unit }))}
      ${accordion("units", T("acc.units.title"), icon("ruler", 16, 'style="color:var(--steel)"'), T("acc.units.body"))}
    </div>

    <div style="height:8px"></div>
  </div>`;
}

/* ───────────────────────── LOG (history + volume) ─────────────────── */

function renderLog(log, library, badges, settings, unit, currentWeek) {
  const seg = ui.logSeg;
  const segs = [["history", T("log.history")], ["volume", T("log.volume")]].map(([id, label]) =>
    `<button data-action="log-seg" data-id="${id}" class="pb-btn" style="flex:1;padding:8px 0;font-size:13px;border-radius:8px;background:${seg === id ? "var(--raise)" : "transparent"};color:${seg === id ? "var(--text)" : "var(--muted)"};border:${seg === id ? "1px solid var(--border)" : "1px solid transparent"}">${label}</button>`).join("");

  return `<div class="" style="padding:12px 16px 0">
    <div style="display:flex;background:var(--surface2);border-radius:11px;padding:3px;margin-bottom:14px;border:1px solid var(--border-soft)">${segs}</div>
    ${seg === "history" ? renderHistory(log, library, badges, settings, unit) : renderVolume(log, library, settings, currentWeek)}
  </div>`;
}

/* Parked days sit above the real history, unmistakably not part of it:
   dashed, gold, labelled DRAFT, and carrying no week chip or set count
   because they haven't been counted. Resume finishes the day; delete
   throws it away. */
function renderDayDrafts() {
  const drafts = [...(state.dayDrafts || [])].sort((a, b) => b.savedAt - a.savedAt);
  if (!drafts.length) return "";

  return drafts.map((d) => {
    const exs = d.entries || [];
    const ready = exs.filter(entryHasData).length;
    return `<div class="pb-card" style="margin-bottom:12px;overflow:hidden;border:1px dashed rgba(233,185,73,.55);background:rgba(233,185,73,.04)">
      <div style="display:flex;align-items:center;gap:8px;padding:11px 14px 9px">
        <div class="pb-num" style="font-weight:700;font-size:16.5px;flex:1;min-width:0">${fmtDate(d.date)}</div>
        ${chip(T("draft.badge"), "var(--gold)")}
        ${chip(TN("exercise", exs.length))}
      </div>
      <div style="padding:0 14px 10px;display:flex;flex-direction:column;gap:5px">
        ${exs.map((e) => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:${entryHasData(e) ? "var(--muted)" : "var(--faint)"}">
          <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, state.library, e.muscle))};flex-shrink:0"></span>
          <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabel(e.exercise))}</span>
          ${entryHasData(e) ? "" : `<span style="font-size:11px;color:var(--faint)">${T("draft.empty")}</span>`}
        </div>`).join("")}
      </div>
      <div style="font-size:11.5px;color:var(--faint);padding:0 14px 10px;line-height:1.45">
        ${ready ? T("draft.note") : T("draft.noteBlank")}
      </div>
      <div style="display:flex;border-top:1px solid var(--border-soft)">
        <button data-action="resume-draft" data-id="${esc(d.id)}" style="flex:1;padding:12px;color:var(--gold);font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px">${icon("pencil", 13)} ${T("draft.continue")}</button>
        <button data-action="delete-draft" data-id="${esc(d.id)}" style="flex:1;padding:12px;color:var(--red);font-weight:600;font-size:13px;border-left:1px solid var(--border-soft);display:flex;align-items:center;justify-content:center;gap:6px">${icon("trash-2", 13)} ${T("common.delete")}</button>
      </div>
    </div>`;
  }).join("");
}

function renderHistory(log, library, badges, settings, unit) {
  const drafts = renderDayDrafts();

  if (!log.length)
    return drafts + `<div class="pb-card" style="padding:26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.6">
      ${icon("clipboard-list", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
      ${T("log.empty")}
    </div>`;

  const byDate = {};
  for (const e of log) (byDate[e.date] = byDate[e.date] || []).push(e);
  const dates = Object.keys(byDate).sort().reverse();

  return drafts + dates.map((date) => {
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
            <div style="font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabel(e.exercise))}</div>
            <div style="font-size:12.5px;color:var(--muted);margin-top:1px">
              ${entrySummary(e, unit, true)}
            </div>
            ${e.notes ? `<div style="font-size:11.5px;color:var(--faint);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">“${esc(e.notes)}”</div>` : ""}
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${b.metric != null ? `<div class="pb-num" style="font-weight:700;font-size:17px;color:${b.badge === "pr" ? "var(--gold)" : "var(--text)"}">${b.metric}<span style="font-size:10.5px;color:var(--muted);font-weight:600"> ${e.kind === "cardio" ? T("unit.pts") : unit}</span></div>` : ""}
            ${BADGE_SHORT[b.badge] ? `<div style="font-size:10.5px;font-weight:700;color:${b.badge === "pr" ? "var(--gold)" : "var(--muted)"}">${BADGE_SHORT[b.badge]}</div>` : ""}
          </div>
        </button>
        <button data-action="open-exercise-window" data-name="${esc(e.exercise)}" title="${T("log.exerciseDetails")}" style="flex-shrink:0;padding:12px 14px;color:var(--faint);align-self:stretch">${icon("info", 17)}</button>
      </div>`;
    }).join("");

    return `<div class="pb-card" style="margin-bottom:12px;overflow:hidden">
      <button data-action="edit-day" data-date="${date}" title="${T("log.editDay")}" style="width:100%;display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--border-soft);color:var(--text);text-align:left">
        <div class="pb-num" style="font-weight:700;font-size:16.5px;flex:1">${fmtDate(date)}</div>
        ${chip(T("common.week", { n: wk }), "var(--gold)")}
        ${sets > 0 ? chip(sets + " " + T("unit.sets")) : ""}
        ${mins > 0 ? chip(mins + " " + T("unit.min"), "#a07ec2") : ""}
        ${icon("pencil", 14, 'style="color:var(--faint);flex-shrink:0;margin-left:2px"')}
      </button>
      ${rows}
    </div>`;
  }).join("");
}

/* ───────────────────────────── VOLUME ─────────────────────────────── */

/* ── THE CALENDAR ─────────────────────────────────────────────────────
   Weekly Volume is built around a real month, because that's how anyone
   actually thinks about their training block: which days did I train,
   which week am I reading, and when is the easy week?

   Every day cell can carry three independent things at once, so they're
   layered rather than fought over: the tint says which program week the
   numbers below belong to, the dashed gold band says deload, and the dots
   underneath the date say which muscle groups you trained. */

/* date → Set of muscle groups trained that day */
function dayMarks(log, library) {
  const out = {};
  for (const e of log) {
    const m = e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, library, e.muscle);
    (out[e.date] = out[e.date] || new Set()).add(m);
  }
  return out;
}

function renderCalendar(log, library, settings, week) {
  const month = ui.calMonth || monthOf(todayStr());
  const today = todayStr();
  const marks = dayMarks(log, library);
  const range = weekRange(week, settings.startDate);
  const picking = ui.deloadPick;

  const cells = monthGrid(month).map((c) => {
    const dl = deloadOn(state.deloads, c.iso);
    const inWeek = c.iso >= range.from && c.iso <= range.to;
    const isToday = c.iso === today;
    const groups = marks[c.iso] ? [...marks[c.iso]].slice(0, 3) : [];
    const pickStart = picking && picking.start === c.iso;
    const pickAfter = picking && picking.start && c.iso > picking.start;

    /* the tint stack, quietest first */
    const bg = pickStart ? "rgba(233,185,73,.30)"
      : dl ? "rgba(233,185,73,.13)"
      : inWeek ? "var(--surface2)"
      : "transparent";
    const border = isToday ? "1px solid var(--gold)"
      : dl ? "1px dashed rgba(233,185,73,.5)"
      : "1px solid transparent";

    return `<button data-action="cal-day" data-d="${c.iso}"
      style="position:relative;aspect-ratio:1;border-radius:9px;background:${bg};border:${border};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0;opacity:${c.inMonth ? 1 : 0.35};${pickAfter ? "outline:1px solid rgba(233,185,73,.25);outline-offset:-1px;" : ""}">
      <span class="pb-num" style="font-size:13px;font-weight:${isToday ? 700 : 600};color:${isToday ? "var(--gold)" : inWeek || dl ? "var(--text)" : "var(--muted)"};line-height:1">${c.day}</span>
      <span style="display:flex;gap:2px;height:4px;align-items:center">
        ${groups.map((g) => `<span style="width:4px;height:4px;border-radius:2px;background:${colorFor(g)}"></span>`).join("")}
      </span>
    </button>`;
  }).join("");

  const monthDate = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1, 1);
  const monthLabel = monthDate.toLocaleDateString(localeTag(), { month: "long", year: "numeric" });
  /* weekday initials straight from the locale, Monday first */
  const initials = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(localeTag(), { weekday: "narrow" }));

  const hint = picking
    ? `<div style="margin-top:10px;padding:9px 11px;border-radius:9px;background:rgba(233,185,73,.09);border:1px solid rgba(233,185,73,.3);display:flex;align-items:center;gap:8px">
        ${icon("moon", 14, 'style="color:var(--gold);flex-shrink:0"')}
        <span style="flex:1;font-size:12px;color:var(--muted);line-height:1.4">
          ${picking.start ? T("cal.pickLast", { from: fmtShort(picking.start) }) : T("cal.pickFirst")}
        </span>
        <button data-action="deload-cancel" style="color:var(--faint);padding:2px;flex-shrink:0">${icon("x", 15)}</button>
      </div>`
    : "";

  return `<div class="pb-card" style="padding:13px 13px 14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px">
      <button data-action="cal-prev" style="color:var(--muted);padding:5px 7px">${icon("chevron-left", 17)}</button>
      <div class="pb-num" style="flex:1;text-align:center;font-size:15.5px;font-weight:700">${esc(monthLabel)}</div>
      <button data-action="cal-next" style="color:var(--muted);padding:5px 7px">${icon("chevron-right", 17)}</button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:4px">
      ${initials.map((d) => `<div style="text-align:center;font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--faint);text-transform:uppercase">${esc(d)}</div>`).join("")}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">${cells}</div>

    ${hint}

    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:11px;font-size:10.5px;color:var(--faint)">
      <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--surface2)"></span>${T("vol.legendWeek", { n: week })}</span>
      <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:rgba(233,185,73,.13);border:1px dashed rgba(233,185,73,.5)"></span>${T("vol.legendDeload")}</span>
      <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:4px;height:4px;border-radius:2px;background:var(--muted)"></span>${T("vol.legendTrained")}</span>
    </div>
  </div>`;
}

/* the planned-deload list that sits under the calendar */
function renderDeloadPlanner() {
  const all = deloadsSorted(state.deloads);
  const today = todayStr();

  const rows = all.map((d) => {
    const past = d.end < today;
    const active = inDeload(d, today);
    const len = deloadLength(d);
    return `<button data-action="deload-edit" data-id="${esc(d.id)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 12px;text-align:left;color:var(--text);opacity:${past ? 0.5 : 1};border-top:1px solid var(--border-soft)">
      ${icon("moon", 14, `style="color:${active ? "var(--gold)" : "var(--faint)"};flex-shrink:0"`)}
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600">${fmtShort(d.start)} → ${fmtShort(d.end)}</div>
        <div style="font-size:11px;color:var(--faint)">${TN("day", len)}${active ? " · " + T("cal.runningNow") : past ? " · " + T("cal.done") : ""}</div>
      </div>
      ${icon("pencil", 13, 'style="color:var(--faint);flex-shrink:0"')}
    </button>`;
  }).join("");

  return `<div class="pb-card" style="overflow:hidden;margin-bottom:14px">
    <button data-action="deload-plan" style="width:100%;display:flex;align-items:center;gap:9px;padding:11px 12px;color:var(--gold);text-align:left">
      ${icon("calendar-plus", 15, 'style="flex-shrink:0"')}
      <span style="flex:1;font-size:13.5px;font-weight:600">${T("cal.planDeload")}</span>
      <span style="font-size:11px;color:var(--faint)">${all.length ? T("cal.planned", { n: all.length }) : T("cal.noneYet")}</span>
    </button>
    ${rows}
  </div>`;
}

/* Editing a planned deload by hand, for when tapping two days on the
   calendar isn't the shape of the change you want to make. */
function renderDeloadForm() {
  const f = ui.deloadForm;
  const ok = !!(f.start && f.end) && f.end >= f.start;
  const len = ok ? daysBetween(f.start, f.end) + 1 : 0;
  return sheet(f.isNew ? T("deloadForm.new") : T("deloadForm.edit"), "deloadForm", `
    <div style="display:flex;gap:10px">
      <div style="flex:1">${field(T("deloadForm.firstDay"), `<input type="date" class="pb-input" data-bind="deload.start" value="${esc(f.start)}">`)}</div>
      <div style="flex:1">${field(T("deloadForm.lastDay"), `<input type="date" class="pb-input" data-bind="deload.end" value="${esc(f.end)}">`)}</div>
    </div>
    <div class="pb-card2" style="padding:11px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      ${icon("moon", 16, 'style="color:var(--gold);flex-shrink:0"')}
      <div style="flex:1;font-size:12.5px;color:var(--muted);line-height:1.45">
        ${ok ? T("deloadForm.summary", { days: TN("day", len), n: DELOAD_HEADSUP }) : T("deloadForm.invalid")}
      </div>
    </div>
    <button data-action="deload-save" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">
      ${icon("check", 16)} ${f.isNew ? T("deloadForm.add") : T("common.saveChanges")}
    </button>
    ${!f.isNew ? `<button data-action="deload-delete" class="pb-btn" style="width:100%;padding:12px 0;margin-top:10px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} ${T("deloadForm.deleteBtn")}
    </button>` : ""}
  `, 100);
}

function renderVolume(log, library, settings, currentWeek) {
  const week = ui.volumeWeek;
  const groups = libraryGroups(library);
  for (const e of log) { const m = e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, library, e.muscle); if (!groups.includes(m)) groups.push(m); }

  const vol = volumeForWeek(log, library, settings.startDate, week);
  const targets = state.volumeGoals || {};
  const strengthVals = groups.filter((g) => g !== "Cardio").map((g) => vol[g] || 0);
  const max = Math.max(1, ...strengthVals);
  const range = weekRange(week, settings.startDate);

  const rows = groups.map((g, i) => {
    const isCardio = g === "Cardio";
    const bucket = g === UNCATEGORIZED;
    const v = vol[g] || 0;
    const unit = isCardio ? T("unit.min") : T("unit.sets");
    /* A personal weekly target takes over the assessment when the user sets one.
       Everyone's "enough" is different. Muscle groups target sets; cardio targets
       minutes.

       Without a target the app has no business calling a group neglected — it
       doesn't know your split. A week with no chest work is a rest from chest,
       not a failure, and there's no honest way to tell those apart until you've
       said what you were aiming for. So an untargeted group is only ever flagged
       "Low", relative to the biggest group you actually trained this week. */
    const target = targets[g] > 0 ? targets[g] : null;
    const editing = ui.volGoalEditing === g;
    const done = target && v >= target;

    const pct = target ? Math.min(1, v / target)
      : isCardio ? Math.min(1, v / 60)
      : v / max;

    /* one quiet line of status, never a shouty chip — the bar already
       carries the information, the words only name it */
    let note = "";
    if (target) {
      note = v === 0 ? `<span style="color:var(--red)">${T("vol.neglected")}</span>`
        : done ? `<span style="color:var(--green)">${T("vol.onTarget")}</span>`
        : T("vol.toGo", { n: Math.round((target - v) * 10) / 10, unit });
    } else if (bucket) {
      note = T("vol.noGroup");
    } else if (!isCardio && v > 0 && max >= 6 && v < max / 3) {
      note = T("vol.low");
    }

    const barColor = done ? "var(--green)" : colorFor(g, i);

    /* the bucket isn't a group you own, so there's nothing to aim at */
    const targetCell = bucket ? ""
      : editing
      ? `<span data-stopprop style="display:flex;gap:5px;align-items:center">
          <input class="pb-input" ${NUM} data-bind="volGoal" value="${esc(ui.volGoalVal)}" placeholder="—" style="width:62px;padding:4px 7px;font-size:13px;text-align:center" data-autofocus>
          <button data-action="save-vol-goal" data-g="${esc(g)}" class="pb-btn pb-gold" style="width:28px;height:28px;border-radius:8px;flex-shrink:0">${icon("check", 14)}</button>
        </span>`
      : `<button data-action="edit-vol-goal" data-g="${esc(g)}" title="${T("vol.target")}"
          style="flex-shrink:0;display:flex;align-items:center;gap:4px;padding:3px 7px;border-radius:7px;font-size:11.5px;font-weight:600;color:${target ? "var(--muted)" : "var(--faint)"};background:var(--surface2)">
          ${target ? `${target}` : icon("target", 12)}${icon("pencil", 10)}
        </button>`;

    return `<div style="padding:10px 0;border-bottom:${i < groups.length - 1 ? "1px solid var(--border-soft)" : "none"}">
      <div style="display:flex;align-items:center;gap:9px">
        <span style="width:7px;height:7px;border-radius:4px;background:${colorFor(g, i)};flex-shrink:0"></span>
        <div style="font-weight:600;font-size:13.5px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(groupLabel(g))}</div>
        <div class="pb-num" style="font-weight:700;font-size:16px;color:${v ? "var(--text)" : "var(--faint)"}">${v}<span style="font-size:10px;color:var(--faint);font-weight:600"> ${unit}</span></div>
        ${targetCell}
      </div>
      <div style="height:5px;background:var(--surface2);border-radius:3px;margin-top:7px;overflow:hidden">
        <div style="height:100%;width:${Math.round(pct * 100)}%;background:${barColor};opacity:.85;border-radius:3px;transition:width .25s"></div>
      </div>
      ${note ? `<div style="font-size:11px;color:var(--faint);margin-top:5px">${note}</div>` : ""}
    </div>`;
  }).join("");

  return `<div class="">
    ${renderCalendar(log, library, settings, week)}
    ${renderDeloadPlanner()}

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <button data-action="vol-prev" class="pb-btn pb-ghost" style="width:32px;height:32px;flex-shrink:0">${icon("chevron-left", 16)}</button>
      <div style="flex:1;min-width:0;text-align:center">
        <div class="pb-num" style="font-size:17px;font-weight:700;line-height:1.1">${T("common.week", { n: week })}</div>
        <div style="font-size:10.5px;color:var(--faint)">${fmtShort(range.from)} – ${fmtShort(range.to)}${week === currentWeek ? " · " + T("vol.thisWeek") : ""}</div>
      </div>
      <button data-action="vol-next" class="pb-btn pb-ghost" style="width:32px;height:32px;flex-shrink:0">${icon("chevron-right", 16)}</button>
    </div>

    <div class="pb-card" style="padding:4px 14px">${rows}</div>

    <div style="font-size:11.5px;color:var(--faint);margin:10px 4px 0;line-height:1.5">
      ${T("vol.help", { icon: icon("target", 11) })}
    </div>
    <div style="height:6px"></div>
  </div>`;
}

/* ─────────────────────────── PROGRESS ─────────────────────────────── */

function renderProgress(log, library, goals, badges, settings, unit) {
  const segs = segControl("prog-seg", ui.progSeg,
    [["progress", T("prog.segProgress")], ["placeholder", T("prog.segPlaceholder")]]);

  if (ui.progSeg === "placeholder")
    return `<div class="" style="padding:12px 16px 0">${segs}${renderProgPlaceholder()}</div>`;

  const rows = dashboardRows(log, library, goals);
  const selected = ui.progressSelected;
  const sel = selected && rows.some((r) => r.name === selected) ? selected : rows[0]?.name || null;

  if (!rows.length)
    return `<div class="" style="padding:12px 16px 0">
      ${segs}
      <div class="pb-card" style="padding:26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.6">
        ${icon("trending-up", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
        ${T("prog.empty")}
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
  /* every dot carries the entry that made it, so tapping one can open the
     session behind the number instead of just showing it again */
  const chartData = series.map((e) => ({ x: fmtShort(e.date), y: e.m, e, badge: badges[e.id]?.badge || null }));

  const { sets: wkSets } = weeklyTotals(log, settings.startDate);
  const maxWk = Math.max(1, ...Object.keys(wkSets).map(Number));
  const wkData = Array.from({ length: maxWk }, (_, i) => ({ w: "W" + (i + 1), sets: wkSets[i + 1] || 0 }));

  if (chartData.length >= 2)
    chartState.line = {
      data: chartData, goal: selRow?.goal ?? null,
      unit: selRow?.cardio ? T("unit.pts") : unit,
      name: sel, cardio: !!selRow?.cardio,
    };
  chartState.bar = { data: wkData };

  /* a dot from a lift you're no longer looking at can't stay selected */
  if (ui.chartSel.main && !chartData.some((d) => d.e.id === ui.chartSel.main)) ui.chartSel.main = null;
  if (!chartState.line && ui.chartFull === "main") ui.chartFull = null;

  const goalRows = rows.map((r, i) => renderGoalRow(r, unit, i === rows.length - 1, sel === r.name)).join("");

  const detail = series.length > 0
    ? `<div class="pb-card pb-scroll" data-scrollkey="prog-detail" style="margin-bottom:20px;max-height:210px;overflow-y:auto">
        ${[...series].reverse().map((e) => `<button data-action="chart-pick" data-scope="main" data-id="${e.id}" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border-soft);font-size:13px;color:var(--text);background:${ui.chartSel.main === e.id ? "rgba(233,185,73,.08)" : "transparent"}">
          <span style="color:var(--muted);width:84px;flex-shrink:0">${fmtShort(e.date)}</span>
          <span style="flex:1;color:var(--faint);font-size:12px">${e.kind === "cardio" ? `${esc(e.minutes)} min × RPE ${esc(e.intensity)}` : `${esc(e.reps)} × ${esc(e.weight)} ${unitOf(e)}`}</span>
          <span class="pb-num" style="font-weight:700;font-size:15.5px;color:${badges[e.id]?.badge === "pr" ? "var(--gold)" : "var(--text)"}">${e.m}</span>
        </button>`).join("")}
      </div>`
    : "";

  return `<div class="" style="padding:12px 16px 0">
    ${segs}
    <div style="display:flex;gap:8px;margin-bottom:18px">
      ${stat(T("prog.entries"), glance.logged)}
      ${stat(T("prog.sets"), glance.sets)}
      ${stat(T("prog.prs"), glance.prs, "", "var(--gold)")}
      ${stat(T("prog.goals"), glance.goalsHit, "", "var(--green)")}
    </div>

    ${sectionTitle(T("prog.yourLifts"))}
    <div class="pb-card" style="margin-bottom:20px;overflow:hidden">${goalRows}</div>

    ${sectionTitle(T("prog.graph"), `<span style="font-size:11px;color:var(--faint)">${selRow?.cardio ? T("prog.sessionLoad") : T("prog.est1rm", { unit })}</span>`)}
    <div class="pb-card" style="padding:14px 8px 8px;margin-bottom:12px">
      <div style="padding:0 8px 10px">
        <select class="pb-input" data-bind="progressSel" style="font-weight:600">
          ${rows.map((r) => `<option value="${esc(r.name)}"${r.name === sel ? " selected" : ""}>${esc(exLabel(r.name))}</option>`).join("")}
        </select>
      </div>
      ${chartData.length >= 2
        ? `${chartToolbar(false, "main")}
           <div data-linechart="main" style="position:relative;width:100%;height:210px;touch-action:pan-y"></div>
           <div data-linedetail="main">${renderPointDetail("main")}</div>`
        : `<div style="height:130px;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:13px;text-align:center;padding:0 24px;line-height:1.5">
            ${sel ? T("prog.chartHint") : T("prog.chartHintAny")}
          </div>`}
    </div>

    ${detail}

    ${sectionTitle(T("prog.weeklySets"))}
    <div class="pb-card" style="padding:14px 8px 4px;margin-bottom:16px">
      <div id="barChart" style="position:relative;width:100%;height:140px"></div>
    </div>
  </div>`;
}

/* The second segment of the Progress tab: reserved, on purpose, and labelled
   as such rather than quietly missing. Ranks and strength standards land here. */
function renderProgPlaceholder() {
  return `<div>
    ${sectionTitle(T("prog.placeholderTitle"))}
    <!-- PLACEHOLDER_RANKS_SLOT — ranks & strength standards ship in a later version -->
    ${placeholder("PLACEHOLDER_RANKS_SLOT", 120, T("prog.placeholderSlot"))}
    <div style="font-size:12px;color:var(--faint);line-height:1.55;margin:12px 4px 0">
      ${T("prog.placeholderNote")}
    </div>
    <div style="height:14px"></div>
  </div>`;
}

/* ── the progress graph's own controls ────────────────────────────────
   Zoom, reset and fullscreen sit above the plot rather than hiding behind
   a gesture, because a chart you can only zoom by pinching is a chart half
   the people looking at it never zoom at all. */
function chartToolbar(full, scope = "main") {
  return `<div data-charttoolbar="${scope}" data-full="${full ? 1 : 0}">${chartToolbarInner(full, scope)}</div>`;
}

function chartToolbarInner(full, scope = "main") {
  const btn = (action, ic, label) =>
    `<button data-action="${action}" data-scope="${scope}" title="${label}" aria-label="${label}" class="pb-btn pb-ghost" style="width:34px;height:32px;border-radius:9px;color:var(--muted);flex-shrink:0">${icon(ic, 15)}</button>`;
  const zoomed = !!ui.chartView[scope];
  return `<div style="display:flex;align-items:center;gap:6px;padding:0 8px 8px">
    ${btn("chart-zoom-in", "zoom-in", T("chart.zoomIn"))}
    ${btn("chart-zoom-out", "zoom-out", T("chart.zoomOut"))}
    ${zoomed ? btn("chart-reset", "rotate-ccw", T("chart.reset")) : ""}
    <div style="flex:1;min-width:0;font-size:10.5px;color:var(--faint);text-align:right;line-height:1.3">${T("chart.hint")}</div>
    ${btn(full ? "chart-exit-full" : "chart-full", full ? "minimize-2" : "maximize-2", full ? T("chart.exitFull") : T("chart.full"))}
  </div>`;
}

/* What one dot is: the set that made it, the day it happened, and whatever
   was written down at the time. Nothing selected yet says so. */
function renderPointDetail(scope = "main") {
  const line = lineOf(scope);
  if (!line) return "";
  const p = line.data.find((d) => d.e.id === ui.chartSel[scope]);
  if (!p)
    return `<div style="font-size:11.5px;color:var(--faint);line-height:1.5;padding:6px 10px 2px;text-align:center">${T("chart.tapHint")}</div>`;

  const e = p.e;
  const eUnit = unitOf(e);
  const sets = isDetailed(e) ? filledSets(e) : [];
  return `<div class="pb-card2" style="margin:6px 4px 2px;padding:12px 13px">
    <div style="display:flex;align-items:baseline;gap:8px">
      <div style="font-weight:700;font-size:14px;flex:1;min-width:0">${fmtDate(e.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
      ${p.badge && BADGE_SHORT[p.badge] ? chip(BADGE_SHORT[p.badge], p.badge === "pr" ? "var(--gold)" : "") : ""}
      <div class="pb-num" style="font-weight:700;font-size:19px;color:var(--gold);flex-shrink:0">${p.y}<span style="font-size:10.5px;color:var(--muted);font-weight:600"> ${line.unit}</span></div>
    </div>
    <div style="font-size:12.5px;color:var(--muted);margin-top:3px">${entrySummary(e, eUnit, true)}</div>
    ${sets.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:9px">
      ${sets.map((s, i) => chip(`${i + 1} · ${esc(s.reps)} × ${esc(s.weight)} ${eUnit}${s.rpe ? ` @${esc(s.rpe)}` : ""}`)).join("")}
    </div>` : ""}
    ${e.notes
      ? `<div style="font-size:12.5px;color:var(--text);margin-top:9px;line-height:1.5">“${esc(e.notes)}”</div>`
      : `<div style="font-size:11.5px;color:var(--faint);margin-top:8px">${T("chart.noNote")}</div>`}
  </div>`;
}

/* Fullscreen: the same chart, the same selection, just given the whole
   phone. Opened from the toolbar, closed back to exactly where it was. */
function renderChartFull() {
  const scope = ui.chartFull;
  const line = lineOf(scope);
  if (!line) return "";
  return fullScreen(95, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="chart-exit-full" data-scope="${scope}" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      <div style="flex:1;min-width:0">
        <div class="pb-num" style="font-size:17px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabel(line.name))}</div>
        <div style="font-size:11.5px;color:var(--faint)">${line.cardio ? T("prog.sessionLoad") : T("prog.est1rm", { unit: line.unit })}</div>
      </div>
    </div>
    <div style="padding:10px 8px 0">${chartToolbar(true, scope)}</div>
    <div data-linechart="${scope}" style="position:relative;flex:1;min-height:120px;margin:0 8px;touch-action:none"></div>
    <div class="pb-scroll" data-linedetail="${scope}" style="max-height:44%;overflow-y:auto;padding:0 12px 18px">${renderPointDetail(scope)}</div>
  `, "chartFull");
}

function renderGoalRow(r, unit, last, active) {
  const editing = ui.goalEditing === r.name;
  const hit = r.goal != null && r.best != null && r.best >= r.goal;
  const status = r.goal == null ? T("prog.setGoal") : hit ? T("prog.goalHit") : r.best == null ? T("prog.logToStart")
    : T("prog.goalToGo", { n: Math.round((r.goal - r.best) * 10) / 10, unit: r.cardio ? T("unit.pts") : unit });

  const goalControls = editing
    ? `<span data-stopprop style="display:flex;gap:6px;align-items:center">
        <input class="pb-input" ${NUM} data-bind="goal" value="${esc(ui.goalVal)}" placeholder="—" style="width:78px;padding:5px 8px;font-size:13px" data-autofocus>
        <button data-action="save-goal" data-name="${esc(r.name)}" class="pb-btn pb-gold" style="width:30px;height:30px;border-radius:8px">${icon("check", 15)}</button>
      </span>`
    : `<button data-action="edit-goal" data-name="${esc(r.name)}" class="pb-chip" style="color:var(--gold);border-color:rgba(233,185,73,.35);background:rgba(233,185,73,.08)">
        ${icon("pencil", 11)} ${T("prog.goal")} ${r.goal != null ? `· ${r.goal}` : ""}
      </button>`;

  return `<div data-action="select-progress" data-name="${esc(r.name)}" style="padding:12px 14px;border-bottom:${last ? "none" : "1px solid var(--border-soft)"};background:${active ? "rgba(233,185,73,.05)" : "transparent"};cursor:pointer">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:8px;height:8px;border-radius:4px;background:${colorFor(r.muscle)};flex-shrink:0"></div>
      <div style="font-weight:600;font-size:14px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabel(r.name))}</div>
      <div class="pb-num" style="font-weight:700;font-size:17px;color:var(--text)">
        ${r.best ?? "—"}<span style="font-size:10.5px;color:var(--muted);font-weight:600"> ${r.cardio ? T("unit.pts") : unit}</span>
      </div>
      <button data-action="open-exercise-window" data-name="${esc(r.name)}" title="${T("log.exerciseDetails")}" style="flex-shrink:0;color:var(--faint);padding:2px">${icon("info", 15)}</button>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:7px">
      <div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${Math.round((r.progress ?? 0) * 100)}%;background:${hit ? "var(--green)" : "var(--gold)"};transition:width .25s"></div>
      </div>
      <div style="font-size:11.5px;font-weight:700;color:${hit ? "var(--green)" : "var(--muted)"};flex-shrink:0">${status}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:7px">
      <span style="font-size:11px;color:var(--faint)">${TN("session", r.sessions)} · ${T("prog.lastOn", { date: fmtShort(r.last) })}</span>
      <div style="flex:1"></div>
      ${goalControls}
    </div>
  </div>`;
}

/* ────────────────────── ONE REP MAX CALCULATOR ─────────────────────
   A lift and a rep count in, a whole training block's worth of numbers
   out: the estimated max, what to load for each percentage of it, and
   what each rep count is worth. It's stand-alone on purpose — nothing
   here is logged, nothing here needs an exercise to exist first, so it
   works for the barbell in front of you at a gym you're visiting once.

   The maths is calcPct/calcReps at the top of the file, which is the same
   anchored Wathan curve the log runs on, so a max worked out here matches
   the one a logged set would produce. Units are just a label: the answer
   comes back in whatever went in, because every step of it is a ratio. */

const CALC_PERCENTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];
const CALC_MAX_REPS = 30;

const calcTable = (head, rows) => `<div class="pb-card" style="overflow:hidden;margin-bottom:16px">
  <div style="display:flex;gap:8px;padding:10px 13px;border-bottom:1px solid var(--border);background:var(--surface2)">
    ${head.map((h, i) => `<div class="pb-label" style="flex:1;min-width:0;text-align:${i === 0 ? "left" : i === 1 ? "center" : "right"}">${h}</div>`).join("")}
  </div>
  ${rows}
</div>`;

const calcRow = (cells, last, highlight) => `<div style="display:flex;gap:8px;align-items:center;padding:9px 13px;border-bottom:${last ? "none" : "1px solid var(--border-soft)"};background:${highlight ? "rgba(233,185,73,.07)" : "transparent"}">
  <div style="flex:1;min-width:0;font-size:13px;font-weight:600;color:${highlight ? "var(--gold)" : "var(--muted)"}">${cells[0]}</div>
  <div class="pb-num" style="flex:1;min-width:0;text-align:center;font-size:15px;font-weight:700;color:var(--text)">${cells[1]}</div>
  <div class="pb-num" style="flex:1;min-width:0;text-align:right;font-size:14px;font-weight:600;color:var(--muted)">${cells[2]}</div>
</div>`;

function renderCalc() {
  const f = ui.calc;
  const unit = f.unit || state.settings.units;
  const res = ui.calcResult;
  const ready = +decimalize(f.weight) > 0 && +decimalize(f.reps) > 0;

  const form = `<div class="pb-card" style="padding:14px;margin-bottom:16px">
    ${field(labelWith(T("calc.lift"), unitSelect(unit, "calcUnit")),
      `<input class="pb-input" ${NUM} data-bind="calc.weight" value="${esc(f.weight)}" placeholder="—">`)}
    ${field(T("calc.reps"), `<input class="pb-input" ${NUM} data-bind="calc.reps" value="${esc(f.reps)}" placeholder="—">`,
      T("calc.repsHint"))}
    <button id="calcRunBtn" data-action="calc-run" ${ready ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15.5px;opacity:${ready ? 1 : 0.45}">
      ${icon("equal", 17)} ${T("calc.run")}
    </button>
  </div>`;

  if (!res)
    return `<div class="" style="padding:14px 16px 0">
      <div style="font-size:13px;color:var(--muted);line-height:1.55;margin:0 2px 14px">${T("calc.intro")}</div>
      ${form}
      <div class="pb-card" style="padding:24px;text-align:center;color:var(--faint);font-size:13px;line-height:1.6">
        ${icon("calculator", 26, 'style="margin:0 auto 10px;display:block"')}
        ${T("calc.empty")}
      </div>
      <div style="height:14px"></div>
    </div>`;

  const u = res.unit;
  /* every row is built off the UNROUNDED max — rounding once, at the end of
     each row, is what keeps 95% of a 133.3 kg max reading 126.7 and not the
     126.6 you get from rounding twice */
  const pctRows = CALC_PERCENTS.map((p, i) => {
    /* past the bottom of the table one rep costs almost nothing, so the
       honest answer is "more than this table goes", not a made-up count */
    const r = calcReps(p / 100);
    return calcRow(
      [`${p}%`, `${trimNum(res.exact * p / 100)} ${u}`, r > CALC_MAX_REPS ? `${CALC_MAX_REPS}+` : r],
      i === CALC_PERCENTS.length - 1, p === 100,
    );
  }).join("");

  /* and the same thing read the other way: what one rep count is worth. The
     percentage is read back off the weight actually printed, so the row is
     always internally consistent. */
  const repRows = Array.from({ length: CALC_MAX_REPS }, (_, i) => i + 1).map((r, i, arr) => {
    const w = Math.round(res.exact * calcPct(r) * 10) / 10;
    return calcRow([r, `${trimNum(w)} ${u}`, `${Math.round((w / res.oneRM) * 100)}%`],
      i === arr.length - 1, r === res.reps);
  }).join("");

  return `<div class="" style="padding:14px 16px 0">
    <div style="font-size:13px;color:var(--muted);line-height:1.55;margin:0 2px 14px">${T("calc.intro")}</div>
    ${form}

    <div class="pb-card" style="padding:16px 15px;margin-bottom:18px;border-color:rgba(233,185,73,.45);background:rgba(233,185,73,.06)">
      <div class="pb-label" style="margin-bottom:4px">${T("calc.resultLabel")}</div>
      <div class="pb-num" style="font-size:38px;font-weight:700;line-height:1;color:var(--gold)">
        ${trimNum(res.oneRM)}<span style="font-size:16px;color:var(--muted);font-weight:600"> ${u}</span>
      </div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:6px">
        ${T("calc.from", { weight: trimNum(res.weight), unit: u, reps: res.reps })}
      </div>
    </div>

    ${sectionTitle(T("calc.pctTitle"))}
    ${calcTable([T("calc.colPct"), T("calc.colWeight"), T("calc.colReps")], pctRows)}

    ${sectionTitle(T("calc.repTitle"))}
    ${calcTable([T("calc.colRepsPlain"), T("calc.colWeight"), T("calc.colPctPlain")], repRows)}

    <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:0 4px 10px">${T("calc.footer")}</div>
    <div style="height:14px"></div>
  </div>`;
}

/* ─────────────────────────── LIBRARY ──────────────────────────────── */

/* Every group the user can choose, in their own order: the registered ones
   first, then anything a library row still refers to that somehow isn't
   registered (an old custom exercise, an import). A group with no exercises
   in it yet is deliberately included — it has to be pickable before it can
   ever have one. Uncategorized is never here; it isn't a choice. */
function libraryGroups(library) {
  const g = groupNames();
  for (const ex of library) if (ex.muscle && ex.muscle !== UNCATEGORIZED && !g.includes(ex.muscle)) g.push(ex.muscle);
  return g;
}

/* …and the same list with the bucket tacked on the end, for the places that
   have to SHOW every exercise rather than offer every group. */
function allGroups(library) {
  const g = libraryGroups(library);
  if (library.some((ex) => ex.muscle === UNCATEGORIZED)) g.push(UNCATEGORIZED);
  return g;
}

/* An exercise you added on the fly while logging (quick-add from the picker)
   arrives with nothing but a name and a muscle group. That, and only that, is
   what earns the blue NEW flag: it's a to-do, not a badge. Fill in equipment,
   alternatives or details and the flag disappears, at which point the exercise
   is indistinguishable from the built-in ones, which is the point.

   Some exercises don't need any of that — a machine only your gym has, a
   movement whose name says everything. Dismissing the flag says exactly
   that, and is the other way off the list. */
const needsDetails = (ex) =>
  !!(ex && ex.custom) && !ex.dismissedNew && !ex.equipment && !ex.alternatives && !ex.note;

const newFlag = (ex) => needsDetails(ex)
  ? '<span style="font-size:10px;color:var(--blue);margin-left:6px;font-weight:700;letter-spacing:.06em">${T("lib.newFlag")}</span>'
  : "";

function renderLibraryList(library) {
  const q = ui.libraryQ, filter = ui.libraryFilter;
  const groups = allGroups(library);   // the bucket is shown here, just never offered
  const shown = library.filter((ex) =>
    (filter === "All" || ex.muscle === filter) &&
    (!q || ex.name.toLowerCase().includes(q.toLowerCase())));

  return groups.filter((g) => shown.some((x) => x.muscle === g)).map((g) => `<div style="margin-bottom:16px">
    ${sectionTitle(`<span style="color:${colorFor(g)}">${esc(groupLabel(g))}</span>`)}
    <div class="pb-card" style="overflow:hidden">
      ${shown.filter((x) => x.muscle === g).map((ex, i, arr) => `<button data-action="open-exercise-window" data-name="${esc(ex.name)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px;text-align:left;color:var(--text);border-bottom:${i < arr.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        ${ex.image ? `<img src="${esc(ex.image)}" alt="" style="width:38px;height:38px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--border)">` : ""}
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${esc(exLabelOf(ex))}${newFlag(ex)}</div>
          <div style="font-size:11.5px;color:var(--faint)">${esc(exFieldOf(ex, "equipment"))}</div>
        </div>
        ${ex.video ? icon("youtube", 15, 'style="color:var(--red);flex-shrink:0"') : ""}
        ${icon("info", 15, 'style="color:var(--faint);flex-shrink:0"')}
      </button>`).join("")}
    </div>
  </div>`).join("");
}

/* ─────────────────── MUSCLE GROUPS (add / recolour) ─────────────────
   The seven built-in groups aren't special: they live in the same list as
   anything you add, and the colour you give a group is the colour it wears
   everywhere — the stripe down each logged exercise, the volume bars, the
   preset dots, the library headings. Renaming one carries every exercise,
   preset and weekly target across with it, so nothing is orphaned.

   Reached from the ＋ chip after the last category in the Library, and from
   the same ＋ inside the muscle picker while you're building a workout, so
   you never have to leave a half-typed day to invent a group.          */

function groupUseCount(name, library) {
  return (library || []).filter((ex) => ex.muscle === name).length;
}

function renderGroupSheet(library) {
  const groups = libraryGroups(library);
  return sheet(T("groups.title"), "groupSheet", `
    <button data-action="group-new" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:14px;border-style:dashed;border-color:rgba(233,185,73,.45);color:var(--gold);margin-bottom:14px">
      ${icon("plus", 16)} ${T("groups.new")}
    </button>
    <div class="pb-card" id="groupList" style="overflow:hidden;margin-bottom:12px">
      ${groups.map((g, i) => `<div data-grouprow style="display:flex;align-items:center;background:var(--surface);border-bottom:${i < groups.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        <span data-drag-handle class="pb-drag" title="${T("groups.dragTitle")}" style="flex-shrink:0;padding:12px 4px 12px 11px;color:var(--faint);display:flex">${icon("grip-vertical", 16)}</span>
        <button data-action="group-edit" data-g="${esc(g)}" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:11px 14px 11px 6px;text-align:left;color:var(--text)">
          <span style="width:20px;height:20px;border-radius:7px;background:${colorFor(g, i)};flex-shrink:0;border:1px solid var(--border)"></span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(groupLabel(g))}</div>
            <div style="font-size:11.5px;color:var(--faint)">${TN("exercise", groupUseCount(g, library))}</div>
          </div>
          ${icon("pencil", 14, 'style="color:var(--faint);flex-shrink:0"')}
        </button>
      </div>`).join("")}
    </div>
    <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:0 2px">
      ${T("groups.reorderHint", { icon: icon("grip-vertical", 11) })}
    </div>
  `, 100);
}

/* ── DRAG TO REORDER ──────────────────────────────────────────────────
   The order of state.groups IS the order groups appear in, everywhere, so
   reordering here is the one place the user arranges their own library.

   Pointer events rather than HTML5 drag-and-drop: `dragstart` never fires
   on touch, and this is a phone app first. The drag runs entirely on
   inline transforms without a re-render — render() rebuilds #app wholesale
   and would drop the node mid-gesture — and only commits on release. */

let dragCtx = null;

function startGroupDrag(ev, handle) {
  const row = handle.closest("[data-grouprow]");
  if (!row || !row.parentElement) return;
  const rows = [...row.parentElement.children].filter((n) => n.hasAttribute("data-grouprow"));
  const from = rows.indexOf(row);
  if (from < 0) return;

  dragCtx = { row, rows, from, to: from, h: row.offsetHeight, y0: ev.clientY };
  Object.assign(row.style, { position: "relative", zIndex: "2", background: "var(--raise)", boxShadow: "0 8px 20px rgba(0,0,0,.35)" });
  document.body.style.userSelect = "none";
  try { handle.setPointerCapture(ev.pointerId); } catch { /* mouse without capture is fine */ }
  ev.preventDefault();
}

function moveGroupDrag(ev) {
  if (!dragCtx) return;
  const { rows, from, h } = dragCtx;
  const dy = ev.clientY - dragCtx.y0;
  const to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / h)));
  dragCtx.to = to;
  dragCtx.row.style.transform = `translateY(${dy}px)`;
  /* everything between the row's old and new home slides one slot the other way */
  rows.forEach((n, i) => {
    if (i === from) return;
    const shift = (from < to && i > from && i <= to) ? -h
      : (from > to && i < from && i >= to) ? h
      : 0;
    n.style.transform = shift ? `translateY(${shift}px)` : "";
    n.style.transition = "transform .15s ease";
  });
  ev.preventDefault();
}

function endGroupDrag() {
  if (!dragCtx) return;
  const { from, to, rows } = dragCtx;
  rows.forEach((n) => {
    n.style.transform = ""; n.style.transition = ""; n.style.boxShadow = "";
    n.style.zIndex = ""; n.style.background = ""; n.style.position = "";
  });
  document.body.style.userSelect = "";
  dragCtx = null;
  if (from !== to) reorderGroups(from, to);
}

/* Keep each group's colour and its built-in key; only the order changes. */
function reorderGroups(from, to) {
  const names = libraryGroups(state.library);
  if (from >= names.length || to >= names.length) return;
  const [moved] = names.splice(from, 1);
  names.splice(to, 0, moved);
  const byName = Object.fromEntries(groupList().map((g) => [g.name, g]));
  patch({ groups: names.map((n) => (byName[n] ? { ...byName[n] } : { name: n, color: colorFor(n) })) });
}

document.addEventListener("pointerdown", (e) => {
  const h = e.target.closest("[data-drag-handle]");
  if (h) startGroupDrag(e, h);
});
document.addEventListener("pointermove", moveGroupDrag);
document.addEventListener("pointerup", endGroupDrag);
document.addEventListener("pointercancel", endGroupDrag);

function renderGroupForm() {
  const f = ui.groupForm;
  const isNew = !f.orig;
  const name = (f.name || "").trim();
  const ok = !!name;
  const used = f.orig ? groupUseCount(f.orig, state.library) : 0;

  return sheet(isNew ? T("groups.new") : T("groups.edit"), "groupForm", `
    ${field(T("groups.name"), `<input class="pb-input" data-bind="group.name" value="${esc(f.name)}" placeholder="—" data-autofocus>`,
      isNew ? T("groups.nameHintNew") : T("groups.nameHintEdit", { n: TN("exercise", used) }))}

    ${field(T("groups.colour"), `
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${GROUP_SWATCHES.map((c) => `<button data-action="group-color" data-c="${c}" title="${c}" style="width:34px;height:34px;border-radius:10px;background:${c};border:2px solid ${String(f.color).toLowerCase() === c ? "var(--text)" : "transparent"};box-shadow:0 0 0 1px var(--border)"></button>`).join("")}
        <label style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--surface2);border:1px solid var(--border);color:var(--muted);cursor:pointer" title="${T("groups.otherColour")}">
          ${icon("pipette", 15)}
          <input type="color" data-bind="group.color" value="${esc(f.color)}" style="width:0;height:0;opacity:0;border:0;padding:0">
        </label>
      </div>`)}

    <div class="pb-card2" style="padding:12px 14px;display:flex;align-items:center;gap:11px;margin-bottom:16px">
      <span style="width:26px;height:26px;border-radius:9px;background:${f.color};flex-shrink:0;border:1px solid var(--border)"></span>
      <div style="flex:1;min-width:0">
        <div id="groupPreviewName" style="font-weight:600;font-size:14px">${name ? esc(name) : T("groups.previewName")}</div>
        <div style="font-size:11.5px;color:var(--faint)">${T("groups.previewHint")}</div>
      </div>
      <span style="width:4px;height:26px;border-radius:2px;background:${f.color};flex-shrink:0"></span>
    </div>

    <button id="groupSaveBtn" data-action="group-save" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">
      ${icon("check", 16)} ${isNew ? T("groups.create") : T("common.saveChanges")}
    </button>
    ${!isNew ? `<button data-action="group-delete" class="pb-btn" style="width:100%;padding:12px 0;margin-top:10px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} ${T("groups.deleteBtn")}
    </button>
    <div style="font-size:11.5px;color:var(--faint);margin-top:8px;line-height:1.5">
      ${used ? T("groups.deleteUsed", { n: TN("exercise", used) }) : T("groups.deleteEmpty")}
    </div>` : ""}
  `, 110);
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
    ${segControl("library-seg", seg, [["exercises", T("lib.exercises")], ["presets", T("lib.presets")]])}
    ${seg === "presets" ? renderPresets() : renderExercisesLibrary(library)}
  </div>`;
}

function renderExercisesLibrary(library) {
  const groups = libraryGroups(library);
  const incomplete = library.filter(needsDetails);

  return `
    <div style="position:relative;margin-bottom:10px">
      ${icon("search", 16, 'style="position:absolute;left:12px;top:12px;color:var(--faint)"')}
      <input class="pb-input" style="padding-left:36px" placeholder="${T("lib.search")}" data-bind="libq" value="${esc(ui.libraryQ)}">
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding-bottom:10px">
      ${["All", ...groups].map((g) => `<button data-action="lib-filter" data-id="${esc(g)}" class="pb-chip" style="flex-shrink:0;padding:6px 12px;font-size:12.5px;color:${ui.libraryFilter === g ? "var(--gold-ink)" : "var(--muted)"};background:${ui.libraryFilter === g ? "var(--gold)" : "var(--surface2)"};border-color:${ui.libraryFilter === g ? "var(--gold)" : "var(--border)"}">${g === "All" ? T("common.all") : esc(groupLabel(g))}</button>`).join("")}
      <button data-action="open-groups" title="${T("lib.groupsBtn")}" class="pb-chip" style="flex-shrink:0;padding:6px 11px;font-size:12.5px;color:var(--gold);background:rgba(233,185,73,.08);border-color:rgba(233,185,73,.4)">${icon("plus", 13, 'stroke-width="2.6"')}</button>
    </div>

    ${incomplete.length > 0 ? `<div class="pb-card" style="border-color:rgba(93,139,204,.35);background:rgba(93,139,204,.06);padding:11px 12px 9px;margin-bottom:10px;font-size:12.5px;color:var(--muted);line-height:1.5">
      <b style="color:var(--blue)">${T("lib.missingTitle")}</b>
      <div style="margin:7px 0 8px">
        ${incomplete.map((x) => `<div style="display:flex;align-items:center;gap:8px">
          <button data-action="open-exercise-window" data-name="${esc(x.name)}" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;padding:4px 0;color:var(--text);font-size:13px;font-weight:600;text-align:left">
            <span style="width:5px;height:5px;border-radius:3px;background:var(--blue);flex-shrink:0"></span>
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(exLabelOf(x))}</span>
            ${icon("chevron-right", 14, 'style="color:var(--faint);flex-shrink:0"')}
          </button>
          <button data-action="dismiss-new" data-name="${esc(x.name)}" title="${T("lib.dismissNew")}" style="flex-shrink:0;padding:4px 2px 4px 6px;color:var(--faint)">${icon("x", 14)}</button>
        </div>`).join("")}
      </div>
      ${T("lib.missingHint")}
    </div>` : ""}

    <button data-action="add-exercise" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:14px;margin-bottom:12px;border-style:dashed;border-color:var(--border)">
      ${icon("plus", 17)} ${T("lib.addCustom")}
    </button>

    <div id="libList">${renderLibraryList(library)}</div>
    <div style="font-size:12px;color:var(--faint);line-height:1.55;margin:0 4px 10px">
      ${T("lib.footer")}
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
  if (e.kind !== "cardio") e.setList = [];
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
    <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(ex.muscle)};flex-shrink:0"></span>${esc(exLabel(ex.exercise))}
  </div>`).join("");

function renderPresets() {
  const presets = state.presets || [];
  if (!presets.length)
    return `<div class="pb-card" style="padding:26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.65">
      ${icon("layers", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
      ${T("preset.empty")}
    </div>`;

  return presets.map((p) => {
    const exs = p.exercises || [];
    return `<div class="pb-card" style="margin-bottom:12px;overflow:hidden">
      <div style="padding:13px 14px">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="pb-num" style="font-weight:700;font-size:16.5px;flex:1;min-width:0">${esc(p.name)}</div>
          ${chip(TN("move", exs.length), "var(--gold)")}
          <button data-action="preset-pin" data-id="${esc(p.id)}" title="${p.pinned ? T("preset.unpin") : T("preset.pinTo")}" style="flex-shrink:0;padding:4px;color:${p.pinned ? "var(--gold)" : "var(--faint)"}">${icon(p.pinned ? "pin-off" : "pin", 16)}</button>
        </div>
        ${p.description ? `<div style="font-size:12.5px;color:var(--muted);margin-top:3px">${esc(p.description)}</div>` : ""}
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:11px">${presetExerciseList(exs)}</div>
      </div>
      <div style="display:flex;border-top:1px solid var(--border-soft)">
        <button data-action="start-workout-from-preset" data-id="${esc(p.id)}" style="flex:1;padding:12px;color:var(--gold);font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px">${icon("play", 14)} ${T("preset.start")}</button>
        <button data-action="open-preset" data-id="${esc(p.id)}" style="flex:1;padding:12px;color:var(--muted);font-weight:600;font-size:13px;border-left:1px solid var(--border-soft);display:flex;align-items:center;justify-content:center;gap:6px">${icon("pencil", 13)} ${T("common.edit")}</button>
      </div>
    </div>`;
  }).join("") + `<div style="font-size:12px;color:var(--faint);line-height:1.55;margin:2px 4px 10px">
      ${T("preset.footer", { icon: icon("pin", 11) })}
    </div>`;
}

/* full-screen editor for a saved preset (rename, trim exercises, delete) */
function renderPresetView() {
  const p = ui.presetView;
  const exs = p.exercises || [];
  const canSave = !!(p.name && p.name.trim());
  return sheet(T("preset.editTitle"), "presetView", `
    ${field(T("preset.nameLabel"), `<input class="pb-input" data-bind="presetView.name" value="${esc(p.name)}" placeholder="—">`)}
    ${field(T("preset.descLabel"), `<input class="pb-input" data-bind="presetView.description" value="${esc(p.description)}" placeholder="—">`, T("preset.descHintEdit"))}
    ${sectionTitle(T("preset.exercisesN", { n: TN("move", exs.length) }))}
    <div class="pb-card" style="overflow:hidden;margin-bottom:16px">
      ${exs.length ? exs.map((ex, i) => `<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:${i < exs.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(ex.muscle)};flex-shrink:0"></span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${esc(exLabel(ex.exercise))}</div>
          <div style="font-size:11.5px;color:var(--faint)">${esc(groupLabel(ex.muscle))}${ex.kind === "cardio" ? " " + T("preset.cardio") : ""}</div>
        </div>
        <button data-action="remove-preset-exercise" data-i="${i}" title="${T("preset.removeFrom")}" style="color:var(--red);padding:6px">${icon("x", 16)}</button>
      </div>`).join("") : `<div style="padding:16px;text-align:center;color:var(--faint);font-size:12.5px;line-height:1.5">${T("preset.noneLeft")}</div>`}
    </div>
    <button data-action="presetview-pin" class="pb-btn" style="width:100%;padding:11px 0;font-size:13.5px;margin-bottom:12px;background:${p.pinned ? "rgba(233,185,73,.12)" : "var(--surface2)"};color:${p.pinned ? "var(--gold)" : "var(--muted)"};border:1px solid ${p.pinned ? "rgba(233,185,73,.4)" : "var(--border)"}">
      ${icon(p.pinned ? "pin-off" : "pin", 15)} ${p.pinned ? T("preset.pinned") : T("preset.pinTo")}
    </button>
    <button data-action="save-preset-edits" ${canSave ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${canSave ? 1 : 0.45}">${icon("check", 16)} ${T("common.saveChanges")}</button>
    <button data-action="delete-preset" data-id="${esc(p.id)}" class="pb-btn" style="width:100%;padding:12px 0;margin-top:10px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">${icon("trash-2", 15)} ${T("common.delete")}</button>
  `);
}

/* the "Save as Preset" bottom sheet, opened from the workout day window */
function renderPresetForm() {
  const f = ui.presetForm;
  const draft = ui.workoutSheet;
  const exs = draft ? draft.entries : [];
  const canSave = !!(f.name && f.name.trim()) && exs.length > 0;
  return sheet(T("preset.saveTitle"), "presetForm", `
    <div style="font-size:13px;color:var(--muted);line-height:1.55;margin-bottom:14px">
      ${T("preset.saveIntro", { n: TN("exercise", exs.length) })}
    </div>
    ${field(T("preset.nameRequired"), `<input class="pb-input" data-bind="preset.name" value="${esc(f.name)}" placeholder="—" data-autofocus>`)}
    ${field(T("preset.descLabel"), `<input class="pb-input" data-bind="preset.description" value="${esc(f.description)}" placeholder="—">`, T("preset.descHintNew"))}
    ${sectionTitle(T("preset.included", { n: TN("move", exs.length) }))}
    <div class="pb-card" style="overflow:hidden;margin-bottom:16px">
      ${exs.map((e, i) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:${i < exs.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, state.library, e.muscle))};flex-shrink:0"></span>
        <div style="font-weight:600;font-size:13.5px">${esc(exLabel(e.exercise))}</div>
      </div>`).join("")}
    </div>
    <button id="presetSaveBtn" data-action="commit-preset" ${canSave ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${canSave ? 1 : 0.45}">${icon("bookmark-plus", 16)} ${T("preset.saveBtn")}</button>
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

  /* What the log has to say about this lift. Built here rather than in the
     view body because the graph's series has to be handed to the chart
     engine (chartState.exLine) during render, before it paints. */
  const hist = editing || isNew ? null : exerciseHistory(ex.name, state.log);
  if (hist && hist.chart.length >= 2)
    chartState.exLine = {
      data: hist.chart, goal: state.goals[ex.name] ?? null,
      unit: hist.unit, name: ex.name, cardio: hist.cardio,
    };
  /* a dot that is no longer in the series can't stay selected, and a
     fullscreen copy of a graph that no longer exists has to fold away */
  if (ui.chartSel.ex && !(hist && hist.chart.some((d) => d.e.id === ui.chartSel.ex))) ui.chartSel.ex = null;
  if (!chartState.exLine && ui.chartFull === "ex") ui.chartFull = null;

  const canSave = !!(ex.name && ex.name.trim() && ex.muscle && ex.muscle.trim());
  const headerRight = editing
    ? `<button data-action="exwin-save" id="exwinSaveBtn" class="pb-btn pb-gold" style="padding:8px 16px;font-size:13.5px;opacity:${canSave ? 1 : 0.45}" ${canSave ? "" : "disabled"}>${icon("check", 15)} ${T("common.save")}</button>`
    : (ex.missing ? "" : `<button data-action="exwin-edit" class="pb-btn pb-ghost" style="padding:8px 14px;font-size:13.5px">${icon("pencil", 14)} ${T("common.edit")}</button>`);

  return fullScreen(90, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="${editing ? "exwin-cancel" : "exwin-close"}" style="color:var(--muted);padding:4px">${icon(editing ? "arrow-left" : "x", 21)}</button>
      <div class="pb-num" style="font-size:18px;font-weight:700;flex:1">${isNew ? T("ex.newTitle") : editing ? T("ex.editTitle") : T("ex.viewTitle")}</div>
      ${headerRight}
    </div>
    <div class="pb-scroll" data-scrollkey="exwin" style="flex:1;overflow-y:auto;padding:16px 16px 40px">
      ${editing ? exWindowEditBody(ex, library) : exWindowViewBody(ex, hist)}
    </div>
  `, "exWin");
}

/* ── one lift's whole history, for the panel at the bottom of its window ──
   Every entry that produced a number, oldest first, each carrying the entry
   behind it so a tapped dot can still say what the session was. PR flags are
   worked out here from the running best rather than borrowed from
   computeBadges(), because only this one lift is in question.            */
function exerciseHistory(name, log) {
  const series = chronoSort(log)
    .filter((e) => e.exercise === name)
    .map((e) => ({ ...e, m: metricOf(e) }))
    .filter((e) => e.m != null);

  let best = null, run = null;
  const chart = series.map((e) => {
    const badge = run == null ? "first" : e.m > run ? "pr" : e.m === run ? "match" : "below";
    run = run == null ? e.m : Math.max(run, e.m);
    if (!best || e.m > best.m) best = e;
    return { x: fmtShort(e.date), y: e.m, e, badge };
  });

  const cardio = !!(best && best.kind === "cardio");
  return { series, chart, best, cardio, unit: cardio ? T("unit.pts") : state.settings.units };
}

function exWindowViewBody(ex, hist) {
  const vid = youtubeId(ex.video);
  const detailField = (label, v, empty) => `<div style="margin-bottom:16px">
    <div class="pb-label" style="margin-bottom:5px">${label}</div>
    <div style="font-size:14px;color:${v ? "var(--text)" : "var(--faint)"};line-height:1.55">${v ? esc(v) : empty}</div>
  </div>`;

  return `
    <div class="pb-num" style="font-size:23px;font-weight:700;line-height:1.15;margin-bottom:9px">${esc(exLabelOf(ex))}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      ${chip(esc(groupLabel(ex.muscle)), colorFor(ex.muscle))}
      ${needsDetails(ex)
        ? `${chip(T("lib.newFlag"), "var(--blue)")}
           <button data-action="dismiss-new" data-name="${esc(ex.name)}" class="pb-chip" style="color:var(--faint);gap:5px">${icon("check", 11)} ${T("ex.dismiss")}</button>`
        : ""}
    </div>
    ${needsDetails(ex) ? `<div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin:-8px 0 16px">
      ${T("ex.newExplain")}
    </div>` : ""}

    ${ex.image
      ? `<img src="${esc(ex.image)}" alt="${esc(exLabelOf(ex))}" style="width:100%;max-height:300px;object-fit:cover;border-radius:14px;border:1px solid var(--border);margin-bottom:18px;display:block">`
      : ""}

    ${vid
      ? `<div style="margin-bottom:18px">
          <div class="pb-label" style="margin-bottom:6px">${T("ex.tutorial")}</div>
          <div style="position:relative;width:100%;padding-bottom:56.25%;border-radius:14px;overflow:hidden;border:1px solid var(--border);background:#000">
            <iframe src="https://www.youtube.com/embed/${vid}" title="Tutorial video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
          </div>
        </div>`
      : (ex.video
          ? `<div style="margin-bottom:18px">
              <div class="pb-label" style="margin-bottom:6px">${T("ex.tutorial")}</div>
              <a href="${esc(ex.video)}" target="_blank" rel="noopener" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;color:var(--blue)">${icon("external-link", 15)} ${T("ex.openLink")}</a>
            </div>`
          : "")}

    ${detailField(T("ex.details"), exFieldOf(ex, "note"), ex.missing ? T("ex.gone") : T("ex.noDetails"))}
    ${detailField(T("ex.equipment"), exFieldOf(ex, "equipment"), T("ex.notFilled"))}
    ${detailField(T("ex.alternatives"), exFieldOf(ex, "alternatives"), T("ex.notFilled"))}

    ${exWindowProgress(ex, hist)}
  `;
}

/* ── the lift's own progress panel ────────────────────────────────────
   Your best ever on this movement, then the same graph the Progress tab
   draws for it — the whole point being that you can look a lift up, see
   what it is, and see where you are on it without leaving the page.

   The graph is the real one, gestures and all, drawn from the "ex" scope
   so zooming it here never disturbs the chart on the Progress tab. */
function exWindowProgress(ex, hist) {
  if (!hist) return "";
  const { best, chart, unit, cardio } = hist;
  const label = cardio ? T("prog.sessionLoad") : T("prog.est1rm", { unit });

  if (!best)
    return `
      ${sectionTitle(T("ex.progressTitle"))}
      <div class="pb-card" style="padding:24px;text-align:center;color:var(--faint);font-size:13px;line-height:1.6">
        ${icon("trending-up", 24, 'style="margin:0 auto 9px;display:block"')}
        ${T("ex.progressEmpty")}
      </div>
      <div style="height:8px"></div>`;

  const bUnit = unitOf(best);   // the plate stack it was actually logged on
  return `
    ${sectionTitle(T("ex.progressTitle"), `<span style="font-size:11px;color:var(--faint)">${label}</span>`)}

    <div class="pb-card" style="padding:14px 15px;margin-bottom:12px;border-color:rgba(233,185,73,.45);background:rgba(233,185,73,.06)">
      <div style="display:flex;align-items:flex-end;gap:12px">
        <div style="flex:1;min-width:0">
          <div class="pb-label" style="margin-bottom:3px">${cardio ? T("ex.bestSession") : T("ex.bestSet")}</div>
          <div class="pb-num" style="font-size:32px;font-weight:700;line-height:1;color:var(--gold)">
            ${best.m}<span style="font-size:14px;color:var(--muted);font-weight:600"> ${unit}</span>
          </div>
        </div>
        <div style="text-align:right;font-size:12px;color:var(--muted);line-height:1.5">
          <div style="font-weight:600;color:var(--text)">${cardio
            ? `${esc(best.minutes)} min × RPE ${esc(best.intensity)}`
            : `${esc(best.reps)} × ${esc(best.weight)} ${bUnit}`}</div>
          <div>${fmtDate(best.date)}</div>
        </div>
      </div>
    </div>

    <div class="pb-card" style="padding:14px 8px 8px;margin-bottom:8px">
      ${chart.length >= 2
        ? `${chartToolbar(false, "ex")}
           <div data-linechart="ex" style="position:relative;width:100%;height:200px;touch-action:pan-y"></div>
           <div data-linedetail="ex">${renderPointDetail("ex")}</div>`
        : `<div style="height:120px;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:13px;text-align:center;padding:0 24px;line-height:1.5">
            ${T("ex.progressOne")}
          </div>`}
    </div>
    <div style="height:8px"></div>`;
}

function exWindowEditBody(f, library) {
  const groups = libraryGroups(library);
  const vid = youtubeId(f.video);
  /* Picking "＋ New group" hands off to the same group editor the Library
     uses, so a group invented here arrives with a colour like any other. */
  const musclePicker = `<div style="display:flex;gap:8px;align-items:center">
    <select class="pb-input" data-bind="exwinMuscle" style="flex:1">
      <option value="" disabled${f.muscle === "" ? " selected" : ""}>${T("ex.chooseGroup")}</option>
      ${groups.map((g) => `<option value="${esc(g)}"${f.muscle === g ? " selected" : ""}>${esc(groupLabel(g))}</option>`).join("")}
      <option value="__new">${T("ex.newGroupOption")}</option>
    </select>
    <button data-action="group-new" data-then="exwin" title="${T("groups.newMuscleGroup")}" class="pb-btn" style="flex-shrink:0;width:42px;height:42px;color:var(--gold);background:rgba(233,185,73,.08);border:1px solid rgba(233,185,73,.4)">${icon("plus", 17, 'stroke-width="2.6"')}</button>
  </div>`;

  const imageBlock = f.image
    ? `<div style="position:relative;margin-bottom:8px">
        <img src="${esc(f.image)}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;border:1px solid var(--border);display:block">
        <button type="button" data-action="exwin-remove-image" class="pb-btn" style="position:absolute;top:8px;right:8px;width:34px;height:34px;border-radius:10px;background:rgba(0,0,0,.55);color:#fff">${icon("trash-2", 16)}</button>
      </div>
      <label class="pb-btn pb-ghost" style="width:100%;padding:10px 0;font-size:13.5px;cursor:pointer">
        ${icon("image", 15)} ${T("ex.replacePhoto")}
        <input type="file" accept="image/*" data-filebind="exwin.image" style="display:none">
      </label>`
    : `<label class="pb-placeholder" style="height:120px;cursor:pointer;flex-direction:column;gap:8px;color:var(--faint)">
        ${icon("image-plus", 22)}
        <span style="font-size:12px;letter-spacing:.04em;text-transform:none;font-weight:600">${T("ex.uploadPhoto")}</span>
        <input type="file" accept="image/*" data-filebind="exwin.image" style="display:none">
      </label>`;

  return `
    ${field(T("ex.nameRequired"), `<input class="pb-input" data-bind="exwin.name" value="${esc(exLabelOf(f))}" placeholder="—">`)}
    ${field(T("ex.groupRequired"), musclePicker, T("ex.groupHint"))}

    ${field(T("ex.photo"), imageBlock, T("ex.photoHint"))}

    ${field(T("ex.videoLabel"), `<input class="pb-input" type="url" inputmode="url" data-bind="exwin.video" value="${esc(f.video)}" placeholder="—">`,
      vid ? T("ex.videoOk") : (f.video ? T("ex.videoBad") : T("ex.videoHint")))}

    ${field(T("ex.details"), `<textarea class="pb-input" rows="4" data-bind="exwin.note" placeholder="—" style="resize:none">${esc(exFieldOf(f, "note"))}</textarea>`, T("ex.detailsHint"))}
    ${field(T("ex.equipment"), `<input class="pb-input" data-bind="exwin.equipment" value="${esc(exFieldOf(f, "equipment"))}" placeholder="—">`)}
    ${field(T("ex.alternatives"), `<input class="pb-input" data-bind="exwin.alternatives" value="${esc(exFieldOf(f, "alternatives"))}" placeholder="—">`)}

    ${!(ui.exWin && ui.exWin.isNew) ? `<button data-action="exwin-delete" class="pb-btn" style="width:100%;padding:12px 0;margin-top:6px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} ${T("ex.deleteBtn")}
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
  const saveLabel = filledCount ? T(draft.editing ? "wo.updateN" : "wo.saveN", { n: filledCount })
    : draft.entries.length ? T("wo.fillIn")
    : T("wo.nothingYet");

  const entries = draft.entries.map((e) => {
    const b = badges[e.id] || {};
    const empty = !entryHasData(e);
    return `<div class="pb-card" style="display:flex;align-items:center;margin-bottom:8px;overflow:hidden${empty ? ";border:1px dashed rgba(233,185,73,.55)" : ""}">
      <button data-action="edit-draft-entry" data-id="${e.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:12px 4px 12px 14px;text-align:left;color:var(--text)">
        <div style="width:4px;align-self:stretch;border-radius:2px;background:${colorFor(e.kind === "cardio" ? "Cardio" : muscleOf(e.exercise, library, e.muscle))}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${esc(exLabel(e.exercise))}</div>
          <div style="font-size:12px;color:${empty ? "var(--gold)" : "var(--muted)"}">
            ${empty
              ? (e.kind === "cardio" ? T("wo.noDataCardio")
                : isDetailed(e) ? T("wo.noDataSets")
                : T("wo.noData"))
              : entrySummary(e, unit)}
          </div>
        </div>
        ${b.metric != null ? `<div class="pb-num" style="font-weight:700;font-size:16px;color:${b.badge === "pr" ? "var(--gold)" : "var(--text)"}">${b.metric}</div>` : ""}
        ${icon("pencil", 14, 'style="color:var(--faint);flex-shrink:0"')}
      </button>
      <button data-action="open-exercise-window" data-name="${esc(e.exercise)}" title="${T("log.exerciseDetails")}" style="flex-shrink:0;padding:12px 14px;color:var(--faint);align-self:stretch;border-left:1px solid var(--border-soft)">${icon("info", 16)}</button>
    </div>`;
  }).join("");

  return fullScreen(50, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-worksheet" title="${draft.editing ? T("wo.close") : T("wo.closeKeep")}" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${draft.editing ? T("wo.edit") : T("wo.new")}</div>
      ${chip(T("common.week", { n: wk }), "var(--gold)")}
      ${draft.editing ? `<button data-action="delete-day" title="${T("wo.deleteDay")}" style="color:var(--red);padding:4px">${icon("trash-2", 19)}</button>` : ""}
    </div>

    <div class="pb-scroll" data-scrollkey="worksheet" style="flex:1;overflow-y:auto;padding:14px 16px 120px">
      ${field(T("wo.date"), `<input type="date" class="pb-input" data-bind="draft.date" value="${esc(draft.date)}">`)}

      ${sectionTitle(T("wo.exercisesThis"))}
      ${draft.entries.length === 0 ? `<div class="pb-card" style="padding:20px;text-align:center;color:var(--faint);font-size:13px;line-height:1.5;margin-bottom:10px">
        ${T("wo.emptyHint")}
      </div>` : ""}
      ${entries}

      <button data-action="open-picker" class="pb-btn pb-ghost" style="width:100%;padding:13px 0;border-style:dashed;margin-top:4px">
        ${icon("plus", 17)} ${T("wo.addExercise")}
      </button>

      ${renderTimerList()}
    </div>

    <div style="position:absolute;bottom:0;left:0;right:0;padding:12px 16px 18px;background:linear-gradient(transparent, var(--bg) 30%)">
      ${emptyCount ? `<div style="font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:8px;line-height:1.45">${emptyCount === 1 ? T("wo.stillNeedOne") : T("wo.stillNeed", { n: TN("exercise", emptyCount) })}</div>` : ""}
      ${!draft.editing && draft.entries.length ? `<div style="font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:8px;line-height:1.45">${T("wo.draftNote")}</div>` : ""}
      ${draft.entries.length ? `<button data-action="save-as-preset" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:14.5px;margin-bottom:8px">
        ${icon("bookmark-plus", 16)} ${T("preset.saveTitle")}
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
  /* two different lists on one screen: you can pick an uncategorized lift, but
     you can never file a new one into the bucket by hand */
  const groups = allGroups(library);
  const pickable = libraryGroups(library);
  const match = library.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  const exact = library.some((x) => x.name.toLowerCase() === q.trim().toLowerCase());

  let html = "";
  if (q.trim() && !exact && !quick) {
    html += `<button data-action="quick-add-start" class="pb-btn pb-ghost" style="width:100%;padding:12px 14px;justify-content:flex-start;margin-bottom:10px;border-color:rgba(233,185,73,.4);color:var(--gold)">
      ${icon("plus", 16)} ${T("pick.addToLibrary", { name: esc(q.trim()) })}
    </button>`;
  }
  if (quick) {
    html += `<div class="pb-card" style="padding:14px;margin-bottom:12px">
      <div style="font-weight:700;font-size:14px;margin-bottom:10px">${T("pick.whichMuscle", { name: esc(quick.name) })}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${pickable.map((g) => `<button data-action="quick-add-muscle" data-g="${esc(g)}" class="pb-chip" style="padding:8px 14px;font-size:13px;color:${colorFor(g)};border-color:${colorFor(g)}55;background:${colorFor(g)}14">${esc(groupLabel(g))}</button>`).join("")}
        <button data-action="group-new" data-then="quickadd" title="${T("groups.newMuscleGroup")}" class="pb-chip" style="padding:8px 12px;font-size:13px;color:var(--gold);border-color:rgba(233,185,73,.4);background:rgba(233,185,73,.08)">${icon("plus", 13, 'stroke-width="2.6"')}</button>
      </div>
      <div style="font-size:11.5px;color:var(--faint);margin-top:10px">${T("pick.quickHint")}</div>
    </div>`;
  }
  html += groups.filter((g) => match.some((x) => x.muscle === g)).map((g) => `<div style="margin-bottom:14px">
    ${sectionTitle(`<span style="color:${colorFor(g)}">${esc(groupLabel(g))}</span>`)}
    <div class="pb-card" style="overflow:hidden">
      ${match.filter((x) => x.muscle === g).map((ex, i, arr) => `<div style="display:flex;align-items:center;border-bottom:${i < arr.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        <button data-action="pick-exercise" data-id="${ex.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:12px 4px 12px 14px;text-align:left;color:var(--text)">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px">${esc(exLabelOf(ex))}</div>
            <div style="font-size:11.5px;color:var(--faint)">${esc(exFieldOf(ex, "equipment"))}</div>
          </div>
          ${icon("plus", 16, 'style="color:var(--gold);flex-shrink:0"')}
        </button>
        <button data-action="open-exercise-window" data-name="${esc(ex.name)}" title="${T("log.exerciseDetails")}" style="flex-shrink:0;padding:12px 14px;color:var(--faint);align-self:stretch">${icon("info", 16)}</button>
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
      ${T("preset.pickerEmpty")}
    </div>`;

  return presets.map((p) => {
    const exs = p.exercises || [];
    return `<div class="pb-card" style="margin-bottom:12px;overflow:hidden">
      <div style="padding:13px 14px">
        <div style="display:flex;align-items:baseline;gap:8px">
          <div class="pb-num" style="font-weight:700;font-size:16px;flex:1;min-width:0">${esc(p.name)}</div>
          ${chip(TN("move", exs.length), "var(--gold)")}
        </div>
        ${p.description ? `<div style="font-size:12.5px;color:var(--muted);margin-top:3px">${esc(p.description)}</div>` : ""}
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:11px">${presetExerciseList(exs)}</div>
      </div>
      <button data-action="apply-preset" data-id="${esc(p.id)}" class="pb-btn pb-gold" style="width:100%;padding:12px 0;font-size:14px;border-radius:0">
        ${icon("plus", 16)} ${exs.length === 1 ? T("preset.addOne") : T("preset.addAll", { n: exs.length })}
      </button>
    </div>`;
  }).join("") + `<div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin:2px 4px 0">${T("preset.pickerFooter")}</div>`;
}

function renderExercisePicker(library) {
  const seg = ui.pickerSeg;
  return fullScreen(60, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px">
      <button data-action="close-picker" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
      <div style="position:relative;flex:1">
        ${seg === "exercises"
          ? `${icon("search", 15, 'style="position:absolute;left:11px;top:12px;color:var(--faint)"')}
             <input class="pb-input" style="padding-left:34px" placeholder="${T("pick.search")}" data-bind="pickq" value="${esc(ui.pickerQ)}" data-autofocus>`
          : `<div class="pb-num" style="font-size:17px;font-weight:700;padding:8px 2px">${T("preset.pickerTitle")}</div>`}
      </div>
    </div>
    <div style="padding:0 16px 4px">
      ${segControl("picker-seg", seg, [["exercises", T("lib.exercises")], ["presets", T("lib.presets")]])}
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
    const m = est1RM(+s.weight, +s.reps);
    const isBest = top && s.id === top.id && filled.length > 1;
    const blank = !setHasData(s);
    return `<div class="pb-card" style="display:flex;align-items:center;margin-bottom:8px;overflow:hidden${blank ? ";border:1px dashed rgba(233,185,73,.55)" : ""}">
      <button data-action="edit-set" data-id="${s.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:11px 4px 11px 12px;text-align:left;color:var(--text)">
        <div class="pb-num" style="width:24px;height:24px;border-radius:7px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:var(--muted);flex-shrink:0">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14.5px;color:${blank ? "var(--gold)" : "var(--text)"}">
            ${blank ? T("sets.fillIn") : `${esc(s.reps)} × ${esc(s.weight)} ${unit}`}
          </div>
          ${!blank ? `<div style="font-size:11.5px;color:var(--faint)">${T("sets.est1rm", { n: m })}${s.rpe ? ` · RPE ${esc(s.rpe)}` : ""}</div>` : ""}
        </div>
        ${isBest ? chip(T("sets.best"), "var(--gold)") : ""}
        ${icon("pencil", 14, 'style="color:var(--faint);flex-shrink:0"')}
      </button>
      <button data-action="remove-set" data-id="${s.id}" title="${T("sets.remove")}" style="flex-shrink:0;padding:12px 13px;color:var(--red);align-self:stretch;border-left:1px solid var(--border-soft)">${icon("x", 16)}</button>
    </div>`;
  }).join("");

  return `
    ${sectionTitle(filled.length ? T("sets.titleN", { n: filled.length }) : T("sets.title"), list.length ? `<span style="font-size:11px;color:var(--faint)">${T("sets.tapToEdit")}</span>` : "")}
    <button data-action="add-set" class="pb-btn pb-ghost" style="width:100%;padding:13px 0;border-style:dashed;margin-bottom:10px">
      ${icon("plus", 17)} ${T("sets.add")}
    </button>
    ${list.length ? rows : `<div class="pb-card" style="padding:20px;text-align:center;color:var(--faint);font-size:13px;line-height:1.55;margin-bottom:10px">
      ${T("sets.none")}
    </div>`}`;
}

function renderEntryFields(form, unit) {
  const { f, isDraft } = form;
  const { cardio, metric, preview, valid } = entryComputed();
  const detailed = isDetailed(f);
  const eUnit = unitOf(f);

  const inputs = cardio
    ? `<div style="display:flex;gap:10px">
        <div style="flex:1">${field(T("entry.minutes"), `<input class="pb-input" ${NUM} data-bind="entry.minutes" value="${esc(f.minutes)}" placeholder="—">`)}</div>
        <div style="flex:1">${field(T("entry.intensity"), `<input class="pb-input" ${NUM} data-bind="entry.intensity" value="${esc(f.intensity)}" placeholder="—">`)}</div>
      </div>`
    : detailed
    ? renderSetList(f, eUnit)
    : `<div style="display:flex;gap:10px">
        <div style="flex:1">${field(T("entry.totalSets"), `<input class="pb-input" ${NUM} data-bind="entry.sets" value="${esc(f.sets)}" placeholder="—">`)}</div>
        <div style="flex:1">${field(T("entry.topReps"), `<input class="pb-input" ${NUM} data-bind="entry.reps" value="${esc(f.reps)}" placeholder="—">`)}</div>
      </div>
      <div style="display:flex;gap:10px">
        <div style="flex:1">${field(labelWith(T("entry.topWeight"), unitSelect(eUnit)), `<input class="pb-input" ${NUM} data-bind="entry.weight" value="${esc(f.weight)}" placeholder="—">`,
          T("entry.weightHint"))}</div>
        <div style="flex:1">${field(labelWith(T("entry.rpe")), `<input class="pb-input" ${NUM} data-bind="entry.rpe" value="${esc(f.rpe)}" placeholder="—">`, T("entry.rpeHint"))}</div>
      </div>`;

  /* Entries logged before per-set logging existed have no setList and are left
     exactly as they were. This is the opt-in door across: it keeps the recorded
     top set as set 1 and lets the rest be filled in. */
  const convert = !cardio && !detailed
    ? `<button data-action="entry-to-detailed" class="pb-btn pb-ghost" style="width:100%;padding:11px 0;font-size:13.5px;margin-bottom:14px;border-style:dashed;color:var(--gold);border-color:rgba(233,185,73,.45)">
        ${icon("list-plus", 15)} ${T("entry.convert")}
      </button>
      <div style="font-size:11.5px;color:var(--faint);margin:-8px 2px 14px;line-height:1.5">${T("entry.convertHint")}</div>`
    : "";

  return fullScreen(70, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 6px">
      <button data-action="close-entry" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
      <div style="flex:1">
        <div class="pb-num" style="font-size:18px;font-weight:700;line-height:1.15">${esc(exLabel(f.exercise))}</div>
        <div style="font-size:11.5px;color:var(--faint)">${cardio ? T("entry.cardioSub") : detailed ? T("entry.setsSub") : T("entry.topSetSub")}</div>
      </div>
      <button data-action="delete-entry-form" style="color:var(--red);padding:6px">${icon("trash-2", 18)}</button>
    </div>

    <div class="pb-scroll" data-scrollkey="entryform" style="flex:1;overflow-y:auto;padding:10px 16px 120px">
      ${!isDraft ? field("Date", `<input type="date" class="pb-input" data-bind="entry.date" value="${esc(f.date)}">`) : ""}
      ${convert}
      ${inputs}
      ${field(T("entry.notes"), `<textarea class="pb-input" rows="2" data-bind="entry.notes" placeholder="—" style="resize:none">${esc(f.notes)}</textarea>`,
        detailed ? T("entry.notesHint") : "")}

      <!-- live computed row — the sheet's Est. 1RM + "vs. Your Best" -->
      <div class="pb-card2" style="padding:12px 14px;display:flex;align-items:center;gap:12px;margin-top:4px">
        <div>
          <div class="pb-label">${cardio ? T("entry.sessionLoad") : detailed ? T("entry.bestSet1rm", { unit }) : T("entry.est1rm", { unit })}</div>
          <div id="entryMetric" class="pb-num" style="font-size:30px;font-weight:700;color:var(--gold);line-height:1.05">${metric ?? "—"}</div>
        </div>
        <div id="entryBadge" style="flex:1;text-align:right;font-size:13px;font-weight:700;color:${preview === "pr" ? "var(--gold)" : preview === "first" ? "var(--blue)" : "var(--muted)"}">
          ${preview ? BADGE_TEXT[preview] : cardio ? T("entry.cardioFormula") : T("entry.rmFormula")}
        </div>
      </div>
      ${!cardio && eUnit !== unit ? `<div style="font-size:11.5px;color:var(--faint);margin:8px 2px 0;line-height:1.5">
        ${T("entry.converted", { from: eUnit, to: unit })}
      </div>` : ""}
      ${detailed ? `<div style="font-size:11.5px;color:var(--faint);margin:8px 2px 0;line-height:1.5">
        ${T("entry.highestNote")}
      </div>` : ""}

      ${renderTimerList()}
    </div>

    <div style="position:absolute;bottom:0;left:0;right:0;padding:12px 16px 18px;background:linear-gradient(transparent, var(--bg) 30%)">
      <button id="entrySaveBtn" data-action="save-entry-form" ${valid ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:15px 0;font-size:16px;opacity:${valid ? 1 : 0.45}">
        ${icon("check", 18)} ${isDraft ? T("entry.addToWorkout") : T("common.saveChanges")}
      </button>
    </div>
  `, "entryForm");
}

/* the single-set editor — same idea as the entry form, one level down */
function renderSetForm(form, unit) {
  const { s, isNew, index } = form;
  const m = est1RM(+s.weight, +s.reps);
  const ok = setHasData(s);
  return sheet(isNew ? T("setForm.add", { n: index + 1 }) : T("setForm.edit", { n: index + 1 }), "setForm", `
    <div style="display:flex;gap:10px">
      <div style="flex:1">${field(labelWith(T("setForm.reps")), `<input class="pb-input" ${NUM} data-bind="set.reps" value="${esc(s.reps)}" placeholder="—" data-autofocus>`)}</div>
      <div style="flex:1">${field(labelWith(T("setForm.weight"), unitSelect(unit)), `<input class="pb-input" ${NUM} data-bind="set.weight" value="${esc(s.weight)}" placeholder="—">`)}</div>
    </div>
    ${field(T("entry.rpe"), `<input class="pb-input" ${NUM} data-bind="set.rpe" value="${esc(s.rpe)}" placeholder="—">`, T("setForm.rpeHint"))}

    <div class="pb-card2" style="padding:11px 14px;display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div>
        <div class="pb-label">${T("entry.est1rm", { unit })}</div>
        <div id="setMetric" class="pb-num" style="font-size:26px;font-weight:700;color:var(--gold);line-height:1.05">${m ?? "—"}</div>
      </div>
      <div style="flex:1;text-align:right;font-size:12px;color:var(--faint)">${T("entry.rmFormula")}</div>
    </div>

    <button id="setSaveBtn" data-action="save-set" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">
      ${icon("check", 17)} ${isNew ? T("setForm.addBtn") : T("setForm.saveBtn")}
    </button>
    ${!isNew ? `<button data-action="delete-set" class="pb-btn" style="width:100%;padding:12px 0;margin-top:8px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} ${T("setForm.removeBtn")}
    </button>` : ""}
  `, 100);
}

/* live 1RM + save-button state while typing in the set editor */
function updateSetPreview() {
  if (!ui.setForm) return;
  const s = ui.setForm.s;
  const m = est1RM(+s.weight, +s.reps);
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
    b.textContent = preview ? BADGE_TEXT[preview] : cardio ? T("entry.cardioFormula") : T("entry.rmFormula");
  }
  if (s) { s.disabled = !valid; s.style.opacity = valid ? 1 : 0.45; }
}

/* ───────────────────── BODY MEASUREMENTS (window) ───────────────────
   Body check-ins happen every week or two, not every session, so they no
   longer take up one of the five slots along the bottom of the screen.
   The whole section, unchanged, opens as a window from the ruler button
   sitting next to the gear — same list, same stats, same editor. */

function renderBodyWindow(body, unit) {
  return fullScreen(80, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-body" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      ${icon("ruler", 19, 'style="color:var(--gold);flex-shrink:0"')}
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${T("title.body")}</div>
      <button data-action="new-body" class="pb-btn pb-gold" style="padding:8px 14px;font-size:13.5px">${icon("plus", 15)} ${T("common.new")}</button>
    </div>
    <div class="pb-scroll" data-scrollkey="bodywin" style="flex:1;overflow-y:auto;padding-bottom:30px">
      ${renderBody(body, unit)}
    </div>
  `, "bodyWin");
}

function renderBody(body, unit) {
  const t = bodyTrend(body);
  const rows = [...body].sort((a, b) => (a.date < b.date ? 1 : -1));

  const list = rows.length === 0
    ? `<div class="pb-card" style="padding:26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.6">
        ${icon("ruler", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
        ${T("body.empty")}
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
      ${stat(T("body.starting"), t.first ?? "—", unit)}
      ${stat(T("body.latest"), t.last ?? "—", unit)}
      ${stat(T("body.change"), t.change == null ? "—" : (t.change > 0 ? "+" : "") + t.change, unit, t.change > 0 ? "var(--green)" : t.change < 0 ? "var(--blue)" : "")}
      ${stat(T("body.checkins"), t.count)}
    </div>

    ${list}

    <div style="font-size:12px;color:var(--faint);line-height:1.55;margin:0 4px 14px">
      ${T("body.footer")}
    </div>

    <!-- PLACEHOLDER_BODY_GRAPH_SLOT — future measurement graphs -->
    ${placeholder("PLACEHOLDER_BODY_GRAPH_SLOT", 90, T("body.graphSlot"))}
    <div style="height:14px"></div>
  </div>`;
}

function renderBodyFormSheet(f, unit) {
  const isNew = ui.bodyFormWasNew;
  const num = (label, bind, val) => `<div style="flex:1">${field(label, `<input class="pb-input" ${NUM} data-bind="${bind}" value="${esc(val)}">`)}</div>`;
  return sheet(isNew ? T("body.newCheckin") : T("body.editCheckin"), "bodyForm", `
    ${field(T("body.date"), `<input type="date" class="pb-input" data-bind="body.date" value="${esc(f.date)}">`)}
    <div style="display:flex;gap:10px">${num(T("body.weight", { unit }), "body.weight", f.weight)}${num(T("body.waist"), "body.waist", f.waist)}</div>
    <div style="display:flex;gap:10px">${num(T("body.chest"), "body.chest", f.chest)}${num(T("body.arm"), "body.arm", f.arm)}</div>
    <div style="display:flex;gap:10px">${num(T("body.thigh"), "body.thigh", f.thigh)}${num(T("body.glutes"), "body.glutes", f.glutes)}</div>
    ${field(T("body.notes"), `<textarea class="pb-input" rows="2" data-bind="body.notes" style="resize:none">${esc(f.notes)}</textarea>`)}
    <button data-action="save-body" class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15px;margin-top:4px">${icon("check", 17)} ${T("body.saveBtn")}</button>
    ${!isNew ? `<button data-action="delete-body" class="pb-btn" style="width:100%;padding:12px 0;margin-top:8px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} ${T("common.delete")}
    </button>` : ""}
  `, 100);   /* above the Body window it opens from */
}

/* ═══════════════════════════ TIMERS ════════════════════════════════
   A timer is {id,name,duration,endsAt,remaining,doneAt,pinned}. `endsAt` is an
   absolute timestamp rather than a ticking countdown, so a running timer
   stays honest through a re-render, a backgrounded tab, or the app being
   closed and reopened: anything that ran out while you were away is caught
   the moment you come back. Saved timers are reusable — start, pause,
   reset, start again — and any number can run at once.               */

const RING_C = 326.73;   /* 2πr for the r=52 progress ring below */

/* Up to three timers ride along on the home screen. The cap is the layout:
   three dials sit side by side across a phone and still read from arm's
   length. Anything pinned past that simply doesn't make the row. */
const MAX_PINNED_TIMERS = 3;
const pinnedTimers = () => (state.timers || []).filter((t) => t.pinned).slice(0, MAX_PINNED_TIMERS);

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

/* ── THE ALERT SOUNDS ─────────────────────────────────────────────────
   Every one of these is synthesised on the spot out of oscillators, not
   loaded from an audio file. That's deliberate: the app is a PWA people
   install and use in a basement gym with no signal, and a folder of mp3s
   would be a download to wait for, a cache to miss, and a licence to
   worry about. A dozen notes of Web Audio weigh nothing, work offline on
   the first run, and can't 404.

   A sound is a list of notes: [start, frequency, length, waveform, gain,
   glideTo?]. Times are seconds from the moment it fires; `glideTo` sweeps
   the pitch across the note, which is what makes the siren and the swoop.
   Keep the peak gains ≤ 1 — the master level below is what actually sets
   the loudness, and it's per timer.                                    */

const SOUND_LIB = {
  /* the original three-tone — still the default */
  chime:    [[0, 880, .32, "sine", 1], [.34, 880, .32, "sine", 1], [.68, 1175, .36, "sine", 1]],
  /* one clean strike, for people who want to be told once */
  ding:     [[0, 1319, .55, "sine", 1], [0, 2637, .35, "sine", .28]],
  /* doorbell */
  dingdong: [[0, 988, .45, "sine", 1], [.26, 784, .75, "sine", 1]],
  /* struck bell with its overtones, long tail */
  bell:     [[0, 1568, 1.4, "sine", .9], [0, 2350, .9, "sine", .3], [0, 3136, .6, "sine", .18]],
  /* deep temple gong */
  gong:     [[0, 196, 2.2, "sine", 1], [0, 294, 1.6, "sine", .45], [0, 98, 2.4, "sine", .5]],
  /* wooden mallet run, four notes up */
  marimba:  [[0, 523, .26, "triangle", 1], [.13, 659, .26, "triangle", 1], [.26, 784, .26, "triangle", 1], [.39, 1046, .5, "triangle", 1]],
  /* digital watch: three tight blips */
  beep:     [[0, 1000, .1, "square", .6], [.16, 1000, .1, "square", .6], [.32, 1000, .16, "square", .6]],
  /* the impatient one — eight alternating blips you cannot ignore */
  alarm:    Array.from({ length: 8 }, (_, i) => [i * .14, i % 2 ? 1100 : 880, .09, "square", .55]),
  /* rising arcade swoop */
  arcade:   [[0, 440, .12, "square", .5], [.1, 660, .12, "square", .5], [.2, 880, .12, "square", .5], [.3, 1320, .3, "square", .5, 1760]],
  /* harsh buzzer, two pulses, for the last set of the day */
  buzzer:   [[0, 180, .28, "sawtooth", .45], [.36, 180, .38, "sawtooth", .45]],
  /* a slow two-tone siren sweep */
  siren:    [[0, 600, .5, "triangle", .7, 1000], [.5, 1000, .5, "triangle", .7, 600]],
  /* barely there: one soft tick, for training somewhere quiet */
  soft:     [[0, 660, .18, "sine", .5], [.2, 880, .3, "sine", .5]],
};

/* the order they're offered in, quiet-and-friendly first, insistent last.
   (DEFAULT_SOUND / DEFAULT_VOLUME live up in the storage section, because
   the seeded timers are built before this file gets this far.) */
const SOUND_IDS = ["chime", "ding", "dingdong", "bell", "marimba", "soft", "gong", "beep", "alarm", "arcade", "siren", "buzzer"];

const soundLabel = (id) => T("sound." + id);
const soundOf = (t) => (t && SOUND_LIB[t.sound] ? t.sound : DEFAULT_SOUND);
const volumeOf = (t) => {
  const v = t && t.volume;
  return v == null || isNaN(+v) ? DEFAULT_VOLUME : Math.max(0, Math.min(1, +v));
};

/* 0.4 at full volume matches the loudness the single old chime played at,
   so nothing gets louder by accident — the slider only goes down from what
   people are already used to */
const SOUND_CEILING = 0.4;

function playSound(id, volume = DEFAULT_VOLUME) {
  unlockAudio();
  const notes = SOUND_LIB[id] || SOUND_LIB[DEFAULT_SOUND];
  const vol = Math.max(0, Math.min(1, volume));
  if (!audioCtx || vol <= 0) return;          // muted is a real choice, honour it
  try {
    const t0 = audioCtx.currentTime + 0.02;
    for (const [at, f, dur, type, g, glide] of notes) {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0 + at);
      if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t0 + at + dur);
      const peak = Math.max(0.0001, g * vol * SOUND_CEILING);
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t0 + at); osc.stop(t0 + at + dur + 0.02);
    }
  } catch { /* ignore — a missing chime never blocks a workout */ }
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
      const n = new Notification(timerLabel(t) || T("timers.listTitle"), {
        body: T("timers.notifBody", { time: fmtClock(t.duration) }),
        icon: "logoC.png", badge: "logoC.png", tag: "pbt-" + t.id, renotify: true,
      });
      n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n.close(); };
    }
  } catch { /* some browsers only allow notifications from a service worker */ }
}

function fireTimer(t) {
  t.endsAt = null; t.remaining = null; t.doneAt = Date.now();
  try { if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]); } catch { /* ignore */ }
  playSound(soundOf(t), volumeOf(t));
  notifyDone(t);
  ui.timerToast = { id: t.id, name: timerLabel(t) || T("timers.listTitle") };
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
    const clock = fmtClock(left);
    /* the same timer can be on screen more than once — its card on the Timer
       tab, its dial on Home, its pill in the workout window — so every copy
       is addressed by attribute, not by a single id. */
    document.querySelectorAll(`[data-tmr-time="${t.id}"]`).forEach((el) => { el.textContent = clock; });
    const frac = t.duration > 0 ? Math.max(0, Math.min(1, left / t.duration)) : 0;
    document.querySelectorAll(`[data-tmr-ring="${t.id}"]`).forEach((el) => {
      const c = +el.dataset.ringC || RING_C;
      el.setAttribute("stroke-dashoffset", (c * (1 - frac)).toFixed(2));
    });
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
    ? `<button data-action="timer-start" data-id="${t.id}" class="pb-btn pb-gold" style="flex:1;padding:9px 0;font-size:13px">${icon("rotate-ccw", 14)} ${T("timers.again")}</button>
       <button data-action="timer-reset" data-id="${t.id}" class="pb-btn pb-ghost" style="flex:1;padding:9px 0;font-size:13px">${icon("check", 14)} ${T("timers.doneBtn")}</button>`
    : phase === "paused"
    ? `<button data-action="timer-start" data-id="${t.id}" class="pb-btn pb-gold" style="flex:1;padding:9px 0;font-size:13px">${icon("play", 14)} ${T("timers.resume")}</button>
       <button data-action="timer-reset" data-id="${t.id}" class="pb-btn pb-ghost" style="flex:1;padding:9px 0;font-size:13px">${icon("rotate-ccw", 14)} ${T("timers.reset")}</button>`
    : `<button data-action="timer-pause" data-id="${t.id}" class="pb-btn pb-ghost" style="flex:1;padding:9px 0;font-size:13px">${icon("pause", 14)} ${T("timers.pause")}</button>
       <button data-action="timer-reset" data-id="${t.id}" class="pb-btn pb-ghost" style="flex:1;padding:9px 0;font-size:13px">${icon("square", 13)} ${T("timers.stop")}</button>`;

  return `<div class="pb-card${done ? " pb-timer-done" : ""}" style="padding:15px 14px;margin-bottom:10px;display:flex;align-items:center;gap:15px;${done ? "border-color:rgba(106,164,101,.55)" : phase === "running" ? "border-color:rgba(233,185,73,.4)" : ""}">
    <div style="position:relative;width:108px;height:108px;flex-shrink:0">
      <svg width="108" height="108" viewBox="0 0 120 120" style="display:block;transform:rotate(-90deg)">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface2)" stroke-width="9"/>
        <circle data-tmr-ring="${t.id}" data-ring-c="${RING_C}" cx="60" cy="60" r="52" fill="none" stroke="${ringColor}" stroke-width="9"
                stroke-linecap="round" stroke-dasharray="${RING_C}" stroke-dashoffset="${(RING_C * (1 - frac)).toFixed(2)}"
                style="transition:stroke-dashoffset .25s linear"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div data-tmr-time="${t.id}" class="pb-num" style="font-size:${done ? 19 : 25}px;font-weight:700;line-height:1;color:${done ? "var(--green)" : "var(--text)"}">${done ? T("timers.doneWord") : fmtClock(left)}</div>
        <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-top:3px">${done ? T("timers.timesUpSmall") : phase === "paused" ? T("timers.paused") : T("timers.remaining")}</div>
      </div>
    </div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;min-width:0;font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(timerLabel(t))}</div>
        ${pinButton(t)}
      </div>
      <div style="font-size:12px;color:var(--faint);margin-top:2px">${T("timers.durationTimer", { time: fmtClock(t.duration) })}</div>
      <div style="display:flex;gap:7px;margin-top:12px">${controls}</div>
    </div>
  </div>`;
}

/* Pin a timer and it rides along on the home screen as a round dial. Three
   at a time; the fourth tap says so rather than silently doing nothing. */
function pinButton(t) {
  const on = !!t.pinned;
  return `<button data-action="timer-pin" data-id="${t.id}" title="${on ? T("timers.unpin") : T("timers.pinTo")}"
    style="flex-shrink:0;padding:7px;color:${on ? "var(--gold)" : "var(--faint)"}">${icon(on ? "pin-off" : "pin", 16)}</button>`;
}

function timerIdleRow(t, last) {
  return `<div style="display:flex;align-items:center;border-bottom:${last ? "none" : "1px solid var(--border-soft)"}">
    <button data-action="timer-start" data-id="${t.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:12px 4px 12px 14px;text-align:left;color:var(--text)">
      <span style="width:34px;height:34px;border-radius:11px;background:rgba(233,185,73,.12);border:1px solid rgba(233,185,73,.3);display:flex;align-items:center;justify-content:center;color:var(--gold);flex-shrink:0">${icon("play", 15, 'fill="currentColor"')}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(timerLabel(t))}</div>
        <div class="pb-num" style="font-size:12.5px;color:var(--muted)">${fmtClock(t.duration)}</div>
      </div>
    </button>
    ${pinButton(t)}
    <button data-action="timer-edit" data-id="${t.id}" title="${T("timers.edit")}" style="flex-shrink:0;padding:12px 14px 12px 7px;color:var(--faint);align-self:stretch">${icon("pencil", 16)}</button>
  </div>`;
}

/* One list, no headings. Everything here is just "a timer you saved": the
   lengths the app ships with are ordinary rows you can rename, re-time,
   pin or delete, exactly like the ones you build yourself. Running timers
   float to the top as full dials so the countdown is the first thing you see. */
function renderTimers() {
  const timers = state.timers || [];
  const active = timers.filter((t) => timerPhase(t) !== "idle");
  const idle = timers.filter((t) => timerPhase(t) === "idle");

  return `<div class="" style="padding:14px 16px 0">
    ${active.map(timerActiveCard).join("")}

    ${idle.length
      ? `<div class="pb-card" style="overflow:hidden;margin-bottom:12px">${idle.map((t, i) => timerIdleRow(t, i === idle.length - 1)).join("")}</div>`
      : `<div class="pb-card" style="padding:${timers.length ? "16px" : "26px"};text-align:center;color:var(--muted);font-size:13.5px;line-height:1.6;margin-bottom:12px">
          ${timers.length ? T("timers.allRunning") : `${icon("timer", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}${T("timers.none")}`}
        </div>`}

    <button data-action="timer-add" class="pb-btn pb-ghost" style="width:100%;padding:13px 0;font-size:14px;border-style:dashed;margin-bottom:14px">
      ${icon("plus", 17)} ${T("timers.new")}
    </button>

    <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:0 4px 10px">
      ${T("timers.footer", { icon: icon("pin", 11) })}
    </div>
    <div style="height:8px"></div>
  </div>`;
}

/* ── timers where you're actually standing ────────────────────────────
   Rest starts the moment a set ends, not after you've closed two windows
   to reach the Timer tab. So your pinned timers ride along at the bottom
   of the workout window and of each exercise — the same round dials as on
   the home screen, one tap to start, pause or clear, somewhere you can
   reach without losing what you were typing.

   Deliberately the dials and not the full list: mid-set you want the two
   or three lengths you actually rest for, at a glance and at arm's length,
   not every timer you've ever saved. The Timer tab is still the place to
   build, edit and pin them. */

function renderTimerList() {
  if (!(state.timers || []).length) return "";
  const pinned = pinnedTimers();

  return `<div style="margin-top:22px">
    ${sectionTitle(T("timers.listTitle"), `<span style="font-size:11px;color:var(--faint)">${T("timers.listHint")}</span>`)}
    ${pinned.length
      ? `<div class="pb-card" style="padding:14px 12px 15px">
          <div style="display:flex;align-items:flex-start;gap:6px">${pinned.map((t) => pinnedTimerDial(t)).join("")}</div>
        </div>`
      : `<div class="pb-card" style="padding:16px;font-size:12.5px;color:var(--faint);line-height:1.5;text-align:center">
          ${T("home.noPinnedTimers", { icon: icon("pin", 11) })}
        </div>`}
  </div>`;
}

function renderTimerForm(form) {
  const { t, isNew } = form;
  const total = Math.max(0, (+t.min || 0) * 60 + (+t.sec || 0));
  const ok = total > 0;
  return sheet(isNew ? T("timers.new") : T("timers.edit"), "timerForm", `
    ${field(T("timers.nameLabel"), `<input class="pb-input" data-bind="timer.name" value="${esc(timerLabel(t) || t.name)}" placeholder="—" ${isNew ? "data-autofocus" : ""}>`, T("timers.nameHint"))}
    <div style="display:flex;gap:10px">
      <div style="flex:1">${field(T("timers.minutes"), `<input class="pb-input" ${NUM} data-bind="timer.min" value="${esc(t.min)}" placeholder="—">`)}</div>
      <div style="flex:1">${field(T("timers.seconds"), `<input class="pb-input" ${NUM} data-bind="timer.sec" value="${esc(t.sec)}" placeholder="—">`)}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:7px;margin:-4px 0 16px">
      ${SEED_TIMERS.map((s) => `<button data-action="timer-preset" data-s="${s}" class="pb-chip pb-num" style="padding:7px 13px;font-size:13px;font-weight:700;color:var(--muted)">${fmtClock(s)}</button>`).join("")}
    </div>
    <div class="pb-card2" style="padding:11px 14px;margin-bottom:14px;display:flex;align-items:baseline;gap:10px">
      <div class="pb-label">${T("timers.total")}</div>
      <div id="timerTotal" class="pb-num" style="font-size:24px;font-weight:700;color:${ok ? "var(--gold)" : "var(--faint)"};line-height:1">${ok ? fmtClock(total) : "—"}</div>
    </div>

    ${renderSoundPicker(t)}
    <button data-action="timer-form-pin" class="pb-btn" style="width:100%;padding:11px 0;font-size:13.5px;margin-bottom:14px;background:${t.pinned ? "rgba(233,185,73,.12)" : "var(--surface2)"};color:${t.pinned ? "var(--gold)" : "var(--muted)"};border:1px solid ${t.pinned ? "rgba(233,185,73,.4)" : "var(--border)"}">
      ${icon(t.pinned ? "pin-off" : "pin", 15)} ${t.pinned ? T("timers.pinned") : T("timers.pinTo")}
    </button>
    <button id="timerSaveBtn" data-action="timer-save" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">${icon("check", 17)} ${isNew ? T("timers.saveBtn") : T("common.saveChanges")}</button>
    ${!isNew ? `<button data-action="timer-delete" class="pb-btn" style="width:100%;padding:12px 0;margin-top:8px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} ${T("timers.deleteBtn")}
    </button>` : ""}
  `, 120);   /* the timer list is embedded in the workout and exercise windows too,
                so its editor has to sit above every one of them */
}

/* ── how this timer announces itself ──────────────────────────────────
   Sound and volume are per timer, not per app, because they're doing
   different jobs: a 30-second rest between working sets wants a quiet
   tick you'll hear over the music, and the 5-minute one you set before
   leaving for the water fountain wants a klaxon.

   Every chip plays as you tap it and the slider previews on release —
   picking an alert you've never heard is how you end up with a timer
   you sleep through. */
function renderSoundPicker(t) {
  const cur = soundOf(t);
  const vol = volumeOf(t);
  const pct = Math.round(vol * 100);

  const chips = SOUND_IDS.map((id) => {
    const on = id === cur;
    return `<button data-action="timer-sound" data-s="${id}" class="pb-chip" style="padding:8px 13px;font-size:12.5px;gap:6px;color:${on ? "var(--gold)" : "var(--muted)"};border-color:${on ? "rgba(233,185,73,.5)" : "var(--border)"};background:${on ? "rgba(233,185,73,.1)" : "var(--surface2)"}">
      ${icon(on ? "volume-2" : "play", 12)} ${soundLabel(id)}
    </button>`;
  }).join("");

  return `
    ${field(T("timers.sound"), `<div style="display:flex;flex-wrap:wrap;gap:7px">${chips}</div>`, T("timers.soundHint"))}
    ${field(labelWith(T("timers.volume")), `<div style="display:flex;align-items:center;gap:11px">
      <span data-volicon="on" style="display:${vol === 0 ? "none" : "inline-flex"};color:var(--muted);flex-shrink:0">${icon("volume-2", 17)}</span>
      <span data-volicon="off" style="display:${vol === 0 ? "inline-flex" : "none"};color:var(--faint);flex-shrink:0">${icon("volume-x", 17)}</span>
      <input class="pb-range" type="range" min="0" max="1" step="0.05" value="${vol}" data-bind="timer.volume" aria-label="${T("timers.volume")}" style="flex:1;min-width:0">
      <div id="timerVolPct" class="pb-num" style="width:46px;text-align:right;font-size:14px;font-weight:700;color:${vol === 0 ? "var(--faint)" : "var(--gold)"}">${vol === 0 ? T("timers.muted") : pct + "%"}</div>
      <button data-action="timer-sound-test" title="${T("timers.test")}" aria-label="${T("timers.test")}" class="pb-btn pb-ghost" style="width:36px;height:34px;border-radius:9px;color:var(--muted);flex-shrink:0">${icon("play", 14)}</button>
    </div>`, T("timers.volumeHint"))}`;
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

  /* the volume read-out has to keep up with the slider without a render,
     or the thumb jumps out from under the finger */
  const vol = volumeOf(t);
  const pct = document.getElementById("timerVolPct");
  if (pct) {
    pct.textContent = vol === 0 ? T("timers.muted") : Math.round(vol * 100) + "%";
    pct.style.color = vol === 0 ? "var(--faint)" : "var(--gold)";
  }
  /* both speaker icons are already mounted; muting just swaps which one is
     visible, so lucide never has to redraw mid-drag */
  const on = document.querySelector('[data-volicon="on"]'), off = document.querySelector('[data-volicon="off"]');
  if (on) on.style.display = vol === 0 ? "none" : "inline-flex";
  if (off) off.style.display = vol === 0 ? "inline-flex" : "none";
}

/* ─────────────────────────── PROFILE ──────────────────────────────── */

function renderProfile(f) {
  return fullScreen(80, `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-profile" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${T("profile.title")}</div>
      <button data-action="save-profile" class="pb-btn pb-gold" style="padding:8px 16px;font-size:13.5px">${T("common.save")}</button>
    </div>
    <div class="pb-scroll" data-scrollkey="profile" style="flex:1;overflow-y:auto;padding:16px 16px 40px">
      ${field(T("profile.name"), `<input class="pb-input" data-bind="profile.name" value="${esc(f.name)}" placeholder="—">`)}
      ${field(T("profile.language"), `<select class="pb-input" data-bind="profileLang" style="font-weight:600">
        ${LANGS.map((l) => `<option value="${l.code}"${resolveLang(f.lang) === l.code ? " selected" : ""}>${esc(l.label)}</option>`).join("")}
      </select>`)}
      ${field(T("profile.unit"), `<div style="display:flex;gap:8px">
        ${UNITS.map((u) => `<button data-action="profile-units" data-u="${u}" class="pb-btn" style="flex:1;padding:11px 0;background:${f.units === u ? "var(--gold)" : "var(--surface2)"};color:${f.units === u ? "var(--gold-ink)" : "var(--muted)"};border:1px solid ${f.units === u ? "var(--gold)" : "var(--border)"}">${u}</button>`).join("")}
      </div>`, T("profile.unitHint"))}
      ${field(T("profile.theme"), `<div style="display:flex;gap:8px">
        ${[["dark", T("profile.dark"), "moon"], ["light", T("profile.light"), "sun"]].map(([t, label, ic]) => {
          const on = (f.theme || "dark") === t;
          return `<button data-action="profile-theme" data-t="${t}" class="pb-btn" style="flex:1;padding:11px 0;background:${on ? "var(--gold)" : "var(--surface2)"};color:${on ? "var(--gold-ink)" : "var(--muted)"};border:1px solid ${on ? "var(--gold)" : "var(--border)"}">${icon(ic, 15)} ${label}</button>`;
        }).join("")}
      </div>`)}
      ${field(T("profile.startDate"), `<input type="date" class="pb-input" data-bind="profile.startDate" value="${esc(f.startDate)}">`, T("profile.startDateHint"))}
      ${field(T("profile.daysPerWeek"), `<input class="pb-input" ${NUM} data-bind="profile.daysPerWeek" value="${esc(f.daysPerWeek)}">`)}

      <div class="pb-hairline" style="margin:18px 0"></div>
      ${sectionTitle(T("profile.data"))}
      <button data-action="reset-all" class="pb-btn" style="width:100%;padding:13px 0;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
        ${icon("trash-2", 16)} ${T("profile.reset")}
      </button>
      <div style="font-size:11.5px;color:var(--faint);margin-top:10px;line-height:1.5">
        ${T("profile.dataHint")}
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

/* ══════════════════ THE PROGRESS GRAPH: AN INSTRUMENT ═══════════════
   The line chart is the one place where every number you've ever logged
   for a lift is visible at once, so it's built to be handled rather than
   admired: pinch or scroll to zoom, drag to pan, tap a dot to read the
   session behind it, and blow the whole thing up to fill the phone.

   Two rules make that survive the app's render-everything model:

   1. The view (which slice of the series is on screen) and the selection
      live in `ui`, not in this file's closures, so a re-render never
      resets what you were looking at.
   2. Every [data-linechart] of the same SCOPE is painted from the same
      state. The card in the tab and the fullscreen window are the same
      chart drawn twice; they can't drift apart.

   The scope is the value of the [data-linechart] attribute: "main" for the
   Progress tab's graph and "ex" for the copy at the bottom of the exercise
   window. Each scope has its own series (chartState.line / .exLine), its
   own zoom (ui.chartView[scope]) and its own selected dot, so the exercise
   window can sit on top of the Progress tab without either one hijacking
   the other. Every function down here takes the scope with it.

   Gestures redraw the chart while they're still going, so the in-flight
   pointer state has to outlive a redraw too — hence the module-level
   pointer map instead of variables inside the paint function.         */

/* which graph a tapped control belongs to — anything unmarked is the tab's */
const chartScope = (el) => (el && el.dataset.scope) || "main";

const CHART_MIN_SPAN = 1;         // never zoom past two points on screen
const CHART_TAP_SLOP = 7;         // px of movement still counted as a tap
const chartPointers = new Map();  // live pointers on a plot, by pointerId
let chartGesture = null;          // {mode:"pan"|"pinch", …} while one is running
let chartClipId = 0;              // unique <clipPath> ids, one per painted copy

/* the visible index window, clamped against the data every time it's read,
   so nothing can leave a view pointing off the end of a shorter series */
function chartWindow(n, scope) {
  const v = ui.chartView[scope] || { lo: 0, hi: n - 1 };
  const span = Math.min(Math.max(v.hi - v.lo, CHART_MIN_SPAN), n - 1);
  const lo = Math.max(0, Math.min(v.lo, n - 1 - span));
  return { lo, hi: lo + span };
}

/* zoom around a focal index — the point under the fingers stays put */
function chartZoom(factor, focus, scope) {
  const line = lineOf(scope);
  if (!line || line.data.length < 2) return;
  const n = line.data.length;
  const { lo, hi } = chartWindow(n, scope);
  const span = hi - lo;
  const fi = focus == null ? (lo + hi) / 2 : focus;
  const t = span > 0 ? (fi - lo) / span : 0.5;
  const next = Math.min(Math.max(span / factor, CHART_MIN_SPAN), n - 1);
  const nlo = fi - t * next;
  ui.chartView[scope] = next >= n - 1 ? null : { lo: nlo, hi: nlo + next };
  drawLineChart();
  refreshChartToolbars();
}

function chartPan(dIndex, scope) {
  const line = lineOf(scope);
  if (!line) return;
  const { lo, hi } = chartWindow(line.data.length, scope);
  ui.chartView[scope] = { lo: lo + dIndex, hi: hi + dIndex };
  drawLineChart();
}

/* Selecting a dot repaints the chart and rewrites the detail panels in
   place. A full render() here would rebuild the page under the finger
   mid-gesture, so this is deliberately surgical. */
function chartSelect(id, scope) {
  ui.chartSel[scope] = id;
  drawLineChart();
  document.querySelectorAll(`[data-linedetail="${scope}"]`).forEach((el) => { el.innerHTML = renderPointDetail(scope); });
  /* keep the session list under the chart in step with the dot */
  document.querySelectorAll(`[data-action="chart-pick"][data-scope="${scope}"]`).forEach((el) => {
    el.style.background = el.dataset.id === id ? "rgba(233,185,73,.08)" : "transparent";
  });
  if (window.lucide) lucide.createIcons();
}

/* the reset button appears and disappears with the zoom, so the toolbars
   are rebuilt whenever the view changes */
function refreshChartToolbars() {
  document.querySelectorAll("[data-charttoolbar]").forEach((el) => {
    el.innerHTML = chartToolbarInner(el.dataset.full === "1", el.dataset.charttoolbar);
  });
  if (window.lucide) lucide.createIcons();
}

function drawLineChart() {
  document.querySelectorAll("[data-linechart]").forEach(paintLineChart);
}

function paintLineChart(wrap) {
  const scope = wrap.dataset.linechart || "main";
  const line = lineOf(scope);
  if (!line) { wrap.innerHTML = ""; return; }
  const { data, goal } = line;
  const n = data.length;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (n < 2 || !W || !H) return;

  const left = 46, right = W - 14, top = 8, bottom = H - 26;
  const plotW = right - left, plotH = bottom - top;
  if (plotW < 20 || plotH < 20) return;

  const cGrid = themeColor("--border-soft"), cAxis = themeColor("--border"), cTick = themeColor("--faint"),
        cGold = themeColor("--gold"), cDot = themeColor("--bg"), cGreen = themeColor("--green"),
        cText = themeColor("--text");

  const { lo, hi } = chartWindow(n, scope);
  const span = hi - lo;
  /* one point of margin either side keeps the line entering and leaving the
     frame instead of starting in mid-air at the edge of the zoom */
  const i0 = Math.max(0, Math.floor(lo) - 1), i1 = Math.min(n - 1, Math.ceil(hi) + 1);
  const shown = data.slice(Math.max(0, Math.floor(lo)), Math.min(n - 1, Math.ceil(hi)) + 1);
  const vals = (shown.length ? shown : data).map((d) => d.y);

  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 5);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const yOf = (v) => bottom - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const xOf = (i) => left + ((i - lo) / span) * plotW;
  /* the inverse, for hit-testing and for zooming around a finger */
  const idxAt = (px) => lo + ((px - left) / plotW) * span;

  const pts = data.map((d, i) => ({ x: +xOf(i).toFixed(2), y: +yOf(d.y).toFixed(2), i }));
  const cid = "pbclip" + (++chartClipId);

  let svg = `<svg width="${W}" height="${H}" style="display:block">
    <defs><clipPath id="${cid}"><rect x="${left}" y="${top - 6}" width="${plotW}" height="${plotH + 12}"/></clipPath></defs>`;

  /* horizontal grid */
  for (const t of ticks) svg += `<line x1="${left}" x2="${right}" y1="${yOf(t).toFixed(2)}" y2="${yOf(t).toFixed(2)}" stroke="${cGrid}" stroke-dasharray="3 5"/>`;
  /* one vertical guide per visible point, thinned out when they crowd */
  const vSkip = Math.max(1, Math.ceil((i1 - i0 + 1) / 12));
  for (let i = i0; i <= i1; i += vSkip) {
    const x = pts[i].x;
    if (x < left - 1 || x > right + 1) continue;
    svg += `<line x1="${x}" x2="${x}" y1="${top}" y2="${bottom}" stroke="${cGrid}" stroke-dasharray="3 5"/>`;
  }
  /* axes + labels */
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="${cAxis}"/>`;
  for (const t of ticks) svg += `<text x="${left - 6}" y="${(yOf(t) + 3.5).toFixed(2)}" fill="${cTick}" font-size="10.5" text-anchor="end">${t}</text>`;
  const lSkip = Math.max(1, Math.ceil((i1 - i0 + 1) / 7));
  for (let i = i0; i <= i1; i++) {
    if ((i - i0) % lSkip !== 0 && i !== i1) continue;
    const x = pts[i].x;
    if (x < left + 4 || x > right - 4) continue;
    svg += `<text x="${x}" y="${bottom + 14}" fill="${cTick}" font-size="10.5" text-anchor="middle">${esc(data[i].x)}</text>`;
  }
  /* goal reference line, drawn only while it's inside the visible domain */
  if (goal != null && goal >= yMin && goal <= yMax) {
    const gy = yOf(goal).toFixed(2);
    svg += `<line x1="${left}" x2="${right}" y1="${gy}" y2="${gy}" stroke="${cGreen}" stroke-dasharray="5 4"/>`;
    svg += `<text x="${right - 3}" y="${(yOf(goal) - 4).toFixed(2)}" fill="${cGreen}" font-size="10" text-anchor="end">${T("prog.goal").toLowerCase()}</text>`;
  }

  /* line + dots, clipped to the plot so a zoom can't spill over the axis */
  svg += `<g clip-path="url(#${cid})">`;
  svg += `<path d="${monotonePath(pts)}" fill="none" stroke="${cGold}" stroke-width="2.4"/>`;
  const sel = data.findIndex((d) => d.e.id === ui.chartSel[scope]);
  /* dots thin out when zoomed all the way out on a long history, but the
     selected one is always drawn */
  const dSkip = plotW / Math.max(1, span) < 7 ? Math.ceil(7 / Math.max(0.5, plotW / Math.max(1, span))) : 1;
  for (let i = i0; i <= i1; i++) {
    if (i !== sel && dSkip > 1 && i % dSkip !== 0) continue;
    svg += `<circle cx="${pts[i].x}" cy="${pts[i].y}" r="${data[i].badge === "pr" ? 4.4 : 3.5}" fill="${cGold}" stroke="${cDot}" stroke-width="1.5"/>`;
  }
  if (sel >= 0) {
    const p = pts[sel];
    svg += `<line x1="${p.x}" x2="${p.x}" y1="${top}" y2="${bottom}" stroke="${cGold}" stroke-width="1" stroke-dasharray="2 4" opacity=".8"/>`;
    svg += `<circle cx="${p.x}" cy="${p.y}" r="11" fill="${cGold}" opacity=".16"/>`;
    svg += `<circle cx="${p.x}" cy="${p.y}" r="6" fill="${cGold}" stroke="${cText}" stroke-width="1.6"/>`;
  }
  svg += `</g></svg>`;

  /* the zoom read-out, so it's never a mystery which part of the history
     you're looking at */
  const zoomTag = ui.chartView[scope]
    ? `<div style="position:absolute;top:4px;right:8px;font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--gold);background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:2px 6px">
        ${T("chart.showing", { n: Math.min(n, Math.round(span) + 1), total: n })}
      </div>`
    : "";
  wrap.innerHTML = svg + zoomTag;

  /* ── gestures ─────────────────────────────────────────────────────── */
  const endGesture = (id) => {
    chartPointers.delete(id);
    if (chartPointers.size === 0) chartGesture = null;
    else if (chartGesture) chartGesture.moved = true;   // no tap on the way out of a pinch
  };

  wrap.onpointerdown = (e) => {
    chartPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: Date.now() });
    try { wrap.setPointerCapture(e.pointerId); } catch { /* mouse on some builds */ }
    if (chartPointers.size >= 2) {
      const [a, b] = [...chartPointers.values()];
      const r = wrap.getBoundingClientRect();
      chartGesture = {
        mode: "pinch", moved: true,
        dist: Math.max(1, Math.abs(a.x - b.x)),
        win: chartWindow(n, scope),
        focus: Math.max(0, Math.min(n - 1, idxAt((a.x + b.x) / 2 - r.left))),
      };
    } else {
      chartGesture = { mode: "pan", moved: false };
    }
  };

  wrap.onpointermove = (e) => {
    const p = chartPointers.get(e.pointerId);
    if (!p || !chartGesture) return;
    const prevX = p.x;
    p.x = e.clientX; p.y = e.clientY;

    if (chartGesture.mode === "pinch" && chartPointers.size >= 2) {
      const [a, b] = [...chartPointers.values()];
      const dist = Math.max(1, Math.abs(a.x - b.x));
      const g = chartGesture;
      const span0 = g.win.hi - g.win.lo;
      const next = Math.min(Math.max(span0 * (g.dist / dist), CHART_MIN_SPAN), n - 1);
      const t = span0 > 0 ? (g.focus - g.win.lo) / span0 : 0.5;
      const nlo = g.focus - t * next;
      ui.chartView[scope] = next >= n - 1 ? null : { lo: nlo, hi: nlo + next };
      drawLineChart();
      refreshChartToolbars();
      return;
    }
    if (Math.abs(p.x - p.x0) > CHART_TAP_SLOP || Math.abs(p.y - p.y0) > CHART_TAP_SLOP) chartGesture.moved = true;
    if (!chartGesture.moved || !ui.chartView[scope]) return;   // unzoomed there's nowhere to pan
    chartPan(-((p.x - prevX) / plotW) * span, scope);
  };

  wrap.onpointerup = (e) => {
    const p = chartPointers.get(e.pointerId);
    const g = chartGesture;
    /* a tap, not a drag: open whatever dot is nearest, or clear the
       selection when the tap lands nowhere near the line */
    if (p && g && g.mode === "pan" && !g.moved) {
      const r = wrap.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = -1, bd = Infinity;
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(pts[i].x - mx, (pts[i].y - my) * 0.45);   // x matters more than y
        if (d < bd) { bd = d; best = i; }
      }
      endGesture(e.pointerId);
      chartSelect(best >= 0 && bd < 34 ? data[best].e.id : null, scope);
      return;
    }
    endGesture(e.pointerId);
  };
  wrap.onpointercancel = (e) => endGesture(e.pointerId);

  wrap.onwheel = (e) => {
    e.preventDefault();
    const r = wrap.getBoundingClientRect();
    chartZoom(e.deltaY < 0 ? 1.3 : 1 / 1.3, Math.max(0, Math.min(n - 1, idxAt(e.clientX - r.left))), scope);
  };
  /* a double-click is the desktop shortcut back to the whole series */
  wrap.ondblclick = () => { ui.chartView[scope] = null; drawLineChart(); refreshChartToolbars(); };
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

/* ── DRAFT DAYS ───────────────────────────────────────────────────────
   Backing out of a half-built workout used to throw it away, which made
   leaving the window to go add an exercise to the Library a gamble. Now a
   day with anything in it is parked in state.dayDrafts instead: it shows
   up at the top of the log, waits as long as you like, and reopens exactly
   as you left it. A draft is NOT the log — nothing in it counts toward
   sets, PRs, volume, weeks or the graphs until you actually save the day.

   (Distinct from state.drafts, which is the crash/lock snapshot of whatever
   form is open right now. This is a deliberate park, that is a safety net.) */

function stashDayDraft(draft) {
  if (!draft || draft.editing || !draft.entries.length) return;
  const row = {
    id: draft.draftId || uid(),
    date: draft.date,
    entries: clone(draft.entries),
    savedAt: Date.now(),
  };
  const rest = (state.dayDrafts || []).filter((d) => d.id !== row.id);
  patch({ dayDrafts: [...rest, row] });
}

/* leaving the workout window: park it, don't bin it */
function closeWorksheet() {
  const draft = ui.workoutSheet;
  ui.workoutSheet = null; ui.picking = false; ui.entryForm = null; ui.setForm = null;
  if (draft && !draft.editing && draft.entries.length) stashDayDraft(draft);
  else if (draft && draft.draftId) dropDayDraft(draft.draftId);   // emptied it out
  else render();
}

function dropDayDraft(id) {
  patch({ dayDrafts: (state.dayDrafts || []).filter((d) => d.id !== id) });
}

/* Stepping the week with the arrows scrolls the calendar to match, so the
   highlighted band never wanders off the month you're looking at. */
function syncCalToWeek() {
  const r = weekRange(ui.volumeWeek, state.settings.startDate);
  if (monthOf(r.from) !== ui.calMonth && monthOf(r.to) !== ui.calMonth) ui.calMonth = monthOf(r.from);
}

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
  const draftId = draft.draftId;
  ui.workoutSheet = null;
  /* a draft that just became a real day stops being a draft */
  patch({
    log: [...state.log, ...stamped],
    dayDrafts: draftId ? (state.dayDrafts || []).filter((d) => d.id !== draftId) : state.dayDrafts,
  });
}

const actions = {
  "nav": (el) => {
    const id = el.dataset.id;
    if (ui.tab === id) return;
    ui.tab = id;
    resetTransient();
    render();
  },
  "open-profile": () => {
    ui.profileDraft = { ...state.settings };
    ui.profileLangWas = state.settings.lang;   // so a cancelled preview can be undone
    ui.showProfile = true; render();
  },
  "close-profile": () => {
    ui.showProfile = false; ui.profileDraft = null;
    applyTheme(state.settings.theme);
    if (ui.profileLangWas) state.settings.lang = ui.profileLangWas;
    render();
  },
  "save-profile": () => { const f = ui.profileDraft; ui.showProfile = false; ui.profileDraft = null; applyTheme(f.theme); patch({ settings: f }); },
  "profile-units": (el) => { ui.profileDraft.units = el.dataset.u; render(); },
  "profile-theme": (el) => { ui.profileDraft.theme = el.dataset.t; applyTheme(el.dataset.t); render(); },
  "reset-all": () => {
    if (confirm(T("profile.confirmReset"))) {
      ui.showProfile = false; ui.profileDraft = null;
      const fresh = defaultState();
      applyTheme(fresh.settings.theme);
      patch(fresh);
    }
  },
  "open-body": () => { ui.showBody = true; render(); },
  "close-body": () => { ui.showBody = false; ui.bodyForm = null; render(); },
  "new-body": () => { ui.bodyForm = newBodyRow(); ui.bodyFormWasNew = true; render(); },
  "new-workout": () => { ui.tab = "log"; ui.logSeg = "history"; resetTransient(); ui.workoutSheet = { date: todayStr(), entries: [] }; render(); },
  "fab": () => { ui.workoutSheet = { date: todayStr(), entries: [] }; render(); },
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
  "vol-prev": () => { ui.volumeWeek = Math.max(1, ui.volumeWeek - 1); syncCalToWeek(); render(); },
  "vol-next": () => { ui.volumeWeek = ui.volumeWeek + 1; syncCalToWeek(); render(); },

  /* ── calendar & deloads ───────────────────────────────────────────── */
  "cal-prev": () => { ui.calMonth = addMonths(ui.calMonth || monthOf(todayStr()), -1); render(); },
  "cal-next": () => { ui.calMonth = addMonths(ui.calMonth || monthOf(todayStr()), 1); render(); },

  /* One tap on a day means three different things depending on what you're
     doing: laying out a deload, opening one you already planned, or just
     choosing which week's numbers to read. */
  "cal-day": (el) => {
    const day = el.dataset.d;
    if (ui.deloadPick) {
      if (!ui.deloadPick.start) { ui.deloadPick.start = day; render(); return; }
      const [start, end] = [ui.deloadPick.start, day].sort();
      const clash = (state.deloads || []).find((d) => start <= d.end && end >= d.start);
      if (clash) { alert(T("cal.overlap", { from: fmtShort(clash.start), to: fmtShort(clash.end) })); return; }
      ui.deloadPick = null;
      patch({ deloads: deloadsSorted([...(state.deloads || []), { id: uid(), start, end }]) });
      return;
    }
    const existing = deloadOn(state.deloads, day);
    if (existing) { ui.deloadForm = { ...existing, isNew: false }; render(); return; }
    ui.volumeWeek = Math.max(1, weekOf(day, state.settings.startDate));
    render();
  },
  "deload-plan": () => { ui.deloadPick = ui.deloadPick ? null : { start: null }; render(); },
  "deload-cancel": () => { ui.deloadPick = null; render(); },
  "deload-edit": (el) => {
    const d = (state.deloads || []).find((x) => x.id === el.dataset.id);
    if (d) { ui.deloadForm = { ...d, isNew: false }; render(); }
  },
  "deload-save": () => {
    const f = ui.deloadForm;
    if (!f || !f.start || !f.end || f.end < f.start) return;
    const clash = (state.deloads || []).find((d) => d.id !== f.id && f.start <= d.end && f.end >= d.start);
    if (clash) { alert(T("cal.overlapShort", { from: fmtShort(clash.start), to: fmtShort(clash.end) })); return; }
    const row = { id: f.id || uid(), start: f.start, end: f.end };
    const rest = (state.deloads || []).filter((d) => d.id !== row.id);
    ui.deloadForm = null;
    patch({ deloads: deloadsSorted([...rest, row]) });
  },
  "deload-delete": () => {
    const f = ui.deloadForm;
    if (!f || !confirm(T("deloadForm.confirmDelete"))) return;
    const id = f.id;
    ui.deloadForm = null;
    patch({ deloads: (state.deloads || []).filter((d) => d.id !== id) });
  },
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
  "prog-seg": (el) => { ui.progSeg = el.dataset.id; ui.chartFull = null; render(); },
  "select-progress": (el) => {
    ui.progressSelected = el.dataset.name;
    ui.chartView.main = null; ui.chartSel.main = null;   // a different lift is a different chart
    render();
  },

  /* ── the progress graph ───────────────────────────────────────────────
     Every one of these carries the scope of the graph it was tapped on, so
     the same buttons drive the Progress tab's chart and the exercise
     window's copy without either reaching into the other. */
  "chart-zoom-in": (el) => chartZoom(1.6, null, chartScope(el)),
  "chart-zoom-out": (el) => chartZoom(1 / 1.6, null, chartScope(el)),
  "chart-reset": (el) => { ui.chartView[chartScope(el)] = null; drawLineChart(); refreshChartToolbars(); },
  "chart-full": (el) => { ui.chartFull = chartScope(el); render(); },
  "chart-exit-full": () => { ui.chartFull = null; render(); },
  /* picking a session from the list under the chart moves the dot too */
  "chart-pick": (el) => {
    const scope = chartScope(el);
    chartSelect(ui.chartSel[scope] === el.dataset.id ? null : el.dataset.id, scope);
  },

  /* ── 1RM calculator ───────────────────────────────────────────────── */
  "calc-run": () => {
    const w = +decimalize(ui.calc.weight), r = Math.round(+decimalize(ui.calc.reps));
    const oneRM = est1RM(w, r);
    if (oneRM == null) return;                     // nothing typed yet
    /* oneRM is the number on screen; `exact` is the same max unrounded, which
       is what the two tables are built from — see renderCalc */
    ui.calcResult = { weight: w, reps: r, oneRM, exact: w / rmCurve(r), unit: ui.calc.unit || state.settings.units };
    render();
  },

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

  /* ── muscle groups ────────────────────────────────────────────────── */
  "open-groups": () => { ui.groupSheet = true; render(); },
  /* `then` remembers who asked, so creating a group mid-workout drops you
     straight back into what you were doing with the new group selected */
  "group-new": (el) => {
    /* start on a colour nothing else is wearing, so groups stay tellable apart */
    const free = GROUP_SWATCHES.find((c) => !groupList().some((g) => String(g.color).toLowerCase() === c));
    ui.groupForm = { name: "", color: free || GROUP_SWATCHES[0], orig: null, then: (el && el.dataset.then) || null };
    render();
  },
  "group-edit": (el) => {
    const name = el.dataset.g;
    /* show the label, remember the stored name — see group-save */
    ui.groupForm = { name: groupLabel(name), color: colorFor(name), orig: name, then: null };
    render();
  },
  "group-color": (el) => { if (ui.groupForm) { ui.groupForm.color = el.dataset.c; render(); } },
  "group-save": () => {
    const f = ui.groupForm;
    if (!f) return;
    const typed = (f.name || "").trim();
    if (!typed) return;
    if (typed.toLowerCase() === UNCATEGORIZED.toLowerCase() ||
        typed.toLowerCase() === T("group.Uncategorized").toLowerCase()) {
      alert(T("groups.reserved", { name: T("group.Uncategorized") }));
      return;
    }
    /* The field is prefilled with the group's LABEL, so leaving a built-in
       untouched (to change only its colour) must not count as a rename —
       otherwise "Chest" would freeze into whatever language you happened to
       be in. Typing something else is a real rename, and the group becomes
       the user's: it loses its key and stops being translated. */
    const orig = f.orig;
    const untouched = !!orig && typed === groupLabel(orig);
    const name = untouched ? orig : typed;
    const keep = untouched ? (groupList().find((g) => g.name === orig) || {}).key : undefined;

    if (groupNames().some((g) => g.toLowerCase() === name.toLowerCase() && g !== orig)) {
      alert(T("groups.clash", { name: typed }));
      return;
    }
    const groups = libraryGroups(state.library).map((g) => {
      const rec = groupList().find((x) => x.name === g);
      return rec ? { ...rec } : { name: g, color: colorFor(g) };
    });
    const p = { ...state };

    if (f.orig) {
      /* a rename has to carry everything that points at the old name, or the
         exercises in it would quietly fall out of their own group */
      p.groups = groups.map((g) => (g.name === f.orig
        ? (keep ? { name, key: keep, color: f.color } : { name, color: f.color })
        : g));
      if (name !== f.orig) {
        p.library = state.library.map((ex) => (ex.muscle === f.orig ? { ...ex, muscle: name } : ex));
        p.log = state.log.map((e) => (e.muscle === f.orig ? { ...e, muscle: name } : e));
        p.presets = (state.presets || []).map((pr) => ({
          ...pr, exercises: (pr.exercises || []).map((x) => (x.muscle === f.orig ? { ...x, muscle: name } : x)),
        }));
        if (state.volumeGoals && state.volumeGoals[f.orig] != null) {
          const vg = { ...state.volumeGoals };
          vg[name] = vg[f.orig]; delete vg[f.orig];
          p.volumeGoals = vg;
        }
        if (ui.libraryFilter === f.orig) ui.libraryFilter = name;
      }
    } else {
      p.groups = [...groups, { name, color: f.color }];
    }

    const then = f.then;
    ui.groupForm = null;
    if (then === "exwin" && ui.exWinDraft) ui.exWinDraft.muscle = name;
    if (then) ui.groupSheet = false;     // opened from a workout, not the manager
    patch(p);
    /* quick-add was mid-question ("which muscle does it train?") — answer it */
    if (then === "quickadd" && ui.pickerQuick) {
      const el = document.createElement("button");
      el.dataset.g = name;
      actions["quick-add-muscle"](el);
    }
  },
  /* Deleting a group never takes exercises down with it — whatever is still
     in it is tipped into the Uncategorized bucket, where it stays findable
     and loggable until it's given a real group. */
  "group-delete": () => {
    const f = ui.groupForm;
    if (!f || !f.orig) return;
    const name = f.orig;
    const used = groupUseCount(name, state.library);
    const msg = used
      ? T("groups.confirmDeleteUsed", { name: groupLabel(name), n: TN("exercise", used) })
      : T("groups.confirmDelete", { name: groupLabel(name) });
    if (!confirm(msg)) return;

    const p = {
      groups: libraryGroups(state.library).filter((g) => g !== name).map((g) => ({ name: g, color: colorFor(g) })),
    };
    if (used) {
      p.library = state.library.map((ex) => (ex.muscle === name ? { ...ex, muscle: UNCATEGORIZED } : ex));
      p.log = state.log.map((e) => (e.muscle === name ? { ...e, muscle: UNCATEGORIZED } : e));
      p.presets = (state.presets || []).map((pr) => ({
        ...pr, exercises: (pr.exercises || []).map((x) => (x.muscle === name ? { ...x, muscle: UNCATEGORIZED } : x)),
      }));
    }
    if (state.volumeGoals && state.volumeGoals[name] != null) {
      const vg = { ...state.volumeGoals };
      delete vg[name];                       // the bucket can't carry a target
      p.volumeGoals = vg;
    }
    ui.groupForm = null;
    if (ui.libraryFilter === name) ui.libraryFilter = "All";
    patch(p);
  },

  /* the NEW flag is a to-do, and some exercises simply have nothing to do */
  "dismiss-new": (el) => {
    const name = el.dataset.name;
    patch({ library: state.library.map((x) => (x.name === name ? { ...x, dismissedNew: true } : x)) });
  },

  "add-exercise": () => {
    ui.exWinDraft = { id: uid(), name: "", muscle: "", type: "", equipment: "", alternatives: "", note: "", image: "", video: "", custom: true };
    ui.exWin = { isNew: true }; ui.exWinEdit = true; render();
  },
  /* open the detail window (read-only) — every "info" button lands here.
     Exercises are keyed by name across the app, so we look up by name. */
  "open-exercise-window": (el) => {
    ui.exWin = { name: el.dataset.name };
    /* a different lift is a different graph, so its zoom and its open dot
       start clean rather than inheriting the last exercise's */
    ui.chartView.ex = null; ui.chartSel.ex = null;
    ui.exWinEdit = false; ui.exWinDraft = null; render();
  },
  "exwin-close": () => { ui.exWin = null; ui.exWinEdit = false; ui.exWinDraft = null; render(); },
  "exwin-edit": () => {
    const ex = state.library.find((x) => x.name === ui.exWin.name);
    if (!ex) return;
    ui.exWinDraft = { image: "", video: "", ...ex };
    ui.exWinEdit = true; render();
  },
  "exwin-cancel": () => {
    if (ui.exWin && ui.exWin.isNew) ui.exWin = null;
    ui.exWinEdit = false; ui.exWinDraft = null; render();
  },
  "exwin-remove-image": () => { if (ui.exWinDraft) { ui.exWinDraft.image = ""; render(); } },
  "exwin-save": () => {
    const f = ui.exWinDraft;
    if (!f || !(f.name.trim() && f.muscle.trim())) return;
    const muscle = f.muscle.trim();
    /* compound vs isolation was noise nobody filed anything under, so the
       picker is gone; the only thing `type` still decides is whether the
       lift is logged in minutes, and the muscle group already knows that. */
    const ex = { ...f, name: f.name.trim(), muscle, type: cardioType(muscle) };
    const exists = state.library.some((x) => x.id === ex.id);
    ui.exWin = { name: ex.name }; ui.exWinEdit = false; ui.exWinDraft = null;
    patch({ library: exists ? state.library.map((x) => (x.id === ex.id ? ex : x)) : [...state.library, ex] });
  },
  "exwin-delete": () => {
    if (confirm(T("ex.confirmDelete"))) {
      const id = ui.exWinDraft && ui.exWinDraft.id;
      const name = ui.exWin && ui.exWin.name;
      ui.exWin = null; ui.exWinEdit = false; ui.exWinDraft = null;
      patch({ library: state.library.filter((x) => (id ? x.id !== id : x.name !== name)) });
    }
  },
  "close-worksheet": closeWorksheet,
  "commit-workout": () => commitWorkout(ui.workoutSheet),
  /* pick a parked day back up exactly where it was left */
  "resume-draft": (el) => {
    const d = (state.dayDrafts || []).find((x) => x.id === el.dataset.id);
    if (!d) return;
    ui.tab = "log"; ui.logSeg = "history"; resetTransient();
    ui.workoutSheet = { date: d.date, entries: clone(d.entries), draftId: d.id };
    ui.picking = false; ui.entryForm = null; ui.setForm = null;
    render();
  },
  "delete-draft": (el) => {
    if (confirm(T("draft.confirmDelete"))) dropDayDraft(el.dataset.id);
  },
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
    if (confirm(T("wo.confirmDeleteDay"))) {
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
    const preset = { id: uid(), name: f.name.trim(), description: (f.description || "").trim(), pinned: false, exercises, createdAt: Date.now() };
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
  "preset-pin": (el) => {
    const id = el.dataset.id;
    patch({ presets: (state.presets || []).map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)) });
  },
  "presetview-pin": () => { if (ui.presetView) { ui.presetView.pinned = !ui.presetView.pinned; render(); } },
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
    if (confirm(T("preset.confirmDelete"))) {
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
    const ex = { id: uid(), name: ui.pickerQuick.name, muscle: g, type: cardioType(g), equipment: "", alternatives: "", note: "", custom: true };
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
    if (orphan && !confirm(T("entry.confirmDiscard"))) return;
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
  /* pinning from the list — the cap is enforced here, once, for every route in */
  "timer-pin": (el) => {
    const t = (state.timers || []).find((x) => x.id === el.dataset.id);
    if (!t) return;
    if (!t.pinned && pinnedTimers().length >= MAX_PINNED_TIMERS) {
      alert(T("timers.pinFull", { n: MAX_PINNED_TIMERS }));
      return;
    }
    patch({ timers: state.timers.map((x) => (x.id === t.id ? { ...x, pinned: !x.pinned } : x)) });
  },
  /* pinning from inside the editor — the flag rides on the draft until you save */
  "timer-form-pin": () => {
    const f = ui.timerForm;
    if (!f) return;
    if (!f.t.pinned && pinnedTimers().filter((x) => x.id !== f.t.id).length >= MAX_PINNED_TIMERS) {
      alert(T("timers.pinFull", { n: MAX_PINNED_TIMERS }));
      return;
    }
    f.t.pinned = !f.t.pinned;
    render();
  },
  "timer-add": () => {
    ui.timerForm = { t: { id: uid(), name: "", min: "", sec: "", pinned: false, sound: DEFAULT_SOUND, volume: DEFAULT_VOLUME }, isNew: true };
    render();
  },
  "timer-edit": (el) => {
    const t = (state.timers || []).find((x) => x.id === el.dataset.id);
    if (!t) return;
    ui.timerForm = { t: {
      id: t.id, name: t.name, min: Math.floor(t.duration / 60) || "", sec: t.duration % 60 || "",
      pinned: !!t.pinned, sound: soundOf(t), volume: volumeOf(t),
    }, isNew: false };
    render();
  },
  /* tapping a sound is also how you hear it — at the volume you've set, so
     what you're auditioning is what the gym will hear */
  "timer-sound": (el) => {
    if (!ui.timerForm) return;
    ui.timerForm.t.sound = el.dataset.s;
    playSound(el.dataset.s, volumeOf(ui.timerForm.t) || DEFAULT_VOLUME);
    render();
  },
  "timer-sound-test": () => {
    if (!ui.timerForm) return;
    playSound(soundOf(ui.timerForm.t), volumeOf(ui.timerForm.t));
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
    const existing = (state.timers || []).find((x) => x.id === form.t.id);
    /* same rule as muscle groups: the name field shows the label, so leaving
       a seeded timer's name alone keeps its key (and its translation), while
       typing your own name makes it yours for good */
    const typedName = (form.t.name || "").trim();
    const keepKey = existing && existing.key && typedName === timerLabel(existing) ? existing.key : undefined;
    const name = keepKey ? existing.name
      : typedName || T("timers.fallbackName", { time: fmtClock(duration) });
    /* editing the length of a running timer restarts it cleanly rather than
       leaving a countdown that no longer matches its own dial */
    const alert = { sound: soundOf(form.t), volume: volumeOf(form.t) };
    const row = existing
      ? { ...existing, name, key: keepKey, duration, pinned: !!form.t.pinned, ...alert, endsAt: null, remaining: null, doneAt: null }
      : { id: form.t.id, name, duration, pinned: !!form.t.pinned, ...alert, endsAt: null, remaining: null, doneAt: null, createdAt: Date.now() };
    ui.timerForm = null;
    patch({ timers: existing ? state.timers.map((x) => (x.id === row.id ? row : x)) : [...(state.timers || []), row] });
  },
  "timer-delete": () => {
    const form = ui.timerForm;
    if (!form || !confirm(T("timers.confirmDelete"))) return;
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
    } else if (confirm(T("entry.confirmDelete"))) {
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
    if (confirm(T("body.confirmDelete"))) {
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
    else if (t === "groupSheet") ui.groupSheet = false;
    else if (t === "groupForm") ui.groupForm = null;
    else if (t === "deloadForm") ui.deloadForm = null;
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
  let v = el.value;
  /* A number field keeps whatever separator you typed on screen — only stray
     characters are pushed back out — while the value that gets stored is
     always period-separated, so 82,5 and 82.5 are the same number. */
  if (el.dataset.num != null) {
    const clean = v.replace(/[^\d.,]/g, "");
    if (clean !== v) {
      const pos = el.selectionStart;
      el.value = clean;
      try { el.setSelectionRange(pos - (v.length - clean.length), pos - (v.length - clean.length)); } catch { /* not a text field */ }
      v = clean;
    }
    v = decimalize(v);
  }
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
    ui.progressSelected = v;
    ui.chartView.main = null; ui.chartSel.main = null;   // a different lift is a different chart
    render();
  } else if (bind === "calcUnit") {
    /* the calculator is pure ratios, so the unit is only ever a label: the
       answer comes back in whatever went in. Relabel the result too. */
    ui.calc.unit = v;
    if (ui.calcResult) ui.calcResult.unit = v;
    render();
  } else if (bind.startsWith("calc.")) {
    ui.calc[bind.slice(5)] = v;
    const btn = document.getElementById("calcRunBtn");
    if (btn) {
      const ok = +decimalize(ui.calc.weight) > 0 && +decimalize(ui.calc.reps) > 0;
      btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45;
    }
  } else if (bind === "exwinMuscle") {
    /* "＋ New group…" hands straight over to the group editor, which drops the
       finished group back onto this draft — see actions["group-save"]. */
    if (v === "__new") actions["group-new"]({ dataset: { then: "exwin" } });
    else { ui.exWinDraft.muscle = v; render(); }
  } else if (bind === "profileLang") {
    /* Preview the language live, the way the theme buttons do: the whole
       screen is written in it, so picking blind and only finding out on
       Save would be daft. Backing out restores what was saved. */
    ui.profileDraft.lang = v;
    state.settings.lang = v;
    render();
  } else if (bind.startsWith("deload.")) {
    ui.deloadForm[bind.slice(7)] = v; render();
  } else if (bind === "group.name") {
    ui.groupForm.name = v;
    const label = document.getElementById("groupPreviewName");
    if (label) label.textContent = v.trim() || T("groups.previewName");
    const btn = document.getElementById("groupSaveBtn");
    if (btn) { const ok = !!v.trim(); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
  } else if (bind === "group.color") {
    ui.groupForm.color = v; render();
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
  /* selects and the colour well re-render on commit, not on every tick of a
     drag, or the native picker gets pulled out from under the user's finger */
  if (e.target.matches("select, input[type=color]")) return;
  handleBind(e.target);
});
document.addEventListener("change", (e) => {
  if (e.target.matches('input[type="file"]')) { handleFile(e.target); return; }
  /* letting go of the volume slider plays the alert at the level you just
     chose — the only honest way to pick one */
  if (e.target.matches("input[type=range]")) {
    handleBind(e.target);
    if (ui.timerForm) playSound(soundOf(ui.timerForm.t), volumeOf(ui.timerForm.t));
    return;
  }
  if (e.target.matches("select, input[type=date], input[type=color]")) handleBind(e.target);
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
  else if (ui.bodyForm) ui.showBody = true;   // the form lives inside that window
})();

applyTheme(state.settings.theme);
sweepTimers();          // anything that ran out while the app was closed
render();
startTimerEngine();
