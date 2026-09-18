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

/* ═══════════════════ WHAT A GROUP IS FOR ═══════════════════════
   A group used to be a colour and a name, and one of those names was
   load-bearing: "Cardio" was how the app knew to ask for minutes instead
   of reps. That made a private joke ("Hell") into a broken form.

   So a group DECLARES what it is for, and its exercises are logged that
   way. A kind earns a place in this table only if it passes both halves
   of one test:

     1. it changes WHAT YOU WRITE DOWN, and
     2. it has one axis on which more is unambiguously better.

   The second half is the strict one, because every comparison in this app
   (the PR badge, the graph, beat-last-time, the set verdicts, the
   suggestion card) needs a direction to point in. Two shapes people do ask
   for fail it and are deliberately absent: ROUNDS, where "5 rounds for
   time" wants less time and "AMRAP 20" wants more rounds, the same fields
   with opposite objectives; and DISTANCE, where a longer run and a faster
   run are both better and nothing here could rank them. Neither is hard to
   store. Both would force the app to decide what you meant, which is the
   one thing it is not allowed to do. Don't add them without solving that.

   `sets: false` is the real fault line: cardio is the only kind not logged
   set by set, which is why so much of the app reads `kind === "cardio"` and
   stays correct. Bodyweight and hold are set-shaped, so the set list, the
   dropset chains, the plan's ghost rows, the last-time verdicts, the PR
   badge, the graph and sets-per-week all work for them unchanged.       */
