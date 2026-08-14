import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Exact marker list named by FOUNDATION.md §9 — do not extend it here; adding
// markers it doesn't name would make this test check something the decision
// record never agreed to.
const PORTUGUESE_MARKERS = ["ção", "ções", "não", "página", "arquivo", "código"];

// dist/ isn't committed and may not exist in a bare checkout, so this scans
// src/ instead — src/ is what dist/ is compiled from, i.e. the real source
// of truth for what ships.
const SCAN_ROOTS = ["src", "bin", "templates"];

// FOUNDATION.md §9 allow-lists FOUNDATION.md and the opening session prompt
// (PROMPTSESSAONOVA.md). Neither lives under src/, bin/, or templates/, so
// SCAN_ROOTS never reaches them — no active exclusion logic is needed, this
// comment just records that the allowlist is honored by construction.

interface Violation {
  file: string;
  marker: string;
  line: number;
  text: string;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
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
  it("finds zero Portuguese residue in src/, bin/, and templates/", () => {
    const violations = findViolations();

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} — marker "${v.marker}" — ${v.text}`)
        .join("\n");
      expect.fail(`Portuguese residue found in the publishable package:\n${report}`);
    }
  });
});
