// Minimal YAML front-matter parser — stdlib only.
//
// Why not `gray-matter`: wiki-kit's verification path runs with plain `node`,
// with NO `npm install`, so lint costs nothing in a Go or PHP repo (see
// CLAUDE.md invariant #1). Adding a dependency would kill that property. The
// subset below covers what Docusaurus + OKF front-matter actually uses;
// anything beyond that is returned as a raw string instead of throwing.

/** Splits the file into [frontmatter, body]. No front-matter → ["", text]. */
export function splitFrontMatter(text: string): [head: string, body: string] {
  const src = text.replace(/^﻿/, "");
  if (!src.startsWith("---")) return ["", src];
  const end = src.indexOf("\n---", 3);
  if (end === -1) return ["", src];
  const head = src.slice(src.indexOf("\n") + 1, end);
  const rest = src.slice(end + 4).replace(/^[^\n]*\n?/, "");
  return [head, rest];
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** YAML scalar → JS. Dates stay as strings (compared lexicographically). */
function scalar(raw: string): string | number | boolean | null {
  const t = raw.trim();
  if (t === "" || t === "~" || t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  return stripQuotes(t);
}

/** `{a: 1, b: x}` → object. Used by `generated: {by: ..., at: ...}`. */
function inlineMap(raw: string): Record<string, unknown> {
  const body = raw.trim().slice(1, -1);
  const out: Record<string, unknown> = {};
  for (const part of splitTopLevel(body)) {
    const i = part.indexOf(":");
    if (i === -1) continue;
    out[stripQuotes(part.slice(0, i))] = inlineValue(part.slice(i + 1));
  }
  return out;
}

/** Dispatches a raw inline value by its leading character — same rule the
 * top-level parser uses, so `{severity: error, apply-to: [a, b]}` resolves
 * `apply-to` to an array instead of the literal string `"[a, b]"`. */
function inlineValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) return inlineList(trimmed);
  if (trimmed.startsWith("{")) return inlineMap(trimmed);
  return scalar(trimmed);
}

/** `[a, b]` → array. Items shaped like `{...}` or `[...]` recurse. */
function inlineList(raw: string): unknown[] {
  const body = raw.trim().slice(1, -1);
  if (!body.trim()) return [];
  return splitTopLevel(body).map((p) => inlineValue(p));
}

/** Comma-split that respects {} [] nesting and quotes. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const indentOf = (line: string): number => line.length - line.trimStart().length;

/**
 * Parses the front-matter block. Supports: scalars, inline and block lists,
 * inline maps, and block lists of maps (the format `sources:` uses in OKF).
 * Ignores comments and blank lines.
 */
export function parseFrontMatter(head: string): Record<string, unknown> {
  const lines = head.split("\n").filter((l) => l.trim() !== "" && !/^\s*#/.test(l));
  const out: Record<string, unknown> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const base = indentOf(line);
    const m = /^\s*([A-Za-z_][\w-]*)\s*:(.*)$/.exec(line);
    if (!m) { i++; continue; }

    const key = m[1];
    const inline = m[2].trim();
    i++;

    if (inline !== "") {
      out[key] = inlineValue(inline);
      continue;
    }

    // Nested block: collect the lines indented deeper than the key.
    const block: string[] = [];
    let j = i;
    while (j < lines.length && indentOf(lines[j]) > base) block.push(lines[j++]);
    i = j;

    if (block.length === 0) { out[key] = null; continue; }

    if (block[0].trimStart().startsWith("- ")) {
      out[key] = parseBlockList(block);
    } else {
      out[key] = parseFrontMatter(block.map((l) => l.slice(indentOf(block[0]))).join("\n"));
    }
  }

  return out;
}

/** Block list: scalar or map items (`- resource: x` / `- a: 1\n  b: 2`). */
function parseBlockList(block: string[]): unknown[] {
  const items: unknown[] = [];
  let cur: Record<string, unknown> | string | number | boolean | null = null;
  const itemIndent = indentOf(block[0]);

  for (const line of block) {
    const trimmed = line.trimStart();
    if (indentOf(line) === itemIndent && trimmed.startsWith("- ")) {
      if (cur !== null) items.push(cur);
      const rest = trimmed.slice(2).trim();
      if (rest.startsWith("{")) { items.push(inlineMap(rest)); cur = null; continue; }
      const kv = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(rest);
      cur = kv ? { [kv[1]]: scalar(kv[2]) } : scalar(rest);
      continue;
    }
    // Continuation of a map item.
    const kv = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(trimmed);
    if (kv && cur && typeof cur === "object") cur[kv[1]] = scalar(kv[2]);
  }
  if (cur !== null) items.push(cur);
  return items;
}

/** Convenience: file text → { data, body }. */
export function readFrontMatter(text: string): { data: Record<string, unknown>; body: string } {
  const [head, body] = splitFrontMatter(text);
  return { data: head ? parseFrontMatter(head) : {}, body };
}
