import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectStack } from "../../src/init/detect-stack.js";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-detect-stack-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function touch(name: string): void {
  writeFileSync(join(repoRoot, name), "");
}

describe("detectStack", () => {
  it("detects Go from go.mod", () => {
    touch("go.mod");
    expect(detectStack(repoRoot)).toEqual([{ manifest: "go.mod", stack: "Go" }]);
  });

  it("detects PHP from composer.json", () => {
    touch("composer.json");
    expect(detectStack(repoRoot)).toEqual([
      { manifest: "composer.json", stack: "PHP" },
    ]);
  });

  it("detects Node/TS from package.json", () => {
    touch("package.json");
    expect(detectStack(repoRoot)).toEqual([
      { manifest: "package.json", stack: "Node/TS" },
    ]);
  });

  it("detects Python from pyproject.toml", () => {
    touch("pyproject.toml");
    expect(detectStack(repoRoot)).toEqual([
      { manifest: "pyproject.toml", stack: "Python" },
    ]);
  });

  it("detects Python from setup.cfg", () => {
    touch("setup.cfg");
    expect(detectStack(repoRoot)).toEqual([
      { manifest: "setup.cfg", stack: "Python" },
    ]);
  });

  it("detects Rust from Cargo.toml", () => {
    touch("Cargo.toml");
    expect(detectStack(repoRoot)).toEqual([
      { manifest: "Cargo.toml", stack: "Rust" },
    ]);
  });

  it("detects Java/Kotlin from pom.xml", () => {
    touch("pom.xml");
    expect(detectStack(repoRoot)).toEqual([
      { manifest: "pom.xml", stack: "Java/Kotlin" },
    ]);
  });

  it("detects Java/Kotlin from build.gradle", () => {
    touch("build.gradle");
    expect(detectStack(repoRoot)).toEqual([
      { manifest: "build.gradle", stack: "Java/Kotlin" },
    ]);
  });

  it("detects Ruby from Gemfile", () => {
    touch("Gemfile");
    expect(detectStack(repoRoot)).toEqual([
      { manifest: "Gemfile", stack: "Ruby" },
    ]);
  });

  it("returns all matches for a polyglot monorepo", () => {
    touch("go.mod");
    touch("package.json");
    expect(detectStack(repoRoot)).toEqual([
      { manifest: "go.mod", stack: "Go" },
      { manifest: "package.json", stack: "Node/TS" },
    ]);
  });

  it("returns null when no manifest is recognized", () => {
    touch("README.md");
    expect(detectStack(repoRoot)).toBeNull();
  });

  it("never throws on an empty repo", () => {
    expect(() => detectStack(repoRoot)).not.toThrow();
    expect(detectStack(repoRoot)).toBeNull();
  });
});