const KIND = {
  strength:   { sets: true },
  bodyweight: { sets: true },
  hold:       { sets: true },
  cardio:     { sets: false },
};
const KIND_ORDER = ["strength", "bodyweight", "hold", "cardio"];
const DEFAULT_KIND = "strength";

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
/* The third column is the spreadsheet's compound/isolation/cardio, kept in
   the data because this list is a verbatim port, and deliberately NOT
   stored on the row: `kind` is what a lift is logged in now, and the only
   code left reading `type` is the v13/v14 migration reading old saves. */
].map(([name, muscle, , equipment, alternatives, note], i) => ({
  id: "default-" + i, name, muscle, equipment, alternatives, note,
  /* No `kind` on any of them, deliberately: they all sit in a group that
     answers for them, the three cardio machines included. Note the seeded
     pull-ups and plank are therefore strength, not the bodyweight and hold
     kinds they could obviously be — re-declaring them here would change the
     form under everyone who already has reps × weight on record for them.
     They are one tap away in the exercise editor for anyone who wants them. */
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
/* `kind` is spelled out on every one of them rather than left to default,
   so a fresh install and a migrated save hold the identical shape and
   anything reading `g.kind` straight off a record always finds one. */
const DEFAULT_GROUPS = [
  { name: "Chest", key: "Chest", color: "#d05a50", kind: DEFAULT_KIND },
  { name: "Back", key: "Back", color: "#5d8bcc", kind: DEFAULT_KIND },
  { name: "Shoulders", key: "Shoulders", color: "#e9b949", kind: DEFAULT_KIND },
  { name: "Arms", key: "Arms", color: "#6aa465", kind: DEFAULT_KIND },
  { name: "Legs", key: "Legs", color: "#aab4c0", kind: DEFAULT_KIND },
  { name: "Core", key: "Core", color: "#8fa39a", kind: DEFAULT_KIND },
  { name: "Cardio", key: "Cardio", color: "#a07ec2", kind: "cardio" },
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


/* ── THE GROUP DECIDES, THE EXERCISE MAY DISAGREE ──────────────────
   Three levels, and only two of them store anything.

   A GROUP always carries a kind. An EXERCISE carries one only when it is an
   EXCEPTION to its group: `ex.kind` absent means "whatever my group is
   for", which is why filing a lift under a cardio group makes it cardio,
   and why re-declaring a group takes its exercises with it. Stamping a kind
   on every row instead (which is what v13 did) made the group setting inert
   — the exercises all had their own answer already and never asked.

   An ENTRY is different: its kind is FROZEN on the record the moment it is
   logged. Re-declaring a group must never reach back and change what a
   session on record claims to have been. */
const groupKind = (name) => {
  const g = ((state && state.groups) || DEFAULT_GROUPS).find((x) => x.name === name);
  return g && KIND[g.kind] ? g.kind : DEFAULT_KIND;
};

const exKind = (ex) => (ex && KIND[ex.kind] ? ex.kind : groupKind(ex && ex.muscle));

/* An exercise stores its kind only while it differs from its group's, so
   "same as my group" is the absence of an answer rather than a copy of one
   that would go stale the moment the group changed. Everything that writes
   a library row goes through this. */
const withKind = (ex, kind, gk) => {
  const out = { ...ex };
  const groups = KIND[gk] ? gk : groupKind(out.muscle);
  if (KIND[kind] && kind !== groups) out.kind = kind;
  else delete out.kind;
  return out;
};

const kindOf = (e) => (e && KIND[e.kind] ? e.kind : DEFAULT_KIND);

/* ── WHICH SESSIONS ARE COMPARABLE ───────────────────────────────
   An exercise can change what it is logged in, and its old sessions do not
   change with it: they stay exactly as they were written. That leaves two
   sets of numbers under one name, and a rep count is not a kilo. Pooling
   them put an est. 1RM and a rep count on one axis, called a good session
   a drop, and set the "beat last time" card a target in the wrong units.

   So the rule is: **a lift is READ in the kind it is logged in today, and
   only sessions in that kind are compared.** The others are still shown —
   they happened — but they are not plotted, not ranked and never the bar
   to beat. `readKind` is that "today", taken from the library rather than
   from the last row logged, since the library is what the next set will be
   typed into. */
const readKind = (name) => {
  const ex = ((state && state.library) || []).find((x) => x.name === name);
  return ex ? exKind(ex) : null;
};

const isSetKind = (k) => !!(KIND[k] && KIND[k].sets);


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

/* ── VARIATIONS: ONE MOVEMENT, SEVERAL WAYS OF DOING IT ───────────────
   A wide-grip pulldown and a close-grip one are the same movement and not
   the same lift: the weights are different, and averaging them into one
   history tells you nothing about either. So a variation is a LIBRARY ROW
   OF ITS OWN — its own log, its own best set, its own graph, its own PRs —
   carrying `variantOf` (the row it branched from) and `variantName` ("Wide
   grip"). Everything downstream already works, because everything
   downstream only ever knew about library rows.

   What the link buys is the two things separate rows cannot do for
   themselves: they are shown together (nested in the library, listed in
   each other's window), and the variation's LABEL is composed from its
   parent's, live. That last one matters more than it looks. The stored name
   is identity and must never move under the log; the label is display. So
   renaming "Lat Pulldown" to "Pulldown" re-labels every variation of it at
   once, without a single stored name changing, exactly as translating a
   built-in does.

   A variation of a variation attaches to the root instead of nesting, since
   nobody has ever wanted a tree of grips. */
const variantParent = (ex) =>
  ex && ex.variantOf ? ((state && state.library) || []).find((x) => x.id === ex.variantOf) || null : null;

const variantRootId = (ex) => (ex ? (ex.variantOf || ex.id) : null);

const variantsOf = (id, library) =>
  ((library || (state && state.library) || [])).filter((x) => x.variantOf === id);

/* ── WHICH END OF THE FAMILY CAME FIRST IS AN ACCIDENT ────────────────
   The base of a family is whichever row happened to exist before there
   were variations at all, and that is a fact about the order somebody
   started logging in, not about the movement. Log the one-arm machine for
   a year and it becomes the base every ordinary pulldown then has to hang
   off, which reads exactly backwards: the machine is the variation.

   So a row can be attached to another one after the fact (reparentUnder).
   The stored name is recomposed from the new parent's so it stays the
   thing exwin-save would have written, which makes it a RENAME, and a
   rename here is the same cascade it is anywhere else. Its own variations
   come with it — a family is one level deep, so they re-attach beside it
   rather than hanging off a row that is no longer a base.

   The short part is what is left of a name once the parent's is taken off
   the front: "Lat Pulldown (OA machine)" filed under "Lat Pulldown" is an
   OA machine. It is a first guess, shown in a field before anything is
   written, never a silent decision. */
function shortUnder(ex, parentName) {
  if (!ex) return "";
  if ((ex.variantName || "").trim()) return ex.variantName.trim();
  let s = (ex.name || "").trim();
  const p = (parentName || "").trim();
  if (p && s.toLowerCase().startsWith(p.toLowerCase())) s = s.slice(p.length).trim();
  s = s.replace(/^[([{\-–—:·,]+/, "").replace(/[)\]}]+$/, "").trim();
  return s || (ex.name || "").trim();
}

/* ── A PHOTO THAT EXISTS SOMEWHERE ELSE ───────────────────────────────
   `imageMissing` is set by sync, on the way UP: a picture too big for the
   wire is left behind so the lift itself can travel (see withoutBigPhoto),
   and the row arrives saying that a photo exists on the phone it was taken
   on. Saying nothing would make two very different rows identical on
   screen — a lift nobody has ever photographed, and a lift photographed on
   another phone — and only one of those is worth going and asking about.
   The photo always wins over the flag, here and in syncApply: a row that
   holds one is not a row waiting for one.                              */
const photoAway = (ex) => !!(ex && !ex.image && ex.imageMissing);

function exLabelOf(ex) {
  if (!ex) return "";
  /* a variation reads as its parent plus what makes it one, composed now
     rather than stored, so the parent can still be renamed */
  if (ex.variantOf) {
    const p = variantParent(ex);
    const own = ex.variantName || ex.name;
    return p ? `${exLabelOf(p)} · ${own}` : ex.name;
  }
  const row = exRow(ex);
  if (!row) return ex.name;
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

/* the same test where all that is to hand is a stored NAME — a dashboard
   row, a log entry — rather than the library row itself. Same two readings
   for the same reason: a lift is stored in English and shown translated,
   and a variation is shown as its parent plus its own short part, so
   typing "pulldown" has to find "Lat Pulldown · Wide grip" too. */
const nameMatches = (name, q) => {
  const s = String(q || "").trim().toLowerCase();
  return !s || String(name || "").toLowerCase().includes(s) ||
    exLabel(name).toLowerCase().includes(s);
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

/* one decimal by default, no dangling ".0": 133.3 kg, but 120 kg. `dp` is
   for the places that read a WEIGHT back off the log rather than printing a
   derived figure: see weightAs for why those need two. */
const trimNum = (n, dp = 1) => { const p = Math.pow(10, dp); return String(Math.round(n * p) / p); };

/* Cardio "1RM equivalent": session-RPE load (Foster) = minutes × RPE */
const cardioScore = (minutes, intensity) =>
  minutes > 0 && intensity > 0 ? Math.round(minutes * intensity) : null;

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

/* ── A WEIGHT OFF THE LOG, IN TODAY'S UNIT ────────────────────────────
   Every place that reads a past weight back to sit BESIDE a weight being
   typed today goes through here: last time's rows, what a new set opens
   on, and the bar the suggestion card argues from. Two jobs, and the
   second is the one that bites.

   It converts, because history is stored in the unit it was written in and
   a kg set held up against an lbs one is not a comparison at all.

   And it rounds, because converting produces float dust that would make a
   set disagree with itself by a millionth of a kilo. TWO decimals, not
   one: a gym makes 1.25 kg and 2.5 lb jumps, so 26.25 kg is a weight
   somebody actually loaded, and rounding it to 26.3 to compare it against
   itself is precisely how a set that exactly repeated last time came back
   as "under" — the logged 26.25 really was less than the 26.3 it was being
   measured against, and the app was right about a number it had invented.
   Two decimals hold every step a plate tree can make, which is the only
   precision a weight off the log is ever claiming. */
const weightAs = (w, from, to) => Math.round(convertWeight(+w, from, to) * 100) / 100;

/* the unit an entry was logged in, older entries fall back to the default */
const unitOf = (e) => (e && e.unit) || state.settings.units;

/* an entry's weight expressed in the default unit, for comparisons only */
const baseWeight = (e) => convertWeight(+e.weight, unitOf(e), state.settings.units);

/* THE one number an entry is spoken for by: what the PR badge compares,
   what the graph plots, what "your best ever" means. One per kind, and each
   one points the same way — more is better — which is the whole reason the
   kinds that could not promise that are not in the table.

   Strength converts into the default unit first, because a kg session and
   an lbs one have to be comparable; reps and seconds are unitless and pass
   straight through. */
const metricOf = (e) => {
  const k = kindOf(e);
  return k === "cardio" ? cardioScore(+e.minutes, +e.intensity)
    : k === "bodyweight" ? (+e.reps > 0 ? +e.reps : null)
    : k === "hold" ? (+e.secs > 0 ? +e.secs : null)
    : est1RM(baseWeight(e), +e.reps);
};

/* the unit that number is in, for the label beside it */
const metricUnit = (k, unit) =>
  k === "cardio" ? T("unit.pts")
    : k === "bodyweight" ? T("unit.reps")
    : k === "hold" ? T("unit.secs")
    : unit || state.settings.units;

/* and what to call it: an estimated one-rep max is a claim only the
   strength curve can make, so nothing else borrows the words */
const metricLabel = (k, unit) =>
  k === "cardio" ? T("entry.sessionLoad")
    : k === "bodyweight" ? T("kind.metric.bodyweight")
    : k === "hold" ? T("kind.metric.hold")
    : T("entry.est1rm", { unit: unit || state.settings.units });

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

const newSet = (reps = "", weight = "", rpe = "", secs = "") => ({ id: uid(), reps, weight, rpe, secs });
const isDetailed = (e) => Array.isArray(e && e.setList);

/* ── ONE SET, THREE WAYS ────────────────────────────────────
   Everything that differs between the set-shaped kinds is these three
   questions, and every call site asks one of them rather than testing the
   kind itself: is this set filled in, what is it worth, and how is it
   written. Add a kind by answering all three, not by grepping for
   `=== "strength"`.

   `setScore` is deliberately RAW, in whatever unit the set was typed in:
   it ranks the sets inside one entry and prints beside them, and both of
   those read back what you wrote. metricOf is the converted one, for
   comparisons across sessions. */
const setHasData = (s, kind = DEFAULT_KIND) =>
  kind === "bodyweight" ? +s.reps > 0
    : kind === "hold" ? +s.secs > 0
    : +s.reps > 0 && +s.weight > 0;

const setScore = (s, kind = DEFAULT_KIND) =>
  kind === "bodyweight" ? (+s.reps > 0 ? +s.reps : null)
    : kind === "hold" ? (+s.secs > 0 ? +s.secs : null)
    : est1RM(+s.weight, +s.reps);

/* est. 1RM is a number you cannot read off the set, and so is a cardio
   session's load; "10 reps" scoring 10 is the set said twice. */
const scoreWorthShowing = (kind) => kind === "strength" || kind === "cardio";

/* `unit` omitted falls back to the default; `unit` given as "" means print
   no unit at all, which is how a row of sets says "kg" once at the end
   instead of after every one of them (planTargetLine). */
const setLine = (s, kind = DEFAULT_KIND, unit) =>
  kind === "bodyweight" ? T("unit.nReps", { n: esc(s.reps) })
    : kind === "hold" ? T("unit.nSecs", { n: esc(s.secs) })
    : `${esc(s.reps)} × ${esc(s.weight)}${(unit == null ? state.settings.units : unit) ? " " + (unit == null ? state.settings.units : unit) : ""}`;

const filledSets = (e) => (e.setList || []).filter((s) => setHasData(s, kindOf(e)));

/* The set that speaks for the whole exercise wherever one number is shown:
   the highest estimated 1RM, the most reps, the longest hold. */
function bestSet(list, kind = DEFAULT_KIND) {
  let best = null, bestM = -Infinity;
  for (const s of list || []) {
    const m = setScore(s, kind);
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
  const k = kindOf(e);
  if (!isDetailed(e) || k === "cardio") return e;
  const filled = filledSets(e);
  const b = bestSet(filled, k);
  return { ...e, sets: filled.length,
    reps: b ? b.reps : "", weight: b ? b.weight : "", rpe: b ? b.rpe : "", secs: b ? b.secs : "" };
}

/* Does a draft entry carry logged numbers yet? Entries dropped in from a preset
   start blank, they need sets/reps/weight (or minutes/intensity) filled in. */
const entryHasData = (e) => {
  const k = kindOf(e);
  if (k === "cardio") return +e.minutes > 0 && +e.intensity > 0;
  if (isDetailed(e)) return filledSets(e).length > 0;
  /* the legacy top-set shape, which only strength entries were ever in */
  return +e.sets > 0 && setHasData(e, k);
};

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
  const k = kindOf(e);
  if (k === "cardio") return T("sug.cardioSet", { min: esc(e.minutes), rpe: esc(e.intensity) });
  const label = T(isDetailed(e) ? "sets.summaryBest" : "sets.summaryTop");
  /* always in the unit the set was actually logged in, never converted:
     what you typed is what you read back */
  return `${TN("set", +e.sets || 0)} · ${label} ${setLine(e, k, unitOf(e))}` +
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
const SUG_HOLD_SEC = 5;      // seconds added on a hold, the smallest step worth standing up for
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
  const k = kindOf(f);
  return chronoSort(state.log).filter((e) =>
    e.exercise === f.exercise && e.id !== f.id &&
    /* a session logged in another kind is not a session you can be asked to
       beat: see readKind. This one filter is what keeps the suggestion
       card, "last time", the opening set and the set verdicts agreeing. */
    kindOf(e) === k &&
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
  const k = kindOf(f);
  if (k === "cardio") return cardioScore(+f.minutes, +f.intensity);
  if (k !== "strength") {
    const b = isDetailed(f) ? bestSet(filledSets(f), k) : f;
    return b && setHasData(b, k) ? setScore(b, k) : null;
  }
  /* strength alone has to be converted, since the bar it is measured
     against is in the default unit */
  const b = isDetailed(f) ? bestSet(filledSets(f), k) : f;
  return b && setHasData(b, k) ? metricFor(+b.weight, +b.reps, unitOf(f)) : null;
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

  const fk = kindOf(f);
  /* One axis, so one way over it. The card renders identically to the
     two-option version and `bySmallestStep` simply has nothing to rank,
     which is the honest answer: there is no choice to be made here. */
  if (fk === "bodyweight" || fk === "hold") {
    const field = fk === "hold" ? "secs" : "reps";
    const was = Math.round(+prev[field]);
    if (!(was > 0)) return { kind: "first" };
    const next = was + (fk === "hold" ? SUG_HOLD_SEC : 1);
    return { kind: fk, prev: { [field]: was, m: prevM, date: lastDate },
             ...bySmallestStep([{ kind: field, [field]: next, m: next }]), now, done };
  }

  if (fk === "cardio") {
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
  const weight = weightAs(prev.weight, eu, fu);
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
    if (kindOf(e) === "cardio") {
      if (+e.minutes > 0 && +e.intensity > 0)
        rows.push({ kind: "cardio", minutes: e.minutes, intensity: e.intensity, m: cardioScore(+e.minutes, +e.intensity) });
      continue;
    }
    const u = unitOf(e), k = kindOf(e);
    if (isDetailed(e)) {
      for (const st of filledSets(e))
        rows.push({ kind: k, reps: st.reps, weight: st.weight, secs: st.secs, rpe: st.rpe, unit: u, m: setScore(st, k) });
    } else if (setHasData(e, k)) {
      /* a top-set row from before per-set logging: one set is all that was
         ever written down, and saying so beats showing it as if it were the lot */
      rows.push({ kind: k, reps: e.reps, weight: e.weight, secs: e.secs, rpe: e.rpe, unit: u,
        m: setScore(e, k), topOf: +e.sets > 0 ? +e.sets : null });
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
  const eUnit = unitOf(f), k = kindOf(f);
  const last = lastOuting(f, isDraft);
  const rows = last ? last.rows.filter((r) => r.kind === k && setHasData(r, k)) : [];
  const r = rows[index];
  if (r) {
    if (k === "bodyweight") return newSet(String(r.reps), "", r.rpe || "");
    if (k === "hold") return newSet("", "", r.rpe || "", String(r.secs));
    /* weightAs, not a one-decimal trim: this is the number about to be
       typed into the log, and handing back 26.3 for a 26.25 kg set edits
       somebody's history on their behalf and then grades them on it */
    return newSet(String(r.reps), String(weightAs(r.weight, r.unit || eUnit, eUnit)), r.rpe || "");
  }
  /* nothing at this position last time, so the set above is the next best guess */
  const prev = (f.setList || [])[index - 1];
  return prev ? newSet(prev.reps, prev.weight, prev.rpe, prev.secs) : newSet();
}

/* "vs. Your Best": compares against strictly earlier entries of the same
   exercise, exactly like the sheet's row-above MAXIFS window. */
function computeBadges(log) {
  const bests = {}; const out = {};
  for (const e of chronoSort(log)) {
    const m = metricOf(e);
    if (m == null) { out[e.id] = { badge: null, metric: null }; continue; }
    /* keyed by lift AND kind: twelve pull-ups are not a PR over a 90 kg
       weighted single, and neither is the reverse */
    const key = e.exercise + "\u0000" + kindOf(e);
    const prev = bests[key];
    let badge;
    if (prev === undefined) badge = "first";
    else if (m > prev) badge = "pr";
    else if (m === prev) badge = "match";
    else badge = "below";
    out[e.id] = { badge, metric: m, prevBest: prev ?? null };
    bests[key] = prev === undefined ? m : Math.max(prev, m);
  }
  return out;
}
/* The long forms of these ("Beat your best 💪", "Below best, normal, keep
   going") are gone with the sentence they were written for: the entry
   card names the two numbers now, and a number does not need a mood. What
   is left is the SHORT badge, which is a label on a row in a list rather
   than a verdict delivered to your face mid-set. */
const BADGE_SHORT = {
  get first() { return T("badge.firstShort"); }, get pr() { return T("badge.prShort"); },
  get match() { return T("badge.matchShort"); }, below: "",
};

function muscleOf(name, library, fallback) {
  const ex = library.find((x) => x.name === name);
  return ex ? ex.muscle : fallback || "—";
}

/* Which group an entry counts toward, which is the question a dozen dots,
   stripes and volume rows all ask: whichever group its exercise sits in
   now, falling back to the one stamped on the entry for a lift that has
   since left the library.

   Cardio entries used to be forced under the cardio group by name. That
   was harmless while there could only be one of them and it was always
   called Cardio; now that any group can declare itself cardio, it would
   file a session done in "Hell" under "Cardio" instead. */
const groupOfEntry = (e, library) =>
  muscleOf(e.exercise, library || state.library, e.muscle);

/* Dashboard rows: first-appearance order, MAXIFS/COUNTIF equivalents */
function dashboardRows(log, library, goals) {
  const seen = new Map();
  for (const e of chronoSort(log)) {
    if (!seen.has(e.exercise)) {
      /* the kind this lift is read in TODAY, so this row and the exercise
         window can never disagree about what its number means */
      const kind = readKind(e.exercise) || kindOf(e);
      seen.set(e.exercise, { name: e.exercise, best: null, sessions: 0, last: e.date, kind, cardio: kind === "cardio", offKind: 0 });
    }
    const r = seen.get(e.exercise);
    if (kindOf(e) !== r.kind) { r.offKind += 1; continue; }
    const m = metricOf(e);
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

/* Volume tab: SUMIFS(sets, week, muscle), cardio counted in minutes.
   Each group comes back as {sets, minutes}, never one figure: see below. */
function volumeForWeek(log, library, startDate, week) {
  const out = {};
  for (const e of log) {
    if (weekOf(e.date, startDate) !== week) continue;
    /* Sets and minutes are two different things and are never added
       together, even when they land in the same group. A group is free to
       hold both (declare it cardio and make one lift an exception, or the
       other way round), and adding a 30-minute row to two sets of bench
       produced "32 sets", which is not a number about anything. */
    const m = groupOfEntry(e, library);
    const row = out[m] || (out[m] = { sets: 0, minutes: 0 });
    if (kindOf(e) === "cardio") row.minutes += +e.minutes || 0;
    else row.sets += +e.sets || 0;
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
    /* Sets and minutes are two different things and are never added
       together, even when they land in the same group. A group is free to
       hold both (declare it cardio and make one lift an exception, or the
       other way round), and adding a 30-minute row to two sets of bench
       produced "32 sets", which is not a number about anything. */
    const m = groupOfEntry(e, library);
    const row = out[m] || (out[m] = { sets: 0, minutes: 0 });
    if (kindOf(e) === "cardio") row.minutes += +e.minutes || 0;
    else row.sets += +e.sets || 0;
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
  const k = kindOf(pe);
  if (k === "cardio")
    return +pe.minutes > 0 && +pe.intensity > 0 ? { minutes: pe.minutes, intensity: pe.intensity, kind: k } : null;
  /* the target is self-describing on purpose: it is copied onto the entry
     that answers it and read back out of the log years later, long after
     the exercise it came from may have been re-declared or deleted */
  const sets = filledSets(pe).map((s) => ({ reps: s.reps, weight: s.weight, secs: s.secs }));
  return sets.length ? { sets, unit: unitOf(pe), kind: k } : null;
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
   the plan was a guess made days ago, and the log is what happened.

   THIS ONE IS FOR PLANS ONLY. "Did you do what you said" and "did this go
   better than last time" are different questions and they part company on
   exactly the sets where it matters: see setProgress below.            */

function setVerdict(actual, target, kind = DEFAULT_KIND) {
  if (!actual || !target) return null;
  if (!setHasData(actual, kind)) return null;
  /* the one-axis kinds: nothing to trade off, so the comparison is the
     comparison. Strength is the only one with two axes to be short on. */
  if (kind === "bodyweight" || kind === "hold") {
    const f = kind === "hold" ? "secs" : "reps";
    const a = +actual[f], t = +target[f];
    return a < t ? "under" : a > t ? "beat" : "hit";
  }
  const r = +actual.reps, w = +actual.weight, tr = +target.reps, tw = +target.weight;
  if (r < tr || w < tw) return "under";
  return r > tr || w > tw ? "beat" : "hit";
}

/* ── DID THIS SET GO BETTER THAN LAST TIME ────────────────────────────
   The same three words, pointed at your own last session instead of at a
   plan, and judged on the SCORE rather than on both axes at once.

   The rule above cannot answer this question. It calls a set UNDER the
   moment it is short on either axis, so 14 × 60 kg followed a week later
   by 11 × 65 kg reads "under": the reps went down, and that is the end of
   the sentence. But that set is 88.5 kg of estimated max against 87.4, a
   heavier top-end for the same slot, and it is the whole shape of getting
   stronger — you trade reps for plates, and the reps come back. Grading
   it "under" tells somebody who just improved that they went backwards,
   which is the app arguing with a lifter about their own training. Worse,
   the est. 1RM card open on that same set said "1.1 higher than set 2" in
   gold at the same moment the row said under, so the app disagreed with
   itself on one screen.

   Against a PLAN the two-axis rule is still right, and stays: a plan is a
   sentence you wrote down, and 11 reps is not the 14 you said. Against
   LAST TIME there is no sentence to keep, only the question of whether
   this slot went better, and the app already has one number for how good a
   set was. It is the number the row prints, the graph plots, the PR badge
   reads and the suggestion card argues from. Reusing it here is what makes
   the badge and the estimate beside it stop contradicting each other.

   Compared through setScore, ROUNDED, which is the figure actually on
   screen: a verdict worked out to more precision than it is shown at is a
   verdict nobody can check by reading the two numbers.

   The one-axis kinds are unaffected — for reps and for seconds the score
   IS the axis, so this and setVerdict agree by construction.           */
function setProgress(actual, prev, kind = DEFAULT_KIND) {
  if (!actual || !prev) return null;
  if (!setHasData(actual, kind)) return null;
  const a = setScore(actual, kind), b = setScore(prev, kind);
  if (a == null || b == null) return null;
  return a > b ? "beat" : a < b ? "under" : "hit";
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
  const verdicts = t.sets.map((ts, i) => setVerdict(list[i], ts, kindOf(e)));
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

/* ── THE VERDICT, POINTED AT LAST TIME ────────────────────────────────
   A plan is one thing you can be measured against. Your own last session
   is the other, and for most days it is the only one there is.

   THE HOLE THIS FILLS. Est. 1RM speaks for an exercise through its BEST
   set, which is the right way to answer "what could I lift for a single"
   and the wrong way to answer "did today go better than last time". Match
   your top set and add a rep to your second and the exercise's headline
   estimate does not move, because it was never about your second set. The
   graph goes flat on a session that was strictly better than the one
   before it.

   So this compares SET FOR SET BY POSITION: set two answers last time's
   set two, exactly as a planned set is answered by the set in its slot.
   The per-set estimate is exactly the right tool for that and the
   whole-exercise one was never in the running, which is why the answer is
   setProgress rather than setVerdict — the two-axis plan rule called a
   set that had raised its own estimate "under" on the strength of the
   reps alone. See setProgress for why that had to go.

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
  /* into the unit being typed in today, at the precision a plate tree can
     actually make: see weightAs, and see the "under" verdict a coarser
     rounding used to invent for a set that repeated last time exactly */
  const k = kindOf(f);
  const rows = last.rows
    .filter((r) => r.kind === k && setHasData(r, k))
    /* reps and seconds are unitless and pass straight through; only a
       weight has to be brought into the unit being typed in today */
    .map((r) => (k === "strength"
      ? { reps: +r.reps, weight: weightAs(r.weight, r.unit || eUnit, eUnit) }
      : { reps: r.reps, secs: r.secs }));
  return rows.length ? { date: last.date, rows } : null;
}

/* How this entry stands against that session. Null when there is nothing to
   compare with: a plan already answers the question, cardio is not sets, and
   a first outing has no yesterday. */
function entryLastResult(f, isDraft) {
  if (!f || f.plan || !isSetKind(kindOf(f)) || !isDetailed(f)) return null;
  if (!filledSets(f).length) return null;
  const prev = lastTimeSets(f, isDraft);
  if (!prev) return null;
  const list = f.setList || [];
  const k = kindOf(f);
  const verdicts = list.map((s, i) => (prev.rows[i] ? setProgress(s, prev.rows[i], k) : null));
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
  version: 14,
  /* `sex` is "" until asked, and it is only ever asked by the strength
     standards, whose tables are split male/female. It sits in settings so it
     is remembered and travels in a backup, not because the app wants a
     demographic, which is why Profile doesn't offer it. */
  settings: { name: "", units: "kg", startDate: todayStr(), theme: "dark", lang: "en", weekMode: "program", sex: "" },
  library: DEFAULT_LIBRARY,
  groups: DEFAULT_GROUPS.map((g) => ({ ...g })),   // [{name,key?,color}], user-editable
  log: [],        // {id,date,exercise,muscle,kind,sets,reps,weight,rpe,unit,minutes,intensity,notes,createdAt,setList?}
  body: [],       // {id,date,weight,waist,chest,arm,thigh,glutes,notes}
  goals: {},      // { [exerciseName]: number }
  volumeGoals: {},// { [muscleGroup]: target sets per period }, user's own volume target
  presets: [],    // [{id,name,description,pinned,exercises:[{exercise,muscle,kind}],createdAt}]
  timers: seedTimers(), // [{id,name,duration,endsAt,remaining,doneAt,pinned,createdAt}]
  dayDrafts: [],  // [{id,date,entries,savedAt}], workout days you backed out of, see closeWorksheet()
  unlogged: [],   // [{date,entries,savedAt}], lifts left unlogged on a day you DID save, see commitWorkout()
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
  if (v < 13) {
    /* v13 gave groups a KIND. Before it, one group name meant "log this in
       minutes" and everything else meant sets of reps × weight, so the
       conversion is exactly that reading, written down: the group carrying
       the Cardio key becomes cardio and every other group becomes strength.
       Nobody's data changes shape and nothing on record is re-judged.

       Library rows are stamped too, from `type` where the old cardio flag
       was and from their group otherwise, so an exercise keeps being logged
       the way it always was even if it is later moved.

       LOG ENTRIES ARE LEFT ALONE ON PURPOSE. `kindOf` reads a missing kind
       as strength, which is what every non-cardio entry on record already
       is, and cardio ones carry `kind: "cardio"` and always have. Stamping
       history from today's library would let re-declaring a group rewrite
       what a session claims to have been, which is the one thing the log is
       never allowed to do. */
    s.groups = (s.groups || []).map((g) => (KIND[g.kind] ? g : { ...g, kind: g.key === "Cardio" ? "cardio" : DEFAULT_KIND }));
    const kindForGroup = (name) => {
      const g = (s.groups || []).find((x) => x.name === name);
      return g && KIND[g.kind] ? g.kind : DEFAULT_KIND;
    };
    s.library = (s.library || []).map((ex) => (KIND[ex.kind] ? ex
      : { ...ex, kind: ex.type === "Cardio" ? "cardio" : kindForGroup(ex.muscle) }));
    s.version = 13;
  }
  if (v < 14) {
    /* v14 made a group's kind mean something. v13 had stamped a kind onto
       every library row, which quietly made the group setting inert: each
       exercise already had its own answer and never asked its group. Now a
       row stores a kind only while it is an EXCEPTION to its group, so the
       stamps are dropped wherever they simply agreed with it.

       An exercise whose old answer DISAGREES keeps it as a real exception:
       that covers a lift stamped cardio by `type` before kinds existed but
       sitting in a group nobody has declared cardio. Nothing in the log is
       touched, here as everywhere. */
    const gk = (name) => {
      const g = (s.groups || []).find((x) => x.name === name);
      return g && KIND[g.kind] ? g.kind : DEFAULT_KIND;
    };
    s.library = (s.library || []).map((ex) => {
      const was = KIND[ex.kind] ? ex.kind : (ex.type === "Cardio" ? "cardio" : gk(ex.muscle));
      const out = { ...ex };
      if (was !== gk(ex.muscle)) out.kind = was; else delete out.kind;
      return out;
    });
    s.version = 14;
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
  /* `version` is taken from the SAVE, never inherited from the defaults
     spread in underneath it. A file without one is old (that is what its
     absence means) and has to run every migration; letting it pick up
     today's number instead declared it current and skipped the lot. */
  const merged = { ...base, ...saved, settings: { ...base.settings, ...(saved && saved.settings) } };
  merged.version = (saved && saved.version) || 1;
  return migrate(merged);
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 PROFILES \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   One device, several separate trainings. A second block of a program you
   want to try without touching the one you are in, or a friend at the same
   gym with no phone on them. A profile is a WHOLE STATE: log, library,
   groups, presets, timers, goals, body, plans, settings, everything the
   backup file carries, because "everything" is the only line that does not
   need maintaining as the app grows.

   Storage is one small index plus one key per profile:

     powerbuild-tracker:profiles   {active, list:[{id, name}]}
     powerbuild-tracker:state:<id> that profile's state

   One key each, rather than all of them under one, for a reason worth
   keeping: every save rewrites its key, and localStorage is a few megabytes
   with exercise photos already in it. Writing four profiles to disk because
   one of them gained a set would be three times the work and three times
   the quota risk on every keystroke's debounce.

   The single-profile key everyone is currently on becomes profile one, and
   is only let go of once the new key has been read back. */
const PROFILES_KEY = "powerbuild-tracker:profiles";
const stateKeyFor = (id) => "powerbuild-tracker:state:" + id;

function loadProfiles() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILES_KEY));
    if (p && Array.isArray(p.list) && p.list.length) {
      /* an active id pointing at a profile that is gone would leave the app
         with no state to load at all, so it is coerced back into the list */
      if (!p.list.some((x) => x.id === p.active)) p.active = p.list[0].id;
      return { active: p.active, list: p.list.map((x) => ({ id: x.id, name: x.name || "" })) };
    }
  } catch { /* no index yet: first run under profiles */ }

  /* not uid(): that lives with the ui block, a long way below this, and
     this runs while the module is still being evaluated */
  const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const made = { active: id, list: [{ id, name: "" }] };
  try {
    const legacy = localStorage.getItem(STORE_KEY);
    if (legacy != null) {
      localStorage.setItem(stateKeyFor(id), legacy);
      /* only now, and only if it really landed: a half-done move here costs
         somebody every session they have ever logged */
      if (localStorage.getItem(stateKeyFor(id)) === legacy) localStorage.removeItem(STORE_KEY);
    }
    localStorage.setItem(PROFILES_KEY, JSON.stringify(made));
  } catch (e) { console.error("profile setup failed", e); }
  return made;
}

let profiles = loadProfiles();

const saveProfiles = () => {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); }
  catch (e) { console.error("profile index save failed", e); }
};

const profileList = () => profiles.list;
const activeProfileId = () => profiles.active;
/* an unnamed profile is numbered rather than stored under a made-up name,
   so the fallback speaks whatever language the app is being read in */
const profileLabel = (p, i) => (p && p.name) || T("profiles.nth", { n: i + 1 });

/* ── A SAVE THAT WILL NOT OPEN IS NOT A SAVE THAT SHOULD BE REPLACED ──
   This used to be the one way the app could lose somebody's training all
   by itself, and it needed no bug anywhere else to do it: a save that
   would not parse (a write cut off by a dying battery, a browser that
   truncated under quota, anything) came back as defaultState(), the app
   came up blank and entirely happy, and the very next autosave wrote that
   blank over the only copy. One bad read, permanent loss, no warning.

   So a save that is THERE but will not open now poisons the write instead
   of the read: `unreadable` holds that profile's id, writeNow refuses to
   touch its key, and the bytes stay exactly where they are, for Storage
   check to hand back out (it lists one as DAMAGED and exports it raw).
   The app still runs, because refusing to open at all would strand the
   person with no way to reach the screen that can rescue them.

   A MISSING key is not this. A new profile and a first run have no key
   and must not be flagged, or nothing could ever be saved at all.

   The lock is deliberate rather than absolute: importing a backup and
   Reset all data both lift it (allowOverwrite), because both are the
   user saying "replace what is there", out loud, behind a confirm. What
   is forbidden is the app deciding that quietly on their behalf. */
let unreadable = null;            // profile id whose stored save will not parse

function readProfileState(id) {
  let raw = null;
  try { raw = localStorage.getItem(stateKeyFor(id)); }
  catch (e) { console.error("profile load failed", e); }
  if (raw) {
    try {
      const loaded = hydrate(JSON.parse(raw));
      if (unreadable === id) unreadable = null;
      return loaded;
    } catch (e) {
      console.error("profile unreadable, holding writes", e);
      unreadable = id;
      return defaultState();
    }
  }
  if (unreadable === id) unreadable = null;   // nothing there to protect
  return defaultState();
}

/* The off-screen counterpart of writeNow, and it answers to the same two
   guards for the same reasons: a profile whose save will not parse is not
   written over, and a full store is reported rather than swallowed. Only
   the roster's background fill uses it — the profile in front of you is
   still written by writeNow, from `state`, on the debounce. */
function writeProfileState(id, data) {
  /* the answer is writeNow's, not an assumption: it refuses an unreadable
     save and fails on a full store, and a caller asking whether the bytes
     are down has to hear about both */
  if (id === profiles.active) return writeNow();
  if (unreadable === id) return false;
  try { localStorage.setItem(stateKeyFor(id), JSON.stringify(data)); return true; }
  catch (e) {
    console.error("background save failed", e);
    if (!quotaWarned) { quotaWarned = true; try { alert(T("profiles.quota")); } catch { /* no UI here */ } }
    return false;
  }
}

/* Said once, the way the quota warning is: a refused write happens on the
   same debounce as every other one. */
let unreadableWarned = false;

/* The user saying "replace it" in as many words. Only importBackup and
   reset-all call this, and both have already asked.

   It now also carries that answer as far as the cloud copy. Restoring a
   backup over a full profile is the one legitimate way to delete most of
   what is up there, and syncPush refuses a push like that on its own —
   correctly, because every bug in this file looks identical from there.
   This is the difference between the app inferring a wipe and the user
   asking for one, which is the whole distinction that block is drawing. */
function allowOverwrite() {
  unreadable = null; unreadableWarned = false;
  syncWipeOk = true;                  // declared below; only ever called from a tap
}

function loadState() {
  return readProfileState(profiles.active);
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

/* write straight through, used when the page is about to go away.

   RETURNS WHETHER THE BYTES ARE ACTUALLY DOWN. Every caller before sync
   ignored the answer and could afford to, because the only cost of a lost
   write was a lost write. syncPull cannot: it persists a cursor saying "I
   have everything up to here", and a cursor that outlives the rows it
   describes is how a device ends up claiming to hold training it does not
   have — which the next push turns into tombstones. So the three ways
   this does NOT write are now reported rather than swallowed. */
let quotaWarned = false;
function writeNow() {
  clearTimeout(saveTimer); saveTimer = null;
  /* A live profile is not on this phone: see the LIVE block. Nothing of it
     is written, including the crash snapshot, because a half-typed form
     belonging to a profile that will be re-fetched from scratch is not
     worth a byte on a device that is short of them. Reported as TRUE: the
     rows are exactly as kept as they are ever meant to be. */
  if (typeof syncLive === "function" && syncLive(profiles.active)) return true;
  snapshotDrafts();
  /* the whole point of the block above: what is on screen is a blank the
     app invented, and the key still holds the real thing */
  if (unreadable === profiles.active) {
    if (!unreadableWarned) {
      unreadableWarned = true;
      try { alert(T("profiles.unreadable")); } catch { /* no UI here */ }
    }
    return false;
  }
  try { localStorage.setItem(stateKeyFor(profiles.active), JSON.stringify(state)); return true; }
  catch (e) {
    console.error("save failed", e);
    /* A full browser store used to fail in silence, which is the worst way
       for it to fail: everything keeps working on screen and none of it is
       being kept. Said once, because a debounced save says it every 400ms. */
    if (!quotaWarned) { quotaWarned = true; try { alert(T("profiles.quota")); } catch { /* no UI here */ } }
    return false;
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 400);
  /* One hook for the whole app: every mutation already goes through here,
     so automatic sync sees every change without a single call site knowing
     it exists. Defined further down, hence the guard on first load. */
  if (typeof syncTouch === "function") syncTouch();
}
function patch(p) { state = { ...state, ...p }; persist(); render(); }

/* ── SWITCHING, AND THE FOUR THINGS YOU CAN DO TO A PROFILE ──────────
   Every one of these flushes the profile being left before it touches
   anything, because `state` is only written on a debounce and the last few
   hundred milliseconds of it would otherwise be dropped on the floor.

   Switching is a bigger event than it looks: `ui` is full of things that
   belong to the profile being left — an open workout, a half-typed set, a
   chart selection, an exercise window — and none of them mean anything in
   the next one. So the screen is cleared back to Home rather than left
   pointing at rows that no longer exist. */
function closeEverything() {
  ui.workoutSheet = null; ui.entryForm = null; ui.setForm = null; ui.picking = false;
  ui.pickerQ = ""; ui.pickerQuick = null;
  ui.exWin = null; ui.exWinEdit = false; ui.exWinDraft = null; ui.exWinAttach = null;
  ui.showProfile = false; ui.profileDraft = null; ui.profileLangWas = null;
  ui.showBody = false; ui.bodyForm = null;
  ui.groupSheet = false; ui.groupForm = null;
  ui.presetForm = null; ui.presetView = null;
  ui.timerForm = null; ui.deloadForm = null; ui.planResult = null;
  ui.stdPick = false; ui.std = null; ui.stdResult = null;
  ui.profilesWin = false; ui.profileForm = null; ui.profileOrder = false;
  /* the sync sheets name a profile by id, so leaving one open across a
     switch would point them at somebody else's */
  ui.syncSheet = null; ui.joinSheet = null; ui.syncError = null; ui.accountSheet = null;
}

function switchProfile(id) {
  if (id === profiles.active || !profiles.list.some((p) => p.id === id)) return;
  /* A day half-built when you switch away is PARKED, not merely hidden:
     closeWorksheet is the same back-out the window's own arrow does, so it
     is waiting at the top of the Log tab when you come back rather than
     living on invisibly in the crash snapshot. */
  if (ui.workoutSheet) closeWorksheet();
  writeNow();
  /* before `profiles.active` moves, or the flush pushes the wrong profile */
  if (typeof syncFlush === "function") syncFlush();
  profiles.active = id;
  saveProfiles();
  state = loadState();
  closeEverything();
  resetTransient();
  ui.tab = "home";
  applyTheme(state.settings.theme);
  render();
  /* a live profile has nothing on disk, so what loadState just handed back
     is an empty default; the rows come off the server */
  liveEnter(id);
}

/* A new profile starts empty, exactly as the app does on a new phone: the
   seeded library, the seeded timers, nothing logged.

   ── EXCEPT ONE THAT IS ABOUT TO BE FILLED FROM THE SERVER ─────────────
   `forRemote` is a profile being made to HOLD somebody's cloud copy —
   joined with a code, pulled from the account, adopted by the roster.
   Those start with the library and the groups EMPTY, because the seeds
   are not this profile's data, they are this app's opening offer, and
   every one of them is about to be overwritten by the real thing anyway.

   What they used to do instead was survive. The owner had deleted five
   built-in exercises and renamed a group; the pull replaced the rows the
   owner still had and left the other five sitting there, unmatched and
   unmarked — so the joining device pushed them back up as its own, and
   the five lifts the owner had thrown out reappeared in their library
   with nobody having asked for them. A profile that is a copy of another
   one has to start from nothing, or it is not a copy, it is a merge.
   Live profiles have always done exactly this (see liveEnter); this is
   the same rule applied to the copies that are kept on disk.

   The timers are deliberately still seeded: they never sync, they belong
   to the phone rather than to the training, and an empty Timer tab is
   not what anybody joining a profile is asking for. */
function addProfile(name, opts) {
  writeNow();
  const id = uid();
  const blank = opts && opts.forRemote
    ? { ...defaultState(), library: [], groups: [] }
    : defaultState();
  try { localStorage.setItem(stateKeyFor(id), JSON.stringify(blank)); }
  catch (e) { console.error("profile create failed", e); alert(T("profiles.quota")); return null; }
  profiles.list = [...profiles.list, { id, name: (name || "").trim() }];
  saveProfiles();
  return id;
}

/* A copy is the same training carried over, which is the point: a block you
   want to try a different way without giving up the one you are in. The
   crash snapshot is left behind (see backupText for why a half-typed set
   editor is not part of anybody's training). */
function duplicateProfile(id, name) {
  if (id === profiles.active) writeNow();
  const newId = uid();
  try {
    const raw = localStorage.getItem(stateKeyFor(id));
    const data = raw ? JSON.parse(raw) : defaultState();
    delete data.drafts;
    localStorage.setItem(stateKeyFor(newId), JSON.stringify(data));
  } catch (e) { console.error("profile copy failed", e); alert(T("profiles.quota")); return null; }
  const at = profiles.list.findIndex((p) => p.id === id);
  const row = { id: newId, name: (name || "").trim() };
  profiles.list = [...profiles.list.slice(0, at + 1), row, ...profiles.list.slice(at + 1)];
  saveProfiles();
  return newId;
}

/* Deleting the last profile would leave the app with nothing to load at
   all, so it is refused rather than quietly recreated; deleting the one you
   are in moves you to a neighbour first. */
function deleteProfile(id) {
  if (profiles.list.length < 2) return;
  const wasActive = id === profiles.active;
  const rest = profiles.list.filter((p) => p.id !== id);
  const next = wasActive ? rest[0].id : profiles.active;
  profiles = { active: next, list: rest };
  saveProfiles();
  try { localStorage.removeItem(stateKeyFor(id)); } catch { /* already gone */ }
  /* and its sync link, or zenofit:profiles keeps a remoteId under a local id
     that no longer exists — which a later profile could never be given,
     since ids are minted fresh, but which sits there naming somebody's
     cloud profile forever */
  syncForget(id);
  if (wasActive) {
    state = loadState();
    closeEverything();
    resetTransient();
    ui.tab = "home";
    applyTheme(state.settings.theme);
  }
}

function reorderProfiles(from, to) {
  const all = [...profiles.list];
  if (from >= all.length || to >= all.length) return;
  const [moved] = all.splice(from, 1);
  all.splice(to, 0, moved);
  profiles.list = all;
  saveProfiles();
  rosterPushOrder();
  render();
}

/* What is in each one, for the line under its name. Read once when the
   window opens rather than on every frame: this parses each profile's whole
   state, and the active one is re-rendered on every keystroke. */
function profileStats() {
  const out = {};
  for (const p of profiles.list) {
    let d = null;
    if (p.id === profiles.active) d = state;
    else { try { d = JSON.parse(localStorage.getItem(stateKeyFor(p.id))); } catch { d = null; } }
    out[p.id] = d
      ? { days: new Set((d.log || []).map((e) => e.date)).size, entries: (d.log || []).length }
      : { days: 0, entries: 0 };
  }
  return out;
}

/* ── SYNC: ONE PROFILE, MORE THAN ONE PHONE ───────────────────────────
   Everything above here is local-first and stays that way. The log on
   this device is the log; nothing waits on a network to be counted, and
   the app works exactly as well in a basement with no signal. Sync is a
   COPY kept somewhere else, never the store.

   It is also OFF until somebody turns it on, per profile, out loud. A
   training log is the most personal thing in here and it does not start
   leaving the phone because an update landed.

   WHAT A PROFILE IS ON EITHER SIDE. Locally a profile is a whole state
   object under its own key (see stateKeyFor). On the server it is a row
   plus a pile of items, each one {collection, itemId, json}. The bridge
   between them is a remoteId, and it lives OUTSIDE state in SYNC_KEY,
   for the same reason zenofit:device does: backupText serialises state,
   a backup is a file people share, and a handle on somebody's cloud
   profile is not training data. Restoring a backup onto a second phone
   must not quietly hand it the keys to the original.

   WHAT TRAVELS is SYNC_COLLECTIONS and nothing else. The server enforces
   the same list and refuses an unknown collection BY NAME rather than
   dropping it quietly, so the two lists disagreeing is loud. Deliberately
   absent: `drafts`, which is a photograph of a half-typed set editor, and
   `timers`, which carry a cloudId naming a push alarm booked for ONE
   device. Of `settings` only the training half travels — units, start
   date, week mode, sex, name — because theme and language are properties
   of a phone rather than of a person's training, and having her dark mode
   follow his device around is nobody's idea of a feature.

   HOW A CHANGE IS FOUND. Nothing in this app stamps an edit: a log entry
   has createdAt and has never had an updatedAt, and adding one would mean
   touching every one of the hundreds of places that write. So `marks`
   holds a short hash per item from the last time it went up, and a push is
   whatever no longer matches, plus a tombstone for anything whose mark
   outlived its item. That is change detection with no cooperation required
   from the rest of the file, and it cannot miss an edit made by code that
   has never heard of sync.

   The clientUpdatedAt stamped alongside is the moment the change was
   DETECTED, which is the first sync after the edit rather than the edit
   itself. That is honest for the one thing the server uses it for, which
   is refusing to go backwards. It is NOT a merge policy: two people
   editing the same set between two syncs is not a case this resolves, and
   dressing it up as one would be worse than saying so plainly.          */

const SYNC_KEY = "zenofit:profiles";
const SYNC_PAGE = 200;            // the server's own per-push ceiling
/* The server's MAX_ITEM_BYTES, kept a little under it: the two sides count
   the same JSON, but a margin means a rounding difference can never turn a
   row we thought was fine into a batch the server throws out whole. */
const SYNC_MAX_ITEM = 500 * 1024;
/* The server's own cap on an itemId. An itemId here is frequently a NAME —
   the exercise a goal belongs to, the muscle group a volume target is for —
   and a name the server refuses fails the WHOLE push, for ever, silently.
   See syncPush: a row it would refuse never joins a batch. */
const SYNC_MAX_ID = 200;
/* Below this many deletions in one push, nothing is questioned: scrapping a
   day, clearing a few goals and renaming a group all land in single figures.
   Above it, see the block in syncPush — a push is refused when it would
   delete more than the profile still holds. */
const SYNC_WIPE_FLOOR = 10;
/* One push's worth of permission to do exactly that, granted only by
   allowOverwrite() and spent by the next push that asks. */
let syncWipeOk = false;

/* ── A PHOTO THAT CANNOT TRAVEL MUST NOT TAKE THE LIFT WITH IT ────────
   The photo is by far the biggest thing in this app: 1000px of JPEG in
   base64, routinely 200-500 KB and sometimes past the limit (see
   readImageScaled). A library row over the limit used to be left behind
   WHOLE, which meant the exercise did not travel either — so the person
   the profile was shared with opened a log full of sessions naming a lift
   their library had never heard of, and nothing on either screen said
   which row was responsible.

   The lift is the part that matters and it is tiny. So the picture is
   dropped and the row goes up carrying `imageMissing`, which is not a
   consolation prize: it is the fact that there IS a photo, on the device
   that took it, and it is what lets the other phone say so instead of
   drawing a blank where a machine should be. Sending less than we hold is
   safe in exactly one direction and syncApply enforces it: a row that
   says "the photo could not come" never erases a photo already there.

   Done HERE rather than in syncPush so the trimmed row is built before
   `__i` is appended, which keeps the key order — and therefore the change
   hash — identical on the device that sent it and the device that got it.
   Two devices disagreeing about that hash is a row that pushes itself
   back and forth for ever, one request per sync, changing nothing.    */
const withoutBigPhoto = (ex) => {
  if (!ex || !ex.image) return ex;
  /* the margin covers the `__i` this row is about to be given */
  if (JSON.stringify(ex).length + 16 <= SYNC_MAX_ITEM) return ex;
  return { ...ex, image: "", imageMissing: true };
};

const syncAll = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; } };
const syncFor = (localId) => syncAll()[localId] || null;
/* A sync record can exist WITHOUT a link: turning sync off leaves one
   behind saying `noSync`, so the roster does not helpfully enrol the
   profile straight back on its next pass. Everything asking "is this
   profile in the cloud" has to ask for the remoteId, not for the record. */
const syncLinked = (localId) => { const r = syncFor(localId); return r && r.remoteId ? r : null; };
const syncedActive = () => syncFor(activeProfileId());
/* a read grant: all of it visible, none of it ours to change */
const syncReadOnly = () => { const r = syncedActive(); return !!(r && r.level === "read"); };

function syncSet(localId, patch) {
  const all = syncAll();
  all[localId] = { ...(all[localId] || {}), ...patch };
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(all)); }
  catch (e) { console.error("sync index save failed", e); }
  return all[localId];
}

function syncForget(localId) {
  const all = syncAll();
  delete all[localId];
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(all)); } catch { /* nothing to forget */ }
}

/* `order: true` marks a list whose ORDER the user set and can see: the
   muscle groups, the presets, the library. An item store has no order, so
   those carry their index and are sorted back into it on the way in.
   Everything else is drawn sorted by date or by name wherever it appears,
   so its array position means nothing and is not worth a field. */
const SYNC_COLLECTIONS = {
  log:         { id: (x) => x.id },
  body:        { id: (x) => x.id },
  plans:       { id: (x) => x.id },
  deloads:     { id: (x) => x.id },
  dayDrafts:   { id: (x) => x.id },
  unlogged:    { id: (x) => x.date },
  presets:     { id: (x) => x.id, order: true },
  library:     { id: (x) => x.id, order: true },
  groups:      { id: (x) => x.name, order: true },
  goals:       { map: true },
  volumeGoals: { map: true },
  settings:    { map: true, keys: ["units", "startDate", "weekMode", "sex", "name"] },
};

/* djb2, base36. Short, fast, and only ever compared with itself: this
   answers "did this item change", never "are these two items equal". */
function syncHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* A profile as the wire sees it. Defaults to the active one, because that
   is the only one held in memory; the parameter exists for the first push
   of a profile being put into the account from the account sheet, which is
   a list where the profile you are tapping is usually not the one you are
   looking at. */
function syncLocalItems(from) {
  const src0 = from || state;
  const out = [];
  for (const collection of Object.keys(SYNC_COLLECTIONS)) {
    const def = SYNC_COLLECTIONS[collection];
    const src = src0[collection];
    if (def.map) {
      if (!src || typeof src !== "object") continue;
      for (const k of Object.keys(src)) {
        if (def.keys && def.keys.indexOf(k) < 0) continue;
        if (src[k] === undefined) continue;
        /* an empty key is an itemId the server refuses, and it would take
           the whole batch with it. The array branch has always guarded
           this; a map is reached from the other end and never did. */
        if (!k) continue;
        /* wrapped, because an item's json has to be an object and a goal
           is a bare number */
        out.push({ collection, itemId: k, json: { v: src[k] } });
      }
    } else {
      if (!Array.isArray(src)) continue;
      src.forEach((item, i) => {
        const itemId = def.id(item);
        if (itemId == null || itemId === "") return;
        /* the picture is the only thing in here that has ever been too big
           for the wire, and it is not worth the lift it is attached to */
        const row = collection === "library" ? withoutBigPhoto(item) : item;
        out.push({
          collection, itemId: String(itemId),
          json: def.order ? { ...row, __i: i } : row,
          heldPhoto: row !== item,
        });
      });
    }
  }
  return out;
}

/* One pulled page, folded into the state in memory. Returns how many items
   actually landed, so a caller can tell a real change from a page of
   things this device already had. */
function syncApply(items, into) {
  const dst = into || state;
  let n = 0;
  const touched = new Set();
  for (const it of items || []) {
    const def = SYNC_COLLECTIONS[it.collection];
    if (!def) continue;                    // a collection this build has never heard of
    touched.add(it.collection);
    if (def.map) {
      if (def.keys && def.keys.indexOf(it.itemId) < 0) continue;
      const bag = { ...(dst[it.collection] || {}) };
      if (it.deleted) delete bag[it.itemId];
      else if (it.json && "v" in it.json) bag[it.itemId] = it.json.v;
      else continue;
      dst[it.collection] = bag;
      n++;
    } else {
      const list = Array.isArray(dst[it.collection]) ? [...dst[it.collection]] : [];
      const at = list.findIndex((x) => String(def.id(x)) === String(it.itemId));
      if (it.deleted) { if (at >= 0) { list.splice(at, 1); n++; } }
      else if (it.json) {
        const row = { ...it.json };
        delete row.__i;
        /* ── A ROW THAT SAYS "THE PHOTO COULD NOT COME" NEVER TAKES ONE ──
           syncPush sends a library row without its picture when the
           picture is too big for the wire, and the server does not filter
           a pull by the device that wrote it — so the phone that stripped
           the photo pulls the stripped row straight back. Applied
           literally that is a phone deleting its own photograph the
           moment it shares the profile. The flag only ever means "there
           is one elsewhere", so wherever a photo is actually held, the
           photo wins and the flag goes. */
        if (row.imageMissing && at >= 0 && list[at] && list[at].image) {
          row.image = list[at].image;
          delete row.imageMissing;
        }
        if (at >= 0) list[at] = row; else list.push(row);
        n++;
      } else continue;
      dst[it.collection] = list;
    }
  }
  /* ── AN ITEM STORE HAS NO ORDER, AND A PAGE IS NOT THE WHOLE LIST ────
     The three lists whose order the user set and can see carry their index
     as `__i`, and the list is sorted back into it on the way in. The trap
     is what to do about a row the page did NOT mention: it used to sort
     last, which is only correct when the page IS the whole collection.
     It almost never is. Renaming one exercise on the other phone pushes
     exactly one library row, so this arrived holding one index and an
     opinion about nothing else — and sorted that single row to the top of
     the library while every other row fell in behind it. The local order
     then went back up as if somebody had meant it, and the two devices
     spent the rest of the day shuffling each other's library.

     A row the page did not mention keeps THE PLACE IT ALREADY HAS, which
     is the only honest reading of a page that says nothing about it. A
     move really made on the other device still lands whole, because
     moving one row renumbers every row after it and pushes all of them,
     so the page carries the part of the list that actually changed. */
  for (const c of touched) {
    const def = SYNC_COLLECTIONS[c];
    if (!def.order || !Array.isArray(dst[c])) continue;
    const ix = new Map();
    for (const it of items)
      if (it.collection === c && it.json && typeof it.json.__i === "number") ix.set(String(it.itemId), it.json.__i);
    if (!ix.size) continue;
    dst[c] = dst[c]
      .map((x, i) => { const k = String(def.id(x)); return { x, at: ix.has(k) ? ix.get(k) : i, i }; })
      .sort((a, b) => (a.at - b.at) || (a.i - b.i))
      .map((r) => r.x);
  }
  return n;
}

/* ── THE TWO HALVES ──────────────────────────────────────────────────
   Both take a LOCAL profile id and both assume it is the active one,
   because `state` IS the active profile and syncing one you are not
   looking at would mean holding a second profile in memory beside it.
   You sync what is in front of you. */

async function syncPull(localId) {
  const rec = syncFor(localId);
  if (!rec || !rec.remoteId) return { ok: false, reason: "not-linked" };
  const C = window.ZenofitCloud;
  if (!C || typeof C.pullChanges !== "function") return { ok: false, reason: "no-client" };

  /* ── THE ONE THAT IS ON SCREEN, OR ONE THAT IS NOT ──────────────────
     This used to assume the active profile, because `state` IS the active
     profile and there was nowhere else to put rows. That assumption is
     what made signing in on a second device a list of empty profiles you
     had to visit one at a time before any of them had anything in them.
     A profile that is not on screen is read off its own key, filled, and
     written back; `state` is never touched for one, and the screen never
     repaints for one. A LIVE profile is never pulled this way at all —
     the whole point of one is that nothing of it is on this phone. */
  const onScreen = localId === activeProfileId();
  if (!onScreen && syncLive(localId)) return { ok: false, reason: "live-offscreen" };
  const into = onScreen ? state : readProfileState(localId);

  let cursor = rec.cursor || null, applied = 0, level = rec.level, guard = 0, kept = true;
  const was = rec.level;

  /* ── THE PAGE GOES DOWN BEFORE THE CURSOR THAT SAYS WE HAVE IT ───────
     This loop used to persist `marks` and `cursor` per page and write the
     ROWS once, after the loop. Every way out of the middle of it — a
     page that throws, a phone locking, a full store — therefore left the
     device holding a cursor past rows it never saved and marks claiming
     rows it never had. Nothing on screen said so, and the damage did not
     surface here at all: syncPush reads a mark with no item behind it as
     something DELETED on this device, so the next quiet push turned every
     one of those rows into a tombstone and took them off every device on
     the account.

     So the order is inverted. The rows are written first, and the cursor
     only moves if the write actually happened — which is why writeNow and
     writeProfileState now report. A page that cannot be kept ends the
     loop with the cursor where it was, so the very same page is fetched
     again next pass; the server pages by (updated_at, collection, itemId)
     and the client upserts by itemId, so refetching one is free.

     The on-screen test is repeated rather than trusted, because `onScreen`
     was decided before the first request and a profile switch inside a
     page loop invalidates it: `into` and `state` are two different objects
     by then and writing either over the other loses somebody's edits. That
     page is dropped too, for the same reason and at the same cost. */
  const keepPage = () => {
    if (syncLive(localId)) return true;                       // holds nothing, by design
    if ((localId === activeProfileId()) !== onScreen) return false;   // switched under us
    return onScreen ? writeNow() : writeProfileState(localId, into);
  };

  /* a cursor, never a bare timestamp, once we have one: saving a workout
     stamps every set in it with the same millisecond, and `since` cannot
     separate rows that share one */
  while (guard++ < 500) {
    const res = await C.pullChanges(rec.remoteId, cursor || { since: 0, limit: SYNC_PAGE });
    if (res.level) level = res.level;
    const landed = syncApply(res.items, into);
    applied += landed;
    if (landed && !keepPage()) { kept = false; break; }
    /* marks follow what just landed, or the very next push hands the server
       its own rows straight back */
    const marks = { ...((syncFor(localId) || {}).marks || {}) };
    for (const it of res.items || []) {
      const key = it.collection + "/" + it.itemId;
      if (it.deleted) delete marks[key];
      else marks[key] = [syncHash(JSON.stringify(it.json)), it.clientUpdatedAt || it.updatedAt || Date.now()];
    }
    cursor = res.cursor || cursor;
    const patch = { marks, cursor, level, lastPulledAt: Date.now() };
    /* ── A LIVE PROFILE IS ONLY EVER A READ GRANT ──────────────────────
       The other direction of the same news. If the owner has given this
       phone write access, the profile stops being a window onto theirs
       and becomes one to train in — and a live profile is one writeNow
       refuses to save, so leaving the flag up would mean her sessions
       went to the server and nowhere else, and a launch with no signal
       would open an empty log she had been writing in all week. */
    if (level !== "read" && (syncFor(localId) || {}).live) patch.live = false;
    syncSet(localId, patch);
    if (!res.hasMore) break;
  }
  /* Each page has already written itself. This is only for a profile that
     stopped being live during the loop, whose rows were deliberately not
     written while the flag was up — and never for a loop that bailed,
     where `into` is precisely the thing that must not be saved. */
  const settled = !syncLive(localId) && rec.live;   // just stopped being live
  if (settled && kept) {
    if (onScreen) writeNow();
    else writeProfileState(localId, into);
  }
  /* Every pull carries the level the server has for this device, so a
     profile that was shared "can edit" and has since been moved to read
     only is found here rather than on the next failed push. Reported back
     rather than acted on, because turning it into a live profile means
     re-fetching it, and re-entering this function from inside itself is
     not a thing to do halfway through a page loop. */
  return { ok: true, applied, level, demoted: was !== "read" && level === "read" };
}

/* A grant that has just become read-only. The local copy is somebody
   else's training and the server is now the only thing allowed to change
   it, so it stops being a copy and becomes the live view the read path was
   built for: nothing of it on this phone, fetched fresh, and the screen
   locked by syncReadOnly on the very next frame. */
function syncDemoted(localId) {
  if (!syncLive(localId) && liveAdopt(localId) && localId === activeProfileId()) liveEnter(localId);
}

/* The active profile is `state`; any other one is still on disk. Only the
   FIRST push of a profile being put into the account ever asks for another,
   and only for reading — nothing here writes to a profile that is not on
   screen. (readProfileState's `unreadable` latch is filed by id, so asking
   it about a neighbour cannot disarm the guard on the one you are in.) */
const profileStateFor = (localId) =>
  (localId === activeProfileId() ? state : readProfileState(localId));

async function syncPush(localId) {
  const rec = syncFor(localId);
  if (!rec || !rec.remoteId) return { ok: false, reason: "not-linked" };
  if (rec.level === "read") return { ok: false, reason: "read-only" };
  const C = window.ZenofitCloud;
  if (!C || typeof C.pushChanges !== "function") return { ok: false, reason: "no-client" };

  /* ── A BLANK THE APP INVENTED IS NOT AN EMPTY PROFILE ────────────────
     readProfileState hands back defaultState() for a save that will not
     parse, and writeNow refuses to overwrite the key so the real bytes
     survive for Storage check to rescue. That protection stopped at the
     edge of this device: the blank on screen was pushed anyway, and every
     row the marks named and the blank did not hold went up as a delete.
     The app kept the local copy and destroyed the cloud one. */
  if (unreadable === localId) return { ok: false, reason: "unreadable" };

  const marks = { ...(rec.marks || {}) };
  const now = Date.now();
  const queue = [];
  const seen = new Set();
  const tooBig = [];
  const heldPhotos = [];
  /* ── A MARK IS EARNED BY THE BATCH THAT CARRIED IT, NOT BY BEING QUEUED
     `marks` used to be stamped here, in the sweep that builds the queue,
     and persisted whole after the FIRST batch came back. A push of 450
     rows whose second batch failed therefore recorded all 450 as sent
     while the server held 200. The hash matched from then on, so the
     other 250 were never offered again: stranded on one device, silently,
     for ever — and read as deletions by the next device to push.

     So a hash waits here until the batch it travelled in is accepted. */
  const pending = new Map();

  for (const it of syncLocalItems(profileStateFor(localId))) {
    const key = it.collection + "/" + it.itemId;
    seen.add(key);
    const body = JSON.stringify(it.json);
    /* ── ONE ROW THE SERVER WOULD REFUSE MUST NOT STOP THE OTHER FOUR
       HUNDRED ──────────────────────────────────────────────────────────
       The server validates the whole batch before writing any of it and
       refuses all of it if one item is bad, which is the right call there:
       a push that half-lands leaves the client unable to say what it still
       owes. The consequence on this side is the part that bit — a single
       bad row meant the profile NEVER uploaded, so the person it was
       shared with opened it and saw an empty log, with nothing on either
       screen naming the row responsible.

       Two things can make a row unsendable. Its SIZE, which used to mean
       an exercise photo and now cannot: withoutBigPhoto has already left
       the picture behind so the lift itself travels, and anything still
       over the limit after that is a genuinely enormous row. And its
       ITEMID, which for a goal or a volume target is an exercise or group
       NAME, and a long enough one is refused outright.

       Either way it is left behind and NAMED instead: everything else
       syncs and the sheet says how many did not. Deliberately not marked
       as sent, so fixing the row makes it go next time with no extra
       bookkeeping. */
    if (it.itemId.length > SYNC_MAX_ID) { tooBig.push(key); continue; }
    if (body.length > SYNC_MAX_ITEM) { tooBig.push(key); continue; }
    /* recorded whether or not the row itself has changed since the last
       push: a photo left behind is a standing fact about this profile,
       not an event that happened during one sync */
    if (it.heldPhoto) heldPhotos.push(key);
    const h = syncHash(body);
    if (marks[key] && marks[key][0] === h) continue;          // unchanged since last time
    pending.set(key, h);
    queue.push({ collection: it.collection, itemId: it.itemId, json: it.json, clientUpdatedAt: now });
  }
  /* a mark with no item behind it is something deleted on this device */
  const tombs = [];
  for (const key of Object.keys(marks)) {
    if (seen.has(key)) continue;
    const cut = key.indexOf("/");
    tombs.push({ collection: key.slice(0, cut), itemId: key.slice(cut + 1), json: null, deleted: true, clientUpdatedAt: now });
  }

  /* ── NOTHING DELETES A PROFILE BY ACCIDENT, EVER AGAIN ───────────────
     Every path above is now honest about what it holds, and this is the
     backstop for the one after it that is not. A tombstone is generated
     from an ABSENCE — a mark with no item behind it — which means any bug
     that empties or half-fills the local state reads, here, as the user
     having deleted their entire training. It is the one operation in this
     app that is irreversible on every device at once, and it was reached
     by inference, unattended, on a timer.

     So a push is refused when it would delete more rows than the profile
     still holds AND that is more than a handful. Both halves matter: the
     second lets ordinary tidying through (scrapping a day, clearing a few
     goals) and the first lets a genuinely small profile shrink. What
     cannot get through is 139 deletions from a state holding five rows,
     which is what every bug in this file looks like from here.

     It is not a lock. allowOverwrite() — importing a backup, Reset all
     data — is the user saying "replace what is there" out loud, behind a
     confirm, and it opens this for exactly one push. And a refusal keeps
     the marks untouched, so nothing is lost: once a pull has put the
     profile back, the same push goes through on its own. */
  const wouldWipe = tombs.length >= SYNC_WIPE_FLOOR && tombs.length > seen.size;
  if (wouldWipe && !syncWipeOk) {
    console.error("sync: refusing to delete", tombs.length, "items from a profile holding", seen.size);
    syncSet(localId, { tooBig, heldPhotos, wipeBlocked: { at: Date.now(), tombs: tombs.length, held: seen.size } });
    return { ok: false, reason: "wipe-blocked", tombs: tombs.length, held: seen.size };
  }
  /* spent only by the push that actually needed it, so a debounced save
     landing between the import and its own push cannot quietly eat the
     permission and leave the restore blocked */
  if (wouldWipe) syncWipeOk = false;
  /* and carried to the server, which keeps the same refusal for the same
     reason and does not get to see the confirm this device already showed */
  const allowWipe = wouldWipe;
  queue.push(...tombs);
  syncSet(localId, { tooBig, heldPhotos, wipeBlocked: null });
  if (!queue.length) { syncSet(localId, { lastPushedAt: Date.now() }); return { ok: true, sent: 0, stale: 0, tooBig, heldPhotos }; }

  let sent = 0, stale = 0;
  for (let i = 0; i < queue.length; i += SYNC_PAGE) {
    const batch = queue.slice(i, i + SYNC_PAGE);
    const res = await C.pushChanges(rec.remoteId, batch, { allowWipe });
    sent += res.accepted || 0;
    const staleKeys = new Set((res.staleItems || []).map((s) => s.collection + "/" + s.itemId));
    stale += staleKeys.size;
    for (const b of batch) {
      const key = b.collection + "/" + b.itemId;
      /* a stale row loses its mark so the next sync offers it again, after
         a pull has shown us what the other device had to say */
      if (staleKeys.has(key)) { delete marks[key]; continue; }
      if (b.deleted) delete marks[key];
      /* and here is where a hash is finally earned: this row was in THIS
         batch, and this batch came back accepted */
      else if (pending.has(key)) marks[key] = [pending.get(key), now];
    }
    syncSet(localId, { marks, lastPushedAt: Date.now() });
  }
  return { ok: true, sent, stale, tooBig, heldPhotos };
}

/* What the account has up there, for the list in the account sheet. Async
   and fire-and-forget, like refreshGrants: a list that will not load leaves
   a row saying so, never an error on top of a form somebody is still
   filling in. Guarded on the sheet still being open and still being the
   same one, because a round trip outlives a close. */
function refreshCloudProfiles() {
  const C = window.ZenofitCloud;
  if (!ui.accountSheet || !C || !C.signedIn || !C.signedIn()) return;
  ui.accountSheet = { ...ui.accountSheet, loading: true };
  render();
  C.listProfiles()
    .then((res) => {
      if (!ui.accountSheet) return;
      /* `loaded` is the difference between "the account holds nothing else"
         and "we have not asked yet", and the list reads differently in the
         two cases: a linked profile missing from a listing that never
         arrived means nothing at all. */
      ui.accountSheet = { ...ui.accountSheet, loading: false, loaded: true, cloud: (res && res.profiles) || [] };
      render();
    })
    .catch(() => {
      if (!ui.accountSheet) return;
      ui.accountSheet = { ...ui.accountSheet, loading: false };
      render();
    });
}

/* ── WHAT WENT WRONG, IN WORDS SOMEBODY CAN ACT ON ────────────────────
   The server is specific and this used to throw that away: it reported
   `e.code` and nothing else, so "bad_item" appeared on screen while the
   message beside it said exactly which row was too big and by how much.
   Somebody stared at a profile that would not sync and had no way to
   learn that one exercise photo was the reason.

   Two codes are translated rather than shown raw, because the raw word is
   actively misleading. `not_found` on a profile you are linked to does
   not mean it is gone: it means THIS device cannot see it, which is what
   happens when the grant was revoked or the phone is signed in as
   somebody else. `read_only` likewise. Everything else keeps the server's
   own sentence, which is nearly always the most useful thing available. */
function syncErrText(e) {
  if (!e) return T("sync.errGeneric");
  const code = e.code;
  if (code === "not_found" || e.status === 404) return T("sync.errGone");
  if (code === "read_only" || e.status === 403) return T("sync.errReadOnly");
  if (e.message) return e.message;
  return code || T("sync.errGeneric");
}

/* Who is in, for the list in the share sheet. Its own function because it
   is wanted after joining, after revoking and after opening the sheet, and
   it must never be the reason any of those three fail: a grants list that
   would not load is a row that says nothing, not an error over the top of
   a code somebody is still copying. */
function refreshGrants() {
  const f = ui.syncSheet;
  const rec = f && syncFor(f.localId);
  if (!rec || !rec.remoteId || rec.level === "read") return;
  const C = window.ZenofitCloud;
  if (!C || typeof C.listGrants !== "function") return;
  C.listGrants(rec.remoteId)
    .then((res) => {
      if (!ui.syncSheet || ui.syncSheet.localId !== f.localId) return;   // sheet moved on
      ui.syncSheet = { ...ui.syncSheet, grants: (res && res.grants) || res || [] };
      render();
    })
    .catch(() => { /* the sheet is still useful without it */ });
}

/* Pull first, then push. The server's copy is the one another device may
   have moved on, and writing over it before reading it is exactly how an
   edit made somewhere else disappears with nobody watching. */
async function syncNow(localId = activeProfileId()) {
  const rec = syncFor(localId);
  if (!rec || !rec.remoteId) return { ok: false, reason: "not-linked" };
  if (ui.syncBusy) return { ok: false, reason: "busy" };
  ui.syncBusy = true; ui.syncError = null; render();
  try {
    const pulled = await syncPull(localId);
    /* re-read rather than trusting `rec`: the pull is what learns the level,
       and one that has just turned read-only must not be pushed to */
    const now = syncFor(localId) || rec;
    const pushed = now.level === "read" ? { ok: true, sent: 0 } : await syncPush(localId);
    /* a refused wipe is not a sync that worked, and the button must not
       report one: see the block in syncQuiet for why this one speaks up */
    if (pushed && pushed.reason === "wipe-blocked") {
      ui.syncError = T("sync.errWipeBlocked", { tombs: pushed.tombs, held: pushed.held });
      return { ok: false, pulled, pushed };
    }
    syncSet(localId, { lastOkAt: Date.now() });
    if (pulled.demoted) syncDemoted(localId);
    return { ok: true, pulled, pushed };
  } catch (e) {
    /* pullChanges and pushChanges THROW, unlike the rest of the client, so
       a revoked grant arrives as a 403 rather than as an empty profile */
    ui.syncError = syncErrText(e);
    console.warn("sync failed", e);
    return { ok: false, error: e };
  } finally {
    ui.syncBusy = false; render();
  }
}

/* ── A PROFILE THAT IS NOT ON THIS PHONE ──────────────────────────────
   Everything else in this app is local-first and stays that way. This is
   the one deliberate exception, and it exists for a real person: a phone
   too full to save anything, and a training log she still wants to look
   at. Her sessions live on the phone that owns them; hers just shows them.

   A LIVE profile is read-only and holds NOTHING on disk. `state` is
   filled from the server into memory when you switch to it, and writeNow
   refuses to write its key, so closing the app forgets it entirely and
   opening it fetches again. That is the whole trick — there is no clever
   eviction, just a profile the save path declines to save.

   WHAT IT COSTS, said plainly: no signal means no profile. Every other
   profile in this app works in a basement with the phone in flight mode,
   and this one does not. That is the trade, it was chosen on purpose, and
   it is only ever applied to a READ grant — somebody else's training,
   which they are still holding the real copy of. A profile you own is
   never live, because losing your own log to a dead connection is not a
   trade anybody would take.

   Read-only is what makes it safe: with nothing of yours in there, there
   is nothing a failed fetch can lose. See READ_OK, which already refuses
   every write, and syncReadOnly, which is what marks the strip at the top
   of the screen.

   The cursor is dropped on the way in. A cursor says "I have everything
   up to here", and a live profile starts every session with nothing, so
   the incremental path would hand back an empty page and an empty log. */

const syncLive = (localId) => { const r = syncFor(localId || activeProfileId()); return !!(r && r.live); };

/* Switching into one: forget what a previous session cached, then fetch.
   Nothing is awaited by the caller — the app draws the empty profile with
   its "fetching" strip and fills in when the rows land. */
function liveEnter(localId) {
  if (!syncLive(localId)) return;
  /* From scratch, always. A cursor says "I have everything up to here" and
     a live profile starts every session with nothing, so the incremental
     path would hand back an empty page and an empty log. Starting blank
     also means what you end up looking at is EXACTLY what the server holds,
     tombstones and all, rather than a merge with whatever happened to be
     left over. */
  syncSet(localId, { cursor: null, marks: {} });
  const fallback = state;
  state = defaultState();
  ui.liveLoading = true;
  render();
  syncPull(localId)
    .then((res) => {
      /* ── A PULL THAT RESOLVED IS NOT A PULL THAT FETCHED ──────────────
         syncPull only REJECTS on a network or permission failure. Every
         other way it gives up — no link, no cloud client because the
         script did not load, a live profile asked for off screen —
         resolves with {ok:false}, lands here, and used to delete the key
         on the strength of it. `state` is already the blank by then, so
         that is the app throwing away the copy it has and replacing it
         with nothing, in the one case where it could not check. Treated
         as the failure it is: put back what was on screen. */
      if (!res || !res.ok) {
        state = fallback;
        ui.liveLoading = false;
        ui.syncError = T("sync.errGeneric");
        render();
        return;
      }
      ui.liveLoading = false; ui.syncError = null;
      /* only now: a save left behind before the fetch proved it could be
         replaced is the one copy somebody had. Storage check would offer
         to recover it, and it would be the right thing to recover. */
      try { localStorage.removeItem(stateKeyFor(localId)); } catch { /* never was one */ }
      render();
    })
    .catch((e) => {
      /* No signal, or the grant was revoked. Put back whatever was on
         screen a moment ago rather than leaving somebody looking at an
         empty log and drawing the obvious wrong conclusion. */
      state = fallback;
      ui.liveLoading = false;
      ui.syncError = syncErrText(e);
      render();
    });
}

/* Turn a read-only profile into a live one. The local copy goes, which is
   the point: it is a cache of somebody else's log and it comes back from
   the server. Nothing of the user's own is ever in one. */
function liveAdopt(localId) {
  const rec = syncFor(localId);
  if (!rec || rec.level !== "read") return false;
  /* The key is deliberately left where it is. writeNow stops writing it
     from here on, and liveEnter drops it once a fetch has proved the
     server can hand the same thing back — so a phone with no signal on the
     day this ships still opens the copy it already had. */
  syncSet(localId, { live: true, cursor: null, marks: {} });
  return true;
}

/* ── SYNC THAT NOBODY HAS TO REMEMBER TO TAP ──────────────────────────
   Manual sync was a button, and a button is a thing people forget. What
   it costs to make it automatic is entirely in the pacing, so here it is
   in one place.

   PUSHING IS DEBOUNCED, not immediate. Saving one workout writes state a
   dozen times in a minute (every set, every field), and a push per write
   would be a dozen requests for one session. SYNC_PUSH_AFTER waits for
   the typing to stop. A push that finds nothing changed sends zero rows
   anyway — see the marks hash — so the cost of being a little eager is
   one cheap request, and the cost of being late is that a phone closed
   inside the window has not uploaded yet. Hence the pagehide flush.

   PULLING IS POLLED, because there is nothing to push us. A rest timer
   gets a real push notification; a set logged on the other phone does
   not, and asking the server every few minutes is the cheap, boring,
   correct answer at this size: two people, a handful of requests an hour,
   against a hundred thousand a day. It only runs while the app is on
   screen, and coming back to the app pulls straight away, which is when
   somebody actually wants to see what changed.

   NOTHING HERE RE-RENDERS UNLESS SOMETHING LANDED, and not even then if a
   field has the caret in it. render() rebuilds #app wholesale: a sync
   that repainted while somebody was typing their username would throw
   away the input mid-word, which is a bug this app has already shipped
   once and does not need a second time from a timer nobody can see.

   IT IS SILENT. Automatic means unattended, and an unattended failure
   that raises an alert is a phone that interrupts a set to say the wifi
   is bad. Errors are recorded for the sync sheet to show and nothing
   else; the local log is untouched and stays the thing that matters. */

const SYNC_PUSH_AFTER = 8000;        // quiet time before a push
const SYNC_POLL_EVERY = 3 * 60000;   // while the app is on screen
const SYNC_PULL_GAP = 30000;         // the most often coming back can pull

let syncPushTimer = null, syncPollTimer = null;
let syncLastPull = 0, syncInFlight = false, syncApplying = false;

/* Is a field being typed in right now? A repaint would take it away. */
function syncTyping() {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/* One round trip, unattended. Deliberately not syncNow(): that one is the
   button, and it flips ui.syncBusy and renders twice on purpose so a tap
   visibly does something. This one is meant not to be noticed. */
async function syncQuiet(opts) {
  const localId = activeProfileId();
  const rec = syncFor(localId);
  if (!rec || !rec.remoteId || syncInFlight || ui.syncBusy) return;
  const C = window.ZenofitCloud;
  if (!C || !C.hasDevice || !C.hasDevice()) return;
  syncInFlight = true;
  try {
    let landed = 0, demoted = false;
    if (!opts || opts.pull !== false) {
      syncApplying = true;                  // a pull writes; that write is not a change to push back
      let out;
      try { out = await syncPull(localId); } finally { syncApplying = false; }
      landed = out.applied || 0;
      demoted = !!out.demoted;
      syncLastPull = Date.now();
    }
    /* what the PULL just learned, not what `rec` said before it: a grant
       moved to read-only between two syncs must not be pushed to */
    let out = null;
    if ((!opts || opts.push !== false) && (syncFor(localId) || rec).level !== "read") out = await syncPush(localId);
    /* ── THE ONE FAILURE THIS IS NOT ALLOWED TO SWALLOW ────────────────
       Everything else in here is deliberately silent: an unattended sync
       that raises an alert is a phone interrupting a set to say the wifi
       is bad, and the local log is untouched either way. A refused wipe
       is the opposite case. It means this device and the account disagree
       about a whole profile, nothing is going up until that is resolved,
       and the resolution is one tap the user cannot know to make. */
    ui.syncError = out && out.reason === "wipe-blocked"
      ? T("sync.errWipeBlocked", { tombs: out.tombs, held: out.held })
      : null;
    syncSet(localId, { lastOkAt: Date.now() });
    if (demoted) syncDemoted(localId);
    else if (landed && !syncTyping()) render();
  } catch (e) {
    ui.syncError = syncErrText(e);
    console.warn("auto sync failed", e);
  } finally {
    syncInFlight = false;
  }
}

/* Something changed locally. Called from the save path, so it sees every
   write without a single call site having to remember it. */
function syncTouch() {
  if (syncApplying) return;               // our own pull, landing
  const rec = syncedActive();
  if (!rec || !rec.remoteId || rec.level === "read") return;
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(() => syncQuiet({ pull: false }), SYNC_PUSH_AFTER);
}

/* ── THE DEBOUNCE BELONGS TO THE PROFILE THAT ARMED IT ────────────────
   The push timer names no profile: it fires later and pushes whichever
   one is active THEN. Leaving one profile inside the eight-second window
   therefore armed a push for the profile you arrived at and dropped the
   one you left, whose last few sets sat on the phone until something
   else happened to touch it — which, for a profile you switched away
   from, can be weeks. The person it is shared with sees a log that
   stopped mid-session.

   So switching flushes first, on the way out, while the profile being
   left is still the active one. It costs nothing when nothing changed: a
   push with no rows to send never reaches the network (see syncPush). */
function syncFlush() {
  clearTimeout(syncPushTimer);
  syncPushTimer = null;
  syncQuiet({ pull: false });
}

/* The poll, armed only while the app is actually on screen. A phone in a
   pocket has nothing to show anybody. */
function syncPollStart() {
  clearInterval(syncPollTimer);
  syncPollTimer = setInterval(() => {
    if (document.hidden) return;
    syncQuiet();
    /* the list itself, not just what is inside the open profile: a profile
       renamed or added on the laptop should appear here without anybody
       having to go and look for it */
    rosterSync();
  }, SYNC_POLL_EVERY);
}

/* Coming back to the app is the moment somebody wants to see what the
   other phone did, so it pulls then — throttled, because on some platforms
   visibilitychange fires more than once for one glance. */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    /* leaving: anything inside the debounce window goes now rather than
       waiting for a timer this page may not live long enough to fire */
    clearTimeout(syncPushTimer);
    syncQuiet({ pull: false });
    return;
  }
  if (Date.now() - syncLastPull > SYNC_PULL_GAP) { syncQuiet(); rosterSync(); }
});
window.addEventListener("pagehide", () => { clearTimeout(syncPushTimer); syncQuiet({ pull: false }); });

/* ══ THE ROSTER: ONE ACCOUNT, THE SAME PROFILES EVERYWHERE ════════════
   Sync used to reach exactly as far as the INSIDE of a profile. Every set,
   every lift, every check-in travelled; the list those profiles sat in did
   not. A profile's name lived on the phone that typed it, the order lived
   on the phone it was dragged on, and whether a profile existed here at all
   was a decision each device made for itself with a button. So signing in
   on a laptop gave you the right training under the wrong names, in a
   different order, with two of them called "Profile 1" and one missing
   entirely — and nothing on screen was wrong, exactly; the roster simply
   was not a thing the account had an opinion about.

   It is now. `profiles` on the server IS the roster: one row per profile,
   carrying its name, when that name was typed, and where it sits in the
   list. Every device builds its own list from that and pushes its own
   changes back, which is the same deal the items inside a profile have
   always had, applied one level up.

   WHAT IS STILL LOCAL, deliberately: which profile you are LOOKING at.
   That is a property of the person holding the phone, not of the account,
   and syncing it would mean opening the laptop changed what the phone was
   showing mid-set.

   OFFLINE IS UNCHANGED, which is the whole reason this is safe to do.
   Nothing here is on the path of a single thing the app does: a profile is
   still a whole `state` under its own key, a set is still written to disk
   the moment it is typed, and every one of these calls fails soft and
   tries again on the next pass. Train for three hours in a basement and
   the roster reconciles itself when the signal comes back, exactly as the
   log does.

   HOW A DISAGREEMENT IS SETTLED, because there are only two and both are
   worth being explicit about. A NAME carries the moment it was typed
   (`nameAt` here, `name_updated_at` there) and the later one wins — not
   the last device to reconnect, which would let a phone coming back from a
   week in flight mode silently undo yesterday's rename on the laptop. The
   ORDER is whatever the server says, and dragging pushes it; there is no
   merge, because an order is one list and two people dragging it at once
   is not a case anybody can resolve without inventing an answer.

   NOTHING HERE DESTROYS A SAVE. A profile removed from the account goes
   out of the list on this device too — that is what "the same everywhere"
   means — but its key is left exactly where it is, so Storage check lists
   it as an unreferenced save and offers to put it back. That is the
   difference between "gone from your account" and "gone".              */

/* Remote ids this device was told to stop following (Sync → Turn off), so
   the next roster pass does not helpfully adopt them straight back. Kept
   outside `state` with the other sync bookkeeping, for the same reason. */
const DROP_KEY = "zenofit:dropped";
const droppedRemotes = () => { try { return JSON.parse(localStorage.getItem(DROP_KEY)) || []; } catch { return []; } };
function dropRemote(remoteId, on) {
  if (!remoteId) return;
  const next = droppedRemotes().filter((x) => x !== remoteId);
  if (on) next.push(remoteId);
  try { localStorage.setItem(DROP_KEY, JSON.stringify(next)); } catch { /* nothing to remember with */ }
}

/* ── REMOVING A PROFILE IS A PROMISE, NOT A REQUEST ───────────────────
   Deleting used to be `C.deleteProfile(id).catch(() => {})` — fire and
   forget, on the reasoning that a tombstone can wait. It cannot. The row
   is already gone from this device by the time that request goes out, so
   a failure is invisible AND permanent: no retry, nothing on screen, and
   the profile sits in the account for ever while every other device goes
   on holding its copy. Delete something in a lift with no signal and it
   comes back everywhere else, silently, for good.

   So a removal is queued and survives being closed. The queue is drained
   at the top of every roster pass and an entry only leaves it when the
   server has actually agreed — or when it answers 404, which is the same
   thing said differently: it is already gone.

   Two verbs, because "this is not in my account any more" is two
   different facts depending on whose profile it is. Yours is DELETED and
   tombstoned for everybody. Somebody else's is LEFT: your grant is
   revoked, their profile is untouched, and it stops being in your account
   on every device you are signed in on — which a local unlink never did,
   and which is the bug that made "I deleted this on my phone" mean
   nothing at all on the laptop.                                       */
const PEND_KEY = "zenofit:pending";
const pendingOps = () => { try { return JSON.parse(localStorage.getItem(PEND_KEY)) || []; } catch { return []; } };
const setPendingOps = (list) => { try { localStorage.setItem(PEND_KEY, JSON.stringify(list)); } catch { /* nothing to remember with */ } };
const pendingFor = (remoteId) => (remoteId ? pendingOps().some((x) => x.remoteId === remoteId) : false);
function queueRemoval(remoteId, op) {
  if (!remoteId) return;
  setPendingOps([...pendingOps().filter((x) => x.remoteId !== remoteId), { remoteId, op, at: Date.now() }]);
}
function clearRemoval(remoteId) {
  setPendingOps(pendingOps().filter((x) => x.remoteId !== remoteId));
}

/* Drained at the top of every roster pass, before the listing is read, so
   the listing already reflects whatever just landed. */
async function runPendingRemovals() {
  const C = window.ZenofitCloud;
  if (!C) return false;
  let any = false;
  for (const p of pendingOps()) {
    try {
      if (p.op === "leave") await C.leaveProfile(p.remoteId);
      else await C.deleteProfile(p.remoteId);
      clearRemoval(p.remoteId);
      any = true;
    } catch (e) {
      /* 404 is success wearing a different hat: no such profile, or no
         grant of ours left on it. Anything else — offline, a 500, a
         token that is briefly unhappy — stays queued for the next pass. */
      if (e && e.status === 404) { clearRemoval(p.remoteId); any = true; }
      else console.warn("removal still pending", p.op, e && e.message);
    }
  }
  return any;
}

const accountOn = () => { const C = window.ZenofitCloud; return !!(C && C.signedIn && C.signedIn()); };

/* The name in the index, changed in one place so every caller stamps the
   clock the same way. `at` is the moment it was TYPED, which is what the
   server compares; a name applied FROM the server passes the server's. */
function renameLocalProfile(id, name, at) {
  profiles.list = profileList().map((p) => (p.id === id ? { ...p, name: name || "" } : p));
  saveProfiles();
  if (at) syncSet(id, { nameAt: at });
}

/* ── THE FIRST-RUN BLANK, WHICH IS NOT DATA ───────────────────────────
   Every install makes one empty unnamed profile before anybody has done
   anything. Enrolling that is exactly how an account ends up with a stray
   "Profile 1" beside the real ones for every device that ever signed in —
   which is precisely what happened here. It has no name and nothing in it,
   so it is dropped rather than uploaded; a profile that is LINKED, named,
   or holds a single row of anything is never this. */
/* Is there anything in this profile a person would miss? Deliberately the
   things somebody PUT there, never the seeded library or groups, which
   every profile is born holding and which nobody would call their data. */
function profileHasContent(id) {
  let d = null;
  try { d = id === activeProfileId() ? state : JSON.parse(localStorage.getItem(stateKeyFor(id))); }
  catch { return true; }             // will not parse: precious until proven otherwise
  if (!d) return false;              // no key at all: never written to
  const some = (k) => !!((d[k] || []).length);
  const someMap = (k) => !!Object.keys(d[k] || {}).length;
  return some("log") || some("body") || some("plans") || some("dayDrafts") ||
         some("unlogged") || some("deloads") || some("presets") ||
         someMap("goals") || someMap("volumeGoals");
}

function profileIsUntouched(id) {
  const rec = syncFor(id);
  if (rec && rec.remoteId) return false;
  const p = profileList().find((x) => x.id === id);
  if (!p || (p.name || "").trim()) return false;
  return !profileHasContent(id);
}

/* Out of the list, NOT off the disk — unless there is nothing on the disk
   worth keeping. Storage check exists to hand back a save the index has
   stopped naming, and a trail of empty keys is how that screen stops being
   worth reading: every row on it should be a row somebody might want. */
function dropLocalProfile(id) {
  if (profileList().length < 2) return false;     // never leave the app with nothing to load
  const keep = profileHasContent(id);
  const wasActive = id === profiles.active;
  const rest = profileList().filter((p) => p.id !== id);
  profiles = { active: wasActive ? rest[0].id : profiles.active, list: rest };
  saveProfiles();
  syncForget(id);
  if (!keep) { try { localStorage.removeItem(stateKeyFor(id)); } catch { /* already gone */ } }
  if (wasActive) {
    state = loadState();
    closeEverything();
    resetTransient();
    ui.tab = "home";
    applyTheme(state.settings.theme);
  }
  return true;
}

/* Local order → the account's. Called by the drag and by anything else
   that moves a row; silent, because an order is not worth an error. */
function rosterPushOrder() {
  const C = window.ZenofitCloud;
  if (!C || !accountOn() || typeof C.setProfileOrder !== "function") return;
  const ids = [];
  profileList().forEach((lp, i) => {
    const rec = syncFor(lp.id);
    if (!rec || !rec.remoteId) return;
    syncSet(lp.id, { pos: i });
    ids.push(rec.remoteId);
  });
  if (ids.length) C.setProfileOrder(ids).catch(() => { /* the next pass will */ });
}

const ROSTER_GAP = 20000;          // the most often a poll will ask for the list
let rosterBusy = false, rosterAt = 0;

async function rosterSync(opts) {
  const C = window.ZenofitCloud;
  if (!C || !accountOn() || rosterBusy) return { ok: false, reason: "off" };
  if (!(opts && opts.force) && Date.now() - rosterAt < ROSTER_GAP) return { ok: false, reason: "too-soon" };

  rosterBusy = true;
  let changed = false;
  try {
    /* Before anything is read: whatever this device has promised to
       remove. Done first so the listing below already reflects it, and
       so a delete made with no signal finally lands the moment there is
       one, on whichever device happens to be open. */
    await runPendingRemovals();
    const res = await C.listProfiles();
    const cloud = (res && res.profiles) || [];
    rosterAt = Date.now();
    const byRemote = new Map(cloud.map((p) => [p.profileId, p]));
    const gone = new Set(droppedRemotes());
    const linked = (lp) => (syncFor(lp.id) || {}).remoteId;

    /* ── 1. what the account has and this device does not ──────────────
       This is the half that makes signing in on a second device do
       anything at all. It used to be a button per profile. */
    for (const cp of cloud) {
      if (gone.has(cp.profileId)) continue;
      /* a removal this device has promised but not yet managed to send:
         adopting it back is how a delete undoes itself */
      if (pendingFor(cp.profileId)) continue;
      if (profileList().some((lp) => linked(lp) === cp.profileId)) continue;
      const level = cp.level === "read" ? "read" : cp.level === "owner" ? "owner" : "write";
      const localId = addProfile(cp.name || T("sync.joinedName"), { forRemote: true });
      if (!localId) break;                       // out of room: say nothing, try again later
      syncSet(localId, {
        remoteId: cp.profileId, level, owned: !!cp.isOwner, marks: {}, cursor: null,
        live: level === "read",
        nameAt: cp.nameUpdatedAt || 0, srvName: cp.name || "", srvNameAt: cp.nameUpdatedAt || 0,
        pos: cp.position, seen: true,
      });
      /* a read grant is held live, exactly as joining one is */
      if (level === "read") { try { localStorage.removeItem(stateKeyFor(localId)); } catch { /* none yet */ } }
      changed = true;
    }

    /* ── 2. names, both ways ───────────────────────────────────────────
       The later stamp wins. A name that has not moved needs no request,
       which matters because this runs on the poll. */
    for (const id of profileList().map((p) => p.id)) {
      let rec = syncFor(id);
      if (!rec || !rec.remoteId) continue;
      const cp = byRemote.get(rec.remoteId);
      if (!cp) continue;
      const i = profileList().findIndex((x) => x.id === id);
      const lp = profileList()[i];

      /* Whose it is, straight from the server, every pass. Delete-vs-leave
         turns on this one field and a stale answer sends the wrong verb. */
      syncSet(id, { owned: !!cp.isOwner });

      /* ── A PROFILE YOU ONLY READ WEARS ITS OWNER'S NAME ─────────────
         Renaming one locally was allowed, and the nickname went nowhere:
         it is not your profile, so the server will not take the name,
         and the result was one profile reading "Em" on the phone,
         "Profile 1" on the laptop, and "Profile 1" in the account sheet
         on both. Three names for one thing. The list is supposed to be
         the same everywhere, so a read grant simply follows the owner's
         name — and profile-form-save refuses the rename rather than
         accepting one it knows it cannot keep. */
      if (rec.level === "read") {
        if ((cp.name || "") !== (lp.name || "")) { renameLocalProfile(id, cp.name || ""); changed = true; }
        syncSet(id, { nameAt: cp.nameUpdatedAt || 0, srvName: cp.name || "",
          srvNameAt: cp.nameUpdatedAt || 0, pos: cp.position, seen: true });
        continue;
      }

      /* ── THE FIRST PASS OVER A PROFILE THAT PREDATES ALL THIS ───────
         Its record has no stamp at all, and the server's is back-filled
         from created_at by the migration — a real number, so a plain
         comparison would say the server wins and hand the phone back the
         name the profile was CREATED with. That is exactly backwards:
         the cloud name was set once when sync was turned on and never
         maintained afterwards (which is the whole reason one profile
         read "Main" here and "Profile 1" there), while the local one is
         what somebody typed and has been reading since.

         The bootstrap is therefore gated on the server's name still
         being the ORIGINAL one — `nameUpdatedAt` still equal to
         `createdAt`, meaning nothing has ever deliberately set it. That
         gate is what makes the outcome the same whichever device syncs
         first, which a bare "local wins" rule is not:

           · the device whose local name DIFFERS from the original typed
             that name, so it is stamped now and pushed;
           · the device whose local name IS the original never typed
             anything — it got that name from the server in the first
             place — so it adopts the server's stamp and pushes nothing.

         Once any device has set the name, the gate closes and everything
         after it is judged on real clocks, where an unstamped local name
         reads as 0 and loses to a deliberate rename. So the phone's
         "Main" wins, the laptop takes it, and it does not matter which
         of them opened the app first. */
      if (rec.nameAt === undefined) {
        const original = (cp.nameUpdatedAt || 0) === (cp.createdAt || -1);
        const differs = profileLabel(lp, i) !== (cp.name || "");
        if (original && differs) {
          /* somebody typed this one here: claim it now, and the push
             below carries it up */
          syncSet(id, { nameAt: Date.now() });
        } else {
          /* this device never typed a name for this profile, so the
             server's is the answer — and it has to be taken NOW rather
             than left to the comparison below, because adopting the
             stamp makes the two equal and neither branch would fire */
          if (differs) { renameLocalProfile(id, cp.name || ""); changed = true; }
          syncSet(id, { nameAt: cp.nameUpdatedAt || 0 });
        }
        rec = syncFor(id);
      }

      const lpNow = profileList()[i] || lp;   // the rename above replaced it
      const theirs = cp.nameUpdatedAt || 0, mine = rec.nameAt || 0;

      if (theirs > mine) {
        if ((cp.name || "") !== (lpNow.name || "")) { renameLocalProfile(id, cp.name || ""); changed = true; }
        syncSet(id, { nameAt: theirs, srvName: cp.name || "", srvNameAt: theirs, pos: cp.position, seen: true });
        continue;
      }
      syncSet(id, { srvName: cp.name || "", srvNameAt: theirs, pos: cp.position, seen: true });
      /* ours is newer and different: push it, and take the answer, since
         a rename refused as stale comes back 200 with the name that won */
      if (rec.level !== "read" && mine > theirs && profileLabel(lpNow, i) !== (cp.name || "")) {
        try {
          const out = await C.renameProfile(rec.remoteId, profileLabel(lpNow, i), mine);
          if (out && out.stale) { renameLocalProfile(id, out.name); changed = true; }
          syncSet(id, { srvName: out ? out.name : profileLabel(lpNow, i), srvNameAt: (out && out.nameUpdatedAt) || mine,
            nameAt: out && out.stale ? out.nameUpdatedAt : mine });
        } catch { /* next pass */ }
      }
    }

    /* ── 3. what left the account leaves this device's list ─────────────
       Only a profile we have SEEN in a listing before, so a profile
       enrolled seconds ago by another device cannot be removed by a
       listing that predates it. The save itself is left on disk. */
    for (const id of profileList().map((p) => p.id)) {
      const rec = syncFor(id);
      if (!rec || !rec.remoteId || !rec.seen) continue;
      if (byRemote.has(rec.remoteId)) continue;
      if (dropLocalProfile(id)) changed = true;
    }

    /* ── 4. what this device has and the account does not ──────────────
       Signing in is the act that says "this account holds my training",
       so everything here goes up — minus the first-run blank, which is
       not training and is what put "Profile 1" in the account twice. */
    for (const id of profileList().map((p) => p.id)) {
      const rec = syncFor(id) || {};
      if (rec.remoteId || rec.noSync) continue;
      if (profileIsUntouched(id) && cloud.length) { if (dropLocalProfile(id)) changed = true; continue; }
      const i = profileList().findIndex((x) => x.id === id);
      if (i < 0) continue;
      const at = Date.now();
      try {
        const made = await C.createProfile(profileLabel(profileList()[i], i), { position: i, nameUpdatedAt: at });
        const remoteId = made.profileId || made.id;
        /* linked BEFORE the push, so one that dies half way leaves a
           profile that knows where it lives rather than an orphan */
        syncSet(id, { remoteId, level: "owner", owned: true, marks: {}, cursor: null,
          nameAt: at, srvName: made.name, srvNameAt: at, pos: i, seen: true });
        await syncPush(id);
        changed = true;
      } catch { /* next pass */ }
    }

    /* ── 5. the order the account holds ────────────────────────────────
       Positions the server never set sort last, keeping the order they
       already had, so a list that predates all of this does not shuffle. */
    const before = profileList().map((p) => p.id);
    const posOf = (lp) => { const r = syncFor(lp.id) || {}; return Number.isFinite(r.pos) ? r.pos : Number.MAX_SAFE_INTEGER; };
    const sorted = profileList()
      .map((lp, i) => ({ lp, i }))
      .sort((a, b) => (posOf(a.lp) - posOf(b.lp)) || (a.i - b.i))
      .map((x) => x.lp);
    if (sorted.some((lp, i) => lp.id !== before[i])) { profiles.list = sorted; saveProfiles(); changed = true; }

    /* ── 6. and fill the ones that arrived empty ───────────────────────
       A profile adopted above has a link and nothing in it. Pulling it
       here rather than waiting for somebody to switch to it is what makes
       a second device READY rather than merely populated with names: the
       counts on the Profiles screen are real, and opening one is instant.
       A pass somebody ASKED for (signing in, Refresh) fills all of them,
       because that is the moment they are stood there waiting; the poll
       takes one at a time, so a device holding six does not fire six round
       trips into a pocket. */
    /* No cursor means never fetched, which is exactly what an adopted
       profile is. The ACTIVE one is in here too, and deliberately: the
       profile this device lands on after signing in is usually one the
       roster invented a second ago, so leaving it to the ordinary poll
       means the first thing somebody sees is their own log, empty. */
    const needsFilling = () => profileList().filter((lp) => {
      const r = syncFor(lp.id) || {};
      return r.remoteId && !r.cursor && !r.live;
    });
    const queue = (opts && opts.force) ? needsFilling() : needsFilling().slice(0, 1);
    for (const lp of queue) {
      try { if ((await syncPull(lp.id)).applied) changed = true; }
      catch { /* next pass */ }
    }

    if (changed && !syncTyping()) {
      if (ui.profilesWin) ui.profileStats = profileStats();
      render();
    }
    return { ok: true, changed };
  } catch (e) {
    console.warn("roster sync failed", e);
    return { ok: false, error: e };
  } finally {
    rosterBusy = false;
  }
}

/* ── ONE CONTROL THAT MEANS "SHOW ME WHAT IS ACTUALLY THERE NOW" ──────
   Two different things go stale in here, and until this button both were
   fixed the same way: close the app, open it again, and if that did not
   do it, do it once more.

   THE TRAINING. A live profile is fetched on the way in and then polled
   every few minutes, and a synced one the same. That is the right pacing
   for a phone in a pocket and no use at all to somebody stood there having
   just been told a set was logged on the other phone, because the answer
   to "is it there yet" cannot be "wait three minutes".

   THE APP ITSELF. sw.js answers from cache first and re-fetches behind
   you, which is what makes it open instantly and work with no signal, and
   it also means a deploy appears on the SECOND launch. Nothing on screen
   ever said so, so what it teaches is exactly the habit above.

   From where the user stands those are one request, so they are one
   button. It asks the worker for the shell from the network past both
   caches, reloads ONLY if something really came back different — a
   refresh that reloads every time is one nobody dares press mid-set — and
   otherwise pulls the profile in front of them.

   Nothing here can cost anything: the debounce is flushed before a reload
   can happen, a live profile's re-entry already puts back what was on
   screen if the fetch fails, and a failed pull leaves the local log
   untouched, as every other sync does.                                 */

/* Ask the controlling worker to re-fetch the shell. Resolves false on
   anything unusual (no worker yet, a first load that nothing controls,
   a reply that never comes), because "could not check" and "nothing
   changed" lead to the same next step: refresh the data instead. */
function swRefreshShell() {
  return new Promise((resolve) => {
    const sw = ("serviceWorker" in navigator) && navigator.serviceWorker.controller;
    if (!sw) return resolve(false);
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => done(false), 15000);
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => done(!!(e.data && e.data.changed));
      sw.postMessage({ type: "refresh-shell" }, [ch.port2]);
    } catch { done(false); }
  });
}

