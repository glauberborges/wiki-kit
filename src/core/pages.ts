// Page loading, sidebar ordering, and sources: glob resolution → pages.
// Shared by lint, affected, and llms. Stdlib only.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readFrontMatter, splitFrontMatter } from "./frontmatter.js";

export interface Page {
  file: string; // absolute path
  rel: string; // relative to docs dir, posix separators
  repoRel: string; // relative to repo root — what lint reports and git sees
  slug: string;
  category: string;
  categoryLabel: string;
  categoryPosition: number;
  reserved: boolean; // index.md / log.md
  data: Record<string, unknown>;
  body: string;
  rawHead: string; // unparsed front-matter block, used by yaml-safe
  title: string;
  description: string;
  sources: string[];
  position: number; // sidebar_position
}

interface CategoryMeta {
  label?: string;
  position?: number;
}

/** Page names reserved by the OKF (not concept documents). */
const RESERVED = new Set(["index.md", "log.md"]);

/**
 * Walks up from `cwd` to the nearest `.git` entry. A linked worktree's
 * `.git` is a *file* holding a `gitdir:` pointer, not a directory — plain
 * `existsSync` covers both without assuming which one it is.
 */
export function findRepoRoot(cwd: string): string {
  let dir = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `No .git found walking up from ${cwd} to the filesystem root — run wiki-kit inside a git repository.`,
      );
    }
    dir = parent;
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function categoryMeta(dir: string): CategoryMeta | null {
  const file = path.join(dir, "_category_.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CategoryMeta;
  } catch {
    return null;
  }
}

function firstHeading(body: string): string | null {
  const m = /^#\s+(.+)$/m.exec(body);
  return m ? m[1].trim() : null;
}

/**
 * Every page under `wikiDir`/docs, in Docusaurus sidebar order: categories
 * by `position` in `_category_.json`, pages by `sidebar_position`. The root
 * (where index.md lives) sorts first.
 *
 * `wikiDir` is a parameter, not a module-level constant — see
 * `findRepoRoot`. Callers pass `path.join(findRepoRoot(cwd), "wiki")`.
 */
export function loadPages(wikiDir: string): Page[] {
  const docsDir = path.join(wikiDir, "docs");
  if (!fs.existsSync(docsDir)) return [];

  // Mirrors the reference's `REPO_ROOT = path.resolve(WIKI_DIR, "..")`, now
  // derived from the caller-supplied wikiDir instead of the module's own
  // location (findRepoRoot's contract: wikiDir === path.join(repoRoot, "wiki")).
  const repoRoot = path.dirname(wikiDir);

  const pages: Page[] = walk(docsDir).map((file) => {
    const rel = path.relative(docsDir, file).split(path.sep).join("/");
    const dir = path.dirname(file);
    const category = path.relative(docsDir, dir).split(path.sep).join("/") || ".";
    const meta = categoryMeta(dir);
    const text = fs.readFileSync(file, "utf8");
    const { data, body } = readFrontMatter(text);
    const [rawHead] = splitFrontMatter(text);

    return {
      file,
      rel,
      repoRel: path.relative(repoRoot, file).split(path.sep).join("/"),
      slug: rel.replace(/\.md$/, ""),
      category,
      categoryLabel: meta?.label ?? (category === "." ? "" : category),
      categoryPosition: meta?.position ?? (category === "." ? 0 : 999),
      reserved: RESERVED.has(path.basename(file)),
      data,
      body,
      rawHead,
      title: (data.title as string | undefined) ?? firstHeading(body) ?? path.basename(rel, ".md"),
      description: (data.description as string | undefined) ?? "",
      sources: normalizeSources(data.sources),
      position: (data.sidebar_position as number | undefined) ?? 999,
    };
  });

  return pages.sort(
    (a, b) =>
      a.categoryPosition - b.categoryPosition ||
      a.category.localeCompare(b.category) ||
      a.position - b.position ||
      a.rel.localeCompare(b.rel),
  );
}

/**
 * `sources` accepts both forms: the OKF canonical one (`- resource: glob`)
 * and the abbreviated one (`- glob`). Normalizes to a list of strings.
 */
export function normalizeSources(raw: unknown): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((item) => (typeof item === "string" ? item : (item as { resource?: unknown } | null)?.resource))
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => s.trim());
}

/**
 * Files tracked by git. Using `git ls-files` instead of walking the disk is
 * what keeps the kit language-neutral — it respects the target repo's
 * .gitignore for free, so we never need to know that Go ignores `bin/`, PHP
 * ignores `vendor/`, Node ignores `node_modules/`.
 *
 * Cached per `repoRoot` (not a single flat cache like the reference) since
 * `repoRoot` is now a parameter, not a module-level constant fixed once per
 * process.
 */
const trackedCache = new Map<string, string[]>();

export function trackedFiles(repoRoot: string): string[] {
  const cached = trackedCache.get(repoRoot);
  if (cached) return cached;

  let files: string[];
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    files = out.split("\0").filter(Boolean);
  } catch {
    files = [];
  }

  trackedCache.set(repoRoot, files);
  return files;
}

/** Glob → RegExp. Supports `*` (within a segment), `**` (crosses), and `?`. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          // `**/` consumes zero or more directory segments.
          i++;
          re += "(?:[^/]+/)*";
        } else {
          // `**` at the end matches the rest, separators included — this is
          // how `internal/**` (idiomatic in Go) picks up nested files.
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      continue;
    }
    re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/**
 * Expands a `sources` pattern against tracked files. A pattern with no
 * metacharacters that points at a directory matches everything below it —
 * so `internal/workflow` works in a Go repo without requiring `/**`.
 */
export function expandSource(pattern: string, repoRoot: string): string[] {
  const files = trackedFiles(repoRoot);
  const hasMagic = /[*?]/.test(pattern);
  if (!hasMagic) {
    const exact = files.filter((f) => f === pattern);
    if (exact.length) return exact;
    const prefix = pattern.endsWith("/") ? pattern : `${pattern}/`;
    return files.filter((f) => f.startsWith(prefix));
  }
  const re = globToRegExp(pattern);
  return files.filter((f) => re.test(f));
}

/**
 * Reverse index, code file → pages that document it. What `--affected`
 * queries, and what goes into map.json.
 */
export function buildSourceMap(pages: Page[], repoRoot: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const page of pages) {
    for (const pattern of page.sources) {
      for (const file of expandSource(pattern, repoRoot)) {
        let slugs = map.get(file);
        if (!slugs) {
          slugs = new Set();
          map.set(file, slugs);
        }
        slugs.add(page.slug);
      }
    }
  }
  return map;
}
