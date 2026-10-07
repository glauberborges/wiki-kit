import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { selectCi } from "./ci-select.js";
import { substitutePlaceholders } from "./placeholders.js";
const CONFIG_TEMPLATE_REL = "wiki-kit.config.yaml";
/**
 * Locates a sibling directory of this skill's package root (`wiki-kit/`),
 * e.g. `assets` or `scripts`. Two distinct runtime shapes resolve here:
 *
 * - Compiled, wherever the skill is installed: this file is
 *   `wiki-kit/scripts/init/scaffold.js` — the package root is two levels up.
 * - Dev/test, running `src/init/scaffold.ts` straight under vitest (never
 *   built): the package root is two levels up from `src/init`, i.e. this
 *   repo's own root, with `wiki-kit/` one level further in.
 *
 * Checking both and taking whichever exists avoids hardcoding which one is
 * live — `npm test`'s `pretest` build means both exist for tests, but only
 * the first candidate exists once this skill is copied elsewhere for real.
 */
function resolvePackageDir(name) {
    const here = dirname(fileURLToPath(import.meta.url));
    const compiled = join(here, "..", "..", name);
    if (existsSync(compiled))
        return compiled;
    const dev = join(here, "..", "..", "wiki-kit", name);
    if (existsSync(dev))
        return dev;
    throw new Error(`${name}/ not found near ${here} (checked ${compiled} and ${dev}) — run \`npm run build\`?`);
}
// The verification engine (core/) plus the 4 commands a target repo runs
// standalone. init/ is left out on purpose — detect-stack, ci-select and
// scaffold itself are only needed to run `init`, never again afterward.
const VERIFICATION_SCRIPT_DIRS = ["core", "commands"];
function walkFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory())
            out.push(...walkFiles(full));
        else
            out.push(full);
    }
    return out;
}
function withHubBlock(content, hub) {
    if (!hub)
        return content;
    const base = content.endsWith("\n") ? content : `${content}\n`;
    return `${base}hub:\n  repo: ${hub.repo}\n  branch: ${hub.branch}\n`;
}
function renderFile(absSrc, answers, wikiRelPath) {
    const raw = readFileSync(absSrc, "utf8");
    const rendered = raw.includes("{{") ? substitutePlaceholders(raw, answers) : raw;
    return wikiRelPath === CONFIG_TEMPLATE_REL ? withHubBlock(rendered, answers.hub) : rendered;
}
function makeEntry(repoRoot, absPath, content) {
    return { relPath: relative(repoRoot, absPath), absPath, content };
}
function buildPlan(repoRoot, answers, ci) {
    const assetsRoot = resolvePackageDir("assets");
    const entries = [];
    const wikiAssetRoot = join(assetsRoot, `wiki-${answers.engine}`);
    for (const absSrc of walkFiles(wikiAssetRoot)) {
        const rel = relative(wikiAssetRoot, absSrc);
        const absTarget = join(repoRoot, "wiki", rel);
        entries.push(makeEntry(repoRoot, absTarget, renderFile(absSrc, answers, rel)));
    }
    const agentSrc = join(assetsRoot, "claude", "agents", "wiki.md");
    entries.push(makeEntry(repoRoot, join(repoRoot, ".claude", "agents", "wiki.md"), renderFile(agentSrc, answers)));
    // Target filenames stay the same regardless of engine (.github/workflows/wiki.yml,
    // Jenkinsfile.wiki) — only the source template differs, same as the wiki-<engine>
    // asset tree above.
    if (ci === "github") {
        const src = join(assetsRoot, "github", `wiki-${answers.engine}.yml`);
        entries.push(makeEntry(repoRoot, join(repoRoot, ".github", "workflows", "wiki.yml"), renderFile(src, answers)));
    }
    else if (ci === "jenkins") {
        const src = join(assetsRoot, "jenkins", `Jenkinsfile.${answers.engine}.wiki`);
        entries.push(makeEntry(repoRoot, join(repoRoot, "Jenkinsfile.wiki"), renderFile(src, answers)));
    }
    entries.push(...collectScriptEntries(repoRoot));
    return entries;
}
/** Vendors the verification engine into `wiki/.wiki-kit/scripts/` — no placeholder rendering, copied as-is. */
function collectScriptEntries(repoRoot) {
    const scriptsRoot = resolvePackageDir("scripts");
    const entries = [];
    for (const dir of VERIFICATION_SCRIPT_DIRS) {
        const absDir = join(scriptsRoot, dir);
        if (!existsSync(absDir)) {
            throw new Error(`${absDir} not found — run \`npm run build\` before scaffolding a wiki.`);
        }
        for (const absSrc of walkFiles(absDir)) {
            const rel = relative(scriptsRoot, absSrc);
            const absTarget = join(repoRoot, "wiki", ".wiki-kit", "scripts", rel);
            entries.push(makeEntry(repoRoot, absTarget, readFileSync(absSrc, "utf8")));
        }
    }
    // Marks this subtree as ESM regardless of wiki/package.json (Docusaurus's,
    // which has no "type" field) — without it, Node falls back to reparsing
    // these .js files with a perf-cost warning on every single invocation.
    entries.push(makeEntry(repoRoot, join(repoRoot, "wiki", ".wiki-kit", "package.json"), '{\n  "type": "module"\n}\n'));
    return entries;
}
async function confirmOverwrite(files) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const list = files.map((f) => `  - ${f}`).join("\n");
        const answer = await rl.question(`init: the following files already exist and differ from the template:\n${list}\nOverwrite all? (y/N): `);
        return /^y(es)?$/i.test(answer.trim());
    }
    finally {
        rl.close();
    }
}
function conflictMessage(verb, files) {
    return `init: ${verb} — ${files.length} file(s) already exist and differ: ${files.join(", ")}. Re-run with --force to overwrite, or resolve manually.`;
}
/** Idempotent template copy into `<repoRoot>/wiki`, `.claude/agents/wiki.md`, and the selected CI file. */
export async function scaffold(repoRoot, answers, opts) {
    const ci = selectCi(repoRoot);
    const plan = buildPlan(repoRoot, answers, ci);
    const toWrite = [];
    const skipped = [];
    const conflicting = [];
    for (const entry of plan) {
        if (!existsSync(entry.absPath)) {
            toWrite.push(entry);
            continue;
        }
        if (readFileSync(entry.absPath, "utf8") === entry.content) {
            skipped.push(entry.relPath);
            continue;
        }
        conflicting.push(entry);
    }
    if (conflicting.length > 0) {
        if (!opts.force) {
            const files = conflicting.map((c) => c.relPath);
            if (process.stdin.isTTY !== true) {
                throw new Error(conflictMessage("cannot prompt for confirmation (no TTY)", files));
            }
            const proceed = await confirmOverwrite(files);
            if (!proceed) {
                throw new Error(conflictMessage("aborted", files));
            }
        }
        toWrite.push(...conflicting);
    }
    for (const entry of toWrite) {
        mkdirSync(dirname(entry.absPath), { recursive: true });
        writeFileSync(entry.absPath, entry.content, "utf8");
    }
    return {
        written: toWrite.map((e) => e.relPath),
        skipped,
        conflicts: conflicting.map((e) => e.relPath),
        ci,
    };
}
