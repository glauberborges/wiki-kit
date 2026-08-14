import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeAffected, resolveBase } from "../../src/core/base-ref.js";
import { loadPages } from "../../src/core/pages.js";
import { buildIngestPrompt } from "../../src/commands/ingest-prompt.js";

const spawnMock = vi.hoisted(() => vi.fn());
const unrefMock = vi.hoisted(() => vi.fn());

// Only `spawn` is mocked — `execFileSync` (used internally by core/pages.ts
// and core/base-ref.ts for every git call) must stay real, or loadPages/
// computeAffected break for every test in this file, not just the spawn one.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: spawnMock };
});

const { run } = await import("../../src/commands/update.js");

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

const CONFIG_BASE = [
  "rules:",
  "  staleness: { severity: warn }",
  "okf:",
  "  types: [Architecture]",
  "output:",
  "  dir: static",
  "  artifacts: [llms, llms-full, map, okf]",
  "  llms-max-kb: 8",
].join("\n");

/** Writes an executable file real enough to pass resolveOnPath's X_OK+isFile check — spawn is mocked, so its content never runs. */
function makeFakeBin(dir: string, name: string): string {
  mkdirSync(dir, { recursive: true });
  const binPath = join(dir, name);
  writeFileSync(binPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return binPath;
}

describe("wiki-kit update", () => {
  let repoRoot: string;
  let wikiDir: string;
  let docsDir: string;
  let originalCwd: string;
  let originalPath: string | undefined;
  let binDir: string | undefined;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-update-"));
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
    originalPath = process.env.PATH;
    process.chdir(repoRoot);

    binDir = undefined;
    spawnMock.mockReset();
    unrefMock.mockReset();
    spawnMock.mockReturnValue({ unref: unrefMock });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    vi.restoreAllMocks();
    rmSync(repoRoot, { recursive: true, force: true });
    if (binDir) rmSync(binDir, { recursive: true, force: true });
  });

  function writeConfig(updateBlock: string): void {
    writeFileSync(join(wikiDir, "wiki-kit.config.yaml"), `${CONFIG_BASE}\n${updateBlock}`);
  }

  it("fails naming update.agent when it's missing from config, before spawning anything", () => {
    writeConfig("");

    expect(() => run([])).toThrow(/update\.agent/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("fails naming the binary when update.agent isn't found on PATH, before spawning anything", () => {
    writeConfig("update:\n  agent: totally-nonexistent-binary-xyz\n");

    expect(() => run([])).toThrow(/totally-nonexistent-binary-xyz/);
    expect(() => run([])).toThrow(/PATH/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("reports and does not spawn when no pages are affected", () => {
    // The fake bin dir must live outside repoRoot — creating it inside a git
    // repo would show up as an untracked file in `changedFiles`'s union and
    // corrupt the very affected/uncovered computation this test checks.
    binDir = mkdtempSync(join(tmpdir(), "wiki-kit-fakebin-"));
    makeFakeBin(binDir, "fake-agent");
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ""}`;
    writeConfig("update:\n  agent: fake-agent\n");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    run(["--base", "origin/main"]);

    expect(spawnMock).not.toHaveBeenCalled();
    expect(log.mock.calls.some((c) => String(c[0]).includes("No pages affected"))).toBe(true);
  });

  it("dispatches the resolved binary, detached and unref'd, with the exact ingest-prompt content as its argument", () => {
    writeFileSync(join(repoRoot, "src", "a.ts"), "export const a = 2;\n");

    binDir = mkdtempSync(join(tmpdir(), "wiki-kit-fakebin-"));
    const binPath = makeFakeBin(binDir, "fake-agent");
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ""}`;
    writeConfig("update:\n  agent: fake-agent\n");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    // Computed BEFORE run() — update.ts itself creates wiki/.wiki-kit/update.log
    // as a side effect, and that new untracked file would otherwise inflate
    // the "changed" count in a second, post-run recomputation.
    const pages = loadPages(wikiDir);
    const { ref: base, from: baseFrom } = resolveBase("origin/main", process.env, repoRoot);
    const result = computeAffected(pages, repoRoot, docsDir, wikiDir, base, baseFrom);
    const expectedPrompt = buildIngestPrompt(pages, result, base);

    run(["--base", "origin/main"]);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [calledBin, calledArgs, calledOpts] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(calledBin).toBe(binPath);
    expect(calledArgs).toEqual([expectedPrompt]);
    expect(calledOpts.detached).toBe(true);
    expect(calledOpts.stdio).toEqual(["ignore", expect.any(Number), expect.any(Number)]);

    expect(unrefMock).toHaveBeenCalledTimes(1);
    expect(existsSync(join(wikiDir, ".wiki-kit", "update.log"))).toBe(true);
    expect(log.mock.calls.some((c) => String(c[0]).includes("Dispatched fake-agent"))).toBe(true);
  });
});
