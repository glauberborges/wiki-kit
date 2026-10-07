import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSourceMap,
  expandSource,
  findRepoRoot,
  globToRegExp,
  loadPages,
  normalizeSources,
  trackedFiles,
  type Page,
} from "../../src/core/pages.js";

describe("globToRegExp", () => {
  const matches = (glob: string, file: string) => globToRegExp(glob).test(file);

  it("matches an exact path", () => {
    expect(matches("src/cli.ts", "src/cli.ts")).toBe(true);
    expect(matches("src/cli.ts", "src/cli.js")).toBe(false);
  });

  it("`*` does not cross a directory separator", () => {
    expect(matches("src/workflow/*.ts", "src/workflow/tasks.ts")).toBe(true);
    expect(matches("src/workflow/*.ts", "src/workflow/sinks/github.ts")).toBe(false);
  });

  it("`**` crosses directories", () => {
    expect(matches("src/**/*.ts", "src/workflow/sinks/github.ts")).toBe(true);
    expect(matches("src/**/*.ts", "src/cli.ts")).toBe(true);
  });

  it("matches a prefix within the file name", () => {
    expect(matches("src/workflow/memory*.ts", "src/workflow/memory-distill.ts")).toBe(true);
    expect(matches("src/workflow/memory*.ts", "src/workflow/tasks.ts")).toBe(false);
  });

  it("escapes regex metacharacters present in the path", () => {
    expect(matches("src/a.b.ts", "src/a.b.ts")).toBe(true);
    expect(matches("src/a.b.ts", "src/axbxts")).toBe(false);
  });

  it("is language-neutral — works the same for Go and PHP", () => {
    expect(matches("internal/**", "internal/workflow/queue.go")).toBe(true);
    expect(matches("app/Http/Controllers/*.php", "app/Http/Controllers/UserController.php")).toBe(true);
  });
});

