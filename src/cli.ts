import { parseArgs } from "node:util";

const COMMANDS = [
  "lint",
  "affected",
  "ingest-prompt",
  "llms",
  "init",
  "update",
  "hub",
] as const;

type CommandName = (typeof COMMANDS)[number];

function isCommandName(value: string): value is CommandName {
  return (COMMANDS as readonly string[]).includes(value);
}

function usage(): string {
  return [
    "Usage: wiki-kit <command> [options]",
    "",
    "Commands:",
    "  lint            Check wiki pages against the configured lint rules",
    "  affected        Report pages and files affected by the current diff",
    "  ingest-prompt   Print an agent-ready prompt for the affected pages",
    "  llms            Generate llms.txt, llms-full.txt, map.json, and the OKF bundle",
    "  init            Scaffold a new wiki in this repository",
    "  update          Dispatch a coding agent to refresh affected pages",
    "  hub             Push generated artifacts to a hub repository",
    "",
    "Options:",
    "  -h, --help      Show this help message",
  ].join("\n");
}

export async function main(argv: string[]): Promise<void> {
  // strict:false — subcommand-specific flags (e.g. --base, --force) are unknown at
  // this layer by design; each command module parses its own args independently.
  const { values, positionals } = parseArgs({
    args: argv,
    options: { help: { type: "boolean", short: "h" } },
    strict: false,
    allowPositionals: true,
  });

  const command = positionals[0];

  if (!command || values.help) {
    console.log(usage());
    process.exitCode = 0;
    return;
  }

  if (!isCommandName(command)) {
    console.error(`Unknown command: ${command}\n`);
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const commandArgs = argv.slice(argv.indexOf(command) + 1);
  // @vite-ignore — specifier is only knowable at runtime; Node's native dynamic
  // import handles this fine, this comment just opts out of vitest/vite's
  // build-time static-analysis warning for it.
  const mod = await import(/* @vite-ignore */ `./commands/${command}.js`);
  await mod.run(commandArgs);
}
