import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { selectCi } from "./ci-select.js";
import { substitutePlaceholders, type InitAnswers as PlaceholderAnswers } from "./placeholders.js";
import type { HubAnswer } from "./prompts.js";

// placeholders.ts and prompts.ts each define their own narrow InitAnswers —
// scaffold needs both (the 7 template tokens AND the hub decision), so this
// combines them instead of importing either name directly.
export interface ScaffoldAnswers extends PlaceholderAnswers {
  hub?: HubAnswer | null;
}

export interface ScaffoldResult {
  written: string[];
  skipped: string[];
  conflicts: string[];
  ci: "github" | "jenkins" | "manual";
}

const CONFIG_TEMPLATE_REL = "wiki-kit.config.yaml";

interface PlanEntry {
  relPath: string;
  absPath: string;
  content: string;
}

function resolveTemplatesRoot(): string {
  // Both dist/init/scaffold.js and src/init/scaffold.ts (under vitest) sit two
  // levels below the package root, so the same relative offset resolves either way.
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function withHubBlock(content: string, hub: HubAnswer | null | undefined): string {
  if (!hub) return content;
  const base = content.endsWith("\n") ? content : `${content}\n`;
  return `${base}hub:\n  repo: ${hub.repo}\n  branch: ${hub.branch}\n`;
}

function renderFile(absSrc: string, answers: ScaffoldAnswers, wikiRelPath?: string): string {
  const raw = readFileSync(absSrc, "utf8");
  const rendered = raw.includes("{{") ? substitutePlaceholders(raw, answers) : raw;
  return wikiRelPath === CONFIG_TEMPLATE_REL ? withHubBlock(rendered, answers.hub) : rendered;
}

function makeEntry(repoRoot: string, absPath: string, content: string): PlanEntry {
  return { relPath: relative(repoRoot, absPath), absPath, content };
}

function buildPlan(
  repoRoot: string,
  answers: ScaffoldAnswers,
  ci: "github" | "jenkins" | "manual",
): PlanEntry[] {
  const templatesRoot = resolveTemplatesRoot();
  const entries: PlanEntry[] = [];

  const wikiTemplateRoot = join(templatesRoot, "wiki");
  for (const absSrc of walkFiles(wikiTemplateRoot)) {
    const rel = relative(wikiTemplateRoot, absSrc);
    // npm's packer hardcodes .gitignore/.npmignore out of every published
    // tarball, `files` allowlist or not — the template ships dotless as
    // `gitignore` and is renamed back here, the standard workaround for that
    // npm limitation. Confirmed by extracting a real `npm pack` tarball.
    const targetRel = rel === "gitignore" ? ".gitignore" : rel;
    const absTarget = join(repoRoot, "wiki", targetRel);
    entries.push(makeEntry(repoRoot, absTarget, renderFile(absSrc, answers, rel)));
  }

  const agentSrc = join(templatesRoot, "claude", "agents", "wiki.md");
  entries.push(
    makeEntry(repoRoot, join(repoRoot, ".claude", "agents", "wiki.md"), renderFile(agentSrc, answers)),
  );

  if (ci === "github") {
    const src = join(templatesRoot, "github", "wiki.yml");
    entries.push(
      makeEntry(
        repoRoot,
        join(repoRoot, ".github", "workflows", "wiki.yml"),
        renderFile(src, answers),
      ),
    );
  } else if (ci === "jenkins") {
    const src = join(templatesRoot, "jenkins", "Jenkinsfile.wiki");
    entries.push(makeEntry(repoRoot, join(repoRoot, "Jenkinsfile.wiki"), renderFile(src, answers)));
  }

  return entries;
}

async function confirmOverwrite(files: string[]): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const list = files.map((f) => `  - ${f}`).join("\n");
    const answer = await rl.question(
      `init: the following files already exist and differ from the template:\n${list}\nOverwrite all? (y/N): `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function conflictMessage(verb: string, files: string[]): string {
  return `init: ${verb} — ${files.length} file(s) already exist and differ: ${files.join(", ")}. Re-run with --force to overwrite, or resolve manually.`;
}

/** Idempotent template copy into `<repoRoot>/wiki`, `.claude/agents/wiki.md`, and the selected CI file. */
export async function scaffold(
  repoRoot: string,
  answers: ScaffoldAnswers,
  opts: { force: boolean },
): Promise<ScaffoldResult> {
  const ci = selectCi(repoRoot);
  const plan = buildPlan(repoRoot, answers, ci);

  const toWrite: PlanEntry[] = [];
  const skipped: string[] = [];
  const conflicting: PlanEntry[] = [];

  for (const entry of plan) {
    if (!existsSync(entry.absPath)) {
      toWrite.push(entry);
      continue;
    }
    if (readFileSync(entry.absPath, "utf8") === entry.content) {
      skipped.push(entry.relPath);
      continue;
    }
    conflicting.push(entry);
  }

  if (conflicting.length > 0) {
    if (!opts.force) {
      const files = conflicting.map((c) => c.relPath);
      if (process.stdin.isTTY !== true) {
        throw new Error(conflictMessage("cannot prompt for confirmation (no TTY)", files));
      }
      const proceed = await confirmOverwrite(files);
      if (!proceed) {
        throw new Error(conflictMessage("aborted", files));
      }
    }
    toWrite.push(...conflicting);
  }

  for (const entry of toWrite) {
    mkdirSync(dirname(entry.absPath), { recursive: true });
    writeFileSync(entry.absPath, entry.content, "utf8");
  }

  return {
    written: toWrite.map((e) => e.relPath),
    skipped,
    conflicts: conflicting.map((e) => e.relPath),
    ci,
  };
}
