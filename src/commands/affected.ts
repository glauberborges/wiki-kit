// `affected [--base <ref>] [--strict]`.
// Reuses core/base-ref.ts's computeAffected; this file only formats output
// and implements the --strict CI gate (CORE-12) — the part that has no
// equivalent in core/ because it's presentation + exit-status policy, not a
// value other commands need to reuse.

import { join } from "node:path";
import { parseArgs } from "node:util";
import { bareBranch, computeAffected, resolveBase, type AffectedResult } from "../core/base-ref.js";
import { runCli } from "../core/entrypoint.js";
import { findRepoRoot, loadPages, type Page } from "../core/pages.js";

function printAffected(result: AffectedResult, base: string): void {
  const { changed, affected, uncovered } = result;

  if (!result.baseOk) {
    console.log(`warning: ref \`${base}\` (from ${result.baseFrom}) does not exist — comparing the working tree only.`);
    console.log(`         shallow clone? \`git fetch --depth=200 origin ${bareBranch(base)}\``);
    console.log("         wrong branch? `--base <ref>` or the WIKI_BASE variable.\n");
  }
  console.log(`diff ${result.baseOk ? `${base}...HEAD` : "working tree"} — ${changed.length} file(s)\n`);

  if (affected.size === 0 && uncovered.length === 0) {
    console.log("No pages affected.");
    return;
  }

  if (affected.size > 0) {
    console.log("Pages to update:");
    for (const [slug, files] of affected) {
      const shown = files.slice(0, 4).join(", ");
      const rest = files.length > 4 ? ` (+${files.length - 4})` : "";
      console.log(`  ${slug}.md  ← ${shown}${rest}`);
    }
    console.log("");
  }

  if (uncovered.length > 0) {
    console.log("Not covered (no page declares these sources):");
    for (const file of uncovered) console.log(`  ${file}`);
    console.log("");
    console.log("→ new functionality needs a new page, or `sources:` added to an existing page.");
  }
}

/** Pages whose declared sources changed but the page itself wasn't edited — CORE-12's gate data. */
function missedPages(pages: Page[], result: AffectedResult): string[] {
  const missed: string[] = [];
  for (const slug of result.affected.keys()) {
    const page = pages.find((p) => p.slug === slug);
    if (page && !result.touchedPages.has(page.repoRel)) missed.push(slug);
  }
  return missed;
}

export function run(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: {
      base: { type: "string" },
      strict: { type: "boolean" },
    },
  });

  const repoRoot = findRepoRoot(process.cwd());
  const wikiDir = join(repoRoot, "wiki");
  const docsDir = join(wikiDir, "docs");
  const pages = loadPages(wikiDir);

  const { ref: base, from: baseFrom } = resolveBase(values.base ?? null, process.env, repoRoot);
  const result = computeAffected(pages, repoRoot, docsDir, wikiDir, base, baseFrom);

  printAffected(result, base);

  if (!values.strict) return;

  // Without a base there is nothing to compare, and computeAffected already
  // fell back to the uncommitted+untracked union rather than throwing
  // (CORE-04) — so the gate has to check this explicitly or it would report
  // green having verified nothing.
  if (!result.baseOk) {
    throw new Error(
      [
        `The base ref \`${base}\` (from ${result.baseFrom}) does not exist.`,
        "Without a base there is nothing to compare, and passing silently would be worse than failing:",
        "the gate would look green without having verified anything.",
        "",
        "Shallow clone (the default on many CI agents)? Fetch the history:",
        `    git fetch --no-tags --depth=200 origin ${bareBranch(base)}:${base}`,
        "Different base branch? Pass --base <ref> or export WIKI_BASE.",
      ].join("\n"),
    );
  }

  const missed = missedPages(pages, result);
  if (missed.length > 0) {
    throw new Error(
      [
        `${missed.length} page(s) declare sources that changed and were not updated:`,
        ...missed.map((slug) => `    ${result.docsPrefix}${slug}.md`),
        "",
        "→ update the page(s) above to reflect the change.",
      ].join("\n"),
    );
  }
}

runCli(import.meta.url, () => run(process.argv.slice(2)));
