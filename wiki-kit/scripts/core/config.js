import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontMatter } from "./frontmatter.js";
const CONFIG_FILE = "wiki-kit.config.yaml";
const SEVERITIES = new Set(["error", "warn", "off"]);
// Distinct from a plain Error so callers (e.g. `init`, which writes this file
// rather than reads it) can `instanceof`-check without string-matching messages.
export class ConfigError extends Error {
}
// parseFrontMatter is a tolerant line-scanner with no line-number tracking (see
// src/core/frontmatter.ts) — it never throws on a bad line, it just skips it.
// So "malformed" here can only be caught by validating the parsed shape, and the
// most precise location we can report is the dotted key path, not a line number.
function fail(filePath, keyPath, expected) {
    throw new ConfigError(`${filePath}: "${keyPath}" ${expected}`);
}
function asRecord(value, keyPath, filePath) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        fail(filePath, keyPath, "must be a mapping");
    }
    return value;
}
function asString(value, keyPath, filePath) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(filePath, keyPath, "must be a non-empty string");
    }
    return value;
}
function asNumber(value, keyPath, filePath) {
    if (typeof value !== "number") {
        fail(filePath, keyPath, "must be a number");
    }
    return value;
}
function asStringArray(value, keyPath, filePath) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        fail(filePath, keyPath, "must be a list of strings");
    }
    return value;
}
function parseRules(raw, filePath) {
    const rules = asRecord(raw, "rules", filePath);
    const out = {};
    for (const [name, def] of Object.entries(rules)) {
        const ruleDef = asRecord(def, `rules.${name}`, filePath);
        const severity = ruleDef.severity;
        if (typeof severity !== "string" || !SEVERITIES.has(severity)) {
            fail(filePath, `rules.${name}.severity`, "must be one of error, warn, off");
        }
        const entry = { severity: severity };
        if (ruleDef["apply-to"] !== undefined) {
            entry["apply-to"] = asStringArray(ruleDef["apply-to"], `rules.${name}.apply-to`, filePath);
        }
        out[name] = entry;
    }
    return out;
}
/** Reads and validates `<wikiDir>/wiki-kit.config.yaml`. */
export function loadConfig(wikiDir) {
    const filePath = join(wikiDir, CONFIG_FILE);
    if (!existsSync(filePath)) {
        throw new ConfigError(`Config file not found: ${filePath} — run this skill's init workflow to create it, or add a ${CONFIG_FILE} with rules/okf/output blocks (see FOUNDATION.md §7).`);
    }
    const raw = parseFrontMatter(readFileSync(filePath, "utf8"));
    const okfRaw = asRecord(raw.okf, "okf", filePath);
    const outputRaw = asRecord(raw.output, "output", filePath);
    const config = {
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
    return config;
}