async function refreshNow() {
  if (ui.refreshing) return;
  ui.refreshing = true; render();
  writeNow();                   // a reload must not land inside the debounce
  /* Held for a beat even when the answer comes back instantly, because a
     spinner that flashes for 40ms is the same thing to a finger as a button
     that did nothing, and this one is pressed precisely when somebody is
     already unsure whether the app is listening. */
  const floor = new Promise((r) => setTimeout(r, 450));
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update().catch(() => { /* offline: the cached app stands */ });
        /* A worker already waiting is a new version that has finished
           installing and is holding the door. Taking it fires
           controllerchange, which reloads the page, so there is nothing
           after this worth doing. */
        if (reg.waiting) { reg.waiting.postMessage("skip-waiting"); return; }
      }
    }
    if (await swRefreshShell()) { location.reload(); return; }

    await rosterSync({ force: true });
    const id = activeProfileId();
    if (syncLive(id)) { ui.syncError = null; liveEnter(id); }
    else if ((syncFor(id) || {}).remoteId) await syncNow(id);
  } catch (e) {
    console.warn("refresh failed", e);
  } finally {
    await floor;
    ui.refreshing = false;
    render();
  }
}

/* The control itself, drawn into both headers so it is in the same place on
   every tab. The spin lives on a wrapper rather than on the icon, because
   the icon is a lucide placeholder until after the frame is built and what
   it hands back is not this element. */
