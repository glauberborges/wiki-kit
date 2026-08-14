export interface InitAnswers {
  project?: string;
  org?: string;
  repo?: string;
  locale?: string;
  searchLang?: string;
  tagline?: string;
  taglineLong?: string;
}

const PLACEHOLDER_KEYS: Record<string, keyof InitAnswers> = {
  PROJECT: "project",
  ORG: "org",
  REPO: "repo",
  LOCALE: "locale",
  SEARCH_LANG: "searchLang",
  TAGLINE: "tagline",
  TAGLINE_LONG: "taglineLong",
};

const PLACEHOLDER_FLAGS: Record<keyof InitAnswers, string> = {
  project: "--project",
  org: "--org",
  repo: "--repo",
  locale: "--locale",
  searchLang: "--search-lang",
  tagline: "--tagline",
  taglineLong: "--tagline-long",
};

export function substitutePlaceholders(content: string, answers: InitAnswers): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const key = PLACEHOLDER_KEYS[name];
    // Unknown {{...}} tokens aren't one of our 7 — leave them untouched rather
    // than guess; the only 3 template files that use placeholders are grep-verified
    // (design.md) to use only these names.
    if (!key) return match;

    const value = answers[key];
    if (value === undefined) {
      throw new Error(
        `init: missing answer for {{${name}}} — pass ${PLACEHOLDER_FLAGS[key]} or answer it at the interactive prompt.`
      );
    }
    return value;
  });
}
