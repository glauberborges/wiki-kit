// CLI adapter for `wiki-kit lint` — thin wrapper over core/lint-rules.ts's
// engine. Output format and exit-code rule are ported from wiki-lint.mjs's
// `main()` plain-lint branch (lines 514-527), translated to English.

import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../core/config.js";
import { runLintRules } from "../core/lint-rules.js";
import { findRepoRoot, loadPages } from "../core/pages.js";

export function run(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { strict: { type: "boolean" } },
    strict: false,
    allowPositionals: true,
  });

  const repoRoot = findRepoRoot(process.cwd());
  const wikiDir = join(repoRoot, "wiki");
  const pages = loadPages(wikiDir);
  const config = loadConfig(wikiDir);
  const findings = runLintRules(pages, repoRoot, wikiDir, config);

  for (const finding of findings) {
    const mark = finding.severity === "error" ? "✗" : "!";
    console.log(`${mark} ${finding.page.repoRel}: ${finding.message}`);
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warn");
  const total = pages.filter((p) => !p.reserved).length;
  console.log(`\n${total} pages · ${errors.length} error(s) · ${warnings.length} warning(s)`);

  if (errors.length > 0 || (values.strict === true && warnings.length > 0)) {
    process.exitCode = 1;
  }
}
