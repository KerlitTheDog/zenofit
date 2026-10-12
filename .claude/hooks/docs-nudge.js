/* The reminder that keeps "read the right doc" from depending on memory.

   Wired in .claude/settings.json: before an Edit or Write, and after a Read.
   It looks at the code being changed (or the lines just read), finds the
   names the docs mention, and when those point at a doc that has not been
   read in this session, says which one, once. It never blocks anything,
   and anything that goes wrong here exits quietly: a reminder must not be
   the reason an edit fails.

   Reading a doc with the Read tool marks it read for the rest of the
   session, which is what silences it. State is one small file per session
   in the system temp folder. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("./docs-lib.js");

const CODE_FILE = /(^|\/)(app|zenofit-cloud|sw|sw-register|theme)\.js$|^api\/src\/[^/]+\.js$|(^|\/)styles\.css$|(^|\/)index\.html$/;
const MAX_DOCS = 2;          // reminders per tool call, most relevant first
const READ_SCORE = 3;        // a read has to be clearly about an area
const EDIT_SCORE = 1;        // an edit is targeted, so one telling name will do

function main(input) {
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const event = input.hook_event_name;
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const abs = ti.file_path ? path.resolve(ti.file_path) : "";
  const rel = abs ? path.relative(root, abs).split(path.sep).join("/") : "";
  if (rel.startsWith("..")) return;

  const stateFile = path.join(os.tmpdir(), "zenofit-docs", String(input.session_id || "nosession") + ".json");
  let st = { read: [], told: [] };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(stateFile, "utf8")) }; } catch { /* first call this session */ }
  const save = () => { try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(st)); } catch { /* best effort */ } };

  // Reading a doc is what the reminders are asking for: it silences that doc.
  if (event === "PostToolUse" && tool === "Read" && /^docs\/[^/]+\.md$/.test(rel)) {
    if (!st.read.includes(rel)) { st.read.push(rel); save(); }
    return;
  }
  if (!CODE_FILE.test(rel)) return;

  let text = "", minScore = EDIT_SCORE, verb = "edit";
  if (event === "PreToolUse") {
    if (tool === "Edit") text = (ti.old_string || "") + "\n" + (ti.new_string || "");
    else if (tool === "Write") text = ti.content || "";
    else if (tool === "MultiEdit") text = (ti.edits || []).map((e) => (e.old_string || "") + "\n" + (e.new_string || "")).join("\n");
    else return;
  } else if (event === "PostToolUse" && tool === "Read") {
    const lines = lib.read(root, rel).split(/\r?\n/);
    const from = Math.max(0, (Number(ti.offset) || 1) - 1);
    text = lines.slice(from, from + (Number(ti.limit) || 2000)).join("\n");
    minScore = READ_SCORE; verb = "read";
  } else return;
  if (!text) return;

  const idx = lib.docIndex(root);
  const seen = new Set(text.match(/[A-Za-z_$][\w$]*|[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g) || []);
  const score = new Map(), names = new Map();
  for (const n of seen) {
    const docs = idx.get(n);
    if (!docs || docs.size > 2) continue;           // a name every doc mentions points nowhere
    for (const d of docs) {
      score.set(d, (score.get(d) || 0) + (docs.size === 1 ? 1 : 0.5));
      if (!names.has(d)) names.set(d, []);
      names.get(d).push(n);
    }
  }
  const due = [...score.entries()]
    .filter(([d, s]) => s >= minScore && !st.read.includes(d) && !st.told.includes(d))
    .sort((a, b) => b[1] - a[1]).slice(0, MAX_DOCS).map(([d]) => d);
  if (!due.length) return;

  st.told.push(...due); save();
  const lines = due.map((d) => {
    const ns = names.get(d).slice(0, 4).map((n) => "`" + n + "`").join(", ");
    return `- ${d} (this ${verb} touches ${ns})`;
  });
  const msg = `Docs reminder: this ${verb} is in an area described in a doc you have not read in this session:\n${lines.join("\n")}\n` +
    `Read it in full before changing how that area behaves (CLAUDE.md, Docs). A comment-only or wording-only edit does not need it. This reminder shows once per doc per session.`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: msg } }));
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { buf += c; });
process.stdin.on("end", () => {
  try { main(JSON.parse(buf || "{}")); } catch { /* never in the way */ }
  process.exit(0);
});
