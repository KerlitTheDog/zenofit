/* ═══════════════════════════════════════════════════════════════════════════
   POWERBUILD TRACKER: mobile prototype (vanilla HTML/CSS/JS port)
   Faithful port of "AbsoluteMain.xlsx" (Powerbuilding Progressive Overload
   Tracker). All spreadsheet formulas are reimplemented in the helpers below.

   ┌─────────────────────── PLACEHOLDER INDEX ───────────────────────────┐
   │ Search for these tokens to swap in real assets later:               │
   │                                                                     │
   │ 1. PLACEHOLDER_BODY_GRAPH_SLOT: future measurement graphs, Body     │
   │    tab bottom                                                       │
   │                                                                     │
   │ Done: the Home logo and the tab-header brand mark now use           │
   │ logoC.png; the reserved Home banner slot was removed (the deload    │
   │ alert is the only banner that renders there); the Profile's         │
   │ Program Planner slot is gone (the deload calendar in Weekly Volume  │
   │ covers the part that matters); PLACEHOLDER_RANKS_SLOT is gone:      │
   │ the Progress tab's second segment is the strength standards         │
   │ lookup now (see the STRENGTH STANDARDS block and standards.js).     │
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
                          …or the last 7 days, if the user asked for
                          that in Profile                        → volumeInRange()
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
   the user's language while the stored name (which every exercise, preset
   and weekly target points at) stays fixed. Rename one and the key drops,
   because it's their word now, not ours. */
const DEFAULT_GROUPS = [
  { name: "Chest", key: "Chest", color: "#d05a50" }, { name: "Back", key: "Back", color: "#5d8bcc" },
  { name: "Shoulders", key: "Shoulders", color: "#e9b949" }, { name: "Arms", key: "Arms", color: "#6aa465" },
  { name: "Legs", key: "Legs", color: "#aab4c0" }, { name: "Core", key: "Core", color: "#8fa39a" },
  { name: "Cardio", key: "Cardio", color: "#a07ec2" },
];
/* key → the name the app shipped that group under. groupLabel asks this to
   tell "still ours" from "renamed", the same question exLabelOf asks of a
   built-in lift, which is what lets the key stay behind as pure IDENTITY. */
const DEFAULT_GROUP_NAME = Object.fromEntries(DEFAULT_GROUPS.map((g) => [g.key, g.name]));

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

/* ── THE CARDIO GROUP IS NOT THE WORD "CARDIO" ────────────────────
   One group decides something real: whether a lift is logged in minutes ×
   RPE instead of sets × weight. That made its NAME load-bearing, and the
   name is the one thing about a group the user is free to change, so
   calling it Conditioning quietly stopped new exercises in it being cardio
   at all. The `key` is what identifies it, and it now survives a rename
   (see actions["group-save"]); the name is only what it is called today. */
const cardioGroup = () => {
  const g = ((state && state.groups) || DEFAULT_GROUPS).find((x) => x.key === "Cardio");
  return g ? g.name : "Cardio";
};

/* ═══════════════════ NAMES: STORED vs SHOWN ═══════════════════════════
   Everything the app stores is keyed by its English name: an entry points
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

/* A muscle group's label. The `key` alone used to answer this, which meant
   it had to be dropped on a rename to stop "Pecs" coming back as "Chest",
   and dropping it threw away the group's identity along with the claim
   about its name. So the key stays and the NAME answers instead: still the
   one we shipped, still ours to translate; changed, and it is their word. */
function groupLabel(name) {
  if (name === UNCATEGORIZED) return T("group.Uncategorized");
  const g = ((state && state.groups) || DEFAULT_GROUPS).find((x) => x.name === name);
  return g && g.key && g.name === DEFAULT_GROUP_NAME[g.key] ? T("group." + g.key) : name;
}

function exLabelOf(ex) {
  const row = exRow(ex);
  if (!row) return ex ? ex.name : "";
  /* A built-in the user RENAMED is theirs now, the same rule exFieldOf
     applies to the prose below. Without it the library went on showing the
     shipped name in a translated UI while the log, the plans and the
     presets had all been moved to the new one: one lift wearing two names,
     and neither surface able to find the other. */
  return ex.name === DEFAULT_LIBRARY[DEFAULT_INDEX[ex.id]].name ? row[0] : ex.name;
}

/* ── SEARCH HAS TO READ WHAT IS ON SCREEN ────────────────────────
   Names are STORED in English and SHOWN translated, so a filter that reads
   only `ex.name` finds nothing at all in Ukrainian or Svenska: the library
   search comes back empty for a lift sitting right there in the list, and
   the picker, seeing no exact match either, offers to add a lift you
   already have — under its translated name, as a second row keyed by a
   name nothing else points at. Both names are tried, so either one finds
   it, and a lift can only be "new" when neither of them says otherwise.
   (renderStdPicker has always searched both; these two had not.) */
const exMatches = (ex, q) => {
  const s = String(q || "").trim().toLowerCase();
  return !s || ex.name.toLowerCase().includes(s) || exLabelOf(ex).toLowerCase().includes(s);
};
const exIsNamed = (ex, q) => {
  const s = String(q || "").trim().toLowerCase();
  return !!s && (ex.name.toLowerCase() === s || exLabelOf(ex).toLowerCase() === s);
};

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

/* ── A WEEK, OR ANY SEVEN DAYS ────────────────────────────────────────
   The spreadsheet counted in program weeks: week 1 opens on your start
   date and every seventh day turns the page. That is right for a program
   run to a calendar, and it is still what the app does by default.

   It is wrong for the other way people train, where the split simply
   comes round in order and which day it lands on is an accident: chest,
   then back whenever back happens next. A Sunday and a Monday session are
   the same session to that lifter, but a program week puts a wall between
   them and calls one of the two weeks light.

   Profile → Volume period switches every seven-day sum in the app to a
   WINDOW instead: the seven days ENDING on the day you're reading, which
   moves with you. Pick the 7th on the calendar and you get the 1st to the
   7th; pick the 8th and you get the 2nd to the 8th.

   Deloads are deliberately untouched by the setting. They are dates you
   put in the calendar yourself, never something derived from a week
   number, so there is nothing in them for a rolling window to change. */
const rollingWeeks = () => (state.settings.weekMode || "program") === "rolling";

/* ── EST. 1RM: WATHAN'S CURVE, ANCHORED AT ONE REP ────────────────────
   The spreadsheet estimated a max with Epley, weight × (1 + reps/30), and
   Epley has a flaw you can see with your own eyes: one rep at 30 kg comes
   back as a 31 kg max. It is a straight line fitted to multi-rep sets, so
   it never passes through the one point every lifter can verify: the set
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
   curve inverted, how many reps a percentage is good for. It floors,
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
   so percentages at or under that have no honest rep answer at all, and they
   come back as Infinity and the table prints them as "off the scale"
   rather than inventing a number. */
const calcReps = (pct) => {
  const x = (pct * RM_ONE - RM_A) / RM_B;
  return x > 0 ? Math.floor(-Math.log(x) / RM_K) : Infinity;
};

/* one decimal, no dangling ".0": 133.3 kg, but 120 kg */
const trimNum = (n) => String(Math.round(n * 10) / 10);

/* Cardio "1RM equivalent": session-RPE load (Foster) = minutes × RPE */
const cardioScore = (minutes, intensity) =>
  minutes > 0 && intensity > 0 ? Math.round(minutes * intensity) : null;

/* Whether a lift is logged in minutes × RPE rather than sets × weight. The
   Cardio muscle group is what says so; `type` is only still consulted because
   exercises created before the compound/isolation/cardio picker was dropped
   may carry "Cardio" there and nothing else. */
const isCardioEx = (ex) => ex && (ex.type === "Cardio" || ex.muscle === cardioGroup());

/* …and the same question asked of a group name, for a record being saved */
const cardioType = (muscle) => (muscle === cardioGroup() ? "Cardio" : "");

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

/* the unit an entry was logged in, older entries fall back to the default */
const unitOf = (e) => (e && e.unit) || state.settings.units;

/* an entry's weight expressed in the default unit, for comparisons only */
const baseWeight = (e) => convertWeight(+e.weight, unitOf(e), state.settings.units);

const metricOf = (e) =>
  e.kind === "cardio" ? cardioScore(+e.minutes, +e.intensity) : est1RM(baseWeight(e), +e.reps);

/* ─────────────────────── PER-SET LOGGING ────────────────────────────
   Every new entry carries a `setList`: one row per set, each with its own
   reps / weight / RPE. It is the only way the app logs now.

   A handful of entries on record predate that: they were logged as a
   total-set count plus the numbers of one top set, and they have no
   setList. They are left exactly as they were rather than rewritten
   (guessing four sets out of one would invent history), so `isDetailed`
   still asks the question and the entry form still offers to convert one
   on demand.

   Either shape keeps the same four headline fields filled in (sets / reps
   / weight / rpe). For an entry with a set list those are DERIVED from its
   best set, the one with the highest estimated 1RM, which is what lets
   weekly volume, PR badges, the dashboard and the charts all keep reading
   the fields they always read. Nothing is ever thrown away, the setList
   stays on the entry. */

const newSet = (reps = "", weight = "", rpe = "") => ({ id: uid(), reps, weight, rpe });
const isDetailed = (e) => Array.isArray(e && e.setList);
const setHasData = (s) => +s.reps > 0 && +s.weight > 0;
const filledSets = (e) => (e.setList || []).filter(setHasData);

/* The set with the highest estimated 1RM, the one that speaks for the whole
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
/* ── TWO WAYS OF NOT RESTING ──────────────────────────────────────────
   A DROPSET is one exercise: a set, then straight into a lighter one with
   no rest. A SUPERSET is two exercises: this one, then straight into the
   next with no rest. They are the same shape at two different levels, so
   they are stored the same way and read by the same function.

   Each is a single boolean on the item that CONTINUES the one above it:
   `set.drop` and `entry.superWith`. Nothing stores a group id, and that is
   deliberate. A group id is a second source of truth about an order the
   list already knows, and the moment you drag a row (both lists are
   draggable now) the id and the order start disagreeing. Read upward from
   the order instead and they cannot: a run is however many consecutive
   items are marked, and rearranging or deleting one silently reshapes the
   runs into whatever the new order says. A mark on the FIRST item means
   nothing and is ignored, which is what makes deleting the head of a run
   safe rather than something to clean up after.

   WHAT THEY DO NOT DO IS ARITHMETIC. No volume multiplier, no intensity
   adjustment, no fatigue discount. A drop is a set and counts as one set;
   a supersetted lift is a lift. est. 1RM, PRs, weekly volume, the graph
   and the last-time comparison all read exactly what they read before,
   because the app does not know what a dropset is worth and neither does
   anybody else. These say what you DID, which is the only claim the log
   is ever allowed to make. */

const isDrop = (s) => !!(s && s.drop);
const isSuper = (e) => !!(e && e.superWith);

/* Per-index marks for a linked list of this kind. `cont[i]` is "this one
   continues the one above"; `head[i]` is "this one starts a run of two or
   more", which is the only place a run gets a label. */
function linkMarks(list, linked) {
  const rows = list || [];
  const cont = rows.map((x, i) => i > 0 && linked(x));
  return { cont, head: rows.map((x, i) => !cont[i] && !!cont[i + 1]) };
}

const dropMarks = (sets) => linkMarks(sets, isDrop);
const superMarks = (entries) => linkMarks(entries, isSuper);

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

/* Is this entry already on record somewhere, a row in the open sheet, or a
   row in the log? An entry the picker just produced is neither: it only
   becomes a record when it is saved. The difference is what lets an existing
   row be emptied and saved again while a new one still has to carry numbers.

   Both halves matter, because there are two ways into the same window. The
   day sheet opens its own cards (isDraft), and the Log tab opens a logged
   row straight from the history (not). Unticking is the same act either
   way, and for a long time only the first of them could be saved. */
const entryOnRecord = (e, isDraft) => isDraft
  ? !!(ui.workoutSheet && ui.workoutSheet.entries.some((x) => x.id === e.id))
  : (state.log || []).some((x) => x.id === e.id);

/* One-line summary of an entry, shared by the history list and the draft cards.
   "top" for a single logged top set, "best" when it's the pick of a full set
   list, same number either way, but the word tells you where it came from. */
function entrySummary(e, unit, withRpe = false) {
  if (e.kind === "cardio") return `${esc(e.minutes)} min × RPE ${esc(e.intensity)}`;
  const label = isDetailed(e) ? "best" : "top";
  /* always in the unit the set was actually logged in, never converted:
     what you typed is what you read back */
  return `${esc(e.sets)} sets · ${label} ${esc(e.reps)} × ${esc(e.weight)} ${unitOf(e)}` +
    (withRpe && e.rpe ? ` · RPE ${esc(e.rpe)}` : "");
}

/* ── SET SUGGESTIONS: THE SMALLEST STEP THAT IS STILL A STEP ──────────
   The log exists to make you add something each time, so the app should
   not leave you working out what "a bit more than last time" is while
   you're standing at the rack with a bar in your hands.

   The bar is LAST TIME, not your all-time best. A lifetime PR is the
   wrong thing to chase on an ordinary Tuesday: it is often months old,
   set fresh on a good day, and unbeatable on a normal one, so a target
   built on it is a target you learn to ignore. The session before this
   one is a number you can actually take today, and taking it over and
   over is what an all-time PR is made of anyway.

   Two ways over that bar, because they are the two things you can change:

     · one more rep at the same weight
     · the smallest real weight step at the same reps

   Both are scored through est1RM and only offered when they genuinely
   come out above the set they're beating. Holding the reps on the heavier
   option is deliberate: dropping reps as the weight goes up is normal
   training, but it would not be an improvement on the estimate, and this
   card only ever promises an improvement.

   NEITHER OPTION IS RECOMMENDED OVER THE OTHER, and that is deliberate.

   This used to run double progression (climb the reps to the top of your
   range, then take the weight up) with the top of the range inferred from
   the median top-set reps of your recent sessions. It was wrong twice over.

   Wrong mechanically: that median is taken over a window that INCLUDES
   last session, so for the app to decide you were under your range, more
   than half your recent sessions had to have more reps than the most
   recent one, meaning your reps had to have just gone DOWN. The only thing that
   drops your reps is adding weight, and the weight option here holds the
   reps (see above), so the one state that unlocked "+1 rep" was a state
   that following the app could never produce. The ceiling sat wherever you
   already were and the answer was "add weight" forever, whichever option
   you actually took.

   Wrong in principle, which is the half worth remembering: the range was
   INFERRED. The log records what you did, never what you were aiming for,
   and a rep range is an intention. Crowning an option on the strength of a
   guess about your program is the same mistake as a progress bar filling
   toward a goal you never set. See the volume list, which had it too.

   So both options are shown identically and the app ranks them by the one
   thing it can work out exactly: WHICH IS THE SMALLER STEP, meaning which
   raises the estimate least. That lands on the extra rep in the 8-12 range
   and on the extra weight down on heavy triples, where one more rep is
   worth far more than a plate, which is true, useful, and assumes nothing
   about anyone's programming. The smaller step is listed first and marked
   as such; the other is right beside it, the same size and the same
   colour. The app measures, the lifter decides.                        */

const SUG_CARDIO_MIN = 2;    // minutes added on the cardio equivalent
const RPE_MAX = 10;

/* The smallest jump a normal gym can actually make: 1.25 kg a side, or
   2.5 lb a side. Light lifts get the half step, because 2.5 kg on a 12 kg
   lateral raise is a 20% week. */
const weightStep = (unit, w) =>
  unit === "lbs" ? (w >= 65 ? 5 : 2.5) : (w >= 30 ? 2.5 : 1.25);

/* An est. 1RM for numbers that aren't on an entry yet, in the default
   unit, so a suggestion is comparable with every other figure on screen. */
const metricFor = (weight, reps, unit) =>
  est1RM(convertWeight(weight, unit, state.settings.units), reps);

/* Every earlier outing of this lift, oldest first, over the same "strictly
   before" window the vs-your-best preview uses, so the two never disagree
   about what counts as earlier. Rows being edited are excluded: a session
   cannot be its own benchmark. */
function earlierOutings(f, isDraft) {
  const draft = ui.workoutSheet;
  const editingIds = draft && draft.editing ? new Set(draft.originalIds || []) : null;
  const date = f.date || (isDraft && draft ? draft.date : null) || todayStr();
  return chronoSort(state.log).filter((e) =>
    e.exercise === f.exercise && e.id !== f.id &&
    /* a row someone unticked back to not-done is not a session they had.
       Leaving it in would let it BE the "last day you trained this" and
       come back with nothing in it, hiding the real last time behind it. */
    entryHasData(e) &&
    !(editingIds && editingIds.has(e.id)) &&
    (e.date < date || (e.date === date && e.createdAt < (f.createdAt || 0))));
}

/* What this entry has managed so far, so the card can stand down once
   you've already gone past last time. */
function entryBest(f) {
  if (!f) return null;
  if (f.kind === "cardio") return cardioScore(+f.minutes, +f.intensity);
  if (isDetailed(f)) {
    const b = bestSet(filledSets(f));
    return b ? metricFor(+b.weight, +b.reps, unitOf(f)) : null;
  }
  return +f.reps > 0 && +f.weight > 0 ? metricFor(+f.weight, +f.reps, unitOf(f)) : null;
}

/* Rank two ways over the bar by how far each one moves the estimate, and
   say which is the smaller, with `null` when they tie, because marking one of
   two equal steps would be inventing a preference again. */
function bySmallestStep(options) {
  const sorted = [...options].sort((a, b) => a.m - b.m);
  const smaller = sorted.length > 1 && sorted[0].m < sorted[1].m ? sorted[0].kind : null;
  return { options: sorted, smaller };
}

/* The whole card in one object: what last time was, and the ways over it.
   `null` only when there is nothing useful to say at all. */
function setSuggestion(f, isDraft) {
  if (!f) return null;
  const earlier = earlierOutings(f, isDraft);
  if (!earlier.length) return { kind: "first" };

  /* the last DAY you trained it, and the best entry within that day */
  const lastDate = earlier[earlier.length - 1].date;
  let prev = null, prevM = -Infinity;
  for (const e of earlier) {
    if (e.date !== lastDate) continue;
    const m = metricOf(e);
    if (m != null && m > prevM) { prevM = m; prev = e; }
  }
  if (!prev) return { kind: "first" };

  const now = entryBest(f);
  const done = now != null && now > prevM;

  if (f.kind === "cardio") {
    const mins = Math.round(+prev.minutes), rpe = Math.round(+prev.intensity);
    if (!(mins > 0 && rpe > 0)) return { kind: "first" };
    const options = [
      { kind: "minutes", minutes: mins + SUG_CARDIO_MIN, intensity: rpe },
      { kind: "intensity", minutes: mins, intensity: Math.min(RPE_MAX, rpe + 1) },
    ].map((o) => ({ ...o, m: cardioScore(o.minutes, o.intensity) }))
     .filter((o) => o.m > prevM);
    if (!options.length) return { kind: "first" };
    return { kind: "cardio", prev: { minutes: mins, intensity: rpe, m: prevM, date: lastDate },
             ...bySmallestStep(options), now, done };
  }

  /* the set that carried that session, in the unit THIS entry is being
     typed in, so you should be able to read the suggestion straight onto
     the plates in front of you */
  const eu = unitOf(prev), fu = unitOf(f);
  const reps = Math.round(+prev.reps);
  const weight = Math.round(convertWeight(+prev.weight, eu, fu) * 100) / 100;
  if (!(reps > 0 && weight > 0)) return { kind: "first" };

  const base = metricFor(weight, reps, fu);
  const step = weightStep(fu, weight);
  const options = [
    { kind: "reps", reps: reps + 1, weight, step: 1 },
    { kind: "weight", reps, weight: Math.round((weight + step) * 100) / 100, step },
  ].map((o) => ({ ...o, m: metricFor(o.weight, o.reps, fu) }))
   .filter((o) => o.m != null && o.m > base);
  if (!options.length) return { kind: "first" };

  return { kind: "step", prev: { reps, weight, m: prevM, date: lastDate },
           base, ...bySmallestStep(options), unit: fu, now, done };
}

/* ── ONE SESSION OF ONE LIFT, SET BY SET ──────────────────────────────
   The rows behind every panel that reads a past session back: in the order
   they were done, and in the unit each was LOGGED in, never converted,
   which is the rule the rest of the history reads back under.

   Takes one DAY'S entries for the lift, because two entries of the same
   exercise on one day are one session's work. A legacy top-set row says so
   (`topOf`) rather than passing one set off as the lot.

   Shared by "Last time" in the entry form and by the history list in the
   exercise window, since that is one question asked from two places, and
   two answers to it would sooner or later disagree about what a session
   was. */
function outingRows(entries) {
  const rows = [];
  let note = "";
  for (const e of entries || []) {
    if (!note && e.notes) note = e.notes;
    if (e.kind === "cardio") {
      if (+e.minutes > 0 && +e.intensity > 0)
        rows.push({ minutes: e.minutes, intensity: e.intensity, m: cardioScore(+e.minutes, +e.intensity) });
      continue;
    }
    const u = unitOf(e);
    if (isDetailed(e)) {
      for (const st of filledSets(e))
        rows.push({ reps: st.reps, weight: st.weight, rpe: st.rpe, unit: u, m: est1RM(+st.weight, +st.reps) });
    } else if (+e.reps > 0 && +e.weight > 0) {
      /* a top-set row from before per-set logging: one set is all that was
         ever written down, and saying so beats showing it as if it were the lot */
      rows.push({ reps: e.reps, weight: e.weight, rpe: e.rpe, unit: u,
        m: est1RM(+e.weight, +e.reps), topOf: +e.sets > 0 ? +e.sets : null });
    }
  }
  let best = null;
  for (const r of rows) if (r.m != null && (best == null || r.m > best.m)) best = r;
  return { rows, note, best };
}

/* ── LAST TIME, IN FULL ───────────────────────────────────────────────
   The card above names ONE set, the best of last session, because that is
   the bar it is offering two ways over. One set is not the session. Four sets
   that fell apart and four that held share a best set and were not the same
   day's work, and it is the second, third and fourth you are actually stood
   there trying to match. So they are all here, in the order they were done.

   In the unit each was LOGGED in, never converted, which is the rule the rest
   of the history reads back under: what you typed is what you read.

   Read-only, deliberately. Everything else tappable in this window puts a
   number in the log, and last week's set is not a number you did today; the
   ways past it are the card above, and this is the record they came from. */
function lastOuting(f, isDraft) {
  if (!f) return null;
  const earlier = earlierOutings(f, isDraft);
  if (!earlier.length) return null;
  /* the last DAY you trained it, since two entries of the same lift on one day are
     one session's work, so both are read, in the order they were done */
  const date = earlier[earlier.length - 1].date;
  const { rows, note, best } = outingRows(earlier.filter((e) => e.date === date));
  if (!rows.length) return null;
  return { date, rows, note, best };
}

/* ── WHAT A NEW SET OPENS ON ──────────────────────────────────────────
   The set editor has to be pre-filled with something, and for a long time
   that something was the set above it. That is right exactly once (the
   first set, where there is nothing above and it opened blank) and wrong
   from the second onward, because it hands you set one's numbers again on
   a session that was never meant to be flat. Somebody working up 60/80/90
   got 60/60/60 offered and had to retype two thirds of their own workout.

   What the app already knows is better: last time's set in the SAME
   POSITION. Set three opens on last week's set three. It is the number you
   are standing there trying to match, it is already on screen in the "Last
   time" list above, and it makes a session that repeats last week's one tap
   per set. Past where last time ran out (a fourth set on a day that had
   three) it falls back to the set above, which is the old behaviour and the
   only honest guess left.

   Converted into the unit this entry is being logged in, because the history is
   read back in the unit it was written in, but this is a number about to be
   typed into today's log, and it has to be in today's units to mean
   anything. Nothing is written until the set is saved: this is a starting
   point in an editor, not an entry in the log. */
function openingSetFor(f, isDraft, index) {
  const eUnit = unitOf(f);
  const last = lastOuting(f, isDraft);
  const rows = last ? last.rows.filter((r) => +r.reps > 0 && +r.weight > 0) : [];
  const r = rows[index];
  if (r) {
    const w = convertWeight(+r.weight, r.unit || eUnit, eUnit);
    return newSet(String(r.reps), trimNum(w), r.rpe || "");
  }
  /* nothing at this position last time, so the set above is the next best guess */
  const prev = (f.setList || [])[index - 1];
  return prev ? newSet(prev.reps, prev.weight, prev.rpe) : newSet();
}

/* "vs. Your Best": compares against strictly earlier entries of the same
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

/* Which group an entry counts toward, which is the question a dozen dots,
   stripes and volume rows all ask. A cardio entry is filed under the cardio
   group whatever it has been renamed to; everything else under whatever
   group its exercise sits in now, falling back to the one stamped on the
   entry for a lift that has since left the library. */
const groupOfEntry = (e, library) =>
  e.kind === "cardio" ? cardioGroup() : muscleOf(e.exercise, library || state.library, e.muscle);

/* Dashboard rows: first-appearance order, MAXIFS/COUNTIF equivalents */
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

/* Volume tab: SUMIFS(sets, week, muscle), cardio counted in minutes */
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

/* The same sum over any inclusive span of days. Program weeks keep using
   volumeForWeek, since weekOf() floors everything before the start date
   into week 1, and a date range would quietly drop those rows, so this is
   only ever asked for the rolling window, which has no such edge. */
function volumeInRange(log, library, from, to) {
  const out = {};
  for (const e of log) {
    if (e.date < from || e.date > to) continue;
    if (e.kind === "cardio") out.Cardio = (out.Cardio || 0) + (+e.minutes || 0);
    else {
      const m = muscleOf(e.exercise, library, e.muscle);
      out[m] = (out[m] || 0) + (+e.sets || 0);
    }
  }
  return out;
}

/* The Progress tab's sets-per-week bars, cut into seven-day blocks
   counting back from today rather than from the program start date. The
   last bar is always the week you're standing in. */
const ROLLING_BLOCKS_MAX = 26;

function rollingSetBlocks(log, today = todayStr()) {
  const first = log.reduce((m, e) => (m == null || e.date < m ? e.date : m), null);
  const span = first ? Math.max(0, daysBetween(first, today)) : 0;
  const blocks = Math.min(ROLLING_BLOCKS_MAX, Math.floor(span / 7) + 1);
  const out = [];
  for (let i = blocks - 1; i >= 0; i--) {
    const to = addDays(today, -7 * i), from = addDays(to, -6);
    const sets = log.reduce((a, e) =>
      a + (e.kind !== "cardio" && e.date >= from && e.date <= to ? (+e.sets || 0) : 0), 0);
    out.push({ w: fmtShort(to), sets });
  }
  return out;
}

/* ── DELOADS: PLANNED, NOT GUESSED ────────────────────────────────────
   The app used to infer a deload was due by watching for five hard weeks
   in a row. It was guessing at something only the lifter knows (a light
   week can be a planned taper, a holiday, or flu), so now the deload is
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

/* ── PLANNING: A DATED INTENTION, NOT A RECORD ────────────────────────
   A PLAN is the workout you have decided to do on a day that has not
   happened yet. It lives in state.plans as {id, date, name, entries[]},
   and its entries are ordinary entry objects, the same shape the log
   uses, so the whole builder (the picker, presets, the set list, the
   set editor, the "beat last time" card) is reused verbatim to write one.

   WHAT MAKES IT A PLAN IS THAT IT IS NOT THE LOG.
   Nothing in state.plans is ever counted: not sets, not PRs, not volume,
   not the graphs, not a single badge. That is the whole reason this is a
   separate list rather than a log entry with a future date: the workable
   trick of "just log Wednesday now" quietly tells the app you have lifted
   things you have not lifted, and every number downstream believes it.

   THE PLAN IS CONSUMED BY THE DAY IT DESCRIBES. Start a plan and each of
   its entries hands its numbers over as a TARGET (`e.plan` below) on a
   fresh, empty entry. You log against the target, set by set; when the day
   is saved the plan row is deleted and the targets ride along inside the
   logged entries, so "did I do what I said I would" stays answerable
   forever, from the log alone. There is never a second source of truth
   about whether a day happened.

   PLAN vs PRESET. A preset is a bundle of exercises with no date and no
   numbers: the shape of a session you repeat. A plan is one dated session
   with the numbers you are going for. They compose, and planning a day from
   a preset is the normal way to start one.                              */

/* the target snapshot a planned entry hands to the entry that will log it,
   or null when the plan only named the exercise and left the numbers out */
function planTargetOf(pe) {
  if (!pe) return null;
  if (pe.kind === "cardio")
    return +pe.minutes > 0 && +pe.intensity > 0 ? { minutes: pe.minutes, intensity: pe.intensity } : null;
  const sets = filledSets(pe).map((s) => ({ reps: s.reps, weight: s.weight }));
  return sets.length ? { sets, unit: unitOf(pe) } : null;
}

