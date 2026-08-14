import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/commands/hub.js";

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
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

function writeArtifacts(outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "llms.txt"), "index content\n");
  writeFileSync(join(outDir, "llms-full.txt"), "full content\n");
  writeFileSync(join(outDir, "map.json"), "{}\n");
  mkdirSync(join(outDir, "okf"), { recursive: true });
  writeFileSync(join(outDir, "okf", "index.md"), "# OKF\n");
}

describe("hub push", () => {
  let scratchRoot: string;
  let repoRoot: string;
  let wikiDir: string;
  let originalCwd: string;
  let originalToken: string | undefined;
  let originalGitConfigGlobal: string | undefined;

  beforeEach(() => {
    scratchRoot = mkdtempSync(join(tmpdir(), "wiki-kit-hub-test-"));
    repoRoot = join(scratchRoot, "repo");
    mkdirSync(repoRoot, { recursive: true });
    initGitRepo(repoRoot);
    wikiDir = join(repoRoot, "wiki");
    mkdirSync(wikiDir, { recursive: true });

    originalCwd = process.cwd();
    originalToken = process.env.WIKI_HUB_TOKEN;
    originalGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL;
    process.chdir(repoRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalToken === undefined) delete process.env.WIKI_HUB_TOKEN;
    else process.env.WIKI_HUB_TOKEN = originalToken;
    if (originalGitConfigGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = originalGitConfigGlobal;
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  function writeConfig(hubBlock: string): void {
    writeFileSync(join(wikiDir, "wiki-kit.config.yaml"), `${CONFIG_BASE}\n${hubBlock}`);
  }

  function newBareHub(name: string): string {
    const dir = join(scratchRoot, name);
    mkdirSync(dir, { recursive: true });
    execFileSync("git", ["init", "--bare", "-q", "-b", "main"], { cwd: dir });
    return dir;
  }

  // hub.ts always targets https://x-access-token@github.com/<repo>.git — this
  // redirects just that one exact URL to a local bare repo via git's own
  // url.insteadOf rewriting, injected only into this test's git children via
  // GIT_CONFIG_GLOBAL. hub.ts's own source never changes for tests.
  function redirectToLocalHub(repoSlug: string, bareDir: string): void {
    const gitConfigPath = join(scratchRoot, `gitconfig-${repoSlug.replace(/[^a-z0-9]/gi, "_")}`);
    writeFileSync(
      gitConfigPath,
      `[url "file://${bareDir}"]\n  insteadOf = https://x-access-token@github.com/${repoSlug}.git\n`,
    );
    process.env.GIT_CONFIG_GLOBAL = gitConfigPath;
  }

  it("fails naming `wiki-kit llms` when no artifacts exist on disk", () => {
    writeConfig("hub:\n  repo: acme/wiki-hub\n  branch: main\n");
    expect(() => run(["push"])).toThrow(/wiki-kit llms/);
  });

  it("fails before any git operation when WIKI_HUB_TOKEN is unset", () => {
    writeArtifacts(join(wikiDir, "static"));
    writeConfig("hub:\n  repo: acme/unreachable-hub\n  branch: main\n");
    redirectToLocalHub("acme/unreachable-hub", join(scratchRoot, "does-not-exist"));
    delete process.env.WIKI_HUB_TOKEN;

    expect(() => run(["push"])).toThrow(/WIKI_HUB_TOKEN/);
  });

  it("fails naming `wiki-kit init` when the hub: block is missing from config", () => {
    writeArtifacts(join(wikiDir, "static"));
    writeConfig("");
    process.env.WIKI_HUB_TOKEN = "test-token";

    expect(() => run(["push"])).toThrow(/wiki-kit init/);
  });

  it("clones, commits, and pushes artifacts under docs/<repo-name> on the hub's branch", () => {
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ name: "@acme/my-service" }));
    writeArtifacts(join(wikiDir, "static"));
    writeConfig("hub:\n  repo: acme/wiki-hub\n  branch: main\n");

    const bareDir = newBareHub("hub-bare");
    redirectToLocalHub("acme/wiki-hub", bareDir);
    process.env.WIKI_HUB_TOKEN = "test-token";

    expect(() => run(["push"])).not.toThrow();

    const verifyDir = join(scratchRoot, "verify");
    execFileSync("git", ["clone", "-q", "--branch", "main", bareDir, verifyDir]);

    expect(readFileSync(join(verifyDir, "docs", "my-service", "llms.txt"), "utf8")).toBe("index content\n");
    expect(readFileSync(join(verifyDir, "docs", "my-service", "llms-full.txt"), "utf8")).toBe("full content\n");
    expect(readFileSync(join(verifyDir, "docs", "my-service", "map.json"), "utf8")).toBe("{}\n");
    expect(readFileSync(join(verifyDir, "docs", "my-service", "okf", "index.md"), "utf8")).toBe("# OKF\n");

    const subject = execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: verifyDir, encoding: "utf8" }).trim();
    expect(subject).toContain("wiki-kit hub push");
    expect(subject).toContain("docs/my-service");
  });

  it("fails directly on a rejected push, with no retry", () => {
    writeArtifacts(join(wikiDir, "static"));
    writeConfig("hub:\n  repo: acme/wiki-hub\n  branch: main\n");

    const bareDir = newBareHub("hub-bare-reject");
    const counterPath = join(bareDir, "hook-calls.txt");
    writeFileSync(
      join(bareDir, "hooks", "pre-receive"),
      `#!/bin/sh\necho called >> "${counterPath}"\necho "simulated non-fast-forward rejection" >&2\nexit 1\n`,
      { mode: 0o700 },
    );
    redirectToLocalHub("acme/wiki-hub", bareDir);
    process.env.WIKI_HUB_TOKEN = "test-token";

    expect(() => run(["push"])).toThrow(/rejected/);

    const calls = existsSync(counterPath)
      ? readFileSync(counterPath, "utf8").trim().split("\n").filter(Boolean)
      : [];
    expect(calls).toHaveLength(1);
  });

  it("rejects an unknown hub subcommand", () => {
    expect(() => run([])).toThrow(/wiki-kit hub push/);
    expect(() => run(["pull"])).toThrow(/wiki-kit hub push/);
  });
});
