/* The docs check: what keeps CLAUDE.md, docs/ and .claude/rules/ true.

     node .claude/hooks/check-docs.js          a report, exit 1 if anything is wrong
     node .claude/hooks/check-docs.js --hook   wired before every Bash/PowerShell call:
                                               silent unless the command commits or
                                               pushes, and then refuses it while
                                               something is wrong

   What it checks, and why each one is here:
   - every backticked name in the docs exists in the code (a backticked name
     is a claim that it does; a stale one is how a doc starts lying)
   - no {{ or {% in any Markdown file (GitHub Pages builds the repo with
     Jekyll, and a Liquid tag fails the build that publishes the app)
   - the index in CLAUDE.md and the files in docs/ agree
   - every file stays inside its size budget, so a doc can be read whole
     and CLAUDE.md stays cheap to load into every session
   - every .claude/rules file is scoped with `paths:` (an unscoped one would
     load into every session, which is CLAUDE.md's job)

   ZENOFIT_SKIP_DOCS_CHECK=1 anywhere in the command lets a commit or a push
   through regardless: for an emergency, said out loud. */
"use strict";
const path = require("path");
const lib = require("./docs-lib.js");

const BUDGET = { claude: 24 * 1024, claudeLines: 200, doc: 30 * 1024, rule: 10 * 1024 };

function check(root) {
  const problems = [];
  const code = lib.codeFiles(root).map((r) => lib.read(root, r)).join("\n");
  const all = lib.walk(root);
  const allSet = new Set(all);
  const base = new Set(all.map((r) => r.split("/").pop()));
  const docs = lib.docFiles(root);

  for (const rel of docs) {
    const text = lib.read(root, rel);
    for (const { span, line } of lib.backticked(text)) {
      for (const c of lib.claims(span)) {
        let ok;
        if (c.kind === "path") {
          const p = c.name.replace(/\/$/, "");
          ok = allSet.has(p) || allSet.has("api/" + p) || all.some((r) => r.startsWith(p + "/") || r.startsWith("api/" + p + "/")) || base.has(p) || code.includes(p);
        } else if (c.kind === "css") ok = code.includes(c.name);
        else ok = lib.nameExists(c.name, code);
        if (!ok) problems.push(`${rel}:${line}: \`${c.name}\` is not in the code any more (fix the doc, or drop the backticks if it is gone on purpose)`);
      }
    }
    const bytes = Buffer.byteLength(text);
    if (rel === "CLAUDE.md") {
      const lines = text.split(/\r?\n/).length;
      if (bytes > BUDGET.claude) problems.push(`CLAUDE.md is ${Math.round(bytes / 1024)} KB, over its ${BUDGET.claude / 1024} KB budget: move detail into docs/`);
      if (lines > BUDGET.claudeLines) problems.push(`CLAUDE.md is ${lines} lines, over ${BUDGET.claudeLines}`);
    } else if (rel.startsWith("docs/") && bytes > BUDGET.doc) {
      problems.push(`${rel} is ${Math.round(bytes / 1024)} KB, over the ${BUDGET.doc / 1024} KB a doc may be: split it and add the new file to the index`);
    } else if (rel.startsWith(".claude/rules/")) {
      if (bytes > BUDGET.rule) problems.push(`${rel} is ${Math.round(bytes / 1024)} KB, over ${BUDGET.rule / 1024} KB: rules are short, detail belongs in docs/`);
      if (!/^---\r?\n[\s\S]*?\bpaths:/.test(text)) problems.push(`${rel} has no \`paths:\` frontmatter, so it would load into every session`);
    }
  }

  // Jekyll: any Markdown it would build (it skips dot-folders and gitignored local notes)
  for (const rel of all) {
    if (!rel.endsWith(".md") || rel.endsWith(".local.md") || rel.split("/").some((s) => s.startsWith("."))) continue;
    const t = lib.read(root, rel);
    if (t.includes("{{") || t.includes("{%")) problems.push(`${rel} contains {{ or {%: GitHub Pages' Jekyll build would fail on it`);
  }

  // the index and the folder agree
  const claude = lib.read(root, "CLAUDE.md");
  const listed = new Set([...claude.matchAll(/docs\/[a-z0-9-]+\.md/g)].map((m) => m[0]));
  for (const d of listed) if (!allSet.has(d)) problems.push(`CLAUDE.md points at ${d}, which does not exist`);
  for (const d of docs.filter((r) => r.startsWith("docs/"))) if (!listed.has(d)) problems.push(`${d} is not in the index in CLAUDE.md (add a row under Docs)`);

  return problems;
}

function main(argv, stdin) {
  const hook = argv.includes("--hook");
  let root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (hook) {
    let input = {};
    try { input = JSON.parse(stdin || "{}"); } catch { return 0; }
    const cmd = String((input.tool_input || {}).command || "");
    if (!/\bgit\b[^\n]*?\b(commit|push)\b/.test(cmd) || /ZENOFIT_SKIP_DOCS_CHECK/.test(cmd)) return 0;
    root = process.env.CLAUDE_PROJECT_DIR || input.cwd || root;
    const problems = check(root);
    if (!problems.length) return 0;
    const reason = `The docs check found ${problems.length} problem${problems.length > 1 ? "s" : ""}, so this commit/push is held back. Fix them first (CLAUDE.md, Docs), then run the command again:\n` +
      problems.slice(0, 25).map((p) => "- " + p).join("\n") + (problems.length > 25 ? `\n- and ${problems.length - 25} more (run node .claude/hooks/check-docs.js)` : "") +
      `\nOnly in a real emergency: put ZENOFIT_SKIP_DOCS_CHECK=1 in the command, say so, and fix the docs straight after.`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
    return 0;
  }
  const problems = check(root);
  if (!problems.length) { console.log("docs check: all clear"); return 0; }
  console.log(`docs check: ${problems.length} problem${problems.length > 1 ? "s" : ""}`);
  for (const p of problems) console.log("  " + p);
  return 1;
}

if (process.argv.includes("--hook")) {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { buf += c; });
  process.stdin.on("end", () => {
    let code = 0;
    try { code = main(process.argv, buf); } catch { code = 0; }   // a broken check never blocks work
    process.exit(code);
  });
} else {
  process.exitCode = main(process.argv, "");
}
