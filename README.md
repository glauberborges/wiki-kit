# wiki-kit

An [Agent Skill](https://agentskills.io/home) — the open format originally from Anthropic,
supported by 40+ AI tools (Claude Code, Cursor, Codex, Copilot, Gemini CLI, and more):
documentation that can't quietly go stale, because every page declares which source files it
documents, and the check runs with plain `node` — no LLM, no npm install in the target repo.

**This repo is the skill's source.** `wiki-kit/` at the root is the actual product — a
complete, self-contained skill folder any Agent-Skills-compatible tool can load. This README
is for whoever maintains it.

## What ships vs. what's dev-only

```
wiki-kit/                ← THE SKILL — copy this whole folder anywhere
  SKILL.md                 metadata + workflows: when to use what
  scripts/                  COMMITTED build output — see "Building"
  assets/                    what `init` scaffolds into a target repo's wiki/
src/                      ← TypeScript source wiki-kit/scripts/ is compiled from
test/                      ← Vitest suite, runs against src/ directly
```

To install this skill somewhere, copy the whole `wiki-kit/` folder into `.claude/skills/`,
`.cursor/skills/`, or wherever the target tool reads skills from (see the client's own docs on
[agentskills.io/clients](https://agentskills.io/clients)). `src/` and `test/` stay behind —
they're this repo's own dev tooling, not part of the skill.

## Why the split

`lint`, `affected`, and `llms` have to run without an LLM in the loop — that's what lets a
target repo's CI gate a PR on stale docs using nothing but `node` on PATH, in a Go or PHP repo
that's never heard of npm. An Agent Skill only exists inside an agent session, so it can't
itself be that CI step. The resolution: `init` vendors a copy of the verification scripts into
the target repo (`wiki/.wiki-kit/scripts/`), and the target's own Makefile/CI calls `node` on
them directly — no dependency on this skill, or on any agent, ever again.

Writing pages, by contrast, benefits from a real agent reading the diff and understanding
intent — that part is genuinely a skill workflow, done live in the session.

## Building

```bash
npm install
npm run build     # tsc: src/ -> wiki-kit/scripts/
npm test           # vitest, also runs a build first (pretest)
npm run lint        # typecheck only, no output written
```

`wiki-kit/scripts/` is compiled output but **is committed** (unlike a typical `dist/`) — a
target repo gets its copy by `init` reading straight off this checkout's filesystem, with no
publish step in between. Rebuild and commit `wiki-kit/scripts/` alongside any `src/` change.

Tests import `src/*.ts` directly (Vitest transforms on the fly) but `test/init/scaffold.test.ts`
and `test/commands/init.test.ts` also exercise the real vendoring step, which reads from
`wiki-kit/scripts/` on disk — hence the `pretest` build.

## Testing a change end-to-end

```bash
npm run build
cd /path/to/some/other/git/repo
node /path/to/this/checkout/wiki-kit/scripts/commands/init.js --project Test --org test \
  --tagline "Test" --tagline-long "Test wiki."
node /path/to/this/checkout/wiki-kit/scripts/commands/lint.js
```

`init` copies its own sibling `scripts/` into the target repo — so after that first run, the
target repo's own `wiki/.wiki-kit/scripts/` is a frozen snapshot; re-run `init` (or copy
`wiki-kit/scripts/` manually) to pick up further changes during iteration.

## Status

Ported and packaged from a reference implementation that ran as a plain CLI in production, now
repackaged as an Agent Skill (see `FOUNDATION.md` for the full design record — the standards
it's built on, the invariants, and failure modes already found and fixed: submodules,
tolerant-vs-strict YAML parsing, glob edge cases, silent CI gates, monorepo workspace
absorption). Not yet used outside this repo.

License: TBD.
