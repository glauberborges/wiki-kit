// The 11-rule lint registry — ordered and named on purpose (CLAUDE.md's own
// convention: adding a check means adding one entry here, nothing else).
// Stdlib only: `node:child_process` for git, `node:fs`/`node:path` for the
// filesystem checks.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expandSource, globToRegExp } from "./pages.js";
/**
 * Indicators the YAML spec reserves — a plain scalar can't start with one of
 * these. The backtick is what bites in practice: a `description` starting
 * with `` ` `` is common in technical prose and breaks the Docusaurus build.
 */
const YAML_INDICATORS = "`@&*!|>%,[]{}#?";
/** Categories that document code and, by default, must declare `sources:`. */
const DEFAULT_SOURCE_REQUIRED_CATEGORIES = ["architecture", "reference"];
export const RULES = [
    {
        name: "yaml-safe",
        // This module's own front-matter parser is deliberately tolerant (no
        // YAML dependency, per CLAUDE.md invariant #1); Docusaurus's isn't.
        // Without this rule, lint goes green and the site build breaks — which
        // defeats the point of a lint that's supposed to cost nothing to run.
        describe: "front-matter value that Docusaurus's strict YAML parser rejects",
        run(pages, ctx) {
            for (const page of pages) {
                for (const line of (page.rawHead ?? "").split("\n")) {
                    const m = /^([A-Za-z_][\w-]*)\s*:\s+(\S.*)$/.exec(line);
                    if (!m)
                        continue;
                    const [, key, rawValue] = m;
                    const value = rawValue.trim();
                    if (value[0] === '"' || value[0] === "'" || value[0] === "{" || value[0] === "[")
                        continue;
                    if (YAML_INDICATORS.includes(value[0])) {
                        ctx.report(page, `\`${key}:\` starts with \`${value[0]}\`, a reserved YAML indicator — use double quotes`, "error");
                    }
                    else if (/:\s/.test(value)) {
                        ctx.report(page, `\`${key}:\` has \`: \` in the value — use double quotes`, "error");
                    }
                }
            }
        },
    },
    {
        name: "okf-type",
        describe: "OKF requires a non-empty `type` on every concept page",
        run(pages, ctx) {
            for (const page of pages) {
                if (page.reserved)
                    continue;
                const t = page.data.type;
                if (typeof t !== "string" || t.trim() === "") {
                    ctx.report(page, "missing `type:` in front matter (the only field OKF requires)", "error");
                }
            }
        },
    },
    {
        name: "title",
        describe: "every page needs a title",
        run(pages, ctx) {
            for (const page of pages) {
                if (!page.data.title && !/^#\s+/m.test(page.body)) {
                    ctx.report(page, "no `title:` in front matter and no `#` heading in the body", "error");
                }
            }
        },
    },
    {
        name: "sources-present",
        describe: "pages that document code declare their sources",
        run(pages, ctx) {
            const applyTo = ctx.config.rules["sources-present"]?.["apply-to"] ?? DEFAULT_SOURCE_REQUIRED_CATEGORIES;
            for (const page of pages) {
                if (page.reserved || !applyTo.includes(page.category))
                    continue;
                if (page.sources.length === 0) {
                    ctx.report(page, "no `sources:` — without it, ingest has no way to tell when this page went stale", "error");
                }
            }
        },
    },
    {
        name: "sources-exist",
        describe: "every declared source matches a tracked file",
        run(pages, ctx) {
            for (const page of pages) {
                for (const pattern of page.sources) {
                    if (expandSource(pattern, ctx.repoRoot).length === 0) {
                        ctx.report(page, `\`${pattern}\` matches no tracked file (renamed or removed?)`, "error");
                    }
                }
            }
        },
    },
    {
        name: "staleness",
        describe: "the source changed after the page",
        run(pages, ctx) {
            for (const page of pages) {
                if (page.sources.length === 0)
                    continue;
                const pageTs = lastCommit(ctx.repoRoot, page.repoRel);
                if (pageTs === null)
                    continue; // not committed yet
                const newer = [];
                for (const pattern of page.sources) {
                    for (const file of expandSource(pattern, ctx.repoRoot)) {
                        const ts = lastCommit(ctx.repoRoot, file);
                        if (ts !== null && ts > pageTs)
                            newer.push(file);
                    }
                }
                if (newer.length) {
                    const shown = newer.slice(0, 5).join(", ");
                    const more = newer.length > 5 ? ` (+${newer.length - 5})` : "";
                    ctx.report(page, `sources changed after the page: ${shown}${more}`, "warn");
                }
            }
        },
    },
    {
        name: "stale-after",
        describe: "the front matter's declared validity has expired",
        run(pages, ctx) {
            const today = new Date().toISOString().slice(0, 10);
            for (const page of pages) {
                const when = page.data.stale_after;
                if (typeof when === "string" && when < today) {
                    ctx.report(page, `\`stale_after: ${when}\` has already passed — review and update the date`, "warn");
                }
            }
        },
    },
    {
        name: "unverified",
        describe: "page written by an agent with no human verification",
        run(pages, ctx) {
            for (const page of pages) {
                const generated = page.data.generated;
                const by = generated?.by;
                if (typeof by !== "string")
                    continue;
                const isAgent = !by.startsWith("human:");
                const verified = Array.isArray(page.data.verified) ? page.data.verified : [];
                if (isAgent && verified.length === 0) {
                    ctx.report(page, `generated by \`${by}\` and still has no \`verified:\` — nobody has checked it`, "warn");
                }
            }
        },
    },
    {
        name: "orphan",
        describe: "page unreachable from the sidebar",
        run(pages, ctx) {
            for (const page of pages) {
                // The sidebar is autogenerated: a page only disappears from it when
                // marked draft/unlisted, or sits in a directory with no
                // _category_.json at the expected level.
                if (page.data.draft === true || page.data.unlisted === true) {
                    ctx.report(page, "marked draft/unlisted — doesn't show up in the sidebar or llms.txt", "warn");
                }
            }
        },
    },
    {
        name: "workspace-absorbed",
        // Only fires in a monorepo with npm/pnpm/yarn workspaces. wiki/ ships its
        // own package.json; if the host repo's workspaces glob reaches it, the
        // package manager hoists Docusaurus's deps (React 19) into the root
        // node_modules, where they collide with the monorepo's own versions. The
        // failure surfaces far from here — in a root `npm install` — and is nasty
        // to diagnose, which is what makes the cheap warning worth it.
        describe: "the monorepo's workspaces glob absorbs wiki/",
        run(pages, ctx) {
            const rootPkg = path.join(ctx.repoRoot, "package.json");
            if (!fs.existsSync(rootPkg))
                return;
            let workspaces;
            try {
                const parsed = JSON.parse(fs.readFileSync(rootPkg, "utf8")).workspaces;
                workspaces = Array.isArray(parsed) ? parsed : parsed?.packages;
            }
            catch {
                return;
            }
            if (!Array.isArray(workspaces))
                return;
            const wikiRel = path.relative(ctx.repoRoot, ctx.wikiDir).split(path.sep).join("/");
            const absorbs = workspaces.some((glob) => globToRegExp(String(glob)).test(wikiRel));
            if (!absorbs)
                return;
            const target = pages[0];
            if (!target)
                return;
            ctx.report(target, `the root package.json's workspaces glob reaches \`${wikiRel}/\` — exclude it ` +
                `(e.g. \`"!${wikiRel}"\`) or narrow the glob, or the site's dependencies get hoisted ` +
                `to the root and collide with the monorepo's`, "warn");
        },
    },
    {
        name: "links",
        describe: "relative links to .md/.mdx point at pages that exist",
        run(pages, ctx) {
            for (const page of pages) {
                for (const target of relativeLinks(page.body)) {
                    const resolved = path.resolve(path.dirname(page.file), target.replace(/[#?].*$/, ""));
                    if (!fs.existsSync(resolved)) {
                        ctx.report(page, `broken link: \`${target}\``, "error");
                    }
                }
            }
        },
    },
];
// ---------------------------------------------------------------------------
// Keyed by repoRoot+path, not just path — repoRoot is a parameter here (no
// module-level constant to pin it), so two different repos in the same test
// run must not share cache entries. Mirrors pages.ts's trackedCache pattern.
const commitCache = new Map();
/** Timestamp of the last commit touching the path. `null` if there's none. */
function lastCommit(repoRoot, repoRelPath) {
    const key = `${repoRoot} ${repoRelPath}`;
    const cached = commitCache.get(key);
    if (cached !== undefined)
        return cached;
    let ts = null;
    try {
        const out = execFileSync("git", ["log", "-1", "--format=%ct", "--", repoRelPath], {
            cwd: repoRoot,
            encoding: "utf8",
        }).trim();
        ts = out ? Number(out) : null;
    }
    catch {
        ts = null;
    }
    commitCache.set(key, ts);
    return ts;
}
function relativeLinks(body) {
    const out = [];
    const re = /\[[^\]]*\]\((\.{1,2}\/[^)\s]+\.mdx?(?:[#?][^)\s]*)?)\)/g;
    let m;
    while ((m = re.exec(body)) !== null)
        out.push(m[1]);
    return out;
}
/**
 * Runs every rule in `RULES` against `pages`, resolving each finding's
 * severity from `config.rules[name].severity` (falling back to the rule's
 * own default) and skipping the rule entirely when configured `"off"`.
 * The single place that turns the registry into results — commands built on
 * top of this (e.g. `wiki-kit lint`) just format `LintFinding[]`.
 */
export function runLintRules(pages, repoRoot, wikiDir, config) {
    const findings = [];
    for (const rule of RULES) {
        const configured = config.rules[rule.name]?.severity;
        if (configured === "off")
            continue;
        const ctx = {
            repoRoot,
            wikiDir,
            config,
            report(page, message, defaultSeverity) {
                findings.push({ rule: rule.name, severity: configured ?? defaultSeverity, page, message });
            },
        };
        rule.run(pages, ctx);
    }
    return findings;
}
