import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectCi } from "../../src/init/ci-select.js";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-ci-select-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe("selectCi", () => {
  it("returns github when .github/ exists", () => {
    mkdirSync(join(repoRoot, ".github"));
    expect(selectCi(repoRoot)).toBe("github");
  });

  it("returns jenkins when Jenkinsfile exists and .github/ doesn't", () => {
    writeFileSync(join(repoRoot, "Jenkinsfile"), "");
    expect(selectCi(repoRoot)).toBe("jenkins");
  });

  it("returns manual when neither exists", () => {
    expect(selectCi(repoRoot)).toBe("manual");
  });
});
