// `llms` — thin wiring only; writeArtifacts already does the generation,
// artifact filtering, and summary printing.
import { join } from "node:path";
import { loadConfig } from "../core/config.js";
import { runCli } from "../core/entrypoint.js";
import { writeArtifacts } from "../core/llms.js";
import { findRepoRoot, loadPages } from "../core/pages.js";
export function run(args) {
    const repoRoot = findRepoRoot(process.cwd());
    const wikiDir = join(repoRoot, "wiki");
    const pages = loadPages(wikiDir);
    const config = loadConfig(wikiDir);
    writeArtifacts(pages, wikiDir, repoRoot, config);
}
runCli(import.meta.url, () => run(process.argv.slice(2)));
