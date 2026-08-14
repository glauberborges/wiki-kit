import { describe, expect, it } from "vitest";
import { substitutePlaceholders, type InitAnswers } from "../../src/init/placeholders.js";

const ANSWERS: Required<InitAnswers> = {
  project: "wiki-kit",
  org: "glauberborges",
  repo: "wiki-kit",
  locale: "en",
  searchLang: "en",
  tagline: "Docs that verify themselves",
  taglineLong: "Docs that verify themselves against the code they describe",
};

describe("substitutePlaceholders", () => {
  it.each([
    ["{{PROJECT}}", ANSWERS.project],
    ["{{ORG}}", ANSWERS.org],
    ["{{REPO}}", ANSWERS.repo],
    ["{{LOCALE}}", ANSWERS.locale],
    ["{{SEARCH_LANG}}", ANSWERS.searchLang],
    ["{{TAGLINE}}", ANSWERS.tagline],
    ["{{TAGLINE_LONG}}", ANSWERS.taglineLong],
  ])("replaces %s", (token, expected) => {
    expect(substitutePlaceholders(`before ${token} after`, ANSWERS)).toBe(
      `before ${expected} after`
    );
  });

  it("throws naming the missing placeholder when its answer is absent", () => {
    expect(() => substitutePlaceholders("{{PROJECT}}", {})).toThrow(/\{\{PROJECT\}\}/);
  });
});
