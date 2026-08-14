// Generates the LLM-consumption layer from the same markdown pages the site
// serves: llms.txt (curated index), llms-full.txt (everything concatenated),
// map.json (reverse source-file → pages index), and an OKF-conformant
// okf/ bundle. Stdlib only — see CLAUDE.md invariant #1.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { WikiKitConfig } from "./config.js";
import { buildSourceMap, type Page } from "./pages.js";

export interface SiteMeta {
  title: string;
  tagline: string;
}

/**
 * Title/tagline live in docusaurus.config.js. Reading them by regex avoids
 * importing the config, which would pull in the entire Docusaurus toolchain.
 */
export function siteMeta(wikiDir: string): SiteMeta {
  const file = path.join(wikiDir, "docusaurus.config.js");
  const src = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const pick = (key: string): string => new RegExp(`^\\s*${key}:\\s*['"\`](.*?)['"\`]`, "m").exec(src)?.[1] ?? "";
  return { title: pick("title") || "Wiki", tagline: pick("tagline") };
}

/** First useful sentence of the body — description fallback. */
export function summarize(body: string): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith(":::") && !l.startsWith("```") && !l.startsWith("|") && !l.startsWith("<"));
  if (!line) return "";
  const plain = line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
  const stop = plain.indexOf(". ");
  return stop > 40 ? plain.slice(0, stop + 1) : plain;
}

export function describe(page: Page): string {
  return page.description || summarize(page.body);
}

/**
 * The index. This format satisfies both llmstxt.org and OKF's index.md at
 * once — hence one generator with two output names.
 */
export function renderIndex(pages: Page[], meta: SiteMeta): string {
  const out = [`# ${meta.title}`, ""];
  if (meta.tagline) out.push(`> ${meta.tagline}`, "");

  const home = pages.find((p) => p.reserved && p.category === ".");
  if (home) {
    const d = describe(home);
    if (d) out.push(d, "");
  }

  out.push(
    "Each page below is a markdown file served alongside the site: swap the extension for `.md` to read the raw content. The full body of everything is in `llms-full.txt`.",
    "",
  );

  let currentCategory: string | null = null;
  for (const page of pages) {
    if (page.reserved) continue;
    if (page.category !== currentCategory) {
      if (currentCategory !== null) out.push("");
      currentCategory = page.category;
      out.push(`## ${page.categoryLabel || page.category}`, "");
    }
    const d = describe(page);
    out.push(`* [${page.title}](/${page.slug})${d ? ` - ${d}` : ""}`);
  }
  out.push("");
  return out.join("\n");
}

export function renderFull(pages: Page[], meta: SiteMeta): string {
  const out = [`# ${meta.title} — full content`, ""];
  if (meta.tagline) out.push(`> ${meta.tagline}`, "");
  out.push("Concatenation of every page in sidebar order. To browse before reading, use `llms.txt`.", "");
  for (const page of pages) {
    out.push("---", "", `# ${page.title}`, "", `Source: \`${page.repoRel}\``, "");
    if (page.sources.length) out.push(`Documents: ${page.sources.map((s) => `\`${s}\``).join(", ")}`, "");
    out.push(page.body.trim(), "");
  }
  return out.join("\n");
}

/**
 * OKF's log.md: directory history grouped by ISO date, newest first.
 * Generated from git — never hand-written.
 */
export function renderLog(repoRoot: string, docsRel: string, limit = 60): string {
  let raw = "";
  try {
    raw = execFileSync("git", ["log", `-${limit}`, "--date=short", "--format=%ad%x09%s", "--", docsRel], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "# Log\n\n(history unavailable)\n";
  }

  const byDate = new Map<string, string[]>();
  for (const line of raw.split("\n").filter(Boolean)) {
    const [date, subject] = line.split("\t");
    if (!date) continue;
    const subjects = byDate.get(date) ?? [];
    subjects.push(subject ?? "");
    byDate.set(date, subjects);
  }

  const out = ["# Log", ""];
  for (const [date, subjects] of byDate) {
    out.push(`## ${date}`, "");
    for (const s of subjects) out.push(`* **Update**: ${s}`);
    out.push("");
  }
  return out.join("\n");
}

/** The spec allows front matter only on the bundle root's index.md. */
function writeOkfBundle(okfDir: string, pages: Page[], indexText: string, logText: string): void {
  fs.rmSync(okfDir, { recursive: true, force: true });
  for (const page of pages) {
    if (page.reserved) continue;
    const dest = path.join(okfDir, page.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(page.file, dest);
  }
  fs.writeFileSync(path.join(okfDir, "index.md"), `---\nokf_version: 0.2\n---\n\n${indexText}`);
  fs.writeFileSync(path.join(okfDir, "log.md"), logText);
}

const kb = (s: string): string => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;

/**
 * Writes llms.txt, llms-full.txt, map.json, and the okf/ bundle under
 * `<wikiDir>/<config.output.dir>`, restricted to the artifacts listed in
 * `config.output.artifacts`.
 */
export function writeArtifacts(pages: Page[], wikiDir: string, repoRoot: string, config: WikiKitConfig): void {
  const docsDir = path.join(wikiDir, "docs");
  if (pages.length === 0) {
    throw new Error(`No pages found under ${docsDir} — nothing to generate.`);
  }

  const meta = siteMeta(wikiDir);
  const indexText = renderIndex(pages, meta);
  const fullText = renderFull(pages, meta);
  const docsRel = path.relative(repoRoot, docsDir).split(path.sep).join("/");
  const logText = renderLog(repoRoot, docsRel);

  const sourceMap = buildSourceMap(pages, repoRoot);
  const mapJson = Object.fromEntries(
    [...sourceMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, slugs]) => [file, [...slugs].sort()]),
  );

  const outDir = path.join(wikiDir, config.output.dir);
  const wants = (name: string): boolean => config.output.artifacts.includes(name);
  fs.mkdirSync(outDir, { recursive: true });

  if (wants("llms")) {
    fs.writeFileSync(path.join(outDir, "llms.txt"), indexText);
    console.log(`llms.txt       ${kb(indexText)}  (${pages.filter((p) => !p.reserved).length} pages)`);

    // The index is what goes into an agent prompt; the full text doesn't fit.
    const maxKb = config.output["llms-max-kb"];
    if (Buffer.byteLength(indexText) > maxKb * 1024) {
      console.warn(`\nwarning: llms.txt exceeds ${maxKb} KB — shorten descriptions so it keeps fitting in context`);
    }
  }

  if (wants("llms-full")) {
    fs.writeFileSync(path.join(outDir, "llms-full.txt"), fullText);
    console.log(`llms-full.txt  ${kb(fullText)}`);
  }

  if (wants("map")) {
    fs.writeFileSync(path.join(outDir, "map.json"), `${JSON.stringify(mapJson, null, 2)}\n`);
    console.log(`map.json       ${Object.keys(mapJson).length} files mapped`);
  }

  if (wants("okf")) {
    writeOkfBundle(path.join(outDir, "okf"), pages, indexText, logText);
    console.log(`okf/           conformant bundle`);
  }
}
