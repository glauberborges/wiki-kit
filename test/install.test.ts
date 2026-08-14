// The only test that runs the shipped tarball, not the source tree — it's the
// sole thing in this suite that would catch a broken `bin`/`files`/
// `publishConfig` before a real `npm publish` (CLAUDE.md's own rationale).
// Slower than the rest of the suite on purpose: real `npm pack` + `npm install`.

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FIXTURE_CONFIG_SRC = join(REPO_ROOT, "templates", "wiki", "wiki-kit.config.yaml");

let packDir: string;
let installDir: string;
let tarballPath: string;

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd });
}

describe("real install (npm pack -> npm install -> wiki-kit lint)", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "build"], { cwd: REPO_ROOT });

    // --pack-destination keeps the tarball out of the repo working tree
    // entirely, so a crash before afterAll can't leave a stray .tgz to commit.
    packDir = mkdtempSync(join(tmpdir(), "wiki-kit-pack-"));
    const packOut = execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", packDir],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    const [{ filename }] = JSON.parse(packOut) as [{ filename: string }];
    tarballPath = join(packDir, filename);

    installDir = mkdtempSync(join(tmpdir(), "wiki-kit-install-"));
    writeFileSync(
      join(installDir, "package.json"),
      JSON.stringify({ name: "wiki-kit-install-fixture", private: true }, null, 2),
    );

    // Installing the tarball, not the local source directory, is the entire
    // point: a broken `bin`/`files`/`publishConfig` only shows up once npm has
    // actually packed and unpacked the package.
    execFileSync(
      "npm",
      ["install", tarballPath, "--no-audit", "--no-fund", "--no-save"],
      { cwd: installDir, encoding: "utf8" },
    );

    git(["init", "-q"], installDir);
    git(["config", "user.email", "install-test@example.com"], installDir);
    git(["config", "user.name", "install-test"], installDir);

    const docsDir = join(installDir, "wiki", "docs");
    mkdirSync(join(docsDir, "guides"), { recursive: true });
    writeFileSync(
      join(docsDir, "index.md"),
      '---\ntitle: "Install Fixture"\nsidebar_position: 1\n---\n\nMinimal fixture wiki for the real-install structural test.\n',
    );
    writeFileSync(
      join(docsDir, "guides", "example.md"),
      '---\ntype: Guide\ntitle: "Example"\n---\n\n# Example\n\nA clean page — no rule in the 11-rule registry should fire against it.\n',
    );
    copyFileSync(FIXTURE_CONFIG_SRC, join(installDir, "wiki", "wiki-kit.config.yaml"));

    git(["add", "-A"], installDir);
    git(["commit", "-q", "-m", "fixture"], installDir);
  }, 180_000);

  afterAll(() => {
    if (packDir) rmSync(packDir, { recursive: true, force: true });
    if (installDir) rmSync(installDir, { recursive: true, force: true });
  });

  it("installs the packed tarball with the bin shim and dist/templates present", () => {
    expect(existsSync(join(installDir, "node_modules", ".bin", "wiki-kit"))).toBe(true);
    expect(existsSync(join(installDir, "node_modules", "@glauberborges", "wiki-kit", "dist", "cli.js"))).toBe(true);
    expect(existsSync(join(installDir, "node_modules", "@glauberborges", "wiki-kit", "templates", "wiki"))).toBe(true);
  });

  it("runs the installed `wiki-kit lint` binary and exits 0 against a clean fixture", () => {
    const bin = join(installDir, "node_modules", ".bin", "wiki-kit");

    const result = spawnSync(bin, ["lint"], { cwd: installDir, encoding: "utf8" });

    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("0 error(s)");
    expect(result.stdout).toContain("0 warning(s)");
    expect(result.status).toBe(0);
  }, 30_000);
});
