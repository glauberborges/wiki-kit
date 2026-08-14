import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/affected.js";

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

/** Mimics what a CI checkout's fetch produces — no real remote required. */
function fakeRemoteRef(repoRoot: string, name: string): void {
  const sha = git(repoRoot, ["rev-parse", "HEAD"]).trim();
  git(repoRoot, ["update-ref", `refs/remotes/origin/${name}`, sha]);
}

describe("affected", () => {
  let repoRoot: string;
  let wikiDir: string;
  let docsDir: string;
  let originalCwd: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-affected-test-"));
    initGitRepo(repoRoot);
    wikiDir = join(repoRoot, "wiki");
    docsDir = join(wikiDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(join(repoRoot, "src"), { recursive: true });

    originalCwd = process.cwd();
    process.chdir(repoRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writePage(slug: string, sourcesYaml: string, body = "# Title\n"): void {
    writeFileSync(join(docsDir, `${slug}.md`), ["---", "type: Architecture", sourcesYaml, "---", body].join("\n"));
  }

  function commitAll(message: string): void {
    git(repoRoot, ["add", "."]);
    git(repoRoot, ["commit", "-q", "-m", message]);
  }

  it("reports pages to update and uncovered files against a resolvable base", () => {
    writeFileSync(join(repoRoot, "src", "a.ts"), "one\n");
    writeFileSync(join(repoRoot, "src", "b.ts"), "one\n");
    writePage("architecture", "sources:\n  - resource: src/a.ts");
    commitAll("init");
    fakeRemoteRef(repoRoot, "main");

    writeFileSync(join(repoRoot, "src", "a.ts"), "changed\n");
    writeFileSync(join(repoRoot, "src", "b.ts"), "changed\n");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => run(["--base", "origin/main"])).not.toThrow();

    const output = log.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("Pages to update:");
    expect(output).toContain("architecture.md");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("Not covered");
    expect(output).toContain("src/b.ts");
  });

  it("does not throw without --strict when the base ref is unresolvable, and warns instead", () => {
    writeFileSync(join(repoRoot, "src", "a.ts"), "one\n");
    writePage("architecture", "sources:\n  - resource: src/a.ts");
    commitAll("init");
    // no fakeRemoteRef: origin/main never resolves

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => run(["--base", "origin/main"])).not.toThrow();

    const output = log.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("does not exist");
    expect(output).toContain("working tree");
  });

  it("--strict fails naming the exact git fetch fix when the base ref is unresolvable (CORE-04)", () => {
    writeFileSync(join(repoRoot, "src", "a.ts"), "one\n");
    writePage("architecture", "sources:\n  - resource: src/a.ts");
    commitAll("init");
    // no fakeRemoteRef: origin/main never resolves

    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => run(["--base", "origin/main", "--strict"])).toThrow(
      /git fetch --no-tags --depth=200 origin main:origin\/main/,
    );
  });

  it("--strict fails listing a page whose declared sources changed but the page itself wasn't touched (CORE-12)", () => {
    writeFileSync(join(repoRoot, "src", "a.ts"), "one\n");
    writePage("architecture", "sources:\n  - resource: src/a.ts");
    commitAll("init");
    fakeRemoteRef(repoRoot, "main");

    writeFileSync(join(repoRoot, "src", "a.ts"), "changed\n");

    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => run(["--base", "origin/main", "--strict"])).toThrow(/wiki\/docs\/architecture\.md/);
    expect(() => run(["--base", "origin/main", "--strict"])).toThrow(/wiki-kit update/);
  });

  it("--strict passes when the affected page was itself also updated", () => {
    writeFileSync(join(repoRoot, "src", "a.ts"), "one\n");
    writePage("architecture", "sources:\n  - resource: src/a.ts");
    commitAll("init");
    fakeRemoteRef(repoRoot, "main");

    writeFileSync(join(repoRoot, "src", "a.ts"), "changed\n");
    writePage("architecture", "sources:\n  - resource: src/a.ts", "# Title\nUpdated body.\n");

    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => run(["--base", "origin/main", "--strict"])).not.toThrow();
  });
});
