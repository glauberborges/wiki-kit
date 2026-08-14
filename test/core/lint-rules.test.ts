import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WikiKitConfig } from "../../src/core/config.js";
import { RULES, runLintRules, type LintContext, type LintFinding } from "../../src/core/lint-rules.js";
import type { Page } from "../../src/core/pages.js";

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    file: "/repo/wiki/docs/architecture/example.md",
    rel: "architecture/example.md",
    repoRel: "wiki/docs/architecture/example.md",
    slug: "architecture/example",
    category: "architecture",
    categoryLabel: "Architecture",
    categoryPosition: 1,
    reserved: false,
    data: {},
    body: "",
    rawHead: "",
    title: "Example",
    description: "",
    sources: [],
    position: 1,
    ...overrides,
  };
}

const baseConfig: WikiKitConfig = {
  rules: {},
  okf: { types: [] },
  output: { dir: "static", artifacts: [], "llms-max-kb": 8 },
};

/** Runs a single named rule in isolation — no cross-rule noise from RULES. */
function runRule(name: string, pages: Page[], ctxOverrides: Partial<LintContext> = {}): LintFinding[] {
  const rule = RULES.find((r) => r.name === name);
  if (!rule) throw new Error(`rule not found: ${name}`);
  const findings: LintFinding[] = [];
  const ctx: LintContext = {
    repoRoot: "/repo",
    wikiDir: "/repo/wiki",
    config: baseConfig,
    report(page, message, defaultSeverity) {
      findings.push({ rule: name, severity: defaultSeverity, page, message });
    },
    ...ctxOverrides,
  };
  rule.run(pages, ctx);
  return findings;
}

describe("RULES registry", () => {
  it("has exactly the 11 reference rules, in the reference's order", () => {
    expect(RULES.map((r) => r.name)).toEqual([
      "yaml-safe",
      "okf-type",
      "title",
      "sources-present",
      "sources-exist",
      "staleness",
      "stale-after",
      "unverified",
      "orphan",
      "workspace-absorbed",
      "links",
    ]);
  });
});

describe("yaml-safe", () => {
  it("rejects a value starting with a backtick — the case that broke the build", () => {
    const page = makePage({ rawHead: "title: X\ndescription: `~/.hive/config.yaml` and friends." });
    const findings = runRule("yaml-safe", [page]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/reserved YAML indicator/);
  });

  it("rejects a value with `: ` outside quotes", () => {
    const page = makePage({ rawHead: "description: Workflow: tasks and status." });
    const findings = runRule("yaml-safe", [page]);
    expect(findings[0].message).toMatch(/`: `/);
  });

  it("accepts the same value quoted", () => {
    const page = makePage({ rawHead: 'description: "`~/.hive/config.yaml`: and friends."' });
    expect(runRule("yaml-safe", [page])).toEqual([]);
  });

  it("does not confuse an inline map or list with an unsafe scalar", () => {
    const page = makePage({
      rawHead: "generated: { by: human:x, at: 2026-01-01 }\nkeywords: [a, b]",
    });
    expect(runRule("yaml-safe", [page])).toEqual([]);
  });
});

describe("okf-type", () => {
  it("flags a non-reserved page with no `type:`", () => {
    const page = makePage({ data: {} });
    expect(runRule("okf-type", [page])).toHaveLength(1);
  });

  it("flags an empty `type:`", () => {
    const page = makePage({ data: { type: "  " } });
    expect(runRule("okf-type", [page])).toHaveLength(1);
  });

  it("passes a page with a non-empty `type:`", () => {
    const page = makePage({ data: { type: "Architecture" } });
    expect(runRule("okf-type", [page])).toEqual([]);
  });

  it("skips reserved pages (index.md / log.md)", () => {
    const page = makePage({ reserved: true, data: {} });
    expect(runRule("okf-type", [page])).toEqual([]);
  });
});

describe("title", () => {
  it("flags a page with no `title:` and no `#` heading", () => {
    const page = makePage({ data: {}, body: "Just prose, no heading." });
    expect(runRule("title", [page])).toHaveLength(1);
  });

  it("passes when `title:` is set", () => {
    const page = makePage({ data: { title: "Example" }, body: "Prose." });
    expect(runRule("title", [page])).toEqual([]);
  });

  it("passes when the body has a `#` heading", () => {
    const page = makePage({ data: {}, body: "# Example\n\nProse." });
    expect(runRule("title", [page])).toEqual([]);
  });
});

