// `wiki-kit ingest-prompt` — the L0 agent-ready prompt for the affected
// pages. `buildIngestPrompt` is exported separately from `run` because
// `update.ts` (a later task) dispatches this exact prompt text to an agent
// CLI — it must call the same function, not a copy (design.md).

import { join } from "node:path";
import { parseArgs } from "node:util";
import { computeAffected, resolveBase, type AffectedResult } from "../core/base-ref.js";
import { findRepoRoot, loadPages, type Page } from "../core/pages.js";

/** Builds the prompt text for a computed affected result. Pure — never prints. */
export function buildIngestPrompt(pages: Page[], result: AffectedResult, base: string): string {
  const { affected, uncovered, changed } = result;
  if (affected.size === 0 && uncovered.length === 0) {
    return "No pages affected by the diff — nothing to do.";
  }

  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const lines: string[] = [];

  lines.push(
    "You are going to update this repository's wiki to reflect the code changes in the current diff.",
    "",
    `Diff analyzed: \`${base}...HEAD\` (${changed.length} file(s)).`,
    "",
  );

  if (affected.size > 0) {
    lines.push("## Pages to update", "");
    for (const [slug, files] of affected) {
      const page = bySlug.get(slug);
      lines.push(`### \`${page?.repoRel ?? slug}\``);
      lines.push(`Declares as source the files that changed: ${files.map((f) => `\`${f}\``).join(", ")}`);
      lines.push("");
    }
  }

  if (uncovered.length > 0) {
    lines.push(
      "## Files without coverage",
      "",
      "No page declares these sources — this may be new functionality:",
      "",
      ...uncovered.map((f) => `- \`${f}\``),
      "",
      "For each one: **propose** (don't create on your own) a new page or the extension of an existing one, and ask before writing.",
      "",
    );
  }

  lines.push(
    "## How to write",
    "",
    `1. Read \`git diff ${base}...HEAD\` on the files listed above to understand what actually changed.`,
    "2. Edit the pages above. Describe **behavior**, not the diff — the reader wants to understand the system, not the change.",
    "3. Keep the page's \"Where it lives in the code\" table up to date if it has one.",
    "4. Update `sources:` if new files are now part of the page's subject.",
    "5. In the front matter, set `generated: { by: <your-model>, at: <YYYY-MM-DD> }` and do **not** fill in `verified:` — whoever reviews the PR is the one who stamps it.",
    "6. Run `wiki-kit lint` and fix whatever it reports.",
    "",
    "Writing conventions are in `wiki/AUTHORING.md`. Do not invent behavior: if the diff doesn't make it clear, read the code.",
  );

  return lines.join("\n");
}

export function run(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { base: { type: "string" } },
    strict: false,
    allowPositionals: true,
  });

  const repoRoot = findRepoRoot(process.cwd());
  const wikiDir = join(repoRoot, "wiki");
  const docsDir = join(wikiDir, "docs");
  const pages = loadPages(wikiDir);
  if (pages.length === 0) {
    throw new Error(`No pages found under ${docsDir} — nothing to build a prompt for.`);
  }

  const explicitBase = typeof values.base === "string" ? values.base : null;
  const { ref: base, from: baseFrom } = resolveBase(explicitBase, process.env, repoRoot);
  const result = computeAffected(pages, repoRoot, docsDir, wikiDir, base, baseFrom);

  console.log(buildIngestPrompt(pages, result, base));
}