function refreshBtn(size, pad) {
  const label = esc(T("a11y.refresh"));
  return `<button data-action="refresh-now" title="${label}" aria-label="${label}" style="color:var(--muted);padding:${pad}px;display:flex;align-items:center">
    <span class="${ui.refreshing ? "pb-spin" : ""}" style="display:flex">${icon("refresh-cw", size)}</span>
  </button>`;
}

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
  /* ...and every timer's cloudId, for the same reason zenofit:device and
     zenofit:push live outside state entirely. It is sync state: a handle on
     an alarm booked for THIS device, on a server that will only cancel it
     for the device that booked it. A backup is a file people share and
     restore onto a second phone, where the handle is meaningless at best,
     and at worst has that phone trying to cancel somebody else's rest. The
     timer travels, because a timer is yours; the handle does not. */
  data.timers = (data.timers || []).map(({ cloudId, ...t }) => t);   // eslint-disable-line no-unused-vars
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

const backupName = () => `zenofit-backup-${todayStr()}.json`;

function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportBackup() {
  writeNow();   // flush the debounce so the file and this device agree
  downloadText(backupName(), backupText());
}

/* ── …AND STRAIGHT INTO A CHAT ────────────────────────────────────────
   Downloading is the wrong shape for the thing people actually do with a
   backup on a phone: send it to somebody, or to themselves. Export drops a
   file into Downloads and then it is on you to find it again in whatever
   app you meant to send it from, which is three screens and a file picker
   for what the OS already has a button for.

   So the same bytes also go to the system share sheet (Web Share Level 2),
   where Telegram, mail, AirDrop, Drive and the rest are one tap. It is the
   SAME file either way: backupName() names both and backupText() writes
   both, so there is no second export format to keep true.

   Whether the sheet can take a file at all is asked, not guessed at:
   navigator.canShare({files}) is the only honest answer, it needs a secure
   context, and some platforms will take a .json only as plain text.
   Whichever type it agrees to is the one the file is built with; if it
   agrees to neither the answer is null and the button is not drawn,
   because a share button that cannot share is worse than none.

   Asked once and remembered, rather than at module load: it costs a File
   and a platform call, this is the only screen that needs the answer, and
   Settings re-renders on every keystroke in the name field. */
let shareType;                      // undefined until first asked, then a type or null
function shareFileType() {
  if (shareType !== undefined) return shareType;
  shareType = null;
  try {
    if (navigator.share && navigator.canShare && typeof File === "function")
      for (const type of ["application/json", "text/plain"])
        if (navigator.canShare({ files: [new File(["{}"], "zenofit.json", { type })] })) {
          shareType = type; break;
        }
  } catch { /* a browser that throws rather than answer has answered */ }
  return shareType;
}

/* Nothing is awaited before navigator.share(): the call has to happen inside
   the tap that started it or the browser drops the gesture and refuses. */
function shareFile(name, text) {
  const type = shareFileType();
  if (!type) return downloadText(name, text);
  const file = new File([text], name, { type });
  let p;
  try { p = navigator.share({ files: [file], title: name }); }
  catch (e) { console.error("share failed", e); return shareFellBack(name, text); }
  if (p && p.catch) p.catch((e) => {
    /* dismissing the sheet is an answer, not a failure, and saying anything
       about it would be the app arguing with a decision */
    if (e && (e.name === "AbortError" || e.name === "NotAllowedError")) return;
    console.error("share failed", e);
    shareFellBack(name, text);
  });
}

function shareBackup() {
  writeNow();
  shareFile(backupName(), backupText());
}

/* The share sheet is a convenience on top of the file, so when it will not
   open, the file still arrives: say which happened, then download it. */
function shareFellBack(name, text) {
  try { alert(T("profile.shareFailed")); } catch { /* no UI here */ }
  downloadText(name, text);
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
  /* a restore IS the replacement, asked for and confirmed a line above */
  allowOverwrite();

  /* every open form points at records that no longer exist */
  ui.workoutSheet = null; ui.entryForm = null; ui.setForm = null;
  ui.bodyForm = null; ui.exWin = null; ui.exWinDraft = null; ui.exWinAttach = null;
  ui.presetForm = null; ui.presetView = null; ui.groupForm = null;
  ui.groupSheet = false; ui.timerForm = null; ui.deloadForm = null;
  ui.planResult = null; ui.showBody = false; ui.picking = false;
  ui.showProfile = false; ui.profileDraft = null; ui.profileLangWas = null;
  ui.showStorage = false;
  resetTransient();
  ui.tab = "home";

  applyTheme(state.settings.theme);   // the file carries its own theme
  writeNow();
  render();
  alert(T("profile.importOk", { what: backupSummary(state) }));
}

/* ── WHAT IS ACTUALLY IN THIS BROWSER ─────────────────────────────────
   An app whose every record lives in one origin's localStorage owes its
   user a way to LOOK at that, because when it comes up empty there is no
   way to tell the three very different things that can mean apart:

     · the data is gone (storage cleared, evicted, reset),
     · the data is fine but this is not the address it was saved at,
     · the data is fine and right here, but the profile index no longer
       points at it, so the app cannot see its own save.

   The third one is recoverable in one tap and used to be indistinguishable
   from the first, which is the worst way for it to fail: somebody grieves a
   year of training that is sitting in the same browser, unreferenced. So
   this reads every Zenofit key there is, says which profile each one is,
   how much training is in it, and whether the index knows about it.

   It reads. The only thing on this screen that writes is Recover, and all
   Recover does is ADD: it puts an unlisted save back in the index and
   switches to it. Nothing here overwrites, deletes or merges anything,
   because the one guaranteed way to make a bad day worse is a repair tool
   that can destroy the thing it was opened to rescue. */
const STATE_PREFIX = "powerbuild-tracker:state:";

function storageScan() {
  const out = { origin: "", rows: [], total: 0, indexOk: false, readable: true };
  try { out.origin = location.origin; } catch { /* nothing to say */ }
  let index = null;
  try { index = JSON.parse(localStorage.getItem(PROFILES_KEY)); } catch { /* damaged */ }
  out.indexOk = !!(index && Array.isArray(index.list) && index.list.length);
  const listed = new Set(out.indexOk ? index.list.map((x) => x.id) : []);

  let keys = [];
  try { for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); }
  catch { out.readable = false; return out; }

  for (const key of keys) {
    let raw = "";
    try { raw = localStorage.getItem(key) || ""; } catch { /* skip */ }
    out.total += key.length + raw.length;
    const isState = key === STORE_KEY || key.startsWith(STATE_PREFIX);
    if (!isState && key !== PROFILES_KEY) continue;
    const row = { key, bytes: raw.length, index: key === PROFILES_KEY };
    if (isState) {
      row.legacy = key === STORE_KEY;
      row.id = row.legacy ? null : key.slice(STATE_PREFIX.length);
      row.active = !row.legacy && row.id === activeProfileId();
      /* a legacy key is never "listed": it predates the index entirely,
         which is exactly why it is worth offering back */
      row.listed = !row.legacy && listed.has(row.id);
      try {
        const d = JSON.parse(raw);
        const st = d && typeof d === "object" && d.state ? d.state : d;
        if (st && typeof st === "object" && Array.isArray(st.log)) {
          row.ok = true;
          row.entries = st.log.length;
          row.days = new Set(st.log.map((e) => e.date)).size;
          row.body = (st.body || []).length;
          row.lifts = (st.library || []).length;
          row.name = (st.settings && st.settings.name) || "";
        }
      } catch { /* row.ok stays falsy: it is there and it will not parse */ }
    }
    out.rows.push(row);
  }
  /* the save with the most in it first, so the answer is the top line */
  out.rows.sort((a, b) => (b.entries || 0) - (a.entries || 0) || b.bytes - a.bytes);
  return out;
}

/* ── GETTING ONE SAVE OFF THE PHONE ───────────────────────────────────
   The one thing that still works when the phone has no room left to write,
   and that is not a coincidence: a full store is exactly the state that
   stops Recover from finishing (switchProfile flushes, the flush fails,
   you are told the device is out of space), and it is the moment you most
   want the file. So this reads and nothing else. No flush, no localStorage
   write, nothing that can fail for want of space.

   The ACTIVE save is written from memory rather than from its key, because
   that is the fresher of the two and costs no write. Everything else goes
   out exactly as it is stored, in the envelope Import reads.

   A save too damaged to parse goes out RAW, and its name says so. Import
   will refuse it, and it should: it is not a backup, it is the wreckage.
   But the bytes are the only thing left to repair by hand, and they are
   worth far more on a laptop than they are stranded on a phone. */
function storageFileFor(key) {
  const row = storageScan().rows.find((r) => r.key === key);
  if (!row || row.index) return null;
  /* row.ok as well as row.active: when the active save is the damaged one,
     what is in memory is the blank default and the bytes are the only thing
     worth handing over */
  if (row.active && row.ok) return { name: backupName(), text: backupText() };
  let raw = "";
  try { raw = localStorage.getItem(key) || ""; } catch { return null; }
  if (!raw) return null;
  /* named after the save it came from, so two of them on one phone are
     still telling you which is which a week later */
  const tag = (row.legacy ? "old" : String(row.id || "save")).slice(0, 14);
  if (!row.ok) return { name: `zenofit-${tag}-damaged-${todayStr()}.json`, text: raw };
  let data = null;
  try { const d = JSON.parse(raw); data = d && typeof d === "object" && d.state ? d.state : d; }
  catch { return null; }
  const { drafts, ...clean } = data;   // eslint-disable-line no-unused-vars
  return {
    name: `zenofit-${tag}-${todayStr()}.json`,
    text: JSON.stringify({
      app: BACKUP_APP, format: BACKUP_FORMAT, version: data.version,
      exportedAt: new Date().toISOString(), state: clean,
    }, null, 2),
  };
}

/* Putting an unlisted save back in the index. Additive and nothing else: a
   legacy key is COPIED to a state key of its own (never moved, so a failure
   half-way leaves the original exactly where it was), and an orphan is
   simply named in the index again. Then switchProfile, which parks and
   flushes whatever is open before it goes anywhere. */
function adoptStorage(key) {
  const scan = storageScan();
  const row = scan.rows.find((r) => r.key === key);
  if (!row || !row.ok) return false;
  let id = row.id;
  if (row.legacy) {
    id = uid();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      localStorage.setItem(stateKeyFor(id), raw);
      if (localStorage.getItem(stateKeyFor(id)) !== raw) throw new Error("copy did not land");
    } catch (e) { console.error("adopt failed", e); alert(T("profiles.quota")); return false; }
  }
  if (!profiles.list.some((x) => x.id === id)) {
    profiles.list = [...profiles.list, { id, name: "" }];
    saveProfiles();
  }
  switchProfile(id);
  return true;
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
  profilesWin: false,   // the profiles window (which training is on screen)
  profileForm: null,    // {id, name, mode:"add"|"rename"|"copy"} name editor
  liveLoading: false,   // a live profile is being fetched, see the LIVE block
  accountSheet: null,   // {username, password, free, cloud} sign in / sign up
  syncSheet: null,      // {localId, grants, code, copied} the share sheet
  joinSheet: null,      // {code, busy, error} redeeming somebody's code
  syncBusy: false,      // a pull or push is in flight
  syncError: null,      // what the last one failed with, cleared by the next
  refreshing: false,    // the header's Refresh is working, see refreshNow
  profileOrder: false,  // …that list is in drag-to-reorder mode
  profileStats: null,   // counts per profile, read once when the window opens
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
  /* filing an existing lift under another one, see reparentUnder:
     {id, q, parentId, short} — the row being moved, the search box, the
     base picked for it, and the short name it will wear under that base */
  exWinAttach: null,
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
  progressQ: "",        // …and the search box over that list of lifts
  /* the strength standards lookup (Progress → Standards). Like the 1RM
     calculator it is a question you ask, not a feed: `std` is the form,
     `stdResult` the last answer, and neither is cleared by changing tab.
     See stdForm() for why the form is built once and then left alone. */
  std: null,            // {slug, sex, bw, bwFrom, mode, lift, liftFromLog, setReps, setWeight}
  stdResult: null,      // the last check, see stdCheck()
  showStorage: false,   // Settings -> Data -> Storage check is open, see renderStorage
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
  ui.progressQ = "";
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

/* ── A FOOTER THAT GROWS HAS TO BE MEASURED, NOT GUESSED ──────────────
   The workout sheet and the entry form both park their save button over a
   scrolling list, fading the list out under it, and the clearance that list
   was given underneath was a hand-written 120px. That is right for a footer
   holding one button and wrong the moment it holds more: the workout sheet
   adds *Save as preset*, and above that up to two lines saying what is
   still unlogged — copy that WRAPS, so the number was not merely too small,
   it was not a fixed number at all. Past 120px the bottom of the list came
   to rest under the transparent top of that gradient, and the caption
   printed straight across the timer dials' labels.

   So the clearance is read off the footer. This is content being measured,
   not the device — applyViewport still owns every dimension that answers to
   the screen, and the safe-area inset is already inside this height because
   the footer's own padding carries it. It runs with flashLogDay, after the
   icons, for the reason stated there: the glyphs are what settle the final
   heights. A footer that wants clearing declares the list it sits over, so
   a third screen in this shape is an attribute rather than another guess. */
const FOOTER_CLEAR = 10;   // breathing room between the last row and the fade

function fitScrollFooters() {
  app.querySelectorAll("[data-footer-for]").forEach((foot) => {
    const box = app.querySelector(`[data-scrollkey="${foot.dataset.footerFor}"]`);
    if (box) box.style.paddingBottom = `${Math.ceil(foot.offsetHeight) + FOOTER_CLEAR}px`;
  });
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
      ${refreshBtn(20, 4)}
      <button data-action="open-body" title="${T("a11y.bodyBtn")}" style="color:var(--muted);padding:4px">${icon("ruler", 20)}</button>
      <button data-action="open-profile" style="color:var(--muted);padding:4px">${icon("settings", 20)}</button>
    </div>`;
  }

  /* Somebody else's training, on your phone. A strip rather than a dialog:
     every screen still works, so the only thing that needs saying is whose
     it is and why the buttons refuse — said once, at the top, on every tab,
     including Home, where there is no header to hang it under. */
  if (syncReadOnly()) {
    /* A live profile says where it is as well as whose it is, because the
       difference matters the moment the signal goes: an empty log with no
       explanation reads as lost data. */
    const live = syncLive();
    const bad = live && ui.syncError && !ui.liveLoading;
    const msg = ui.liveLoading ? T("live.loading") : bad ? T("live.offline") : live ? T("live.banner") : T("sync.roBanner");
    const tint = bad ? "rgba(208,90,80,.14)" : "rgba(93,138,168,.14)";
    const ink = bad ? "var(--red)" : "var(--steel)";
    html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:${tint};border-bottom:1px solid var(--border-soft)${tab === "home" ? ";padding-top:calc(8px + var(--pb-sat))" : ""}">
      ${icon(ui.liveLoading ? "refresh-cw" : bad ? "cloud-off" : live ? "cloud" : "eye", 14, `style="color:${ink};flex-shrink:0"`)}
      <span style="flex:1;min-width:0;font-size:11.5px;color:${ink};line-height:1.4">${msg}</span>
      ${bad ? `<button data-action="live-retry" class="pb-btn" style="flex-shrink:0;padding:4px 10px;font-size:11px;background:transparent;color:var(--red);border:1px solid rgba(208,90,80,.4)">${T("live.retry")}</button>` : ""}
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
  if (ui.exWinAttach) html += renderAttachVariation();
  if (ui.presetForm) html += renderPresetForm();
  if (ui.presetView) html += renderPresetView();
  if (ui.chartFull) html += renderChartFull();
  if (ui.showProfile) html += renderProfile(ui.profileDraft);
  if (ui.showStorage) html += renderStorage();
  if (ui.profilesWin) html += renderProfilesWindow();
  if (ui.profileForm) html += renderProfileForm();
  if (ui.accountSheet) html += renderAccountSheet();
  if (ui.syncSheet) html += renderSyncSheet();
  if (ui.joinSheet) html += renderJoinSheet();
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
  fitScrollFooters();
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
        ${refreshBtn(22, 8)}
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
            ${b.metric != null ? `<div class="pb-num" style="font-weight:700;font-size:17px;color:${b.badge === "pr" ? "var(--gold)" : "var(--text)"}">${b.metric}<span style="font-size:10.5px;color:var(--muted);font-weight:600"> ${metricUnit(kindOf(e), unit)}</span></div>` : ""}
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
  const k = KIND[t.kind] ? t.kind : DEFAULT_KIND;
  const u = t.unit || unit || state.settings.units;
  const same = (a, b) => a.reps === b.reps && a.weight === b.weight && a.secs === b.secs;
  const runs = [];
  for (const st of t.sets) {
    const last = runs[runs.length - 1];
    if (last && same(last, st)) last.n += 1;
    else runs.push({ n: 1, reps: st.reps, weight: st.weight, secs: st.secs });
  }
  /* "3 sets · 8 × 100 kg" only earns the count when there is more than one
     of them; a single set is just the set */
  if (runs.length === 1 && runs[0].n > 1)
    return `${TN("set", runs[0].n)} · ${setLine(runs[0], k, u)}`;
  /* the unit rides on the last one only, so a row of sets does not repeat it */
  return runs.map((r, i) => `${r.n > 1 ? r.n + " × " : ""}${setLine(r, k, i === runs.length - 1 ? u : "")}`.trim()).join(" · ");
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

/* one period's figure for a group, in the unit that group is graded in */
const prevOf = (v, g, isCardio) => {
  const c = (v && v[g]) || { sets: 0, minutes: 0 };
  return isCardio ? c.minutes : c.sets;
};

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
    const isCardio = groupKind(g) === "cardio";
    const bucket = g === UNCATEGORIZED;
    const cell = vol[g] || { sets: 0, minutes: 0 };
    /* The group's own kind says which of the two figures is THE number:
       the one a target is set against and the one compared with last
       period. The other is still shown when there is any of it, because a
       group holding both is a fact about the group, not an error. */
    const v = isCardio ? cell.minutes : cell.sets;
    const other = isCardio ? cell.sets : cell.minutes;
    const otherUnit = isCardio ? T("unit.sets") : T("unit.min");
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
    } else if (prevVol && (v > 0 || prevOf(prevVol, g, isCardio) > 0)) {
      const d = Math.round((v - prevOf(prevVol, g, isCardio)) * 10) / 10;
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
        ${other > 0 ? `<div class="pb-num" style="font-weight:600;font-size:12px;color:var(--faint);flex-shrink:0">+ ${other} ${otherUnit}</div>` : ""}
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
      unit: metricUnit(selRow?.kind || DEFAULT_KIND, unit),
      name: sel, cardio: !!selRow?.cardio, kind: selRow?.kind || DEFAULT_KIND,
    };
  chartState.bar = { data: wkData };

  /* a dot from a lift you're no longer looking at can't stay selected */
  if (ui.chartSel.main && !chartData.some((d) => d.e.id === ui.chartSel.main)) ui.chartSel.main = null;
  if (!chartState.line && ui.chartFull === "main") ui.chartFull = null;

  const goalRows = progressLiftRows(rows, sel, unit);

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
    <div style="position:relative;margin-bottom:10px">
      ${icon("search", 16, 'style="position:absolute;left:12px;top:12px;color:var(--faint)"')}
      <input class="pb-input" style="padding-left:36px" placeholder="${T("prog.search")}" data-bind="progq" value="${esc(ui.progressQ)}">
    </div>
    <div class="pb-card" id="progLifts" style="margin-bottom:20px;overflow:hidden">${goalRows}</div>

    ${sectionTitle(T("prog.graph"), `<span style="font-size:11px;color:var(--faint)">${metricLabel(selRow?.kind || DEFAULT_KIND, unit)}</span>`)}
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
     honest way to read "your best set at bodyweight" back out of that.

   TWO WAYS TO SAY WHAT YOU LIFTED, ONE ANSWER. The tables are written in
   one-rep maxes and nobody trains in them, so the lift field takes either
   one: a max, or a set you actually did (`f.mode`, stdMode, stdLiftValue).
   A set is folded into a max by est1RM — the same anchored Wathan curve
   the log and the 1RM tab run on, reps rounded exactly as that tab rounds
   them — and that identity is the entire point. The rank you get from
   5 × 135 is the rank you would have got by working the max out on the
   1RM tab and typing it back in here, which is the trip this exists to
   save. No second curve, and nothing new to disagree with the first.

   The two routes keep their own fields, so the switch loses nothing and
   imposes nothing on a number somebody already typed, and the answer names
   the route it came from: a card reading "150 kg" when you entered 5 × 135
   is a verdict you cannot check by hand. Rep-count standards have no max
   to estimate and never see the switch at all.                           */

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

/* Which way the lift is being written down. A rep-count standard has no max
   to estimate, so it is never asked, and a mode left over from the last lift
   cannot follow you into one. */
const stdMode = (f, ex) => (ex && ex.reps ? "1rm" : f && f.mode === "set" ? "set" : "1rm");

/* What a set is worth as a max, read off the two boxes exactly as typed:
   est1RM is the log's own curve and Math.round is the 1RM tab's own rounding,
   so this cannot drift from either. It asks nothing about WHICH lift, which is
   why the readout beside the boxes fills in before one has been picked. */
const stdSetMax = (f) => est1RM(+decimalize(f.setWeight), Math.round(+decimalize(f.setReps)));

/* THE number the tables are then read with, whichever route it arrived by,
   and null until there is one. */
function stdLiftValue(f, ex) {
  if (!ex) return null;
  if (stdMode(f, ex) === "set") return stdSetMax(f);
  const v = stdValueOf(ex, f.lift);
  return v > 0 ? v : null;
}

const stdReady = (f) => {
  const ex = f && f.slug ? STD_BY_SLUG[f.slug] : null;
  return !!ex && !!f.sex && +decimalize(f.bw) > 0 && (stdLiftValue(f, ex) || 0) > 0;
};

/* The answer, worked out once and then held in ui.stdResult: it carries the
   numbers it was computed FROM as well as the verdict, so the card can name
   them and can never end up describing a lift you have since typed over. */
function stdCheck(f, unit) {
  if (!stdReady(f)) return null;
  const ex = STD_BY_SLUG[f.slug];
  const bw = +decimalize(f.bw);
  const value = stdLiftValue(f, ex);
  /* the set it was worked out FROM, or null when a max was typed straight in.
     The card names it, so the verdict can always be checked by hand. */
  const set = stdMode(f, ex) === "set"
    ? { reps: Math.round(+decimalize(f.setReps)), weight: +decimalize(f.setWeight) }
    : null;
  const th = stdThresholds(ex, f.sex, convertWeight(bw, unit, "kg"), unit);
  const rank = stdRank(th, value);
  const nextI = rank + 1 < STD_LEVELS.length ? rank + 1 : null;
  const floor = rank >= 0 ? th[rank] : 0;
  const span = nextI == null ? 0 : th[nextI] - floor;
  return {
    slug: ex.slug, reps: !!ex.reps, sex: f.sex, unit, bw, value, set, th, rank, nextI,
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
    /* strength only: a rep count or a hold in seconds is not a weight, and
       offering one as "your best from the log" is offering a lie in kilos */
    if (kindOf(e) !== "strength" || !names.has(e.exercise)) continue;
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
      /* the set route's own two boxes, kept clear of `lift` so that flipping
         the switch is never a decision about a number somebody typed */
      mode: "1rm", setReps: "", setWeight: "",
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
  const mode = stdMode(f, ex);

  const liftHint = ex && ex.reps ? T("std.repsHint")
    : f.liftFromLog ? T("std.liftFromLog")
    : ex ? T("std.liftHint") : "";

  /* THE SET ROUTE'S PAYOFF, and the only reason the switch is worth a row of
     the form: the max is on screen the moment both boxes are filled in, so
     the answer to "what is my 1RM" never costs a trip to another tab. Label
     and number, nothing else; the curve explains itself in Home, once.
     Patched in place while typing, like the two hints, see handleBind. */
  const est = mode === "set" ? stdSetMax(f) : null;
  const estRow = `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:10px 12px;margin-bottom:12px;border-radius:10px;background:var(--surface2);border:1px solid var(--border-soft)">
    <span class="pb-label">${T("entry.est1rm", { unit })}</span>
    <span id="stdEst" class="pb-num" style="font-size:17px;font-weight:700;color:${est ? "var(--gold)" : "var(--faint)"}">${est ? trimNum(est) : "—"}</span>
  </div>`;

  /* Reps then weight, the order every other set in the app is typed and read
     in (setForm, setLine), not the calculator tab's order: what is being
     written down here is a set somebody did, not a sum. */
  const liftFields = mode === "set"
    ? `<div style="display:flex;gap:10px">
        <div style="flex:1">${field(T("std.setReps"),
          `<input class="pb-input" ${NUM} data-bind="std.setReps" value="${esc(f.setReps)}" placeholder="—">`)}</div>
        <div style="flex:1">${field(T("std.setWeight", { unit }),
          `<input class="pb-input" ${NUM} data-bind="std.setWeight" value="${esc(f.setWeight)}" placeholder="—">`)}</div>
      </div>
      ${estRow}`
    : field(ex && ex.reps ? T("std.bestReps") : T("std.best", { unit }),
        `<input class="pb-input" ${NUM} data-bind="std.lift" value="${esc(f.lift)}" placeholder="—">`,
        /* patched in place while typing, like the bodyweight hint above it,
           see handleBind */
        `<span id="stdLiftHint">${liftHint}</span>`);

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

    ${field(T("std.bodyweight", { unit }),
      `<input class="pb-input" ${NUM} data-bind="std.bw" value="${esc(f.bw)}" placeholder="—">`,
      `<span id="stdBwHint">${f.bwFrom ? T("std.bwFrom", { date: fmtShort(f.bwFrom) })
        : f.bw ? "" : T("std.bwNone")}</span>`)}

    ${ex && ex.reps ? "" : `<div class="pb-label" style="margin-bottom:6px">${T("std.mode")}</div>
      ${segControl("std-mode", mode, [["1rm", T("std.mode1rm")], ["set", T("std.modeSet")]])}`}

    ${liftFields}

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
          : res.set
          /* the set, the max it came to, and the bodyweight it was read at:
             a rank quoting a number nobody typed cannot be checked by hand */
          ? T("std.fromSet", { name: esc(stdName(resEx)), reps: res.set.reps, weight: trimNum(res.set.weight, 2), value: trimNum(res.value), unit: res.unit, bw: trimNum(res.bw) })
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
  const ek = kindOf(e);
  const sets = isDetailed(e) ? filledSets(e) : [];
  return `<div class="pb-card2" style="margin:6px 4px 2px;padding:12px 13px">
    <div style="display:flex;align-items:baseline;gap:8px">
      <div style="font-weight:700;font-size:14px;flex:1;min-width:0">${fmtDate(e.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
      ${p.badge && BADGE_SHORT[p.badge] ? chip(BADGE_SHORT[p.badge], p.badge === "pr" ? "var(--gold)" : "") : ""}
      <div class="pb-num" style="font-weight:700;font-size:19px;color:var(--gold);flex-shrink:0">${p.y}<span style="font-size:10.5px;color:var(--muted);font-weight:600"> ${line.unit}</span></div>
    </div>
    <div style="font-size:12.5px;color:var(--muted);margin-top:3px">${entrySummary(e, eUnit, true)}</div>
    ${sets.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:9px">
      ${sets.map((s, i) => chip(`${i + 1} · ${setLine(s, ek, eUnit)}${s.rpe ? ` @${esc(s.rpe)}` : ""}`)).join("")}
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
        <div style="font-size:11.5px;color:var(--faint)">${metricLabel(line.kind || (line.cardio ? "cardio" : DEFAULT_KIND), line.unit)}</div>
      </div>
    </div>
    <div style="padding:10px 8px 0">${chartToolbar(true, scope)}</div>
    <div data-linechart="${scope}" data-chartfull="1" style="position:relative;flex:1;min-height:120px;margin:0 8px;touch-action:none"></div>
    <div class="pb-scroll" data-linedetail="${scope}" style="max-height:44%;overflow-y:auto;padding:0 12px calc(18px + var(--pb-sab))">${renderPointDetail(scope)}</div>
  `, "chartFull");
}

/* ── FINDING A LIFT IN A LIST THAT ONLY GROWS ─────────────────────────
   Your lifts is every exercise you have ever logged, newest bests and all,
   and after a year of training that is a screen and a half of scrolling to
   reach the one you came for. So the same search box the library and the
   picker have, over the same two readings of a name (nameMatches).

   IT FILTERS THE LIST AND NOTHING ELSE. The selected lift is worked out
   from the WHOLE list before the filter runs, so typing never moves the
   graph out from under you, and the dropdown above the graph still offers
   everything — narrowing a control that owns the selection would leave the
   lift on screen missing from the only thing that can change it. Tapping a
   result is what moves the graph, exactly as tapping a row always has. */
function progressLiftRows(rows, sel, unit) {
  const shown = rows.filter((r) => nameMatches(r.name, ui.progressQ));
  if (!shown.length)
    return `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px;line-height:1.6">${T("prog.noMatch")}</div>`;
  return shown.map((r, i) => renderGoalRow(r, unit, i === shown.length - 1, sel === r.name)).join("");
}

/* the same list rebuilt off state alone, for the keystroke path: handleBind
   patches this card in place rather than calling render(), which would throw
   away the field the search is being typed into. */
function progressLiftsHTML() {
  const rows = dashboardRows(state.log, state.library, state.goals);
  const selected = ui.progressSelected;
  const sel = selected && rows.some((r) => r.name === selected) ? selected : rows[0]?.name || null;
  return progressLiftRows(rows, sel, state.settings.units);
}

function renderGoalRow(r, unit, last, active) {
  const editing = ui.goalEditing === r.name;
  const hit = r.goal != null && r.best != null && r.best >= r.goal;
  const status = r.goal == null ? T("prog.setGoal") : hit ? T("prog.goalHit") : r.best == null ? T("prog.logToStart")
    : T("prog.goalToGo", { n: Math.round((r.goal - r.best) * 10) / 10, unit: metricUnit(r.kind || DEFAULT_KIND, unit) });

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
        ${r.best ?? "—"}<span style="font-size:10.5px;color:var(--muted);font-weight:600"> ${metricUnit(r.kind || DEFAULT_KIND, unit)}</span>
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

/* Variations sit under the lift they came from rather than alphabetically
   somewhere else in the group, since "Lat Pulldown" and its wide grip being
   ten rows apart is exactly what the link exists to prevent. Anything whose
   parent is not in this list (filtered out, searched past, or deleted)
   stays where it was, so nothing can vanish from a filtered view. */
function nestVariations(rows) {
  const here = new Set(rows.map((x) => x.id));
  const out = [];
  for (const ex of rows) {
    if (ex.variantOf && here.has(ex.variantOf)) continue;
    out.push(ex);
    for (const kid of rows) if (kid.variantOf === ex.id) out.push(kid);
  }
  return out;
}

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
      ${nestVariations(rows).map((ex, i, arr) => `<button data-action="open-exercise-window" data-name="${esc(ex.name)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px 11px ${ex.variantOf ? 30 : 14}px;text-align:left;color:var(--text);border-bottom:${i < arr.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        ${ex.variantOf ? icon("corner-down-right", 13, 'style="color:var(--faint);flex-shrink:0;margin-right:-2px"') : ""}
        ${ex.image
          ? `<img src="${esc(ex.image)}" alt="" style="width:38px;height:38px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--border)">`
          : photoAway(ex)
          /* the same 38px the photo would have taken, so a shared library
             does not comb itself into two differently-indented columns */
          ? `<span title="${esc(T("ex.photoAway"))}" style="width:38px;height:38px;border-radius:8px;flex-shrink:0;border:1.5px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--faint)">${icon("image-off", 15)}</span>`
          : ""}
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${ex.variantOf ? esc(ex.variantName || ex.name) : esc(exLabelOf(ex))}${newFlag(ex)}</div>
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

/* DRAG_READ_OK below is READ_OK's other half, and it draws the same line:
   the profile INDEX and the timers belong to this phone, everything else
   here is a write into somebody else's training. A drag never met that
   check at all, because it arrives as pointerdown rather than as a click —
   so on a profile whose every button said no, dragging the library into a
   different order went straight through, and the next pull silently put it
   back. A new reorderable list has to be decided about in both tables, and
   the default in both is no. */
const DRAG_COMMIT = {
  group: reorderGroups,
  preset: reorderPresets,
  pinnedPreset: reorderPinnedPresets,
  pinnedTimer: reorderPinnedTimers,
  entry: reorderDraftEntries,
  libExercise: reorderLibraryExercises,
  set: reorderSets,
  profile: reorderProfiles,
};
const DRAG_READ_OK = new Set(["profile", "pinnedTimer"]);

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
  if (!h) return;
  /* Refused before the gesture starts rather than on release: a row that
     picks up, follows your finger and then springs back having changed
     nothing reads as a bug, not as a rule. */
  const row = h.closest("[data-dragrow]");
  if (syncReadOnly() && row && !DRAG_READ_OK.has(row.dataset.dragrow)) { toastReadOnly(); return; }
  startRowDrag(e, h);
});
document.addEventListener("pointermove", moveRowDrag);
document.addEventListener("pointerup", endRowDrag);
document.addEventListener("pointercancel", endRowDrag);

/* ── CHOOSING A KIND ────────────────────────────────────────
   Four cards, and each one is labelled with WHAT YOU WILL TYPE rather than
   with the name of a training style. "Sets of seconds" is a thing anybody
   recognises about their own plank; "isometric" is a word you have to
   already know. The name above it is only there to be referred to later.

   Two by two rather than a four-way segmented control, because four
   segments on a phone is four ellipses. */
function kindPicker(action, current, inherited) {
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    ${KIND_ORDER.map((k) => {
      const on = k === current;
      return `<button data-action="${action}" data-k="${k}" style="text-align:left;padding:10px 11px;border-radius:12px;border:1px solid ${on ? "var(--gold)" : "var(--border)"};background:${on ? "rgba(233,185,73,.08)" : "var(--surface)"};color:var(--text)">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:13px;font-weight:700;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${T("kind." + k)}</span>
          ${on ? icon("check", 13, 'style="color:var(--gold);flex-shrink:0"') : ""}
        </div>
        <div style="font-size:11px;color:var(--faint);margin-top:2px;line-height:1.35">${T("kind.logs." + k)}</div>
        ${inherited === k ? `<div style="font-size:10px;color:var(--steel);margin-top:3px">${T("kind.fromGroup")}</div>` : ""}
      </button>`;
    }).join("")}
  </div>`;
}

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

    ${field(T("kind.groupLabel"), kindPicker("group-kind", f.kind || DEFAULT_KIND),
      f.orig ? T("kind.groupHintEdit") : T("kind.groupHintNew"))}

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
    sets: "", reps: "", weight: "", rpe: "", secs: "", minutes: "", intensity: "", notes: "",
    unit: state.settings.units,   // starting pick, changeable per exercise
    createdAt,
  };
  if (isSetKind(kindOf(e))) e.setList = [];
  return e;
}

/* Turn a preset's exercises into fresh, blank draft entries.

   The kind comes from the LIBRARY, not from the copy stored on the preset.
   A preset is a bundle of exercises with no numbers on it, so it has no
   business remembering how they were logged the day it was saved: a preset
   built before a lift became bodyweight was still handing out reps-and-
   weight forms afterwards, while the same lift picked straight out of the
   library gave the new one. Two doors, two forms, and neither session could
   see the other's history. The stored kind is kept only as the answer for
   an exercise that has since left the library. */
function presetToEntries(p) {
  const base = Date.now();
  return (p.exercises || []).map((ex, i) =>
    newEntry(ex.exercise, ex.muscle, readKind(ex.exercise) || ex.kind, base + i));
}

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
          <div style="font-size:11.5px;color:var(--faint)">${esc(groupLabel(ex.muscle))}${kindOf(ex) === "strength" ? "" : " · " + T("kind." + kindOf(ex))}</div>
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

/* ── WHAT THE SAVE BUTTON IS WAITING FOR ──────────────────────────────
   The same two questions actions["exwin-save"] asks, in ONE place,
   because they are asked from two: here, to draw the button, and from
   handleBind, to flip it while somebody types. Keeping a second copy of
   the rule is what broke variations.

   A VARIATION types its short part and nothing else — "Wide grip" — and
   its stored name is composed from the parent's at save time, so the
   draft's `name` starts empty and STAYS empty no matter how completely
   the form is filled in. Both copies of the check looked at `name`, found
   nothing, and left Save greyed out for every variation there has ever
   been: the one form in the app that could not be submitted at all. The
   field that has to be filled is whichever one is on screen.          */
const exDraftReady = (f) => !!(f && (f.muscle || "").trim() &&
  (f.variantOf ? (f.variantName || "").trim() : (f.name || "").trim()));

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
      unit: hist.unit, name: ex.name, cardio: hist.cardio, kind: hist.kind,
    };
  /* a dot that is no longer in the series can't stay selected, and a
     fullscreen copy of a graph that no longer exists has to fold away */
  if (ui.chartSel.ex && !(hist && hist.chart.some((d) => d.e.id === ui.chartSel.ex))) ui.chartSel.ex = null;
  if (!chartState.exLine && ui.chartFull === "ex") ui.chartFull = null;

  const canSave = exDraftReady(ex);
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
  const all = chronoSort(log)
    .filter((e) => e.exercise === name)
    .map((e) => ({ ...e, m: metricOf(e) }))
    .filter((e) => e.m != null);

  /* What this lift is logged in TODAY. Everything that RANKS — the graph,
     the best ever, the PR flags — reads only the sessions in that kind,
     because a rep count and an est. 1RM cannot be put in order together.
     The list below still shows every session: they happened, and a ledger
     that hides them is worse than one that labels them. */
  const kind = readKind(name) || (all.length ? kindOf(all[all.length - 1]) : DEFAULT_KIND);
  const series = all.filter((e) => kindOf(e) === kind);
  const offKind = all.length - series.length;

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
  const byId = Object.fromEntries(chart.map((p) => [p.e.id, p]));
  const sessions = [];
  for (const e of all) {
    const open = sessions.length ? sessions[sessions.length - 1] : null;
    if (open && open.date === e.date) open.entries.push(e);
    else sessions.push({ date: e.date, entries: [e] });
  }
  for (const ses of sessions) {
    const points = ses.entries.map((e) => byId[e.id]).filter(Boolean);
    /* a session in the kind being read gets a headline number and a flag;
       one from before a change of kind gets neither, and says so instead */
    const top = points.length ? points.reduce((a, p) => (p.y > a.y ? p : a), points[0]) : null;
    ses.m = top ? top.y : null;
    ses.badge = top ? top.badge : null;
    ses.offKind = !top;
    Object.assign(ses, outingRows(ses.entries));   // rows, note, best
  }
  sessions.reverse();

  return { series, chart, sessions, best, kind, offKind, cardio: kind === "cardio",
           unit: metricUnit(kind, state.settings.units) };
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
      : photoAway(ex)
      /* Where the machine should be, saying what is actually the case: the
         picture exists and is not on this phone. Not an error and not a
         broken image — nothing here has failed, the training all arrived,
         and one file was too big to come with it. */
      ? `<div class="pb-placeholder" style="height:110px;flex-direction:column;gap:7px;margin-bottom:8px">
          ${icon("image-off", 20)}
          <span style="font-size:12px;letter-spacing:.02em;text-transform:none">${T("ex.photoAway")}</span>
        </div>
        <div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin:0 2px 18px">${T("ex.photoAwayHint")}</div>`
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

    ${exWindowVariations(ex)}
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
  const label = metricLabel(hist.kind, state.settings.units);

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
          <div class="pb-label" style="margin-bottom:3px">${T("ex.best." + hist.kind)}</div>
          <div class="pb-num" style="font-size:32px;font-weight:700;line-height:1;color:var(--gold)">
            ${best.m}<span style="font-size:14px;color:var(--muted);font-weight:600"> ${unit}</span>
          </div>
        </div>
        <div style="text-align:right;font-size:12px;color:var(--muted);line-height:1.5">
          <div style="font-weight:600;color:var(--text)">${cardio
            ? T("sug.cardioSet", { min: esc(best.minutes), rpe: esc(best.intensity) })
            : setLine(best, hist.kind, bUnit)}</div>
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

/* ── THE REST OF THE FAMILY ───────────────────────────────────────────
   Every way you do this movement, in one place, with the one you are
   looking at marked. It sits above the graph rather than below it because
   the question it answers ("wait, which of these am I looking at?") comes
   before any of the numbers do.

   Shown from the parent AND from every variation, always listing the whole
   family, so there is no wrong end to come in from.

   TWO WAYS TO GAIN A FAMILY AND ONE WAY OUT, all three on this panel. Add a
   variation branches a NEW row off this one. File under another lift takes
   THIS row, history and all, and puts it under a base that already exists,
   which is the only answer to a family whose base is simply whichever end
   somebody started logging first (see reparentUnder). And a row that is
   already a variation can leave, because a move you cannot undo is a move
   most people will not make. */
function exWindowVariations(ex) {
  if (!ex || ex.missing) return "";
  const rootId = variantRootId(ex);
  const root = ex.variantOf ? variantParent(ex) : ex;
  const kids = variantsOf(rootId, state.library);
  /* nothing to move it under, so the button would only ever say no */
  const canAttach = state.library.some((x) => !x.variantOf && x.id !== ex.id && x.id !== rootId);
  const attachBtn = canAttach
    ? `<button data-action="ex-attach-start" data-id="${esc(ex.id)}" class="pb-btn pb-ghost" style="width:100%;padding:11px 0;font-size:13.5px;margin-top:6px;border-style:dashed;color:var(--steel);border-color:rgba(93,138,168,.45)">
        ${icon("corner-down-right", 15)} ${T(ex.variantOf ? "ex.moveFamily" : "ex.attachTo")}
      </button>`
    : "";
  const detachBtn = ex.variantOf
    ? `<button data-action="ex-detach" data-id="${esc(ex.id)}" class="pb-btn pb-ghost" style="width:100%;padding:11px 0;font-size:13.5px;margin-top:6px;color:var(--muted)">
        ${icon("unlink", 15)} ${T("ex.detach")}
      </button>`
    : "";
  if (!kids.length && !ex.variantOf) {
    /* nothing to list yet, so this is just the way in */
    return `<button data-action="ex-add-variation" data-id="${esc(rootId)}" class="pb-btn pb-ghost" style="width:100%;padding:11px 0;font-size:13.5px;border-style:dashed;color:var(--gold);border-color:rgba(233,185,73,.45)">
      ${icon("git-branch", 15)} ${T("ex.addVariation")}
    </button>
    ${attachBtn}
    <div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin:10px 2px 18px">${T("ex.variationHint")}</div>`;
  }

  const family = [...(root ? [root] : []), ...kids];
  const row = (x, i, n) => {
    const on = x.id === ex.id;
    return `<button ${on ? "" : `data-action="open-exercise-window" data-name="${esc(x.name)}"`} style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 13px;text-align:left;color:var(--text);background:${on ? "rgba(233,185,73,.06)" : "transparent"};border-bottom:${i < n - 1 ? "1px solid var(--border-soft)" : "none"}">
      <span style="width:7px;height:7px;border-radius:4px;flex-shrink:0;background:${on ? "var(--gold)" : "var(--border)"}"></span>
      <span style="flex:1;min-width:0;font-size:13.5px;font-weight:${on ? 700 : 600};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${x.variantOf ? esc(x.variantName || x.name) : T("ex.baseVariation")}
      </span>
      ${on ? "" : icon("chevron-right", 14, 'style="color:var(--faint);flex-shrink:0"')}
    </button>`;
  };

  return `
    ${sectionTitle(T("ex.variationsTitle"), `<span style="font-size:11px;color:var(--faint)">${TN("variation", kids.length)}</span>`)}
    <div class="pb-card" style="overflow:hidden;margin-bottom:10px">
      ${family.map((x, i) => row(x, i, family.length)).join("")}
    </div>
    <button data-action="ex-add-variation" data-id="${esc(rootId)}" class="pb-btn pb-ghost" style="width:100%;padding:11px 0;font-size:13.5px;border-style:dashed;color:var(--gold);border-color:rgba(233,185,73,.45)">
      ${icon("git-branch", 15)} ${T("ex.addVariation")}
    </button>
    ${attachBtn}
    ${detachBtn}
    <div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin:10px 2px 18px">${T("ex.variationHistoryNote")}</div>`;
}

/* ── PICKING THE LIFT THIS ONE BELONGS UNDER ──────────────────────────
   Two steps in one window, because they are two different questions and
   answering the second well needs the first one answered.

   WHICH LIFT: only BASES are offered. A variation is never a parent (a
   family is one level deep), and this row and its own root are left out
   because neither is a move. The list is searched the same way every other
   exercise list in the app is, over both readings of a name.

   WHAT TO CALL IT: the short part it will wear under that base, guessed by
   shortUnder and shown in a field rather than applied quietly, because the
   guess is arithmetic on a string and the person reading it knows what the
   lift is. The line under it spells out the whole move — the new label, and
   what happens to the variations coming along — before anything is
   written, since this renames rows the log points at. */
function attachBasesHTML() {
  const a = ui.exWinAttach;
  const ex = a && state.library.find((x) => x.id === a.id);
  if (!ex) return "";
  const bases = state.library
    .filter((x) => !x.variantOf && x.id !== ex.id && x.id !== variantRootId(ex))
    .filter((x) => exMatches(x, a.q));
  if (!bases.length)
    return `<div class="pb-card" style="padding:24px;text-align:center;color:var(--muted);font-size:13px;line-height:1.6">${T("ex.attachNoMatch")}</div>`;
  return `<div class="pb-card" style="overflow:hidden">
    ${bases.map((x, i, arr) => {
      const n = variantsOf(x.id, state.library).length;
      return `<button data-action="ex-attach-pick" data-id="${esc(x.id)}" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;text-align:left;color:var(--text);border-bottom:${i < arr.length - 1 ? "1px solid var(--border-soft)" : "none"}">
        <span style="width:8px;height:8px;border-radius:4px;flex-shrink:0;background:${colorFor(x.muscle)}"></span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabelOf(x))}</div>
          <div style="font-size:11.5px;color:var(--faint)">${esc(groupLabel(x.muscle))}${n ? " · " + TN("variation", n) : ""}</div>
        </div>
        ${icon("chevron-right", 15, 'style="color:var(--faint);flex-shrink:0"')}
      </button>`;
    }).join("")}
  </div>`;
}

