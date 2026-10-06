// `hub-push` — copy this repo's generated artifacts into a checkout of the
// configured hub repo, commit, push. Genuinely new: the reference
// implementation has no cross-repo code to port (design.md).

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { loadConfig } from "../core/config.js";
import { runCli } from "../core/entrypoint.js";
import { findRepoRoot } from "../core/pages.js";

const ARTIFACT_FILES: Record<string, string> = {
  llms: "llms.txt",
  "llms-full": "llms-full.txt",
  map: "map.json",
  okf: "okf",
};

export function run(): void {
  const repoRoot = findRepoRoot(process.cwd());
  const wikiDir = join(repoRoot, "wiki");
  const config = loadConfig(wikiDir);

  const outDir = join(wikiDir, config.output.dir);
  const fileNames = artifactFileNames(config.output.artifacts);
  const missing = fileNames.filter((name) => !existsSync(join(outDir, name)));
  if (missing.length > 0) {
    throw new Error(
      `Missing artifact(s) under ${outDir}: ${missing.join(", ")} — run the llms script first to generate them.`,
    );
  }

  // Checked before any git call (HUB-02) — a doomed clone/push attempt would
  // waste a network round-trip just to fail on auth.
  const token = process.env.WIKI_HUB_TOKEN;
  if (!token) {
    throw new Error(
      "WIKI_HUB_TOKEN is not set — hub push needs a write-scoped GitHub token in this environment " +
        "variable before it can push to the hub repo. Set WIKI_HUB_TOKEN and re-run.",
    );
  }

  if (!config.hub) {
    throw new Error(
      `${join(wikiDir, "wiki-kit.config.yaml")} has no "hub:" block — run this skill's init workflow and opt ` +
        "into hub connection, or add hub.repo/hub.branch to the config manually before running hub-push.",
    );
  }
  const { repo, branch } = config.hub;
  const repoName = deriveRepoName(repoRoot);

  const workDir = mkdtempSync(join(tmpdir(), "wiki-kit-hub-"));
  try {
    pushToHub({ workDir, repo, branch, repoName, token, outDir, fileNames });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function artifactFileNames(keys: string[]): string[] {
  return keys.map((key) => {
    const fileName = ARTIFACT_FILES[key];
    if (!fileName) {
      throw new Error(
        `Unknown output.artifacts entry "${key}" in wiki-kit.config.yaml — expected one of: ${Object.keys(ARTIFACT_FILES).join(", ")}.`,
      );
    }
    return fileName;
  });
}

function deriveRepoName(repoRoot: string): string {
  const pkgPath = join(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: unknown };
      if (typeof pkg.name === "string" && pkg.name.trim() !== "") {
        const name = pkg.name.trim();
        // Scoped package (`@org/name`) — the hub groups by repo, not by npm scope.
        return name.startsWith("@") ? (name.split("/")[1] ?? name) : name;
      }
    } catch {
      // Malformed package.json isn't this command's problem to diagnose — fall
      // through to the directory name, same as an unnamed/manifest-less repo.
    }
  }
  return basename(repoRoot);
}

// Writes a helper git invokes for the HTTPS password prompt. It reads the
// token from its own inherited environment rather than having the token
// embedded in it — the script file itself never contains the secret, and the
// secret never appears as a command-line argument (git clone/push URL or
// otherwise), which is what would show up in `ps` output and in Node's own
// "Command failed: <cmd> <args>" error text on a thrown exec error.
function writeAskpass(dir: string): string {
  const scriptPath = join(dir, "askpass.sh");
  writeFileSync(scriptPath, '#!/bin/sh\nprintf \'%s\' "$WIKI_HUB_TOKEN"\n', { mode: 0o700 });
  return scriptPath;
}

function gitEnv(token: string, askpassPath: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    WIKI_HUB_TOKEN: token,
    GIT_ASKPASS: askpassPath,
    // Never fall back to an interactive prompt (design.md's integration-point note).
    GIT_TERMINAL_PROMPT: "0",
  };
}

function runGit(gitArgs: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  execFileSync("git", gitArgs, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
}

function gitStatus(cwd: string, env: NodeJS.ProcessEnv): string {
  return execFileSync("git", ["status", "--porcelain"], { cwd, env, encoding: "utf8" });
}

interface PushParams {
  workDir: string;
  repo: string;
  branch: string;
  repoName: string;
  token: string;
  outDir: string;
  fileNames: string[];
}

function pushToHub({ workDir, repo, branch, repoName, token, outDir, fileNames }: PushParams): void {
  const askpassPath = writeAskpass(workDir);
  const env = gitEnv(token, askpassPath);
  const checkoutDir = join(workDir, "checkout");
  // Username-only URL — the token itself is delivered exclusively via the
  // GIT_ASKPASS helper above, never concatenated into this string.
  const url = `https://x-access-token@github.com/${repo}.git`;

  try {
    runGit(["clone", "--quiet", url, checkoutDir], workDir, env);
  } catch (err) {
    throw new Error(
      `Could not clone hub repo ${repo} — check WIKI_HUB_TOKEN has push access and the repo exists. ${errorDetail(err)}`,
    );
  }

  runGit(["config", "user.name", "wiki-kit"], checkoutDir, env);
  runGit(["config", "user.email", "wiki-kit@users.noreply.github.com"], checkoutDir, env);

  try {
    runGit(["checkout", branch], checkoutDir, env);
  } catch {
    runGit(["checkout", "-b", branch], checkoutDir, env);
  }

  const destDir = join(checkoutDir, "docs", repoName);
  mkdirSync(destDir, { recursive: true });
  for (const name of fileNames) {
    cpSync(join(outDir, name), join(destDir, name), { recursive: true });
  }

  runGit(["add", join("docs", repoName)], checkoutDir, env);

  if (gitStatus(checkoutDir, env).trim() === "") {
    console.log(`Hub already up to date — no changes to docs/${repoName}.`);
    return;
  }

  runGit(["commit", "--quiet", "-m", `wiki-kit hub push: update docs/${repoName}`], checkoutDir, env);

  try {
    runGit(["push", "--quiet", "origin", branch], checkoutDir, env);
  } catch (err) {
    // HUB-03 / context.md: fail the job directly, no retry, no rebase attempt.
    throw new Error(
      `git push to ${repo} (${branch}) was rejected — another repo likely pushed to the hub concurrently. ` +
        `Re-run the hub-push script after checking the hub's history; it does not retry or rebase ` +
        `automatically. ${errorDetail(err)}`,
    );
  }

  console.log(`Pushed docs/${repoName} to ${repo}@${branch}.`);
}

// Node's own execFileSync error message already includes argv and captured
// stderr — safe to surface as-is here because the token never appears in
// argv (see the URL/askpass note above), only ever in an env var.
function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

runCli(import.meta.url, run);