describe("sources-present", () => {
  it("flags a page in a default apply-to category with no sources", () => {
    const page = makePage({ category: "architecture", sources: [] });
    expect(runRule("sources-present", [page])).toHaveLength(1);
  });

  it("does not flag a category outside the default apply-to set", () => {
    const page = makePage({ category: "guides", sources: [] });
    expect(runRule("sources-present", [page])).toEqual([]);
  });

  it("does not flag a page that declares sources", () => {
    const page = makePage({ category: "architecture", sources: ["src/a.ts"] });
    expect(runRule("sources-present", [page])).toEqual([]);
  });

  it("skips reserved pages regardless of category", () => {
    const page = makePage({ category: "architecture", reserved: true, sources: [] });
    expect(runRule("sources-present", [page])).toEqual([]);
  });

  it("reads apply-to from config instead of the hardcoded default", () => {
    const page = makePage({ category: "guides", sources: [] });
    const config: WikiKitConfig = { ...baseConfig, rules: { "sources-present": { severity: "error", "apply-to": ["guides"] } } };
    expect(runRule("sources-present", [page], { config })).toHaveLength(1);
  });
});

describe("sources-exist / staleness (git-backed)", () => {
  let repoRoot: string;

  function initGitRepo(dir: string): void {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  }

  function commitFile(relPath: string, content: string, epochSeconds: number): void {
    const full = join(repoRoot, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    execFileSync("git", ["add", relPath], { cwd: repoRoot });
    const date = `@${epochSeconds} +0000`;
    execFileSync("git", ["commit", "-q", "-m", `commit ${relPath}`], {
      cwd: repoRoot,
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
  }

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("sources-exist flags a pattern matching no tracked file", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-exist-"));
    initGitRepo(repoRoot);
    const page = makePage({ sources: ["src/does-not-exist.ts"] });
    expect(runRule("sources-exist", [page], { repoRoot })).toHaveLength(1);
  });

  it("sources-exist passes a pattern matching a tracked file", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-exist-ok-"));
    initGitRepo(repoRoot);
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    writeFileSync(join(repoRoot, "src", "cli.ts"), "");
    execFileSync("git", ["add", "src"], { cwd: repoRoot });
    const page = makePage({ sources: ["src/cli.ts"] });
    expect(runRule("sources-exist", [page], { repoRoot })).toEqual([]);
  });

  it("staleness warns when a source committed after the page", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-stale-"));
    initGitRepo(repoRoot);
    commitFile("wiki/docs/architecture/overview.md", "page v1", 1_000);
    commitFile("src/cli.ts", "code v2", 2_000);
    const page = makePage({ repoRel: "wiki/docs/architecture/overview.md", sources: ["src/cli.ts"] });
    const findings = runRule("staleness", [page], { repoRoot });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("src/cli.ts");
  });

  it("staleness stays quiet when the source predates the page", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-fresh-"));
    initGitRepo(repoRoot);
    commitFile("src/cli.ts", "code v1", 1_000);
    commitFile("wiki/docs/architecture/overview.md", "page v2", 2_000);
    const page = makePage({ repoRel: "wiki/docs/architecture/overview.md", sources: ["src/cli.ts"] });
    expect(runRule("staleness", [page], { repoRoot })).toEqual([]);
  });

  it("staleness skips a page with no commit yet", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-uncommitted-"));
    initGitRepo(repoRoot);
    commitFile("src/cli.ts", "code", 1_000);
    const page = makePage({ repoRel: "wiki/docs/architecture/never-committed.md", sources: ["src/cli.ts"] });
    expect(runRule("staleness", [page], { repoRoot })).toEqual([]);
  });
});

describe("stale-after", () => {
  it("warns once the declared date has passed", () => {
    const page = makePage({ data: { stale_after: "2000-01-01" } });
    expect(runRule("stale-after", [page])).toHaveLength(1);
  });

  it("stays quiet while the declared date is still in the future", () => {
    const page = makePage({ data: { stale_after: "2999-01-01" } });
    expect(runRule("stale-after", [page])).toEqual([]);
  });

  it("ignores a non-string stale_after", () => {
    const page = makePage({ data: { stale_after: 123 } });
    expect(runRule("stale-after", [page])).toEqual([]);
  });
});

