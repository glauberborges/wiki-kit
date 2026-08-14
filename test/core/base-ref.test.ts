import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bareBranch, changedFiles, computeAffected, refExists, resolveBase } from "../../src/core/base-ref.js";
import type { Page } from "../../src/core/pages.js";

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

/** Sets `refs/remotes/origin/<name>` to the current HEAD, mimicking what a CI checkout's fetch produces — no real remote required. */
function fakeRemoteRef(repoRoot: string, name: string): void {
  const sha = git(repoRoot, ["rev-parse", "HEAD"]).trim();
  git(repoRoot, ["update-ref", `refs/remotes/origin/${name}`, sha]);
}

describe("resolveBase", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-baseref-resolve-"));
    initGitRepo(repoRoot);
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("explicit --base wins over everything", () => {
    const env = { WIKI_BASE: "develop", GITHUB_BASE_REF: "main" };
    expect(resolveBase("origin/release", env, repoRoot)).toEqual({ ref: "origin/release", from: "--base" });
  });

  it("WIKI_BASE wins over GITHUB_BASE_REF and the rest", () => {
    const env = {
      WIKI_BASE: "origin/develop",
      GITHUB_BASE_REF: "main",
      CHANGE_TARGET: "main",
    };
    expect(resolveBase(null, env, repoRoot)).toEqual({ ref: "origin/develop", from: "WIKI_BASE" });
  });

  it("GITHUB_BASE_REF wins over CHANGE_TARGET and later vars", () => {
    const env = { GITHUB_BASE_REF: "main", CHANGE_TARGET: "develop" };
    expect(resolveBase(null, env, repoRoot)).toEqual({ ref: "origin/main", from: "GITHUB_BASE_REF" });
  });

  it("checks CI vars in the exact CORE-08 order", () => {
    const order = [
      "CHANGE_TARGET",
      "ghprbTargetBranch",
      "gitlabTargetBranch",
      "CI_MERGE_REQUEST_TARGET_BRANCH_NAME",
      "BITBUCKET_PR_DESTINATION_BRANCH",
    ];
    for (let i = 0; i < order.length; i++) {
      const env: Record<string, string> = {};
      for (const name of order.slice(i)) env[name] = "target-branch";
      expect(resolveBase(null, env, repoRoot)).toEqual({ ref: "origin/target-branch", from: order[i] });
    }
  });

  it("prefixes a bare branch name with origin/, but leaves a ref with a slash untouched", () => {
    expect(resolveBase(null, { CHANGE_TARGET: "develop" }, repoRoot)).toEqual({
      ref: "origin/develop",
      from: "CHANGE_TARGET",
    });
    expect(resolveBase(null, { CHANGE_TARGET: "upstream/develop" }, repoRoot)).toEqual({
      ref: "upstream/develop",
      from: "CHANGE_TARGET",
    });
  });

  it("falls back to origin/HEAD's target when no CI var is set", () => {
    writeFileSync(join(repoRoot, "a.txt"), "x");
    git(repoRoot, ["add", "a.txt"]);
    git(repoRoot, ["commit", "-q", "-m", "init"]);
    fakeRemoteRef(repoRoot, "main");
    git(repoRoot, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);

    expect(resolveBase(null, {}, repoRoot)).toEqual({ ref: "origin/main", from: "origin/HEAD" });
  });

  it("falls back to origin/main when nothing else resolves", () => {
    expect(resolveBase(null, {}, repoRoot)).toEqual({ ref: "origin/main", from: "default" });
  });
});

describe("bareBranch", () => {
  it("strips the origin/ prefix", () => {
    expect(bareBranch("origin/main")).toBe("main");
  });

  it("leaves a ref with no origin/ prefix untouched", () => {
    expect(bareBranch("main")).toBe("main");
  });
});

