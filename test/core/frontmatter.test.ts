import { describe, expect, it } from "vitest";
import { parseFrontMatter, readFrontMatter, splitFrontMatter } from "../../src/core/frontmatter.js";

describe("splitFrontMatter", () => {
  it("separates header and body", () => {
    const [head, body] = splitFrontMatter("---\ntitle: X\n---\n\nBody.\n");
    expect(head).toBe("title: X");
    expect(body.trim()).toBe("Body.");
  });

  it("returns the whole text when there is no front-matter", () => {
    const [head, body] = splitFrontMatter("# Just markdown\n");
    expect(head).toBe("");
    expect(body).toBe("# Just markdown\n");
  });

  it("does not confuse a `---` rule in the body with the end of the header", () => {
    const [head, body] = splitFrontMatter("---\ntitle: X\n---\n\nA\n\n---\n\nB\n");
    expect(head).toBe("title: X");
    expect(body).toContain("A");
    expect(body).toContain("B");
  });
});

describe("parseFrontMatter", () => {
  it("reads scalars, typing numbers and booleans", () => {
    const fm = parseFrontMatter("title: Workflow\nsidebar_position: 4\ndraft: false");
    expect(fm).toMatchObject({ title: "Workflow", sidebar_position: 4, draft: false });
  });

  it("strips quotes from quoted values", () => {
    expect(parseFrontMatter('title: "Workflow: tasks and status"').title).toBe("Workflow: tasks and status");
  });

  it("ignores comments and blank lines", () => {
    expect(parseFrontMatter("# comment\n\ntype: Architecture")).toEqual({ type: "Architecture" });
  });

  it("reads the inline map of `generated`", () => {
    const fm = parseFrontMatter("generated: { by: human:glauber, at: 2026-07-27 }");
    expect(fm.generated).toEqual({ by: "human:glauber", at: "2026-07-27" });
  });

  it("reads `verified` as a list of inline maps", () => {
    const fm = parseFrontMatter("verified: [{ by: human:x, at: 2026-01-01 }]");
    expect(fm.verified).toEqual([{ by: "human:x", at: "2026-01-01" }]);
  });

  it("reads the block list of `sources` in OKF's canonical form", () => {
    const fm = parseFrontMatter(["sources:", "  - resource: src/workflow/*.ts", "  - resource: src/cli.ts"].join("\n"));
    expect(fm.sources).toEqual([{ resource: "src/workflow/*.ts" }, { resource: "src/cli.ts" }]);
  });

  it("reads a block list of scalars", () => {
    const fm = parseFrontMatter(["tags:", "  - workflow", "  - locks"].join("\n"));
    expect(fm.tags).toEqual(["workflow", "locks"]);
  });

  it("reads an inline list", () => {
    expect(parseFrontMatter("keywords: [a, b, c]").keywords).toEqual(["a", "b", "c"]);
  });

  it("terminates on front-matter whose nested block is the last line — infinite-loop regression", () => {
    // The nested-block collector must advance the cursor; without that the
    // parser would stack the same line until it blew past the max array size.
    const fm = parseFrontMatter(["title: X", "sources:", "  - resource: src/a.ts"].join("\n"));
    expect(fm.sources).toEqual([{ resource: "src/a.ts" }]);
  });
});

describe("readFrontMatter", () => {
  it("returns data and body together", () => {
    const { data, body } = readFrontMatter("---\ntype: Guide\n---\n\nText.\n");
    expect(data.type).toBe("Guide");
    expect(body.trim()).toBe("Text.");
  });

  it("returns empty data for a file with no front-matter", () => {
    expect(readFrontMatter("# Nothing\n").data).toEqual({});
  });
});
