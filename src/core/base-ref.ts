// Diff-base resolution across CI providers, the 3-way changed-files union,
// and cross-referencing the diff against a page's source map. Stdlib only.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { buildSourceMap, type Page } from "./pages.js";

export interface ResolvedBase {
  ref: string;
  from: string;
}

export interface AffectedResult {
  changed: string[];
  affected: Map<string, string[]>; // page slug → code files that touch it
  uncovered: string[]; // changed files matched by no page
  touchedPages: Set<string>; // page repoRel paths that changed in this diff
  docsPrefix: string;
  baseOk: boolean;
  baseFrom: string;
}

/**
 * Env vars each CI provider uses to say "this PR's target branch". Checking
 * these is what makes the same command work on GitHub Actions, Jenkins,
 * GitLab, and Bitbucket without each pipeline passing `--base` its own way.
 * This list IS the precedence order (CORE-08) once `--base` itself is ruled
 * out — see resolveBase.
 */
const CI_BASE_VARS = [
  "WIKI_BASE", // explicit escape hatch, wins over every other CI var
  "GITHUB_BASE_REF", // GitHub Actions (pull_request)
  "CHANGE_TARGET", // Jenkins — Multibranch / Branch Source plugin
  "ghprbTargetBranch", // Jenkins — GitHub Pull Request Builder (legacy)
  "gitlabTargetBranch", // GitLab (Jenkins plugin)
  "CI_MERGE_REQUEST_TARGET_BRANCH_NAME", // native GitLab CI
  "BITBUCKET_PR_DESTINATION_BRANCH", // Bitbucket Pipelines
] as const;

function git(repoRoot: string, args: string[]): string[] {
  try {
    // stderr silenced: failures here are expected (ref doesn't exist yet)
    // and handled by the caller — git's own noise isn't useful output.
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The branch to diff against. Precedence: explicit `--base` > a CI-provided
 * env var > the remote's default branch (`origin/HEAD`, so repos on
 * `master` or `trunk` work with zero config) > `origin/main` (CORE-08).
 */
export function resolveBase(explicit: string | null, env: NodeJS.ProcessEnv, repoRoot: string): ResolvedBase {
  if (explicit) return { ref: explicit, from: "--base" };

  for (const name of CI_BASE_VARS) {
    const value = env[name];
    if (!value) continue;
    // CI hands us a branch name ("main"); we need the remote-tracking ref.
    const ref = value.includes("/") ? value : `origin/${value}`;
    return { ref, from: name };
  }

  try {
    const head = execFileSync("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (head) return { ref: head, from: "origin/HEAD" };
  } catch {
    // No remote, or the remote has no symbolic HEAD — fall through to the default.
  }

  return { ref: "origin/main", from: "default" };
}

/** `origin/main` → `main`, to build the fetch refspec in error messages. */
export function bareBranch(ref: string): string {
  return ref.replace(/^origin\//, "");
}

/** Does `ref` exist? If not, diffing against it would silently produce an empty diff (CORE-04). */
export function refExists(repoRoot: string, ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * What changed. Union of three sources, because all three represent work
 * that owes documentation: commits on this branch vs. the base, changes not
 * yet committed, and new untracked files (the most common "new feature, no
 * page yet" case). Running mid-development — not only after a commit — is
 * the main use case (CORE-11). When the base ref doesn't resolve, the first
 * source is skipped rather than thrown (CORE-04): the union still holds the
 * uncommitted + untracked work, never an empty diff.
 */
export function changedFiles(repoRoot: string, base: string, baseOk: boolean): string[] {
  const all = new Set([
    ...(baseOk ? git(repoRoot, ["diff", "--name-only", `${base}...HEAD`]) : []),
    ...git(repoRoot, ["diff", "--name-only", "HEAD"]),
    ...git(repoRoot, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...all].sort();
}

/** Cross-references the diff against the source map: what to update, and what has no page yet. */
export function computeAffected(
  pages: Page[],
  repoRoot: string,
  docsDir: string,
  wikiDir: string,
  base: string,
  baseFrom: string,
): AffectedResult {
  const baseOk = refExists(repoRoot, base);
  const changed = changedFiles(repoRoot, base, baseOk);
  const map = buildSourceMap(pages, repoRoot);
  const docsPrefix = `${path.relative(repoRoot, docsDir).split(path.sep).join("/")}/`;
  // The wiki documents the PROJECT, not itself: changes to the wiki's own
  // config/scripts aren't code that needs a page.
  const wikiPrefix = `${path.relative(repoRoot, wikiDir).split(path.sep).join("/")}/`;

  const touchedPages = new Set(changed.filter((f) => f.startsWith(docsPrefix)));
  const affected = new Map<string, string[]>();
  const uncovered: string[] = [];

  for (const file of changed) {
    if (file.startsWith(wikiPrefix)) continue;
    const slugs = map.get(file);
    if (!slugs || slugs.size === 0) {
      uncovered.push(file);
      continue;
    }
    for (const slug of slugs) {
      let files = affected.get(slug);
      if (!files) {
        files = [];
        affected.set(slug, files);
      }
      files.push(file);
    }
  }

  return { changed, affected, uncovered, touchedPages, docsPrefix, baseOk, baseFrom };
}
