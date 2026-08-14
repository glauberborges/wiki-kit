// `wiki-kit update` — dispatch the configured agent CLI to refresh affected
// wiki pages, fire-and-forget. Calls ingest-prompt's buildIngestPrompt
// directly (not a copy) so the dispatched prompt can never drift from what
// `wiki-kit ingest-prompt` prints (design.md).

import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, openSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { parseArgs } from "node:util";
import { computeAffected, resolveBase } from "../core/base-ref.js";
import { loadConfig } from "../core/config.js";
import { findRepoRoot, loadPages } from "../core/pages.js";
import { buildIngestPrompt } from "./ingest-prompt.js";

function isExecutableFile(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function missingBinaryError(name: string): Error {
  return new Error(
    `Agent CLI "${name}" (from update.agent in wiki/wiki-kit.config.yaml) was not found on PATH — ` +
      "install it, or point update.agent at the correct binary name.",
  );
}

/**
 * Stdlib-only PATH search — no `which` shell-out, so resolving one binary
 * never depends on another external binary being present.
 */
function resolveOnPath(name: string): string {
  if (name.includes("/") || name.includes("\\")) {
    if (isExecutableFile(name)) return name;
    throw missingBinaryError(name);
  }

  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  // PATHEXT only matters on Windows — elsewhere "" is the only extension to try.
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, `${name}${ext}`);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  throw missingBinaryError(name);
}

export function run(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { base: { type: "string" } },
    strict: false,
    allowPositionals: true,
  });

  const repoRoot = findRepoRoot(process.cwd());
  const wikiDir = join(repoRoot, "wiki");
  const config = loadConfig(wikiDir);

  const agent = config.update?.agent;
  if (!agent) {
    throw new Error(
      `${join(wikiDir, "wiki-kit.config.yaml")} has no "update.agent" set — add an ` +
        '"update:\n  agent: <cli-name>" block (e.g. claude, codex) before running `wiki-kit update`.',
    );
  }

  // Resolved before touching the affected-pages computation (UPD-03): a
  // missing binary must fail before any work is done, not after.
  const binaryPath = resolveOnPath(agent);

  const docsDir = join(wikiDir, "docs");
  const pages = loadPages(wikiDir);
  const explicitBase = typeof values.base === "string" ? values.base : null;
  const { ref: base, from: baseFrom } = resolveBase(explicitBase, process.env, repoRoot);
  const result = computeAffected(pages, repoRoot, docsDir, wikiDir, base, baseFrom);

  if (result.affected.size === 0 && result.uncovered.length === 0) {
    console.log("No pages affected by the diff — nothing to dispatch.");
    return;
  }

  const prompt = buildIngestPrompt(pages, result, base);

  const logDir = join(wikiDir, ".wiki-kit");
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "update.log");
  // Two separate opens (not one fd reused for both), matching the exact
  // pattern Node's own docs verify for a detached+redirected child — see
  // "Redirecting child process output to files" in child_process.md.
  const outFd = openSync(logPath, "a");
  const errFd = openSync(logPath, "a");

  const child = spawn(binaryPath, [prompt], {
    detached: true,
    stdio: ["ignore", outFd, errFd],
  });
  child.unref();

  console.log(`Dispatched ${agent} to update ${result.affected.size} page(s) — see wiki/.wiki-kit/update.log.`);
}