describe("unverified", () => {
  it("warns when an agent-generated page has no verified: entries", () => {
    const page = makePage({ data: { generated: { by: "claude-3" }, verified: [] } });
    expect(runRule("unverified", [page])).toHaveLength(1);
  });

  it("stays quiet for a human-authored page", () => {
    const page = makePage({ data: { generated: { by: "human:glauber" } } });
    expect(runRule("unverified", [page])).toEqual([]);
  });

  it("stays quiet once verified: has an entry", () => {
    const page = makePage({ data: { generated: { by: "claude-3" }, verified: ["glauber"] } });
    expect(runRule("unverified", [page])).toEqual([]);
  });

  it("ignores a page with no generated field", () => {
    const page = makePage({ data: {} });
    expect(runRule("unverified", [page])).toEqual([]);
  });
});

describe("orphan", () => {
  it("warns on a draft page", () => {
    const page = makePage({ data: { draft: true } });
    expect(runRule("orphan", [page])).toHaveLength(1);
  });

  it("warns on an unlisted page", () => {
    const page = makePage({ data: { unlisted: true } });
    expect(runRule("orphan", [page])).toHaveLength(1);
  });

  it("stays quiet for a normal page", () => {
    const page = makePage({ data: {} });
    expect(runRule("orphan", [page])).toEqual([]);
  });
});

describe("workspace-absorbed", () => {
  let repoRoot: string;

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("warns when the root workspaces glob reaches wiki/", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-ws-"));
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ workspaces: ["*"] }));
    const page = makePage();
    const findings = runRule("workspace-absorbed", [page], { repoRoot, wikiDir: join(repoRoot, "wiki") });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("wiki/");
  });

  it("stays quiet when no root package.json exists", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-ws-none-"));
    const page = makePage();
    expect(runRule("workspace-absorbed", [page], { repoRoot, wikiDir: join(repoRoot, "wiki") })).toEqual([]);
  });

  it("stays quiet when the workspaces glob does not reach wiki/", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-ws-narrow-"));
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    const page = makePage();
    expect(runRule("workspace-absorbed", [page], { repoRoot, wikiDir: join(repoRoot, "wiki") })).toEqual([]);
  });
});

describe("links", () => {
  let repoRoot: string;

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("flags a relative .md link that resolves to nothing", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-links-"));
    const docsDir = join(repoRoot, "wiki", "docs", "architecture");
    mkdirSync(docsDir, { recursive: true });
    const file = join(docsDir, "overview.md");
    writeFileSync(file, "See [missing](../guides/missing.md) for details.");
    const page = makePage({ file, body: "See [missing](../guides/missing.md) for details." });
    expect(runRule("links", [page])).toHaveLength(1);
  });

  it("passes a relative .md link that resolves to a real file", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "wiki-kit-lint-links-ok-"));
    const docsDir = join(repoRoot, "wiki", "docs");
    mkdirSync(join(docsDir, "architecture"), { recursive: true });
    mkdirSync(join(docsDir, "guides"), { recursive: true });
    writeFileSync(join(docsDir, "guides", "quickstart.md"), "# Quickstart");
    const file = join(docsDir, "architecture", "overview.md");
    const body = "See [quickstart](../guides/quickstart.md) for details.";
    writeFileSync(file, body);
    const page = makePage({ file, body });
    expect(runRule("links", [page])).toEqual([]);
  });
});

describe("runLintRules", () => {
  it("resolves severity from config, falling back to each rule's default", () => {
    const page = makePage({ data: {}, body: "no heading" }); // trips `title` (default: error)
    const findings = runLintRules([page], "/repo", "/repo/wiki", baseConfig);
    const titleFinding = findings.find((f) => f.rule === "title");
    expect(titleFinding?.severity).toBe("error");
  });

  it("lets config override a rule's default severity", () => {
    const page = makePage({ data: {}, body: "no heading" });
    const config: WikiKitConfig = { ...baseConfig, rules: { title: { severity: "warn" } } };
    const findings = runLintRules([page], "/repo", "/repo/wiki", config);
    expect(findings.find((f) => f.rule === "title")?.severity).toBe("warn");
  });

  it('skips a rule entirely when its severity is configured "off"', () => {
    const page = makePage({ data: {}, body: "no heading" });
    const config: WikiKitConfig = { ...baseConfig, rules: { title: { severity: "off" } } };
    const findings = runLintRules([page], "/repo", "/repo/wiki", config);
    expect(findings.find((f) => f.rule === "title")).toBeUndefined();
  });
});
