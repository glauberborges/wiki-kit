import { existsSync } from "node:fs";
import { join } from "node:path";

export interface StackInfo {
  stack: string;
  manifest: string;
}

// Source of truth: BOOTSTRAP.md §1 "Detecte a stack pelo manifesto".
// Order matches the reference table; a repo can match more than one entry
// (polyglot monorepo), so this stays a flat list rather than a Map keyed
// by stack name.
const MANIFEST_STACKS: ReadonlyArray<StackInfo> = [
  { manifest: "go.mod", stack: "Go" },
  { manifest: "composer.json", stack: "PHP" },
  { manifest: "package.json", stack: "Node/TS" },
  { manifest: "pyproject.toml", stack: "Python" },
  { manifest: "setup.cfg", stack: "Python" },
  { manifest: "Cargo.toml", stack: "Rust" },
  { manifest: "pom.xml", stack: "Java/Kotlin" },
  { manifest: "build.gradle", stack: "Java/Kotlin" },
  { manifest: "Gemfile", stack: "Ruby" },
];

export function detectStack(repoRoot: string): StackInfo[] | null {
  const matches = MANIFEST_STACKS.filter(({ manifest }) =>
    existsSync(join(repoRoot, manifest)),
  );
  return matches.length > 0 ? matches : null;
}