describe("normalizeSources", () => {
  it("accepts the OKF canonical form (`- resource: x`)", () => {
    expect(normalizeSources([{ resource: "src/a.ts" }, { resource: "src/b.ts" }])).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("accepts the abbreviated form (list of strings)", () => {
    expect(normalizeSources(["src/a.ts"])).toEqual(["src/a.ts"]);
  });

  it("accepts a single value outside a list", () => {
    expect(normalizeSources("src/a.ts")).toEqual(["src/a.ts"]);
  });

  it("discards empty entries or ones without `resource`", () => {
    expect(normalizeSources([{ resource: "" }, { title: "x" }, "  ", "src/a.ts"])).toEqual(["src/a.ts"]);
  });

  it("returns an empty list when there are no sources", () => {
    expect(normalizeSources(undefined)).toEqual([]);
    expect(normalizeSources(null)).toEqual([]);
  });
});

// The reference test loads pages from the reference repo's own live wiki.
// wiki-kit's own repo has no such wiki (wiki-kit/assets/wiki is a scaffold
// with {{PLACEHOLDER}} tokens, not a documented codebase), so this builds a
// throwaway fixture wiki instead and asserts the same behaviors.
describe("loadPages", () => {
  let repoRoot: string;
  let wikiDir: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-pages-load-"));
    wikiDir = join(repoRoot, "wiki");
    const docsDir = join(wikiDir, "docs");
    mkdirSync(join(docsDir, "architecture"), { recursive: true });
    mkdirSync(join(docsDir, "guides"), { recursive: true });

    writeFileSync(join(docsDir, "index.md"), ["---", "title: Home", "---", "", "Welcome.", ""].join("\n"));

    writeFileSync(join(docsDir, "architecture", "_category_.json"), JSON.stringify({ label: "Architecture", position: 1 }));
    writeFileSync(
      join(docsDir, "architecture", "overview.md"),
      ["---", "type: Architecture", "sidebar_position: 2", "sources:", "  - resource: src/**/*.ts", "---", "", "Body.", ""].join(
        "\n",
      ),
    );
    writeFileSync(
      join(docsDir, "architecture", "workflow.md"),
      ["---", "type: Architecture", "sidebar_position: 1", "---", "", "# Workflow Notes", "", "Body.", ""].join("\n"),
    );

    writeFileSync(join(docsDir, "guides", "_category_.json"), JSON.stringify({ label: "Guides", position: 2 }));
    writeFileSync(
      join(docsDir, "guides", "quickstart.md"),
      ["---", "type: Guide", "sidebar_position: 1", "sources:", "  - src/cli.ts", "---", "", "Body.", ""].join("\n"),
    );
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("loads every markdown page under docs/", () => {
    expect(loadPages(wikiDir)).toHaveLength(4);
  });

  it("orders by sidebar: categories by `position`, pages by `sidebar_position`", () => {
    const rels = loadPages(wikiDir).map((p) => p.rel);
    expect(rels).toEqual(["index.md", "architecture/workflow.md", "architecture/overview.md", "guides/quickstart.md"]);
  });

  it("marks index.md as reserved by the OKF", () => {
    const pages = loadPages(wikiDir);
    expect(pages.find((p) => p.rel === "index.md")?.reserved).toBe(true);
    expect(pages.find((p) => p.rel === "architecture/overview.md")?.reserved).toBe(false);
  });

  it("normalizes `sources` from both the canonical and abbreviated front-matter forms", () => {
    const pages = loadPages(wikiDir);
    expect(pages.find((p) => p.rel === "architecture/overview.md")?.sources).toEqual(["src/**/*.ts"]);
    expect(pages.find((p) => p.rel === "guides/quickstart.md")?.sources).toEqual(["src/cli.ts"]);
    expect(pages.find((p) => p.rel === "architecture/workflow.md")?.sources).toEqual([]);
  });

  it("computes `repoRel` relative to the repo root, not the wiki dir", () => {
    const pages = loadPages(wikiDir);
    expect(pages.find((p) => p.rel === "architecture/overview.md")?.repoRel).toBe("wiki/docs/architecture/overview.md");
  });

  it("falls back to the first markdown heading when `title` is absent", () => {
    const pages = loadPages(wikiDir);
    expect(pages.find((p) => p.rel === "architecture/workflow.md")?.title).toBe("Workflow Notes");
  });

  it("returns an empty array when the wiki has no docs directory", () => {
    const empty = mkdtempSync(join(tmpdir(), "wiki-kit-pages-nodocs-"));
    try {
      expect(loadPages(join(empty, "wiki"))).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("loadPages — .mdx (Mintlify) support", () => {
  let repoRoot: string;
  let wikiDir: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-pages-mdx-"));
    wikiDir = join(repoRoot, "wiki");
    const docsDir = join(wikiDir, "docs");
    mkdirSync(join(docsDir, "architecture"), { recursive: true });

    writeFileSync(join(docsDir, "index.mdx"), ["---", "title: Home", "---", "", "Welcome.", ""].join("\n"));
    writeFileSync(
      join(docsDir, "architecture", "overview.mdx"),
      ["---", "type: Architecture", "sources:", "  - resource: src/**/*.ts", "---", "", "Body.", ""].join("\n"),
    );
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("discovers .mdx pages alongside .md ones", () => {
    expect(loadPages(wikiDir)).toHaveLength(2);
  });

  it("strips .mdx (not just .md) from the slug", () => {
    const pages = loadPages(wikiDir);
    expect(pages.find((p) => p.rel === "architecture/overview.mdx")?.slug).toBe("architecture/overview");
  });

  it("marks index.mdx as reserved, same as index.md", () => {
    const pages = loadPages(wikiDir);
    expect(pages.find((p) => p.rel === "index.mdx")?.reserved).toBe(true);
  });
});

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

describe("trackedFiles / expandSource / buildSourceMap", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-pages-tracked-"));
    initGitRepo(repoRoot);

    mkdirSync(join(repoRoot, "src", "workflow"), { recursive: true });
    mkdirSync(join(repoRoot, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(repoRoot, "src", "cli.ts"), "");
    writeFileSync(join(repoRoot, "src", "workflow", "tasks.ts"), "");
    writeFileSync(join(repoRoot, "node_modules", "pkg", "index.js"), "");
    writeFileSync(join(repoRoot, ".gitignore"), "node_modules/\n");

    execFileSync("git", ["add", "src", ".gitignore"], { cwd: repoRoot });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("trackedFiles lists files git knows about, respecting .gitignore", () => {
    const files = trackedFiles(repoRoot);
    expect(files).toContain("src/cli.ts");
    expect(files).toContain("src/workflow/tasks.ts");
    expect(files).not.toContain("node_modules/pkg/index.js");
  });

  it("expandSource resolves exact, directory-prefix, and glob patterns", () => {
    expect(expandSource("src/cli.ts", repoRoot)).toEqual(["src/cli.ts"]);
    expect(expandSource("src/workflow", repoRoot)).toEqual(["src/workflow/tasks.ts"]);
    expect(expandSource("src/**/*.ts", repoRoot).sort()).toEqual(["src/cli.ts", "src/workflow/tasks.ts"]);
  });

  it("buildSourceMap builds the reverse index from a page's sources to the files it matches", () => {
    const pages = [
      { slug: "architecture/overview", sources: ["src/**/*.ts"] } as Page,
      { slug: "guides/quickstart", sources: ["src/cli.ts"] } as Page,
    ];
    const map = buildSourceMap(pages, repoRoot);
    expect(map.get("src/cli.ts")).toEqual(new Set(["architecture/overview", "guides/quickstart"]));
    expect(map.get("src/workflow/tasks.ts")).toEqual(new Set(["architecture/overview"]));
  });
});

describe("findRepoRoot", () => {
  it("resolves from a nested cwd inside a repo", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-pages-root-"));
    try {
      initGitRepo(repoRoot);
      const nested = join(repoRoot, "a", "b", "c");
      mkdirSync(nested, { recursive: true });
      expect(findRepoRoot(nested)).toBe(repoRoot);
      expect(findRepoRoot(repoRoot)).toBe(repoRoot);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("resolves from a linked worktree, where `.git` is a file, not a directory", () => {
    const mainRepo = mkdtempSync(join(tmpdir(), "wiki-kit-pages-wt-main-"));
    const wtParent = mkdtempSync(join(tmpdir(), "wiki-kit-pages-wt-parent-"));
    const worktreePath = join(wtParent, "wt");
    try {
      initGitRepo(mainRepo);
      writeFileSync(join(mainRepo, "README.md"), "x");
      execFileSync("git", ["add", "."], { cwd: mainRepo });
      execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: mainRepo });
      execFileSync("git", ["worktree", "add", "-q", worktreePath, "-b", "wt-branch"], { cwd: mainRepo });

      expect(statSync(join(worktreePath, ".git")).isFile()).toBe(true);
      expect(findRepoRoot(worktreePath)).toBe(worktreePath);

      const nested = join(worktreePath, "src");
      mkdirSync(nested, { recursive: true });
      expect(findRepoRoot(nested)).toBe(worktreePath);
    } finally {
      rmSync(mainRepo, { recursive: true, force: true });
      rmSync(wtParent, { recursive: true, force: true });
    }
  });

  it("throws a clear error when no .git is found before reaching the filesystem root", () => {
    const orphan = mkdtempSync(join(tmpdir(), "wiki-kit-pages-orphan-"));
    try {
      expect(() => findRepoRoot(orphan)).toThrow(/No \.git found/);
    } finally {
      rmSync(orphan, { recursive: true, force: true });
    }
  });
});
