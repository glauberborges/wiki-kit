import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

const lintRun = vi.fn();
vi.mock("../src/commands/lint.js", () => ({ run: (args: string[]) => lintRun(args) }));

describe("cli routing", () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it("--help prints non-empty usage and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(["--help"]);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain("Usage: wiki-kit");
    expect(process.exitCode).toBe(0);
  });

  it("no subcommand prints non-empty usage and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await main([]);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0].length).toBeGreaterThan(0);
    expect(process.exitCode).toBe(0);
  });

  it("usage lists all 7 commands", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(["--help"]);

    const output = log.mock.calls[0]?.[0] as string;
    for (const name of [
      "lint",
      "affected",
      "ingest-prompt",
      "llms",
      "init",
      "update",
      "hub",
    ]) {
      expect(output).toContain(name);
    }
  });

  it("unknown subcommand exits non-zero with a usage message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await main(["bogus-command"]);

    expect(error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("routes a known command to its module", async () => {
    // Mocks commands/lint.js's own `run` rather than relying on some other
    // command still being an unimplemented stub — that assumption breaks
    // every time another command's task lands (already happened twice: T10
    // repointed this at `affected`, then T11 made `affected` real too).
    lintRun.mockClear();
    await main(["lint", "--strict"]);
    expect(lintRun).toHaveBeenCalledWith(["--strict"]);
  });
});
