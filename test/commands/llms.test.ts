import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/commands/llms.js";

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

const CONFIG = [
  "rules:",
  "  staleness: { severity: warn }",
  "okf:",
  "  types: [Architecture]",
  "output:",
  "  dir: static",
  "  artifacts: [llms, llms-full, map, okf]",
  "  llms-max-kb: 8",
].join("\n");

describe("wiki-kit llms", () => {
  let repoRoot: string;
  let wikiDir: string;
  let docsDir: string;
  let originalCwd: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-llms-cmd-"));
    initGitRepo(repoRoot);

    wikiDir = join(repoRoot, "wiki");
    docsDir = join(wikiDir, "docs");
    mkdirSync(join(docsDir, "architecture"), { recursive: true });
    mkdirSync(join(repoRoot, "src", "core"), { recursive: true });

    writeFileSync(join(wikiDir, "wiki-kit.config.yaml"), CONFIG);
    writeFileSync(
      join(wikiDir, "docusaurus.config.js"),
      "module.exports = {\n  title: 'Acme Wiki',\n  tagline: 'Docs that stay true',\n};\n",
    );
    writeFileSync(join(docsDir, "index.md"), ["---", "title: Home", "---", "", "Welcome.", ""].join("\n"));
    writeFileSync(join(docsDir, "architecture", "_category_.json"), JSON.stringify({ label: "Architecture", position: 1 }));
    writeFileSync(
      join(docsDir, "architecture", "overview.md"),
      [
        "---",
        "type: Architecture",
        "sidebar_position: 1",
        "sources:",
        "  - resource: src/core/pages.ts",
        "---",
        "",
        "# Overview",
        "",
        "Architecture overview body.",
        "",
      ].join("\n"),
    );
    writeFileSync(join(repoRoot, "src", "core", "pages.ts"), "// fixture\n");

    execFileSync("git", ["add", "-A"], { cwd: repoRoot });
    execFileSync("git", ["commit", "-q", "-m", "Add fixture wiki"], { cwd: repoRoot });

    originalCwd = process.cwd();
    process.chdir(repoRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("writes llms.txt, llms-full.txt, map.json, and okf/ under the configured output dir", () => {
    run([]);

    const outDir = join(wikiDir, "static");
    expect(existsSync(join(outDir, "llms.txt"))).toBe(true);
    expect(existsSync(join(outDir, "llms-full.txt"))).toBe(true);
    expect(existsSync(join(outDir, "map.json"))).toBe(true);
    expect(existsSync(join(outDir, "okf", "index.md"))).toBe(true);

    const indexText = readFileSync(join(outDir, "llms.txt"), "utf8");
    expect(indexText).toContain("# Acme Wiki");
    expect(indexText).toContain("## Architecture");

    const fullText = readFileSync(join(outDir, "llms-full.txt"), "utf8");
    expect(fullText).toContain("Source: `wiki/docs/architecture/overview.md`");

    const map = JSON.parse(readFileSync(join(outDir, "map.json"), "utf8"));
    expect(map).toEqual({ "src/core/pages.ts": ["architecture/overview"] });

    expect(existsSync(join(outDir, "okf", "architecture", "overview.md"))).toBe(true);
  });

  it("throws naming wiki/docs when there are no pages to generate from", () => {
    rmSync(docsDir, { recursive: true, force: true });
    mkdirSync(docsDir, { recursive: true });

    expect(() => run([])).toThrow(/nothing to generate/);
  });
});
