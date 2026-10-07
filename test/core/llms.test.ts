import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WikiKitConfig } from "../../src/core/config.js";
import { describe as describePage, renderFull, renderIndex, renderLog, siteMeta, summarize, writeArtifacts } from "../../src/core/llms.js";
import { loadPages, type Page } from "../../src/core/pages.js";

function page(overrides: Partial<Page>): Page {
  return {
    file: "/repo/wiki/docs/x.md",
    rel: "x.md",
    repoRel: "wiki/docs/x.md",
    slug: "x",
    category: ".",
    categoryLabel: "",
    categoryPosition: 0,
    reserved: false,
    data: {},
    body: "Body.",
    rawHead: "",
    title: "X",
    description: "",
    sources: [],
    position: 999,
    ...overrides,
  };
}

describe("siteMeta", () => {
  let wikiDir: string;

  beforeEach(() => {
    wikiDir = mkdtempSync(join(tmpdir(), "wiki-kit-llms-meta-"));
  });

  afterEach(() => {
    rmSync(wikiDir, { recursive: true, force: true });
  });

  it("reads title and tagline from docusaurus.config.js by regex", () => {
    writeFileSync(
      join(wikiDir, "docusaurus.config.js"),
      "module.exports = {\n  title: 'Acme Wiki',\n  tagline: \"Docs that stay true\",\n};\n",
    );
    expect(siteMeta(wikiDir)).toEqual({ title: "Acme Wiki", tagline: "Docs that stay true" });
  });

  it("defaults title to Wiki and tagline to empty when the file is missing", () => {
    expect(siteMeta(wikiDir)).toEqual({ title: "Wiki", tagline: "" });
  });

  it("defaults tagline to empty when only title is present", () => {
    writeFileSync(join(wikiDir, "docusaurus.config.js"), "module.exports = {\n  title: `Only Title`,\n};\n");
    expect(siteMeta(wikiDir)).toEqual({ title: "Only Title", tagline: "" });
  });

  it("reads title from docs.json's name when there's no docusaurus.config.js (Mintlify)", () => {
    writeFileSync(join(wikiDir, "docs.json"), JSON.stringify({ name: "Acme Wiki" }));
    expect(siteMeta(wikiDir)).toEqual({ title: "Acme Wiki", tagline: "" });
  });

  it("prefers docusaurus.config.js over docs.json when both exist", () => {
    writeFileSync(join(wikiDir, "docusaurus.config.js"), "module.exports = {\n  title: 'Docusaurus Wins',\n};\n");
    writeFileSync(join(wikiDir, "docs.json"), JSON.stringify({ name: "Mintlify Loses" }));
    expect(siteMeta(wikiDir)).toEqual({ title: "Docusaurus Wins", tagline: "" });
  });

  it("falls back to the generic default on malformed docs.json", () => {
    writeFileSync(join(wikiDir, "docs.json"), "{not json");
    expect(siteMeta(wikiDir)).toEqual({ title: "Wiki", tagline: "" });
  });
});

describe("summarize", () => {
  it("returns the first non-heading, non-fence, non-admonition line", () => {
    expect(summarize("# Heading\n\nThe first real sentence here.\n\nMore text.")).toBe("The first real sentence here.");
  });

  it("strips markdown links, emphasis, and code ticks", () => {
    expect(summarize("See [the guide](/guides/x) for `details` and *emphasis*.")).toBe(
      "See the guide for details and emphasis.",
    );
  });

  it("truncates at the first sentence boundary only past 40 chars", () => {
    const long = "This sentence is long enough to pass the forty character threshold. And then some more text.";
    expect(summarize(long)).toBe("This sentence is long enough to pass the forty character threshold.");
  });

  it("does not truncate a short line even if it contains a period", () => {
    expect(summarize("Ok. Short.")).toBe("Ok. Short.");
  });

  it("returns an empty string when every line is a heading, fence marker, table row, or HTML tag", () => {
    expect(summarize("# Heading\n\n| a | b |\n<div>x</div>\n:::note\n:::")).toBe("");
  });
});

describe("describe (page description fallback)", () => {
  it("prefers front-matter description over the summarized body", () => {
    expect(describePage(page({ description: "Explicit description.", body: "Body text here." }))).toBe(
      "Explicit description.",
    );
  });

  it("falls back to summarize(body) when description is absent", () => {
    expect(describePage(page({ description: "", body: "Fallback sentence from the body." }))).toBe(
      "Fallback sentence from the body.",
    );
  });
});

