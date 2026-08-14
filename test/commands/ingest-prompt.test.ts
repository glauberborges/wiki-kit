import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/ingest-prompt.js";

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

describe("ingest-prompt run()", () => {
  let repoRoot: string;
  let wikiDir: string;
  let docsDir: string;
  let originalCwd: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-ingest-prompt-"));
    initGitRepo(repoRoot);
    wikiDir = join(repoRoot, "wiki");
    docsDir = join(wikiDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(join(repoRoot, "src"), { recursive: true });

    writeFileSync(
      join(docsDir, "architecture.md"),
      "---\ntitle: Architecture\nsources:\n  - resource: src/a.ts\n---\n\n# Architecture\n",
    );
    writeFileSync(join(repoRoot, "src", "a.ts"), "export const a = 1;\n");
    git(repoRoot, ["add", "."]);
    git(repoRoot, ["commit", "-q", "-m", "init"]);
    fakeRemoteRef(repoRoot, "main");

    originalCwd = process.cwd();
    process.chdir(repoRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("affected case: prints a prompt naming the page to update and the source that changed", () => {
    writeFileSync(join(repoRoot, "src", "a.ts"), "export const a = 2;\n");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    run(["--base", "origin/main"]);

    expect(log).toHaveBeenCalledTimes(1);
    const output = log.mock.calls[0]?.[0] as string;
    expect(output).toContain("## Pages to update");
    expect(output).toContain("wiki/docs/architecture.md");
    expect(output).toContain("Declares as source the files that changed");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("## How to write");
    expect(output).toContain("wiki/AUTHORING.md");
    expect(output).not.toContain("## Files without coverage");
  });

  it("uncovered case: lists a changed file matched by no page's sources under 'Files without coverage'", () => {
    writeFileSync(join(repoRoot, "src", "orphan.ts"), "export const b = 1;\n");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    run(["--base", "origin/main"]);

    const output = log.mock.calls[0]?.[0] as string;
    expect(output).toContain("## Files without coverage");
    expect(output).toContain("src/orphan.ts");
    expect(output).toContain("propose");
    expect(output).not.toContain("## Pages to update");
  });

  it("no-affected-pages case: prints a plain message and no prompt shell", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    run(["--base", "origin/main"]);

    expect(log).toHaveBeenCalledTimes(1);
    const output = log.mock.calls[0]?.[0] as string;
    expect(output).toBe("No pages affected by the diff — nothing to do.");
    expect(output).not.toContain("## Pages to update");
    expect(output).not.toContain("## Files without coverage");
  });

  it("fails naming the docs directory when there are no wiki pages at all", () => {
    rmSync(docsDir, { recursive: true, force: true });
    expect(() => run(["--base", "origin/main"])).toThrow(/No pages found/);
  });
});
