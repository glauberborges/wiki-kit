import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/lint.js";

const CONFIG = [
  "rules:",
  "  staleness: { severity: warn }",
  "okf:",
  "  types: [Architecture, Guide]",
  "output:",
  "  dir: static",
  "  artifacts: [llms, llms-full, map, okf]",
  "  llms-max-kb: 8",
].join("\n");

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

// One error-severity finding (`sources-present`, on an architecture page
// with no `sources:`) and nothing else.
function buildErrorOnlyFixture(repoRoot: string): void {
  const wikiDir = join(repoRoot, "wiki");
  writeFileSync(join(wikiDir, "wiki-kit.config.yaml"), CONFIG);
  const docsDir = join(wikiDir, "docs", "architecture");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    join(docsDir, "overview.md"),
    ["---", "type: Architecture", "title: Overview", "---", "", "Body.", ""].join("\n"),
  );
}

// One warn-severity finding (`stale-after`, already past) and nothing else —
// `guides` isn't in the default `sources-present` apply-to set, so this page
// needs no `sources:` to stay error-free.
function buildWarnOnlyFixture(repoRoot: string): void {
  const wikiDir = join(repoRoot, "wiki");
  writeFileSync(join(wikiDir, "wiki-kit.config.yaml"), CONFIG);
  const docsDir = join(wikiDir, "docs", "guides");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    join(docsDir, "quickstart.md"),
    ["---", "type: Guide", "title: Quickstart", "stale_after: 2000-01-01", "---", "", "Body.", ""].join("\n"),
  );
}

describe("lint command", () => {
  let scratchRoot: string;
  let repoRoot: string;
  let originalCwd: string;
  let originalExitCode: number | string | undefined;

  beforeEach(() => {
    scratchRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-cmd-"));
    repoRoot = join(scratchRoot, "repo");
    mkdirSync(join(repoRoot, "wiki"), { recursive: true });
    initGitRepo(repoRoot);
    originalCwd = process.cwd();
    originalExitCode = process.exitCode;
    process.chdir(repoRoot);
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it("prints an error finding with the ✗ marker and leaves exit code unset on success paths only when no errors", () => {
    buildErrorOnlyFixture(repoRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    run([]);

    const lines = log.mock.calls.map((c) => c[0] as string);
    expect(lines[0]).toMatch(/^✗ wiki\/docs\/architecture\/overview\.md: /);
    expect(lines.at(-1)).toMatch(/^\n1 pages · 1 error\(s\) · 0 warning\(s\)$/);
  });

  it("plain lint exits non-zero when an error finding exists", () => {
    buildErrorOnlyFixture(repoRoot);
    vi.spyOn(console, "log").mockImplementation(() => {});

    run([]);

    expect(process.exitCode).toBe(1);
  });

  it("plain lint exits zero when only warn findings exist", () => {
    buildWarnOnlyFixture(repoRoot);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    run([]);

    const lines = log.mock.calls.map((c) => c[0] as string);
    expect(lines[0]).toMatch(/^! wiki\/docs\/guides\/quickstart\.md: /);
    expect(process.exitCode).toBeUndefined();
  });

  it("--strict exits non-zero when only warn findings exist", () => {
    buildWarnOnlyFixture(repoRoot);
    vi.spyOn(console, "log").mockImplementation(() => {});

    run(["--strict"]);

    expect(process.exitCode).toBe(1);
  });

  it("--strict still exits non-zero when only error findings exist", () => {
    buildErrorOnlyFixture(repoRoot);
    vi.spyOn(console, "log").mockImplementation(() => {});

    run(["--strict"]);

    expect(process.exitCode).toBe(1);
  });
});