describe("renderIndex", () => {
  const meta = { title: "Acme Wiki", tagline: "Docs that stay true" };

  it("renders title, tagline, and the home page's description", () => {
    const home = page({ rel: "index.md", slug: "index", reserved: true, category: ".", description: "Welcome." });
    const text = renderIndex([home], meta);
    expect(text).toContain("# Acme Wiki");
    expect(text).toContain("> Docs that stay true");
    expect(text).toContain("Welcome.");
  });

  it("skips reserved pages from the listed entries", () => {
    const home = page({ rel: "index.md", slug: "index", reserved: true, category: "." });
    const text = renderIndex([home], meta);
    expect(text).not.toContain("(/index)");
  });

  it("groups pages by category with a heading per category", () => {
    const a = page({ slug: "architecture/overview", category: "architecture", categoryLabel: "Architecture", title: "Overview" });
    const b = page({ slug: "guides/quickstart", category: "guides", categoryLabel: "Guides", title: "Quickstart" });
    const text = renderIndex([a, b], meta);
    expect(text).toContain("## Architecture");
    expect(text).toContain("## Guides");
    expect(text.indexOf("## Architecture")).toBeLessThan(text.indexOf("[Overview]"));
    expect(text.indexOf("## Guides")).toBeLessThan(text.indexOf("[Quickstart]"));
  });

  it("appends the description after the link when present, omits the dash when absent", () => {
    const withDesc = page({ slug: "a", title: "A", category: "cat", categoryLabel: "Cat", description: "About A." });
    const withoutDesc = page({ slug: "b", title: "B", category: "cat", categoryLabel: "Cat", description: "", body: "" });
    const text = renderIndex([withDesc, withoutDesc], meta);
    expect(text).toContain("* [A](/a) - About A.");
    expect(text).toContain("* [B](/b)\n");
  });

  it("mentions llms-full.txt as where the full body lives", () => {
    expect(renderIndex([], meta)).toContain("llms-full.txt");
  });
});

describe("renderFull", () => {
  const meta = { title: "Acme Wiki", tagline: "" };

  it("labels each page's source path and lists its documented sources", () => {
    const p = page({
      title: "Overview",
      repoRel: "wiki/docs/architecture/overview.md",
      sources: ["src/core/pages.ts", "src/core/llms.ts"],
      body: "The body content.",
    });
    const text = renderFull([p], meta);
    expect(text).toContain("Source: `wiki/docs/architecture/overview.md`");
    expect(text).toContain("Documents: `src/core/pages.ts`, `src/core/llms.ts`");
    expect(text).toContain("The body content.");
  });

  it("omits the Documents line when a page declares no sources", () => {
    const p = page({ title: "No Sources", sources: [], body: "Body." });
    expect(renderFull([p], meta)).not.toContain("Documents:");
  });

  it("headers the whole document as full content", () => {
    expect(renderFull([], meta)).toContain("# Acme Wiki — full content");
  });
});

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

describe("renderLog", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-llms-log-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns the history-unavailable fallback when git log fails", () => {
    // No .git here at all, so `git log` errors out.
    expect(renderLog(repoRoot, "wiki/docs")).toBe("# Log\n\n(history unavailable)\n");
  });

  it("groups commit subjects by ISO date, filtered to the given path", () => {
    initGitRepo(repoRoot);
    mkdirSync(join(repoRoot, "wiki", "docs"), { recursive: true });
    mkdirSync(join(repoRoot, "src"), { recursive: true });

    writeFileSync(join(repoRoot, "wiki", "docs", "overview.md"), "one");
    execFileSync("git", ["add", "wiki/docs/overview.md"], { cwd: repoRoot });
    execFileSync("git", ["commit", "-q", "-m", "Add overview page"], { cwd: repoRoot });

    writeFileSync(join(repoRoot, "src", "app.ts"), "code");
    execFileSync("git", ["add", "src/app.ts"], { cwd: repoRoot });
    execFileSync("git", ["commit", "-q", "-m", "Unrelated source change"], { cwd: repoRoot });

    writeFileSync(join(repoRoot, "wiki", "docs", "overview.md"), "one updated");
    execFileSync("git", ["add", "wiki/docs/overview.md"], { cwd: repoRoot });
    execFileSync("git", ["commit", "-q", "-m", "Update overview page"], { cwd: repoRoot });

    const log = renderLog(repoRoot, "wiki/docs");
    expect(log.startsWith("# Log\n")).toBe(true);
    expect(log).toMatch(/## \d{4}-\d{2}-\d{2}/);
    expect(log).toContain("* **Update**: Add overview page");
    expect(log).toContain("* **Update**: Update overview page");
    expect(log).not.toContain("Unrelated source change");
  });

  it("respects the limit parameter", () => {
    initGitRepo(repoRoot);
    mkdirSync(join(repoRoot, "wiki", "docs"), { recursive: true });
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(repoRoot, "wiki", "docs", "overview.md"), `v${i}`);
      execFileSync("git", ["add", "wiki/docs/overview.md"], { cwd: repoRoot });
      execFileSync("git", ["commit", "-q", "-m", `Commit ${i}`], { cwd: repoRoot });
    }
    const log = renderLog(repoRoot, "wiki/docs", 1);
    expect(log).toContain("Commit 2");
    expect(log).not.toContain("Commit 0");
  });
});

