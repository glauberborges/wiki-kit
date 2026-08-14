import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { question, close } = vi.hoisted(() => ({
  question: vi.fn(),
  close: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({ question, close })),
}));

import { createInterface } from "node:readline/promises";
import { askInteractive } from "../../src/init/prompts.js";

describe("askInteractive", () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    question.mockReset();
    close.mockReset();
    vi.mocked(createInterface).mockClear();
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
  });

  it("prompts for missing answers when attached to a TTY", async () => {
    process.stdin.isTTY = true;
    question
      .mockResolvedValueOnce("wiki-kit") // project
      .mockResolvedValueOnce("glauberborges") // org
      .mockResolvedValueOnce("") // locale -> falls back to default
      .mockResolvedValueOnce("n"); // hub connect? no

    const result = await askInteractive({});

    expect(result).toEqual({
      project: "wiki-kit",
      org: "glauberborges",
      locale: "en",
      hub: null,
    });
    expect(question).toHaveBeenCalledTimes(4);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("walks through the hub sub-questions when the TTY user opts in", async () => {
    process.stdin.isTTY = true;
    question
      .mockResolvedValueOnce("wiki-kit")
      .mockResolvedValueOnce("glauberborges")
      .mockResolvedValueOnce("pt")
      .mockResolvedValueOnce("y")
      .mockResolvedValueOnce("glauberborges/hive-hub")
      .mockResolvedValueOnce(""); // branch -> falls back to default

    const result = await askInteractive({});

    expect(result.locale).toBe("pt");
    expect(result.hub).toEqual({ repo: "glauberborges/hive-hub", branch: "main" });
  });

  it("uses the documented locale default and leaves other missing answers undefined when not attached to a TTY", async () => {
    process.stdin.isTTY = false;

    const result = await askInteractive({});

    expect(result).toEqual({
      project: undefined,
      org: undefined,
      locale: "en",
      hub: null,
    });
    expect(question).not.toHaveBeenCalled();
    expect(createInterface).not.toHaveBeenCalled();
  });

  it("never re-prompts for a value already supplied via a flag, even on a TTY", async () => {
    process.stdin.isTTY = true;
    const known = {
      project: "wiki-kit",
      org: "glauberborges",
      locale: "fr",
      hub: { repo: "glauberborges/hub", branch: "release" },
    };

    const result = await askInteractive(known);

    expect(result).toEqual(known);
    expect(question).not.toHaveBeenCalled();
  });

  it("flag values win over prompting when not attached to a TTY too", async () => {
    process.stdin.isTTY = false;
    const known = { project: "wiki-kit", org: "glauberborges", locale: "es", hub: null };

    const result = await askInteractive(known);

    expect(result).toEqual(known);
    expect(question).not.toHaveBeenCalled();
  });
});