function renderAttachVariation() {
  const a = ui.exWinAttach;
  if (!a) return "";
  const ex = state.library.find((x) => x.id === a.id);
  if (!ex) return "";
  const root = a.parentId ? state.library.find((x) => x.id === a.parentId) : null;

  if (!root) {
    return fullScreen(100, `
      <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;border-bottom:1px solid var(--border-soft)">
        <button data-action="ex-attach-close" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
        <div style="flex:1;min-width:0">
          <div class="pb-num" style="font-size:17px;font-weight:700;line-height:1.15">${T("ex.attachTitle")}</div>
          <div style="font-size:11.5px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(exLabelOf(ex))}</div>
        </div>
      </div>
      <div style="padding:12px 16px 0">
        <div style="position:relative">
          ${icon("search", 16, 'style="position:absolute;left:12px;top:12px;color:var(--faint)"')}
          <input class="pb-input" style="padding-left:36px" placeholder="${T("ex.attachSearch")}" data-bind="attachq" value="${esc(a.q)}" data-autofocus>
        </div>
      </div>
      <div class="pb-scroll" data-scrollkey="attachPick" style="flex:1;overflow-y:auto;padding:12px 16px calc(30px + var(--pb-sab))">
        <div id="attachList">${attachBasesHTML()}</div>
        <div style="font-size:11.5px;color:var(--faint);line-height:1.5;margin:12px 2px 0">${T("ex.attachHint")}</div>
      </div>
    `, "exWinAttach");
  }

  const short = (a.short || "").trim();
  const followers = variantsOf(ex.id, state.library);
  const ok = !!short;
  return fullScreen(100, `
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="ex-attach-back" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
      <div class="pb-num" style="font-size:17px;font-weight:700;flex:1;min-width:0">${T("ex.attachTitle")}</div>
      <button data-action="ex-attach-save" id="attachSaveBtn" class="pb-btn pb-gold" style="padding:8px 16px;font-size:13.5px;opacity:${ok ? 1 : 0.45}" ${ok ? "" : "disabled"}>${icon("check", 15)} ${T("common.save")}</button>
    </div>
    <div class="pb-scroll" data-scrollkey="attachName" style="flex:1;overflow-y:auto;padding:16px 16px calc(40px + var(--pb-sab))">
      ${sectionTitle(T("ex.variationOf", { name: esc(exLabelOf(root)) }))}
      ${field(T("ex.variationName"), `<input class="pb-input" data-bind="attach.short" value="${esc(a.short || "")}" placeholder="${esc(T("ex.variationPlaceholder"))}" data-autofocus>`, T("ex.variationNameHint"))}
      <div class="pb-card" style="padding:13px 14px;margin-bottom:10px">
        <div class="pb-label" style="margin-bottom:6px">${T("ex.attachPreview")}</div>
        <div id="attachPreview" style="font-weight:700;font-size:15px">${esc(exLabelOf(root))} · ${esc(short || T("ex.variationName"))}</div>
        ${followers.length ? `<div style="font-size:12px;color:var(--muted);line-height:1.5;margin-top:8px">
          ${T("ex.attachCarries", { n: TN("variation", followers.length) })}
          <div style="margin-top:6px">${followers.map((k) => `<div style="display:flex;align-items:center;gap:7px;padding:2px 0;font-size:12.5px;color:var(--text)">
            ${icon("corner-down-right", 12, 'style="color:var(--faint);flex-shrink:0"')}
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(exLabelOf(root))} · ${esc(shortUnder(k, ex.name))}</span>
          </div>`).join("")}</div>
        </div>` : ""}
      </div>
      <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:0 2px 18px">${T("ex.attachNote")}</div>
    </div>
  `, "exWinAttach");
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
      const rk = r.kind || DEFAULT_KIND;
      const line = rk === "cardio"
        ? T("sug.cardioSet", { min: esc(r.minutes), rpe: esc(r.intensity) })
        : setLine(r, rk, r.unit);
      const tail = [r.rpe ? `@${esc(r.rpe)}` : "", r.topOf ? T("last.topOf", { n: r.topOf }) : ""].filter(Boolean).join(" · ");
      return chip(`<span style="color:var(--faint)">${n + 1} ·</span> ${line}${tail ? ` · ${tail}` : ""}`);
    }).join("");

    return `<button data-action="open-log-day" data-date="${esc(ses.date)}" style="width:100%;display:block;text-align:left;padding:11px 12px;color:var(--text);${i ? "border-top:1px solid var(--border-soft)" : ""}">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="pb-num" style="font-weight:600;font-size:13.5px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${fmtDate(ses.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </div>
        ${ses.offKind
          ? chip(T("kind." + (ses.rows[0] && ses.rows[0].kind || DEFAULT_KIND)), "var(--steel)")
          : BADGE_SHORT[ses.badge] ? chip(BADGE_SHORT[ses.badge], ses.badge === "pr" ? "var(--gold)" : "") : ""}
        ${ses.m != null ? `<div class="pb-num" style="font-weight:700;font-size:15px;flex-shrink:0;color:${ses.badge === "pr" ? "var(--gold)" : "var(--text)"}">
          ${ses.m}<span style="font-size:10px;color:var(--muted);font-weight:600"> ${hist.unit}</span>
        </div>` : ""}
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
      ${hist.offKind ? T("kind.offKindNote", { n: TN("session", hist.offKind), kind: T("kind." + hist.kind) }) + " " : ""}${ui.workoutSheet ? T("ex.historyHintOpen") : T("ex.historyHint")}
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
    /* A row whose photo stayed on another phone offers the same control
       saying something different: there is nothing here to replace, and
       nothing this device can do to fetch it, so what is on offer is a
       picture of your OWN machine. Uploading one clears the flag, because
       the row now holds a photo and is not waiting for one. */
    : `<label class="pb-placeholder" style="height:120px;cursor:pointer;flex-direction:column;gap:8px;color:var(--faint)">
        ${icon(photoAway(f) ? "image-off" : "image-plus", 22)}
        <span style="font-size:12px;letter-spacing:.04em;text-transform:none;font-weight:600">${T(photoAway(f) ? "ex.photoAwayAdd" : "ex.uploadPhoto")}</span>
        <input type="file" accept="image/*" data-filebind="exwin.image" style="display:none">
      </label>`;

  /* A variation is named by what makes it one. Its stored name still has to
     be unique (everything in the app is keyed by it) so exwin-save composes
     that from the parent, and this field only ever holds the short part. */
  const parent = variantParent(f);
  const nameField = f.variantOf
    ? `${sectionTitle(T("ex.variationOf", { name: esc(exLabelOf(parent) || "—") }))}
       ${field(T("ex.variationName"), `<input class="pb-input" data-bind="exwin.variantName" value="${esc(f.variantName || "")}" placeholder="${esc(T("ex.variationPlaceholder"))}" data-autofocus>`, T("ex.variationNameHint"))}`
    : field(T("ex.nameRequired"), `<input class="pb-input" data-bind="exwin.name" value="${esc(exLabelOf(f))}" placeholder="—">`);

  return `
    ${nameField}
    ${field(T("ex.groupRequired"), musclePicker, T("ex.groupHint"))}
    ${field(T("kind.exLabel"), kindPicker("exwin-kind", exKind(f), f.muscle ? groupKind(f.muscle) : null), T("kind.exHint"))}

    ${field(T("ex.photo"), imageBlock, photoAway(f) ? T("ex.photoAwayHint") : T("ex.photoHint"))}

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
     them from the comparison base, or the PR badges would be measuring the
     very rows being edited against themselves. */
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
                : kindOf(e) === "cardio" ? T("wo.noDataCardio")
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
      ${/* Only on a lift with nothing in it, because this is the one row the
            save no longer decides about: a blank is kept now, so saying "I
            skipped that one" has to be something a finger does. A filled-in
            entry holds numbers and is deleted the long way, from its own form,
            where opening it is already the second thought. Never in a plan: a
            plan is ALL blanks by design, and none of them is waiting. */
        planning || !empty ? "" : `<button data-action="scrap-draft-entry" data-id="${e.id}" title="${T("wo.scrap")}" style="flex-shrink:0;padding:12px 13px;color:var(--faint);align-self:stretch;border-left:1px solid var(--border-soft)">${icon("trash-2", 15)}</button>`}
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

    ${/* the bottom padding here is only what the first paint uses: fitScrollFooters
         measures the real footer and writes the clearance over it, so don't tune
         this number when the footer grows a line, and don't remove the footer's
         data-footer-for either. */""}
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

    <div data-footer-for="worksheet" style="position:absolute;bottom:0;left:0;right:0;padding:12px 16px calc(18px + var(--pb-sab));background:linear-gradient(transparent, var(--bg) 30%)">
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


/* ── THE STORAGE CHECK SCREEN ─────────────────────────────────────────
   Settings -> Data -> Storage check. One screen, three questions answered
   in the order somebody standing in front of an empty app asks them: what
   address is this, what is actually saved here, and can I get it back.

   Every save is a row that says how much training is in it, and a verdict
   in plain words rather than a key name: the one you are in, one you are
   not, one the app has lost track of, one it cannot read. Only the third
   gets a button, because it is the only one this screen can fix. */
const storageKB = (n) => (n < 1024 ? "<1" : Math.round(n / 1024)) + " KB";