describe("writeArtifacts", () => {
  let repoRoot: string;
  let wikiDir: string;
  let outDir: string;
  let config: WikiKitConfig;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-llms-write-"));
    initGitRepo(repoRoot);

    wikiDir = join(repoRoot, "wiki");
    const docsDir = join(wikiDir, "docs");
    mkdirSync(join(docsDir, "architecture"), { recursive: true });
    mkdirSync(join(docsDir, "guides"), { recursive: true });
    mkdirSync(join(repoRoot, "src", "core"), { recursive: true });

    writeFileSync(
      join(wikiDir, "docusaurus.config.js"),
      "module.exports = {\n  title: 'Acme Wiki',\n  tagline: 'Docs that stay true',\n};\n",
    );

    writeFileSync(join(docsDir, "index.md"), ["---", "title: Home", "---", "", "Welcome to the wiki.", ""].join("\n"));

    writeFileSync(join(docsDir, "architecture", "_category_.json"), JSON.stringify({ label: "Architecture", position: 1 }));
    writeFileSync(
      join(docsDir, "architecture", "overview.md"),
      [
        "---",
        "type: Architecture",
        "sidebar_position: 1",
        "sources:",
        "  - resource: src/core/pages.ts",
        "---",
        "",
        "# Overview",
        "",
        "Architecture overview body.",
        "",
      ].join("\n"),
    );

    writeFileSync(join(docsDir, "guides", "_category_.json"), JSON.stringify({ label: "Guides", position: 2 }));
    writeFileSync(
      join(docsDir, "guides", "quickstart.md"),
      ["---", "type: Guide", "sidebar_position: 1", "sources:", "  - src/core/llms.ts", "---", "", "# Quickstart", "", "Guide body.", ""].join(
        "\n",
      ),
    );

    writeFileSync(join(repoRoot, "src", "core", "pages.ts"), "// fixture\n");
    writeFileSync(join(repoRoot, "src", "core", "llms.ts"), "// fixture\n");

    execFileSync("git", ["add", "-A"], { cwd: repoRoot });
    execFileSync("git", ["commit", "-q", "-m", "Add fixture wiki"], { cwd: repoRoot });

    outDir = join(wikiDir, "static");
    config = {
      rules: {},
      okf: { types: ["Architecture", "Guide"] },
      output: { dir: "static", artifacts: ["llms", "llms-full", "map", "okf"], "llms-max-kb": 8 },
    };
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function loadPagesFixture(): Page[] {
    return loadPages(wikiDir);
  }

  it("throws when there are no pages to generate from", () => {
    expect(() => writeArtifacts([], wikiDir, repoRoot, config)).toThrow(/No pages found/);
  });

  it("writes llms.txt, llms-full.txt, map.json, and the okf bundle", () => {
    const pages = loadPagesFixture();
    writeArtifacts(pages, wikiDir, repoRoot, config);

    expect(existsSync(join(outDir, "llms.txt"))).toBe(true);
    expect(existsSync(join(outDir, "llms-full.txt"))).toBe(true);
    expect(existsSync(join(outDir, "map.json"))).toBe(true);
    expect(existsSync(join(outDir, "okf"))).toBe(true);

    const indexText = readFileSync(join(outDir, "llms.txt"), "utf8");
    expect(indexText).toContain("# Acme Wiki");
    expect(indexText).toContain("## Architecture");
    expect(indexText).toContain("## Guides");

    const fullText = readFileSync(join(outDir, "llms-full.txt"), "utf8");
    expect(fullText).toContain("Source: `wiki/docs/architecture/overview.md`");
    expect(fullText).toContain("Documents: `src/core/pages.ts`");
  });

  it("map.json is a sorted reverse index from tracked source file to page slugs", () => {
    const pages = loadPagesFixture();
    writeArtifacts(pages, wikiDir, repoRoot, config);

    const map = JSON.parse(readFileSync(join(outDir, "map.json"), "utf8"));
    expect(map).toEqual({
      "src/core/llms.ts": ["guides/quickstart"],
      "src/core/pages.ts": ["architecture/overview"],
    });
    expect(Object.keys(map)).toEqual(Object.keys(map).slice().sort());
  });

  it("okf bundle copies non-reserved pages, writes a spec-compliant root index.md, and a log.md from git", () => {
    const pages = loadPagesFixture();
    writeArtifacts(pages, wikiDir, repoRoot, config);

    const okfDir = join(outDir, "okf");
    expect(existsSync(join(okfDir, "architecture", "overview.md"))).toBe(true);
    expect(existsSync(join(okfDir, "guides", "quickstart.md"))).toBe(true);

    const bundleIndex = readFileSync(join(okfDir, "index.md"), "utf8");
    expect(bundleIndex.startsWith("---\nokf_version: 0.2\n---\n\n")).toBe(true);
    expect(bundleIndex).toContain("# Acme Wiki");

    const logText = readFileSync(join(okfDir, "log.md"), "utf8");
    expect(logText).toContain("# Log");
    expect(logText).toContain("Add fixture wiki");
  });

  it("only writes the artifacts listed in config.output.artifacts", () => {
    config.output.artifacts = ["llms"];
    const pages = loadPagesFixture();
    writeArtifacts(pages, wikiDir, repoRoot, config);

    expect(existsSync(join(outDir, "llms.txt"))).toBe(true);
    expect(existsSync(join(outDir, "llms-full.txt"))).toBe(false);
    expect(existsSync(join(outDir, "map.json"))).toBe(false);
    expect(existsSync(join(outDir, "okf"))).toBe(false);
  });

  it("warns when llms.txt exceeds the configured llms-max-kb threshold", () => {
    config.output["llms-max-kb"] = 0;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pages = loadPagesFixture();
      writeArtifacts(pages, wikiDir, repoRoot, config);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("llms.txt exceeds 0 KB"));
    } finally {
      warn.mockRestore();
    }
  });

  it("does not warn when llms.txt stays under the configured threshold", () => {
    config.output["llms-max-kb"] = 1024;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pages = loadPagesFixture();
      writeArtifacts(pages, wikiDir, repoRoot, config);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("writes the okf/ bundle even when the only page is the reserved index", () => {
    // Regression: writeOkfBundle used to rely on a non-reserved page's own
    // mkdirSync call to create okfDir as a side effect — a wiki with only
    // index.md/.mdx (e.g. straight after a fresh `init`, before any other
    // page exists) never ran that side effect, so the writeFileSync calls
    // for okf/index.md and okf/log.md threw ENOENT.
    const onlyIndexRepo = mkdtempSync(join(tmpdir(), "wiki-kit-llms-onlyindex-"));
    try {
      initGitRepo(onlyIndexRepo);
      const onlyIndexWiki = join(onlyIndexRepo, "wiki");
      mkdirSync(join(onlyIndexWiki, "docs"), { recursive: true });
      writeFileSync(join(onlyIndexWiki, "docs", "index.md"), ["---", "title: Home", "---", "", "Welcome.", ""].join("\n"));

      const pages = loadPages(onlyIndexWiki);
      expect(() => writeArtifacts(pages, onlyIndexWiki, onlyIndexRepo, config)).not.toThrow();
      expect(existsSync(join(onlyIndexWiki, "static", "okf", "index.md"))).toBe(true);
      expect(existsSync(join(onlyIndexWiki, "static", "okf", "log.md"))).toBe(true);
    } finally {
      rmSync(onlyIndexRepo, { recursive: true, force: true });
    }
  });
});