const plansSorted = (list) => [...(list || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
const planOn = (list, dayStr) => (list || []).find((p) => p.date === dayStr) || null;
const planSetCount = (p) =>
  (p.entries || []).reduce((n, e) => { const t = planTargetOf(e); return n + (t && t.sets ? t.sets.length : 0); }, 0);

/* date → Set of muscle groups a plan covers, the calendar's hollow dots */
function planMarks(plans) {
  const out = {};
  for (const p of plans || [])
    for (const e of p.entries || []) {
      const m = groupOfEntry(e);
      (out[p.date] = out[p.date] || new Set()).add(m);
    }
  return out;
}

/* ── DID YOU DO WHAT YOU SAID ─────────────────────────────────────────
   Three verdicts, and no cleverness in them. A set BEAT its target if it
   was more on one axis and short on neither; it HIT the target if it
   matched; anything less is UNDER. Deliberately NOT judged on estimated
   1RM: three reps at a heavier weight scores higher than the eight you
   planned, and calling that "target hit" would be the app deciding it
   knows what you meant. Under is never scolded anywhere it is shown:
   the plan was a guess made days ago, and the log is what happened.   */

function setVerdict(actual, target) {
  if (!actual || !target) return null;
  const r = +actual.reps, w = +actual.weight, tr = +target.reps, tw = +target.weight;
  if (!(r > 0 && w > 0)) return null;
  if (r < tr || w < tw) return "under";
  return r > tr || w > tw ? "beat" : "hit";
}

function cardioVerdict(e, t) {
  const m = +e.minutes, i = +e.intensity;
  if (!(m > 0 && i > 0)) return null;
  if (m < +t.minutes || i < +t.intensity) return "under";
  return m > +t.minutes || i > +t.intensity ? "beat" : "hit";
}

/* How one logged entry stands against the target it was given. Planned sets
   are matched to logged sets BY POSITION: set 3 answers planned set 3, and
   anything logged past the end of the plan is a bonus set that can only
   help. Returns null for an entry that never carried a plan. */
function entryPlanResult(e) {
  const t = e && e.plan;
  if (!t) return null;
  if (e.kind === "cardio" || !t.sets) {
    const v = cardioVerdict(e, t);
    return { total: 1, done: v ? 1 : 0, hit: v === "hit" || v === "beat" ? 1 : 0, beat: v === "beat" ? 1 : 0, under: v === "under" ? 1 : 0, bonus: 0, verdicts: [v] };
  }
  const list = filledSets(e);
  const verdicts = t.sets.map((ts, i) => setVerdict(list[i], ts));
  const done = verdicts.filter(Boolean).length;
  return {
    total: t.sets.length, done,
    hit: verdicts.filter((v) => v === "hit" || v === "beat").length,
    beat: verdicts.filter((v) => v === "beat").length,
    under: verdicts.filter((v) => v === "under").length,
    bonus: Math.max(0, list.length - t.sets.length),
    verdicts,
  };
}

/* ── THE SAME VERDICT, POINTED AT LAST TIME ───────────────────────────
   A plan is one thing you can be measured against. Your own last session
   is the other, and for most days it is the only one there is.

   THE HOLE THIS FILLS. Est. 1RM speaks for an exercise through its BEST
   set, which is the right way to answer "what could I lift for a single"
   and the wrong way to answer "did today go better than last time". Match
   your top set and add a rep to your second and the estimate does not
   move, because the estimate was never about your second set. The graph
   goes flat on a session that was strictly better than the one before it.

   So this compares SET FOR SET BY POSITION: set two answers last time's
   set two, exactly as a planned set is answered by the set in its slot,
   and reusing setVerdict is the point. It refuses to judge on est. 1RM
   for the same reason the plan version does: more reps at the same weight
   is a better set, and a rep-max curve that calls it "no change" is the
   app arguing with someone about their own training.

   Sets past where last time ran out are simply unjudged. There is no
   verdict for a fourth set on a day that had three, and there is no
   penalty either, so a session can never score worse for containing more
   work, which is exactly the trap an average over sets falls into.

   Position is only honest if the order is, which is why the set list can
   be dragged into the order the sets actually happened (reorderSets). */
function lastTimeSets(f, isDraft) {
  const last = lastOuting(f, isDraft);
  if (!last) return null;
  const eUnit = unitOf(f);
  /* into the unit being typed in today, rounded where it will be read, so a
     kg set and the same set logged in lbs cannot disagree by a float hair */
  const rows = last.rows
    .filter((r) => +r.reps > 0 && +r.weight > 0)
    .map((r) => ({
      reps: +r.reps,
      weight: Math.round(convertWeight(+r.weight, r.unit || eUnit, eUnit) * 10) / 10,
    }));
  return rows.length ? { date: last.date, rows } : null;
}

/* How this entry stands against that session. Null when there is nothing to
   compare with: a plan already answers the question, cardio is not sets, and
   a first outing has no yesterday. */
function entryLastResult(f, isDraft) {
  if (!f || f.plan || f.kind === "cardio" || !isDetailed(f)) return null;
  if (!filledSets(f).length) return null;
  const prev = lastTimeSets(f, isDraft);
  if (!prev) return null;
  const list = f.setList || [];
  const verdicts = list.map((s, i) => (prev.rows[i] ? setVerdict(s, prev.rows[i]) : null));
  return {
    date: prev.date, rows: prev.rows, verdicts,
    beat: verdicts.filter((v) => v === "beat").length,
    hit: verdicts.filter((v) => v === "hit").length,
    under: verdicts.filter((v) => v === "under").length,
    extra: Math.max(0, list.filter(setHasData).length - prev.rows.length),
  };
}

/* the same sum over a whole day, for the card that greets you after you
   save one and for the chip on the day in your history */
function dayPlanResult(entries) {
  let any = false;
  const sum = { total: 0, done: 0, hit: 0, beat: 0, under: 0, bonus: 0, lifts: 0, liftsHit: 0 };
  for (const e of entries || []) {
    const r = entryPlanResult(e);
    if (!r) continue;
    any = true;
    sum.total += r.total; sum.done += r.done; sum.hit += r.hit;
    sum.beat += r.beat; sum.under += r.under; sum.bonus += r.bonus;
    sum.lifts += 1;
    if (r.hit >= r.total) sum.liftsHit += 1;
  }
  return any ? sum : null;
}

/* ── CALENDAR ARITHMETIC ──────────────────────────────────────────────
   Everything is done on ISO "YYYY-MM-DD" strings, which sort and compare
   as plain text, and on local Date objects built from local parts, which
   never trip over a daylight-saving shift the way UTC maths can. */

const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const monthOf = (dayStr) => String(dayStr).slice(0, 7);          // "2026-08"

const addDays = (dayStr, n) => {
  const d = parseDay(dayStr);
  return isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

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

/* The rolling equivalent of weekRange: the seven days ending on a day,
   which is what the Volume tab reads when the period is "last 7 days". */
const windowEnding = (dayStr) => ({ from: addDays(dayStr, -6), to: dayStr });

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
   be shown translated. Renaming the timer drops the key, see timer-save. */
const seedTimers = () =>
  SEED_TIMERS.map((secs, i) => ({
    id: "seed-timer-" + secs, name: "Rest " + fmtClock(secs), key: "rest", duration: secs,
    endsAt: null, remaining: null, doneAt: null, pinned: i < 3, createdAt: Date.now() + i,
    sound: DEFAULT_SOUND, volume: DEFAULT_VOLUME,
  }));

const defaultState = () => ({
  version: 12,
  /* `sex` is "" until asked, and it is only ever asked by the strength
     standards, whose tables are split male/female. It sits in settings so it
     is remembered and travels in a backup, not because the app wants a
     demographic, which is why Profile doesn't offer it. */
  settings: { name: "", units: "kg", startDate: todayStr(), daysPerWeek: 4, theme: "dark", lang: "en", weekMode: "program", sex: "" },
  library: DEFAULT_LIBRARY,
  groups: DEFAULT_GROUPS.map((g) => ({ ...g })),   // [{name,key?,color}], user-editable
  log: [],        // {id,date,exercise,muscle,kind,sets,reps,weight,rpe,unit,minutes,intensity,notes,createdAt,setList?}
  body: [],       // {id,date,weight,waist,chest,arm,thigh,glutes,notes}
  goals: {},      // { [exerciseName]: number }
  volumeGoals: {},// { [muscleGroup]: target sets per period }, user's own volume target
  presets: [],    // [{id,name,description,pinned,exercises:[{exercise,muscle,kind}],createdAt}]
  timers: seedTimers(), // [{id,name,duration,endsAt,remaining,doneAt,pinned,createdAt}]
  dayDrafts: [],  // [{id,date,entries,savedAt}], workout days you backed out of, see closeWorksheet()
  plans: [],      // [{id,date,name,entries,createdAt}], days you intend to train, see planTargetOf()
  deloads: [],    // [{id,start,end}], planned easy weeks, inclusive ISO dates
  drafts: {},     // half-finished forms, restored after a crash/lock, see snapshotDrafts()
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
       stamp that unit on it, since otherwise switching the default later would
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
       · FSBS is gone, the app always logs set by set now. Entries already on
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
       nothing to convert (a guess isn't data), so planned deloads start
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
       predate it keep doing exactly what they did before, since the default is
       the chime that used to be the only option. */
    s.timers = (s.timers || []).map((t) => ({ sound: DEFAULT_SOUND, volume: DEFAULT_VOLUME, ...t }));
    s.version = 8;
  }
  if (v < 9) {
    /* v9 added the choice between program weeks and a rolling last-7-days
       window. Everyone already on the app has been reading program weeks,
       so that is what they keep, and the setting only ever moves if they
       move it. */
    if (!s.settings) s.settings = {};
    if (s.settings.weekMode !== "rolling") s.settings.weekMode = "program";
    s.version = 9;
  }
  if (v < 10) {
    /* v10 added planning: days you have decided on but not done yet. There is
       nothing to convert (an intention was never storable before), so the
       list starts empty, and every entry already in the log has no target on
       it and is read exactly as it always was. */
    if (!Array.isArray(s.plans)) s.plans = [];
    s.version = 10;
  }
  if (v < 11) {
    /* v11 filled the Progress tab's reserved second segment with the strength
       standards. Its tables are split male/female, so a setting for that had
       to exist, and it starts empty rather than defaulting, because a default
       here isn't a preference the user can shrug at, it's the wrong table and
       therefore the wrong rank. It gets answered in the one place it is used,
       the first time somebody asks the standards a question. */
    if (!s.settings) s.settings = {};
    if (s.settings.sex !== "male" && s.settings.sex !== "female") s.settings.sex = "";
    s.version = 11;
  }
  if (v < 12) {
    /* v12 repairs group keys. Deleting ANY group used to rebuild the survivors
       from a list of names, which silently dropped every one of their keys, so
       one delete un-translated all seven shipped groups and lost track of
       which of them was cardio. The same back-fill v5 ran does the repair,
       because a group still carrying the name we shipped it under is one of
       ours whatever has happened to it since; a group the user renamed is
       past helping, and is theirs anyway. */
    const seeded = new Set(DEFAULT_GROUPS.map((g) => g.name));
    s.groups = (s.groups || []).map((g) => (seeded.has(g.name) && !g.key ? { ...g, key: g.name } : g));
    s.version = 12;
  }
  return s;
}

/* Fold a saved object into the shape this version expects: defaults for
   every key the save predates, then the migrations. Shared by the first
   load and by an imported backup on purpose: a file written by an older
   version has to come up exactly as the same data would if it had been
   sitting in localStorage all along, or a restore would be a downgrade. */
function hydrate(saved) {
  const base = defaultState();
  return migrate({ ...base, ...saved, settings: { ...base.settings, ...(saved && saved.settings) } });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return hydrate(JSON.parse(raw));
  } catch { /* first run, key doesn't exist yet */ }
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

/* write straight through, used when the page is about to go away */
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

/* ── BACKUP: EVERYTHING, OUT AND BACK IN ──────────────────────────────
   The whole point of this app is that it keeps what you did, and the whole
   risk of it is that a browser holds that in one origin's localStorage:
   cleared by a "clear browsing data", lost with the phone, and invisible
   to the new phone. Export writes the lot to a file the user keeps; import
   reads one back over the top. Between them they are how you move to a new
   device and how you take a checkpoint before anything risky.

   `state` IS the data (one object, one key in localStorage), so a backup
   is that object and nothing has to be enumerated here. That matters more
   than it looks: a hand-listed backup silently stops covering whatever is
   added next, and the first anyone hears of it is a restore missing their
   custom exercises. Adding a field to defaultState() is all it takes to be
   included, forever.

   One exception, `drafts`: the crash-recovery snapshot of whichever form
   happened to be open at the moment of export. It is a picture of the UI,
   not of your training, and restoring it would drop the person on the
   other end into a half-typed set editor belonging to a session they were
   not in. Parked days are not this: those are state.dayDrafts, they are
   deliberate, and they travel. */
const BACKUP_APP = "zenofit";
const BACKUP_FORMAT = 1;

function backupText() {
  const { drafts, ...data } = state;   // eslint-disable-line no-unused-vars
  return JSON.stringify({
    app: BACKUP_APP, format: BACKUP_FORMAT, version: state.version,
    exportedAt: new Date().toISOString(), state: data,
  }, null, 2);
}

/* how much is in here, for the line above the Import button and for the
   confirm that asks before a restore paves over what is there now */
function backupSummary(data) {
  return T("profile.backupCounts", {
    days: TN("day", new Set((data.log || []).map((e) => e.date)).size),
    sets: TN("logEntry", (data.log || []).length),
    lifts: TN("exercise", (data.library || []).length),
    body: TN("checkin", (data.body || []).length),
  });
}

function exportBackup() {
  writeNow();   // flush the debounce so the file and this device agree
  const name = `zenofit-backup-${todayStr()}.json`;
  const url = URL.createObjectURL(new Blob([backupText()], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Accepts the wrapper this app writes and, deliberately, a bare state
   object too: someone who opens the file, or pulls it out of a devtools
   copy of localStorage, should not be turned away over an envelope. What
   is NOT accepted is anything without a log array and a settings object,
   because overwriting a training history with a JSON file that happened to
   parse is the one failure here that cannot be undone. */
function importBackup(text) {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON at all */ }
  const data = parsed && typeof parsed.state === "object" && parsed.state ? parsed.state : parsed;
  const looksRight = data && typeof data === "object" && !Array.isArray(data) &&
    Array.isArray(data.log) && data.settings && typeof data.settings === "object";
  if (!looksRight) { alert(T("profile.importBad")); return; }

  const when = parsed && parsed.exportedAt ? fmtShort(String(parsed.exportedAt).slice(0, 10)) : "—";
  if (!confirm(T("profile.confirmImport", { when, what: backupSummary(data) }))) return;

  const next = hydrate(data);
  next.drafts = {};              // someone else's open form is not yours
  state = next;

  /* every open form points at records that no longer exist */
  ui.workoutSheet = null; ui.entryForm = null; ui.setForm = null;
  ui.bodyForm = null; ui.exWin = null; ui.exWinDraft = null;
  ui.presetForm = null; ui.presetView = null; ui.groupForm = null;
  ui.groupSheet = false; ui.timerForm = null; ui.deloadForm = null;
  ui.planResult = null; ui.showBody = false; ui.picking = false;
  ui.showProfile = false; ui.profileDraft = null; ui.profileLangWas = null;
  resetTransient();
  ui.tab = "home";

  applyTheme(state.settings.theme);   // the file carries its own theme
  writeNow();
  render();
  alert(T("profile.importOk", { what: backupSummary(state) }));
}

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
  logSeg: "history",   // history | calendar
  /* the day the Log tab has been sent to by a jump from somewhere else, held
     only until the frame that lands on it has scrolled to it, see flashLogDay */
  logJump: null,
  showProfile: false,
  profileDraft: null,
  profileLangWas: null,   // the saved language, so a previewed one can be backed out of
  showBody: false,      // Body measurements, a window off the header, not a tab
  groupSheet: false,    // the "muscle groups" manager
  groupForm: null,      // {name, color, orig, then}, add/edit one group
  /* {date, entries:[]} draft. Two different things on it are called a plan
     and they never co-exist, because a sheet is either writing a plan or
     logging a day: `planning: true` + `planId` is the PLAN BEING EDITED,
     `planIds: []` on an ordinary sheet is the plan or plans the day is
     ANSWERING (see plan-start / commitWorkout). */
  workoutSheet: null,
  presetForm: null,     // {name, description} draft while saving the current day as a preset
  presetView: null,     // working copy of a saved preset being managed/edited
  picking: false,
  pickerQ: "",
  pickerQuick: null,    // {name, muscle}
  pickerSeg: "exercises", // exercises | presets, picker mode
  entryForm: null,      // {f, isDraft}
  setForm: null,        // {s, isNew}, the single-set editor inside a Detailed entry
  timerForm: null,      // {t, isNew}, the custom-timer editor
  timerToast: null,     // {id,name}, "time's up" banner, shown on any tab
  exWin: null,          // exercise detail window: {name} for an existing lift, or {isNew:true}
  exWinEdit: false,     // false = read-only view, true = editable
  exWinDraft: null,     // working copy while editing/creating
  exHistAll: false,     // its history list is showing every session, not just the recent ones
  bodyForm: null,
  bodyFormWasNew: false,
  deloadOpen: false,
  calMonth: null,       // "YYYY-MM" the calendar is showing
  calDay: null,         // the day the calendar has selected, what the day card is about
  planResult: null,     // {date, name, sum}, "here is how the plan went", after saving one
  deloadPick: null,     // {start} while tapping out a new deload's two ends
  deloadForm: null,     // {id, start, end, isNew}, the deload editor
  accordions: {},   // all accordions start collapsed
  volumeWeek: null,     // program-week mode: which week the Volume tab is reading
  volAnchor: null,      // rolling mode: the LAST of the seven days it is reading
  presetOrder: false,   // Library → Presets is in drag-to-reorder mode
  pinnedOrder: false,   // …the pinned preset strip on Home is
  timerOrder: false,    // …the pinned timer dials are, wherever they appear
  entryOrder: false,    // …the exercise list inside the open workout day is
  /* …the set list is, and this one holds the ENTRY'S ID rather than a flag:
     opening a different lift is then not a state to clean up, it simply
     stops matching, so none of the twenty places that open an entry form
     has to remember to switch the mode off. */
  setOrder: null,
  libOrder: false,      // …the exercise library is, inside each of its groups
  progSeg: "progress",  // progress | standards, Progress sub-tab
  progressSelected: null,
  /* the strength standards lookup (Progress → Standards). Like the 1RM
     calculator it is a question you ask, not a feed: `std` is the form,
     `stdResult` the last answer, and neither is cleared by changing tab.
     See stdForm() for why the form is built once and then left alone. */
  std: null,            // {slug, sex, bw, bwFrom, lift, liftFromLog}
  stdResult: null,      // the last check, see stdCheck()
  stdPick: false,       // the standards' own exercise picker is open
  stdQ: "",             // …and its search box
  /* the progress graph is an instrument, not a picture: chartView is the
     slice of the series on screen (float index bounds), chartSel the entry
     whose dot is open, chartFull which graph has taken over the screen.
     There are two graphs ("main" on the Progress tab and "ex" inside the
     exercise window) and each keeps its own zoom and its own selection. */
  chartView: { main: null, ex: null },   // {lo, hi}, null means "the whole series"
  chartSel: { main: null, ex: null },    // id of the logged entry behind the selected dot
  chartFull: null,      // "main" | "ex" | null
  calc: { weight: "", reps: "", unit: null },  // the 1RM calculator's fields
  calcResult: null,     // {weight, reps, oneRM, unit}, the last calculation
  goalEditing: null,    // exercise name whose goal is being edited
  goalVal: "",
  volGoalEditing: null, // muscle group whose set target is being edited
  volGoalVal: "",
  libraryQ: "",
  libraryFilter: "All",
  librarySeg: "exercises", // exercises | presets, Library sub-tab
};

function resetTransient() {
  ui.deloadOpen = false;
  ui.deloadPick = null;
  ui.calMonth = monthOf(todayStr());
  ui.calDay = todayStr();
  ui.accordions = {};
  ui.progSeg = "progress";
  ui.progressSelected = null;
  ui.chartView = { main: null, ex: null }; ui.chartSel = { main: null, ex: null }; ui.chartFull = null;
  ui.goalEditing = null;
  ui.volGoalEditing = null;
  ui.libraryQ = "";
  ui.libraryFilter = "All";
  ui.librarySeg = "exercises";
  ui.exHistAll = false;
  ui.presetOrder = false;
  ui.pinnedOrder = false;
  ui.timerOrder = false;
  ui.entryOrder = false;
  ui.setOrder = null;
  ui.libOrder = false;
  ui.volumeWeek = weekOf(todayStr(), state.settings.startDate);
  ui.volAnchor = todayStr();
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

/* The unit dropdown that lives inside a weight field's label: tap "kg" and
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
   place, with no full re-render, so no flicker. Height is released to auto when the
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

/* ═════════════════════════ VIEWPORT ENGINE ══════════════════════════
   One place decides how big the app is on the device it woke up on, and
   the rest of the file asks it in CSS rather than guessing in pixels. The
   variables it writes, and what styles.css builds out of them, are
   documented in the VIEWPORT ENGINE block there; this half is only the
   two answers that cannot be reached from CSS (how much to scale by, and
   how wide the frame is) plus the listeners that keep them current.

   The shape of the answer:

     frameW = min(availW, VP_FLUID_MAX)
     scale  = clamp(1, min(availW / frameW, availH / VP_REF_H), VP_SCALE_MAX)

   On any phone frameW *is* availW, so the ratio is 1 and the clamp pins
   the scale at 1, so the design renders at the size it was drawn, on a 320pt
   SE and on a 440pt Pro Max alike, and the wide handsets simply stop
   leaving grey bars either side. Past VP_FLUID_MAX the frame refuses to
   keep widening (a 900pt-wide phone layout is a bad layout) and grows by
   scaling instead, held back by the height as well as the width so a short
   desktop window gets a frame that still fits in it rather than one
   cropped at the bottom.

   Nothing here re-renders. It writes custom properties on <html>; the
   frame, the safe-area padding and every clearance stacked on the bottom
   nav are calc()s off those, so a rotation, a keyboard, or Safari's
   toolbar sliding away is absorbed by the browser at layout time. */

const VP_FLUID_MAX = 480;   // widest the frame is allowed to be laid out at
const VP_REF_H     = 820;   // the logical height a scaled-up frame aims for
const VP_SCALE_MAX = 1.35;  // ceiling, so a 4K monitor doesn't get a billboard

/* what the frame is currently scaled by. 1 on every phone, but pointer
   coordinates arrive in screen pixels while the frame is laid out in its
   own, so anything doing arithmetic between the two divides by this. */
let vpScale = 1;
let vpFrameW = 0;   // the width last written, so a no-op update stays a no-op

/* env() is only legible from CSS, so put the question to a throwaway element
   and read the numbers back off its computed padding. It is out of flow,
   hidden and untappable, and the largest an inset has ever made it is a few
   dozen pixels in the corner it is pinned to, so it costs the page nothing. */
let vpProbe = null;
function safeInsets() {
  if (!vpProbe) {
    vpProbe = document.createElement("div");
    vpProbe.setAttribute("aria-hidden", "true");
    vpProbe.style.cssText =
      "position:absolute;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) " +
      "env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.appendChild(vpProbe);
  }
  const s = getComputedStyle(vpProbe);
  return {
    t: parseFloat(s.paddingTop) || 0, r: parseFloat(s.paddingRight) || 0,
    b: parseFloat(s.paddingBottom) || 0, l: parseFloat(s.paddingLeft) || 0,
  };
}

const dvhSupported = !!(window.CSS && CSS.supports && CSS.supports("height", "100dvh"));

/* The height the scale is allowed to reason about. An on-screen keyboard
   takes half the viewport with it, and a frame that quietly shrank every
   time someone typed a number would be worse than one that never fitted:
   while a field has focus the last keyboard-free height stands. Width is
   never affected by a keyboard, so it needs no such care. */
let vpBaseH = 0;
const vpTyping = () => {
  const el = document.activeElement;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
};

function applyViewport() {
  const root = document.documentElement;
  const ins = safeInsets();
  const availW = Math.max(240, (root.clientWidth || window.innerWidth || 360) - ins.l - ins.r);
  const availH = Math.max(320, root.clientHeight || window.innerHeight || 640);
  if (!vpBaseH || !vpTyping()) vpBaseH = availH;

  const frameW = Math.min(availW, VP_FLUID_MAX);
  const scale = Math.min(VP_SCALE_MAX, Math.max(1, Math.min(availW / frameW, vpBaseH / VP_REF_H)));

  const next = Math.round(scale * 1e4) / 1e4;
  /* nothing changed is the common case (a scroll that moved the browser
     toolbar, a keyboard opening) and writing the same values back would
     invalidate style for no reason, and risk a ResizeObserver loop. Only a
     browser without dvh has to carry on regardless: there --pb-vh is a
     measured number rather than a unit, and it is what just moved. */
  if (next === vpScale && frameW === vpFrameW && dvhSupported) return;

  vpScale = next; vpFrameW = frameW;
  root.style.setProperty("--pb-scale", String(vpScale));
  root.style.setProperty("--pb-frame-w", frameW + "px");
  document.body.classList.toggle("pb-scaled", vpScale !== 1);

  /* the dvh fallback for browsers that never learned the unit: innerHeight is
     what is actually visible there, and it moves with the browser chrome */
  if (!dvhSupported) root.style.setProperty("--pb-vh", (window.innerHeight || availH) + "px");
}

/* Run straight off the event rather than through requestAnimationFrame: rAF
   is paused while a tab is in the background, and a phone that was rotated
   with the app in the background would come back the wrong size. The work is
   one style read and three property writes, and resize fires at most once a
   frame, so there is nothing here worth deferring. pageshow covers the
   back/forward cache, which restores a page at whatever size it left. */
window.addEventListener("resize", applyViewport);
window.addEventListener("orientationchange", applyViewport);
window.addEventListener("pageshow", applyViewport);
if (window.visualViewport) window.visualViewport.addEventListener("resize", applyViewport);
/* the braces to that belt: a ResizeObserver on the document element is told
   the layout viewport changed by the layout engine itself, so it catches the
   cases a resize event is known to miss or fire late for: an Android soft
   keyboard, a desktop window still being dragged, a split-screen divider */
if (window.ResizeObserver) new ResizeObserver(applyViewport).observe(document.documentElement);

/* ═════════════════════════════ RENDER ══════════════════════════════ */

const app = document.getElementById("app");

/* ── LANDING ON A DAY ─────────────────────────────────────────────────
   Sending someone to a date is not the same as showing it to them. The
   history is a column of near-identical cards a long way down a scroll,
   and a tab that merely changed underneath is a jump nobody can see. So
   the day is scrolled to and lit for a moment on arrival.

   The marker is spent on the frame that uses it: a highlight that survives
   the next render is a highlight nobody asked for, and the class is put on
   the node rather than into the HTML for the same reason, since render()
   rebuilds `#app` wholesale and would replay the flash on every keystroke
   afterwards. */
function flashLogDay() {
  const date = ui.logJump;
  ui.logJump = null;
  const card = app.querySelector(`[data-day="${date}"]`);
  if (!card) return;                       // the day was deleted while we were away
  card.scrollIntoView({ block: "start" });
  card.classList.add("pb-flash");
}

function render() {
  /* re-measure the device first. The engine's own listeners normally have
     this done already and the call costs nothing when nothing has changed,
     but a frame is about to be built against these numbers, so this is the
     one moment they are worth being certain of. */
  applyViewport();

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

  /* the frame is exactly one viewport tall so the content area scrolls
     internally and the bottom nav is always visible without scrolling the
     page. Both of its dimensions, and the scale it is drawn at, come from
     the viewport engine above, see the VIEWPORT ENGINE block in styles.css
     for what .pb-viewport / .pb-frame resolve to on a given device. */
  let html = `<div class="pb-viewport">
  <div class="pb-root pb-frame">`;

  /* header (non-home tabs) */
  if (tab !== "home") {
    html += `<div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--border-soft)">
      <img src="logoC.png" alt="${T("a11y.logo")}" width="30" height="30" style="width:30px;height:30px;object-fit:contain;border-radius:8px;display:block;flex-shrink:0">
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${titles[tab]}</div>
      ${rollingWeeks() ? "" : chip(T("common.wkShort", { n: currentWeek }), "var(--gold)")}
      <button data-action="open-body" title="${T("a11y.bodyBtn")}" style="color:var(--muted);padding:4px">${icon("ruler", 20)}</button>
      <button data-action="open-profile" style="color:var(--muted);padding:4px">${icon("settings", 20)}</button>
    </div>`;
  }

  /* content */
  html += `<div class="pb-scroll" data-scrollkey="main-${tab}" style="flex:1;min-height:0;overflow-y:auto;padding-bottom:var(--pb-content-pb)">`;
  if (tab === "home") html += renderHome(settings, currentWeek, unit);
  if (tab === "log") html += renderLog(log, library, badges, settings, unit, currentWeek);
  if (tab === "progress") html += renderProgress(log, library, goals, badges, settings, unit);
  if (tab === "library") html += renderLibrary(library);
  if (tab === "timer") html += renderTimers();
  if (tab === "calc") html += renderCalc();
  html += `</div>`;

  /* "time's up" banner, floating above the nav on whatever tab you're on, so a
     rest timer finishing while you're logging a set still gets your attention */
  if (ui.timerToast) {
    html += `<div class="pb-sheet" style="position:absolute;left:12px;right:12px;bottom:var(--pb-toast-b);z-index:40">
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

  /* FAB: always-visible overlay on Log */
  if (tab === "log" && !ui.workoutSheet) {
    html += `<button data-action="fab" class="pb-btn pb-gold" style="position:absolute;right:18px;bottom:var(--pb-fab-b);width:56px;height:56px;border-radius:18px;box-shadow:0 8px 22px rgba(233,185,73,.35);z-index:30">${icon("plus", 26, 'stroke-width="2.6"')}</button>`;
  }

  /* bottom nav */
  const NAV = [
    ["home", "home", T("nav.home")], ["log", "clipboard-list", T("nav.log")], ["timer", "timer", T("nav.timer")],
    ["progress", "trending-up", T("nav.progress")], ["calc", "calculator", T("nav.calc")],
    ["library", "book-open", T("nav.library")],
  ];
  /* a running timer puts a live dot on its nav icon from anywhere in the app */
  const timersRunning = (state.timers || []).some((t) => t.endsAt || t.doneAt);
  html += `<div style="position:absolute;bottom:0;left:0;right:0;background:var(--nav-bg);backdrop-filter:blur(10px);border-top:1px solid var(--border-soft);display:flex;padding:8px 2px calc(14px + var(--pb-sab));z-index:25">`;
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
  if (ui.stdPick) html += renderStdPicker();
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
  if (ui.planResult) html += renderPlanResult();

  html += `</div></div>`;
  app.innerHTML = html;

  /* restore scroll */
  app.querySelectorAll("[data-scrollkey]").forEach((el) => {
    if (scrolls[el.dataset.scrollkey] != null) el.scrollTop = scrolls[el.dataset.scrollkey];
  });

  if (window.lucide) lucide.createIcons();
  drawCharts();

  /* after the icons, because they are what settles the final heights this
     scroll is measured against */
  if (ui.logJump) flashLogDay();

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
    /* crossfade the page body, but not while an overlay is opening/closing,
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
  persist();       // every frame is a save point, see snapshotDrafts()
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

  if (ui.pinnedOrder && pinned.length > 1)
    return `<div class="pb-card2" style="overflow:hidden">
      ${pinned.map((p, i) => reorderRow("pinnedPreset", i, pinned.length,
        esc(p.name), TN("move", (p.exercises || []).length))).join("")}
    </div>
    <div style="font-size:11.5px;color:var(--faint);line-height:1.5;padding:9px 2px 0">
      ${T("home.pinnedReorderHint", { icon: icon("grip-vertical", 11) })}
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
   explicit pause / reset pair underneath: mid-set, with a bar in your
   hands, "tap the dial and hope it did the right thing" isn't good enough,
   so every pinned dial gets the same buttons the Timer tab's cards have,
   wherever it appears: Home, the workout window and the exercise window. */
function pinnedTimerDial(t) {
  const phase = timerPhase(t);
  const left = timerRemaining(t);
  const done = phase === "done";
  const frac = t.duration > 0 ? Math.max(0, Math.min(1, left / t.duration)) : 0;
  /* an idle dial is a full but quiet ring, clearly "ready", not "finished" */
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

/* The three dials become three rows while you rearrange them: a dial is
   a control you tap to start a rest, so it can't also be the thing you
   grab and drag. Same reasoning as the preset cards. */
function renderPinnedTimerOrder(timers) {
  return `<div class="pb-card2" style="overflow:hidden">
    ${timers.map((t, i) => reorderRow("pinnedTimer", i, timers.length,
      esc(timerLabel(t)), fmtClock(t.duration))).join("")}
  </div>
  <div style="font-size:11.5px;color:var(--faint);line-height:1.5;padding:9px 2px 0">
    ${T("timers.reorderHint", { icon: icon("grip-vertical", 11) })}
  </div>`;
}

/* the little Reorder / Done toggle that sits in a section title */
function orderToggle(action, on, show) {
  if (!show) return "";
  return `<button data-action="${action}" style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;letter-spacing:.04em;color:${on ? "var(--gold)" : "var(--faint)"};padding:2px 0">
    ${icon(on ? "check" : "arrow-up-down", 12)} ${on ? T("preset.reorderDone") : T("preset.reorder")}
  </button>`;
}

function renderPinnedModule() {
  const timers = pinnedTimers();
  const pinned = (state.presets || []).filter((p) => p.pinned);
  return `<div class="pb-card" style="margin-top:14px;padding:13px 14px 15px">
    ${sectionTitle(T("home.pinnedPresets"), orderToggle("pinned-reorder", ui.pinnedOrder, pinned.length > 1))}
    ${renderPinnedPresets()}
    <div class="pb-hairline" style="margin:15px 0 12px"></div>
    ${sectionTitle(T("home.pinnedTimers"), orderToggle("timer-reorder", ui.timerOrder, timers.length > 1))}
    ${timers.length
      ? (ui.timerOrder && timers.length > 1
        ? renderPinnedTimerOrder(timers)
        : `<div style="display:flex;align-items:flex-start;gap:6px">${timers.map((t) => pinnedTimerDial(t)).join("")}</div>`)
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

/* ── TODAY'S PLAN ON THE HOME SCREEN ──────────────────────────────────
   This is deliberately NOT another pinned-preset strip, and the
   difference is the whole reason the feature exists.

   A pinned preset is a TEMPLATE you reach for: no date, no numbers, "I
   think today is a push day". This is an APPOINTMENT: the day you decided
   on, with the weights you decided on, and it is on the home screen today
   only because today is when it is. So it sits above the pinned strip and
   below Start, it names the numbers rather than the moves, and it is gone
   again tomorrow, and the strip underneath is still there for the days you
   never planned, which for most people is most of them.

   Tomorrow gets one quiet line and no card. Knowing it is coming is
   useful; a second call-to-action for a day you cannot do yet is not. */
function renderTodayPlan(log) {
  const today = todayStr();
  const plan = planOn(state.plans, today);
  const next = plansSorted(state.plans).find((p) => p.date > today);
  const trained = log.some((e) => e.date === today);

  if (!plan) {
    if (!next || daysBetween(today, next.date) > 1) return "";
    return `<button data-action="plan-open" data-d="${esc(next.date)}" style="width:100%;display:flex;align-items:center;gap:8px;margin-top:12px;padding:2px;color:var(--muted);text-align:left">
      ${icon("calendar-check", 13, 'style="color:var(--faint);flex-shrink:0"')}
      <span style="flex:1;min-width:0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${T("plan.tomorrowLine", { what: next.name ? esc(next.name) : TN("move", (next.entries || []).length) })}
      </span>
      ${icon("chevron-right", 13, 'style="color:var(--faint);flex-shrink:0"')}
    </button>`;
  }

  const sets = planSetCount(plan);
  return `<div class="pb-card" style="margin-top:12px;overflow:hidden;border-color:rgba(233,185,73,.4);background:rgba(233,185,73,.06)">
    <div style="padding:12px 14px 11px">
      <div style="display:flex;align-items:baseline;gap:8px">
        <div class="pb-label" style="color:var(--gold)">${T("plan.today")}</div>
        <div style="flex:1"></div>
        ${trained ? chip(T("plan.alreadyTrained")) : ""}
      </div>
      <div class="pb-num" style="font-size:19px;font-weight:700;line-height:1.15;margin-top:2px">${plan.name ? esc(plan.name) : T("plan.badge")}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:1px">
        ${TN("move", (plan.entries || []).length)}${sets ? " · " + T("plan.nSets", { n: sets }) : ""}
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;margin-top:11px">${planEntryRows(plan.entries)}</div>
    </div>
    <div style="display:flex;border-top:1px solid var(--border-soft)">
      <button data-action="plan-start" data-id="${esc(plan.id)}" style="flex:1;padding:13px;color:var(--gold);font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;gap:7px">
        ${icon("play", 15)} ${T("plan.start")}
      </button>
      <button data-action="plan-edit" data-id="${esc(plan.id)}" style="flex-shrink:0;padding:13px 18px;color:var(--muted);border-left:1px solid var(--border-soft)">${icon("pencil", 15)}</button>
    </div>
  </div>`;
}

function renderHome(settings, currentWeek, unit) {
  const deloadBanner = renderDeloadBanner(deloadStatus(state.deloads));

  return `<div class="" style="padding:calc(18px + var(--pb-sat)) 16px 0">
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
      ${rollingWeeks() ? T("home.rollingLine") : T("home.weekLine", { n: currentWeek })}
    </div>

    <button data-action="new-workout" class="pb-btn pb-gold" style="width:100%;padding:16px 0;font-size:16.5px;border-radius:14px">
      ${icon("plus", 20, 'stroke-width="2.6"')} ${T("home.start")}
    </button>

    ${renderTodayPlan(state.log)}

    ${deloadBanner ? `<div style="margin-top:12px">${deloadBanner}</div>` : ""}

    ${renderPinnedModule()}

    <div style="margin-top:22px">
      ${sectionTitle(T("home.howThisWorks"))}

      <!-- These are a REFERENCE, not a tour: each one answers a question the
           app cannot answer by being tapped. A rule that decides what happens
           to someone's data (what counts, what is dropped, what a preset
           saves, where the numbers live) belongs here. Narration of the
           interface does not: nobody needs to be told that + adds an
           exercise, and the same detail volunteered mid-set is noise. -->
      ${accordion("howto", T("acc.howto.title"), icon("info", 16, 'style="color:var(--blue)"'), T("acc.howto.body"))}
      ${accordion("counts", T("acc.counts.title"), icon("list-checks", 16, 'style="color:var(--red)"'), T("acc.counts.body"))}
      ${accordion("plan", T("acc.plan.title"), icon("calendar-check", 16, 'style="color:var(--gold)"'), T("acc.plan.body"))}
      ${accordion("beating", T("acc.progress.title"), icon("trophy", 16, 'style="color:var(--gold)"'), T("acc.progress.body", { unit }))}
      ${accordion("onerm", T("acc.rm.title"), icon("trending-up", 16, 'style="color:var(--green)"'), T("acc.rm.body", { unit }))}
      ${accordion("volume", T("acc.volume.title"), icon("calendar-days", 16, 'style="color:var(--steel)"'), T("acc.volume.body", { icon: icon("target", 11) }))}
      ${accordion("presets", T("acc.presets.title"), icon("layers", 16, 'style="color:var(--gold)"'), T("acc.presets.body"))}
      ${accordion("library", T("acc.library.title"), icon("book-open", 16, 'style="color:#a07ec2"'), T("acc.library.body"))}
      ${accordion("timers", T("acc.timers.title"), icon("bell-ring", 16, 'style="color:var(--blue)"'), T("acc.timers.body"))}
      ${accordion("cardio", T("acc.cardio.title"), icon("timer", 16, 'style="color:#a07ec2"'), T("acc.cardio.body"))}
      ${accordion("units", T("acc.units.title"), icon("ruler", 16, 'style="color:var(--steel)"'), T("acc.units.body"))}
      ${accordion("data", T("acc.data.title"), icon("settings", 16, 'style="color:var(--muted)"'), T("acc.data.body"))}
    </div>

    <div style="height:8px"></div>
  </div>`;
}

/* ───────────────────────── LOG (history + volume) ─────────────────── */

function renderLog(log, library, badges, settings, unit, currentWeek) {
  const seg = ui.logSeg;
  const segs = [["history", T("log.history")], ["calendar", T("log.calendar")]].map(([id, label]) =>
    `<button data-action="log-seg" data-id="${id}" class="pb-btn" style="flex:1;padding:8px 0;font-size:13px;border-radius:8px;background:${seg === id ? "var(--raise)" : "transparent"};color:${seg === id ? "var(--text)" : "var(--muted)"};border:${seg === id ? "1px solid var(--border)" : "1px solid transparent"}">${label}</button>`).join("");

  return `<div class="" style="padding:12px 16px 0">
    <div style="display:flex;background:var(--surface2);border-radius:11px;padding:3px;margin-bottom:14px;border:1px solid var(--border-soft)">${segs}</div>
    ${seg === "history" ? renderHistory(log, library, badges, settings, unit) : renderCalendarTab(log, library, settings, currentWeek)}
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
          <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(groupOfEntry(e))};flex-shrink:0"></span>
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
    /* a program-week label, and nothing to say in rolling mode */
    const wk = rollingWeeks() ? null : weekOf(date, settings.startDate);
    const sets = entries.filter((e) => e.kind !== "cardio").reduce((a, e) => a + (+e.sets || 0), 0);
    const mins = entries.filter((e) => e.kind === "cardio").reduce((a, e) => a + (+e.minutes || 0), 0);
    const dayRes = dayPlanResult(entries);
    /* lifts done back to back read that way months later too */
    const daySupers = superMarks(entries);
    const rows = entries.map((e, ei) => {
      const b = badges[e.id] || {};
      const chain = daySupers.cont[ei];
      const muscle = groupOfEntry(e, library);
      /* an entry that was planned keeps saying so, forever: the target it
         was given is stored on it, so "did I do what I said I would" is
         answerable from the log alone months later */
      const res = entryPlanResult(e);
      return `<div style="display:flex;align-items:center;border-bottom:1px solid var(--border-soft)">
        <button data-action="edit-entry" data-id="${e.id}" style="flex:1;min-width:0;text-align:left;padding:11px 4px 11px 14px;display:flex;gap:10px;align-items:center;color:var(--text)">
          <div style="width:4px;align-self:stretch;border-radius:2px;background:${colorFor(muscle)}"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:5px;min-width:0">
              ${chain ? icon("link", 11, 'style="color:var(--blue);flex-shrink:0"') : ""}
              <div style="font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabel(e.exercise))}</div>
            </div>
            <div style="font-size:12.5px;color:var(--muted);margin-top:1px">
              ${entryHasData(e) ? entrySummary(e, unit, true) : T("entry.notDone")}
            </div>
            ${res ? `<div style="display:flex;align-items:center;gap:5px;font-size:11px;margin-top:2px;color:${res.beat ? "var(--gold)" : res.hit >= res.total ? "var(--green)" : "var(--muted)"}">
              ${icon("target", 10, 'style="flex-shrink:0"')}
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${T("plan.rowResult", { n: res.hit, total: res.total, target: planTargetLine(e.plan, unitOf(e)) })}</span>
            </div>` : ""}
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

    return `<div class="pb-card" data-day="${date}" style="margin-bottom:12px;overflow:hidden">
      <button data-action="edit-day" data-date="${date}" title="${T("log.editDay")}" style="width:100%;display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--border-soft);color:var(--text);text-align:left">
        <div class="pb-num" style="font-weight:700;font-size:16.5px;flex:1">${fmtDate(date)}</div>
        ${dayRes ? chip(T("plan.hitOf", { n: dayRes.hit, total: dayRes.total }), dayRes.hit >= dayRes.total ? "var(--green)" : "var(--steel)") : ""}
        ${wk ? chip(T("common.week", { n: wk }), "var(--gold)") : ""}
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
    const m = groupOfEntry(e, library);
    (out[e.date] = out[e.date] || new Set()).add(m);
  }
  return out;
}

function renderCalendar(log, library, marks, planned, range, legend) {
  const month = ui.calMonth || monthOf(todayStr());
  const today = todayStr();
  const picking = ui.deloadPick;
  const sel = ui.calDay;

  const cells = monthGrid(month).map((c) => {
    const dl = deloadOn(state.deloads, c.iso);
    /* "in the period on screen", meaning the program week, or the seven days
       ending on the day you picked, depending on the setting */
    const inWeek = c.iso >= range.from && c.iso <= range.to;
    const anchor = rollingWeeks() && c.iso === range.to;
    const isToday = c.iso === today;
    /* Two rows of dots that never fight: a SOLID dot is a group you
       trained, a HOLLOW one is a group you have planned and not done yet.
       Same dot, same colour, filled or not, which is exactly the
       difference between the log and a plan everywhere else in the app.
       Anything already trained is dropped from the planned row so a day
       you did as planned reads as done, not half-done. */
    const done = marks[c.iso] ? [...marks[c.iso]] : [];
    const ahead = planned[c.iso] ? [...planned[c.iso]].filter((g) => !done.includes(g)) : [];
    const groups = done.slice(0, 4);
    const ghosts = ahead.slice(0, Math.max(0, 4 - groups.length));
    const pickStart = picking && picking.start === c.iso;
    const pickAfter = picking && picking.start && c.iso > picking.start;
    const isSel = !picking && sel === c.iso;

    /* the tint stack, quietest first */
    const bg = pickStart ? "rgba(233,185,73,.30)"
      : isSel ? "var(--raise)"
      : dl ? "rgba(233,185,73,.13)"
      : inWeek ? "var(--surface2)"
      : "transparent";
    const border = isToday ? "1px solid var(--gold)"
      : isSel ? "1px solid var(--border)"
      : anchor ? "1px solid var(--steel)"
      : dl ? "1px dashed rgba(233,185,73,.5)"
      : "1px solid transparent";

    return `<button data-action="cal-day" data-d="${c.iso}"
      style="position:relative;aspect-ratio:1;border-radius:9px;background:${bg};border:${border};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0;opacity:${c.inMonth ? 1 : 0.35};${pickAfter ? "outline:1px solid rgba(233,185,73,.25);outline-offset:-1px;" : ""}">
      <span class="pb-num" style="font-size:13px;font-weight:${isToday ? 700 : 600};color:${isToday ? "var(--gold)" : inWeek || dl || isSel ? "var(--text)" : "var(--muted)"};line-height:1">${c.day}</span>
      <span style="display:flex;gap:2px;height:5px;align-items:center">
        ${groups.map((g) => `<span style="width:4px;height:4px;border-radius:2px;background:${colorFor(g)}"></span>`).join("")}
        ${ghosts.map((g) => `<span style="width:5px;height:5px;border-radius:3px;border:1.5px solid ${colorFor(g)};box-sizing:border-box"></span>`).join("")}
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
      <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--surface2)"></span>${legend}</span>
      <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:rgba(233,185,73,.13);border:1px dashed rgba(233,185,73,.5)"></span>${T("vol.legendDeload")}</span>
      <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:4px;height:4px;border-radius:2px;background:var(--muted)"></span>${T("vol.legendTrained")}</span>
      <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:6px;height:6px;border-radius:3px;border:1.5px solid var(--muted);box-sizing:border-box"></span>${T("vol.legendPlanned")}</span>
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

/* ── WHAT A PLANNED ENTRY SAYS IN ONE LINE ────────────────────────────
   Runs of identical sets are compressed, because "3 sets · 8 × 100 kg" is
   how anybody writes down a plan and "8 × 100 · 8 × 100 · 8 × 100" is not.
   A planned exercise with no numbers on it is a legitimate plan (the
   running order, decided, the numbers left for the day) and says so. */
function planTargetLine(t, unit) {
  if (!t) return T("plan.noNumbers");
  if (!t.sets) return T("sug.cardioSet", { min: t.minutes, rpe: t.intensity });
  const u = t.unit || unit || state.settings.units;
  const runs = [];
  for (const st of t.sets) {
    const last = runs[runs.length - 1];
    if (last && last.reps === st.reps && last.weight === st.weight) last.n += 1;
    else runs.push({ n: 1, reps: st.reps, weight: st.weight });
  }
  /* "3 sets · 8 × 100 kg" only earns the count when there is more than one
     of them; a single set is just the set */
  if (runs.length === 1 && runs[0].n > 1)
    return `${runs[0].n} ${T("unit.sets")} · ${esc(runs[0].reps)} × ${esc(runs[0].weight)} ${u}`;
  return runs.map((r) => `${r.n > 1 ? r.n + " × " : ""}${esc(r.reps)} × ${esc(r.weight)}`).join(" · ") + " " + u;
}

/* the same line for a planned ENTRY, which is where a target comes from */
const planEntryLine = (pe) => planTargetLine(planTargetOf(pe), unitOf(pe));


/* the exercise rows inside a plan card: a hollow dot (it hasn't happened),
   the lift, and the target beside it */
const planEntryRows = (entries) => (entries || []).map((pe) => `<div style="display:flex;align-items:baseline;gap:8px;font-size:13px">
    <span style="width:8px;height:8px;border-radius:4px;border:1.5px solid ${colorFor(groupOfEntry(pe))};box-sizing:border-box;flex-shrink:0;align-self:center"></span>
    <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)">${esc(exLabel(pe.exercise))}</span>
    <span class="pb-num" style="font-size:12px;color:var(--muted);white-space:nowrap;flex-shrink:0">${planEntryLine(pe)}</span>
  </div>`).join("");

/* ── THE DAY CARD ─────────────────────────────────────────────────────
   Tapping a day used to do one invisible thing: move the volume window.
   It still does, and now it also opens this, the one place that answers
   "what is on this day", past or future, in the same shape either way:
   what you trained, what you planned, and the one or two things you can
   sensibly do about it from here. It is where a plan is born and where a
   plan is started, which is why planning never needed a screen of its own. */
function renderDayCard(log, library, settings) {
  const day = ui.calDay || todayStr();
  const today = todayStr();
  const plan = planOn(state.plans, day);
  const logged = log.filter((e) => e.date === day).sort((a, b) => a.createdAt - b.createdAt);
  const parked = (state.dayDrafts || []).find((d) => d.date === day);
  const dl = deloadOn(state.deloads, day);
  const past = day < today;
  const result = dayPlanResult(logged);

  const head = `<div style="display:flex;align-items:center;gap:7px;padding:12px 14px 10px;flex-wrap:wrap">
    <div class="pb-num" style="font-weight:700;font-size:16.5px;flex:1;min-width:0">${fmtDate(day, { weekday: "long", day: "numeric", month: "short" })}</div>
    ${day === today ? chip(T("plan.todayShort"), "var(--gold)") : ""}
    ${rollingWeeks() ? "" : chip(T("common.wkShort", { n: weekOf(day, settings.startDate) }))}
    ${dl ? chip(T("vol.legendDeload"), "var(--gold)") : ""}
  </div>`;

  /* what actually happened, if anything did */
  const trained = logged.length ? `<div style="padding:0 14px 12px">
      <div class="pb-label" style="margin-bottom:7px">${T("plan.trained")}${result ? ` · <span style="color:var(--gold)">${T("plan.hitOf", { n: result.hit, total: result.total })}</span>` : ""}</div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${logged.map((e) => `<div style="display:flex;align-items:baseline;gap:8px;font-size:13px">
          <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(groupOfEntry(e, library))};flex-shrink:0;align-self:center"></span>
          <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)">${esc(exLabel(e.exercise))}</span>
          <span class="pb-num" style="font-size:12px;color:var(--muted);white-space:nowrap;flex-shrink:0">${entrySummary(e, unitOf(e))}</span>
        </div>`).join("")}
      </div>
      <button data-action="edit-day" data-date="${day}" class="pb-btn pb-ghost" style="width:100%;padding:10px 0;font-size:13px;margin-top:11px">
        ${icon("pencil", 14)} ${T("plan.openDay")}
      </button>
    </div>` : "";

  /* the plan, if there is one, and whether it still has a day left to happen on */
  const planUnused = plan && past && !logged.length;
  /* what is left of a plan this very day already started is not "not used":
     it is the rest of the session, still owed (see prunePlans) */
  const planLeft = plan && plan.startedOn === day;
  const planned = plan ? `<div style="padding:0 14px 12px">
      ${logged.length ? `<div class="pb-hairline" style="margin:0 0 12px"></div>` : ""}
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
        <div class="pb-label" style="flex:1;min-width:0">${plan.name ? esc(plan.name) : T("plan.badge")}</div>
        ${planLeft ? chip(T("plan.leftToDo", { n: (plan.entries || []).length }), "var(--gold)")
          : planUnused ? chip(T("plan.missed"))
          : logged.length ? chip(T("plan.unused"))
          : chip(TN("move", (plan.entries || []).length), "var(--gold)")}
      </div>
      <div style="display:flex;flex-direction:column;gap:5px">${planEntryRows(plan.entries)}</div>
      <div style="font-size:11px;color:var(--faint);margin-top:9px;line-height:1.45">${T("plan.notLogged")}</div>
      <!-- Which button is the big one follows the calendar, not the feature:
           on today or a day gone by, the thing you came for is to DO it; on
           a Friday four days out, the thing you came for is to change it,
           and a full-width Start on a day you cannot train yet is one
           mis-tap from a session logged on the wrong date. Both are always
           here either way. -->
      <div style="display:flex;gap:8px;margin-top:11px">
        ${day > today
          ? `<button data-action="plan-edit" data-id="${esc(plan.id)}" class="pb-btn pb-ghost" style="flex:1;padding:11px 0;font-size:13.5px">
              ${icon("pencil", 15)} ${T("plan.editPlan")}
            </button>
            <button data-action="plan-start" data-id="${esc(plan.id)}" title="${T("plan.start")}" class="pb-btn pb-ghost" style="flex-shrink:0;padding:11px 13px;color:var(--gold)">${icon("play", 15)}</button>`
          : `<button data-action="plan-start" data-id="${esc(plan.id)}" class="pb-btn pb-gold" style="flex:1;padding:11px 0;font-size:13.5px">
              ${icon("play", 15)} ${T("plan.start")}
            </button>
            <button data-action="plan-edit" data-id="${esc(plan.id)}" title="${T("plan.editPlan")}" class="pb-btn pb-ghost" style="flex-shrink:0;padding:11px 13px">${icon("pencil", 15)}</button>`}
        <button data-action="plan-delete" data-id="${esc(plan.id)}" title="${T("plan.deletePlan")}" class="pb-btn pb-ghost" style="flex-shrink:0;padding:11px 13px;color:var(--red)">${icon("trash-2", 15)}</button>
      </div>

    </div>` : "";

  /* the parked half-finished day, if this is the day it belongs to */
  const draft = parked ? `<div style="padding:0 14px 12px">
      ${logged.length || plan ? `<div class="pb-hairline" style="margin:0 0 12px"></div>` : ""}
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
        <div class="pb-label" style="flex:1;min-width:0">${T("draft.badge")}</div>
        ${chip(TN("exercise", (parked.entries || []).length), "var(--gold)")}
      </div>
      <button data-action="resume-draft" data-id="${esc(parked.id)}" class="pb-btn pb-ghost" style="width:100%;padding:10px 0;font-size:13px;border-color:rgba(233,185,73,.45);color:var(--gold)">
        ${icon("pencil", 14)} ${T("draft.continue")}
      </button>
    </div>` : "";

  /* and when the day holds nothing at all, the one or two things worth
     doing to it, which are not the same thing before and after it */
  let empty = "";
  if (!logged.length && !plan && !parked) {
    const planBtn = `<button data-action="plan-day" data-d="${day}" class="pb-btn ${past ? "pb-ghost" : "pb-gold"}" style="flex:1;padding:12px 0;font-size:13.5px">
      ${icon("calendar-plus", 15)} ${T("plan.planDay")}
    </button>`;
    const logBtn = `<button data-action="log-day" data-d="${day}" class="pb-btn ${past ? "pb-gold" : "pb-ghost"}" style="flex:1;padding:12px 0;font-size:13.5px">
      ${icon("plus", 15)} ${T("plan.logDay")}
    </button>`;
    empty = `<div style="padding:0 14px 13px">
      <div style="font-size:12.5px;color:var(--faint);line-height:1.5;margin-bottom:11px">${T(past ? "plan.emptyPast" : "plan.emptyFuture")}</div>
      <div style="display:flex;gap:8px">${past ? logBtn : planBtn}${day === today ? logBtn : ""}</div>
    </div>`;
  }

  return `<div class="pb-card" style="margin-bottom:14px;overflow:hidden">
    ${head}${trained}${planned}${draft}${empty}
  </div>`;
}

/* ── THE WEEK AHEAD, IN A LIST ────────────────────────────────────────
   The calendar shows a month of hollow dots; this says what they are.
   It is the surface for the thing the whole feature exists for (sitting
   down on a Sunday and laying out the week) so it reads forwards from
   today and keeps missed days on the end, where they can be tidied away
   rather than nagging from the middle of the list. */
const PLAN_HORIZON = 21;   // days ahead the upcoming list looks

function renderPlanList(log) {
  const today = todayStr();
  const horizon = addDays(today, PLAN_HORIZON);
  const all = plansSorted(state.plans);
  const upcoming = all.filter((p) => p.date >= today && p.date <= horizon);
  const missed = all.filter((p) => p.date < today && !log.some((e) => e.date === p.date));

  const row = (p, stale) => {
    const sets = planSetCount(p);
    const away = daysBetween(today, p.date);
    const when = p.date === today ? T("plan.today")
      : away === 1 ? T("plan.tomorrowShort")
      : fmtDate(p.date, { weekday: "short", day: "numeric", month: "short" });
    return `<button data-action="plan-open" data-d="${esc(p.date)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 12px;text-align:left;color:var(--text);opacity:${stale ? 0.5 : 1};border-top:1px solid var(--border-soft)">
      ${icon("calendar-check", 14, `style="color:${stale ? "var(--faint)" : "var(--gold)"};flex-shrink:0"`)}
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name ? esc(p.name) : when}</div>
        <div style="font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name ? when + " · " : ""}${TN("move", (p.entries || []).length)}${sets ? " · " + T("plan.nSets", { n: sets }) : ""}${stale ? " · " + T("plan.missed") : ""}</div>
      </div>
      ${icon("chevron-right", 14, 'style="color:var(--faint);flex-shrink:0"')}
    </button>`;
  };

  return `<div class="pb-card" style="overflow:hidden;margin-bottom:14px">
    <button data-action="plan-day" data-d="${ui.calDay && ui.calDay >= today ? ui.calDay : today}" style="width:100%;display:flex;align-items:center;gap:9px;padding:11px 12px;color:var(--gold);text-align:left">
      ${icon("calendar-plus", 15, 'style="flex-shrink:0"')}
      <span style="flex:1;font-size:13.5px;font-weight:600">${T("plan.planADay")}</span>
      <span style="font-size:11px;color:var(--faint)">${upcoming.length ? T("plan.nAhead", { n: upcoming.length }) : T("cal.noneYet")}</span>
    </button>
    ${upcoming.map((p) => row(p, false)).join("")}
    ${missed.map((p) => row(p, true)).join("")}
  </div>`;
}

/* The Calendar tab: the month, the day you tapped, what is planned, the
   deloads, and, underneath all of it, the volume readout the tab was
   originally built around. Planning sits on top because it is the thing
   you come here to DO; the volume numbers are what you come here to READ. */
function renderCalendarTab(log, library, settings, currentWeek) {
  const rolling = rollingWeeks();
  const week = ui.volumeWeek;
  const anchor = ui.volAnchor || todayStr();
  const range = rolling ? windowEnding(anchor) : weekRange(week, settings.startDate);

  return `<div class="">
    ${renderCalendar(log, library, dayMarks(log, library), planMarks(state.plans), range,
      rolling ? T("vol.legendWindow") : T("vol.legendWeek", { n: week }))}
    ${renderDayCard(log, library, settings)}
    ${renderPlanList(log)}
    ${renderDeloadPlanner()}
    ${renderVolume(log, library, settings, currentWeek)}
  </div>`;
}

function renderVolume(log, library, settings, currentWeek) {
  const rolling = rollingWeeks();
  const week = ui.volumeWeek;
  const anchor = ui.volAnchor || todayStr();
  const groups = libraryGroups(library);
  for (const e of log) { const m = groupOfEntry(e, library); if (!groups.includes(m)) groups.push(m); }

  /* the period on screen, and the one before it, which is the comparison an
     untargeted group is given instead of a bar it never asked for */
  const range = rolling ? windowEnding(anchor) : weekRange(week, settings.startDate);
  const before = rolling ? windowEnding(addDays(anchor, -7)) : weekRange(week - 1, settings.startDate);
  const firstLogged = log.reduce((m, e) => (m == null || e.date < m ? e.date : m), null);
  const hasBefore = firstLogged != null && (rolling ? before.to >= firstLogged : week > 1);

  const vol = rolling ? volumeInRange(log, library, range.from, range.to)
    : volumeForWeek(log, library, settings.startDate, week);
  const prevVol = !hasBefore ? null
    : rolling ? volumeInRange(log, library, before.from, before.to)
    : volumeForWeek(log, library, settings.startDate, week - 1);
  const targets = state.volumeGoals || {};

  const rows = groups.map((g, i) => {
    const isCardio = g === cardioGroup();
    const bucket = g === UNCATEGORIZED;
    const v = vol[g] || 0;
    const unit = isCardio ? T("unit.min") : T("unit.sets");
    /* A personal target takes over the assessment when the user sets one.
       Everyone's "enough" is different. Muscle groups target sets; cardio
       targets minutes, and the bar fills as the period goes on.

       WITHOUT A TARGET THERE IS NO BAR. A progress bar is a promise that
       something is being progressed towards, and until you have said what
       you are aiming for the app has nothing honest to put at the far end
       of it: the old one filled against the biggest group you happened to
       train that week, so the bar moved for reasons that had nothing to do
       with you. It has no business calling a group neglected either: a week
       with no chest work is a rest from chest, not a failure, and nothing
       can tell those apart without a plan to read it against.

       So an untargeted group states the one thing it can stand behind,
       how this period compares with the one before it, and leaves the ⌖
       button there for when you do want a bar to go with it. */
    const target = targets[g] > 0 ? targets[g] : null;
    const editing = ui.volGoalEditing === g;
    const done = target && v >= target;
    const pct = target ? Math.min(1, v / target) : 0;

    /* one quiet line of status, never a shouty chip */
    let note = "";
    if (target) {
      note = v === 0 ? `<span style="color:var(--red)">${T("vol.neglected")}</span>`
        : done ? `<span style="color:var(--green)">${T("vol.onTarget")}</span>`
        : T("vol.toGo", { n: Math.round((target - v) * 10) / 10, unit });
    } else if (bucket) {
      note = T("vol.noGroup");
    } else if (prevVol && (v > 0 || (prevVol[g] || 0) > 0)) {
      const d = Math.round((v - (prevVol[g] || 0)) * 10) / 10;
      const period = T(rolling ? "vol.periodRolling" : "vol.periodWeek");
      note = d > 0 ? T("vol.more", { n: d, unit, period })
        : d < 0 ? T("vol.fewer", { n: -d, unit, period })
        : T("vol.same", { period });
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
      ${target ? `<div style="height:5px;background:var(--surface2);border-radius:3px;margin-top:7px;overflow:hidden">
        <div style="height:100%;width:${Math.round(pct * 100)}%;background:${barColor};opacity:.85;border-radius:3px;transition:width .25s"></div>
      </div>` : ""}
      ${note ? `<div style="font-size:11px;color:var(--faint);margin-top:${target ? 5 : 4}px">${note}</div>` : ""}
    </div>`;
  }).join("");

  const today = todayStr();
  const title = rolling ? T("vol.window") : T("common.week", { n: week });
  const sub = `${fmtShort(range.from)} – ${fmtShort(range.to)}` +
    (rolling ? (range.to === today ? " · " + T("vol.upToToday") : "")
      : (week === currentWeek ? " · " + T("vol.thisWeek") : ""));

  return `<div class="">
    ${sectionTitle(T("vol.title"))}
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <button data-action="vol-prev" class="pb-btn pb-ghost" style="width:32px;height:32px;flex-shrink:0">${icon("chevron-left", 16)}</button>
      <div style="flex:1;min-width:0;text-align:center">
        <div class="pb-num" style="font-size:17px;font-weight:700;line-height:1.1">${title}</div>
        <div style="font-size:10.5px;color:var(--faint)">${sub}</div>
      </div>
      <button data-action="vol-next" class="pb-btn pb-ghost" style="width:32px;height:32px;flex-shrink:0">${icon("chevron-right", 16)}</button>
    </div>

    <div class="pb-card" style="padding:4px 14px">${rows}</div>

    <div style="font-size:11.5px;color:var(--faint);margin:10px 4px 0;line-height:1.5">
      ${T(rolling ? "vol.helpRolling" : "vol.help", { icon: icon("target", 11) })}
    </div>
    <div style="height:6px"></div>
  </div>`;
}

/* ─────────────────────────── PROGRESS ─────────────────────────────── */

function renderProgress(log, library, goals, badges, settings, unit) {
  const segs = segControl("prog-seg", ui.progSeg,
    [["progress", T("prog.segProgress")], ["standards", T("prog.segStandards")]]);

  if (ui.progSeg === "standards")
    return `<div class="" style="padding:12px 16px 0">${segs}${renderProgStandards(log, library, unit)}</div>`;

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

  /* the same bars, counted in whichever seven days the app is set to */
  const rolling = rollingWeeks();
  let wkData;
  if (rolling) {
    wkData = rollingSetBlocks(log);
  } else {
    const { sets: wkSets } = weeklyTotals(log, settings.startDate);
    const maxWk = Math.max(1, ...Object.keys(wkSets).map(Number));
    wkData = Array.from({ length: maxWk }, (_, i) => ({ w: "W" + (i + 1), sets: wkSets[i + 1] || 0 }));
  }

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

    ${sectionTitle(T(rolling ? "prog.rollingSets" : "prog.weeklySets"))}
    <div class="pb-card" style="padding:14px 8px 4px;margin-bottom:16px">
      <div id="barChart" style="position:relative;width:100%;height:140px"></div>
    </div>
  </div>`;
}

/* ═════════════════════ STRENGTH STANDARDS ══════════════════════════
   The second segment of the Progress tab. The first segment is you
   against yourself; this one is you against everybody else: the
   StrengthLevel tables in standards.js, which say what a man or a woman
   of a given bodyweight lifts at each of five levels. The app draws
   those levels as WOOD · GOLD · DIAMOND · TITANIUM · VIBRANIUM, and
   that rename lives only in the labels: nothing here is written to a
   record, so the words can change without touching anyone's data.

   IT IS A LOOKUP, NOT A FEED, and that is the whole design. Seventy-one
   lifts across two sexes and nineteen bodyweights is 12,780 numbers, and
   any amount of it on screen at once is a wall nobody reads. You point
   it at ONE lift, say what you weigh and what you lifted, and it answers
   that one question. Nothing here is logged; nothing here writes to your
   history. If you add a surface that shows a rank somewhere else, it
   still has to come through stdCheck(), because there is no ambient rank.

   Two things it deliberately refuses to guess:

   · YOUR SEX. The tables are split, and picking for you hands back a
     rank that is simply wrong, so the check stays disabled until it is
     answered once, and then it is remembered in settings.
   · YOUR NUMBER. A lift STD_MATCH can tie to your library is offered as
     a pre-fill you can type straight over; everything else starts blank.
     Rep-count standards (pull-ups, dips, push-ups) never pre-fill at
     all: the log stores every set as reps × weight, and there is no
     honest way to read "your best set at bodyweight" back out of that.  */

/* A tier's colour is `--tier-<level>`, defined per theme in the THEMES block
   of styles.css, a variable rather than a hex, because a tier name has to
   stay readable on a near-white card as well as a dark one, and the two need
   different values to manage it. Nothing here does hex-alpha arithmetic on
   them for that reason; the tints come from the neutral tokens instead. */
const STD_COLORS = Object.fromEntries(STD_LEVELS.map((l) => [l, `var(--tier-${l})`]));

const stdLevelLabel = (lvl) => T("std.lvl." + lvl);

/* A standards lift's name in the user's language. Same display-layer rule as
   the built-in library: the slug is the identity, the name is only a label,
   and English is read straight off the record rather than duplicated. */
const stdName = (e) => {
  const table = STD_EX[langCode()];
  return (e && table && table[e.slug]) || (e ? e.name : "");
};

/* The bodyweight rows of a table are 5 kg apart. A bodyweight between two of
   them is read as the line between the two; one off either end is read as
   that end, because past the last row there is no data to extrapolate from,
   only arithmetic. */
function stdRow(ex, sex, bwKg) {
  const grid = STD_BW[sex] || STD_BW.male;
  const rows = (sex === "female" ? ex.f : ex.m).split(";").map((r) => r.split(",").map(Number));
  const last = grid.length - 1;
  if (!(bwKg > grid[0])) return rows[0];
  if (bwKg >= grid[last]) return rows[last];
  let i = 0;
  while (i < last - 1 && grid[i + 1] <= bwKg) i++;
  const t = (bwKg - grid[i]) / (grid[i + 1] - grid[i]);
  return rows[i].map((v, k) => v + (rows[i + 1][k] - v) * t);
}

/* The five thresholds as they will be READ: converted into the unit on screen
   and rounded there, once. The ladder and the verdict then run off the same
   numbers, so a row can never say 102.5 while the rank disagrees with it. */
function stdThresholds(ex, sex, bwKg, unit) {
  return stdRow(ex, sex, bwKg).map((v) =>
    ex.reps ? Math.round(v) : Math.round(convertWeight(v, "kg", unit) * 10) / 10);
}

/* the highest tier reached, or -1 for under the first one */
function stdRank(thresholds, value) {
  let r = -1;
  thresholds.forEach((t, i) => { if (value >= t) r = i; });
  return r;
}

/* a rep count is a whole number of finished reps, so half a rep is no rep */
const stdValueOf = (ex, raw) => (ex && ex.reps ? Math.floor(+decimalize(raw)) : +decimalize(raw));

const stdReady = (f) => {
  const ex = f && f.slug ? STD_BY_SLUG[f.slug] : null;
  return !!ex && !!f.sex && +decimalize(f.bw) > 0 && stdValueOf(ex, f.lift) > 0;
};

/* The answer, worked out once and then held in ui.stdResult: it carries the
   numbers it was computed FROM as well as the verdict, so the card can name
   them and can never end up describing a lift you have since typed over. */
function stdCheck(f, unit) {
  if (!stdReady(f)) return null;
  const ex = STD_BY_SLUG[f.slug];
  const bw = +decimalize(f.bw);
  const value = stdValueOf(ex, f.lift);
  const th = stdThresholds(ex, f.sex, convertWeight(bw, unit, "kg"), unit);
  const rank = stdRank(th, value);
  const nextI = rank + 1 < STD_LEVELS.length ? rank + 1 : null;
  const floor = rank >= 0 ? th[rank] : 0;
  const span = nextI == null ? 0 : th[nextI] - floor;
  return {
    slug: ex.slug, reps: !!ex.reps, sex: f.sex, unit, bw, value, th, rank, nextI,
    toGo: nextI == null ? null : Math.round((th[nextI] - value) * 10) / 10,
    progress: nextI == null ? 1 : span > 0 ? Math.min(1, Math.max(0, (value - floor) / span)) : 1,
  };
}

/* What the log already knows about this lift, offered as a pre-fill. Only the
   built-ins STD_MATCH ties to this slug count, matched by their stable id, so
   a built-in the user renamed still resolves, and only their est. 1RM, which
   is the number these tables are written in. */
function stdBestFromLog(slug, log, library) {
  const ex = STD_BY_SLUG[slug];
  if (!ex || ex.reps) return null;
  const names = new Set(library.filter((x) => STD_MATCH[x.id] === slug).map((x) => x.name));
  if (!names.size) return null;
  let best = null;
  for (const e of log) {
    if (e.kind === "cardio" || !names.has(e.exercise)) continue;
    const m = metricOf(e);
    if (m != null && (best == null || m > best)) best = m;
  }
  return best;
}

/* The form is built the first time it is looked at and then left alone, so a
   number typed over a pre-fill survives every re-render and every trip to
   another tab. Bodyweight starts at the most recent Body check-in that
   recorded one: the app already knows what you weigh, and asking again would
   be asking you to keep a second copy of it. Typing over it is a what-if,
   not a correction, so it is never written back. */
function stdForm() {
  if (!ui.std) {
    const last = [...(state.body || [])].sort((a, b) => (a.date < b.date ? 1 : -1))
      .find((r) => +decimalize(r.weight) > 0);
    ui.std = {
      slug: null, sex: state.settings.sex || "",
      bw: last ? String(last.weight) : "", bwFrom: last ? last.date : null,
      lift: "", liftFromLog: false,
    };
  }
  return ui.std;
}

/* one threshold as it is printed. "<1" is the tables' own word for a level
   that sits under a single rep, and it is not the same claim as "0" */
const stdCell = (v, reps, unit) => (reps
  ? (v <= 0 ? esc(T("std.underOne")) : v)
  : `${trimNum(v)}<span style="font-size:10.5px;color:var(--muted);font-weight:600"> ${unit}</span>`);

function renderProgStandards(log, library, unit) {
  const f = stdForm();
  const ex = f.slug ? STD_BY_SLUG[f.slug] : null;
  const res = ui.stdResult;
  const ready = stdReady(f);

  const liftHint = ex && ex.reps ? T("std.repsHint")
    : f.liftFromLog ? T("std.liftFromLog")
    : ex ? T("std.liftHint") : "";

  const form = `<div class="pb-card" style="padding:14px;margin-bottom:16px">
    <div class="pb-label" style="margin-bottom:6px">${T("std.lift")}</div>
    <button data-action="std-pick-open" class="pb-btn pb-ghost" style="width:100%;justify-content:flex-start;gap:9px;padding:12px 13px;margin-bottom:12px;text-align:left">
      ${ex
        ? `<span style="width:8px;height:8px;border-radius:4px;background:${colorFor(ex.group)};flex-shrink:0"></span>
           <span style="flex:1;min-width:0;font-weight:600;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(stdName(ex))}</span>
           ${chip(ex.reps ? T("std.measReps") : T("std.meas1rm"), "var(--muted)")}`
        : `${icon("search", 15, 'style="color:var(--gold);flex-shrink:0"')}
           <span style="flex:1;min-width:0;font-size:14px;color:var(--muted)">${T("std.chooseLift")}</span>`}
      ${icon("chevron-right", 15, 'style="color:var(--faint);flex-shrink:0"')}
    </button>

    <div class="pb-label" style="margin-bottom:6px">${T("std.sex")}</div>
    ${segControl("std-sex", f.sex, [["male", T("std.male")], ["female", T("std.female")]])}
    ${f.sex ? "" : `<div style="font-size:11.5px;color:var(--faint);margin:-8px 0 12px">${T("std.sexHint")}</div>`}

    <div style="display:flex;gap:10px">
      <div style="flex:1">${field(T("std.bodyweight", { unit }),
        `<input class="pb-input" ${NUM} data-bind="std.bw" value="${esc(f.bw)}" placeholder="—">`,
        `<span id="stdBwHint">${f.bwFrom ? T("std.bwFrom", { date: fmtShort(f.bwFrom) })
          : f.bw ? "" : T("std.bwNone")}</span>`)}</div>
      <div style="flex:1">${field(ex && ex.reps ? T("std.bestReps") : T("std.best", { unit }),
        `<input class="pb-input" ${NUM} data-bind="std.lift" value="${esc(f.lift)}" placeholder="—">`,
        /* patched in place while typing, like the bodyweight hint beside it,
           see handleBind */
        `<span id="stdLiftHint">${liftHint}</span>`)}</div>
    </div>

    <button id="stdCheckBtn" data-action="std-check" ${ready ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15.5px;margin-top:2px;opacity:${ready ? 1 : 0.45}">
      ${icon("gauge", 17)} ${T("std.check")}
    </button>
  </div>`;

  const intro = `<div style="font-size:13px;color:var(--muted);line-height:1.55;margin:0 2px 14px">${T("std.intro")}</div>`;
  const footer = `<div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:0 4px 10px">${T("std.footer")}</div>`;

  if (!res)
    return `<div>
      ${intro}
      ${form}
      <div class="pb-card" style="padding:24px;text-align:center;color:var(--faint);font-size:13px;line-height:1.6">
        ${icon("medal", 26, 'style="margin:0 auto 10px;display:block"')}
        ${T("std.empty")}
      </div>
      ${footer}
      <div style="height:14px"></div>
    </div>`;

  const resEx = STD_BY_SLUG[res.slug];
  const lvl = res.rank >= 0 ? STD_LEVELS[res.rank] : null;
  const color = lvl ? STD_COLORS[lvl] : "var(--muted)";
  const nextLvl = res.nextI == null ? null : STD_LEVELS[res.nextI];

  const ladder = STD_LEVELS.map((l, i) => {
    const reached = res.rank >= i, at = res.rank === i, c = STD_COLORS[l];
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 13px;border-bottom:${i === STD_LEVELS.length - 1 ? "none" : "1px solid var(--border-soft)"};background:${at ? "var(--raise)" : "transparent"}">
      <div style="width:9px;height:9px;border-radius:5px;flex-shrink:0;background:${reached ? c : "transparent"};border:1.5px solid ${reached ? c : "var(--border)"}"></div>
      <div style="flex:1;min-width:0;font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${reached ? c : "var(--faint)"}">${stdLevelLabel(l)}</div>
      ${at ? chip(T("std.you"), c) : ""}
      <div class="pb-num" style="font-weight:700;font-size:15px;flex-shrink:0;color:${reached ? "var(--text)" : "var(--muted)"}">${stdCell(res.th[i], res.reps, res.unit)}</div>
    </div>`;
  }).join("");

  return `<div>
    ${intro}
    ${form}

    <div class="pb-card" style="padding:16px 15px;margin-bottom:16px;border-color:${lvl ? color : "var(--border)"}">
      <div class="pb-label" style="margin-bottom:5px">${T("std.youAre")}</div>
      <div class="pb-num" style="font-size:${lvl ? 34 : 22}px;font-weight:700;line-height:1.05;letter-spacing:.02em;color:${color}">
        ${lvl ? stdLevelLabel(lvl) : T("std.underFirst", { level: stdLevelLabel(STD_LEVELS[0]) })}
      </div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:7px">
        ${res.reps
          ? T("std.fromReps", { name: esc(stdName(resEx)), reps: TN("rep", res.value), bw: trimNum(res.bw), unit: res.unit })
          : T("std.from", { name: esc(stdName(resEx)), value: trimNum(res.value), unit: res.unit, bw: trimNum(res.bw) })}
      </div>
      <div style="display:flex;align-items:center;gap:9px;margin-top:11px">
        <div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${Math.round(res.progress * 100)}%;background:${nextLvl ? STD_COLORS[nextLvl] : color};transition:width .25s"></div>
        </div>
        <div style="font-size:11.5px;font-weight:700;flex-shrink:0;color:${nextLvl ? "var(--muted)" : color}">
          ${nextLvl == null ? T("std.top")
            : res.reps ? T("std.toGoReps", { n: TN("rep", res.toGo), level: stdLevelLabel(nextLvl) })
            : T("std.toGo", { n: trimNum(res.toGo), unit: res.unit, level: stdLevelLabel(nextLvl) })}
        </div>
      </div>
    </div>

    ${sectionTitle(T("std.ladder"), `<span style="font-size:11px;color:var(--faint)">${T("std.atBodyweight", { bw: trimNum(res.bw), unit: res.unit })}</span>`)}
    <div class="pb-card" style="overflow:hidden;margin-bottom:16px">${ladder}</div>

    ${footer}
    <div style="height:14px"></div>
  </div>`;
}

/* The standards' own exercise picker. It is a separate list from the library
   picker on purpose: these 71 lifts are the tables', not the user's, so
   nothing here can be added to, renamed, or filed somewhere else: the
   category headings are the app's own words (T("group.…")) painted in the
   user's group colours, which is what lets a renamed group keep its colour
   without lending its name to somebody else's list. */
function renderStdPicker() {
  return fullScreen(60, `
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px">
      <button data-action="std-pick-close" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
      <div style="position:relative;flex:1">
        ${icon("search", 15, 'style="position:absolute;left:11px;top:12px;color:var(--faint)"')}
        <input class="pb-input" style="padding-left:34px" placeholder="${T("std.search")}" data-bind="stdq" value="${esc(ui.stdQ)}" data-autofocus>
      </div>
    </div>
    <div class="pb-scroll" data-scrollkey="stdPicker" style="flex:1;overflow-y:auto;padding:8px 16px calc(30px + var(--pb-sab))">
      <div id="stdPickList">${renderStdPickerList()}</div>
    </div>
  `, "stdPick");
}

function renderStdPickerList() {
  const q = ui.stdQ.trim().toLowerCase();
  /* searched on both the shown name and the English one, so someone reading
     the app in Svenska can still type "bench" and find it */
  const match = STD_EXERCISES.filter((e) =>
    !q || stdName(e).toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  if (!match.length)
    return `<div class="pb-card" style="padding:24px;text-align:center;color:var(--muted);font-size:13px;line-height:1.6">${T("std.noMatch")}</div>`;

  const chosen = ui.std && ui.std.slug;
  return DEFAULT_GROUPS.map((g) => g.name).filter((g) => match.some((e) => e.group === g)).map((g) => `<div style="margin-bottom:14px">
    ${sectionTitle(`<span style="color:${colorFor(g)}">${T("group." + g)}</span>`)}
    <div class="pb-card" style="overflow:hidden">
      ${match.filter((e) => e.group === g).map((e, i, arr) => `<button data-action="std-pick" data-slug="${e.slug}" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;text-align:left;color:var(--text);border-bottom:${i < arr.length - 1 ? "1px solid var(--border-soft)" : "none"};background:${e.slug === chosen ? "rgba(233,185,73,.07)" : "transparent"}">
        <div style="flex:1;min-width:0;font-weight:600;font-size:14px">${esc(stdName(e))}</div>
        ${chip(e.reps ? T("std.measReps") : T("std.meas1rm"), "var(--muted)")}
        ${e.slug === chosen ? icon("check", 16, 'style="color:var(--gold);flex-shrink:0"') : ""}
      </button>`).join("")}
    </div>
  </div>`).join("");
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
    <div style="flex:1;min-width:0;font-size:10.5px;color:var(--faint);text-align:right;line-height:1.3">${T(full ? "chart.hintFull" : "chart.hint")}</div>
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
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="chart-exit-full" data-scope="${scope}" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      <div style="flex:1;min-width:0">
        <div class="pb-num" style="font-size:17px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabel(line.name))}</div>
        <div style="font-size:11.5px;color:var(--faint)">${line.cardio ? T("prog.sessionLoad") : T("prog.est1rm", { unit: line.unit })}</div>
      </div>
    </div>
    <div style="padding:10px 8px 0">${chartToolbar(true, scope)}</div>
    <div data-linechart="${scope}" data-chartfull="1" style="position:relative;flex:1;min-height:120px;margin:0 8px;touch-action:none"></div>
    <div class="pb-scroll" data-linedetail="${scope}" style="max-height:44%;overflow-y:auto;padding:0 12px calc(18px + var(--pb-sab))">${renderPointDetail(scope)}</div>
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
   what each rep count is worth. It's stand-alone on purpose: nothing
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
  /* every row is built off the UNROUNDED max, since rounding once, at the end of
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
   in it yet is deliberately included, since it has to be pickable before it can
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

   Some exercises don't need any of that: a machine only your gym has, a
   movement whose name says everything. Dismissing the flag says exactly
   that, and is the other way off the list. */
const needsDetails = (ex) =>
  !!(ex && ex.custom) && !ex.dismissedNew && !ex.equipment && !ex.alternatives && !ex.note;

const newFlag = (ex) => needsDetails(ex)
  ? `<span style="font-size:10px;color:var(--blue);margin-left:6px;font-weight:700;letter-spacing:.06em">${T("lib.newFlag")}</span>`
  : "";

function renderLibraryList(library) {
  const filter = ui.libraryFilter;
  /* Rearranging reads the whole group, never a search result: dragging row 2
     of a filtered three is a move into a list you cannot see, and there is no
     honest answer to where it lands. The toggle hides itself while you type. */
  const ordering = ui.libOrder;
  const q = ordering ? "" : ui.libraryQ;
  const groups = allGroups(library);   // the bucket is shown here, just never offered
  const shown = library.filter((ex) =>
    (filter === "All" || ex.muscle === filter) && exMatches(ex, q));

  return groups.filter((g) => shown.some((x) => x.muscle === g)).map((g) => {
    const rows = shown.filter((x) => x.muscle === g);
    if (ordering) return `<div style="margin-bottom:16px">
      ${sectionTitle(`<span style="color:${colorFor(g)}">${esc(groupLabel(g))}</span>`)}
      <div class="pb-card" style="overflow:hidden">
        ${rows.map((ex, i) => reorderRow("libExercise", i, rows.length,
          esc(exLabelOf(ex)), esc(exFieldOf(ex, "equipment")), "",
          `data-group="${esc(g)}"`)).join("")}
      </div>
    </div>`;
    return `<div style="margin-bottom:16px">
    ${sectionTitle(`<span style="color:${colorFor(g)}">${esc(groupLabel(g))}</span>`)}
    <div class="pb-card" style="overflow:hidden">
      ${rows.map((ex, i, arr) => `<button data-action="open-exercise-window" data-name="${esc(ex.name)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px;text-align:left;color:var(--text);border-bottom:${i < arr.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        ${ex.image ? `<img src="${esc(ex.image)}" alt="" style="width:38px;height:38px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--border)">` : ""}
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${esc(exLabelOf(ex))}${newFlag(ex)}</div>
          <div style="font-size:11.5px;color:var(--faint)">${esc(exFieldOf(ex, "equipment"))}</div>
        </div>
        ${ex.video ? icon("youtube", 15, 'style="color:var(--red);flex-shrink:0"') : ""}
        ${icon("info", 15, 'style="color:var(--faint);flex-shrink:0"')}
      </button>`).join("")}
    </div>
  </div>`;
  }).join("");
}

/* ─────────────────── MUSCLE GROUPS (add / recolour) ─────────────────
   The seven built-in groups aren't special: they live in the same list as
   anything you add, and the colour you give a group is the colour it wears
   everywhere: the stripe down each logged exercise, the volume bars, the
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
      ${groups.map((g, i) => `<div data-dragrow="group" style="display:flex;align-items:center;background:var(--surface);border-bottom:${i < groups.length - 1 ? "1px solid var(--border-soft)" : "none"}">
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
   reordering is the one place the user arranges their own library. The
   same is true of presets: the order in Library → Presets is the order
   they come out of the picker and off the home screen.

   Pointer events rather than HTML5 drag-and-drop: `dragstart` never fires
   on touch, and this is a phone app first. The drag runs entirely on
   inline transforms without a re-render (render() rebuilds #app wholesale
   and would drop the node mid-gesture) and only commits on release.

   One gesture, several lists: a row says which list it belongs to with
   `data-dragrow="<kind>"`, and DRAG_COMMIT says who to hand the finished
   from → to to. Adding another reorderable list is a row attribute and one
   more line in that table. */

let dragCtx = null;

function startRowDrag(ev, handle) {
  const row = handle.closest("[data-dragrow]");
  if (!row || !row.parentElement) return;
  const kind = row.dataset.dragrow;
  const rows = [...row.parentElement.children].filter((n) => n.dataset.dragrow === kind);
  const from = rows.indexOf(row);
  if (from < 0) return;

  dragCtx = { row, rows, from, to: from, kind, h: row.offsetHeight, y0: ev.clientY };
  Object.assign(row.style, { position: "relative", zIndex: "2", background: "var(--raise)", boxShadow: "0 8px 20px rgba(0,0,0,.35)" });
  document.body.style.userSelect = "none";
  try { handle.setPointerCapture(ev.pointerId); } catch { /* mouse without capture is fine */ }
  ev.preventDefault();
}

function moveRowDrag(ev) {
  if (!dragCtx) return;
  const { rows, from, h } = dragCtx;
  /* the pointer speaks screen pixels and the row is moved in the frame's own,
     which are the same thing on a phone and are not on a scaled-up tablet */
  const dy = (ev.clientY - dragCtx.y0) / vpScale;
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

function endRowDrag() {
  if (!dragCtx) return;
  const { from, to, rows, kind, row } = dragCtx;
  rows.forEach((n) => {
    n.style.transform = ""; n.style.transition = ""; n.style.boxShadow = "";
    n.style.zIndex = ""; n.style.background = ""; n.style.position = "";
  });
  document.body.style.userSelect = "";
  dragCtx = null;
  if (from !== to && DRAG_COMMIT[kind]) DRAG_COMMIT[kind](from, to, row);
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

/* Reordering presets moves them in state.presets, which is the one list
   every other view is a slice of. The pinned strip on Home is such a
   slice, so dragging there rewrites only the slots the pinned presets
   already occupy and leaves the unpinned ones exactly where they sit,
   since otherwise arranging your home screen would silently shuffle the
   library behind it. */
function reorderPresets(from, to) {
  const all = [...(state.presets || [])];
  if (from >= all.length || to >= all.length) return;
  const [moved] = all.splice(from, 1);
  all.splice(to, 0, moved);
  patch({ presets: all });
}

/* Rearranging a pinned strip is the same move whichever strip it is: the
   strip is a filtered view of one master list, so the reorder rewrites only
   the slots the pinned items already occupy and every unpinned item stays
   exactly where it sits. */
function reorderPinnedIn(list, from, to) {
  const slots = list.map((x, i) => (x.pinned ? i : -1)).filter((i) => i >= 0);
  if (from >= slots.length || to >= slots.length) return null;
  const order = slots.map((i) => list[i]);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const next = [...list];
  slots.forEach((slot, k) => { next[slot] = order[k]; });
  return next;
}

function reorderPinnedPresets(from, to) {
  const next = reorderPinnedIn(state.presets || [], from, to);
  if (next) patch({ presets: next });
}

/* pinnedTimers() takes the first MAX_PINNED_TIMERS pinned rows in
   state.timers order, so this is what decides which dial sits where on
   Home and at the foot of the workout and exercise windows alike. */
function reorderPinnedTimers(from, to) {
  const next = reorderPinnedIn(state.timers || [], from, to);
  if (next) patch({ timers: next });
}

const DRAG_COMMIT = {
  group: reorderGroups,
  preset: reorderPresets,
  pinnedPreset: reorderPinnedPresets,
  pinnedTimer: reorderPinnedTimers,
  entry: reorderDraftEntries,
  libExercise: reorderLibraryExercises,
  set: reorderSets,
};

/* The sets inside the open entry. Everywhere else in the app an order is a
   presentation choice; here it is read as data. entryLastResult matches set
   two against last time's set two, so a session you worked up and then
   logged bottom-first would come back as a string of "under" verdicts that
   describe nothing but the order you typed it in. Being able to drag the
   list into the order the sets actually happened is what keeps that
   comparison honest, and it is the reason this list is draggable at all.

   Nothing derived moves with it: bestSet() takes the highest estimate
   wherever it sits, so the headline number, the PR badge and the graph are
   all exactly as they were. */
function reorderSets(from, to) {
  const f = ui.entryForm && ui.entryForm.f;
  if (!f || !Array.isArray(f.setList)) return;
  if (from >= f.setList.length || to >= f.setList.length) return;
  const next = [...f.setList];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  f.setList = next;
  persist(); render();
}

/* The exercises inside the open day. Nothing is committed anywhere else:
   the sheet is the draft, and the order it is in is the order commitWorkout
   stamps into the log. */
function reorderDraftEntries(from, to) {
  const draft = ui.workoutSheet;
  if (!draft || from >= draft.entries.length || to >= draft.entries.length) return;
  const next = [...draft.entries];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  draft.entries = next;
  persist(); render();
}

/* One muscle group's exercises, rearranged inside a flat library. Same move
   as the pinned strips: only the slots that group already occupies are
   rewritten, so a group's order is its own and the groups keep theirs. */
function reorderLibraryExercises(from, to, row) {
  const group = row && row.dataset ? row.dataset.group : null;
  if (!group) return;
  const lib = state.library || [];
  const slots = lib.map((ex, i) => (ex.muscle === group ? i : -1)).filter((i) => i >= 0);
  if (from >= slots.length || to >= slots.length) return;
  const order = slots.map((i) => lib[i]);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const next = [...lib];
  slots.forEach((slot, k) => { next[slot] = order[k]; });
  patch({ library: next });
}

document.addEventListener("pointerdown", (e) => {
  const h = e.target.closest("[data-drag-handle]");
  if (h) startRowDrag(e, h);
});
document.addEventListener("pointermove", moveRowDrag);
document.addEventListener("pointerup", endRowDrag);
document.addEventListener("pointercancel", endRowDrag);

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

  /* Same rule the preset list and the timer dials live under: rearranging
     is a mode. A grip handle parked on every exercise row would sit one
     mis-tap from opening the wrong lift, and searching while dragging asks
     the list to answer where row 2 of a filtered three belongs. So the
     search box, the group chips and the add button fold away for the
     duration, and the whole group is what you rearrange. */
  const ordering = ui.libOrder;
  const canOrder = groups.some((g) => library.filter((x) => x.muscle === g).length > 1);

  return `
    ${ordering ? "" : `<div style="position:relative;margin-bottom:10px">
      ${icon("search", 16, 'style="position:absolute;left:12px;top:12px;color:var(--faint)"')}
      <input class="pb-input" style="padding-left:36px" placeholder="${T("lib.search")}" data-bind="libq" value="${esc(ui.libraryQ)}">
    </div>`}
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

    ${ordering ? "" : `<button data-action="add-exercise" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:14px;margin-bottom:12px;border-style:dashed;border-color:var(--border)">
      ${icon("plus", 17)} ${T("lib.addCustom")}
    </button>`}

    ${canOrder ? reorderBar("lib-reorder", ordering, T("preset.reorder")) : ""}
    <div id="libList">${renderLibraryList(library)}</div>
    <div style="font-size:12px;color:var(--faint);line-height:1.55;margin:0 4px 10px">
      ${ordering ? T("lib.reorderHint", { icon: icon("grip-vertical", 11) }) : T("lib.footer")}
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

/* the exercise list shown inside a preset card: color dot + name per row */
const presetExerciseList = (exs) =>
  (exs || []).map((ex) => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)">
    <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(ex.muscle)};flex-shrink:0"></span>${esc(exLabel(ex.exercise))}
  </div>`).join("");

/* ── PUTTING THEM IN YOUR OWN ORDER ───────────────────────────────────
   Presets arrive in the order they were saved, which is the order you
   happened to invent them in and nothing to do with the order you train
   them. Reordering is a mode rather than a permanent grip handle on every
   card: the cards are the thing you tap to start a workout, and a handle
   living on them would be one mis-tap away from starting the wrong day.

   The list on the Library tab arranges every preset. The strip on Home
   arranges the pinned ones, in place, without disturbing the rest. */

function reorderRow(kind, i, n, title, sub, tail = "", attrs = "") {
  return `<div data-dragrow="${kind}" ${attrs} style="display:flex;align-items:center;background:var(--surface);border-bottom:${i < n - 1 ? "1px solid var(--border-soft)" : "none"}">
    <span data-drag-handle class="pb-drag" title="${T("preset.dragTitle")}" style="flex-shrink:0;padding:13px 4px 13px 11px;color:var(--faint);display:flex">${icon("grip-vertical", 16)}</span>
    <div style="flex:1;min-width:0;padding:11px 6px">
      <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
      <div style="font-size:11.5px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>
    </div>
    ${tail}
  </div>`;
}

/* the header of a list that can be rearranged: the toggle, or Done */
function reorderBar(action, on, label) {
  return `<div style="display:flex;justify-content:flex-end;margin:-2px 2px 10px">
    <button data-action="${action}" class="pb-chip" style="padding:6px 11px;font-size:11.5px;color:${on ? "var(--gold)" : "var(--muted)"};border-color:${on ? "rgba(233,185,73,.45)" : "var(--border)"};background:${on ? "rgba(233,185,73,.08)" : "var(--surface2)"}">
      ${icon(on ? "check" : "arrow-up-down", 12)} ${on ? T("preset.reorderDone") : label}
    </button>
  </div>`;
}

function renderPresetOrder(presets) {
  return reorderBar("preset-reorder", true, "") + `<div class="pb-card" style="overflow:hidden;margin-bottom:12px">
    ${presets.map((p, i) => reorderRow("preset", i, presets.length,
      esc(p.name),
      TN("move", (p.exercises || []).length) + (p.pinned ? " · " + T("preset.pinned") : ""),
      p.pinned ? icon("pin", 13, 'style="color:var(--gold);flex-shrink:0;margin-right:13px"') : "")).join("")}
  </div>
  <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:0 4px 10px">
    ${T("preset.reorderHint", { icon: icon("grip-vertical", 11) })}
  </div>`;
}

function renderPresets() {
  const presets = state.presets || [];
  if (ui.presetOrder && presets.length > 1) return renderPresetOrder(presets);
  if (!presets.length)
    return `<div class="pb-card" style="padding:26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.65">
      ${icon("layers", 26, 'style="margin:0 auto 10px;display:block;color:var(--faint)"')}
      ${T("preset.empty")}
    </div>`;

  return (presets.length > 1 ? reorderBar("preset-reorder", false, T("preset.reorder")) : "") +
    presets.map((p) => {
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
        <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(groupOfEntry(e))};flex-shrink:0"></span>
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
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="${editing ? "exwin-cancel" : "exwin-close"}" style="color:var(--muted);padding:4px">${icon(editing ? "arrow-left" : "x", 21)}</button>
      <div class="pb-num" style="font-size:18px;font-weight:700;flex:1">${isNew ? T("ex.newTitle") : editing ? T("ex.editTitle") : T("ex.viewTitle")}</div>
      ${headerRight}
    </div>
    <div class="pb-scroll" data-scrollkey="exwin" style="flex:1;overflow-y:auto;padding:16px 16px calc(40px + var(--pb-sab))">
      ${editing ? exWindowEditBody(ex, library) : exWindowViewBody(ex, hist)}
    </div>
  `, "exWin");
}

/* ── one lift's whole history, for the panels at the bottom of its window ──
   Every entry that produced a number, oldest first, each carrying the entry
   behind it so a tapped dot can still say what the session was. PR flags are
   worked out here from the running best rather than borrowed from
   computeBadges(), because only this one lift is in question.

   The same rows come back a second way, grouped into SESSIONS, because a
   graph and a list answer different questions about one set of facts and
   must never answer them from different facts. The graph plots entries; the
   history list below it reads days, since two entries of the same lift on
   one day are one session's work and nobody remembers them as two.       */
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

  /* day by day, newest first, which is the direction a history is read in.
     The session's headline number and its flag are the FIRST of its points
     to reach the day's best: taking the last would call a day that opened
     with a PR and backed off a "match" of itself. */
  const sessions = [];
  for (const p of chart) {
    const open = sessions.length ? sessions[sessions.length - 1] : null;
    if (open && open.date === p.e.date) open.points.push(p);
    else sessions.push({ date: p.e.date, points: [p] });
  }
  for (const ses of sessions) {
    const top = ses.points.reduce((a, p) => (p.y > a.y ? p : a), ses.points[0]);
    ses.entries = ses.points.map((p) => p.e);
    ses.m = top.y;
    ses.badge = top.badge;
    Object.assign(ses, outingRows(ses.entries));   // rows, note, best
  }
  sessions.reverse();

  const cardio = !!(best && best.kind === "cardio");
  return { series, chart, sessions, best, cardio, unit: cardio ? T("unit.pts") : state.settings.units };
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

    ${ex.missing ? "" : `<button data-action="log-exercise" data-name="${esc(ex.name)}" class="pb-btn pb-gold" style="width:100%;padding:15px 0;font-size:16px;border-radius:14px">
      ${icon("plus", 19, 'stroke-width="2.6"')} ${T("ex.logBtn")}
    </button>
    <div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin:8px 2px 18px">
      ${ui.workoutSheet ? T("ex.logHintOpen") : T("ex.logHint")}
    </div>`}

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
    ${exWindowHistory(hist)}
  `;
}

/* ── the lift's own progress panel ────────────────────────────────────
   Your best ever on this movement, then the same graph the Progress tab
   draws for it, the whole point being that you can look a lift up, see
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

/* ── the ledger under the graph ───────────────────────────────────────
   The graph says where the lift has got to; this says what you actually
   did, session by session, newest first, with the sets written out in the
   unit each was logged in. It is the same list `renderLastTime` draws for
   the session before this one, only all the way back.

   A row is A DAY, not an entry, and tapping one lands on that day in the
   log (`open-log-day`), because "the twentieth of August" is a session you
   trained, not a row in a table, and the rest of what you did that day is
   most of what you came to remember. Nothing here is editable: this window
   is where you look a lift up, and the log is where it is written down.

   Long histories are folded to the recent ones with the rest one tap away.
   Someone who has benched for two years has a hundred of these, and a
   hundred cards between the graph and the bottom of the window would make
   the graph the thing you have to scroll past. */
const EX_HISTORY_PAGE = 8;

function exWindowHistory(hist) {
  if (!hist || !hist.sessions.length) return "";
  const all = ui.exHistAll;
  const shown = all ? hist.sessions : hist.sessions.slice(0, EX_HISTORY_PAGE);
  const rest = hist.sessions.length - shown.length;

  const rows = shown.map((ses, i) => {
    const sets = ses.rows.map((r, n) => {
      const line = r.minutes != null
        ? T("sug.cardioSet", { min: esc(r.minutes), rpe: esc(r.intensity) })
        : `${esc(r.reps)} × ${esc(r.weight)} ${r.unit}`;
      const tail = [r.rpe ? `@${esc(r.rpe)}` : "", r.topOf ? T("last.topOf", { n: r.topOf }) : ""].filter(Boolean).join(" · ");
      return chip(`<span style="color:var(--faint)">${n + 1} ·</span> ${line}${tail ? ` · ${tail}` : ""}`);
    }).join("");

    return `<button data-action="open-log-day" data-date="${esc(ses.date)}" style="width:100%;display:block;text-align:left;padding:11px 12px;color:var(--text);${i ? "border-top:1px solid var(--border-soft)" : ""}">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="pb-num" style="font-weight:600;font-size:13.5px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${fmtDate(ses.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </div>
        ${BADGE_SHORT[ses.badge] ? chip(BADGE_SHORT[ses.badge], ses.badge === "pr" ? "var(--gold)" : "") : ""}
        <div class="pb-num" style="font-weight:700;font-size:15px;flex-shrink:0;color:${ses.badge === "pr" ? "var(--gold)" : "var(--text)"}">
          ${ses.m}<span style="font-size:10px;color:var(--muted);font-weight:600"> ${hist.unit}</span>
        </div>
        ${icon("chevron-right", 14, 'style="color:var(--faint);flex-shrink:0"')}
      </div>
      ${sets ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:7px">${sets}</div>` : ""}
      ${ses.note ? `<div style="font-size:11.5px;color:var(--faint);margin-top:7px;line-height:1.45;font-style:italic">“${esc(ses.note)}”</div>` : ""}
    </button>`;
  }).join("");

  const more = rest > 0 || all
    ? `<button data-action="ex-hist-all" style="width:100%;padding:11px 0;border-top:1px solid var(--border-soft);color:var(--muted);font-size:12.5px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px">
        ${icon(all ? "chevron-up" : "chevron-down", 14)} ${all ? T("ex.historyLess") : T("ex.historyMore", { n: rest })}
      </button>`
    : "";

  return `
    ${sectionTitle(T("ex.historyTitle"), `<span style="font-size:11px;color:var(--faint)">${TN("session", hist.sessions.length)}</span>`)}
    <div class="pb-card" style="overflow:hidden">${rows}${more}</div>
    <div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin:8px 2px 0">
      ${ui.workoutSheet ? T("ex.historyHintOpen") : T("ex.historyHint")}
    </div>`;
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

/* One window, two jobs. `draft.planning` turns the workout sheet into the
   PLAN builder: the same picker, the same presets, the same set list and
   the same "beat last time" card, writing a dated intention instead of a
   logged day. Reusing it is not a shortcut: deciding what to do and
   writing down what you did are the same shape, and the only screen that
   has ever known that shape is this one. What changes is what the numbers
   MEAN when you leave, and that is a branch in commitWorkout, not here.

   The one real difference in the form itself: a plan may keep exercises
   with no numbers on them ("Wednesday: these six lifts, weights on the
   day"), where a workout drops them. */
function renderWorkoutSheet(draft, library, log, settings, unit) {
  const planning = !!draft.planning;
  const wk = rollingWeeks() ? null : weekOf(draft.date, settings.startDate);
  /* when editing an existing day, its own rows already live in the log, so drop
     them from the comparison base so the "vs your best" preview isn't counting
     the very rows being edited. */
  const baseLog = draft.editing ? log.filter((e) => !(draft.originalIds || []).includes(e.id)) : log;
  const combined = [...baseLog, ...draft.entries.map((e) => ({ ...e, date: draft.date }))];
  const badges = planning ? {} : computeBadges(combined);

  /* entries with no numbers yet (typically dropped in from a preset) don't get
     saved and don't count toward the workout, they're a "fill me in" prompt.
     A PLAN keeps them: naming the lifts and leaving the weights for the day is
     a plan, not an unfinished one. */
  const filledCount = draft.entries.filter(entryHasData).length;
  const emptyCount = draft.entries.length - filledCount;
  const saveLabel = planning
    ? (draft.entries.length ? T("plan.saveN", { n: draft.entries.length }) : T("plan.nothingYet"))
    : filledCount ? T(draft.editing ? "wo.updateN" : "wo.saveN", { n: filledCount })
    : draft.editing ? T("wo.removeDay")
    : draft.entries.length ? T("wo.fillIn")
    : T("wo.nothingYet");


  /* Rearranging is a mode, for the same reason it is one for presets and
     timer dials: the cards are what you tap to open a lift mid-set, and a
     grip handle living on one is a mis-tap away from the wrong exercise. */
  const reordering = ui.entryOrder && draft.entries.length > 1;
  /* lifts run straight into the one above them are drawn as one block */
  const supers = superMarks(draft.entries);
  const entries = reordering
    ? `<div class="pb-card" style="overflow:hidden;margin-bottom:8px">
        ${draft.entries.map((e, i) => reorderRow("entry", i, draft.entries.length,
          esc(exLabel(e.exercise)),
          entryHasData(e) ? entrySummary(e, unit) : esc(groupLabel(groupOfEntry(e, library))),
          `<span style="width:8px;height:8px;border-radius:4px;flex-shrink:0;margin-right:14px;background:${colorFor(groupOfEntry(e, library))}"></span>`)).join("")}
      </div>
      <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:0 4px 10px">
        ${T("wo.reorderHint", { icon: icon("grip-vertical", 11) })}
      </div>`
    : draft.entries.map((e, ei) => {
    const b = badges[e.id] || {};
    const empty = !entryHasData(e);
    const chain = supers.cont[ei];
    /* An entry started from a plan carries its target, and the card counts
       the target down as the sets go in. It is the only thing on this
       screen that is not a record of something, hence the hollow ring
       rather than a filled bar down the side. */
    const res = entryPlanResult(e);
    /* the count is for set lists; a cardio target is one line and the
       "To do" above already is that line */
    const planLine = res && e.plan && e.plan.sets
      ? `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:${res.done >= res.total ? "var(--green)" : "var(--steel)"};margin-top:2px">
          ${icon("target", 11, 'style="flex-shrink:0"')}
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${T("plan.doneOf", { n: res.done, total: res.total })}${res.beat ? " · " + T("plan.nBeat", { n: res.beat }) : ""}</span>
        </div>`
      : "";
    return `${supers.head[ei] ? `<div style="display:flex;align-items:center;gap:6px;margin:2px 2px 4px;font-size:10.5px;font-weight:700;letter-spacing:.07em;color:var(--blue)">${icon("link", 12)} ${T("wo.superset")}</div>` : ""}
    <div class="pb-card" style="display:flex;align-items:center;margin-bottom:${chain || supers.cont[ei + 1] ? 4 : 8}px;margin-left:${chain ? 16 : 0}px;overflow:hidden${empty ? (res ? ";border:1px dashed var(--steel)" : ";border:1px dashed rgba(233,185,73,.55)") : ""}${chain ? ";border-left:2px solid var(--blue)" : ""}">
      <button data-action="edit-draft-entry" data-id="${e.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:12px 4px 12px 14px;text-align:left;color:var(--text)">
        ${chain ? icon("corner-down-right", 12, 'style="color:var(--blue);flex-shrink:0;margin-right:-4px"') : ""}
        <div style="width:4px;align-self:stretch;border-radius:2px;background:${colorFor(groupOfEntry(e, library))}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${esc(exLabel(e.exercise))}</div>
          <div style="font-size:12px;color:${empty ? (res ? "var(--muted)" : "var(--gold)") : "var(--muted)"}">
            ${planning
              ? planEntryLine(e)
              : empty
              ? (res ? T("plan.toDo", { target: planTargetLine(e.plan, unitOf(e)) })
                : e.kind === "cardio" ? T("wo.noDataCardio")
                : isDetailed(e) ? T("wo.noDataSets")
                : T("wo.noData"))
              : entrySummary(e, unit)}
          </div>
          ${planning ? "" : planLine}
        </div>
        ${b.metric != null ? `<div class="pb-num" style="font-weight:700;font-size:16px;color:${b.badge === "pr" ? "var(--gold)" : "var(--text)"}">${b.metric}</div>` : ""}
        ${icon("pencil", 14, 'style="color:var(--faint);flex-shrink:0"')}
      </button>
      <button data-action="open-exercise-window" data-name="${esc(e.exercise)}" title="${T("log.exerciseDetails")}" style="flex-shrink:0;padding:12px 14px;color:var(--faint);align-self:stretch;border-left:1px solid var(--border-soft)">${icon("info", 16)}</button>
    </div>`;
  }).join("");


  return fullScreen(50, `
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-worksheet" title="${planning ? T("plan.closeKeep") : draft.editing ? T("wo.close") : T("wo.closeKeep")}" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${planning ? (draft.planId ? T("plan.edit") : T("plan.new")) : draft.editing ? T("wo.edit") : T("wo.new")}</div>
      ${wk ? chip(T("common.week", { n: wk }), planning ? "var(--steel)" : "var(--gold)") : ""}
      ${draft.editing ? `<button data-action="delete-day" title="${T("wo.deleteDay")}" style="color:var(--red);padding:4px">${icon("trash-2", 19)}</button>` : ""}
      ${planning && draft.planId ? `<button data-action="plan-delete" data-id="${esc(draft.planId)}" title="${T("plan.deletePlan")}" style="color:var(--red);padding:4px">${icon("trash-2", 19)}</button>` : ""}
    </div>

    <div class="pb-scroll" data-scrollkey="worksheet" style="flex:1;overflow-y:auto;padding:14px 16px calc(120px + var(--pb-sab))">
      ${planning ? `<div style="display:flex;gap:10px">
        <div style="flex:1.2">${field(T("wo.date"), `<input type="date" class="pb-input" data-bind="draft.date" value="${esc(draft.date)}">`)}</div>
        <div style="flex:1">${field(T("plan.name"), `<input class="pb-input" data-bind="draft.name" value="${esc(draft.name || "")}" placeholder="${T("plan.namePlaceholder")}">`)}</div>
      </div>` : field(T("wo.date"), `<input type="date" class="pb-input" data-bind="draft.date" value="${esc(draft.date)}">`)}

      ${sectionTitle(planning ? T("plan.exercisesPlanned") : T("wo.exercisesThis"),
        orderToggle("entry-reorder", ui.entryOrder, draft.entries.length > 1))}
      ${draft.entries.length === 0 ? `<div class="pb-card" style="padding:20px;text-align:center;color:var(--faint);font-size:13px;line-height:1.5;margin-bottom:10px">
        ${T(planning ? "plan.emptyHint" : "wo.emptyHint")}
      </div>` : ""}
      ${entries}

      ${reordering ? "" : `<button data-action="open-picker" class="pb-btn pb-ghost" style="width:100%;padding:13px 0;border-style:dashed;margin-top:4px">
        ${icon("plus", 17)} ${T("wo.addExercise")}
      </button>`}

      ${planning ? "" : renderTimerList()}
    </div>

    <div style="position:absolute;bottom:0;left:0;right:0;padding:12px 16px calc(18px + var(--pb-sab));background:linear-gradient(transparent, var(--bg) 30%)">
      ${!planning && emptyCount ? `<div style="font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:8px;line-height:1.45">${emptyCount === 1 ? T("wo.stillNeedOne") : T("wo.stillNeed", { n: TN("exercise", emptyCount) })}</div>` : ""}
      ${planning && draft.entries.length ? `<div style="font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:8px;line-height:1.45">${T("plan.footNote")}</div>` : ""}
      ${!planning && !draft.editing && draft.entries.length ? `<div style="font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:8px;line-height:1.45">${T("wo.draftNote")}</div>` : ""}
      ${draft.entries.length ? `<button data-action="save-as-preset" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:14.5px;margin-bottom:8px">
        ${icon("bookmark-plus", 16)} ${T("preset.saveTitle")}
      </button>` : ""}
      <button data-action="commit-workout" class="pb-btn pb-gold" style="width:100%;padding:15px 0;font-size:16px;opacity:${(planning ? draft.entries.length : filledCount || draft.editing) ? 1 : 0.5}">
        ${icon("check", 18)} ${saveLabel}
      </button>
    </div>
  `, "workoutSheet");
}


/* exercise picker with quick-add (name + muscle only, like the sheet) */
function renderPickerList(library) {
  const q = ui.pickerQ, quick = ui.pickerQuick;
  /* two different lists on one screen: allGroups() shows the bucket so an
     uncategorized lift can still be picked, libraryGroups() is what a new one
     can be filed under, and the bucket is never a choice, only a Skip. */
  const groups = allGroups(library);
  const pickable = libraryGroups(library);
  const match = library.filter((x) => exMatches(x, q));
  const exact = library.some((x) => exIsNamed(x, q));

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
      <button data-action="quick-add-muscle" data-g="${esc(UNCATEGORIZED)}" class="pb-btn pb-ghost" style="width:100%;padding:10px 0;font-size:13px;margin-top:10px;border-style:dashed;color:var(--muted)">
        ${icon("skip-forward", 14)} ${T("pick.skipMuscle")}
      </button>
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

/* preset bundles shown inside the picker, tap to drop the whole bundle in */
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
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px">
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
    <div class="pb-scroll" data-scrollkey="picker" style="flex:1;overflow-y:auto;padding:4px 16px calc(30px + var(--pb-sab))">
      ${seg === "presets"
        ? `<div id="presetPickList">${renderPresetPickerList()}</div>`
        : `<div id="pickList">${renderPickerList(library)}</div>`}
    </div>
  `, "picker");
}

/* entry form, strength: sets/reps/weight/RPE · cardio: minutes/intensity */
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
  /* ── NOTHING IN IT IS A THING YOU CAN SAVE ──────────────────────────
     This used to refuse a brand-new entry with no numbers on it, on the
     grounds that a blank row is a row nobody asked for. That was wrong
     about who was asking. Halfway through the hamstring curls you decide
     the calf raises are next and you want them ON THE DAY, now, while you
     are thinking of it, with the numbers to follow when you have done
     them. Being made to type 1 rep at 1 kg to get past the button and
     then correct it afterwards is the app taking a note and turning it
     into a false record.

     So a lift can be lined up empty and left waiting for its numbers.
     It is NOT a plan: a plan is a dated intention that can sit in the
     calendar for weeks and is counted by nothing (state.plans), while
     this is a card in the day you are training right now, one screen
     away, and it becomes an ordinary logged lift the moment you fill it
     in. What has not changed: commitWorkout still drops whatever is
     still blank when the DAY is saved, so a lift you lined up and never
     did leaves no empty row behind in your history. */
  const planning = isDraft && !!(ui.workoutSheet && ui.workoutSheet.planning);
  const onRecord = entryOnRecord(f, isDraft);
  const lineUp = isDraft && !planning && !onRecord && !entryHasData(f);
  const valid = planning || onRecord || isDraft || entryHasData(f);
  return { cardio, metric, preview, valid, onRecord, lineUp };
}

/* ── the set list inside a Detailed entry ──────────────────────────────
   Deliberately the same shape as the exercise list on the workout day: an
   "Add set" button on top, then one tappable card per set that opens the
   little editor. Add as many as you want, edit or drop any of them. */
/* ── GHOST SETS: THE PLAN, STANDING IN THE SET LIST ───────────────────
   When an entry carries a target, the sets you have not done yet are
   already in the list, outlined, greyed, in position. Each one has two
   taps on it and they mean different things:

     · the row itself opens the set editor WITH THE TARGET LOADED, which
       is where you change it because the fourth rep felt like the eighth;
     · the ✓ logs the set exactly as planned.

   Both are a tap. NOTHING IS EVER FILLED IN FOR YOU, the same rule the
   suggestion card lives under, and it matters more here, not less: a plan
   is three days old and was written by somebody who had not warmed up
   yet. What the ghost rows buy is the thing that made the whole feature
   worth building: a session that went to plan is one tap per set instead
   of three fields per set, without ever writing a number into the log
   that a finger did not put there.

   Done sets keep their target beside them and say, quietly, whether they
   cleared it. */
function ghostSetRow(t, n, unit) {
  return `<div class="pb-card" style="display:flex;align-items:center;margin-bottom:8px;overflow:hidden;border:1px dashed var(--border);background:transparent">
    <button data-action="plan-load-set" data-i="${n - 1}" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:11px 4px 11px 12px;text-align:left;color:var(--muted)">
      <div class="pb-num" style="width:24px;height:24px;border-radius:7px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:var(--faint);flex-shrink:0">${n}</div>
      <div style="flex:1;min-width:0">
        <div class="pb-num" style="font-weight:700;font-size:14.5px;color:var(--muted)">${esc(t.reps)} × ${esc(t.weight)} ${unit}</div>
        <div style="font-size:11px;color:var(--faint)">${T("plan.ghostLabel")}</div>
      </div>
    </button>
    <button data-action="plan-tick" data-i="${n - 1}" title="${T("plan.ghostDo")}" style="flex-shrink:0;padding:12px 14px;color:var(--gold);align-self:stretch;border-left:1px solid var(--border-soft)">${icon("check", 17)}</button>
  </div>`;
}

const VERDICT_COLOR = { beat: "var(--gold)", hit: "var(--green)", under: "var(--muted)" };

function renderSetList(f, unit, planning, isDraft) {
  const list = f.setList || [];
  const filled = filledSets(f);
  const top = bestSet(filled);
  const targets = (f.plan && f.plan.sets) || [];
  const res = entryPlanResult(f);
  /* With no plan to answer to, the reference is your own last session, set
     for set. Never while WRITING a plan: that is an intention, and there is
     nothing to grade yet. See entryLastResult for what this is fixing. */
  const lastRes = planning ? null : entryLastResult(f, isDraft);

  /* Rearranging is a mode, for the same reason it is one for the exercises
     in a day and the pinned strips: a set row is what you tap to correct a
     number, and a grip handle living on one is a mis-tap from editing the
     wrong set. */
  const reordering = ui.setOrder === f.id && list.length > 1;
  /* a drop continues the set above it with no rest, so it is drawn hanging
     off that set rather than as another equal row in the column */
  const drops = dropMarks(list);

  const dragRows = list.map((s, i) => reorderRow("set", i, list.length,
    setHasData(s) ? `${esc(s.reps)} × ${esc(s.weight)} ${unit}` : T("sets.fillIn"),
    setHasData(s)
      ? T("sets.est1rm", { n: est1RM(+s.weight, +s.reps) }) + (s.rpe ? ` · RPE ${esc(s.rpe)}` : "")
      : T("sets.blank"),
    `<span class="pb-num" style="font-size:12.5px;font-weight:700;color:var(--faint);flex-shrink:0;margin-right:14px">${i + 1}</span>`)).join("");

  const rows = list.map((s, i) => {
    const m = est1RM(+s.weight, +s.reps);
    const isBest = top && s.id === top.id && filled.length > 1;
    const blank = !setHasData(s);
    /* a plan outranks last time: it is the thing you decided to do */
    const t = targets[i];
    const prev = !t && lastRes ? lastRes.rows[i] : null;
    const ref = t || prev;
    const v = ref ? setVerdict(s, ref) : null;
    const refLine = t ? T("plan.vsTarget", { target: `${esc(t.reps)} × ${esc(t.weight)}` })
      : prev ? T("sets.vsLast", { target: `${prev.reps} × ${trimNum(prev.weight)}` })
      : "";
    const cont = drops.cont[i];
    return `${drops.head[i] ? `<div style="display:flex;align-items:center;gap:6px;margin:2px 2px 4px;font-size:10.5px;font-weight:700;letter-spacing:.07em;color:var(--steel)">${icon("chevrons-down", 12)} ${T("sets.dropset")}</div>` : ""}
    <div class="pb-card" style="display:flex;align-items:center;margin-bottom:${cont || drops.cont[i + 1] ? 4 : 8}px;margin-left:${cont ? 16 : 0}px;overflow:hidden${blank ? ";border:1px dashed rgba(233,185,73,.55)" : ""}${cont ? ";border-left:2px solid var(--steel)" : ""}">
      <button data-action="edit-set" data-id="${s.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:11px 4px 11px 12px;text-align:left;color:var(--text)">
        <div class="pb-num" style="width:24px;height:24px;border-radius:7px;background:${cont ? "transparent" : "var(--surface2)"};border:1px ${cont ? "dashed var(--steel)" : "solid var(--border)"};display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:var(--muted);flex-shrink:0">${cont ? icon("corner-down-right", 12) : i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14.5px;color:${blank ? "var(--gold)" : "var(--text)"}">
            ${blank ? T("sets.fillIn") : `${esc(s.reps)} × ${esc(s.weight)} ${unit}`}
          </div>
          ${!blank ? `<div style="font-size:11.5px;color:var(--faint)">${T("sets.est1rm", { n: m })}${s.rpe ? ` · RPE ${esc(s.rpe)}` : ""}${refLine ? ` · ${refLine}` : ""}</div>` : ""}
        </div>
        ${v ? `<span style="font-size:10px;font-weight:700;letter-spacing:.05em;color:${VERDICT_COLOR[v]};flex-shrink:0;white-space:nowrap">${T((t ? "plan.v." : "last.v.") + v)}</span>` : ""}
        ${isBest ? chip(T("sets.best"), "var(--gold)") : ""}
        ${icon("pencil", 14, 'style="color:var(--faint);flex-shrink:0;margin-left:2px"')}
      </button>
      <button data-action="remove-set" data-id="${s.id}" title="${T("sets.remove")}" style="flex-shrink:0;padding:12px 13px;color:var(--red);align-self:stretch;border-left:1px solid var(--border-soft)">${icon("x", 16)}</button>
    </div>`;
  }).join("");

  /* everything the plan still wants, in position, waiting to be ticked off */
  const ghosts = targets.slice(list.length)
    .map((t, k) => ghostSetRow(t, list.length + k + 1, (f.plan && f.plan.unit) || unit)).join("");

  /* What last time cost you is never counted up at you: under is not scolded
     here any more than it is under a plan, so the tally only ever names what
     went right. Nothing said at all on a session that simply held. */
  const won = lastRes ? [
    lastRes.beat ? T("last.nBeat", { n: lastRes.beat }) : "",
    lastRes.hit ? T("last.nSame", { n: lastRes.hit }) : "",
  ].filter(Boolean).join(" · ") : "";

  const status = res
    ? `<span style="font-size:11px;color:${res.done >= res.total ? "var(--green)" : "var(--steel)"}">${T("plan.doneOf", { n: res.done, total: res.total })}</span>`
    : won ? `<span style="font-size:11px;color:var(--gold)">${won}</span>`
    : list.length && !reordering ? `<span style="font-size:11px;color:var(--faint)">${T("sets.tapToEdit")}</span>`
    : "";

  const head = sectionTitle(filled.length ? T("sets.titleN", { n: filled.length }) : T("sets.title"),
    `<span style="display:flex;align-items:center;gap:10px">${status}${orderToggle("set-reorder", reordering, list.length > 1)}</span>`);

  return `
    ${head}
    ${reordering ? "" : `<div style="display:flex;gap:8px;margin-bottom:10px">
      <button data-action="add-set" class="pb-btn pb-ghost" style="flex:1;padding:13px 0;border-style:dashed">
        ${icon("plus", 17)} ${T("sets.add")}
      </button>
      ${list.length ? `<button data-action="add-drop" class="pb-btn pb-ghost" title="${T("sets.addDropHint")}" style="flex:0 0 auto;padding:13px 15px;border-style:dashed;color:var(--steel)">
        ${icon("chevrons-down", 16)} ${T("sets.addDrop")}
      </button>` : ""}
    </div>`}
    ${reordering
      ? `<div class="pb-card" style="overflow:hidden;margin-bottom:8px">${dragRows}</div>
         <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:0 4px 10px">
           ${T("sets.reorderHint", { icon: icon("grip-vertical", 11) })}
         </div>`
      : list.length || ghosts ? rows + ghosts
      : `<div class="pb-card" style="padding:20px;text-align:center;color:var(--faint);font-size:13px;line-height:1.55;margin-bottom:10px">
      ${T(planning ? "plan.setsNone" : "sets.none")}
    </div>`}`;
}


/* ── THE SUGGESTION, WHERE YOU ARE STANDING ───────────────────────────
   It goes at the TOP OF THE EXERCISE WINDOW, above Add set, not inside
   the little editor where the numbers are typed. That window is the one
   moment you are deciding what to do (you have walked to the rack, you
   have not loaded it yet) and by the time the set editor is open you
   have already made the call and are only writing it down. The editor
   still gets a one-line version of the same target, because that is
   where you find out you were one rep short.

   Both are tap-to-load: the card opens a new set with the suggestion in
   it, the line fills the set you already have open. Nothing is ever
   filled in for you without a tap, since the log has to stay a record of what
   you did, never of what the app hoped you would do. */

const sugWeight = (w) => String(Math.round(w * 100) / 100);

function sugOption(o, smaller, unit, fill) {
  const label = o.kind === "reps" ? T("sug.optRep")
    : o.kind === "weight" ? T("sug.optWeight", { n: sugWeight(o.step), unit })
    : o.kind === "minutes" ? T("sug.optMin", { n: SUG_CARDIO_MIN })
    : T("sug.optRpe");
  const line = o.minutes != null
    ? T("sug.cardioSet", { min: o.minutes, rpe: o.intensity })
    : `${o.reps} × ${sugWeight(o.weight)} ${unit}`;
  const data = o.minutes != null
    ? `data-min="${o.minutes}" data-rpe="${o.intensity}"`
    : `data-reps="${o.reps}" data-weight="${sugWeight(o.weight)}"`;
  /* identical framing on both, and the only difference allowed is the quiet
     tag saying which one moves the estimate less */
  return `<button data-action="${fill}" ${data} style="flex:1;min-width:0;text-align:left;padding:9px 10px;border-radius:11px;color:var(--text);background:var(--surface);border:1px solid var(--border)">
    <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)">${label}</div>
    <div class="pb-num" style="font-size:14px;font-weight:700;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${line}</div>
    <div style="display:flex;align-items:baseline;gap:5px;margin-top:1px">
      <span style="font-size:10.5px;color:var(--faint)">${T("sug.gives", { n: o.m })}</span>
      ${smaller ? `<span style="font-size:9.5px;color:var(--steel);white-space:nowrap">${T("sug.smaller")}</span>` : ""}
    </div>
  </button>`;
}

function renderSuggestion(form, unit) {
  const { f, isDraft } = form;
  const s = setSuggestion(f, isDraft);
  if (!s) return "";

  const wrap = (body) => `<div class="pb-card2" style="padding:12px 13px;margin-bottom:14px">${body}</div>`;

  if (s.kind === "first")
    return wrap(`<div style="display:flex;gap:9px;align-items:flex-start">
      ${icon("flag", 15, 'style="color:var(--blue);flex-shrink:0;margin-top:1px"')}
      <div style="flex:1;font-size:12.5px;color:var(--muted);line-height:1.5">${T("sug.first")}</div>
    </div>`);

  const cardio = s.kind === "cardio";
  const eUnit = cardio ? "" : s.unit;
  const last = cardio
    ? T("sug.cardioSet", { min: s.prev.minutes, rpe: s.prev.intensity })
    : `${s.prev.reps} × ${sugWeight(s.prev.weight)} ${eUnit}`;

  const head = `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:9px">
    <div class="pb-label" style="flex:1;min-width:0">${T("sug.title")}</div>
    <div style="font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${T("sug.lastTime", { set: last, date: fmtShort(s.prev.date) })}</div>
  </div>`;

  if (s.done)
    return wrap(head + `<div style="display:flex;gap:9px;align-items:flex-start">
      ${icon("check-circle", 15, 'style="color:var(--green);flex-shrink:0;margin-top:1px"')}
      <div style="flex:1;font-size:12.5px;color:var(--muted);line-height:1.5">${T("sug.ahead", { n: s.prev.m, now: s.now, unit: cardio ? T("unit.pts") : unit })}</div>
    </div>`);

  const mUnit = cardio ? T("unit.pts") : unit;
  return wrap(head + `<div style="display:flex;gap:8px">
      ${s.options.map((o) => sugOption(o, o.kind === s.smaller, eUnit, "sug-use")).join("")}
    </div>
    <div style="font-size:11px;color:var(--faint);margin-top:9px;line-height:1.45">
      ${T(s.options.length > 1 ? (s.smaller ? "sug.hint" : "sug.hintTied") : "sug.hintOne",
          { n: s.prev.m, unit: mUnit })}
    </div>`);
}

/* The session behind that card, set by set. Sits under whichever of the two
   cards took the slot above (a plan does not make last time less worth
   knowing) and says nothing at all before the first time. */
function renderLastTime(form) {
  const { f, isDraft } = form;
  const last = lastOuting(f, isDraft);
  if (!last) return "";

  const rows = last.rows.map((r, i) => {
    const line = r.minutes != null
      ? T("sug.cardioSet", { min: esc(r.minutes), rpe: esc(r.intensity) })
      : `${esc(r.reps)} × ${esc(r.weight)} ${r.unit}`;
    const side = [
      r.topOf ? T("last.topOf", { n: r.topOf }) : "",
      r.rpe ? `RPE ${esc(r.rpe)}` : "",
      r.m != null ? T(r.minutes != null ? "last.pts" : "sets.est1rm", { n: r.m }) : "",
    ].filter(Boolean).join(" · ");
    return `<div style="display:flex;align-items:baseline;gap:9px;min-width:0">
      <span class="pb-num" style="width:13px;flex-shrink:0;text-align:right;font-size:11.5px;color:var(--faint)">${i + 1}</span>
      <span class="pb-num" style="font-size:13.5px;font-weight:600;color:var(--text);white-space:nowrap">${line}</span>
      ${last.rows.length > 1 && r === last.best ? chip(T("sets.best"), "var(--gold)") : ""}
      <span style="flex:1"></span>
      ${side ? `<span class="pb-num" style="font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${side}</span>` : ""}
    </div>`;
  }).join("");

  return `<div class="pb-card2" style="padding:12px 13px;margin-bottom:14px">
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:9px">
      <div class="pb-label" style="flex:1;min-width:0">${T("last.title")}</div>
      <div style="font-size:11px;color:var(--faint);white-space:nowrap">${fmtDate(last.date, { weekday: "short", day: "numeric", month: "short" })}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">${rows}</div>
    ${last.note ? `<div style="font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.45;font-style:italic">${esc(last.note)}</div>` : ""}
  </div>`;
}

/* ── THE TARGET, WHERE THE SUGGESTION WOULD HAVE BEEN ─────────────────
   The "beat last time" card and this one answer the same question, what
   am I going for, and only one of them can be right at a time. When the
   entry carries a plan the question is already answered, days ago, by the
   person who sat down and answered it; re-offering two ways past last
   session on top of that is the app arguing with its own user. So the
   plan card TAKES THE SLOT, and the suggestion comes back the moment
   there is no plan (which includes any exercise you add to the day that
   the plan never mentioned, since those are ordinary entries and get the
   ordinary card). */
function renderPlanTarget(f, unit) {
  const t = f.plan;
  if (!t) return "";
  const res = entryPlanResult(f);
  const cardio = !t.sets;
  const complete = res && res.done >= res.total;
  const beat = res && res.beat > 0;

  /* One line, and only when it is worth a line. How the ghost rows work is
     worth saying before the first set and never again, the same rule that
     keeps the rest of the app from narrating itself mid-set, and the
     running count is already on the set list right below. What is left is
     the moment the plan is finished, which is the one thing here worth
     interrupting for. */
  const status = complete
    ? `<div style="font-size:12px;color:${beat ? "var(--gold)" : "var(--green)"};line-height:1.5;margin-top:8px">
        ${beat ? T("plan.allDoneBeat", { n: res.beat }) : res.under ? T("plan.allDoneSome") : T("plan.allDone")}
      </div>`
    : !res || res.done === 0
    ? `<div style="font-size:12px;color:var(--faint);line-height:1.5;margin-top:8px">${T(cardio ? "plan.cardioHint" : "plan.setsHint")}</div>`
    : "";

  const load = cardio && (!res || !res.done)
    ? `<button data-action="plan-fill-cardio" class="pb-btn pb-ghost" style="width:100%;padding:10px 0;font-size:13px;margin-top:10px">
        ${icon("download", 14)} ${T("plan.loadTarget")}
      </button>`
    : "";

  return `<div class="pb-card2" style="padding:12px 13px;margin-bottom:14px;border-color:var(--steel)">
    <div style="display:flex;align-items:baseline;gap:8px">
      <div class="pb-label" style="flex:1;min-width:0;color:var(--steel)">${T("plan.targetLabel")}</div>
      <div class="pb-num" style="font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${planTargetLine(t, unit)}</div>
    </div>
    ${status}
    ${load}
  </div>`;
}

function renderEntryFields(form, unit) {
  const { f, isDraft } = form;
  const { cardio, metric, preview, valid, onRecord, lineUp } = entryComputed();
  const detailed = isDetailed(f);
  const eUnit = unitOf(f);
  /* the form doesn't need a flag of its own: an entry being drafted always
     belongs to the sheet that is open behind it, and that sheet knows
     whether it is writing a plan or a day */
  const planning = isDraft && !!(ui.workoutSheet && ui.workoutSheet.planning);

  /* The lift this one would run straight into: the one above it in the day,
     or the current last one for an entry that has not been added yet. Only a
     sheet has an "above" at all, so editing a single logged row from the Log
     tab is not offered it. */
  const sheetEntries = isDraft && ui.workoutSheet ? ui.workoutSheet.entries : null;
  const myIx = sheetEntries ? sheetEntries.findIndex((x) => x.id === f.id) : -1;
  const above = !sheetEntries ? null
    : myIx > 0 ? sheetEntries[myIx - 1]
    : myIx === -1 && sheetEntries.length ? sheetEntries[sheetEntries.length - 1]
    : null;
  const superRow = above
    ? `<button data-action="entry-super-toggle" style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 12px;margin-bottom:14px;border-radius:11px;border:1px ${isSuper(f) ? "solid var(--blue)" : "dashed var(--border)"};background:${isSuper(f) ? "rgba(93,139,204,.10)" : "transparent"};text-align:left">
        ${icon("link", 16, `style="color:${isSuper(f) ? "var(--blue)" : "var(--faint)"};flex-shrink:0"`)}
        <span style="flex:1;min-width:0">
          <span style="display:block;font-size:13.5px;font-weight:600;color:${isSuper(f) ? "var(--text)" : "var(--muted)"}">${T("wo.supersetWith")}</span>
          <span style="display:block;font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabel(above.exercise))}</span>
        </span>
        <span style="width:18px;height:18px;border-radius:6px;flex-shrink:0;border:1px solid ${isSuper(f) ? "var(--blue)" : "var(--border)"};background:${isSuper(f) ? "var(--blue)" : "transparent"};display:flex;align-items:center;justify-content:center;color:#fff">${isSuper(f) ? icon("check", 12) : ""}</span>
      </button>`
    : "";

  const inputs = cardio
    ? `<div style="display:flex;gap:10px">
        <div style="flex:1">${field(T("entry.minutes"), `<input class="pb-input" ${NUM} data-bind="entry.minutes" value="${esc(f.minutes)}" placeholder="—">`)}</div>
        <div style="flex:1">${field(T("entry.intensity"), `<input class="pb-input" ${NUM} data-bind="entry.intensity" value="${esc(f.intensity)}" placeholder="—">`)}</div>
      </div>`
    : detailed
    ? renderSetList(f, eUnit, planning, isDraft)
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
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 6px">
      <button data-action="close-entry" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
      <div style="flex:1">
        <div class="pb-num" style="font-size:18px;font-weight:700;line-height:1.15">${esc(exLabel(f.exercise))}</div>
        <div style="font-size:11.5px;color:var(--faint)">${planning ? T("plan.entrySub") : cardio ? T("entry.cardioSub") : detailed ? T("entry.setsSub") : T("entry.topSetSub")}</div>
      </div>
      <button data-action="delete-entry-form" style="color:var(--red);padding:6px">${icon("trash-2", 18)}</button>
    </div>

    <div class="pb-scroll" data-scrollkey="entryform" style="flex:1;overflow-y:auto;padding:10px 16px calc(120px + var(--pb-sab))">
      ${!isDraft ? field("Date", `<input type="date" class="pb-input" data-bind="entry.date" value="${esc(f.date)}">`) : ""}
      ${convert}
      ${f.plan ? renderPlanTarget(f, eUnit) : renderSuggestion(form, unit)}
      ${renderLastTime(form)}
      ${inputs}
      ${superRow}
      ${field(T("entry.notes"), `<textarea class="pb-input" rows="2" data-bind="entry.notes" placeholder="—" style="resize:none">${esc(f.notes)}</textarea>`,
        detailed ? T("entry.notesHint") : "")}

      <!-- live computed row: the sheet's Est. 1RM + "vs. Your Best" -->
      <div class="pb-card2" style="padding:12px 14px;display:flex;align-items:center;gap:12px;margin-top:4px">
        <div>
          <div class="pb-label">${cardio ? T("entry.sessionLoad") : detailed ? T("entry.bestSet1rm", { unit }) : T("entry.est1rm", { unit })}</div>
          <div id="entryMetric" class="pb-num" style="font-size:30px;font-weight:700;color:var(--gold);line-height:1.05">${metric ?? "—"}</div>
        </div>
        <div id="entryBadge" style="flex:1;text-align:right;font-size:13px;font-weight:700;color:${preview === "pr" ? "var(--gold)" : preview === "first" ? "var(--blue)" : "var(--muted)"}">
          ${preview ? BADGE_TEXT[preview] : cardio ? T("entry.cardioFormula") : ""}
        </div>
      </div>
      ${!cardio && eUnit !== unit ? `<div style="font-size:11.5px;color:var(--faint);margin:8px 2px 0;line-height:1.5">
        ${T("entry.converted", { from: eUnit, to: unit })}
      </div>` : ""}
      ${detailed ? `<div style="font-size:11.5px;color:var(--faint);margin:8px 2px 0;line-height:1.5">
        ${T("entry.highestNote")}
      </div>` : ""}

      ${planning ? "" : renderTimerList()}
    </div>

    <div style="position:absolute;bottom:0;left:0;right:0;padding:12px 16px calc(18px + var(--pb-sab));background:linear-gradient(transparent, var(--bg) 30%)">
      <button id="entrySaveBtn" data-action="save-entry-form" ${valid ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:15px 0;font-size:16px;opacity:${valid ? 1 : 0.45}">
        ${icon(lineUp ? "clock" : "check", 18)} ${planning ? T("plan.addToPlan")
          : lineUp ? T("entry.lineUp")
          : onRecord && !entryHasData(f) ? T("entry.saveNotDone")
          : isDraft ? T("entry.addToWorkout") : T("common.saveChanges")}
      </button>
    </div>
  `, "entryForm");
}

/* ── IS THE SET YOU ARE TYPING BETTER THAN LAST TIME? ─────────────────
   The set editor has always shown the est. 1RM of the numbers in the two
   boxes, and on its own that figure answers nothing: nobody carries last
   week's estimate around in their head. The "beat last time" card offers
   two ways over the bar, but the whole point of typing your own numbers is
   that you did not want either of them, and until now that left you
   backing out of the editor to go and look the old number up.

   So the est. 1RM says which side of last session it lands on. The bar is
   the same one the suggestion card argues from, the lift's estimate LAST
   SESSION, which is its best set: the app already treats that as what the
   lift is worth on a given day, and a second definition of "last time" on
   the same screen would be one too many.

   Read through lastTimeSets, which has already converted that session into
   the unit being typed in today, because the number this is subtracted
   from is drawn in the entry's unit and a kg estimate held up against an
   lbs one is not a comparison at all.

   It states a fact about a number, it does not propose one, so unlike the
   suggestion card it stays put under a plan: the plan owns "what am I
   going for", this only ever says what you have typed so far comes to. */
function lastBestMetric(f, isDraft) {
  const prev = lastTimeSets(f, isDraft);
  if (!prev) return null;
  let m = null;
  for (const r of prev.rows) {
    const v = est1RM(r.weight, r.reps);
    if (v != null && (m == null || v > m)) m = v;
  }
  return m == null ? null : { m, date: prev.date };
}

/* One line under that number: the verdict, in the colours the set list's
   own beat/same/under verdicts wear, then the bar it was measured against,
   because a comparison that will not name what it compared with is just an
   opinion. Text and colour only, no icon: this is rewritten in place while
   you type (see updateSetPreview) and a freshly injected lucide
   placeholder has nothing to turn it into a glyph. */
function vsLastLine(m, ref) {
  if (!ref) return "";
  const base = `<span style="color:var(--faint)">${T("vsLast.base", { n: ref.m, date: fmtShort(ref.date) })}</span>`;
  if (m == null) return base;
  const d = Math.round((m - ref.m) * 10) / 10;
  const v = d > 0 ? "beat" : d < 0 ? "under" : "hit";
  const word = d === 0 ? T("vsLast.same") : T(d > 0 ? "vsLast.over" : "vsLast.under", { n: Math.abs(d) });
  return `<span style="color:${VERDICT_COLOR[v]};font-weight:700">${word}</span> · ${base}`;
}

/* the single-set editor, same idea as the entry form, one level down */
function renderSetForm(form, unit) {
  const { s, isNew, index } = form;
  const m = est1RM(+s.weight, +s.reps);
  const ok = setHasData(s);
  const vsRef = ui.entryForm ? lastBestMetric(ui.entryForm.f, ui.entryForm.isDraft) : null;
  /* the same target as the card behind this sheet, one line, one tap,
     only on a NEW set, because correcting an old one is not a decision
     about what to lift next */
  /* …and nothing at all while the plan still has a set at this position:
     that set already has a target and it is drawn on the ghost row you
     tapped to get here. Past the end of the plan the card comes back,
     because a bonus set is a decision again. */
  const planned = ui.entryForm && ui.entryForm.f.plan && ui.entryForm.f.plan.sets;
  const stillPlanned = planned && index < planned.length;
  const sug = isNew && ui.entryForm && !stillPlanned ? setSuggestion(ui.entryForm.f, ui.entryForm.isDraft) : null;
  /* both of them, same as the card behind this sheet, minus whichever one
     the open set already IS, which is what you get by tapping it there */
  const opts = sug && sug.kind === "step" && !sug.done
    ? sug.options.filter((o) => !(+s.reps === o.reps && +s.weight === o.weight))
    : [];
  const target = opts.length
    ? `<div class="pb-label" style="margin-bottom:6px">${T("sug.tryLabel")}</div>
       <div style="display:flex;gap:8px;margin-bottom:14px">
         ${opts.map((o) => sugOption(o, o.kind === sug.smaller && opts.length > 1, unit, "sug-fill")).join("")}
       </div>`
    : "";
  /* Only offered where it can mean anything: the first set of a lift has
     nothing above it to have dropped from. */
  const dropRow = index > 0
    ? `<button data-action="set-drop-toggle" style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 12px;margin-bottom:12px;border-radius:11px;border:1px ${isDrop(s) ? "solid var(--steel)" : "dashed var(--border)"};background:${isDrop(s) ? "var(--surface2)" : "transparent"};text-align:left">
        ${icon("chevrons-down", 16, `style="color:${isDrop(s) ? "var(--steel)" : "var(--faint)"};flex-shrink:0"`)}
        <span style="flex:1;min-width:0">
          <span style="display:block;font-size:13.5px;font-weight:600;color:${isDrop(s) ? "var(--text)" : "var(--muted)"}">${T("sets.dropFrom", { n: index })}</span>
          <span style="display:block;font-size:11px;color:var(--faint)">${T("sets.dropFromHint")}</span>
        </span>
        <span style="width:18px;height:18px;border-radius:6px;flex-shrink:0;border:1px solid ${isDrop(s) ? "var(--steel)" : "var(--border)"};background:${isDrop(s) ? "var(--steel)" : "transparent"};display:flex;align-items:center;justify-content:center;color:var(--bg)">${isDrop(s) ? icon("check", 12) : ""}</span>
      </button>`
    : "";
  return sheet(isNew ? T("setForm.add", { n: index + 1 }) : T("setForm.edit", { n: index + 1 }), "setForm", `
    ${dropRow}
    <div style="display:flex;gap:10px">
      <div style="flex:1">${field(labelWith(T("setForm.reps")), `<input class="pb-input" ${NUM} data-bind="set.reps" value="${esc(s.reps)}" placeholder="—" data-autofocus>`)}</div>
      <div style="flex:1">${field(labelWith(T("setForm.weight"), unitSelect(unit)), `<input class="pb-input" ${NUM} data-bind="set.weight" value="${esc(s.weight)}" placeholder="—">`)}</div>
    </div>
    ${target}
    ${field(T("entry.rpe"), `<input class="pb-input" ${NUM} data-bind="set.rpe" value="${esc(s.rpe)}" placeholder="—">`, T("setForm.rpeHint"))}

    <div class="pb-card2" style="padding:11px 14px;margin-bottom:14px">
      <div class="pb-label">${T("entry.est1rm", { unit })}</div>
      <div id="setMetric" class="pb-num" style="font-size:26px;font-weight:700;color:var(--gold);line-height:1.05">${m ?? "—"}</div>
      <div id="setVsLast" style="font-size:11.5px;line-height:1.45;margin-top:${vsRef ? 5 : 0}px">${vsLastLine(m, vsRef)}</div>
    </div>

    <button id="setSaveBtn" data-action="save-set" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">
      ${icon("check", 17)} ${isNew ? T("setForm.addBtn") : T("setForm.saveBtn")}
    </button>
    ${!isNew ? `<button data-action="delete-set" class="pb-btn" style="width:100%;padding:12px 0;margin-top:8px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} ${T("setForm.removeBtn")}
    </button>` : ""}
  `, 100);
}

/* live 1RM, its verdict against last time, and save-button state while
   typing in the set editor. Patched in place rather than re-rendered, so
   the caret never moves out from under the finger typing into it. */
function updateSetPreview() {
  if (!ui.setForm) return;
  const s = ui.setForm.s;
  const m = est1RM(+s.weight, +s.reps);
  const el = document.getElementById("setMetric");
  const vs = document.getElementById("setVsLast");
  const btn = document.getElementById("setSaveBtn");
  if (el) el.textContent = m ?? "—";
  if (vs && ui.entryForm) vs.innerHTML = vsLastLine(m, lastBestMetric(ui.entryForm.f, ui.entryForm.isDraft));
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
    b.textContent = preview ? BADGE_TEXT[preview] : cardio ? T("entry.cardioFormula") : "";
  }
  if (s) { s.disabled = !valid; s.style.opacity = valid ? 1 : 0.45; }
}

/* ───────────────────── BODY MEASUREMENTS (window) ───────────────────
   Body check-ins happen every week or two, not every session, so they no
   longer take up one of the five slots along the bottom of the screen.
   The whole section, unchanged, opens as a window from the ruler button
   sitting next to the gear: same list, same stats, same editor. */

function renderBodyWindow(body, unit) {
  return fullScreen(80, `
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-body" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      ${icon("ruler", 19, 'style="color:var(--gold);flex-shrink:0"')}
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${T("title.body")}</div>
      <button data-action="new-body" class="pb-btn pb-gold" style="padding:8px 14px;font-size:13.5px">${icon("plus", 15)} ${T("common.new")}</button>
    </div>
    <div class="pb-scroll" data-scrollkey="bodywin" style="flex:1;overflow-y:auto;padding-bottom:calc(30px + var(--pb-sab))">
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

    <!-- PLACEHOLDER_BODY_GRAPH_SLOT: future measurement graphs -->
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
   the moment you come back. Saved timers are reusable (start, pause,
   reset, start again) and any number can run at once.                */

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
   Keep the peak gains ≤ 1, since the master level below is what actually sets
   the loudness, and it's per timer.                                    */

const SOUND_LIB = {
  /* the original three-tone, still the default */
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
  /* the impatient one: eight alternating blips you cannot ignore */
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
   so nothing gets louder by accident, and the slider only goes down from what
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
  } catch { /* ignore, a missing chime never blocks a workout */ }
}

/* Asked for on the first Start, since a permission prompt needs a user gesture. */
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

/* Repaint running cards in place, never a full render, so the countdown can't
   flicker the page or steal focus from a field you're typing in. */
function paintTimers() {
  for (const t of state.timers || []) {
    if (!t.endsAt) continue;
    const left = timerRemaining(t);
    const clock = fmtClock(left);
    /* the same timer can be on screen more than once (its card on the Timer
       tab, its dial on Home, its pill in the workout window) so every copy
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
   of the workout window and of each exercise: the same round dials as on
   the home screen, one tap to start, pause or clear, somewhere you can
   reach without losing what you were typing.

   Deliberately the dials and not the full list: mid-set you want the two
   or three lengths you actually rest for, at a glance and at arm's length,
   not every timer you've ever saved. The Timer tab is still the place to
   build, edit and pin them. */

function renderTimerList() {
  if (!(state.timers || []).length) return "";
  const pinned = pinnedTimers();

  const right = pinned.length > 1
    ? orderToggle("timer-reorder", ui.timerOrder, true)
    : `<span style="font-size:11px;color:var(--faint)">${T("timers.listHint")}</span>`;

  return `<div style="margin-top:22px">
    ${sectionTitle(T("timers.listTitle"), right)}
    ${pinned.length
      ? `<div class="pb-card" style="padding:14px 12px 15px">
          ${ui.timerOrder && pinned.length > 1
            ? renderPinnedTimerOrder(pinned)
            : `<div style="display:flex;align-items:flex-start;gap:6px">${pinned.map((t) => pinnedTimerDial(t)).join("")}</div>`}
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

   Every chip plays as you tap it and the slider previews on release, since
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
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-profile" style="color:var(--muted);padding:4px">${icon("x", 21)}</button>
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${T("profile.title")}</div>
      <button data-action="save-profile" class="pb-btn pb-gold" style="padding:8px 16px;font-size:13.5px">${T("common.save")}</button>
    </div>
    <div class="pb-scroll" data-scrollkey="profile" style="flex:1;overflow-y:auto;padding:16px 16px calc(40px + var(--pb-sab))">
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
      ${field(T("profile.weekMode"), `<div style="display:flex;gap:8px">
        ${[["program", T("profile.weekProgram"), "calendar-days"], ["rolling", T("profile.weekRolling"), "history"]].map(([m, label, ic]) => {
          const on = (f.weekMode || "program") === m;
          return `<button data-action="profile-weekmode" data-m="${m}" class="pb-btn" style="flex:1;padding:11px 0;font-size:13.5px;background:${on ? "var(--gold)" : "var(--surface2)"};color:${on ? "var(--gold-ink)" : "var(--muted)"};border:1px solid ${on ? "var(--gold)" : "var(--border)"}">${icon(ic, 15)} ${label}</button>`;
        }).join("")}
      </div>`, T((f.weekMode || "program") === "rolling" ? "profile.weekRollingHint" : "profile.weekProgramHint"))}
      ${field(T("profile.startDate"), `<input type="date" class="pb-input" data-bind="profile.startDate" value="${esc(f.startDate)}">`, T("profile.startDateHint"))}
      ${field(T("profile.daysPerWeek"), `<input class="pb-input" ${NUM} data-bind="profile.daysPerWeek" value="${esc(f.daysPerWeek)}">`)}

      <div class="pb-hairline" style="margin:18px 0"></div>
      ${sectionTitle(T("profile.data"))}
      <div style="display:flex;gap:8px;margin-bottom:9px">
        <button data-action="export-data" class="pb-btn pb-ghost" style="flex:1;padding:12px 0;font-size:13.5px">
          ${icon("download", 15)} ${T("profile.export")}
        </button>
        <label class="pb-btn pb-ghost" style="flex:1;padding:12px 0;font-size:13.5px;cursor:pointer">
          ${icon("upload", 15)} ${T("profile.import")}
          <input type="file" accept="application/json,.json,text/plain" data-filebind="backup" style="display:none">
        </label>
      </div>
      <div style="font-size:11.5px;color:var(--faint);margin-bottom:16px;line-height:1.5">
        ${T("profile.backupHint")}
      </div>

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
    <div class="pb-sheet-card pb-scroll${enter}" data-stopprop style="background:var(--surface);border-top:1px solid var(--border);border-radius:18px 18px 0 0;padding:16px 18px calc(26px + var(--pb-sab));max-height:calc(88% - var(--pb-sat));overflow-y:auto">
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

/* niceTicks' other half: when the axis has been dragged or pinched to a
   domain of its own, that domain is the answer and the ticks have to live
   inside it rather than rounding it outward, since otherwise every pan would
   nudge the view it was meant to be reading. */
function ticksWithin(min, max, count = 5) {
  if (!(max > min)) return [min];
  const step0 = (max - min) / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(step0))));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1e6; v += step)
    out.push(Math.round(v * 1000) / 1000);
  return out;
}

/* monotone cubic interpolation (Fritsch–Carlson), recharts' type="monotone" */
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

   It does not stop at your data. The window can be pulled out past the
   whole history and pushed off either end of it, and in fullscreen the
   vertical axis moves too, because a graph that ends at your best set
   looks like a ceiling. Zoom out and the sessions you have shrink into a
   corner, and the empty space in front of them is the rest of the year.

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
   pointer state has to outlive a redraw too, hence the module-level
   pointer map instead of variables inside the paint function.         */

/* which graph a tapped control belongs to, anything unmarked is the tab's */
const chartScope = (el) => (el && el.dataset.scope) || "main";

const CHART_MIN_SPAN = 0.5;       // zoom right in between two sessions
const CHART_TAP_SLOP = 7;         // px of movement still counted as a tap
const chartPointers = new Map();  // live pointers on a plot, by pointerId
let chartGesture = null;          // {mode:"pan"|"pinch", …} while one is running
let chartClipId = 0;              // unique <clipPath> ids, one per painted copy

/* The last vertical domain each scope was actually painted with, so a gesture
   that starts moving the y axis has somewhere to start from. It is written on
   every paint, which always happens before a finger can land. */
const chartYSeen = { main: null, ex: null };

/* ── how far you're allowed to go ─────────────────────────────────────
   The graph used to stop dead at the first and last session, which reads
   like the end of the road: two points filled the frame and there was
   nowhere left to look. There is nothing after your last set yet, and
   that empty space is the point: you can pull back until the history is
   a small thing in the corner and the rest of the year is in front of
   you. So the window is allowed well past both ends of the data, and the
   only rule left is that some of the line always stays on screen, so
   there is always something to find your way back by. */
const chartMaxSpan = (n) => Math.max((n - 1) * 6, 24);

/* the visible index window, clamped every time it's read so nothing can
   leave a view pointing somewhere it could never be scrolled back from */
function chartWindow(n, scope) {
  const full = Math.max(n - 1, 1);
  const v = ui.chartView[scope] || { lo: 0, hi: full };
  const span = Math.min(Math.max(v.hi - v.lo, CHART_MIN_SPAN), chartMaxSpan(n));
  const pad = span * 0.9;   // the history may be pushed almost, never quite, off
  const lo = Math.max(-pad, Math.min(v.lo, full - span + pad));
  return { lo, hi: lo + span };
}

/* the vertical half of the view, or null while it's still auto-fitting */
const chartYView = (scope) => {
  const v = ui.chartView[scope];
  return v && v.yLo != null && v.yHi != null ? { lo: v.yLo, hi: v.yHi } : null;
};

/* Every write goes through here so a horizontal move can't drop the vertical
   view it wasn't thinking about, or the other way round, and so the same
   "never quite off screen" rule chartWindow applies sideways applies upward
   too, since a graph dragged past its own numbers is a blank page. */
function setChartView(scope, v) {
  let y = v.yLo != null && v.yHi != null ? { lo: v.yLo, hi: v.yHi } : chartYView(scope);
  if (y) {
    const line = lineOf(scope);
    const ys = (line ? line.data : []).map((d) => d.y);
    const h = y.hi - y.lo;
    if (ys.length && h > 0) {
      const lo = Math.max(Math.min(...ys) - h * 0.9, Math.min(y.lo, Math.max(...ys) - h * 0.1));
      y = { lo, hi: lo + h };
    }
  }
  ui.chartView[scope] = y ? { lo: v.lo, hi: v.hi, yLo: y.lo, yHi: y.hi } : { lo: v.lo, hi: v.hi };
}

/* Zoom around a focal index, so whatever is under the fingers stays put.
   `fy` is the value under them; pass it (with the domain the gesture
   started from) to zoom both axes at once, leave it out and the vertical
   axis carries on fitting itself to what's on screen, which is what makes
   a zoomed-in plateau readable. A y axis already moved by hand is scaled
   along regardless, so the picture can't come out stretched. */
function chartZoom(factor, focus, scope, fy, y0) {
  const line = lineOf(scope);
  if (!line || line.data.length < 2) return;
  const n = line.data.length;
  const { lo, hi } = chartWindow(n, scope);
  const span = hi - lo;
  const fi = focus == null ? (lo + hi) / 2 : focus;
  const t = span > 0 ? (fi - lo) / span : 0.5;
  const next = Math.min(Math.max(span / factor, CHART_MIN_SPAN), chartMaxSpan(n));
  const nlo = fi - t * next;
  const v = { lo: nlo, hi: nlo + next };

  const base = y0 || chartYView(scope);
  if (base) {
    /* however much the x axis really moved after its clamps, the y axis
       moves by the same, so the two never drift out of proportion */
    const h = base.hi - base.lo;
    const nh = span > 0 ? h * (next / span) : h;
    const cy = fy == null ? (base.lo + base.hi) / 2 : fy;
    const ty = h > 0 ? (cy - base.lo) / h : 0.5;
    v.yLo = cy - ty * nh;
    v.yHi = v.yLo + nh;
  }
  setChartView(scope, v);
  drawLineChart();
  refreshChartToolbars();
}

function chartPan(dIndex, dValue, scope) {
  const line = lineOf(scope);
  if (!line) return;
  const fresh = !ui.chartView[scope];   // dragging an unzoomed graph is still a view
  const { lo, hi } = chartWindow(line.data.length, scope);
  const v = { lo: lo + dIndex, hi: hi + dIndex };
  if (dValue) {
    const base = chartYView(scope) || chartYSeen[scope];
    if (base) { v.yLo = base.lo + dValue; v.yHi = base.hi + dValue; }
  }
  setChartView(scope, v);
  drawLineChart();
  /* the toolbar only changes on the frame the reset button appears */
  if (fresh) refreshChartToolbars();
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

  /* Vertical domain: the axis fits itself to whatever is on screen until the
     moment you move it yourself, and from then on it's yours, which is what
     lets you leave room above the line for the sets you haven't done yet. */
  const yView = chartYView(scope);
  const ticks = yView ? ticksWithin(yView.lo, yView.hi, 5) : niceTicks(Math.min(...vals), Math.max(...vals), 5);
  const yMin = yView ? yView.lo : ticks[0];
  const yMax = yView ? yView.hi : ticks[ticks.length - 1];
  chartYSeen[scope] = { lo: yMin, hi: yMax };   // where a y gesture starts from
  const yOf = (v) => bottom - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const xOf = (i) => left + ((i - lo) / span) * plotW;
  /* the inverses, for hit-testing and for zooming around a finger */
  const idxAt = (px) => lo + ((px - left) / plotW) * span;
  const valAt = (py) => yMin + ((bottom - py) / (plotH || 1)) * (yMax - yMin);

  const pts = data.map((d, i) => ({ x: +xOf(i).toFixed(2), y: +yOf(d.y).toFixed(2), i }));
  const cid = "pbclip" + (++chartClipId);

  let svg = `<svg width="${W}" height="${H}" style="display:block">
    <defs><clipPath id="${cid}"><rect x="${left}" y="${top - 6}" width="${plotW}" height="${plotH + 12}"/></clipPath></defs>`;

  /* horizontal grid */
  for (const t of ticks) svg += `<line x1="${left}" x2="${right}" y1="${yOf(t).toFixed(2)}" y2="${yOf(t).toFixed(2)}" stroke="${cGrid}" stroke-dasharray="3 5"/>`;
  /* One vertical guide per session slot, thinned out when they crowd, drawn
     across the whole window rather than only where the data is, so the space
     in front of your last session reads as the same graph continuing and not
     as the graph having run out. The slots are counted off the data, so they
     hold still while you drag instead of shuffling under your finger. */
  const g0 = Math.ceil(lo) - 1, g1 = Math.floor(hi) + 1;
  const vSkip = Math.max(1, Math.ceil((span + 1) / 12));
  for (let i = g0; i <= g1; i++) {
    if (((i % vSkip) + vSkip) % vSkip !== 0) continue;
    const x = xOf(i);
    if (x < left - 1 || x > right + 1) continue;
    svg += `<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${top}" y2="${bottom}" stroke="${cGrid}" stroke-dasharray="3 5"/>`;
  }
  /* axes + labels, and only real sessions have a date to write under them */
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="${cAxis}"/>`;
  for (const t of ticks) svg += `<text x="${left - 6}" y="${(yOf(t) + 3.5).toFixed(2)}" fill="${cTick}" font-size="10.5" text-anchor="end">${t}</text>`;
  const lSkip = Math.max(1, Math.ceil((span + 1) / 7));
  for (let i = Math.max(0, g0); i <= Math.min(n - 1, g1); i++) {
    if (i % lSkip !== 0) continue;
    const x = xOf(i);
    if (x < left + 4 || x > right - 4) continue;
    svg += `<text x="${x.toFixed(2)}" y="${bottom + 14}" fill="${cTick}" font-size="10.5" text-anchor="middle">${esc(data[i].x)}</text>`;
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
  const zoomTag = ui.chartView[scope] && shown.length < n
    ? `<div style="position:absolute;top:4px;right:8px;font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--gold);background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:2px 6px">
        ${T("chart.showing", { n: shown.length, total: n })}
      </div>`
    : "";
  wrap.innerHTML = svg + zoomTag;

  /* ── gestures ─────────────────────────────────────────────────────── */
  const endGesture = (id) => {
    chartPointers.delete(id);
    if (chartPointers.size === 0) chartGesture = null;
    else if (chartGesture) chartGesture.moved = true;   // no tap on the way out of a pinch
  };

  /* A pinch is a real two-axis zoom and a drag moves both ways, but only
     where the page isn't already using the vertical: the card in the tab
     has to stay scrollable under a thumb, so there it's left/right only.
     Fullscreen is the graph and nothing else, so there it's both. */
  const freeY = wrap.dataset.chartfull === "1";

  wrap.onpointerdown = (e) => {
    chartPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: Date.now() });
    try { wrap.setPointerCapture(e.pointerId); } catch { /* mouse on some builds */ }
    if (chartPointers.size >= 2) {
      const [a, b] = [...chartPointers.values()];
      const r = wrap.getBoundingClientRect();
      /* into the chart's own coordinate space, which is laid out unscaled */
      const mx = ((a.x + b.x) / 2 - r.left) / vpScale, my = ((a.y + b.y) / 2 - r.top) / vpScale;
      chartGesture = {
        mode: "pinch", moved: true,
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        win: chartWindow(n, scope),
        focus: Math.max(lo, Math.min(hi, idxAt(mx))),
        y: { lo: yMin, hi: yMax },
        focusY: Math.max(yMin, Math.min(yMax, valAt(my))),
      };
    } else {
      chartGesture = { mode: "pan", moved: false };
    }
  };

  wrap.onpointermove = (e) => {
    const p = chartPointers.get(e.pointerId);
    if (!p || !chartGesture) return;
    const prevX = p.x, prevY = p.y;
    p.x = e.clientX; p.y = e.clientY;

    if (chartGesture.mode === "pinch" && chartPointers.size >= 2) {
      const [a, b] = [...chartPointers.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const g = chartGesture;
      const span0 = g.win.hi - g.win.lo;
      /* replayed from where the pinch started rather than accumulated frame
         by frame, so pinching out and back in lands where it began */
      ui.chartView[scope] = { lo: g.win.lo, hi: g.win.hi, yLo: g.y.lo, yHi: g.y.hi };
      chartZoom(dist / g.dist, g.focus, scope, g.focusY, g.y);
      return;
    }
    if (Math.abs(p.x - p.x0) > CHART_TAP_SLOP || Math.abs(p.y - p.y0) > CHART_TAP_SLOP) chartGesture.moved = true;
    if (!chartGesture.moved) return;
    const dy = freeY ? (((p.y - prevY) / vpScale) / plotH) * (yMax - yMin) : 0;
    chartPan(-(((p.x - prevX) / vpScale) / plotW) * span, dy, scope);
  };

  wrap.onpointerup = (e) => {
    const p = chartPointers.get(e.pointerId);
    const g = chartGesture;
    /* a tap, not a drag: open whatever dot is nearest, or clear the
       selection when the tap lands nowhere near the line */
    if (p && g && g.mode === "pan" && !g.moved) {
      const r = wrap.getBoundingClientRect();
      const mx = (e.clientX - r.left) / vpScale, my = (e.clientY - r.top) / vpScale;
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
    chartZoom(e.deltaY < 0 ? 1.3 : 1 / 1.3, Math.max(lo, Math.min(hi, idxAt((e.clientX - r.left) / vpScale))), scope);
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
    const mx = (e.clientX - r.left) / vpScale;
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
window.addEventListener("orientationchange", () => requestAnimationFrame(drawCharts));

/* ═══════════════════════════ EVENTS ════════════════════════════════ */

const newBodyRow = () => ({ id: uid(), date: todayStr(), weight: "", waist: "", chest: "", arm: "", thigh: "", glutes: "", notes: "" });

/* ── DRAFT DAYS ───────────────────────────────────────────────────────
   Backing out of a half-built workout used to throw it away, which made
   leaving the window to go add an exercise to the Library a gamble. Now a
   day with anything in it is parked in state.dayDrafts instead: it shows
   up at the top of the log, waits as long as you like, and reopens exactly
   as you left it. A draft is NOT the log: nothing in it counts toward
   sets, PRs, volume, weeks or the graphs until you actually save the day.

   (Distinct from state.drafts, which is the crash/lock snapshot of whatever
   form is open right now. This is a deliberate park, that is a safety net.) */

function stashDayDraft(draft) {
  if (!draft || draft.editing || draft.planning || !draft.entries.length) return;
  const row = {
    id: draft.draftId || uid(),
    date: draft.date,
    entries: clone(draft.entries),
    /* which plan this day is answering, so picking the day back up still
       knows what to consume when it is finally saved. The targets
       themselves ride on the entries and were never in danger. */
    planIds: draft.planIds || [],
    planName: draft.planName || "",
    savedAt: Date.now(),
  };
  const rest = (state.dayDrafts || []).filter((d) => d.id !== row.id);
  patch({ dayDrafts: [...rest, row] });
}

/* leaving the workout window: park it, don't bin it */
function closeWorksheet() {
  const draft = ui.workoutSheet;
  ui.workoutSheet = null; ui.picking = false; ui.entryForm = null; ui.setForm = null;
  /* Backing out of a PLAN keeps it. There is nothing to protect anyone
     from: a plan is not the log, and a half-written plan for Wednesday is
     still a plan for Wednesday. Emptying it out deletes it, same as a
     parked day. */
  if (draft && draft.planning) { commitPlan(draft); return; }
  if (draft && !draft.editing && draft.entries.length) stashDayDraft(draft);
  else if (draft && draft.draftId) dropDayDraft(draft.draftId);   // emptied it out
  else render();
}

function dropDayDraft(id) {
  patch({ dayDrafts: (state.dayDrafts || []).filter((d) => d.id !== id) });
}

/* Stepping the period with the arrows scrolls the calendar to match, so
   the highlighted band never wanders off the month you're looking at. */
function volStep(dir) {
  if (rollingWeeks()) ui.volAnchor = addDays(ui.volAnchor || todayStr(), dir * 7);
  else ui.volumeWeek = Math.max(1, ui.volumeWeek + dir);
  const r = rollingWeeks()
    ? windowEnding(ui.volAnchor)
    : weekRange(ui.volumeWeek, state.settings.startDate);
  if (monthOf(r.from) !== ui.calMonth && monthOf(r.to) !== ui.calMonth) ui.calMonth = monthOf(r.from);
  render();
}

/* ── A PLAN IS SAVED, A DAY IS LOGGED ─────────────────────────────────
   Same window, same button, two different destinations, and the whole
   feature turns on the difference: this one writes to state.plans, which
   nothing counts, and the one below writes to state.log, which everything
   counts.

   A plan keeps its blank entries. "Wednesday: these six lifts, weights on
   the day" is a finished plan, and dropping the ones without numbers, the
   way commitWorkout drops them, would delete most of it. And emptying a
   plan out is how you delete one, exactly as it is for a parked day. */
function commitPlan(draft) {
  const id = draft.planId || uid();
  const entries = clone(draft.entries) || [];
  ui.workoutSheet = null;
  /* land on the day you just planned, on the tab that keeps it */
  ui.tab = "log"; ui.logSeg = "calendar";
  ui.calDay = draft.date;
  ui.calMonth = monthOf(draft.date);
  ui.volAnchor = draft.date;
  ui.volumeWeek = Math.max(1, weekOf(draft.date, state.settings.startDate));
  const prev = (state.plans || []).find((p) => p.id === id);
  const rest = (state.plans || []).filter((p) => p.id !== id);
  if (!entries.length) { patch({ plans: rest }); return; }
  patch({ plans: plansSorted([...rest, {
    id, date: draft.date, name: (draft.name || "").trim(),
    entries, createdAt: draft.createdAt || Date.now(),
    /* editing what is left of a part-done plan must not forget the day the
       rest of it is owed to, see prunePlans */
    ...(prev && prev.startedOn ? { startedOn: prev.startedOn } : {}),
  }]) });
}

/* Turn one planned exercise into the blank entry that will log it. The
   numbers do not come across, they become a TARGET on the side, which is
   the only thing standing between "I planned 8 × 100" and a log that
   says you lifted it. */
function planEntryToDraftEntry(pe, planId, ix) {
  const e = newEntry(pe.exercise, pe.muscle, pe.kind);
  e.unit = pe.unit || state.settings.units;
  if (pe.notes) e.notes = pe.notes;
  const t = planTargetOf(pe);
  if (t) e.plan = t;
  /* Which planned lift this entry IS, kept only while it is a draft. Saving a
     day half-way through has to tell a planned lift you have not reached from
     one you never planned, and `plan` alone cannot say: a plan that named the
     exercise and left the weights for the day hands over no target at all.
     Taken back off on the way into the log (stripPlanLink), so nothing outside
     the workout sheet ever sees it. */
  if (planId != null) { e.planFrom = planId; e.planIx = ix; }
  return e;
}

/* the same link, removed before a draft entry becomes a log row */
const stripPlanLink = (e) => {
  if (e.planFrom === undefined && e.planIx === undefined) return e;
  const { planFrom, planIx, ...rest } = e;
  return rest;
};

/* ── THE PAYOFF ───────────────────────────────────────────────────────
   Saving a day you planned is the one moment the app has something worth
   saying, so it says it once, here, and then never again unprompted. It
   counts planned sets, not lifts, because that is the unit the plan was
   written in, and it counts them against the WHOLE plan, including the
   exercises that never got filled in and are about to be dropped from the
   log, so skipping the last lift cannot quietly improve the score. */
function renderPlanResult() {
  const r = ui.planResult;
  if (!r) return "";
  const s = r.sum;
  const all = s.hit >= s.total;
  const pct = s.total ? Math.round((s.hit / s.total) * 100) : 0;

  const lifts = (r.lifts || []).map((l) => `<div style="display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--border-soft)">
      <span style="width:8px;height:8px;border-radius:4px;background:${colorFor(l.muscle)};flex-shrink:0"></span>
      <span style="flex:1;min-width:0;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabel(l.exercise))}</span>
      <span class="pb-num" style="font-size:13px;font-weight:700;color:${l.res.beat ? "var(--gold)" : l.res.hit >= l.res.total ? "var(--green)" : "var(--muted)"};flex-shrink:0">
        ${l.res.hit}/${l.res.total}${l.res.beat ? " ↑" : ""}
      </span>
    </div>`).join("");

  return sheet(T("plan.resultTitle"), "planResult", `
    <div style="text-align:center;padding:4px 0 14px">
      <div class="pb-num" style="font-size:44px;font-weight:700;line-height:1;color:${all ? "var(--gold)" : "var(--text)"}">${s.hit}<span style="font-size:22px;color:var(--muted)">/${s.total}</span></div>
      <div style="font-size:13px;color:var(--muted);margin-top:5px">${T("plan.resultSets")}</div>
      <div style="font-size:13.5px;color:${all ? "var(--gold)" : "var(--muted)"};margin-top:9px;line-height:1.5;font-weight:600">
        ${all ? (s.beat ? T("plan.resultAllBeat", { n: s.beat }) : T("plan.resultAll"))
          : pct >= 50 ? T("plan.resultMost", { n: s.total - s.hit })
          : T("plan.resultSome")}
      </div>
      ${s.bonus ? `<div style="font-size:12px;color:var(--muted);margin-top:5px">${T("plan.resultBonus", { n: s.bonus })}</div>` : ""}
    </div>
    ${lifts ? `<div class="pb-card2" style="padding:2px 13px 0;margin-bottom:14px">${lifts}</div>` : ""}
    <div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin-bottom:14px">${T("plan.resultFoot")}</div>
    <button data-action="plan-result-close" class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15px">
      ${icon("check", 17)} ${T("common.done")}
    </button>
  `, 110);
}

/* ── SAVING A DAY IS NOT SAYING YOU ARE DONE WITH IT ──────────────────
   The plan a day was answering used to be deleted whole the moment the day
   was saved, on the assumption that saving is the end of the session. It is
   not. People save after the first lift and carry on, and doing that used
   to cost them the rest of the plan twice over: the untouched entries were
   dropped as blanks (rightly, they hold no numbers) and the plan that would
   have put them back was gone with them.

   So a plan is consumed LIFT BY LIFT. What you filled in is done with; what
   is still sitting blank in the sheet has not happened yet and stays on the
   plan, ready to be picked up, and reopening the day hydrates it straight back
   in (see edit-day). A lift you DELETED from the sheet is gone from both,
   because taking it out is the decision not to do it. Only when nothing is
   left over does the plan disappear. */
function prunePlans(draft) {
  const planIds = draft.planIds || [];
  if (!planIds.length) return { plans: state.plans, open: 0 };
  let open = 0;
  const next = [];
  for (const p of state.plans || []) {
    if (!planIds.includes(p.id)) { next.push(p); continue; }
    const stillOpen = new Set(draft.entries
      .filter((e) => e.planFrom === p.id && !entryHasData(e))
      .map((e) => e.planIx));
    const left = (p.entries || []).filter((_, i) => stillOpen.has(i));
    if (!left.length) continue;                     // this plan has had its day
    open += left.length;
    /* the day the work actually happened on, which is what lets that day pick
       the remainder back up, and what keeps an untouched plan out of an
       unrelated edit of some other day it happens to sit on */
    next.push({ ...p, entries: left, startedOn: draft.date });
  }
  return { plans: next, open };
}

/* the card shown once when a plan is finally spent, read off the WHOLE
   draft, blanks included, so skipping the last lift cannot quietly improve
   the score */
const planResultOf = (draft, sum) => ({
  date: draft.date, name: draft.planName || "", sum,
  lifts: draft.entries.filter((e) => e.plan).map((e) => ({
    exercise: e.exercise,
    muscle: groupOfEntry(e),
    res: entryPlanResult(e),
  })),
});

function commitWorkout(draft) {
  if (draft && draft.planning) return commitPlan(draft);
  /* only real, filled-in entries get logged, and blank preset placeholders are
     dropped so they never pollute the history with empty rows. A blank one
     that came from a plan is not lost with them: prunePlans leaves it on the
     plan, where it was already waiting. */
  /* Blanks dropping out can leave a superset link on what is now the first
     lift of the day, pointing at nothing. Marks on a first item are ignored
     everywhere they are read, so this only tidies what gets written down. */
  const filled = draft.entries.filter(entryHasData)
    .map((e, i) => syncEntry(stripPlanLink(i === 0 && e.superWith ? { ...e, superWith: false } : e)));
  /* Nothing filled in is nothing to save, unless this is a day already on
     record that has just been emptied, which is its owner saying it did not
     happen after all. That has to be answerable: otherwise the only way back
     out of a set you unticked is deleting the whole day. */
  if (!filled.length) {
    if (!draft.editing) return;               // a new day with nothing in it
    if (!confirm(T("wo.confirmEmpty"))) return;
  }
  const planIds = draft.planIds || [];
  const { plans, open } = prunePlans(draft);
  /* Scoring a session you are still in the middle of would be the app calling
     a day finished that its user hasn't, so the result waits for the plan to
     actually run out. */
  const sum = planIds.length && !open ? dayPlanResult(draft.entries) : null;
  if (draft.editing) {
    /* editing a logged day: replace that day's old rows with the current set,
       keeping each surviving row's original createdAt so ordering is stable. */
    const originalIds = new Set(draft.originalIds || []);
    const now = Date.now();
    const kept = state.log.filter((e) => !originalIds.has(e.id));
    /* Restamped in sheet order rather than kept as they were. createdAt is
       never shown; it exists only to order a day's rows, and the order the
       sheet is in is the order its owner just put it in, since an exercise added
       back into an old day would otherwise be stuck at the bottom forever. */
    const stamped = filled.map((e, i) => ({ ...e, date: draft.date, createdAt: now + i }));
    ui.workoutSheet = null;
    if (sum) ui.planResult = planResultOf(draft, sum);
    patch({ log: [...kept, ...stamped], plans });
    return;
  }
  const stamped = filled.map((e, i) => ({ ...e, date: draft.date, createdAt: Date.now() + i }));
  const draftId = draft.draftId;
  ui.workoutSheet = null;
  if (sum) ui.planResult = planResultOf(draft, sum);
  /* a draft that just became a real day stops being a draft. Whatever is left
     of the plan it was answering rides on in state.plans; the targets it has
     already handed out are inside the entries now. */
  patch({
    log: [...state.log, ...stamped],
    dayDrafts: draftId ? (state.dayDrafts || []).filter((d) => d.id !== draftId) : state.dayDrafts,
    plans,
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
  "save-profile": () => {
    const f = ui.profileDraft;
    ui.showProfile = false; ui.profileDraft = null;
    applyTheme(f.theme);
    /* the two modes read different pointers, so both are reset to "now",
       otherwise switching lands you on a period you never chose */
    ui.volumeWeek = weekOf(todayStr(), f.startDate);
    ui.volAnchor = todayStr();
    patch({ settings: f });
  },
  "profile-units": (el) => { ui.profileDraft.units = el.dataset.u; render(); },
  "profile-theme": (el) => { ui.profileDraft.theme = el.dataset.t; applyTheme(el.dataset.t); render(); },
  "profile-weekmode": (el) => { ui.profileDraft.weekMode = el.dataset.m; render(); },
  "export-data": () => exportBackup(),
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
    /* animate the existing card in place, since a full render() would rebuild the
       whole page and cause the flicker the user reported. */
    const card = el.closest(".pb-acc");
    if (card) setAccordion(card, ui.accordions[id]);
    else render();
  },
  "log-seg": (el) => {
    ui.logSeg = el.dataset.id;
    /* opening the tab always lands on now, whichever way "now" is counted */
    if (ui.logSeg === "calendar") {
      ui.volumeWeek = weekOf(todayStr(), state.settings.startDate);
      ui.volAnchor = todayStr();
      ui.calDay = todayStr();
      ui.calMonth = monthOf(todayStr());
    }
    render();
  },
  /* One period back or forward. In rolling mode that is a whole seven-day
     window, not a single day, since stepping a day at a time would make the
     arrows useless for the comparison underneath, and a single day is what
     tapping the calendar is for. */
  "vol-prev": () => { volStep(-1); },
  "vol-next": () => { volStep(1); },

  /* ── planning ─────────────────────────────────────────────────────
     Every one of these opens or closes the same workout window; what
     differs is the flag it carries and therefore where the numbers end
     up. There is no plan editor, on purpose, see renderWorkoutSheet. */

  /* start a plan for a day, or reopen the one already on it */
  "plan-day": (el) => {
    const day = el.dataset.d || todayStr();
    const existing = planOn(state.plans, day);
    ui.tab = "log"; ui.logSeg = "calendar";
    ui.calDay = day; ui.calMonth = monthOf(day);
    ui.workoutSheet = existing
      ? { date: existing.date, name: existing.name || "", entries: clone(existing.entries),
          planning: true, planId: existing.id, createdAt: existing.createdAt }
      : { date: day, name: "", entries: [], planning: true };
    ui.picking = false; ui.entryForm = null; ui.setForm = null;
    render();
  },
  "plan-edit": (el) => {
    const p = (state.plans || []).find((x) => x.id === el.dataset.id);
    if (!p) return;
    ui.tab = "log"; ui.logSeg = "calendar";
    ui.calDay = p.date; ui.calMonth = monthOf(p.date);
    ui.workoutSheet = { date: p.date, name: p.name || "", entries: clone(p.entries),
      planning: true, planId: p.id, createdAt: p.createdAt };
    ui.picking = false; ui.entryForm = null; ui.setForm = null;
    render();
  },
  "plan-delete": (el) => {
    if (!confirm(T("plan.confirmDelete"))) return;
    const id = el.dataset.id;
    if (ui.workoutSheet && ui.workoutSheet.planId === id) {
      ui.workoutSheet = null; ui.picking = false; ui.entryForm = null; ui.setForm = null;
    }
    patch({ plans: (state.plans || []).filter((p) => p.id !== id) });
  },
  /* jump to the day a plan is on, without opening anything */
  "plan-open": (el) => {
    const d = el.dataset.d;
    ui.tab = "log"; ui.logSeg = "calendar";
    ui.calDay = d; ui.calMonth = monthOf(d);
    ui.volAnchor = d; ui.volumeWeek = Math.max(1, weekOf(d, state.settings.startDate));
    render();
  },
  /* log a day that is not today, from the calendar. The long way round
     used to be New Workout and then correcting the date */
  "log-day": (el) => {
    const d = el.dataset.d;
    const parked = (state.dayDrafts || []).find((x) => x.date === d);
    ui.workoutSheet = parked
      ? { date: parked.date, entries: clone(parked.entries), draftId: parked.id, planIds: parked.planIds || [], planName: parked.planName || "" }
      : { date: d, entries: [] };
    ui.picking = false; ui.entryForm = null; ui.setForm = null;
    render();
  },

  /* ── DOING the plan ───────────────────────────────────────────────
     The plan's numbers do NOT come across as logged sets. Each entry
     arrives blank with the target on the side, which is what makes the
     difference between "I planned this" and "I lifted this" survive all
     the way into the history. */
  "plan-start": (el) => {
    const p = (state.plans || []).find((x) => x.id === el.dataset.id);
    if (!p) return;
    const today = todayStr();
    /* there is only ever one workout for today, the same rule
       actions["log-exercise"] follows, for the same reason */
    if (!ui.workoutSheet || ui.workoutSheet.planning) {
      const parked = (state.dayDrafts || []).find((d) => d.date === today);
      ui.workoutSheet = parked
        ? { date: parked.date, entries: clone(parked.entries), draftId: parked.id, planIds: parked.planIds || [], planName: parked.planName || "" }
        : { date: today, entries: [] };
    }
    const w = ui.workoutSheet;
    /* A day can answer more than one plan ("Push A" and "Arms" were
       planned separately and you are doing both) so the sheet carries a
       LIST of the plans it is consuming, and every one of them is cleared
       when the day is saved. Leaving the second one behind would have it
       showing as missed forever. Starting the same plan twice must still
       not deal its exercises out twice. */
    w.planIds = w.planIds || [];
    if (!w.planIds.includes(p.id)) {
      w.entries = [...w.entries, ...(p.entries || []).map((pe, i) => planEntryToDraftEntry(pe, p.id, i))];
      w.planIds.push(p.id);
      if (!w.planName) w.planName = p.name || "";
    }
    ui.tab = "log"; ui.logSeg = "history";
    ui.picking = false; ui.entryForm = null; ui.setForm = null;
    render();
  },
  /* the ✓ on a ghost row: log this set exactly as it was planned */
  "plan-tick": (el) => {
    const f = ui.entryForm && ui.entryForm.f;
    const t = f && f.plan && f.plan.sets && f.plan.sets[+el.dataset.i];
    if (!t) return;
    ui.entryForm.f = syncEntry({ ...f, setList: [...(f.setList || []), newSet(t.reps, t.weight, "")] });
    render();
  },
  /* the ghost row itself: open the editor with the target loaded, because
     the honest answer is usually "that, but one rep short" */
  "plan-load-set": (el) => {
    const f = ui.entryForm && ui.entryForm.f;
    const t = f && f.plan && f.plan.sets && f.plan.sets[+el.dataset.i];
    if (!t) return;
    ui.setForm = { s: newSet(t.reps, t.weight, ""), isNew: true, index: (f.setList || []).length };
    render();
  },
  "plan-fill-cardio": () => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f || !f.plan || f.plan.sets) return;
    ui.entryForm.f = { ...f, minutes: f.plan.minutes, intensity: f.plan.intensity };
    render();
  },
  "plan-result-close": () => { ui.planResult = null; render(); },

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
    /* the ordinary tap now means two things at once, which is the whole
       point of the day card: it still picks the period the numbers below
       are read over, and it opens what is actually on that day */
    ui.calDay = day;
    /* in rolling mode the day you tapped becomes the LAST of the seven */
    ui.volAnchor = day;
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

  /* ── strength standards ───────────────────────────────────────────────
     Every one of these throws the last answer away, because each of them
     changes one of the three things the answer was worked out from. A
     verdict that outlives its inputs is the one way a table like this can
     lie, and the card names its inputs precisely so it can't. */
  "std-sex": (el) => {
    const sex = el.dataset.id;
    stdForm().sex = sex;
    ui.stdResult = null;
    /* answered where it is used, and remembered, see the note on
       settings.sex in defaultState() for why it isn't in Profile */
    patch({ settings: { ...state.settings, sex } });
  },
  "std-pick-open": () => { ui.stdQ = ""; ui.stdPick = true; render(); },
  "std-pick-close": () => { ui.stdPick = false; render(); },
  "std-pick": (el) => {
    const f = stdForm();
    f.slug = el.dataset.slug;
    /* offered, never imposed: the field is a plain input over the top of it */
    const best = stdBestFromLog(f.slug, state.log, state.library);
    f.lift = best == null ? "" : String(best);
    f.liftFromLog = best != null;
    ui.stdResult = null;
    ui.stdPick = false;
    render();
  },
  "std-check": () => {
    const res = stdCheck(stdForm(), state.settings.units);
    if (!res) return;                    // the button is disabled, but never trust that alone
    ui.stdResult = res;
    render();
  },
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
       is what the two tables are built from, see renderCalc */
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
    /* show the label, remember the stored name, see group-save */
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
       untouched (to change only its colour) must not count as a rename,
       otherwise "Chest" would freeze into whatever language you happened to
       be in. Typing something else is a real rename, and the group becomes
       the user's: groupLabel stops translating it, because the name is no
       longer the one we shipped.

       The KEY still rides through, because it is identity rather than a
       claim about the name: it is what still finds the cardio group after
       someone has called it Conditioning, and cardioGroup() is what decides
       whether a lift is logged in minutes. Dropping it on a rename is what
       made renaming that one group silently break logging in it. */
    const orig = f.orig;
    const untouched = !!orig && typed === groupLabel(orig);
    const name = untouched ? orig : typed;
    const keep = orig ? (groupList().find((g) => g.name === orig) || {}).key : undefined;

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
      /* A rename has to carry EVERYTHING that points at the old name, or the
         exercises in it quietly fall out of their own group. Same sweep as
         the one in actions["exwin-save"], and the same standing rule: a new
         place that files something under a group name belongs in this list.

         The log's `muscle` is only a fallback (muscleOf reads the library
         row first), which is why a miss here stayed invisible for so long,
         and exactly why it is worth keeping true: the fallback is what
         answers for an exercise that is no longer in the library at all.

         No sweep of the open workout sheet or entry form, unlike the
         exercise version: the group manager opens from the Library tab
         only, so there is nothing of the sort on screen to have gone
         stale. If it ever opens from somewhere else, they go here too. */
      p.groups = groups.map((g) => (g.name === f.orig
        ? (keep ? { name, key: keep, color: f.color } : { name, color: f.color })
        : g));
      if (name !== f.orig) {
        const swap = (x) => (x.muscle === f.orig ? { ...x, muscle: name } : x);
        p.library = state.library.map(swap);
        p.log = state.log.map(swap);
        p.plans = (state.plans || []).map((pl) => ({ ...pl, entries: (pl.entries || []).map(swap) }));
        p.dayDrafts = (state.dayDrafts || []).map((d) => ({ ...d, entries: (d.entries || []).map(swap) }));
        p.presets = (state.presets || []).map((pr) => ({ ...pr, exercises: (pr.exercises || []).map(swap) }));
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
    /* quick-add was mid-question ("which muscle does it train?"), answer it */
    if (then === "quickadd" && ui.pickerQuick) {
      const el = document.createElement("button");
      el.dataset.g = name;
      actions["quick-add-muscle"](el);
    }
  },
  /* Deleting a group never takes exercises down with it, and whatever is still
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
      /* Rebuilt from the group RECORDS, not from a list of names. Mapping
         names back into fresh {name, color} objects threw away every
         surviving group's `key`, so deleting one group you invented
         un-translated all seven of the shipped ones and lost track of which
         was cardio. Only the deleted group should change. */
      groups: libraryGroups(state.library).filter((g) => g !== name).map((g) => {
        const rec = groupList().find((x) => x.name === g);
        return rec ? { ...rec } : { name: g, color: colorFor(g) };
      }),
    };
    /* Everything filed under it is tipped into the bucket, and the sweep is
       unconditional: `used` counts LIBRARY rows, and a logged entry can
       still name a group after its exercise has left the library. Same list
       as the rename above, and the same rule about keeping it complete. */
    const swap = (x) => (x.muscle === name ? { ...x, muscle: UNCATEGORIZED } : x);
    p.library = state.library.map(swap);
    p.log = state.log.map(swap);
    p.plans = (state.plans || []).map((pl) => ({ ...pl, entries: (pl.entries || []).map(swap) }));
    p.dayDrafts = (state.dayDrafts || []).map((d) => ({ ...d, entries: (d.entries || []).map(swap) }));
    p.presets = (state.presets || []).map((pr) => ({ ...pr, exercises: (pr.exercises || []).map(swap) }));
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
  /* open the detail window (read-only). Every "info" button lands here.
     Exercises are keyed by name across the app, so we look up by name. */
  "open-exercise-window": (el) => {
    ui.exWin = { name: el.dataset.name };
    /* a different lift is a different graph, so its zoom and its open dot
       start clean rather than inheriting the last exercise's, and its
       history list opens folded no matter how far the last one was opened */
    ui.chartView.ex = null; ui.chartSel.ex = null; ui.exHistAll = false;
    ui.exWinEdit = false; ui.exWinDraft = null; render();
  },
  "ex-hist-all": () => { ui.exHistAll = !ui.exHistAll; render(); },
  /* ── out of a lift's history and into the day it happened ───────────
     A session in that list is a DATE, and what anyone wants from a date is
     the day: the rest of what was trained, the notes, and the chance to
     fix a number. That is the Log tab's history, so this goes there and
     flashLogDay puts the card on screen.

     A workout window in the way is closed the way its own back arrow
     closes it, which parks the day rather than losing it. The two
     alternatives are worse: leaving the sheet up makes the jump invisible,
     and doing nothing makes a row that looks tappable and isn't. The
     parked day lands at the top of the very list this arrives on, which is
     why the hint under the list says so before it is tapped.

     That back-out picks its own landing spot (a plan saved on the way out
     goes to the calendar), so the destination is set AFTER it and not
     before, or the jump would be overruled by the thing it was waiting
     on. */
  "open-log-day": (el) => {
    const date = el.dataset.date;
    ui.exWin = null; ui.exWinEdit = false; ui.exWinDraft = null;
    if (ui.workoutSheet) closeWorksheet();
    ui.tab = "log";
    resetTransient();
    ui.logSeg = "history";
    ui.logJump = date;
    render();
  },
  /* ── straight from the library into the set list ──────────────────
     The long way round to logging one lift is New Workout → Add exercise
     → find it again in the picker, which is three screens to reach a page
     you were already looking at. This is the short way: it opens today's
     workout behind you and drops you in this exercise's entry form.

     "Today's workout" is whichever one is already going: the window you
     have open, or the day you parked earlier and never saved, so a
     shortcut can never split one day in two. Nothing is logged until the
     day itself is saved, exactly as if you had walked there.          */
  "log-exercise": (el) => {
    const name = el.dataset.name;
    const ex = state.library.find((x) => x.name === name);
    if (!ex) return;
    if (!ui.workoutSheet) {
      const today = todayStr();
      const parked = (state.dayDrafts || []).find((d) => d.date === today);
      ui.workoutSheet = parked
        ? { date: parked.date, entries: clone(parked.entries), draftId: parked.id }
        : { date: today, entries: [] };
    }
    ui.exWin = null; ui.exWinEdit = false; ui.exWinDraft = null;
    ui.picking = false; ui.pickerQ = ""; ui.pickerQuick = null;
    ui.entryForm = { f: newEntry(ex.name, ex.muscle, isCardioEx(ex) ? "cardio" : "strength"), isDraft: true };
    ui.setForm = null;
    render();
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
  /* ── A RENAME HAS TO TAKE THE LIFT'S WHOLE PAST WITH IT ─────────────
     An exercise's NAME is its identity: a logged entry points at it, a
     plan and a preset name it, a goal is filed under it. Writing a new
     name into the library alone left every one of them pointing at a lift
     that no longer existed, which is worse than doing nothing: the session
     still showed up in the day, and opening it found nothing in the
     library to edit. Same move as actions["group-save"], same reason, and
     the same rule holds for anything added later that stores a name.

     Two guards around it. The field is prefilled with the LABEL, so a
     built-in left untouched in a translated UI must not count as a rename,
     or "Bench Press (Barbell)" would freeze into whatever language you
     happened to be reading in. And a name already in the library is
     refused rather than merged: two rows under one name is exactly the
     desync this is here to fix, arrived at from the other end. */
  "exwin-save": () => {
    const f = ui.exWinDraft;
    if (!f || !(f.name.trim() && f.muscle.trim())) return;
    const muscle = f.muscle.trim();
    const orig = state.library.find((x) => x.id === f.id);
    const typed = f.name.trim();
    const name = orig && typed === exLabelOf(orig) ? orig.name : typed;
    const was = orig ? orig.name : null;

    if (state.library.some((x) => x.id !== f.id && x.name.toLowerCase() === name.toLowerCase())) {
      alert(T("ex.clash", { name: typed }));
      return;
    }

    /* compound vs isolation was noise nobody filed anything under, so the
       picker is gone; the only thing `type` still decides is whether the
       lift is logged in minutes, and the muscle group already knows that. */
    const ex = { ...f, name, muscle, type: cardioType(muscle) };
    const p = { library: orig ? state.library.map((x) => (x.id === ex.id ? ex : x)) : [...state.library, ex] };

    if (was && was !== name) {
      const swap = (e) => (e.exercise === was ? { ...e, exercise: name } : e);
      p.log = state.log.map(swap);
      p.plans = (state.plans || []).map((pl) => ({ ...pl, entries: (pl.entries || []).map(swap) }));
      p.dayDrafts = (state.dayDrafts || []).map((d) => ({ ...d, entries: (d.entries || []).map(swap) }));
      p.presets = (state.presets || []).map((pr) => ({ ...pr, exercises: (pr.exercises || []).map(swap) }));
      if (state.goals && state.goals[was] != null) {
        const g = { ...state.goals };
        g[name] = g[was]; delete g[was];
        p.goals = g;
      }
      /* whatever is open right now points at it too, and an unsaved day is
         not on record yet for the sweep above to have reached */
      if (ui.workoutSheet) ui.workoutSheet.entries = (ui.workoutSheet.entries || []).map(swap);
      if (ui.entryForm) ui.entryForm.f = swap(ui.entryForm.f);
      if (ui.progressSelected === was) ui.progressSelected = name;
    }

    ui.exWin = { name }; ui.exWinEdit = false; ui.exWinDraft = null;
    patch(p);
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
    ui.workoutSheet = { date: d.date, entries: clone(d.entries), draftId: d.id, planIds: d.planIds || [], planName: d.planName || "" };
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
    /* A day saved half-way through still has the rest of its plan waiting on
       it. The lifts you never reached are hydrated back in, blank, with
       their targets, exactly as plan-start deals them, so "save now, carry
       on after" is one flow instead of a plan you have to start again.
       Matched on startedOn, not on the plan's own date: pressing Start on
       tomorrow's plan logs it today, and today is where the rest of it is
       owed. */
    const carry = (state.plans || []).filter((pl) => pl.startedOn === date);
    const ghosts = [];
    for (const pl of carry)
      for (let i = 0; i < (pl.entries || []).length; i++)
        ghosts.push(planEntryToDraftEntry(pl.entries[i], pl.id, i));
    ui.workoutSheet = {
      date, entries: [...entries, ...ghosts],
      editing: true, originalIds: entries.map((e) => e.id),
      planIds: carry.map((pl) => pl.id),
      planName: (carry.find((pl) => pl.name) || {}).name || "",
    };
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
  "library-seg": (el) => { ui.librarySeg = el.dataset.id; ui.presetOrder = false; render(); },
  "preset-reorder": () => { ui.presetOrder = !ui.presetOrder; render(); },
  "pinned-reorder": () => { ui.pinnedOrder = !ui.pinnedOrder; render(); },
  "timer-reorder": () => { ui.timerOrder = !ui.timerOrder; render(); },
  "entry-reorder": () => { ui.entryOrder = !ui.entryOrder; render(); },
  /* keyed by the entry's id rather than toggled on and off, so the mode
     cannot outlive the lift it was turned on for, see ui.setOrder */
  "set-reorder": () => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f) return;
    ui.setOrder = ui.setOrder === f.id ? null : f.id;
    render();
  },
  /* leaving reorder mode is also the moment the search box comes back, so
     drop whatever was typed before it was hidden rather than reapplying a
     filter the user last saw three taps ago */
  "lib-reorder": () => { ui.libOrder = !ui.libOrder; if (ui.libOrder) ui.libraryQ = ""; render(); },
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
      muscle: groupOfEntry(e),
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
  /* The name is the only thing that has to be answered here. "Skip for now"
     sends the same el with the bucket as its group, so a lift invented in the
     middle of a set can be logged now and filed later. It lands in
     Uncategorized still wearing its NEW flag, which is the reminder. */
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
       throws real work away, and in Detailed mode that can be a whole set list */
    const orphan = isDraft && entryHasData(f) && !ui.workoutSheet.entries.some((x) => x.id === f.id);
    if (orphan && !confirm(T("entry.confirmDiscard"))) return;
    ui.entryForm = null; ui.setForm = null; render();
  },

  /* ── set suggestions ──────────────────────────────────────────────── */
  /* from the card at the top of the exercise window: open a new set with
     the suggestion already in it, ready to be changed or saved as it is */
  "sug-use": (el) => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f) return;
    const d = el.dataset;
    if (f.kind === "cardio") {
      ui.entryForm.f = { ...f, minutes: d.min, intensity: d.rpe };
      render(); return;
    }
    if (isDetailed(f)) {
      ui.setForm = { s: newSet(d.reps, d.weight, ""), isNew: true, index: (f.setList || []).length };
    } else {
      /* an older top-set entry has no set list to open, so fill its fields,
         and give it a set count if it hasn't got one yet */
      ui.entryForm.f = { ...f, reps: d.reps, weight: d.weight, sets: +f.sets > 0 ? f.sets : "1" };
    }
    render();
  },
  /* from the line inside the set editor: fill the set that is already open */
  "sug-fill": (el) => {
    if (!ui.setForm) return;
    ui.setForm.s = { ...ui.setForm.s, reps: el.dataset.reps, weight: el.dataset.weight };
    render();
  },

  /* ── per-set logging (Detailed mode) ──────────────────────────────── */
  "add-set": () => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f || !isDetailed(f)) return;
    const i = f.setList.length;
    ui.setForm = { s: openingSetFor(f, ui.entryForm.isDraft, i), isNew: true, index: i };
    render();
  },
  /* the same new set as any other, marked as continuing the one above. The
     positional pre-fill in openingSetFor already does the right thing here:
     if you dropped last week, last week's drop is what it offers. */
  "add-drop": () => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f || !isDetailed(f) || !f.setList.length) return;
    const i = f.setList.length;
    ui.setForm = { s: { ...openingSetFor(f, ui.entryForm.isDraft, i), drop: true }, isNew: true, index: i };
    render();
  },
  "entry-super-toggle": () => {
    const f = ui.entryForm && ui.entryForm.f;
    if (!f) return;
    f.superWith = !f.superWith;
    render();
  },
  "set-drop-toggle": () => {
    if (!ui.setForm || !ui.setForm.index) return;   // index 0 has nothing above it
    ui.setForm.s.drop = !ui.setForm.s.drop;
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
  /* pinning from the list, the cap is enforced here, once, for every route in */
  "timer-pin": (el) => {
    const t = (state.timers || []).find((x) => x.id === el.dataset.id);
    if (!t) return;
    if (!t.pinned && pinnedTimers().length >= MAX_PINNED_TIMERS) {
      alert(T("timers.pinFull", { n: MAX_PINNED_TIMERS }));
      return;
    }
    patch({ timers: state.timers.map((x) => (x.id === t.id ? { ...x, pinned: !x.pinned } : x)) });
  },
  /* pinning from inside the editor, the flag rides on the draft until you save */
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
  /* tapping a sound is also how you hear it, at the volume you've set, so
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
    const planning = isDraft && !!(ui.workoutSheet && ui.workoutSheet.planning);
    /* drop half-typed placeholder sets and refresh the headline numbers before
       anything leaves the form */
    const f = syncEntry(isDetailed(ui.entryForm.f)
      ? { ...ui.entryForm.f, setList: filledSets(ui.entryForm.f) }
      : ui.entryForm.f);
    const exists = entryOnRecord(f, isDraft);
    /* Nothing is turned away any more. An emptied row already on record goes
       back empty, which is the whole point of unticking it, and a brand-new
       one with nothing in it is a lift lined up for later (see the note over
       `lineUp` in entryComputed). The only blank still refused is one being
       written straight to the log with no day around it, which no route in
       the app can produce. */
    if (!planning && !isDraft && !exists && !entryHasData(f)) return;
    if (isDraft) {
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
    else if (t === "planResult") ui.planResult = null;
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
  /* A number field keeps whatever separator you typed on screen (only stray
     characters are pushed back out) while the value that gets stored is
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
  } else if (bind === "stdq") {
    ui.stdQ = v;
    const list = document.getElementById("stdPickList");
    if (list) { list.innerHTML = renderStdPickerList(); if (window.lucide) lucide.createIcons(); }
  } else if (bind.startsWith("std.")) {
    const key = bind.slice(4), f = stdForm();
    f[key] = v;
    /* Both hints under these two fields are claims about where the number
       came from (your log, your last check-in), and the moment it is typed
       over the claim is false. They are retired HERE rather than at the next
       render, because typing never causes one. */
    const setHint = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    if (key === "lift" && f.liftFromLog) {
      f.liftFromLog = false;
      const ex = STD_BY_SLUG[f.slug];
      setHint("stdLiftHint", ex && ex.reps ? T("std.repsHint") : T("std.liftHint"));
    }
    if (key === "bw" && f.bwFrom) { f.bwFrom = null; setHint("stdBwHint", ""); }
    const btn = document.getElementById("stdCheckBtn");
    if (btn) { const ok = stdReady(f); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
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
    /* one plan per day, kept true here rather than argued about on save:
       moving a plan onto a day that already has one would otherwise
       silently overwrite somebody's Wednesday. */
    if (ui.workoutSheet.planning && v) {
      const clash = (state.plans || []).find((p) => p.date === v && p.id !== ui.workoutSheet.planId);
      if (clash) { alert(T("plan.clash", { date: fmtShort(v) })); render(); return; }
    }
    ui.workoutSheet.date = v; render();
  } else if (bind === "draft.name") {
    ui.workoutSheet.name = v;
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
       finished group back onto this draft, see actions["group-save"]. */
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
       entry form or from any of its set editors. A discrete tap, not typing,
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
  /* every field is a checkpoint, nothing typed is ever only in memory */
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
     chose, the only honest way to pick one */
  if (e.target.matches("input[type=range]")) {
    handleBind(e.target);
    if (ui.timerForm) playSound(soundOf(ui.timerForm.t), volumeOf(ui.timerForm.t));
    return;
  }
  if (e.target.matches("select, input[type=date], input[type=color]")) handleBind(e.target);
});

/* file uploads (exercise photo): read, downscale, stash on the draft, redraw */
function handleFile(el) {
  const file = el.files && el.files[0];
  if (!file) return;
  if (el.dataset.filebind === "exwin.image" && ui.exWinDraft) {
    readImageScaled(file, (dataUrl) => { ui.exWinDraft.image = dataUrl; render(); });
  } else if (el.dataset.filebind === "backup") {
    const r = new FileReader();
    r.onload = () => importBackup(String(r.result || ""));
    r.onerror = () => alert(T("profile.importBad"));
    r.readAsText(file);
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
      to the home screen on Android and the OS genuinely refuses to rotate it,
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

/* Put back whatever was half-finished when the app last went away: the open
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
applyViewport();        // size the frame to this device before it is first drawn
sweepTimers();          // anything that ran out while the app was closed
render();
startTimerEngine();