function renderStorage() {
  const scan = storageScan();
  const saves = scan.rows.filter((r) => !r.index);
  const orphans = saves.filter((r) => r.ok && !r.listed && !r.active);
  const withData = saves.filter((r) => r.ok && r.entries > 0);

  /* The headline is the question they came here with, answered before any
     of the detail: is anything of mine in this browser at all? */
  const verdict = unreadable === activeProfileId() ? { c: "var(--red)", t: T("stor.held") }
    : !scan.readable ? { c: "var(--red)", t: T("stor.noAccess") }
    : !saves.length ? { c: "var(--red)", t: T("stor.nothing") }
    : orphans.some((r) => r.entries > 0) ? { c: "var(--gold)", t: T("stor.foundLost") }
    : withData.length ? { c: "var(--green)", t: T("stor.foundOk") }
    : { c: "var(--muted)", t: T("stor.foundEmpty") };

  const rows = saves.map((r) => {
    /* damaged is checked FIRST, including on the save the app is currently
       sitting on: "in use" there would be describing the blank the app
       invented rather than the bytes on the disk, which are the thing this
       screen exists to tell the truth about */
    const state = !r.ok ? { c: "var(--red)", t: T("stor.unreadable") }
      : r.active ? { c: "var(--green)", t: T("stor.thisOne") }
      : !r.listed ? { c: "var(--gold)", t: T("stor.lost") }
      : { c: "var(--steel)", t: T("stor.otherProfile") };
    return `<div class="pb-card" style="padding:13px 14px;margin-bottom:8px;border-color:${r.ok && !r.listed && !r.active ? "var(--gold)" : "var(--border)"}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
        ${chip(state.t, state.c)}
        ${r.legacy ? chip(T("stor.legacy"), "var(--muted)") : ""}
        <div style="flex:1"></div>
        <div style="font-size:11px;color:var(--faint)">${storageKB(r.bytes)}</div>
      </div>
      ${r.ok
        ? `<div class="pb-num" style="font-size:20px;font-weight:700;line-height:1.15">${T("stor.counts", { days: TN("day", r.days), sets: TN("logEntry", r.entries) })}</div>
           <div style="font-size:12px;color:var(--muted);margin-top:3px">${T("stor.counts2", { lifts: TN("exercise", r.lifts), body: TN("checkin", r.body) })}${r.name ? " \u00b7 " + esc(r.name) : ""}</div>`
        : `<div style="font-size:13px;color:var(--red);line-height:1.5">${T("stor.unreadableBody")}</div>`}
      <div style="font-size:10.5px;color:var(--faint);margin-top:8px;word-break:break-all;font-family:ui-monospace,monospace">${esc(r.key)}</div>
      ${r.ok && !r.listed && !r.active ? `<button data-action="storage-adopt" data-key="${esc(r.key)}" class="pb-btn pb-gold" style="width:100%;padding:12px 0;font-size:14.5px;margin-top:11px">
        ${icon("life-buoy", 16)} ${T("stor.recover")}
      </button>` : ""}
      ${/* On EVERY save, damaged ones included, and not only the ones Recover
            can help: getting the file off the phone is the move that works
            when the phone is too full for Recover to finish, and it is the
            only move at all on a save nothing can parse. Both read and
            neither writes, which is the whole point. */""}
      <div style="display:flex;gap:8px;margin-top:${r.ok && !r.listed && !r.active ? 8 : 11}px">
        <button data-action="storage-export" data-key="${esc(r.key)}" class="pb-btn pb-ghost" style="flex:1;padding:11px 0;font-size:13px">
          ${icon("download", 14)} ${T("profile.export")}
        </button>
        ${shareFileType() ? `<button data-action="storage-share" data-key="${esc(r.key)}" class="pb-btn pb-ghost" style="flex:1;padding:11px 0;font-size:13px">
          ${icon("share-2", 14)} ${T("stor.share")}
        </button>` : ""}
      </div>
    </div>`;
  }).join("");

  return fullScreen(92, `
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-storage" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${T("stor.title")}</div>
    </div>
    <div class="pb-scroll" data-scrollkey="storage" style="flex:1;overflow-y:auto;padding:16px 16px calc(40px + var(--pb-sab))">
      <div class="pb-card" style="padding:15px;margin-bottom:16px;border-color:${verdict.c}">
        <div class="pb-label" style="margin-bottom:5px">${T("stor.verdict")}</div>
        <div style="font-size:14.5px;font-weight:600;line-height:1.45;color:${verdict.c}">${verdict.t}</div>
      </div>

      ${/* The address is first because it is the one thing this screen can be
            WRONG about in a way nothing on it would reveal: a browser looking
            at the right app on the wrong address sees an empty store and can
            say nothing about the one the training is actually in. */""}
      ${sectionTitle(T("stor.address"))}
      <div class="pb-card" style="padding:13px 14px;margin-bottom:16px">
        <div style="font-size:13px;word-break:break-all;font-family:ui-monospace,monospace;color:var(--text)">${esc(scan.origin || "\u2014")}</div>
        <div style="font-size:11.5px;color:var(--faint);margin-top:7px;line-height:1.5">${T("stor.addressHint")}</div>
      </div>

      ${sectionTitle(T("stor.saves"), `<span style="font-size:11px;color:var(--faint)">${T("stor.totalUsed", { size: storageKB(scan.total) })}</span>`)}
      ${saves.length ? rows : `<div class="pb-card" style="padding:22px;text-align:center;color:var(--faint);font-size:13px;line-height:1.6">${T("stor.nothingBody")}</div>`}
      ${scan.indexOk ? "" : `<div style="font-size:12px;color:var(--gold);line-height:1.55;margin:2px 4px 10px">${T("stor.noIndex")}</div>`}

      <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin:10px 4px 10px">${T("stor.footer")}</div>
      <div style="height:14px"></div>
    </div>
  `, "storage");
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
  /* metricOf converts the entry's own unit to the default one, so the two
     bars below are subtracted from it in the same unit */
  const metric = metricOf(f);

  /* ── THE TWO BARS THIS ESTIMATE IS HELD UP AGAINST ──────────────────
     LAST SESSION and BEST EVER, both as numbers, both in the default unit
     that metricOf converts into, so they can sit beside the figure above
     them and be subtracted from it by eye.

     This used to be one word: "Below best, normal, keep going", or "Beat
     your best 💪". Encouragement is not information. It never said what
     the best WAS, so the one question it provoked ("by how much?") was the
     one it could not answer, and it left the only bar in sight an all-time
     one that most sessions are nowhere near. The bar you can actually act
     on is last week's, which the word never mentioned at all.

     Filtered by KIND as well as by name, which the word never was. That
     mattered less when the output was a sentence and matters completely
     now that it is a number: metricOf answers in kilos for a strength
     session and in reps for a bodyweight one, so pooling them put a rep
     count in a kilo column. Same rule as computeBadges, earlierOutings
     and the graph — a lift is read in the kind it is logged in today.

     The window is otherwise unchanged, and deliberately wider than
     earlierOutings: it includes the entries in the open day sheet, which
     are not in state.log yet, so a lift logged twice in one session is
     measured against its own earlier card.                            */
  let lastMetric = null, bestMetric = null, lastDate = null;
  {
    const draft = ui.workoutSheet;
    const editingIds = draft && draft.editing ? new Set(draft.originalIds || []) : null;
    const priorLog = editingIds ? state.log.filter((e) => !editingIds.has(e.id)) : state.log;
    const base = isDraft
      ? [...priorLog, ...(draft ? draft.entries.map((e) => ({ ...e, date: draft.date })) : [])].filter((e) => e.id !== f.id)
      : state.log.filter((e) => e.id !== f.id);
    const date = f.date || (isDraft && draft ? draft.date : null) || todayStr();
    const k = kindOf(f);
    /* scored, not merely earlier: a lift unticked back to not-done is a row
       with no numbers on it, and letting one BE the last session would hand
       back a blank date and hide the real one behind it */
    const scored = chronoSort(base)
      .filter((e) => e.exercise === f.exercise && kindOf(e) === k &&
        (e.date < date || (e.date === date && e.createdAt < f.createdAt)))
      .map((e) => ({ date: e.date, m: metricOf(e) }))
      .filter((x) => x.m != null);
    const top = (rows) => rows.reduce((m, x) => (m == null || x.m > m ? x.m : m), null);
    bestMetric = top(scored);
    /* two entries of one lift on one day are one session's work, so the last
       session is the best of that DAY, the same reading lastOuting takes */
    lastDate = scored.length ? scored[scored.length - 1].date : null;
    lastMetric = lastDate == null ? null : top(scored.filter((x) => x.date === lastDate));
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
  return { cardio, metric, lastMetric, bestMetric, lastDate, valid, onRecord, lineUp };
}

/* Those two bars, drawn: LAST TIME on the left, BEST EVER on the right,
   in that order because that is the order they are useful in. Last week's
   number is the one you can do something about tonight; the all-time one
   is the ceiling you are walking toward, and putting the ceiling first
   would make every ordinary session look like a failure.

   Each wears the set list's own verdict colours against its own bar —
   gold when today's figure is past it, green when it is level, muted when
   it is not there yet — so "did I beat it" is answered by the colour and
   "by how much" by the two numbers, without a sentence in between. A bar
   that does not exist yet (a first outing) prints an em dash rather than
   going missing, so the row does not change shape the moment you have
   history. No unit on either: they are the same quantity as the figure
   beside them, whose own label already carries it.

   Text and colour only, no icon: updateEntryPreview rewrites this in
   place while you type, and a freshly injected lucide placeholder has
   nothing to turn it into a glyph.                                     */
function entryRefCols(metric, lastMetric, bestMetric) {
  const col = (label, ref) => {
    const v = ref == null || metric == null ? null
      : metric > ref ? "beat" : metric < ref ? "under" : "hit";
    return `<div>
      <div class="pb-label" style="font-size:9.5px;letter-spacing:.07em">${label}</div>
      <div class="pb-num" style="font-size:17px;font-weight:700;line-height:1.2;color:${
        ref == null ? "var(--faint)" : v ? VERDICT_COLOR[v] : "var(--muted)"}">${ref ?? "—"}</div>
    </div>`;
  };
  return col(T("best.lastLabel"), lastMetric) + col(T("best.label"), bestMetric);
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
function ghostSetRow(t, n, unit, kind = DEFAULT_KIND) {
  return `<div class="pb-card" style="display:flex;align-items:center;margin-bottom:8px;overflow:hidden;border:1px dashed var(--border);background:transparent">
    <button data-action="plan-load-set" data-i="${n - 1}" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:11px 4px 11px 12px;text-align:left;color:var(--muted)">
      <div class="pb-num" style="width:24px;height:24px;border-radius:7px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:var(--faint);flex-shrink:0">${n}</div>
      <div style="flex:1;min-width:0">
        <div class="pb-num" style="font-weight:700;font-size:14.5px;color:var(--muted)">${setLine(t, kind, unit)}</div>
        <div style="font-size:11px;color:var(--faint)">${T("plan.ghostLabel")}</div>
      </div>
    </button>
    <button data-action="plan-tick" data-i="${n - 1}" title="${T("plan.ghostDo")}" style="flex-shrink:0;padding:12px 14px;color:var(--gold);align-self:stretch;border-left:1px solid var(--border-soft)">${icon("check", 17)}</button>
  </div>`;
}

const VERDICT_COLOR = { beat: "var(--gold)", hit: "var(--green)", under: "var(--muted)" };

function renderSetList(f, unit, planning, isDraft) {
  const list = f.setList || [];
  const k = kindOf(f);
  const filled = filledSets(f);
  const top = bestSet(filled, k);
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
    setHasData(s, k) ? setLine(s, k, unit) : T("sets.fillIn"),
    setHasData(s, k)
      ? [scoreWorthShowing(k) ? T("sets.score", { n: setScore(s, k), unit: metricUnit(k, unit) }) : "",
         s.rpe ? `RPE ${esc(s.rpe)}` : ""].filter(Boolean).join(" · ")
      : T("sets.blank"),
    `<span class="pb-num" style="font-size:12.5px;font-weight:700;color:var(--faint);flex-shrink:0;margin-right:14px">${i + 1}</span>`)).join("");

  const rows = list.map((s, i) => {
    const m = setScore(s, k);
    const isBest = top && s.id === top.id && filled.length > 1;
    const blank = !setHasData(s, k);
    /* a plan outranks last time: it is the thing you decided to do */
    const t = targets[i];
    const prev = !t && lastRes ? lastRes.rows[i] : null;
    const ref = t || prev;
    /* and it is judged by a different rule, because it is a different
       question: setVerdict keeps a plan's two axes, setProgress asks the
       score whether this slot went better than it did last time */
    const v = t ? setVerdict(s, t, k) : prev ? setProgress(s, prev, k) : null;
    const refShort = (r) => k === "bodyweight" ? T("unit.nReps", { n: esc(r.reps) })
      : k === "hold" ? T("unit.nSecs", { n: esc(r.secs) })
      /* two decimals, the same precision the row itself carries: a line
         that reads "last time 7 × 26.3" beside a verdict measured on 26.25
         is naming a weight nobody lifted */
      : `${esc(r.reps)} × ${esc(trimNum(r.weight, 2))}`;
    const refLine = t ? T("plan.vsTarget", { target: refShort(t) })
      : prev ? T("sets.vsLast", { target: refShort(prev) })
      : "";
    const cont = drops.cont[i];
    return `${drops.head[i] ? `<div style="display:flex;align-items:center;gap:6px;margin:2px 2px 4px;font-size:10.5px;font-weight:700;letter-spacing:.07em;color:var(--steel)">${icon("chevrons-down", 12)} ${T("sets.dropset")}</div>` : ""}
    <div class="pb-card" style="display:flex;align-items:center;margin-bottom:${cont || drops.cont[i + 1] ? 4 : 8}px;margin-left:${cont ? 16 : 0}px;overflow:hidden${blank ? ";border:1px dashed rgba(233,185,73,.55)" : ""}${cont ? ";border-left:2px solid var(--steel)" : ""}">
      <button data-action="edit-set" data-id="${s.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:11px 4px 11px 12px;text-align:left;color:var(--text)">
        <div class="pb-num" style="width:24px;height:24px;border-radius:7px;background:${cont ? "transparent" : "var(--surface2)"};border:1px ${cont ? "dashed var(--steel)" : "solid var(--border)"};display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:var(--muted);flex-shrink:0">${cont ? icon("corner-down-right", 12) : i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14.5px;color:${blank ? "var(--gold)" : "var(--text)"}">
            ${blank ? T("sets.fillIn") : setLine(s, k, unit)}
          </div>
          ${!blank ? `<div style="font-size:11.5px;color:var(--faint)">${
            [scoreWorthShowing(k) ? T("sets.score", { n: m, unit: metricUnit(k, unit) }) : "",
             s.rpe ? `RPE ${esc(s.rpe)}` : "", refLine].filter(Boolean).join(" · ")
          }</div>` : ""}
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
    .map((t, i) => ghostSetRow(t, list.length + i + 1, (f.plan && f.plan.unit) || unit, k)).join("");

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
    : o.kind === "secs" ? T("sug.optSec", { n: SUG_HOLD_SEC })
    : o.kind === "weight" ? T("sug.optWeight", { n: sugWeight(o.step), unit })
    : o.kind === "minutes" ? T("sug.optMin", { n: SUG_CARDIO_MIN })
    : T("sug.optRpe");
  const line = o.minutes != null
    ? T("sug.cardioSet", { min: o.minutes, rpe: o.intensity })
    : o.secs != null ? T("unit.nSecs", { n: o.secs })
    : o.weight == null ? T("unit.nReps", { n: o.reps })
    : `${o.reps} × ${sugWeight(o.weight)} ${unit}`;
  const data = o.minutes != null
    ? `data-min="${o.minutes}" data-rpe="${o.intensity}"`
    : o.secs != null ? `data-secs="${o.secs}"`
    : o.weight == null ? `data-reps="${o.reps}"`
    : `data-reps="${o.reps}" data-weight="${sugWeight(o.weight)}"`;
  /* identical framing on both, and the only difference allowed is the quiet
     tag saying which one moves the estimate less */
  return `<button data-action="${fill}" ${data} style="flex:1;min-width:0;text-align:left;padding:9px 10px;border-radius:11px;color:var(--text);background:var(--surface);border:1px solid var(--border)">
    <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)">${label}</div>
    <div class="pb-num" style="font-size:14px;font-weight:700;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${line}</div>
    ${(() => {
      /* "11 reps → 11" is the option said twice; only a score you cannot
         read off the option itself earns the line (see scoreWorthShowing) */
      const gives = o.secs == null && o.weight == null && o.minutes == null
        ? "" : `<span style="font-size:10.5px;color:var(--faint)">${T("sug.gives", { n: o.m })}</span>`;
      return gives || smaller ? `<div style="display:flex;align-items:baseline;gap:5px;margin-top:1px">
        ${gives}${smaller ? `<span style="font-size:9.5px;color:var(--steel);white-space:nowrap">${T("sug.smaller")}</span>` : ""}
      </div>` : "";
    })()}
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
    : s.kind === "hold" ? T("unit.nSecs", { n: s.prev.secs })
    : s.kind === "bodyweight" ? T("unit.nReps", { n: s.prev.reps })
    : `${s.prev.reps} × ${sugWeight(s.prev.weight)} ${eUnit}`;
  const sUnit = metricUnit(s.kind === "step" ? "strength" : s.kind, unit);

  const head = `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:9px">
    <div class="pb-label" style="flex:1;min-width:0">${T("sug.title")}</div>
    <div style="font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${T("sug.lastTime", { set: last, date: fmtShort(s.prev.date) })}</div>
  </div>`;

  if (s.done)
    return wrap(head + `<div style="display:flex;gap:9px;align-items:flex-start">
      ${icon("check-circle", 15, 'style="color:var(--green);flex-shrink:0;margin-top:1px"')}
      <div style="flex:1;font-size:12.5px;color:var(--muted);line-height:1.5">${T("sug.ahead", { n: s.prev.m, now: s.now, unit: sUnit })}</div>
    </div>`);

  const mUnit = sUnit;
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
    const rk = r.kind || DEFAULT_KIND;
    const line = rk === "cardio"
      ? T("sug.cardioSet", { min: esc(r.minutes), rpe: esc(r.intensity) })
      : setLine(r, rk, r.unit);
    const side = [
      r.topOf ? T("last.topOf", { n: r.topOf }) : "",
      r.rpe ? `RPE ${esc(r.rpe)}` : "",
      r.m != null && scoreWorthShowing(rk) ? T("sets.score", { n: r.m, unit: metricUnit(rk, r.unit) }) : "",
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
  const { cardio, metric, lastMetric, bestMetric, valid, onRecord, lineUp } = entryComputed();
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
        <div style="font-size:11.5px;color:var(--faint)">${planning ? T("plan.entrySub")
          : `${T("kind." + kindOf(f))} · ${T(cardio ? "entry.subCardio" : detailed ? "entry.subSets" : "entry.subTop")}`}</div>
      </div>
      <button data-action="delete-entry-form" style="color:var(--red);padding:6px">${icon("trash-2", 18)}</button>
    </div>

    ${/* first-paint clearance only; fitScrollFooters measures the footer below */""}
    <div class="pb-scroll" data-scrollkey="entryform" style="flex:1;overflow-y:auto;padding:10px 16px calc(120px + var(--pb-sab))">
      ${!isDraft ? field("Date", `<input type="date" class="pb-input" data-bind="entry.date" value="${esc(f.date)}">`) : ""}
      ${convert}
      ${f.plan ? renderPlanTarget(f, eUnit) : renderSuggestion(form, unit)}
      ${renderLastTime(form)}
      ${inputs}
      ${superRow}
      ${field(T("entry.notes"), `<textarea class="pb-input" rows="2" data-bind="entry.notes" placeholder="—" style="resize:none">${esc(f.notes)}</textarea>`,
        detailed ? T("entry.notesHint") : "")}

      <!-- live computed row: the sheet's Est. 1RM, against last time and against the best ever -->
      <div class="pb-card2" style="padding:12px 14px;display:flex;align-items:flex-end;gap:12px;margin-top:4px">
        <div style="flex:1;min-width:0">
          <div class="pb-label">${detailed && kindOf(f) === "strength" ? T("entry.bestSet1rm", { unit }) : metricLabel(kindOf(f), unit)}</div>
          <div id="entryMetric" class="pb-num" style="font-size:30px;font-weight:700;color:var(--gold);line-height:1.05">${metric ?? "—"}</div>
        </div>
        <div id="entryBadge" style="flex-shrink:0;display:flex;justify-content:flex-end;gap:15px;text-align:right">
          ${entryRefCols(metric, lastMetric, bestMetric)}
        </div>
      </div>
      ${kindOf(f) === "strength" && eUnit !== unit ? `<div style="font-size:11.5px;color:var(--faint);margin:8px 2px 0;line-height:1.5">
        ${T("entry.converted", { from: eUnit, to: unit })}
      </div>` : ""}
      ${detailed ? `<div style="font-size:11.5px;color:var(--faint);margin:8px 2px 0;line-height:1.5">
        ${T("entry.highestNote")}
      </div>` : ""}

      ${planning ? "" : renderTimerList()}
    </div>

    <div data-footer-for="entryform" style="position:absolute;bottom:0;left:0;right:0;padding:12px 16px calc(18px + var(--pb-sab));background:linear-gradient(transparent, var(--bg) 30%)">
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

   So the est. 1RM says which side of last session it lands on. TWO
   references, because they answer two different questions and conflating
   them was the old bug:

   THE MAIN ONE IS POSITIONAL: set two is measured against last session's
   SET TWO, on the same number setProgress grades the row behind this
   sheet with, so this line and the beat/under badge on the row can never
   disagree. It used to be measured against last session's BEST set, which
   made the card say "1.2 lower than last time" on a back-off set that had
   just beaten the back-off set it was actually repeating — the estimate
   was true and the comparison was answering a question nobody asked. A
   session is a list of sets, and the bar for a set is the set that stood
   in its place.

   THE SIDE ONE IS ALL-TIME, the best this lift has ever been worth, over
   the same strictly-earlier window the PR badge reads (earlierOutings) so
   the two can never disagree about what "best" was. It is deliberately
   small and quiet: it is the ceiling, not the target, and on most sets of
   most sessions the honest answer is that you are nowhere near it. When
   the set in the boxes clears it, it goes gold and says so, which is the
   same claim the PR badge will make when the entry is saved.

   Both are read in the unit being typed in today — the positional one
   through lastTimeSets, the all-time one through weightAs — because the
   number they are subtracted from is drawn in the entry's unit and a kg
   estimate held up against an lbs one is not a comparison at all.

   It states a fact about a number, it does not propose one, so unlike the
   suggestion card it stays put under a plan: the plan owns "what am I
   going for", this only ever says what you have typed so far comes to.

   Sets past where last session ran out are UNJUDGED, the same rule
   entryLastResult follows: a fourth set on a day that had three has
   nothing in its place to be measured against, and inventing one out of
   the best set is how this went wrong in the first place. The card says so
   in a faint line rather than going blank, because a card that silently
   drops its comparison reads like a bug. */
function lastSetMetric(f, isDraft, index) {
  const prev = lastTimeSets(f, isDraft);
  if (!prev) return null;
  const r = prev.rows[index];
  /* the position existed but the session ended before it: `m` null says
     "nothing to compare with", `ran` says which of the two reasons it is */
  if (!r) return { m: null, date: prev.date, index, ran: false };
  const m = setScore(r, kindOf(f));
  return m == null ? null : { m, date: prev.date, index, ran: true };
}

/* The ceiling: the best single set this lift has ever been worth, in the
   unit being typed in today. Same window as the PR badge, so a set that
   clears this is a set that will come back wearing one. */
function bestEverMetric(f, isDraft) {
  const k = kindOf(f);
  if (!isSetKind(k)) return null;
  const fu = unitOf(f);
  let m = null, date = null;
  for (const e of earlierOutings(f, isDraft))
    for (const r of outingRows([e]).rows) {
      if (r.kind !== k) continue;
      /* recomputed rather than read off r.m, which is scored in the unit
         that session was LOGGED in and would put an lbs number next to a
         kg one with no sign that anything had changed */
      const v = k === "strength" ? est1RM(weightAs(r.weight, r.unit || fu, fu), +r.reps) : r.m;
      if (v != null && (m == null || v > m)) { m = v; date = e.date; }
    }
  return m == null ? null : { m, date };
}

/* One line under that number: the verdict, in the colours the set list's
   own beat/same/under verdicts wear, then the set it was measured against,
   because a comparison that will not name what it compared with is just an
   opinion. It names the POSITION as well as the number ("set 2 last time"),
   since the number alone would read as the session's, which is exactly the
   thing this stopped being. Text and colour only, no icon: this is
   rewritten in place while you type (see updateSetPreview) and a freshly
   injected lucide placeholder has nothing to turn it into a glyph. */
function vsLastLine(m, ref) {
  if (!ref) return "";
  const i = ref.index + 1;
  /* last session ended before this position: no verdict, and said out loud
     rather than left as a gap, or the card looks like it failed to load */
  if (!ref.ran) return `<span style="color:var(--faint)">${T("vsSet.none", { i, date: fmtShort(ref.date) })}</span>`;
  const base = `<span style="color:var(--faint)">${T("vsSet.base", { i, n: ref.m, date: fmtShort(ref.date) })}</span>`;
  if (m == null) return base;
  const d = Math.round((m - ref.m) * 10) / 10;
  const v = d > 0 ? "beat" : d < 0 ? "under" : "hit";
  const word = d === 0 ? T("vsSet.same", { i }) : T(d > 0 ? "vsSet.over" : "vsSet.under", { n: Math.abs(d), i });
  return `<span style="color:${VERDICT_COLOR[v]};font-weight:700">${word}</span> · ${base}`;
}

/* The quiet number to the right of it: the ceiling this lift has ever hit,
   and how far under it you are. Small, muted and second, because on most
   sets of most sessions the answer is "a long way", and a figure nobody can
   beat today is context, not a target — the positional line to its left is
   the one with something to say about the set in the boxes.

   It goes gold and says so the moment the set clears it, which is the same
   claim the PR badge will make when the entry is saved, from the same
   window. Patched in place by updateSetPreview, so text and colour only. */
function bestEverBlock(m, ref, unit) {
  if (!ref) return "";
  const k = ui.entryForm ? kindOf(ui.entryForm.f) : DEFAULT_KIND;
  const pr = m != null && m > ref.m;
  const sub = pr ? T("best.newPr")
    : m == null ? fmtShort(ref.date)
    : m === ref.m ? T("best.matched")
    : T("best.toGo", { n: trimNum(ref.m - m) });
  return `<div class="pb-label" style="font-size:9.5px;letter-spacing:.07em">${T("best.label")}</div>
    <div class="pb-num" style="font-size:17px;font-weight:700;line-height:1.15;color:${pr ? "var(--gold)" : "var(--muted)"}">${ref.m}<span style="font-size:10px;font-weight:600;color:var(--faint)"> ${esc(metricUnit(k, unit))}</span></div>
    <div style="font-size:10px;line-height:1.35;margin-top:1px;color:${pr ? "var(--gold)" : "var(--faint)"}">${sub}</div>`;
}

/* Debounce for the is-this-name-free lookup, so a name is not asked about
   once per keystroke. Module-level like the chart's gesture state: it belongs
   to a field that is being typed in, not to anything persisted. */
let acctNameTimer = null;

/* What the open set editor is being measured against, worked out by
   renderSetForm and read back by updateSetPreview. Module-level and
   transient, like the chart's in-flight gesture state, rather than a field
   on ui.setForm, which is the form's own data and not a cache of the log. */
let setRefs = { vs: null, best: null, unit: null };

/* the single-set editor, same idea as the entry form, one level down */
function renderSetForm(form, unit) {
  const { s, isNew, index } = form;
  const k = ui.entryForm ? kindOf(ui.entryForm.f) : DEFAULT_KIND;
  const m = setScore(s, k);
  const ok = setHasData(s, k);
  /* two references, two different questions: the set that stood in this
     one's place last session, and the best this lift has ever been worth.
     Both are worked out ONCE, here, and parked in setRefs for the keystroke
     path to read: neither can move while the sheet is open (typing does not
     write to the log, and the one control that could change them, the unit
     select, does a full render), and each one otherwise costs a sort of the
     whole log on every character typed into the weight box. */
  const vsRef = ui.entryForm ? lastSetMetric(ui.entryForm.f, ui.entryForm.isDraft, index) : null;
  const bestRef = ui.entryForm ? bestEverMetric(ui.entryForm.f, ui.entryForm.isDraft) : null;
  setRefs = { vs: vsRef, best: bestRef, unit };
  /* One box or two, and never a box for a number this kind does not have.
     A hold asked for reps and a weight was the old model showing through. */
  const numField = (label, bind, val, first) =>
    field(labelWith(label), `<input class="pb-input" ${NUM} data-bind="${bind}" value="${esc(val)}" placeholder="—"${first ? " data-autofocus" : ""}>`);
  const inputs = k === "bodyweight" ? numField(T("setForm.reps"), "set.reps", s.reps, true)
    : k === "hold" ? numField(T("setForm.secs"), "set.secs", s.secs, true)
    : `<div style="display:flex;gap:10px">
        <div style="flex:1">${numField(T("setForm.reps"), "set.reps", s.reps, true)}</div>
        <div style="flex:1">${field(labelWith(T("setForm.weight"), unitSelect(unit)), `<input class="pb-input" ${NUM} data-bind="set.weight" value="${esc(s.weight)}" placeholder="—">`)}</div>
      </div>`;
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
  /* both of them minus whichever the open set already IS — or the single
     one, on a kind with only one way forward. Compared on the fields THIS
     kind has: bodyweight was matching on a weight neither side has, so the
     option it was already showing never went away. */
  const isOpenSet = (o) => k === "hold" ? +s.secs === o.secs
    : k === "bodyweight" ? +s.reps === o.reps
    : +s.reps === o.reps && +s.weight === o.weight;
  const opts = sug && !sug.done && (sug.kind === "step" || sug.kind === "bodyweight" || sug.kind === "hold")
    ? sug.options.filter((o) => !isOpenSet(o))
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
    ${inputs}
    ${target}
    ${field(T("entry.rpe"), `<input class="pb-input" ${NUM} data-bind="set.rpe" value="${esc(s.rpe)}" placeholder="—">`, T("setForm.rpeHint"))}

    <div class="pb-card2" style="padding:11px 14px;margin-bottom:14px">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <div class="pb-label">${metricLabel(k, unit)}</div>
          <div id="setMetric" class="pb-num" style="font-size:26px;font-weight:700;color:var(--gold);line-height:1.05">${m ?? "—"}</div>
        </div>
        ${bestRef ? `<div id="setBest" style="flex:0 0 auto;text-align:right;padding-left:12px;border-left:1px solid var(--border-soft)">${bestEverBlock(m, bestRef, unit)}</div>` : ""}
      </div>
      <div id="setVsLast" style="font-size:11.5px;line-height:1.45;margin-top:${vsRef ? 6 : 0}px">${vsLastLine(m, vsRef)}</div>
    </div>

    <button id="setSaveBtn" data-action="save-set" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:14px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">
      ${icon("check", 17)} ${isNew ? T("setForm.addBtn") : T("setForm.saveBtn")}
    </button>
    ${!isNew ? `<button data-action="delete-set" class="pb-btn" style="width:100%;padding:12px 0;margin-top:8px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} ${T("setForm.removeBtn")}
    </button>` : ""}
  `, 100);
}

/* live 1RM, its verdict against the set in the same place last session,
   how it stands against the all-time best, and save-button state while
   typing in the set editor. Patched in place rather than re-rendered, so
   the caret never moves out from under the finger typing into it.

   `#setBest` is absent on a first outing (there is no ceiling yet) and the
   node cannot appear without a render, which is right: a lift with no
   history does not grow one while you are typing into it. */
function updateSetPreview() {
  if (!ui.setForm) return;
  const s = ui.setForm.s;
  const f = ui.entryForm && ui.entryForm.f;
  const k = f ? kindOf(f) : DEFAULT_KIND;
  const m = setScore(s, k);
  const el = document.getElementById("setMetric");
  const vs = document.getElementById("setVsLast");
  const best = document.getElementById("setBest");
  const btn = document.getElementById("setSaveBtn");
  if (el) el.textContent = m ?? "—";
  if (vs) vs.innerHTML = vsLastLine(m, setRefs.vs);
  if (best) best.innerHTML = bestEverBlock(m, setRefs.best, setRefs.unit);
  if (btn) { const ok = setHasData(s, k); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
}

function updateEntryPreview() {
  if (!ui.entryForm) return;
  const { metric, lastMetric, bestMetric, valid } = entryComputed();
  const m = document.getElementById("entryMetric");
  const b = document.getElementById("entryBadge");
  const s = document.getElementById("entrySaveBtn");
  if (m) m.textContent = metric ?? "—";
  /* redrawn whole rather than nudged: the two bars hold still while you
     type, but which side of them you are on does not, and the colour is
     the answer this row exists to give */
  if (b) b.innerHTML = entryRefCols(metric, lastMetric, bestMetric);
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
  /* We got here, so the page was alive to do it: the server's copy has
     nothing left to say and is handed back before it can say it. This is
     what PUSH_GRACE_MS buys the time for. */
  cloudTimerCancel(t);
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

/* ── THE SAME COUNTDOWN, HELD BY THE SERVER ──────────────────────────
   Everything above this line runs in the page, and the page is the
   problem. startTimerEngine ticks every 250ms and fireTimer does the
   chime, the buzz and the notification, all of which need a living tab.
   Lock the phone mid-rest and that tab is throttled to a crawl and then
   discarded, and the alert that was the entire point of the timer never
   happens. Ninety seconds later you are still waiting for a chime from a
   process the OS killed.

   So every start also books the same deadline with the server, which
   pushes a notification when it comes round whether this app is alive or
   not. Two alarms for one rest, and three rules keep them from both
   going off in your ear.

   THE LOCAL ONE WINS WHEREVER IT CAN. The server's copy is booked
   PUSH_GRACE_MS late and fireTimer cancels it on the way past, so the
   push only ever speaks when the page was not there to. The gap is
   already in our favour — the server starts counting when the request
   lands and we started when we sent it, so its deadline trails ours by a
   round trip — but leaning on network latency for correctness is not a
   plan, and two deliberate seconds is nothing on a rest timer.

   IT IS A SECOND CHANCE, NEVER A PREREQUISITE. Nothing here is awaited
   and every failure is silent. A rest timer starts the instant it is
   tapped, in a basement gym with no signal, on a device that never
   enabled push at all. The local timer IS the timer; this is the copy
   that survives the screen going off.

   THE DEADLINE IS SENT AS A DURATION, never as a wall-clock moment. A
   real phone here was 2.8 seconds off the server. inMs makes the server
   resolve "90 seconds from now" against its own clock, so the phone's
   idea of the time never enters the arithmetic. See scheduleTimer in
   zenofit-cloud.js, which puts it on the wire as durationMs.          */

const PUSH_GRACE_MS = 2000;                  // the local chime goes first
const PUSH_MAX_MS = 24 * 60 * 60 * 1000;     // the API refuses more than a day

/* Book it. `secs` is the countdown the page just started, not the timer's
   full length, so a resume asks for what is actually left. */
async function cloudTimerStart(t, secs) {
  const C = window.ZenofitCloud;
  if (!C || typeof C.scheduleTimer !== "function") return;   // old cached shell, or file://
  const inMs = Math.round(secs * 1000) + PUSH_GRACE_MS;
  /* checked here rather than spending a request to be told no */
  if (!(inMs > 1000) || inMs > PUSH_MAX_MS) return;
  try {
    if (C.pushBlockedReason() || !(await C.pushEnabled())) return;
    /* what the run was when we asked, so we can tell whether it is still
       the same one when the round trip comes back */
    const run = t.endsAt;
    const name = timerLabel(t) || T("timers.listTitle");
    const res = await C.scheduleTimer({
      inMs, label: name, title: name,
      body: T("timers.notifBody", { time: fmtClock(t.duration) }),
    });
    if (!res || !res.timerId) return;
    /* A rest can be stopped inside a round trip, and a timer object can be
       replaced wholesale by timer-save while we wait. Re-read it from state
       and check it is still on the same run: if it is not, the alarm we
       just booked is orphaned and goes straight back. */
    const live = (state.timers || []).find((x) => x.id === t.id);
    if (!live || live.endsAt !== run) { try { C.cancelTimer(res.timerId); } catch { /* fire and forget */ } return; }
    live.cloudId = res.timerId;
    writeNow();
  } catch { /* the local timer is unaffected, and it is the one that matters */ }
}

/* Hand it back. Clears the handle synchronously so the caller's own
   writeNow persists that, and lets the request itself go unwatched. */
function cloudTimerCancel(t) {
  const id = t && t.cloudId;
  if (!id) return;
  t.cloudId = null;
  const C = window.ZenofitCloud;
  if (C && typeof C.cancelTimer === "function") { try { C.cancelTimer(id); } catch { /* fire and forget */ } }
}

function startTimer(t) {
  unlockAudio();          // both need the user gesture that got us here
  askNotifyPermission();
  const secs = t.remaining != null ? t.remaining : t.duration;
  cloudTimerCancel(t);    // a resume books a fresh deadline, never a second one
  t.endsAt = Date.now() + Math.max(1, secs) * 1000;
  t.remaining = null; t.doneAt = null;
  if (ui.timerToast && ui.timerToast.id === t.id) ui.timerToast = null;
  writeNow(); render();
  /* after the render, because the page must not wait on the network to
     show a countdown the user has already started */
  cloudTimerStart(t, Math.max(1, secs));
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
      ${/* Above the profiles, because the account is what they hang off:
            sign in and the ones you own are waiting on the other side. */
        (() => {
          const C = window.ZenofitCloud;
          const who = C && C.account ? C.account() : null;
          const name = who && who.username;
          return `<button data-action="open-account" class="pb-card" style="width:100%;display:flex;align-items:center;gap:11px;padding:12px 14px;margin-bottom:10px;text-align:left;color:var(--text)">
            ${icon(name ? "user-check" : "user", 18, `style="color:${name ? "var(--gold)" : "var(--faint)"};flex-shrink:0"`)}
            <span style="flex:1;min-width:0">
              <span class="pb-label" style="display:block;margin-bottom:2px">${T("acct.title")}</span>
              <span style="display:block;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${name ? "var(--text)" : "var(--faint)"}">${name ? esc(name) : T("acct.notSignedIn")}</span>
            </span>
            ${icon("chevron-right", 15, 'style="color:var(--faint);flex-shrink:0"')}
          </button>`;
        })()}
      ${(() => {
        const list = profileList(), i = list.findIndex((p) => p.id === activeProfileId());
        return `<button data-action="open-profiles" class="pb-card" style="width:100%;display:flex;align-items:center;gap:11px;padding:12px 14px;margin-bottom:16px;text-align:left;color:var(--text)">
          ${icon("users", 18, 'style="color:var(--gold);flex-shrink:0"')}
          <span style="flex:1;min-width:0">
            <span class="pb-label" style="display:block;margin-bottom:2px">${T("profiles.title")}</span>
            <span style="display:block;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(profileLabel(list[i], i))}</span>
          </span>
          <span style="font-size:11.5px;color:var(--faint);flex-shrink:0">${TN("profile", list.length)}</span>
          ${icon("chevron-right", 15, 'style="color:var(--faint);flex-shrink:0"')}
        </button>`;
      })()}
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

      <div class="pb-hairline" style="margin:18px 0"></div>
      ${sectionTitle(T("push.section"))}
      ${/* The diagnostic page is a separate document, so this is a link in
            button's clothing rather than another ui flag: see open-push-test
            for why it is a real navigation and not a new tab. */""}
      <button data-action="open-push-test" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:13.5px;margin-bottom:9px;justify-content:flex-start;padding-left:14px;gap:9px">
        ${icon("bell", 15)} ${T("push.diag")}
        <span style="flex:1"></span>
        ${icon("chevron-right", 15, 'style="color:var(--faint)"')}
      </button>
      <div style="font-size:11.5px;color:var(--faint);margin-bottom:16px;line-height:1.5">
        ${T("push.diagHint")}
      </div>

      <div class="pb-hairline" style="margin:18px 0"></div>
      ${sectionTitle(T("profile.data"))}
      ${/* Only where the OS will actually take the file, see shareFileType. It
            sits above the pair and full width because on a phone it is the one
            people want: the file goes where it is going, no trip to Downloads. */
        shareFileType() ? `<button data-action="share-data" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:13.5px;margin-bottom:8px">
          ${icon("share-2", 15)} ${T("profile.share")}
        </button>` : ""}
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

      ${/* Next to the backup buttons on purpose: this is the screen you want
            on the day the app comes up empty, and the day the app comes up
            empty is the day nobody can remember where anything is. */""}
      <button data-action="open-storage" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:13.5px;margin-bottom:9px;justify-content:flex-start;padding-left:14px;gap:9px">
        ${icon("database", 15)} ${T("stor.title")}
        <span style="flex:1"></span>
        ${icon("chevron-right", 15, 'style="color:var(--faint)"')}
      </button>
      <div style="font-size:11.5px;color:var(--faint);margin-bottom:16px;line-height:1.5">
        ${T("stor.entryHint")}
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

/* ── WHICH TRAINING IS ON SCREEN ─────────────────────────────────────
   A profile is a whole separate app: its own log, library, groups, presets,
   timers, goals, body check-ins, plans and settings. Nothing is shared, on
   purpose — the point is to try a different block, or log for somebody
   without their phone, and be certain none of it can touch what you have.

   The list is deliberately blunt about which one you are in: the active row
   is filled gold and cannot be tapped to switch (you are already there),
   and every other row is one tap away. Reordering is a mode for the same
   reason it is everywhere else in this app: a row is what you tap to
   SWITCH, and a grip handle living on one is a mis-tap into somebody else's
   training. */
function renderProfilesWindow() {
  const list = profileList();
  const stats = ui.profileStats || {};
  const active = activeProfileId();

  const rows = ui.profileOrder && list.length > 1
    ? list.map((p, i) => reorderRow("profile", i, list.length,
        esc(profileLabel(p, i)),
        p.id === active ? T("profiles.current") : "")).join("")
    : list.map((p, i) => {
      const on = p.id === active;
      const st = stats[p.id] || { days: 0, entries: 0 };
      return `<div style="display:flex;align-items:center;border-bottom:${i < list.length - 1 ? "1px solid var(--border-soft)" : "none"};background:${on ? "rgba(233,185,73,.06)" : "transparent"}">
        <button ${on ? "" : `data-action="profile-switch" data-id="${esc(p.id)}"`} style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:13px 4px 13px 14px;text-align:left;color:var(--text)">
          <span style="width:9px;height:9px;border-radius:5px;flex-shrink:0;background:${on ? "var(--gold)" : "var(--border)"}"></span>
          <span style="flex:1;min-width:0">
            <span style="display:block;font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(profileLabel(p, i))}</span>
            <span style="display:block;font-size:11.5px;color:var(--faint)">${on ? T("profiles.current") + " · " : ""}${TN("day", st.days)} · ${TN("logEntry", st.entries)}</span>
          </span>
        </button>
        <button data-action="profile-menu" data-id="${esc(p.id)}" title="${T("common.edit")}" style="flex-shrink:0;padding:13px 14px;color:var(--faint);align-self:stretch">${icon("pencil", 16)}</button>
      </div>`;
    }).join("");

  return fullScreen(88, `
    <div style="display:flex;align-items:center;gap:10px;padding:var(--pb-header-pt) 16px 10px;border-bottom:1px solid var(--border-soft)">
      <button data-action="close-profiles" style="color:var(--muted);padding:4px">${icon("arrow-left", 21)}</button>
      <div class="pb-num" style="font-size:19px;font-weight:700;flex:1">${T("profiles.title")}</div>
      ${orderToggle("profiles-reorder", ui.profileOrder, list.length > 1)}
    </div>
    <div class="pb-scroll" data-scrollkey="profilesWin" style="flex:1;overflow-y:auto;padding:16px 16px calc(40px + var(--pb-sab))">
      <div class="pb-card" style="overflow:hidden;margin-bottom:12px">${rows}</div>
      <button data-action="profile-add" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;font-size:13.5px;color:var(--gold);border-color:rgba(233,185,73,.4)">
        ${icon("plus", 15)} ${T("profiles.add")}
      </button>
      ${/* Joining is next to adding because it IS adding: what arrives is a
            new profile of its own, never a merge into one already here. */""}
      <button data-action="open-join" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;margin-top:8px;font-size:13.5px">
        ${icon("cloud-download", 15)} ${T("sync.joinBtn")}
      </button>
      ${/* Whose list this is, said where the list is. Signed in, it is the
            account's and the same everywhere; signed out, it is this
            phone's and the line is simply absent rather than claiming
            anything. */""}
      ${accountOn() ? `<div style="display:flex;align-items:center;gap:7px;margin-top:14px;font-size:11.5px;color:var(--steel);line-height:1.4">
        ${icon("cloud", 13, 'style="flex-shrink:0"')}<span>${T("profiles.account")}</span>
      </div>` : ""}
      <div style="font-size:11.5px;color:var(--faint);line-height:1.55;margin-top:14px">${T("profiles.hint")}</div>
    </div>
  `, "profilesWin");
}

/* Add, rename and copy are the same one field, so they are the same sheet;
   `mode` only decides the title and what the button does with the name. */
function renderProfileForm() {
  const f = ui.profileForm;
  const ok = f.mode !== "rename" || !!(f.name || "").trim();
  return sheet(T("profiles." + f.mode + "Title"), "profileForm", `
    ${field(T("profiles.name"), `<input class="pb-input" data-bind="profileName" value="${esc(f.name)}" placeholder="${esc(T("profiles.namePlaceholder"))}" data-autofocus>`,
      T("profiles.nameHint"))}
    <button data-action="profile-form-save" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">
      ${icon("check", 16)} ${T(f.mode === "rename" ? "common.saveChanges" : "profiles." + f.mode + "Btn")}
    </button>
    ${f.mode === "rename" ? `<button data-action="open-sync" data-id="${esc(f.id)}" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;margin-top:8px;font-size:13.5px;justify-content:flex-start;padding-left:14px;gap:9px">
      ${icon(syncLinked(f.id) ? "cloud" : "cloud-off", 15, `style="color:${syncLinked(f.id) ? "var(--gold)" : "var(--faint)"}"`)} ${T("sync.entry")}
      <span style="flex:1"></span>
      <span style="font-size:11.5px;color:var(--faint)">${T(syncLinked(f.id) ? (syncLinked(f.id).level === "read" ? "sync.stateRead" : "sync.stateOn") : "sync.stateOff")}</span>
      ${icon("chevron-right", 15, 'style="color:var(--faint)"')}
    </button>
    <button data-action="profile-duplicate" data-id="${esc(f.id)}" class="pb-btn pb-ghost" style="width:100%;padding:12px 0;margin-top:8px;font-size:13.5px">
      ${icon("copy", 15)} ${T("profiles.copyBtn")}
    </button>
    ${profileList().length > 1 ? `<button data-action="profile-delete" data-id="${esc(f.id)}" class="pb-btn" style="width:100%;padding:12px 0;margin-top:8px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
      ${icon("trash-2", 15)} ${T("profiles.deleteBtn")}
    </button>` : `<div style="font-size:11.5px;color:var(--faint);margin-top:10px;line-height:1.5">${T("profiles.lastOne")}</div>`}` : ""}
  `, 118);
}

/* ── SHARING A PROFILE, AND JOINING ONE ──────────────────────────────
   Two sheets and one rule: nothing here is on until it is switched on,
   and the screen says what leaving the phone means before it leaves.

   The code itself is the whole handover. It is shown once, large, in a
   font where 0 and O cannot be confused, with a Copy button, because the
   realistic way it travels is a message to the person standing next to
   you. Rotating mints a new one and retires the old WITHOUT evicting
   anybody already in, which is the difference between "I lost the paper"
   and "I want her out", and those are two different buttons. */
function renderSyncSheet() {
  const f = ui.syncSheet;
  const list = profileList();
  const i = list.findIndex((p) => p.id === f.localId);
  const rec = syncFor(f.localId);
  const on = !!(rec && rec.remoteId);
  const mine = !rec || rec.level !== "read";
  const cloud = window.ZenofitCloud;

  const when = (t) => (t ? T("sync.lastAt", { when: fmtDate(new Date(t).toISOString().slice(0, 10)) }) : T("sync.never"));

  const status = on
    ? `<div class="pb-card2" style="padding:12px 14px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:9px">
          <span style="width:9px;height:9px;border-radius:5px;background:${ui.syncError ? "var(--red)" : "var(--green)"};flex-shrink:0"></span>
          <span style="flex:1;font-weight:600;font-size:14px">${T(mine ? "sync.onTitle" : "sync.readTitle")}</span>
          ${ui.syncBusy ? `<span style="font-size:11.5px;color:var(--faint)">${T("sync.working")}</span>` : ""}
        </div>
        <div style="font-size:11.5px;color:${ui.syncError ? "var(--red)" : "var(--faint)"};margin-top:5px;line-height:1.5">
          ${ui.syncError ? T("sync.failed", { why: esc(String(ui.syncError)) }) : when(rec.lastOkAt || rec.lastPulledAt || rec.lastPushedAt)}
        </div>
        ${/* ── THE TWO THINGS THAT DO NOT GO UP WHOLE ──────────────────
              Both named rather than silently dropped, and kept apart
              because one is a shrug and the other is a job.

              A PHOTO LEFT BEHIND costs nothing but the picture: the lift,
              its cues, its history and everything else about the profile
              are up there, and the row on the other phone says a photo
              exists. Nothing is broken and there is nothing to do.

              A ROW LEFT BEHIND is a row the other phone does not have,
              which is worth looking at. Since the photos are handled
              above, what lands here now is rare and genuinely odd. */
          (rec.heldPhotos || []).length ? `<div style="font-size:11.5px;color:var(--steel);margin-top:6px;line-height:1.5">
            ${icon("image-off", 12)} ${T("sync.photosHeld", { n: TN("syncPhoto", rec.heldPhotos.length) })} · ${T("sync.photosHeldHint")}
          </div>` : ""}
        ${(rec.tooBig || []).length ? `<div style="font-size:11.5px;color:var(--steel);margin-top:6px;line-height:1.5">
            ${icon("alert-triangle", 12)} ${T("sync.tooBig", { n: TN("syncRow", rec.tooBig.length) })} · ${T("sync.tooBigHint")}
          </div>` : ""}
      </div>`
    : `<div style="font-size:12.5px;color:var(--faint);line-height:1.6;margin-bottom:14px">${T("sync.offBody")}</div>`;

  /* the code, only ever drawn when there is one to draw: a box that says
     "your code will appear here" is a box that looks broken */
  const code = f.code
    ? `<div class="pb-card2" style="padding:14px;margin-bottom:10px;text-align:center">
        <div class="pb-label" style="margin-bottom:6px">${T("sync.codeLabel", { level: T(f.codeLevel === "write" ? "sync.levelWrite" : "sync.levelRead") })}</div>
        <div class="pb-num" style="font-size:25px;font-weight:700;letter-spacing:.12em;color:var(--gold);word-break:break-all;line-height:1.25">${esc(f.code)}</div>
        <button data-action="sync-copy-code" class="pb-btn pb-ghost" style="width:100%;padding:10px 0;margin-top:11px;font-size:13px">
          ${icon(f.copied ? "check" : "copy", 14)} ${T(f.copied ? "sync.copied" : "sync.copy")}
        </button>
        <div style="font-size:11px;color:var(--faint);margin-top:9px;line-height:1.5">${T("sync.codeHint")}</div>
      </div>`
    : "";

  /* Each person carries what they can do and a way to change it. The level
     is the thing that actually decides whether their phone can write into
     this log, and until it was on this row the only way to take write back
     was to throw somebody out and re-invite them. */
  const grants = (f.grants || []).length
    ? `<div class="pb-card" style="overflow:hidden;margin-bottom:10px">${f.grants.map((g, n) => {
        const w = g.level === "write";
        const name = g.displayName || T("sync.someone");
        return `<div style="padding:11px 12px;border-bottom:${n < f.grants.length - 1 ? "1px solid var(--border-soft)" : "none"}">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="flex:1;min-width:0">
              <span style="display:block;font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span>
              <span style="display:block;font-size:11px;color:${w ? "var(--gold)" : "var(--faint)"}">${T(w ? "sync.levelWrite" : "sync.levelRead")}</span>
            </span>
            <button data-action="sync-revoke" data-g="${esc(g.userId)}" class="pb-btn" style="flex-shrink:0;padding:7px 12px;font-size:12px;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">${T("sync.revoke")}</button>
          </div>
          <button data-action="sync-set-level" data-g="${esc(g.userId)}" data-name="${esc(name)}" data-level="${w ? "read" : "write"}" ${ui.syncBusy ? "disabled" : ""} class="pb-btn pb-ghost" style="width:100%;padding:8px 0;margin-top:9px;font-size:12px;opacity:${ui.syncBusy ? 0.45 : 1}">
            ${icon(w ? "eye" : "pencil", 13)} ${T(w ? "sync.makeThemRead" : "sync.makeThemWrite")}
          </button>
        </div>`;
      }).join("")}</div>`
    : `<div style="font-size:11.5px;color:var(--faint);margin-bottom:10px;line-height:1.5">${T("sync.nobody")}</div>`;

  const body = !cloud
    ? `<div style="font-size:12.5px;color:var(--faint);line-height:1.6">${T("sync.noClient")}</div>`
    : !on
    ? `${status}
       <button data-action="sync-enable" ${ui.syncBusy ? "disabled" : ""} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${ui.syncBusy ? 0.45 : 1}">
         ${icon("cloud-upload", 16)} ${T("sync.turnOn")}
       </button>`
    : `${status}
       <button data-action="sync-now" ${ui.syncBusy ? "disabled" : ""} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;margin-bottom:16px;opacity:${ui.syncBusy ? 0.45 : 1}">
         ${icon("refresh-cw", 16)} ${T("sync.syncNow")}
       </button>
       ${mine ? `
         <div class="pb-hairline" style="margin:4px 0 16px"></div>
         ${sectionTitle(T("sync.shareTitle"))}
         ${code}
         <div style="display:flex;gap:8px;margin-bottom:10px">
           <button data-action="sync-make-code" data-level="read" class="pb-btn pb-ghost" style="flex:1;padding:11px 0;font-size:13px">${icon("eye", 14)} ${T("sync.makeRead")}</button>
           <button data-action="sync-make-code" data-level="write" class="pb-btn pb-ghost" style="flex:1;padding:11px 0;font-size:13px">${icon("pencil", 14)} ${T("sync.makeWrite")}</button>
         </div>
         <div style="font-size:11.5px;color:var(--faint);margin-bottom:16px;line-height:1.55">${T("sync.makeHint")}</div>
         ${sectionTitle(T("sync.peopleTitle"))}
         ${grants}
       ` : `<div style="font-size:12.5px;color:var(--faint);line-height:1.6;margin-bottom:16px">${T("sync.readBody")}</div>`}
       <div class="pb-hairline" style="margin:16px 0"></div>
       <button data-action="sync-disable" class="pb-btn" style="width:100%;padding:12px 0;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
         ${icon("cloud-off", 15)} ${T(mine ? "sync.turnOff" : "sync.leave")}
       </button>
       <div style="font-size:11.5px;color:var(--faint);margin-top:10px;line-height:1.55">${T(mine ? "sync.turnOffHint" : "sync.leaveHint")}</div>`;

  return sheet(T("sync.title", { name: esc(profileLabel(list[i], i)) }), "syncSheet", body, 122);
}

/* ── THE ACCOUNT, AND THE PROFILES UNDER IT ──────────────────────────
   One sheet doing two jobs, because signing in and signing up are the
   same two fields and making somebody choose a tab first is a decision
   about our database, not about them. The button says which it will be,
   and it says so from what the name currently is: a name nobody has taken
   offers to make it, a name that exists offers to sign in to it.

   Signing in does NOT drag anybody's training onto this phone. It tells
   you what is up there and lets you pick, one profile at a time, because
   a phone that suddenly holds four people's logs because somebody logged
   in is a phone nobody asked for. */
/* The two things under the name field that change while it is being typed
   in. Both are read by the renderer AND by updateAccountPreview, which is
   the whole point: one answer, drawn twice, so a keystroke can repaint them
   without repainting the field the keystroke landed in. */
const ACCT_NAME_RE = /^[a-z0-9][a-z0-9._-]{2,23}$/;

function acctNameHint(f) {
  const name = (f.username || "").trim();
  if (name && !ACCT_NAME_RE.test(name)) return T("acct.nameRules");
  if (f.free === false) return T("acct.nameTaken");
  if (f.free === true) return T("acct.nameFree");
  return T("acct.nameHint");
}

function acctButtonKey(f) {
  if (f.busy) return "acct.working";
  return f.free === true ? "acct.createBtn" : f.free === false ? "acct.signInBtn" : "acct.continueBtn";
}

/* Typing must never reach render(). It rebuilds #app wholesale, which
   throws away the input the caret is sitting in: the field came back
   empty-ish and the cursor jumped to position 0, so "wo" then "rds" typed
   itself backwards as "rdswo". Same rule as the strength-standards hints,
   and the same reason. */
function updateAccountPreview() {
  const f = ui.accountSheet;
  if (!f) return;
  const hint = document.getElementById("acctNameHint");
  const label = document.getElementById("acctGoLabel");
  const btn = document.getElementById("acctGoBtn");
  if (hint) hint.textContent = acctNameHint(f);
  if (label) label.textContent = T(acctButtonKey(f));
  if (btn) {
    const ok = ACCT_NAME_RE.test((f.username || "").trim()) && (f.password || "").length >= 8 && !f.busy;
    btn.disabled = !ok;
    btn.style.opacity = ok ? 1 : 0.45;
  }
}

function renderAccountSheet() {
  const f = ui.accountSheet;
  const C = window.ZenofitCloud;
  const acct = C && C.account ? C.account() : null;
  const me = acct && acct.username;

  if (!C) {
    return sheet(T("acct.title"), "accountSheet",
      `<div style="font-size:12.5px;color:var(--faint);line-height:1.6">${T("sync.noClient")}</div>`, 124);
  }

  /* ── signed in: who you are, and what is waiting ──
     ONE LIST, AND IT IS THE SAME LIST THE PROFILES SCREEN SHOWS. This used
     to draw only what the server handed back, so a profile made on this
     phone and never synced was simply absent — and since the heading says
     "Your profiles" and the screen two taps away says four of them, the
     obvious reading was that the list had failed to refresh. It had not:
     it was answering a different question, and never said which.

     So every profile on this phone appears, in the order the Profiles
     screen has them, each one saying where it actually is — in the
     account, or only here — and a profile that is only here gets the one
     button that changes that. Below them go the profiles in the account
     that this phone does NOT hold, which is the other half of what an
     account is for. Nothing is hidden and nothing has to be guessed at. */
  if (me) {
    const cloud = f.cloud || [];
    const byRemote = new Map(cloud.map((p) => [p.profileId, p]));
    const locals = profileList();
    const linked = new Set(locals.map((lp) => (syncFor(lp.id) || {}).remoteId).filter(Boolean));
    /* A profile this device has promised to remove is not "in the account
       and missing here" — it is on its way out. Offering Get it for it is
       how a delete reads as having done nothing. */
    const cloudOnly = cloud.filter((p) => !linked.has(p.profileId) && !pendingFor(p.profileId));
    const n = locals.length + cloudOnly.length;
    let at = 0;
    const edge = () => (++at < n ? "1px solid var(--border-soft)" : "none");

    const row = (name, sub, subInk, right) =>
      `<div style="display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:${edge()}">
        <span style="flex:1;min-width:0">
          <span style="display:block;font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span>
          <span style="display:block;font-size:11px;color:${subInk}">${sub}</span>
        </span>
        ${right}
      </div>`;

    const here = `<span style="flex-shrink:0;font-size:11.5px;color:var(--green);font-weight:600">${T("acct.onThisPhone")}</span>`;

    const localRows = locals.map((lp, i) => {
      const rec = syncFor(lp.id) || {};
      const up = rec.remoteId ? byRemote.get(rec.remoteId) : null;
      /* Not linked at all: it exists on this phone and nowhere else, which
         is the app's default and not a fault — every profile starts this
         way and stays that way until somebody says otherwise. */
      if (!rec.remoteId) {
        return row(profileLabel(lp, i), T("acct.localOnly"), "var(--faint)",
          `<button data-action="acct-backup" data-id="${esc(lp.id)}" ${ui.syncBusy ? "disabled" : ""} class="pb-btn pb-ghost" style="flex-shrink:0;padding:7px 12px;font-size:12px;color:var(--gold);border-color:rgba(233,185,73,.4);opacity:${ui.syncBusy ? 0.45 : 1}">${icon("cloud-upload", 13)} ${T("acct.backUp")}</button>`);
      }
      /* Linked, and the listing has loaded, and it is not in it: this phone
         is signed in somewhere else than the account that profile was
         synced under, or the grant has been taken back. Worth saying, since
         it is the one case where a profile here is quietly not syncing. */
      if (!up && f.loaded) {
        return row(profileLabel(lp, i), T("acct.notInAccount"), "var(--steel)", "");
      }
      /* the server's answer where there is one, since a grant can change
         under this phone; the stored level is only the stand-in until the
         listing lands */
      const owned = up ? up.isOwner : rec.level === "owner";
      const lvl = rec.level === "read" ? "sync.levelRead" : owned ? "acct.owned" : "sync.levelWrite";
      return row(profileLabel(lp, i), T(lvl), "var(--faint)", here);
    }).join("");

    /* In the account, not on this phone. The name is the server's here,
       because there is no local one to prefer. */
    const cloudRows = cloudOnly.map((p) =>
      row(p.name || T("sync.joinedName"),
        T(p.isOwner ? "acct.owned" : p.level === "read" ? "sync.levelRead" : "sync.levelWrite"), "var(--faint)",
        `<button data-action="acct-pull" data-p="${esc(p.profileId)}" data-n="${esc(p.name || "")}" data-lv="${esc(p.level || "write")}" data-own="${p.isOwner ? "1" : "0"}" class="pb-btn pb-ghost" style="flex-shrink:0;padding:7px 12px;font-size:12px;color:var(--gold);border-color:rgba(233,185,73,.4)">${icon("cloud-download", 13)} ${T("acct.getIt")}</button>`)
    ).join("");

    return sheet(T("acct.title"), "accountSheet", `
      <div class="pb-card2" style="padding:12px 14px;margin-bottom:16px">
        <div class="pb-label">${T("acct.signedInAs")}</div>
        <div class="pb-num" style="font-size:19px;font-weight:700;color:var(--gold);line-height:1.2;word-break:break-all">${esc(me)}</div>
      </div>
      ${sectionTitle(T("acct.yourProfiles"), f.loading ? `<span style="font-size:11px;color:var(--faint)">${T("sync.working")}</span>` : "")}
      <div class="pb-card" style="overflow:hidden;margin-bottom:10px">${localRows}${cloudRows}</div>
      ${f.error ? `<div style="font-size:12.5px;color:var(--red);margin-bottom:10px;line-height:1.5">${esc(f.error)}</div>` : ""}
      ${/* The roster keeps this list in step by itself, so the ordinary
            case has nothing to explain except what that means. The other
            two lines are for the two states it cannot reach on its own: a
            profile somebody has to fetch by hand, and one whose sync was
            deliberately turned off. */""}
      <div style="font-size:11.5px;color:var(--faint);margin-bottom:16px;line-height:1.55">${
        cloudOnly.length ? T("acct.pullHint")
        : locals.some((lp) => !(syncFor(lp.id) || {}).remoteId) ? T("acct.backUpHint")
        : T("acct.rosterHint")}</div>
      <div class="pb-hairline" style="margin:16px 0"></div>
      <button data-action="acct-signout" class="pb-btn" style="width:100%;padding:12px 0;background:rgba(208,90,80,.1);color:var(--red);border:1px solid rgba(208,90,80,.3)">
        ${icon("log-out", 15)} ${T("acct.signOut")}
      </button>
      <div style="font-size:11.5px;color:var(--faint);margin-top:10px;line-height:1.55">${T("acct.signOutHint")}</div>
    `, 124);
  }

  /* ── signed out: name, password, one button ── */
  const name = (f.username || "").trim();
  const pw = f.password || "";
  const nameOk = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,23}$/.test(name);
  const ok = nameOk && pw.length >= 8 && !f.busy;
  /* `free` is null until the server has answered, so the button does not
     flicker between "sign in" and "create" while somebody is still typing */
  const free = f.free;
  const label = acctButtonKey(f);

  return sheet(T("acct.title"), "accountSheet", `
    <div style="font-size:12.5px;color:var(--faint);line-height:1.6;margin-bottom:10px">${T("acct.intro")}</div>
    ${/* Said before the password field, not after the fact: signing in is
          what puts this phone's profiles into the account. */""}
    <div style="font-size:12.5px;color:var(--steel);line-height:1.6;margin-bottom:16px">${T("acct.signInAdds")}</div>
    ${/* the hint carries an id because it is rewritten WHILE you type, in
          place, the way the strength-standards hints are: a render here
          rebuilds the input and the caret goes back to the start, which is
          exactly the bug this field shipped with. */
      field(T("acct.username"),
      `<input class="pb-input" data-bind="acctName" value="${esc(f.username)}" placeholder="${esc(T("acct.usernamePh"))}" autocapitalize="none" autocorrect="off" autocomplete="username" spellcheck="false" maxlength="24" data-autofocus>`,
      `<span id="acctNameHint">${acctNameHint(f)}</span>`)}
    ${field(T("acct.password"),
      `<input class="pb-input" type="password" data-bind="acctPass" value="${esc(pw)}" autocapitalize="none" autocorrect="off" autocomplete="current-password" spellcheck="false">`,
      T("acct.passwordHint"))}
    ${f.error ? `<div style="font-size:12.5px;color:var(--red);margin:-4px 0 12px;line-height:1.5">${esc(f.error)}</div>` : ""}
    <button id="acctGoBtn" data-action="acct-go" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">
      ${icon("log-in", 16)} <span id="acctGoLabel">${T(label)}</span>
    </button>
    <div style="font-size:11.5px;color:var(--faint);margin-top:12px;line-height:1.55">${T("acct.warning")}</div>
  `, 124);
}

/* The other end of the same code. A joined profile is a NEW local profile,
   never a merge into one you already have: her training arriving on top of
   yours, silently interleaved, is the one outcome nobody could undo. */
function renderJoinSheet() {
  const f = ui.joinSheet;
  /* a seed is exactly ten characters, so anything shorter is half-typed
     rather than wrong, and the button simply waits rather than scolding */
  const ok = (f.code || "").replace(/-/g, "").length === 10 && !f.busy;
  return sheet(T("sync.joinTitle"), "joinSheet", `
    ${field(T("sync.joinLabel"),
      `<input class="pb-input pb-num" data-bind="joinCode" value="${esc(f.code)}" placeholder="XXXX-XXXX-XX" maxlength="12" inputmode="text" autocapitalize="characters" autocorrect="off" autocomplete="off" spellcheck="false" style="letter-spacing:.14em;font-weight:700;text-transform:uppercase" data-autofocus>`,
      T("sync.joinHint"))}
    ${f.error ? `<div style="font-size:12.5px;color:var(--red);margin:-4px 0 12px;line-height:1.5">${esc(f.error)}</div>` : ""}
    <button data-action="join-go" ${ok ? "" : "disabled"} class="pb-btn pb-gold" style="width:100%;padding:13px 0;font-size:15px;opacity:${ok ? 1 : 0.45}">
      ${icon("cloud-download", 16)} ${T(f.busy ? "sync.joining" : "sync.joinBtn")}
    </button>
    <div style="font-size:11.5px;color:var(--faint);margin-top:12px;line-height:1.55">${T("sync.joinBody")}</div>
  `, 122);
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
/* A planned target is written in the shape the lift had when it was
   planned. If the lift has been re-declared since, those numbers cannot be
   answered: reps-and-weight ghost rows on a lift that now asks for seconds
   are a form nobody can fill in. The LIFT survives (it was still the plan)
   and the target is dropped, which reads as "planned, numbers on the day". */
const planTargetUsable = (pe, kind) => {
  const t = planTargetOf(pe);
  if (!t) return null;
  return (KIND[t.kind] ? t.kind : DEFAULT_KIND) === kind ? t : null;
};

function planEntryToDraftEntry(pe, planId, ix) {
  /* the lift is logged the way it is logged TODAY, exactly as it would be
     if you had added it by hand, and its target only rides along while it
     still fits that shape (planTargetUsable) */
  const kind = readKind(pe.exercise) || kindOf(pe);
  const e = newEntry(pe.exercise, pe.muscle, kind);
  e.unit = pe.unit || state.settings.units;
  if (pe.notes) e.notes = pe.notes;
  const t = planTargetUsable(pe, kind);
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

/* ── A SAVED DAY KEEPS WHAT YOU DIDN'T LOG ────────────────────────────
   Saving used to settle the question for a blank entry: the filled-in ones
   became log rows and everything still empty was dropped on the floor. That
   read one gesture as two different decisions and only the app knew which.
   Saving part-way through is normal (wo.draftNote says so, and prunePlans
   exists because of it), and *forgetting to write a lift down* is not the
   same as *deciding not to do it* — yet dropping the row made them
   identical, and the one you actually did was the one you lost.

   So blanks are KEPT, in state.unlogged, one row per date. It is not the
   log and it is not history: nothing in here is a set, nothing is counted
   toward volume, PRs, weeks or a chart, and nothing of it is drawn in the
   Log tab. That is the same promise state.plans and state.dayDrafts make,
   for the same reason. Reopening the day (edit-day) hydrates them straight
   back into the sheet, still blank, ready to be filled in.

   THROWING ONE AWAY IS NOW A DELIBERATE ACT, and it has to be, because the
   save no longer decides it for you: scrap-draft-entry, the bin on a
   waiting card. Taking a lift out of the sheet is the decision not to have
   done it — exactly what it already means for a lift that came from a
   plan — and the next save writes the shorter list.

   Plan-linked blanks are deliberately NOT in here. prunePlans already
   leaves those on the plan and edit-day hydrates them from there, so
   storing them twice would deal the same lift into the sheet twice.

   NEITHER IS A LIFT THE DAY ALREADY HAS A ROW FOR. "Waiting" means still
   outstanding, and a blank Hack Squat beside the Hack Squat you logged is
   not outstanding, it is the same lift twice: edit-day deals the logged row
   into the sheet anyway, so the waiting twin can only ever arrive as a
   duplicate card under a lift the day says you did. Deleting the twin and
   backing out without saving used to leave it exactly where it was — right,
   as a rule about unsaved edits, and wrong here, because there was nothing
   left for it to be waiting on. So the rule is not about who pressed save:
   stillOutstanding drops it on the way OUT of the store as well as on the
   way in, which is what makes a day saved before any of this open clean. */
const stillOutstanding = (entries, logged) =>
  logged.size ? entries.filter((e) => !logged.has(e.exercise)) : entries;

/* every lift the day has a row for, filled in or not: a not-done row is
   still a row in the sheet, and a second blank beside it is still a
   duplicate. See entryOnRecord for why the log holds rows with no
   numbers on them. */
const loggedNamesOn = (date) =>
  new Set(state.log.filter((e) => e.date === date).map((e) => e.exercise));

const unloggedOn = (date) =>
  stillOutstanding(
    ((state.unlogged || []).find((u) => u.date === date) || {}).entries || [],
    loggedNamesOn(date));

/* The whole list with one date's waiting lifts replaced, or that date dropped
   out of it entirely when nothing is left waiting. `alsoDrop` is the date a
   day has just been MOVED off: its rows have to go with it, or they are left
   under a date with no day to reopen them from. */
const unloggedWith = (date, entries, alsoDrop = null) => {
  const rest = (state.unlogged || []).filter((u) => u.date !== date && u.date !== alsoDrop);
  return entries.length ? [...rest, { date, entries: clone(entries), savedAt: Date.now() }] : rest;
};

function commitWorkout(draft) {
  if (draft && draft.planning) return commitPlan(draft);
  /* Only real, filled-in entries get LOGGED. A blank never becomes a row, so
     it can never turn up in the history, the volume or a PR — and it is not
     thrown away for it either: see the unlogged block above. */
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
  /* What was never filled in waits on the day instead of being dropped. The
     plan-linked ones are already riding on the plan, so only the rest come
     here, and they come without a link to a plan that is not carrying them. */
  const waiting = draft.entries
    .filter((e) => !entryHasData(e) && !(e.planFrom != null && planIds.includes(e.planFrom)))
    .map(stripPlanLink);
  /* A sheet saved onto a date that ALREADY had lifts waiting keeps them: it
     was never handed them, so it cannot be the thing that decides they are
     gone. An EDITING sheet is the opposite — edit-day dealt them into it on
     the way in, so what it holds now is the whole answer, scraps included. */
  const already = draft.editing ? [] : unloggedOn(draft.date);
  const named = new Set(waiting.map((e) => e.exercise));
  /* …and nothing waits on a lift this save is putting ON the day. The rows
     about to be written are not in state.log yet, so unloggedOn cannot see
     them and the same rule is applied here against the sheet's own answer. */
  const stillWaiting = stillOutstanding(
    [...waiting, ...already.filter((e) => !named.has(e.exercise))],
    new Set(filled.map((e) => e.exercise)));
  /* …unless the day has just been emptied out, which is its owner saying it
     did not happen after all: with no row left in the log there is no day to
     reopen, and so nothing for these to be waiting on. */
  const moved = draft.editing && draft.originalDate && draft.originalDate !== draft.date
    ? draft.originalDate : null;
  const unlogged = unloggedWith(draft.date, filled.length ? stillWaiting : [], moved);
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
    patch({ log: [...kept, ...stamped], plans, unlogged });
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
    unlogged,
  });
}

/* ── RENAMING AN EXERCISE IS A CASCADE, IN ONE PLACE ──────────────────
   The stored name IS the identity: the log, the plans, the parked days,
   the lifts waiting on a saved day, the presets and the goals all point at
   a lift by name, as do the sheet and the entry form that may be open
   right now. Writing a new name into the library alone leaves every one of
   them aimed at a lift that no longer exists — the session still renders
   in the day, and opening it finds nothing to edit.

   So the sweep lives here and nowhere else, and anything added later that
   stores an exercise name is added HERE rather than at each call site.
   It folds into a patch object instead of committing, because re-parenting
   a family renames several rows in one go and each has to read what the
   one before it left behind. */
function renameExerciseIn(p, from, to) {
  if (!from || !to || from === to) return p;
  const swap = (e) => (e.exercise === from ? { ...e, exercise: to } : e);
  p.log = (p.log || state.log).map(swap);
  p.plans = (p.plans || state.plans || []).map((pl) => ({ ...pl, entries: (pl.entries || []).map(swap) }));
  p.dayDrafts = (p.dayDrafts || state.dayDrafts || []).map((d) => ({ ...d, entries: (d.entries || []).map(swap) }));
  p.unlogged = (p.unlogged || state.unlogged || []).map((u) => ({ ...u, entries: (u.entries || []).map(swap) }));
  p.presets = (p.presets || state.presets || []).map((pr) => ({ ...pr, exercises: (pr.exercises || []).map(swap) }));
  const goals = p.goals || state.goals;
  if (goals && goals[from] != null) {
    const g = { ...goals };
    g[to] = g[from]; delete g[from];
    p.goals = g;
  }
  /* whatever is open right now points at it too, and an unsaved day is
     not on record yet for the sweep above to have reached */
  if (ui.workoutSheet) ui.workoutSheet.entries = (ui.workoutSheet.entries || []).map(swap);
  if (ui.entryForm) ui.entryForm.f = swap(ui.entryForm.f);
  if (ui.progressSelected === from) ui.progressSelected = to;
  return p;
}

/* ── FILING A LIFT UNDER ANOTHER ONE, AFTER THE FACT ──────────────────
   See the VARIATIONS block at the top of the file for why the base of a
   family is an accident of what was logged first, and shortUnder for where
   the short name comes from.

   Two things travel with the move and neither is optional. The row's own
   VARIATIONS come with it, re-attached to the new base beside it, since a
   family is one level deep and leaving them pointing at a row that is now
   itself a variation would build the tree of grips nobody wants. And every
   moved row's STORED NAME is recomposed from the new parent's, which is a
   rename and goes through the cascade above — except where that name is
   already taken, where the row keeps the one it has: a unique name it
   already answers to is worth more than a tidy one, and two rows under a
   single name is the desync the clash check exists to prevent.

   Passing a null parent is the other direction: the row stops being a
   variation and goes back to being a lift of its own, under the name it is
   already wearing, which is exactly what deleting a parent has always done
   to the variations it leaves behind.

   It hands back a patch rather than committing one, because patch() renders
   and the window this is called from is looking at the row by its OLD name:
   commit in the middle and one frame is drawn hunting for a lift that has
   just been renamed out from under it. The caller points the window at the
   name that comes back, then writes. */
function reparentUnder(exId, parentId, shortTyped) {
  const ex = state.library.find((x) => x.id === exId);
  if (!ex) return null;

  if (!parentId) {
    if (!ex.variantOf) return null;
    return { p: { library: state.library.map((x) => (x.id === ex.id
      ? { ...x, variantOf: undefined, variantName: undefined } : x)) }, name: ex.name };
  }

  const parent = state.library.find((x) => x.id === parentId);
  /* a variation is never a parent: picking one files the row under its root,
     beside it, which is the rule exLabelOf and ex-add-variation already keep */
  const root = parent && parent.variantOf ? variantParent(parent) : parent;
  if (!root || root.id === ex.id) return null;

  const moving = [
    { row: ex, short: (shortTyped || "").trim() || shortUnder(ex, root.name) },
    ...variantsOf(ex.id, state.library).map((k) => ({ row: k, short: shortUnder(k, ex.name) })),
  ];
  const ids = new Set(moving.map((m) => m.row.id));
  const taken = new Set(state.library.filter((x) => !ids.has(x.id)).map((x) => x.name.toLowerCase()));

  const p = {};
  let lib = state.library;
  let landed = ex.name;
  for (const m of moving) {
    const want = `${root.name} (${m.short})`.trim();
    const name = taken.has(want.toLowerCase()) ? m.row.name : want;
    taken.add(name.toLowerCase());
    if (name !== m.row.name) renameExerciseIn(p, m.row.name, name);
    if (m.row.id === ex.id) landed = name;
    lib = lib.map((x) => (x.id === m.row.id
      ? { ...x, name, variantOf: root.id, variantName: m.short } : x));
  }
  p.library = lib;
  return { p, name: landed };
}


const actions = {
  "nav": (el) => {
    const id = el.dataset.id;
    if (ui.tab === id) return;
    ui.tab = id;
    resetTransient();
    render();
  },
  /* ── profiles ─────────────────────────────────────────────────────── */
  "open-profiles": () => {
    /* the counts are read now rather than per frame: each one parses a whole
       profile's state, and this window re-renders on every rename keystroke */
    ui.profileStats = profileStats();
    ui.profileOrder = false;
    ui.profilesWin = true; render();
  },
  "close-profiles": () => { ui.profilesWin = false; ui.profileOrder = false; ui.profileStats = null; render(); },
  "profiles-reorder": () => { ui.profileOrder = !ui.profileOrder; render(); },
  /* Switching is not a thing to be half-sure about: it puts a different
     training on every screen in the app, so it says whose before it goes. */
  "profile-switch": (el) => {
    const id = el.dataset.id;
    const list = profileList();
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return;
    if (!confirm(T("profiles.confirmSwitch", { name: profileLabel(list[i], i) }))) return;
    switchProfile(id);
  },
  "profile-add": () => { ui.profileForm = { id: null, name: "", mode: "add" }; render(); },
  "profile-menu": (el) => {
    const list = profileList();
    const i = list.findIndex((p) => p.id === el.dataset.id);
    if (i < 0) return;
    ui.profileForm = { id: list[i].id, name: list[i].name || "", mode: "rename" };
    render();
  },
  "profile-form-save": () => {
    const f = ui.profileForm;
    if (!f) return;
    const name = (f.name || "").trim();
    if (f.mode === "add") {
      const id = addProfile(name);
      ui.profileForm = null;
      if (id) {
        syncSet(id, { nameAt: Date.now() });
        ui.profileStats = profileStats(); render();
        /* into the account now rather than at the next poll, so it is on
           the other device by the time somebody thinks to look */
        rosterSync({ force: true });
      }
      return;
    }
    /* ── A NAME IS ACCOUNT DATA NOW ──────────────────────────────────
       It used to be a label on this phone that the server was told about
       as a courtesy, which is why the same profile read "Main" here and
       "Profile 1" on the laptop. The stamp is what makes it converge:
       the later typing wins, so a phone that has been offline for a week
       cannot undo a rename made yesterday simply by reconnecting last.
       Still fire and forget — a failed request costs a stale label for
       one poll, not data, and the roster pass will carry it. */
    /* Not yours to name. A read grant's nickname went nowhere — the
       server will not take a name for somebody else's profile — so it
       only ever produced one profile called three different things on
       three different screens. See the roster's read-grant branch. */
    if ((syncLinked(f.id) || {}).level === "read") { toastReadOnly(); return; }
    const at = Date.now();
    renameLocalProfile(f.id, name, at);
    const rec = syncLinked(f.id);
    const C = window.ZenofitCloud;
    if (rec && rec.level !== "read" && C && C.renameProfile) {
      C.renameProfile(rec.remoteId, name, at)
        .then((out) => {
          /* refused as stale: the answer is the name that won */
          if (out && out.stale) { renameLocalProfile(f.id, out.name, out.nameUpdatedAt); render(); }
          syncSet(f.id, { srvName: (out && out.name) || name, srvNameAt: (out && out.nameUpdatedAt) || at });
        })
        .catch(() => { /* the roster pass will */ });
    }
    ui.profileForm = null;
    render();
  },
  /* A copy lands next to what it came from, named for it, because the only
     reason to make one is to tell it apart from the original. */
  "profile-duplicate": (el) => {
    const list = profileList();
    const i = list.findIndex((p) => p.id === el.dataset.id);
    if (i < 0) return;
    const id = duplicateProfile(list[i].id, T("profiles.copyOf", { name: profileLabel(list[i], i) }));
    ui.profileForm = null;
    if (id) {
      syncSet(id, { nameAt: Date.now() });
      ui.profileStats = profileStats(); render();
      rosterSync({ force: true });
    }
  },
  /* The one button in here that can lose somebody a training history, so it
     says how much of one before it asks, and asks with the name in it. */
  "profile-delete": (el) => {
    const list = profileList();
    const i = list.findIndex((p) => p.id === el.dataset.id);
    if (i < 0 || list.length < 2) return;
    const st = (ui.profileStats || {})[list[i].id] || { days: 0, entries: 0 };
    if (!confirm(T("profiles.confirmDelete", {
      name: profileLabel(list[i], i), days: TN("day", st.days), sets: TN("logEntry", st.entries),
    }))) return;
    /* ── DELETING TAKES IT OUT OF THE ACCOUNT, ON EVERY DEVICE ─────
       Read the link BEFORE the local delete, which drops it.

       WHICH VERB depends on whose profile it is, and getting that wrong
       is what made this local-only. It used to send `deleteProfile` for
       anything not marked "read", so a profile somebody had shared with
       write access got a delete the server rightly refused as not-yours,
       into a `.catch` that said nothing — and a read one got no request
       at all. Either way the grant survived, the profile stayed in the
       account, and the laptop kept its copy of something that had been
       deleted on the phone hours ago.

       `owned` is the server's own answer out of the last listing, not a
       guess from the level string, because that is the one field that
       actually decides which of the two is true. */
    const link = syncLinked(list[i].id);
    if (link && link.remoteId) queueRemoval(link.remoteId, link.owned ? "delete" : "leave");
    deleteProfile(list[i].id);
    ui.profileForm = null;
    ui.profileStats = profileStats();
    render();
    /* Out of the account NOW rather than at the next poll. Somebody who
       has just deleted something goes and looks at the other device. */
    rosterSync({ force: true });
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
  "share-data": () => shareBackup(),
  "open-storage": () => { ui.showStorage = true; render(); },
  /* ── the account ─────────────────────────────────────────────────── */
  "live-retry": () => { ui.syncError = null; liveEnter(activeProfileId()); },
  /* Reads and re-reads; writes nothing anywhere, which is why it is on the
     read-only allowlist and why it is safe on every screen. */
  "refresh-now": () => refreshNow(),

  "open-account": () => {
    ui.profileForm = null;
    ui.accountSheet = { username: "", password: "", free: null, busy: false, error: null, cloud: [], loading: false, loaded: false };
    render();
    rosterSync().then(() => refreshCloudProfiles());
  },

  /* One button, because "sign in" and "sign up" are the same two fields and
     the server already knows which this is. A name nobody has taken is a
     registration; anything else is a login, and a login that is wrong says
     so rather than quietly creating a second account beside the first. */
  "acct-go": async () => {
    const f = ui.accountSheet;
    const C = window.ZenofitCloud;
    if (!f || f.busy || !C) return;
    const username = (f.username || "").trim();
    const password = f.password || "";
    ui.accountSheet = { ...f, busy: true, error: null }; render();
    try {
      /* asked fresh rather than trusting what the field last saw: somebody
         else may have taken the name in the seconds since */
      let free = f.free;
      try { free = (await C.nameAvailable(username)).available; } catch { /* decide from the attempt instead */ }
      if (free) await C.register(username, password);
      else await C.signIn(username, password);
      ui.accountSheet = { ...ui.accountSheet, busy: false, password: "", free: null, error: null };
      render();
      /* the whole point of signing in: this device's list becomes the
         account's list, and whatever was only here goes up to join it */
      await rosterSync({ force: true });
      refreshCloudProfiles();
    } catch (e) {
      const code = e && e.code;
      ui.accountSheet = { ...ui.accountSheet, busy: false, error: T(
        code === "bad_login" ? "acct.errWrong"
        : code === "name_taken" ? "acct.errTaken"
        : code === "bad_username" ? "acct.nameRules"
        : code === "already_claimed" ? "acct.errClaimed"
        : "acct.errFailed") };
      render();
    }
  },

  /* Signing out forgets the credential and nothing else. Every profile on
     this phone stays exactly where it is, including synced ones — they
     simply stop syncing until somebody signs in again. Deleting training
     because a session ended is not a thing this app will ever do. */
  "acct-signout": () => {
    const C = window.ZenofitCloud;
    if (!C || !confirm(T("acct.confirmSignOut"))) return;
    C.signOut();
    ui.accountSheet = { username: "", password: "", free: null, busy: false, error: null, cloud: [], loading: false, loaded: false };
    render();
  },

  /* ── THE OTHER DIRECTION, FROM THE LIST THAT SHOWS WHAT IS MISSING ──
     Turning sync on has always lived behind Profiles → the pencil → Sync,
     which is the right home for it and the wrong place to NOTICE it: the
     account sheet is where you see, in one list, that two of your four
     profiles are only on this phone. So the same move is offered there, on
     the row that says so, behind the same confirm — this is still the
     moment a training log starts leaving the device.

     It does not require the profile to be the one on screen, which Sync →
     Turn on does: that restriction is there because syncNow PULLS, and a
     pull writes into `state`, which is whichever profile is open. A first
     push has nothing to pull — the cloud profile was minted empty one line
     above — so it pushes from the profile's own saved state and stops. */
  "acct-backup": async (el) => {
    const localId = el.dataset.id;
    const list = profileList();
    const i = list.findIndex((p) => p.id === localId);
    if (i < 0 || ui.syncBusy || syncLinked(localId)) return;
    if (!confirm(T("sync.confirmOn"))) return;
    const C = window.ZenofitCloud;
    if (!C) return;
    ui.syncBusy = true;
    ui.accountSheet = { ...ui.accountSheet, error: null };
    render();
    try {
      await C.ensureDevice();
      /* Minted exactly as the roster mints one (rosterSync step 4), name
         stamp and position included. Sending neither left the server to
         stamp the name with ITS clock while the record here carried this
         phone's, and the two are routinely seconds apart — so the very
         next roster pass read the server's as the later one and handed
         the phone back a name it had just sent up. */
      const at = Date.now();
      const made = await C.createProfile(profileLabel(list[i], i), { position: i, nameUpdatedAt: at });
      /* linked BEFORE the push, so one that dies half way leaves a profile
         that knows where it lives rather than an orphan on the server */
      syncSet(localId, { remoteId: made.profileId || made.id, level: "write", owned: true, marks: {}, cursor: null,
        noSync: false, nameAt: at, srvName: made.name, srvNameAt: at, pos: i, seen: true });
      await syncPush(localId);
      syncSet(localId, { lastOkAt: Date.now() });
    } catch (e) {
      ui.accountSheet = { ...ui.accountSheet, error: syncErrText(e) };
    }
    ui.syncBusy = false;
    render();
    refreshCloudProfiles();
  },

  /* Bring one down as a NEW local profile, the same rule joining follows:
     never merged into one that already holds somebody's training. */
  "acct-pull": async (el) => {
    const f = ui.accountSheet;
    if (!f || f.busy) return;
    const remoteId = el.dataset.p;
    /* the level the listing reported, not an assumption: one of these can
       be somebody else's profile shared with the account for reading */
    const level = el.dataset.lv === "read" ? "read" : "write";
    const localId = addProfile(el.dataset.n || T("sync.joinedName"), { forRemote: true });
    if (!localId) { ui.accountSheet = { ...f, error: T("profiles.quota") }; render(); return; }
    syncSet(localId, { remoteId, level, owned: el.dataset.own === "1", marks: {}, cursor: null, live: level === "read" });
    ui.accountSheet = null;
    if (level === "read") { try { localStorage.removeItem(stateKeyFor(localId)); } catch { /* none yet */ } }
    switchProfile(localId);
    if (level !== "read") await syncNow(localId);
  },
  /* ── sharing a profile ───────────────────────────────────────────────
     Every one of these talks to a network, so every one of them can fail
     with the app still on screen and still usable. They report and stop;
     nothing here ever leaves the local profile half-changed. */
  "open-sync": (el) => {
    ui.profileForm = null;
    ui.syncSheet = { localId: el.dataset.id, grants: [], code: null, copied: false };
    ui.syncError = null;
    render();
    refreshGrants();
  },

  /* Turning it on is the moment the training starts leaving the phone, so
     it asks, in as many words, once. */
  "sync-enable": async () => {
    const f = ui.syncSheet;
    if (!f || ui.syncBusy) return;
    if (f.localId !== activeProfileId()) { alert(T("sync.switchFirst")); return; }
    if (!confirm(T("sync.confirmOn"))) return;
    const C = window.ZenofitCloud;
    if (!C) return;
    ui.syncBusy = true; ui.syncError = null; render();
    try {
      await C.ensureDevice();
      const list = profileList();
      const i = list.findIndex((p) => p.id === f.localId);
      /* same mint as acct-backup and as the roster's own: see there */
      const at = Date.now();
      const made = await C.createProfile(profileLabel(list[i], i), { position: i, nameUpdatedAt: at });
      /* linked BEFORE the first push, so a push that dies half way leaves a
         profile that knows where it lives and can simply be synced again,
         rather than an orphan on the server nothing points at */
      syncSet(f.localId, { remoteId: made.profileId || made.id, level: "write", owned: true, marks: {}, cursor: null,
        noSync: false, nameAt: at, srvName: made.name, srvNameAt: at, pos: i, seen: true });
      ui.syncBusy = false;
      await syncNow(f.localId);
    } catch (e) {
      ui.syncBusy = false;
      ui.syncError = syncErrText(e);
      render();
    }
  },

  "sync-now": async () => {
    const f = ui.syncSheet;
    if (!f || ui.syncBusy) return;
    if (f.localId !== activeProfileId()) { alert(T("sync.switchFirst")); return; }
    await syncNow(f.localId);
    refreshGrants();
  },

  /* Off, never out: the local profile keeps every set it has. What goes is
     the link and the marks, so turning it back on is a fresh full push
     rather than a diff against a server this device has stopped following. */
  "sync-disable": () => {
    const f = ui.syncSheet;
    if (!f) return;
    const rec = syncFor(f.localId);
    const mine = !rec || rec.level !== "read";
    if (!confirm(T(mine ? "sync.confirmOff" : "sync.confirmLeave"))) return;
    /* A record with no link, saying so. syncForget alone would leave the
       roster free to adopt the same profile back on its very next pass,
       which is a Turn-off button that does not turn anything off. */
    const link = syncLinked(f.localId);
    syncForget(f.localId);
    syncSet(f.localId, { noSync: true });
    if (link) dropRemote(link.remoteId, true);
    /* Somebody else's profile: LEAVING it is a fact about the account, not
       about this phone, so it is queued like a delete and reaches every
       device you are signed in on. Your own profile keeps its cloud copy —
       turning sync off here is this device stepping back, not a decision
       about the other ones. */
    if (link && !link.owned) queueRemoval(link.remoteId, "leave");
    ui.syncSheet = { ...f, grants: [], code: null };
    ui.syncError = null;
    render();
  },

  /* ── ONE LIVE CODE AT A TIME, WHICH IS WHAT THE SHEET ALREADY SAID ──
     This called createSeed, which ADDS a code and retires nothing, while
     the line under the two buttons said "making a new code retires the old
     one". Three ways that bit. Every profile is minted with a write seed
     it never shows anybody (see POST /v1/profiles), so a profile shared
     read-only still had a live write code hanging off it. A read code made
     after a write one left the write one working, so "I've made it read
     only now" was not true. And a code that leaked stayed good forever,
     because nothing in the app had ever revoked one.

     rotate: true is the server's word for "revoke every code on this
     profile, then mint this one". Nobody already in is touched — a grant
     is a person, a seed is only the doorway — which is the difference
     between this and Remove.                                          */
  "sync-make-code": async (el) => {
    const f = ui.syncSheet;
    const rec = f && syncFor(f.localId);
    if (!rec || !rec.remoteId || ui.syncBusy) return;
    const level = el.dataset.level === "write" ? "write" : "read";
    ui.syncBusy = true; ui.syncError = null; render();
    try {
      const made = await window.ZenofitCloud.rotateSeeds(rec.remoteId, level);
      ui.syncSheet = { ...ui.syncSheet, code: made.seed, codeLevel: level, copied: false };
    } catch (e) {
      ui.syncError = syncErrText(e);
    }
    ui.syncBusy = false; render();
  },

  /* ── MOVING SOMEBODY BETWEEN READ AND WRITE ────────────────────────
     The people list could only remove, so "she should just be able to
     look at it now" meant revoking her, sending a new code and having her
     join again from nothing. It asks first because it changes what
     somebody else's phone is allowed to do with a log they are holding. */
  "sync-set-level": async (el) => {
    const f = ui.syncSheet;
    const rec = f && syncFor(f.localId);
    if (!rec || !rec.remoteId || ui.syncBusy) return;
    const level = el.dataset.level === "write" ? "write" : "read";
    const who = el.dataset.name || T("sync.someone");
    if (!confirm(T(level === "read" ? "sync.confirmToRead" : "sync.confirmToWrite", { name: who }))) return;
    ui.syncBusy = true; ui.syncError = null; render();
    try { await window.ZenofitCloud.setGrantLevel(rec.remoteId, el.dataset.g, level); }
    catch (e) { ui.syncError = syncErrText(e); }
    ui.syncBusy = false; render();
    refreshGrants();
  },

  "sync-copy-code": async () => {
    const f = ui.syncSheet;
    if (!f || !f.code) return;
    try { await navigator.clipboard.writeText(f.code); ui.syncSheet = { ...f, copied: true }; }
    catch { /* no clipboard permission: the code is on screen to be read */ }
    render();
  },

  "sync-revoke": async (el) => {
    const f = ui.syncSheet;
    const rec = f && syncFor(f.localId);
    if (!rec || !rec.remoteId || !confirm(T("sync.confirmRevoke"))) return;
    ui.syncBusy = true; render();
    try { await window.ZenofitCloud.revokeGrant(rec.remoteId, el.dataset.g); }
    catch (e) { ui.syncError = syncErrText(e); }
    ui.syncBusy = false; render();
    refreshGrants();
  },

  /* ── joining one ─────────────────────────────────────────────────── */
  "open-join": () => { ui.joinSheet = { code: "", busy: false, error: null }; render(); },

  "join-go": async () => {
    const f = ui.joinSheet;
    if (!f || f.busy) return;
    const C = window.ZenofitCloud;
    if (!C) { ui.joinSheet = { ...f, error: T("sync.noClient") }; render(); return; }
    ui.joinSheet = { ...f, busy: true, error: null }; render();
    let joined;
    try {
      await C.ensureDevice();
      joined = await C.joinWithSeed((f.code || "").trim());
    } catch (e) {
      const code = e && e.code;
      ui.joinSheet = { ...ui.joinSheet, busy: false,
        error: T(code === "not_found" || e.status === 404 ? "sync.joinBadCode"
          : code === "rate_limited" || e.status === 429 ? "sync.joinTooMany"
          : "sync.joinFailed") };
      render();
      return;
    }
    /* Your own code, typed on the phone that made it. The server says so
       rather than letting you in, and without this the "read" fallback
       below turned that into a second, read-only, live copy of a profile
       already sitting in the list — one that would then be blank the first
       time the signal went. */
    if (joined.alreadyMine) {
      ui.joinSheet = { ...ui.joinSheet, busy: false, error: T("sync.joinOwn") };
      render();
      return;
    }
    const remoteId = joined.profileId || joined.id;
    const level = joined.level === "write" ? "write" : "read";
    /* A NEW local profile, always. Folding somebody else's training into a
       profile that already has yours in it is the one move here that cannot
       be undone afterwards. */
    const localId = addProfile(joined.name || T("sync.joinedName"), { forRemote: true });
    if (!localId) { ui.joinSheet = { ...ui.joinSheet, busy: false, error: T("profiles.quota") }; render(); return; }
    /* A READ grant is held live: nothing of it is written to this phone,
       it is fetched when you open it. See the LIVE block for the trade —
       it needs a connection, and it is somebody else's log, so there is
       nothing here a failed fetch can lose. A WRITE grant is a profile you
       are expected to train in, so it is stored like any other. */
    syncSet(localId, { remoteId, level, owned: false, marks: {}, cursor: null, live: level === "read" });
    ui.joinSheet = null;
    if (level === "read") { try { localStorage.removeItem(stateKeyFor(localId)); } catch { /* none yet */ } }
    switchProfile(localId);
    if (level !== "read") await syncNow(localId);
  },

  /* ── OUT TO THE PUSH DIAGNOSTIC AND BACK ─────────────────────────────
     The one place in the app that deliberately navigates the document
     away from itself, so it is worth saying why it is shaped like this.

     A REAL NAVIGATION, NOT window.open. Inside an installed app on iOS a
     new tab does not open beside you, it opens in Safari: a different
     browsing context, outside the installed scope, with no service worker
     and no standalone flag. iOS only delivers a push to an installed app,
     so the page would sit there diagnosing a context that can never pass,
     which is the one thing it exists to test. Same-window keeps it inside
     the scope on every platform, and push-test.html carries a link back.

     RELATIVE, NEVER THE github.io URL. The whole document resolves it
     against wherever the app is actually being served from, so a move to
     another host, or a local file:// copy, or a preview server, all keep
     working. Hard-coding the deploy URL would send a developer testing a
     local build to the live site to look at the live build.

     The state write is belt and braces: writeNow is already bound to
     pagehide and beforeunload, and both fire on a navigation like this.
     Doing it here too costs one localStorage write and means a half-typed
     set survives even on a browser that drops those events. */
  "open-push-test": () => {
    writeNow();
    location.href = "push-test.html";
  },
  /* Read-only, both of them, so they still work on a device too full to
     save anything. Nothing is awaited before the share, see shareFile. */
  "storage-export": (el) => {
    const f = storageFileFor(el.dataset.key);
    if (f) downloadText(f.name, f.text);
  },
  "storage-share": (el) => {
    const f = storageFileFor(el.dataset.key);
    if (f) shareFile(f.name, f.text);
  },
  "close-storage": () => { ui.showStorage = false; render(); },
  /* The only write on that screen, and it only ever ADDS: it asks first,
     names what it found so the answer is about a real number of sessions
     rather than a key, and hands off to switchProfile, which parks and
     flushes whatever is open before it moves. */
  "storage-adopt": (el) => {
    const row = storageScan().rows.find((r) => r.key === el.dataset.key);
    if (!row || !row.ok) return;
    if (!confirm(T("stor.confirmRecover", {
      days: TN("day", row.days), sets: TN("logEntry", row.entries),
    }))) return;
    ui.showStorage = false; ui.showProfile = false; ui.profileDraft = null;
    if (!adoptStorage(el.dataset.key)) render();
  },
  "reset-all": () => {
    if (confirm(T("profile.confirmReset"))) {
      ui.showProfile = false; ui.profileDraft = null;
      /* the one button whose entire job is to replace what is there */
      allowOverwrite();
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
    ui.entryForm.f = syncEntry({ ...f, setList: [...(f.setList || []), newSet(t.reps, t.weight, "", t.secs)] });
    render();
  },
  /* the ghost row itself: open the editor with the target loaded, because
     the honest answer is usually "that, but one rep short" */
  "plan-load-set": (el) => {
    const f = ui.entryForm && ui.entryForm.f;
    const t = f && f.plan && f.plan.sets && f.plan.sets[+el.dataset.i];
    if (!t) return;
    ui.setForm = { s: newSet(t.reps, t.weight, "", t.secs), isNew: true, index: (f.setList || []).length };
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
  /* Each route keeps its own boxes, so this carries nothing across and
     overwrites nothing: flip back and what you typed is still there. The
     answer goes, because it was worked out from the other one. */
  "std-mode": (el) => {
    const f = stdForm();
    if (f.mode === el.dataset.id) return;
    f.mode = el.dataset.id;
    ui.stdResult = null;
    render();
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
    /* The number belongs to the lift, which is why the line above resets it to
       the log's best or to nothing at all. The set route has no per-lift
       pre-fill to offer, so it resets to nothing: 5 × 135 left over from the
       bench press is not a claim about the squat you just picked. */
    f.setReps = ""; f.setWeight = "";
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
    ui.groupForm = { name: "", color: free || GROUP_SWATCHES[0], kind: DEFAULT_KIND, orig: null, then: (el && el.dataset.then) || null };
    render();
  },
  "group-edit": (el) => {
    const name = el.dataset.g;
    /* show the label, remember the stored name, see group-save */
    ui.groupForm = { name: groupLabel(name), color: colorFor(name), kind: groupKind(name), orig: name, then: null };
    render();
  },
  "group-color": (el) => { if (ui.groupForm) { ui.groupForm.color = el.dataset.c; render(); } },
  "group-kind": (el) => { if (ui.groupForm && KIND[el.dataset.k]) { ui.groupForm.kind = el.dataset.k; render(); } },
  /* Picking the group's own kind is not an override, it is the absence of
     one: tapping it puts the lift back to following its group, so a later
     change to the group carries it along. Picking anything else is the
     exception, and stays one. */
  "exwin-kind": (el) => {
    const f = ui.exWinDraft, k = el.dataset.k;
    if (!f || !KIND[k]) return;
    ui.exWinDraft = withKind(f, k);
    render();
  },
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
       claim about the name: groupLabel reads it together with the name to
       decide whether this is still a group we shipped. What a group is FOR
       is `kind`, declared in the form above and untouched by any of this,
       which is what makes "Hell" a perfectly good name for cardio. */
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
      const kind = KIND[f.kind] ? f.kind : DEFAULT_KIND;
      p.groups = groups.map((g) => (g.name === f.orig
        ? (keep ? { name, key: keep, color: f.color, kind } : { name, color: f.color, kind })
        : g));
      if (name !== f.orig) {
        const swap = (x) => (x.muscle === f.orig ? { ...x, muscle: name } : x);
        p.library = state.library.map(swap);
        p.log = state.log.map(swap);
        p.plans = (state.plans || []).map((pl) => ({ ...pl, entries: (pl.entries || []).map(swap) }));
        p.dayDrafts = (state.dayDrafts || []).map((d) => ({ ...d, entries: (d.entries || []).map(swap) }));
        p.unlogged = (state.unlogged || []).map((u) => ({ ...u, entries: (u.entries || []).map(swap) }));
        p.presets = (state.presets || []).map((pr) => ({ ...pr, exercises: (pr.exercises || []).map(swap) }));
        if (state.volumeGoals && state.volumeGoals[f.orig] != null) {
          const vg = { ...state.volumeGoals };
          vg[name] = vg[f.orig]; delete vg[f.orig];
          p.volumeGoals = vg;
        }
        if (ui.libraryFilter === f.orig) ui.libraryFilter = name;
      }
    } else {
      p.groups = [...groups, { name, color: f.color, kind: KIND[f.kind] ? f.kind : DEFAULT_KIND }];
    }

    const then = f.then;
    ui.groupForm = null;
    /* the group is not in state yet, so hand withKind the kind it is about
       to be saved with rather than letting it look one up that isn't there */
    if (then === "exwin" && ui.exWinDraft)
      ui.exWinDraft = withKind({ ...ui.exWinDraft, muscle: name }, ui.exWinDraft.kind, KIND[f.kind] ? f.kind : DEFAULT_KIND);
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
    p.unlogged = (state.unlogged || []).map((u) => ({ ...u, entries: (u.entries || []).map(swap) }));
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

  /* A branch, not a blank: it opens on everything the parent knows (group,
     equipment, cues, photo, video) because a wide-grip pulldown is a
     pulldown in every respect but the one you are about to type. The kind
     is deliberately NOT copied: it follows the group like any other row,
     and an exception on the parent is the parent's. */
  "ex-add-variation": (el) => {
    const root = state.library.find((x) => x.id === el.dataset.id);
    if (!root) return;
    ui.exWinDraft = {
      id: uid(), name: "", variantOf: root.id, variantName: "",
      muscle: root.muscle, equipment: root.equipment || "", alternatives: root.alternatives || "",
      note: root.note || "", image: root.image || "", video: root.video || "", custom: true,
    };
    ui.exWin = { isNew: true }; ui.exWinEdit = true; render();
  },
  "add-exercise": () => {
    ui.exWinDraft = { id: uid(), name: "", muscle: "", equipment: "", alternatives: "", note: "", image: "", video: "", custom: true };
    ui.exWin = { isNew: true }; ui.exWinEdit = true; render();
  },

  /* ── moving a lift into somebody else's family ─────────────────────
     The other half of ex-add-variation: that one branches a NEW row off a
     lift, this one takes a lift that already exists, with a year of
     sessions behind it, and files it under another. See reparentUnder. */
  "ex-attach-start": (el) => {
    const ex = state.library.find((x) => x.id === el.dataset.id);
    if (!ex) return;
    ui.exWinAttach = { id: ex.id, q: "", parentId: null, short: "" };
    render();
  },
  "ex-attach-close": () => { ui.exWinAttach = null; render(); },
  /* picking a parent does not move anything: it fills in the name the row
     will wear and shows it, because the guess is a guess and this is the
     one moment anybody can correct it */
  "ex-attach-pick": (el) => {
    const a = ui.exWinAttach;
    if (!a) return;
    const ex = state.library.find((x) => x.id === a.id);
    const root = state.library.find((x) => x.id === el.dataset.id);
    if (!ex || !root) return;
    a.parentId = root.id;
    a.short = shortUnder(ex, root.name);
    render();
  },
  "ex-attach-back": () => {
    if (!ui.exWinAttach) return;
    ui.exWinAttach.parentId = null; ui.exWinAttach.short = "";
    render();
  },
  "ex-attach-save": () => {
    const a = ui.exWinAttach;
    if (!a || !a.parentId || !(a.short || "").trim()) return;
    const res = reparentUnder(a.id, a.parentId, a.short);
    ui.exWinAttach = null;
    if (!res) { render(); return; }
    ui.exWin = { name: res.name }; ui.exWinEdit = false; ui.exWinDraft = null;
    patch(res.p);
  },
  /* out of the family and back to being a lift of its own, keeping the name
     it already answers to — the same thing deleting a parent does to what it
     leaves behind, which is why it needs no rename and no confirm: nothing
     is lost, and doing it again re-files it. */
  "ex-detach": (el) => {
    const res = reparentUnder(el.dataset.id, null, "");
    if (!res) return;
    ui.exWin = { name: res.name }; ui.exWinEdit = false; ui.exWinDraft = null;
    patch(res.p);
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
    ui.entryForm = { f: newEntry(ex.name, ex.muscle, exKind(ex)), isDraft: true };
    ui.setForm = null;
    render();
  },
  "exwin-close": () => { ui.exWin = null; ui.exWinEdit = false; ui.exWinDraft = null; ui.exWinAttach = null; render(); },
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
  /* `imageMissing` goes with it. The flag means "there is one elsewhere",
     which is a thing to go and fetch; a photo the user has just deleted is
     a decision, and the row must not go on advertising a picture nobody
     is coming back for. Same on upload, one screen down. */
  "exwin-remove-image": () => {
    if (!ui.exWinDraft) return;
    ui.exWinDraft.image = "";
    delete ui.exWinDraft.imageMissing;
    render();
  },
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
    if (!f) return;
    const muscle = (f.muscle || "").trim();
    if (!muscle) return;
    const orig = state.library.find((x) => x.id === f.id);
    /* A variation is named by its short part, and its STORED name is
       composed from the parent's stored name so it stays unique and stays
       recognisable in a backup file. The label on screen is composed
       separately and live, see exLabelOf. */
    let typed;
    if (f.variantOf) {
      const short = (f.variantName || "").trim();
      if (!short) return;
      const parent = variantParent(f);
      typed = `${parent ? parent.name : f.name || ""} (${short})`.trim();
    } else {
      typed = (f.name || "").trim();
    }
    if (!typed) return;
    const name = orig && !f.variantOf && typed === exLabelOf(orig) ? orig.name : typed;
    const was = orig ? orig.name : null;

    if (state.library.some((x) => x.id !== f.id && x.name.toLowerCase() === name.toLowerCase())) {
      alert(T("ex.clash", { name: typed }));
      return;
    }

    /* compound vs isolation was noise nobody filed anything under, and its
       `type` field is dead: what a lift is logged in is `kind`, and withKind
       stores it only while it differs from the group's, so re-filing a lift
       into a cardio group is all it takes to make it cardio. */
    const ex = withKind({ ...f, name, muscle }, f.kind);
    const p = { library: orig ? state.library.map((x) => (x.id === ex.id ? ex : x)) : [...state.library, ex] };

    if (was && was !== name) renameExerciseIn(p, was, name);

    ui.exWin = { name }; ui.exWinEdit = false; ui.exWinDraft = null;
    patch(p);
  },
  "exwin-delete": () => {
    const id = ui.exWinDraft && ui.exWinDraft.id;
    const name = ui.exWin && ui.exWin.name;
    const kids = id ? variantsOf(id, state.library) : [];
    /* Its variations are separate lifts with their own history, so they are
       never taken down with it. They keep their own stored names and simply
       stop being shown as a family, which the confirm says before it asks. */
    if (!confirm(kids.length ? T("ex.confirmDeleteParent", { n: TN("variation", kids.length) }) : T("ex.confirmDelete"))) return;
    ui.exWin = null; ui.exWinEdit = false; ui.exWinDraft = null;
    patch({
      library: state.library
        .filter((x) => (id ? x.id !== id : x.name !== name))
        .map((x) => (x.variantOf === id ? { ...x, variantOf: undefined, variantName: undefined } : x)),
    });
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
    /* and the lifts this day was saved WITHOUT logging, back exactly as they
       were left: blank, counting for nothing, one bin-tap from gone. They come
       after what was logged because that is what they are — the part of the
       session still outstanding. */
    const waiting = clone(unloggedOn(date)) || [];
    ui.workoutSheet = {
      /* the date this day came from, kept because the sheet's own date field
         can move it somewhere else before it is saved, see commitWorkout */
      date, originalDate: date, entries: [...entries, ...ghosts, ...waiting],
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
      const date = draft.date;
      ui.workoutSheet = null;
      /* the day is gone, so there is nothing left for its waiting lifts to
         wait on, and nowhere they could ever be reopened from */
      patch({
        log: state.log.filter((e) => !ids.has(e.id)),
        unlogged: (state.unlogged || []).filter((u) => u.date !== date),
      });
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
    const ex = { id: uid(), name: ui.pickerQuick.name, muscle: g, equipment: "", alternatives: "", note: "", custom: true };
    ui.picking = false; ui.pickerQ = ""; ui.pickerQuick = null;
    ui.entryForm = { f: newEntry(ex.name, ex.muscle, exKind(ex)), isDraft: true };
    patch({ library: [...state.library, ex] });
  },
  "pick-exercise": (el) => {
    const ex = state.library.find((x) => x.id === el.dataset.id);
    if (!ex) return;
    ui.picking = false; ui.pickerQ = ""; ui.pickerQuick = null;
    ui.entryForm = { f: newEntry(ex.name, ex.muscle, exKind(ex)), isDraft: true };
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
    if (kindOf(f) === "cardio") {
      ui.entryForm.f = { ...f, minutes: d.min, intensity: d.rpe };
      render(); return;
    }
    if (isDetailed(f)) {
      ui.setForm = { s: newSet(d.reps || "", d.weight || "", "", d.secs || ""), isNew: true, index: (f.setList || []).length };
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
    const d = el.dataset;
    /* only the boxes this kind has: writing a weight onto a hold would put
       a number in the log that its own editor never showed */
    const s = { ...ui.setForm.s };
    if (d.reps != null) s.reps = d.reps;
    if (d.weight != null) s.weight = d.weight;
    if (d.secs != null) s.secs = d.secs;
    ui.setForm.s = s;
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
    if (!form || !f || !setHasData(form.s, kindOf(f))) return;
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
    if (!f || isDetailed(f) || kindOf(f) !== "strength") return;
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
    /* that restart stops the countdown, so the server's copy of the OLD
       length goes back too — otherwise editing 90s to 120s leaves a push
       booked for a rest that no longer exists */
    if (existing) cloudTimerCancel(existing);
    const row = existing
      ? { ...existing, cloudId: null, name, key: keepKey, duration, pinned: !!form.t.pinned, ...alert, endsAt: null, remaining: null, doneAt: null }
      : { id: form.t.id, name, duration, pinned: !!form.t.pinned, ...alert, endsAt: null, remaining: null, doneAt: null, createdAt: Date.now() };
    ui.timerForm = null;
    patch({ timers: existing ? state.timers.map((x) => (x.id === row.id ? row : x)) : [...(state.timers || []), row] });
  },
  "timer-delete": () => {
    const form = ui.timerForm;
    if (!form || !confirm(T("timers.confirmDelete"))) return;
    const id = form.t.id;
    /* before it leaves state, while there is still something holding the
       handle: a deleted timer that still pushes is a notification with
       nothing behind it to tap */
    cloudTimerCancel((state.timers || []).find((x) => x.id === id));
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
    cloudTimerCancel(t);     // paused is not counting down, here or there
    writeNow(); render();
  },
  "timer-reset": (el) => {
    const t = (state.timers || []).find((x) => x.id === el.dataset.id);
    if (!t) return;
    t.endsAt = null; t.remaining = null; t.doneAt = null;
    cloudTimerCancel(t);
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
  /* Scrapping a lift that is waiting to be logged. No confirm: it holds no
     numbers, so there is nothing to lose and nothing to undo, which is exactly
     the rule the entry form's own bin follows for a draft entry (this is the
     short way round to the same thing). On a lift that came from a plan it
     also gives up that plan's claim on it, which is what deleting one from
     the sheet has always meant. Nothing is written until the day is saved. */
  "scrap-draft-entry": (el) => {
    const draft = ui.workoutSheet;
    if (!draft) return;
    draft.entries = draft.entries.filter((x) => x.id !== el.dataset.id);
    render();
  },
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
  /* ── CLOSING A SHEET, WITHOUT A LIST TO FORGET ────────────────────────
     Every sheet() names its own `ui` field as its target, so closing one
     is clearing that field and nothing else. This used to be an if/else
     ladder with one line per sheet, which meant every new sheet had to
     remember to add itself — and the Join sheet shipped without its line.
     Its X and its backdrop both fell through every branch, did nothing,
     and the only way out of a code box you had opened by mistake was to
     kill the app.

     A lookup cannot forget. The `ui` guard keeps it to fields that are
     really there, so a stale `data-target` clears nothing rather than
     inventing a key; null rather than false throughout is safe because
     every one of these is only ever read for truthiness. */
  "overlay-close": (el) => {
    const t = el.dataset.target;
    if (t && Object.prototype.hasOwnProperty.call(ui, t)) ui[t] = null;
    render();
  },
};

/* ── A READ GRANT IS A CONSTRAINT, NOT A LABEL ────────────────────────
   Somebody else's profile, shared for reading. Every screen works and
   nothing can be written, and the enforcement is an ALLOWLIST rather than
   a list of things to block, so it fails the safe way: an action added
   next year is refused here until somebody decides it is safe, instead of
   quietly becoming a hole. The server refuses the write as well — a check
   on this side is a courtesy, not a lock — but it is the courtesy that
   stops somebody logging a session into a profile that will throw it away
   on the next pull.

   What is on the list is navigation and looking: tabs, sheets opening and
   closing, filters, the chart, the calculator, the accordion, the storage
   check, and the sync sheet itself, because Leave has to stay reachable
   from inside a profile you cannot write to.

   Three groups are on it that look like writes and are not, and each one
   was a bug the first time this list was drawn up:

   THE TIMERS, all of them, including making and editing one. They are
   deliberately NOT in SYNC_COLLECTIONS — they belong to the phone rather
   than to the training — so nothing about them can be overwritten by a
   pull or pushed to anybody. Allowing Start while refusing Edit was this
   list disagreeing with its own reasoning.

   THE PROFILE LIST: add, rename, copy, delete, reorder. Those write the
   profile INDEX, not the training inside a profile, and refusing them
   meant you could not make a profile of your own, or delete the shared
   one you had finished with, without first switching away from it. Note
   Copy is a feature here rather than a hole: a local copy of something
   somebody shared with you is yours to write in, which is exactly what
   somebody wanting to fork a program off a friend is after.

   STORAGE ADOPT, because it is the repair tool, and a rescue you can only
   reach from a profile that is not the broken one is not a rescue.

   Left blocked deliberately: everything in Settings that writes
   `settings` (units, week mode, start date, and Save), because those ARE
   synced and a local change to one would be quietly reverted by the next
   pull — the one outcome this whole list exists to prevent.           */
const READ_OK = new Set([
  "nav", "fab", "log-seg", "library-seg", "prog-seg", "picker-seg", "lib-filter",
  "cal-day", "cal-next", "cal-prev", "vol-next", "vol-prev", "toggle-accordion",
  "open-exercise-window", "exwin-close", "exwin-cancel", "open-log-day", "log-day",
  "open-picker", "close-picker", "overlay-close", "close-worksheet", "close-entry",
  "close-body", "open-body", "close-storage", "open-storage", "storage-export", "storage-share",
  "storage-adopt", "open-groups",
  "open-profile", "close-profile", "open-profiles", "close-profiles", "profile-switch",
  "profile-menu", "profile-add", "profile-duplicate", "profile-delete", "profile-form-save",
  "profiles-reorder",
  "open-sync", "sync-now", "sync-disable", "sync-copy-code",
  "open-account", "acct-go", "acct-signout", "acct-pull", "acct-backup",
  "live-retry", "refresh-now",
  "open-join", "join-go", "open-push-test",
  "chart-zoom-in", "chart-zoom-out", "chart-reset", "chart-full", "chart-exit-full", "chart-pick",
  "select-progress", "ex-hist-all", "open-preset", "plan-open", "plan-result-close",
  "calc-run", "std-check", "std-mode", "std-pick", "std-pick-open", "std-pick-close", "std-sex",
  "export-data", "share-data", "dismiss-new", "toast-dismiss", "toast-open",
  "timer-start", "timer-pause", "timer-reset", "timer-sound-test", "timer-add", "timer-edit",
  "timer-save", "timer-delete", "timer-pin", "timer-form-pin", "timer-reorder", "timer-preset",
  "timer-sound",
]);

function toastReadOnly() {
  try { alert(T("sync.roBlocked")); } catch { /* no UI to say it in */ }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  /* stopPropagation equivalent: if the click landed inside a [data-stopprop]
     element that sits BETWEEN the target and the resolved action element,
     the outer action must not fire (sheet backdrops, goal editor row). */
  const stop = e.target.closest("[data-stopprop]");
  if (stop && el !== stop && el.contains(stop)) return;
  if (syncReadOnly() && !READ_OK.has(el.dataset.action)) { toastReadOnly(); return; }
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
    /* digits and ONE separator. A second one made "5.5.5", which reads back
       as Not a Number: the field looked fine, the Save button just stayed
       grey, and nothing on screen said why. */
    let clean = v.replace(/[^\d.,]/g, "");
    const cut = clean.search(/[.,]/);
    if (cut >= 0) clean = clean.slice(0, cut + 1) + clean.slice(cut + 1).replace(/[.,]/g, "");
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
  } else if (bind === "progq") {
    ui.progressQ = v;
    const list = document.getElementById("progLifts");
    if (list) { list.innerHTML = progressLiftsHTML(); if (window.lucide) lucide.createIcons(); }
  } else if (bind === "pickq") {
    ui.pickerQ = v;
    const list = document.getElementById("pickList");
    if (list) { list.innerHTML = renderPickerList(state.library); if (window.lucide) lucide.createIcons(); }
  } else if (bind === "attachq") {
    if (ui.exWinAttach) {
      ui.exWinAttach.q = v;
      const list = document.getElementById("attachList");
      if (list) { list.innerHTML = attachBasesHTML(); if (window.lucide) lucide.createIcons(); }
    }
  } else if (bind === "attach.short") {
    /* the composed label under the field and the Save button both answer to
       this one string, and neither is worth a full render per keystroke */
    if (ui.exWinAttach) {
      ui.exWinAttach.short = v;
      const prev = document.getElementById("attachPreview");
      const root = state.library.find((x) => x.id === ui.exWinAttach.parentId);
      if (prev && root) prev.textContent = `${exLabelOf(root)} · ${v.trim() || T("ex.variationName")}`;
      const btn = document.getElementById("attachSaveBtn");
      if (btn) { const ok = !!v.trim(); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
    }
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
    /* the max beside the two set boxes is the whole reason the set route
       exists, so it answers the keystroke rather than waiting for a render */
    if (key === "setReps" || key === "setWeight") {
      const out = document.getElementById("stdEst");
      if (out) {
        const est = stdSetMax(f);
        out.textContent = est ? trimNum(est) : "—";
        out.style.color = est ? "var(--gold)" : "var(--faint)";
      }
    }
    const btn = document.getElementById("stdCheckBtn");
    if (btn) { const ok = stdReady(f); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
  } else if (bind === "acctName") {
    /* Lower-cased as it is typed, because that is what it will be compared
       as anyway (username_lc), and a name that reads back differently from
       what you signed up with is a name you will mistrust.

       NOTHING HERE CALLS render(). It used to, on every keystroke that left
       the name too short to check, and render() rebuilds #app: the input
       the caret was sitting in was thrown away and replaced, so the cursor
       went to position 0 and "wo" followed by "rds" came out "rdswo". The
       hint and the button are patched in place instead. */
    const clean = v.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24);
    if (el.value !== clean) {
      /* only ever rewritten when the cleaning actually removed something,
         and the caret is moved back by however much came out before it */
      const cut = el.value.slice(0, el.selectionStart || 0).replace(/[^a-z0-9._-]/gi, "").length;
      el.value = clean;
      try { el.setSelectionRange(cut, cut); } catch { /* not a text field */ }
    }
    ui.accountSheet = { ...ui.accountSheet, username: clean, free: null, error: null };
    updateAccountPreview();
    /* Asked while typing, and only once it could possibly be valid. The
       answer decides whether the button offers to sign in or to create, so
       it has to arrive before the button is pressed, not after. */
    clearTimeout(acctNameTimer);
    if (ACCT_NAME_RE.test(clean)) {
      const asked = clean;
      acctNameTimer = setTimeout(() => {
        const C = window.ZenofitCloud;
        if (!C || !C.nameAvailable) return;
        C.nameAvailable(asked).then((r) => {
          /* the field has moved on: this answer is about a name nobody is
             looking at any more */
          if (!ui.accountSheet || ui.accountSheet.username !== asked) return;
          ui.accountSheet = { ...ui.accountSheet, free: !!r.available };
          updateAccountPreview();
        }).catch(() => { /* the attempt itself will say */ });
      }, 450);
    }
  } else if (bind === "acctPass") {
    ui.accountSheet = { ...ui.accountSheet, password: v, error: null };
    updateAccountPreview();
  } else if (bind === "joinCode") {
    /* ── TYPING A CODE SOMEBODY READ OUT TO YOU ────────────────────────
       The seed is printed XXXX-XXXX-XX and it is usually being copied off
       another phone held next to yours, a character at a time, often by
       somebody reading it aloud. So the field does the shape: upper case
       whatever the keyboard felt like, dashes appearing on their own after
       the fourth and eighth character, and nothing accepted past the tenth.

       The server is already forgiving about all of this (normalizeSeed
       takes lower case, missing dashes, and even the letters the alphabet
       excludes), so none of this is required to make a code work. It is
       here so the thing you are typing LOOKS like the thing you are
       reading, which is what stops you losing your place halfway through.

       The caret is put back deliberately rather than left to the browser:
       rewriting `value` sends it to the end, which on a phone means the
       cursor jumping past a dash the field just inserted, and then a
       backspace deletes the wrong character. */
    const raw = v.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 10);
    const pretty = raw.length > 8 ? raw.slice(0, 4) + "-" + raw.slice(4, 8) + "-" + raw.slice(8)
      : raw.length > 4 ? raw.slice(0, 4) + "-" + raw.slice(4)
      : raw;
    if (el.value !== pretty) {
      /* how many real characters sat before the caret, counted without the
         dashes, so it lands in the same place in the new string */
      const before = el.value.slice(0, el.selectionStart || 0).replace(/[^0-9A-Z]/gi, "").length;
      el.value = pretty;
      let at = 0, seen = 0;
      while (at < pretty.length && seen < before) { if (pretty[at] !== "-") seen++; at++; }
      /* and never in front of a dash the field just added, or the next
         keystroke types on the wrong side of it */
      while (pretty[at] === "-") at++;
      try { el.setSelectionRange(at, at); } catch { /* not a text field */ }
    }
    ui.joinSheet = { ...ui.joinSheet, code: pretty, error: null };
    const btn = document.querySelector('[data-action="join-go"]');
    if (btn) { const ok = raw.length === 10; btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
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
    else {
      /* Re-filing a lift re-points what it is logged in, unless it was
         carrying an exception, which is the whole point of an exception.
         withKind drops an override that the new group makes redundant. */
      ui.exWinDraft = withKind({ ...ui.exWinDraft, muscle: v }, ui.exWinDraft.kind);
      render();
    }
  } else if (bind === "profileName") {
    ui.profileForm.name = v;
    const btn = document.querySelector('[data-action="profile-form-save"]');
    if (btn && ui.profileForm.mode === "rename") { const ok = !!v.trim(); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
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
    if (btn) { const ok = exDraftReady(ui.exWinDraft); btn.disabled = !ok; btn.style.opacity = ok ? 1 : 0.45; }
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
    readImageScaled(file, (dataUrl) => { ui.exWinDraft.image = dataUrl; delete ui.exWinDraft.imageMissing; render(); });
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

/* ── and the sync engine ──────────────────────────────────────────────
   After the first paint, never before it: the app has to be on screen in
   whatever state it already has, and a network round trip is not
   something a launch should wait behind. */
(function startSync() {
  /* Anybody already holding a read-only copy from before live profiles
     existed is moved over here. It is a cache of somebody else's log and
     it comes straight back from the server, so nothing of theirs is lost;
     what it buys is the space it was taking up, which on the phone this
     was built for is the entire point. */
  for (const p of profileList()) {
    const rec = syncFor(p.id);
    if (rec && rec.level === "read" && !rec.live) liveAdopt(p.id);
  }
  if (syncLive(activeProfileId())) liveEnter(activeProfileId());
  else syncQuiet();          // catch up on whatever the other phone did while this one was shut
  /* and the list itself, which is what makes a device that has just been
     signed in to come up holding the account's profiles rather than its own */
  rosterSync({ force: true });
  syncPollStart();
})();
