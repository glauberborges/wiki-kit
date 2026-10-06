import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { question, close } = vi.hoisted(() => ({
  question: vi.fn(),
  close: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({ question, close })),
}));

import { loadConfig } from "../../src/core/config.js";
import { scaffold, type ScaffoldAnswers } from "../../src/init/scaffold.js";

let repoRoot: string;
let originalIsTTY: boolean | undefined;

const ANSWERS: ScaffoldAnswers = {
  project: "acme-app",
  org: "acme",
  repo: "acme-app",
  locale: "en",
  searchLang: "en",
  tagline: "Docs that verify themselves",
  taglineLong: "Docs that verify themselves against the code they describe",
};

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-scaffold-"));
  originalIsTTY = process.stdin.isTTY;
  question.mockReset();
  close.mockReset();
});

afterEach(() => {
  process.stdin.isTTY = originalIsTTY;
  rmSync(repoRoot, { recursive: true, force: true });
});

describe("scaffold", () => {
  it("writes the wiki skeleton and the agent file on a fresh repo, with no CI dir", async () => {
    const result = await scaffold(repoRoot, ANSWERS, { force: false });

    expect(result.ci).toBe("manual");
    expect(result.conflicts).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.written).toContain("wiki/wiki-kit.config.yaml");
    expect(result.written).toContain("wiki/AUTHORING.md");
    expect(result.written).toContain(".claude/agents/wiki.md");
    expect(result.written.some((f) => f.startsWith(".github/"))).toBe(false);
    expect(result.written.some((f) => f === "Jenkinsfile.wiki")).toBe(false);

    expect(existsSync(join(repoRoot, "wiki", "docs", "index.md"))).toBe(true);
    const index = readFileSync(join(repoRoot, "wiki", "docs", "index.md"), "utf8");
    expect(index).not.toContain("{{");
    expect(index).toContain("acme-app");
  });

  it("vendors the verification engine into wiki/.wiki-kit/scripts/ so CI never needs the skill again", async () => {
    const result = await scaffold(repoRoot, ANSWERS, { force: false });

    for (const rel of [
      "wiki/.wiki-kit/scripts/core/pages.js",
      "wiki/.wiki-kit/scripts/core/lint-rules.js",
      "wiki/.wiki-kit/scripts/commands/lint.js",
      "wiki/.wiki-kit/scripts/commands/affected.js",
      "wiki/.wiki-kit/scripts/commands/llms.js",
      "wiki/.wiki-kit/scripts/commands/hub.js",
      "wiki/.wiki-kit/package.json",
    ]) {
      expect(result.written).toContain(rel);
      expect(existsSync(join(repoRoot, ...rel.split("/")))).toBe(true);
    }
    expect(existsSync(join(repoRoot, "wiki", ".wiki-kit", "scripts", "init"))).toBe(false);
  });

  it("selects the github CI file when .github/ exists", async () => {
    mkdirSync(join(repoRoot, ".github"));
    const result = await scaffold(repoRoot, ANSWERS, { force: false });

    expect(result.ci).toBe("github");
    expect(result.written).toContain(".github/workflows/wiki.yml");
    expect(existsSync(join(repoRoot, ".github", "workflows", "wiki.yml"))).toBe(true);
  });

  it("selects the jenkins CI file when Jenkinsfile exists and .github/ doesn't", async () => {
    writeFileSync(join(repoRoot, "Jenkinsfile"), "");
    const result = await scaffold(repoRoot, ANSWERS, { force: false });

    expect(result.ci).toBe("jenkins");
    expect(result.written).toContain("Jenkinsfile.wiki");
    expect(existsSync(join(repoRoot, "Jenkinsfile.wiki"))).toBe(true);
  });

  it("is idempotent: a second run with no conflicts makes zero file changes", async () => {
    await scaffold(repoRoot, ANSWERS, { force: false });
    const second = await scaffold(repoRoot, ANSWERS, { force: false });

    expect(second.written).toEqual([]);
    expect(second.conflicts).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
    expect(question).not.toHaveBeenCalled();
  });

  it("fails naming the conflicting files and --force when no TTY and no --force", async () => {
    await scaffold(repoRoot, ANSWERS, { force: false });
    writeFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "tampered content");
    process.stdin.isTTY = false;

    await expect(scaffold(repoRoot, ANSWERS, { force: false })).rejects.toThrow(
      /wiki\/AUTHORING\.md.*--force/s,
    );
    expect(question).not.toHaveBeenCalled();
  });

  it("collects every conflict into one batch prompt, never per-file, and overwrites on confirmation", async () => {
    await scaffold(repoRoot, ANSWERS, { force: false });
    writeFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "tampered 1");
    writeFileSync(join(repoRoot, "wiki", "Makefile"), "tampered 2");
    process.stdin.isTTY = true;
    question.mockResolvedValueOnce("y");

    const result = await scaffold(repoRoot, ANSWERS, { force: false });

    expect(question).toHaveBeenCalledTimes(1);
    const prompt = question.mock.calls[0][0] as string;
    expect(prompt).toContain("wiki/AUTHORING.md");
    expect(prompt).toContain("wiki/Makefile");
    expect(result.conflicts.sort()).toEqual(["wiki/AUTHORING.md", "wiki/Makefile"]);
    expect(result.written).toEqual(expect.arrayContaining(["wiki/AUTHORING.md", "wiki/Makefile"]));
    expect(readFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "utf8")).not.toBe("tampered 1");
  });

  it("aborts and leaves files untouched when the batch confirmation is declined", async () => {
    await scaffold(repoRoot, ANSWERS, { force: false });
    writeFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "tampered");
    process.stdin.isTTY = true;
    question.mockResolvedValueOnce("n");

    await expect(scaffold(repoRoot, ANSWERS, { force: false })).rejects.toThrow(/aborted/);
    expect(readFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "utf8")).toBe("tampered");
  });

  it("overwrites conflicts with --force and never prompts", async () => {
    await scaffold(repoRoot, ANSWERS, { force: false });
    writeFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "tampered");

    const result = await scaffold(repoRoot, ANSWERS, { force: true });

    expect(question).not.toHaveBeenCalled();
    expect(result.written).toContain("wiki/AUTHORING.md");
    expect(readFileSync(join(repoRoot, "wiki", "AUTHORING.md"), "utf8")).not.toBe("tampered");
  });

  it("writes a hub block that loadConfig can read back when hub is opted into", async () => {
    const withHub: ScaffoldAnswers = { ...ANSWERS, hub: { repo: "acme/hub", branch: "main" } };
    await scaffold(repoRoot, withHub, { force: false });

    const config = loadConfig(join(repoRoot, "wiki"));
    expect(config.hub).toEqual({ repo: "acme/hub", branch: "main" });
  });

  it("ships no hub block when hub was declined", async () => {
    await scaffold(repoRoot, { ...ANSWERS, hub: null }, { force: false });

    const config = loadConfig(join(repoRoot, "wiki"));
    expect(config.hub).toBeUndefined();
    const raw = readFileSync(join(repoRoot, "wiki", "wiki-kit.config.yaml"), "utf8");
    expect(raw).not.toContain("hub:");
  });

  it("never writes outside wiki/, .claude/agents/wiki.md, or the selected CI file", async () => {
    mkdirSync(join(repoRoot, ".github"));
    const result = await scaffold(repoRoot, ANSWERS, { force: false });

    for (const f of result.written) {
      const allowed =
        f.startsWith("wiki/") || f === ".claude/agents/wiki.md" || f === ".github/workflows/wiki.yml";
      expect(allowed).toBe(true);
    }
  });
});
