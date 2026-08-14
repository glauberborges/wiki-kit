// CLI adapter for `wiki-kit llms` — thin wiring only; writeArtifacts (T7)
// already does the generation, artifact filtering, and summary printing.

import { join } from "node:path";
import { loadConfig } from "../core/config.js";
import { writeArtifacts } from "../core/llms.js";
import { findRepoRoot, loadPages } from "../core/pages.js";

export function run(args: string[]): void {
  const repoRoot = findRepoRoot(process.cwd());
  const wikiDir = join(repoRoot, "wiki");
  const pages = loadPages(wikiDir);
  const config = loadConfig(wikiDir);

  writeArtifacts(pages, wikiDir, repoRoot, config);
}
