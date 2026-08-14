import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/core/config.js";

let wikiDir: string;

beforeEach(() => {
  wikiDir = mkdtempSync(join(tmpdir(), "wiki-kit-config-"));
});

afterEach(() => {
  rmSync(wikiDir, { recursive: true, force: true });
});

function writeConfig(content: string): void {
  writeFileSync(join(wikiDir, "wiki-kit.config.yaml"), content);
}

const VALID = [
  "rules:",
  "  sources-present: { severity: error, apply-to: [architecture, reference] }",
  "  staleness:       { severity: warn }",
  "okf:",
  "  types: [Architecture, Guide, Reference, Runbook, Concept]",
  "output:",
  "  dir: static",
  "  artifacts: [llms, llms-full, map, okf]",
  "  llms-max-kb: 8",
].join("\n");

describe("loadConfig", () => {
  it("parses the documented shape: rules, okf, output", () => {
    writeConfig(VALID);
    const config = loadConfig(wikiDir);

    expect(config.rules["sources-present"]).toEqual({ severity: "error", "apply-to": ["architecture", "reference"] });
    expect(config.rules.staleness).toEqual({ severity: "warn" });
    expect(config.okf.types).toEqual(["Architecture", "Guide", "Reference", "Runbook", "Concept"]);
    expect(config.output).toEqual({ dir: "static", artifacts: ["llms", "llms-full", "map", "okf"], "llms-max-kb": 8 });
    expect(config.hub).toBeUndefined();
    expect(config.update).toBeUndefined();
  });

  it("parses the optional hub block when present", () => {
    writeConfig(`${VALID}\nhub:\n  repo: acme/wiki-hub\n  branch: main\n`);
    expect(loadConfig(wikiDir).hub).toEqual({ repo: "acme/wiki-hub", branch: "main" });
  });

  it("parses the optional update block when present", () => {
    writeConfig(`${VALID}\nupdate:\n  agent: claude\n`);
    expect(loadConfig(wikiDir).update).toEqual({ agent: "claude" });
  });

  it("loads the shipped template config unmodified", () => {
    const templatePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../templates/wiki",
    );
    expect(() => loadConfig(templatePath)).not.toThrow();
  });

  it("throws ConfigError naming the expected path when the file is missing", () => {
    expect(() => loadConfig(wikiDir)).toThrow(ConfigError);
    try {
      loadConfig(wikiDir);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toContain(join(wikiDir, "wiki-kit.config.yaml"));
    }
  });

  it("throws ConfigError naming the file and key when a required block is missing", () => {
    writeConfig("okf:\n  types: [Architecture]\noutput:\n  dir: static\n  artifacts: [llms]\n  llms-max-kb: 8\n");
    expect(() => loadConfig(wikiDir)).toThrow(ConfigError);
    try {
      loadConfig(wikiDir);
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(join(wikiDir, "wiki-kit.config.yaml"));
      expect(message).toContain('"rules"');
    }
  });

  it("throws ConfigError naming the offending rule severity", () => {
    writeConfig(
      ["rules:", "  staleness: { severity: catastrophic }", "okf:", "  types: [Guide]", "output:", "  dir: static", "  artifacts: [llms]", "  llms-max-kb: 8"].join(
        "\n",
      ),
    );
    expect(() => loadConfig(wikiDir)).toThrowError(/rules\.staleness\.severity/);
  });

  it("throws ConfigError when output.llms-max-kb is not a number", () => {
    writeConfig(
      ["rules:", "  staleness: { severity: warn }", "okf:", "  types: [Guide]", "output:", "  dir: static", "  artifacts: [llms]", "  llms-max-kb: lots"].join(
        "\n",
      ),
    );
    expect(() => loadConfig(wikiDir)).toThrowError(/output\.llms-max-kb/);
  });

  it("throws ConfigError when hub is present but incomplete", () => {
    writeConfig(`${VALID}\nhub:\n  repo: acme/wiki-hub\n`);
    expect(() => loadConfig(wikiDir)).toThrowError(/hub\.branch/);
  });

  it("throws ConfigError when update is present but missing agent", () => {
    writeConfig(`${VALID}\nupdate:\n  nickname: bot\n`);
    expect(() => loadConfig(wikiDir)).toThrowError(/update\.agent/);
  });
});
