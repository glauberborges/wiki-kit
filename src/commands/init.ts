// `init` — scaffolds a new wiki. The interactive part (project name, org,
// locale, whether to connect a hub) happens in conversation before this runs
// — Claude asks, then calls this script with the answers as flags. This
// script only does the deterministic part: detect the stack, render
// templates, pick a CI file.

import { parseArgs } from "node:util";
import { basename, join } from "node:path";
import { runCli } from "../core/entrypoint.js";
import { findRepoRoot } from "../core/pages.js";
import { detectStack } from "../init/detect-stack.js";
import { scaffold, type ScaffoldAnswers, type ScaffoldResult } from "../init/scaffold.js";

const DEFAULT_LOCALE = "en";
const MANUAL_GATE_COMMANDS = ["make -C wiki lint", "make -C wiki affected-strict"];

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

  const locale = values.locale ?? DEFAULT_LOCALE;
  const scaffoldAnswers: ScaffoldAnswers = {
    project: values.project,
    org: values.org,
    // Not part of the inferred-or-asked trio — a plain directory-name
    // default keeps init runnable without a flag for the common case.
    repo: values.repo ?? basename(repoRoot),
    locale,
    searchLang: values["search-lang"] ?? locale.split("-")[0],
    tagline: values.tagline,
    taglineLong: values["tagline-long"],
    hub: values["hub-repo"] !== undefined
      ? { repo: values["hub-repo"], branch: values["hub-branch"] ?? "main" }
      : null,
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

runCli(import.meta.url, () => run(process.argv.slice(2)));
