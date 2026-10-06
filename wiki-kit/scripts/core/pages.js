// Page loading, sidebar ordering, and sources: glob resolution → pages.
// Shared by lint, affected, and llms. Stdlib only.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readFrontMatter, splitFrontMatter } from "./frontmatter.js";
/** Page names reserved by the OKF (not concept documents). */
const RESERVED = new Set(["index.md", "log.md"]);
/**
 * Walks up from `cwd` to the nearest `.git` entry. A linked worktree's
 * `.git` is a *file* holding a `gitdir:` pointer, not a directory — plain
 * `existsSync` covers both without assuming which one it is.
 */
export function findRepoRoot(cwd) {
    let dir = path.resolve(cwd);
    while (true) {
        if (fs.existsSync(path.join(dir, ".git")))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir) {
            throw new Error(`No .git found walking up from ${cwd} to the filesystem root — run wiki-kit inside a git repository.`);
        }
        dir = parent;
    }
}
function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            out.push(...walk(full));
        else if (entry.name.endsWith(".md"))
            out.push(full);
    }
    return out;
}
function categoryMeta(dir) {
    const file = path.join(dir, "_category_.json");
    if (!fs.existsSync(file))
        return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch {
        return null;
    }
}
function firstHeading(body) {
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
export function loadPages(wikiDir) {
    const docsDir = path.join(wikiDir, "docs");
    if (!fs.existsSync(docsDir))
        return [];
    // Mirrors the reference's `REPO_ROOT = path.resolve(WIKI_DIR, "..")`, now
    // derived from the caller-supplied wikiDir instead of the module's own
    // location (findRepoRoot's contract: wikiDir === path.join(repoRoot, "wiki")).
    const repoRoot = path.dirname(wikiDir);
    const pages = walk(docsDir).map((file) => {
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
            title: data.title ?? firstHeading(body) ?? path.basename(rel, ".md"),
            description: data.description ?? "",
            sources: normalizeSources(data.sources),
            position: data.sidebar_position ?? 999,
        };
    });
    return pages.sort((a, b) => a.categoryPosition - b.categoryPosition ||
        a.category.localeCompare(b.category) ||
        a.position - b.position ||
        a.rel.localeCompare(b.rel));
}
/**
 * `sources` accepts both forms: the OKF canonical one (`- resource: glob`)
 * and the abbreviated one (`- glob`). Normalizes to a list of strings.
 */
export function normalizeSources(raw) {
    if (!raw)
        return [];
    const list = Array.isArray(raw) ? raw : [raw];
    return list
        .map((item) => (typeof item === "string" ? item : item?.resource))
        .filter((s) => typeof s === "string" && s.trim() !== "")
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
const trackedCache = new Map();
export function trackedFiles(repoRoot) {
    const cached = trackedCache.get(repoRoot);
    if (cached)
        return cached;
    let files;
    try {
        const out = execFileSync("git", ["ls-files", "-z"], {
            cwd: repoRoot,
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
        });
        files = out.split("\0").filter(Boolean);
    }
    catch {
        files = [];
    }
    trackedCache.set(repoRoot, files);
    return files;
}
/** Glob → RegExp. Supports `*` (within a segment), `**` (crosses), and `?`. */
export function globToRegExp(glob) {
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
                }
                else {
                    // `**` at the end matches the rest, separators included — this is
                    // how `internal/**` (idiomatic in Go) picks up nested files.
                    re += ".*";
                }
            }
            else {
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
export function expandSource(pattern, repoRoot) {
    const files = trackedFiles(repoRoot);
    const hasMagic = /[*?]/.test(pattern);
    if (!hasMagic) {
        const exact = files.filter((f) => f === pattern);
        if (exact.length)
            return exact;
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
export function buildSourceMap(pages, repoRoot) {
    const map = new Map();
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