describe("refExists", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-baseref-exists-"));
    initGitRepo(repoRoot);
    writeFileSync(join(repoRoot, "a.txt"), "x");
    git(repoRoot, ["add", "a.txt"]);
    git(repoRoot, ["commit", "-q", "-m", "init"]);
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("is true for a ref that resolves to a commit", () => {
    expect(refExists(repoRoot, "HEAD")).toBe(true);
  });

  it("is false for a ref that does not exist — never throws", () => {
    expect(refExists(repoRoot, "origin/does-not-exist")).toBe(false);
  });

  it("is false when repoRoot is not even a git repository — never throws", () => {
    const notARepo = mkdtempSync(join(tmpdir(), "wiki-kit-baseref-norepo-"));
    try {
      expect(refExists(notARepo, "HEAD")).toBe(false);
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});

describe("changedFiles", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-baseref-changed-"));
    initGitRepo(repoRoot);
    writeFileSync(join(repoRoot, "base.txt"), "base\n");
    git(repoRoot, ["add", "base.txt"]);
    git(repoRoot, ["commit", "-q", "-m", "init"]);
    fakeRemoteRef(repoRoot, "main");
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("unions the committed diff vs. base, uncommitted changes, and untracked files", () => {
    // committed on top of base
    writeFileSync(join(repoRoot, "committed.txt"), "committed\n");
    git(repoRoot, ["add", "committed.txt"]);
    git(repoRoot, ["commit", "-q", "-m", "committed change"]);

    // uncommitted change to a tracked file
    writeFileSync(join(repoRoot, "base.txt"), "base changed\n");

    // untracked new file
    writeFileSync(join(repoRoot, "untracked.txt"), "new\n");

    const files = changedFiles(repoRoot, "origin/main", true);
    expect(files).toEqual(["base.txt", "committed.txt", "untracked.txt"]);
  });

  it("reports an uncommitted-only change even with no commits on top of base", () => {
    writeFileSync(join(repoRoot, "base.txt"), "base changed\n");
    expect(changedFiles(repoRoot, "origin/main", true)).toEqual(["base.txt"]);
  });

  it("reports an untracked-only file even with no commits or uncommitted edits", () => {
    writeFileSync(join(repoRoot, "untracked.txt"), "new\n");
    expect(changedFiles(repoRoot, "origin/main", true)).toEqual(["untracked.txt"]);
  });

  it("dedupes a file that is both committed vs. base and further modified uncommitted", () => {
    writeFileSync(join(repoRoot, "committed.txt"), "committed\n");
    git(repoRoot, ["add", "committed.txt"]);
    git(repoRoot, ["commit", "-q", "-m", "committed change"]);
    writeFileSync(join(repoRoot, "committed.txt"), "committed, then edited more\n");

    expect(changedFiles(repoRoot, "origin/main", true)).toEqual(["committed.txt"]);
  });

  it("skips the base-diff source entirely when baseOk is false, falling back to uncommitted+untracked only (CORE-04)", () => {
    writeFileSync(join(repoRoot, "committed.txt"), "committed\n");
    git(repoRoot, ["add", "committed.txt"]);
    git(repoRoot, ["commit", "-q", "-m", "committed change"]);
    writeFileSync(join(repoRoot, "untracked.txt"), "new\n");

    // baseOk=false: the committed-vs-base diff is skipped even though "origin/main" itself resolves —
    // this simulates the caller having already determined refExists() is false for the *real* base.
    expect(changedFiles(repoRoot, "origin/main", false)).toEqual(["untracked.txt"]);
  });

  it("never throws when the base ref genuinely does not exist and baseOk is (correctly) false", () => {
    expect(() => changedFiles(repoRoot, "origin/does-not-exist", false)).not.toThrow();
    writeFileSync(join(repoRoot, "untracked.txt"), "new\n");
    expect(changedFiles(repoRoot, "origin/does-not-exist", false)).toEqual(["untracked.txt"]);
  });
});

function page(overrides: Partial<Page>): Page {
  return {
    file: "",
    rel: "",
    repoRel: "",
    slug: "",
    category: "",
    categoryLabel: "",
    categoryPosition: 0,
    reserved: false,
    data: {},
    body: "",
    rawHead: "",
    title: "",
    description: "",
    sources: [],
    position: 0,
    ...overrides,
  };
}

describe("computeAffected", () => {
  let repoRoot: string;
  let wikiDir: string;
  let docsDir: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-baseref-affected-"));
    initGitRepo(repoRoot);
    wikiDir = join(repoRoot, "wiki");
    docsDir = join(wikiDir, "docs");
    mkdirSync(docsDir, { recursive: true });

    mkdirSync(join(repoRoot, "src"), { recursive: true });
    writeFileSync(join(repoRoot, "src", "a.ts"), "");
    writeFileSync(join(docsDir, "architecture.md"), "");
    writeFileSync(join(wikiDir, "wiki-kit.config.yaml"), "rules: {}\n");
    git(repoRoot, ["add", "."]);
    git(repoRoot, ["commit", "-q", "-m", "init"]);
    fakeRemoteRef(repoRoot, "main");
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("maps a changed source file to the page slug that declares it", () => {
    const pages = [page({ slug: "architecture", repoRel: "wiki/docs/architecture.md", sources: ["src/a.ts"] })];
    writeFileSync(join(repoRoot, "src", "a.ts"), "changed\n");

    const result = computeAffected(pages, repoRoot, docsDir, wikiDir, "origin/main", "test");
    expect(result.affected.get("architecture")).toEqual(["src/a.ts"]);
    expect(result.uncovered).toEqual([]);
  });

  it("lists a changed file matched by no page's sources as uncovered", () => {
    const pages = [page({ slug: "architecture", repoRel: "wiki/docs/architecture.md", sources: ["src/nothing.ts"] })];
    writeFileSync(join(repoRoot, "src", "a.ts"), "changed\n");

    const result = computeAffected(pages, repoRoot, docsDir, wikiDir, "origin/main", "test");
    expect(result.affected.size).toBe(0);
    expect(result.uncovered).toEqual(["src/a.ts"]);
  });

  it("excludes the wiki's own changed files from both affected and uncovered", () => {
    const pages = [page({ slug: "architecture", repoRel: "wiki/docs/architecture.md", sources: ["src/a.ts"] })];
    writeFileSync(join(wikiDir, "wiki-kit.config.yaml"), "rules: { changed: true }\n");

    const result = computeAffected(pages, repoRoot, docsDir, wikiDir, "origin/main", "test");
    expect(result.changed).toContain("wiki/wiki-kit.config.yaml");
    expect(result.uncovered).not.toContain("wiki/wiki-kit.config.yaml");
    expect(result.affected.size).toBe(0);
  });

  it("populates touchedPages from changed files under the docs prefix — the missed-pages gate data (CORE-12)", () => {
    const pages = [page({ slug: "architecture", repoRel: "wiki/docs/architecture.md", sources: ["src/a.ts"] })];
    writeFileSync(join(repoRoot, "src", "a.ts"), "changed\n");
    writeFileSync(join(docsDir, "architecture.md"), "updated\n");

    const result = computeAffected(pages, repoRoot, docsDir, wikiDir, "origin/main", "test");
    expect(result.touchedPages.has("wiki/docs/architecture.md")).toBe(true);
  });

  it("leaves a page's repoRel out of touchedPages when its declared source changed but the page itself was not edited (the missed-page case)", () => {
    const pages = [page({ slug: "architecture", repoRel: "wiki/docs/architecture.md", sources: ["src/a.ts"] })];
    writeFileSync(join(repoRoot, "src", "a.ts"), "changed\n");

    const result = computeAffected(pages, repoRoot, docsDir, wikiDir, "origin/main", "test");
    expect(result.affected.has("architecture")).toBe(true);
    expect(result.touchedPages.has("wiki/docs/architecture.md")).toBe(false);
  });

  it("sets baseOk: false and baseFrom, and still computes from the uncommitted+untracked union, when the base ref does not exist (CORE-04)", () => {
    const pages = [page({ slug: "architecture", repoRel: "wiki/docs/architecture.md", sources: ["src/a.ts"] })];
    writeFileSync(join(repoRoot, "src", "a.ts"), "changed\n");

    const result = computeAffected(pages, repoRoot, docsDir, wikiDir, "origin/does-not-exist", "GITHUB_BASE_REF");
    expect(result.baseOk).toBe(false);
    expect(result.baseFrom).toBe("GITHUB_BASE_REF");
    expect(result.affected.get("architecture")).toEqual(["src/a.ts"]);
  });

  it("never throws for an unresolvable base ref, even with no changes at all", () => {
    expect(() => computeAffected([], repoRoot, docsDir, wikiDir, "origin/does-not-exist", "default")).not.toThrow();
  });
});
