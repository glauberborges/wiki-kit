// Structural test — this repo's equivalent of "install the real package and
// run it" now that there's no npm publish step. Proves the actual shipped
// promise: after `init`, the scripts vendored into wiki/.wiki-kit/ run
// standalone as a real Node subprocess, with no reference back to this
// checkout, no node_modules, and no warnings (which would mean a missing
// "type": "module" boundary — see scaffold.ts's collectScriptEntries).

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INIT_SCRIPT = join(REPO_ROOT, "wiki-kit", "scripts", "commands", "init.js");

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-vendored-"));
  execFileSync("git", ["init", "-q"], { cwd: repoRoot });
  execFileSync(
    "node",
    [
      INIT_SCRIPT,
      "--project",
      "Acme",
      "--org",
      "acme",
      "--tagline",
      "Docs that verify themselves",
      "--tagline-long",
      "Docs that verify themselves against the code they describe.",
    ],
    { cwd: repoRoot, stdio: "pipe" },
  );
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

it("runs the vendored lint script standalone: real output, no ESM-reparse warning", () => {
  const lintScript = join(repoRoot, "wiki", ".wiki-kit", "scripts", "commands", "lint.js");

  // spawnSync, not execFileSync — lint exits non-zero on the freshly-scaffolded
  // wiki's own placeholder content, which execFileSync would throw on.
  const { stdout, stderr } = spawnSync("node", [lintScript], { cwd: repoRoot, encoding: "utf8" });

  expect(stdout).toMatch(/\d+ pages · \d+ error\(s\) · \d+ warning\(s\)/);
  // A missing "type": "module" boundary (see collectScriptEntries) makes Node
  // fall back to reparsing every vendored script on every run — a real,
  // measurable cost in CI, not just log noise.
  expect(stderr).not.toContain("MODULE_TYPELESS_PACKAGE_JSON");
});

it("runs the vendored affected script standalone", () => {
  const affectedScript = join(repoRoot, "wiki", ".wiki-kit", "scripts", "commands", "affected.js");

  const { stdout } = spawnSync("node", [affectedScript], { cwd: repoRoot, encoding: "utf8" });

  expect(stdout).toContain("file(s)");
});
