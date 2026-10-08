import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Exact marker list named by FOUNDATION.md §9 — do not extend it here; adding
// markers it doesn't name would make this test check something the decision
// record never agreed to.
const PORTUGUESE_MARKERS = ["ção", "ções", "não", "página", "arquivo", "código"];

// wiki-kit/scripts/ is compiled from src/ 1:1 — scanning src/ (the source of
// truth) already covers it, without requiring a build before this test can
// run. wiki-kit/SKILL.md and wiki-kit/assets/ are scanned directly — they
// have no src/ equivalent.
const SCAN_ROOTS = ["src", "wiki-kit/assets", "wiki-kit/SKILL.md"];

// FOUNDATION.md §9 allow-lists FOUNDATION.md and the opening session prompt
// (PROMPTSESSAONOVA.md). Neither is in SCAN_ROOTS, so no active exclusion
// logic is needed — this comment just records that the allowlist is honored
// by construction.

interface Violation {
  file: string;
  marker: string;
  line: number;
  text: string;
}

function walk(target: string): string[] {
  if (statSync(target).isFile()) return [target];
  const files: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = join(target, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(REPO_ROOT, root))) {
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, index) => {
        for (const marker of PORTUGUESE_MARKERS) {
          if (line.includes(marker)) {
            violations.push({
              file: relative(REPO_ROOT, file),
              marker,
              line: index + 1,
              text: line.trim(),
            });
          }
        }
      });
    }
  }
  return violations;
}

describe("language gate", () => {
  it("finds zero Portuguese residue in src/, wiki-kit/assets/, and wiki-kit/SKILL.md", () => {
    const violations = findViolations();

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} — marker "${v.marker}" — ${v.text}`)
        .join("\n");
      expect.fail(`Portuguese residue found in the publishable package:\n${report}`);
    }
  });
});
