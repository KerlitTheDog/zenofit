/* Shared by docs-nudge.js and check-docs.js: which code names the docs
   mention, and the code those names are looked up in.

   The docs' one convention that makes this work (CLAUDE.md, Docs): a name
   in backticks exists in the code today, and a removed name is written
   without them. So every backticked name is either a pointer into the code
   (which the nudge uses) or a stale claim (which the check reports). */
"use strict";
const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set([".git", "node_modules", ".wrangler"]);
const CODE_EXT = new Set([".js", ".css", ".html", ".json", ".toml", ".py", ".sql", ".yml", ".yaml", ".webmanifest", ".txt"]);

function walk(root, rel = "", out = []) {
  let entries;
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walk(root, r, out);
    else out.push(r);
  }
  return out;
}

const isDoc = (rel) => rel === "CLAUDE.md" || /^docs\/[^/]+\.md$/.test(rel) || /^\.claude\/rules\/.+\.md$/.test(rel);

/* The files whose names count as "in the code": everything that is not one
   of the docs themselves (so a name cannot vouch for itself). The test
   README counts, being where the suites' flags are defined. */
function codeFiles(root) {
  return walk(root).filter((r) => !isDoc(r) && !r.endsWith(".local.md") &&
    (CODE_EXT.has(path.extname(r)) || r === "api/test/README.md"));
}

function docFiles(root) {
  return walk(root).filter(isDoc).sort();
}

const read = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };

/* Every `span` in a Markdown file, with its line, skipping fenced blocks. */
function backticked(text) {
  const out = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let fenced = false;
  lines.forEach((ln, i) => {
    if (/^\s*```/.test(ln)) { fenced = !fenced; return; }
    if (fenced) return;
    for (const m of ln.matchAll(/`([^`]+)`/g)) out.push({ span: m[1], line: i + 1 });
  });
  return out;
}

const PATHISH = /^[\w.\-/]+\.(?:js|md|css|html|toml|json|py|sql|ya?ml|woff2|png|webmanifest|txt)$|^[\w.\-]+\/$/;

/* What a span claims exists. Returns [{kind, name}]:
   path   a file or folder, checked on disk
   css    a custom property such as --pb-sab
   name   an identifier (camelCase, CONSTANT_CASE, snake_case, dotted) or an
          action name (kebab-case), five characters or more */
function claims(span) {
  const s = span.trim();
  if (!s || /\s{2,}/.test(s)) return [];
  if (/^--[a-z0-9-]+$/.test(s)) return [{ kind: "css", name: s }];
  if (PATHISH.test(s) && !s.includes("*")) return [{ kind: "path", name: s }];
  const out = [];
  for (const m of s.matchAll(/(?<![\w$.-])[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?![\w$])/g)) {
    const t = m[0];
    if (t.length < 5) continue;
    if (/[a-z][A-Z]|^[A-Z][A-Z0-9_]{3,}$|_|\./.test(t)) out.push({ kind: "name", name: t });
  }
  for (const m of s.matchAll(/(?<![\w$-])[a-z][a-z0-9]*(?:-[a-z0-9]+)+(?![\w$-])/g)) {
    if (m[0].length >= 5 && !m[0].startsWith("--")) out.push({ kind: "name", name: m[0] });
  }
  return out;
}

/* A dotted name like `ui.chartView` or `profiles.userId` is real when each
   part is; the whole string rarely appears as written. */
function nameExists(name, code) {
  if (code.includes(name)) return true;
  if (name.includes(".")) return name.split(".").every((p) => p.length < 3 || code.includes(p));
  return false;
}

/* name -> Set of docs/*.md that mention it, for the nudge. */
function docIndex(root) {
  const idx = new Map();
  for (const rel of docFiles(root)) {
    if (!rel.startsWith("docs/")) continue;
    for (const { span } of backticked(read(root, rel))) {
      for (const c of claims(span)) {
        if (c.kind !== "name") continue;
        for (const part of c.name.split(".")) {
          if (part.length < 5 || !/[a-z][A-Z]|^[A-Z][A-Z0-9_]{3,}$|_|-/.test(part)) continue;
          if (!idx.has(part)) idx.set(part, new Set());
          idx.get(part).add(rel);
        }
      }
    }
  }
  return idx;
}

module.exports = { walk, codeFiles, docFiles, read, backticked, claims, nameExists, docIndex };
