import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

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
    // `affected` is still a stub; `lint` (T10) is real now, so routing is
    // exercised against a command module that hasn't landed yet.
    await expect(main(["affected"])).rejects.toThrow("not implemented yet");
  });
});
