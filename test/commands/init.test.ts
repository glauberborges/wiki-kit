import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/init.js";

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function snapshot(dir: string): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const file of walkFiles(dir)) snap[file] = readFileSync(file, "utf8");
  return snap;
}

const BASE_FLAGS = [
  "--project",
  "Acme",
  "--org",
  "acme",
  "--tagline",
  "Docs that verify themselves",
  "--tagline-long",
  "Docs that verify themselves against the code they describe.",
];

describe("wiki-kit init", () => {
  let repoRoot: string;
  let originalCwd: string;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-init-test-"));
    initGitRepo(repoRoot);
    originalCwd = process.cwd();
    originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    process.chdir(repoRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.stdin.isTTY = originalIsTTY;
    vi.restoreAllMocks();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("scaffolds a working wiki skeleton in a scratch Go repo with manual CI instructions (INIT-01 Independent Test)", async () => {
    writeFileSync(join(repoRoot, "go.mod"), "module example.com/acme\n\ngo 1.21\n");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await run(BASE_FLAGS);

    expect(existsSync(join(repoRoot, "wiki", "docs", "index.md"))).toBe(true);
    expect(existsSync(join(repoRoot, ".claude", "agents", "wiki.md"))).toBe(true);
    expect(existsSync(join(repoRoot, ".github"))).toBe(false);
    expect(existsSync(join(repoRoot, "Jenkinsfile.wiki"))).toBe(false);

    for (const section of ["getting-started", "guides", "architecture", "reference", "contributing"]) {
      expect(existsSync(join(repoRoot, "wiki", "docs", section))).toBe(true);
    }

    const index = readFileSync(join(repoRoot, "wiki", "docs", "index.md"), "utf8");
    expect(index).toContain("Acme");

    const written = [
      ...walkFiles(join(repoRoot, "wiki")),
      join(repoRoot, ".claude", "agents", "wiki.md"),
    ];
    for (const file of written) {
      expect(readFileSync(file, "utf8")).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }

    const output = log.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Go");
    expect(output).toContain("wiki-kit lint");
    expect(output).toContain("wiki-kit affected --strict");
  });

  it("running init a second time makes no further file changes (INIT-04)", async () => {
    writeFileSync(join(repoRoot, "go.mod"), "module example.com/acme\n\ngo 1.21\n");

    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(BASE_FLAGS);
    const before = snapshot(repoRoot);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(BASE_FLAGS);
    const after = snapshot(repoRoot);

    expect(after).toEqual(before);
    const output = log.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("already up to date");
  });

  it("writes the GitHub Actions CI file when .github/ exists", async () => {
    mkdirSync(join(repoRoot, ".github"));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await run(BASE_FLAGS);

    expect(existsSync(join(repoRoot, ".github", "workflows", "wiki.yml"))).toBe(true);
  });

  it("writes a hub: block when --hub-repo is passed, defaulting branch to main", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    await run([...BASE_FLAGS, "--hub-repo", "acme/hub"]);

    const config = readFileSync(join(repoRoot, "wiki", "wiki-kit.config.yaml"), "utf8");
    expect(config).toContain("hub:");
    expect(config).toContain("repo: acme/hub");
    expect(config).toContain("branch: main");
  });

  it("writes no hub: block when --hub-repo is omitted (non-interactive default: no hub)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    await run(BASE_FLAGS);

    const config = readFileSync(join(repoRoot, "wiki", "wiki-kit.config.yaml"), "utf8");
    expect(config).not.toContain("hub:");
  });

  it("fails non-interactively naming the missing flag when a required placeholder has no default", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(run(["--project", "Acme", "--org", "acme"])).rejects.toThrow(/--tagline/);
  });

  it("fails naming --force on a second run with a hand-edited file and no TTY", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(BASE_FLAGS);
    writeFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "hand edited");

    await expect(run(BASE_FLAGS)).rejects.toThrow(/--force/);
  });

  it("overwrites with --force and never prompts", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(BASE_FLAGS);
    writeFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "hand edited");

    await run([...BASE_FLAGS, "--force"]);

    expect(readFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "utf8")).not.toBe("hand edited");
  });
});
