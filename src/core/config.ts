import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontMatter } from "./frontmatter.js";

export type RuleSeverity = "error" | "warn" | "off";

export interface WikiKitConfig {
  rules: Record<string, { severity: RuleSeverity; "apply-to"?: string[] }>;
  okf: { types: string[] };
  output: { dir: string; artifacts: string[]; "llms-max-kb": number };
  hub?: { repo: string; branch: string };
  update?: { agent: string };
}

const CONFIG_FILE = "wiki-kit.config.yaml";
const SEVERITIES: ReadonlySet<string> = new Set(["error", "warn", "off"]);

// Distinct from a plain Error so callers (e.g. `init`, which writes this file
// rather than reads it) can `instanceof`-check without string-matching messages.
export class ConfigError extends Error {}

// parseFrontMatter is a tolerant line-scanner with no line-number tracking (see
// src/core/frontmatter.ts) — it never throws on a bad line, it just skips it.
// So "malformed" here can only be caught by validating the parsed shape, and the
// most precise location we can report is the dotted key path, not a line number.
function fail(filePath: string, keyPath: string, expected: string): never {
  throw new ConfigError(`${filePath}: "${keyPath}" ${expected}`);
}

function asRecord(value: unknown, keyPath: string, filePath: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(filePath, keyPath, "must be a mapping");
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, keyPath: string, filePath: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(filePath, keyPath, "must be a non-empty string");
  }
  return value as string;
}

function asNumber(value: unknown, keyPath: string, filePath: string): number {
  if (typeof value !== "number") {
    fail(filePath, keyPath, "must be a number");
  }
  return value as number;
}

function asStringArray(value: unknown, keyPath: string, filePath: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(filePath, keyPath, "must be a list of strings");
  }
  return value as string[];
}

function parseRules(raw: unknown, filePath: string): WikiKitConfig["rules"] {
  const rules = asRecord(raw, "rules", filePath);
  const out: WikiKitConfig["rules"] = {};
  for (const [name, def] of Object.entries(rules)) {
    const ruleDef = asRecord(def, `rules.${name}`, filePath);
    const severity = ruleDef.severity;
    if (typeof severity !== "string" || !SEVERITIES.has(severity)) {
      fail(filePath, `rules.${name}.severity`, "must be one of error, warn, off");
    }
    const entry: WikiKitConfig["rules"][string] = { severity: severity as RuleSeverity };
    if (ruleDef["apply-to"] !== undefined) {
      entry["apply-to"] = asStringArray(ruleDef["apply-to"], `rules.${name}.apply-to`, filePath);
    }
    out[name] = entry;
  }
  return out;
}

/** Reads and validates `<wikiDir>/wiki-kit.config.yaml`. */
export function loadConfig(wikiDir: string): WikiKitConfig {
  const filePath = join(wikiDir, CONFIG_FILE);
  if (!existsSync(filePath)) {
    throw new ConfigError(
      `Config file not found: ${filePath} — run \`wiki-kit init\` to create it, or add a ${CONFIG_FILE} with rules/okf/output blocks (see FOUNDATION.md §7).`,
    );
  }

  const raw = parseFrontMatter(readFileSync(filePath, "utf8"));

  const okfRaw = asRecord(raw.okf, "okf", filePath);
  const outputRaw = asRecord(raw.output, "output", filePath);

  const config: WikiKitConfig = {
    rules: parseRules(raw.rules, filePath),
    okf: { types: asStringArray(okfRaw.types, "okf.types", filePath) },
    output: {
      dir: asString(outputRaw.dir, "output.dir", filePath),
      artifacts: asStringArray(outputRaw.artifacts, "output.artifacts", filePath),
      "llms-max-kb": asNumber(outputRaw["llms-max-kb"], "output.llms-max-kb", filePath),
    },
  };

  if (raw.hub !== undefined) {
    const hubRaw = asRecord(raw.hub, "hub", filePath);
    config.hub = {
      repo: asString(hubRaw.repo, "hub.repo", filePath),
      branch: asString(hubRaw.branch, "hub.branch", filePath),
    };
  }

  if (raw.update !== undefined) {
    const updateRaw = asRecord(raw.update, "update", filePath);
    config.update = { agent: asString(updateRaw.agent, "update.agent", filePath) };
  }

  return config;
}
