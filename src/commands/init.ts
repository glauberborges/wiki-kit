// CLI adapter for `wiki-kit init` — wires detect-stack (T14), prompts (T18),
// and scaffold (T19, which already calls ci-select internally) into the
// end-to-end INIT-01..08 flow. Flag names below match placeholders.ts's own
// PLACEHOLDER_FLAGS table exactly, so the "missing answer" error it throws
// for {{TAGLINE}}/{{TAGLINE_LONG}} (no documented default — see spec.md's
// Assumptions table) already names the right flag without duplicating that
// validation here.

import { parseArgs } from "node:util";
import { basename, join } from "node:path";
import { findRepoRoot } from "../core/pages.js";
import { detectStack } from "../init/detect-stack.js";
import { askInteractive, type InitAnswers as PromptAnswers } from "../init/prompts.js";
import { scaffold, type ScaffoldAnswers, type ScaffoldResult } from "../init/scaffold.js";

// Translated from SKILL.md's "O gate em qualquer CI" two-command fallback —
// the port splits the reference's single wiki-lint.mjs script into separate
// lint/affected subcommands (design.md), so the translation is these two.
const MANUAL_GATE_COMMANDS = ["wiki-kit lint", "wiki-kit affected --strict"];

export async function run(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: "string" },
      org: { type: "string" },
      repo: { type: "string" },
      locale: { type: "string" },
      "search-lang": { type: "string" },
      tagline: { type: "string" },
      "tagline-long": { type: "string" },
      "hub-repo": { type: "string" },
      "hub-branch": { type: "string" },
      force: { type: "boolean", default: false },
    },
    strict: true,
  });

  const repoRoot = findRepoRoot(process.cwd());
  reportDetectedStack(repoRoot);

  const known: Partial<PromptAnswers> = {
    project: values.project,
    org: values.org,
    locale: values.locale,
  };
  // Leaving `hub` unset (vs. explicitly null) is what tells askInteractive to
  // prompt on a TTY or default to "no hub" off one — see INIT AC 8's
  // interactive/flag rule, same one AC 2 uses for project/org/locale.
  if (values["hub-repo"] !== undefined) {
    known.hub = { repo: values["hub-repo"], branch: values["hub-branch"] ?? "main" };
  }

  const answers = await askInteractive(known);

  const scaffoldAnswers: ScaffoldAnswers = {
    project: answers.project,
    org: answers.org,
    // Not part of AC 2's inferred-or-prompted trio — a plain directory-name
    // default keeps init runnable without a flag for the common case.
    repo: values.repo ?? basename(repoRoot),
    locale: answers.locale,
    searchLang: values["search-lang"] ?? answers.locale.split("-")[0],
    tagline: values.tagline,
    taglineLong: values["tagline-long"],
    hub: answers.hub,
  };

  const result = await scaffold(repoRoot, scaffoldAnswers, { force: values.force === true });
  printSummary(result, repoRoot);
}

function reportDetectedStack(repoRoot: string): void {
  const stacks = detectStack(repoRoot);
  console.log(
    stacks
      ? `init: detected ${stacks.map((s) => `${s.stack} (${s.manifest})`).join(", ")}.`
      : "init: no recognized stack manifest found — proceeding without stack-specific defaults.",
  );
}

function printSummary(result: ScaffoldResult, repoRoot: string): void {
  if (result.written.length === 0) {
    console.log("init: wiki already up to date — nothing to write.");
  } else {
    console.log(`init: wrote ${result.written.length} file(s):`);
    for (const file of result.written) console.log(`  ${file}`);
  }

  if (result.conflicts.length > 0) {
    console.log(
      `init: overwrote ${result.conflicts.length} file(s) that differed from the template: ${result.conflicts.join(", ")}`,
    );
  }

  if (result.skipped.length > 0) {
    console.log(`init: ${result.skipped.length} file(s) already matched the template — left untouched.`);
  }

  switch (result.ci) {
    case "github":
      console.log("init: wrote .github/workflows/wiki.yml — GitHub Actions runs the gate.");
      break;
    case "jenkins":
      console.log("init: wrote Jenkinsfile.wiki — wire its stages into your Jenkins pipeline.");
      break;
    case "manual":
      console.log("init: no .github/ or Jenkinsfile found — wire the gate into your CI manually:");
      for (const cmd of MANUAL_GATE_COMMANDS) console.log(`  ${cmd}`);
      break;
  }

  console.log(`\nWiki root: ${join(repoRoot, "wiki")}`);
}
