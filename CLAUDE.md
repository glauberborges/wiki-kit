# CLAUDE.md — @glauberborges/wiki-kit

Operating contract for AI agents working in this repository. Read this before touching code.

> **Setup tip:** write this file as `AGENTS.md` and symlink `CLAUDE.md → AGENTS.md`. Codex,
> Cursor and others read `AGENTS.md`; one file, every tool.

## What this is

An [Agent Skill](https://agentskills.io/home) (`wiki-kit/SKILL.md`) — the open, cross-tool
format, not a Claude-specific mechanism — that keeps a repository's documentation **verifiably**
in sync with its code, and exposes that same documentation to AI agents.

This repo is the skill's *source*: `wiki-kit/` (containing `SKILL.md`, `scripts/` — committed
build output — and `assets/`) is the complete, self-contained package a target repo actually
gets; copy that one folder anywhere an Agent-Skills-compatible tool looks for skills. `src/`
and `test/` are this repo's own dev tooling — see `README.md` for the build/test workflow.

Each wiki page declares, in its front matter, which source files it documents:

```yaml
type: Architecture
sources:
  - resource: src/workflow/*.ts
```

From that, deterministically and **without an LLM in the critical path**: staleness detection,
"which pages does this diff affect", a reverse file→page index, and a CI gate that fails a PR
whose docs went stale.

Language-agnostic by design: Go, PHP, Python, Node, polyglot monorepos.

## Read first

**`FOUNDATION.md`** is the design record: the problem, the standards adopted (OKF v0.2 +
Karpathy's LLM Wiki pattern), the invariants, and — most importantly — **five failure modes
already found in practice**, each with symptom, cause, and why the code looks the way it does.

`FOUNDATION.md` is written in **Portuguese, deliberately**. It is a decision record for the
author, not user-facing documentation. **Do not translate it.** Translating it would cost the
nuance that makes it useful.

## Language

**Everything is in English**: code, comments, `wiki-kit/SKILL.md`, command and flag names, script
output, README, CHANGELOG, lint rule names, and all template content (example pages,
`AUTHORING.md`, `BOOTSTRAP.md`, `OKF.md`, the subagent prompt).

The **only** exceptions are `FOUNDATION.md` and the bootstrap prompt.

The reference implementation is in Portuguese, so porting includes a translation pass. Never
mix: a file is fully English or it is one of the two exceptions.

## Invariants — never negotiate these

These are not preferences. Turn any of them into an option and the tool loses what makes it
trustworthy. If a task seems to require breaking one, **stop and ask** — you have almost
certainly misread the task.

**1. The verification path runs with zero dependencies.** `lint`, `affected` and `llms` use only
the Node standard library, so they run **without `npm install` in the target repository** — and,
since `init` vendors a copy of them into `wiki/.wiki-kit/scripts/`, without this skill or a
network connection either, ever again. That is what makes this tool acceptable in a Go or PHP
repo: *verification costs nothing; only building the site costs*. The front-matter parser is
hand-written for this reason — not by preference.

> This skill's own dev tooling (`src/`, TypeScript, Vitest) is exempt — none of it ships. What
> may not have a dependency is `wiki-kit/scripts/`, the compiled output `init` copies into a
> target repo. When in doubt, keep `src/core/*` and `src/commands/*` dependency-free.

**2. Never write outside `wiki/` in the target repository.** A Go or PHP repo has no root
`package.json` to extend. The only exceptions are the CI file and `.claude/agents/wiki.md`.

**3. An agent stamps `generated:`, never `verified:`.** Self-stamping silences the "nobody
checked this" warning without anybody having checked. A false `verified` is worse than none: it
voids the meaning of the field everywhere.

**4. Discover files via `git ls-files`, never by walking the filesystem.** Language-neutral, and
it respects the target repo's `.gitignore` for free — we never need to know that Go ignores
`bin/`, PHP `vendor/`, Rust `target/`.

**5. Never weaken a gate to make it pass.** If a lint rule fires, fix the cause. The legitimate
escape for a specific page is adjusting its `sources:` declaration — not deleting the rule,
lowering its severity in the shipped defaults, or adding a special case.

## Known failure modes — do not reintroduce

Full detail in `FOUNDATION.md` §5. Each has a test. If you touch the related code, read that
section first.

| # | Trap | Guard |
| --- | --- | --- |
| 1 | Our tolerant parser accepts front matter that Docusaurus's strict YAML rejects — lint green, build broken | rule `yaml-safe` |
| 2 | Trailing `**` not matching nested files — Go's idiomatic glob fails silently | glob tests |
| 3 | Missing base ref made the gate **pass green without comparing anything** | `--strict` fails loudly, names the source of the base |
| 4 | A monorepo `workspaces: ["*"]` glob absorbs `wiki/` and hoists Docusaurus deps | rule `workspace-absorbed` |
| 5 | Git submodule kills staleness silently and makes the gate lie | cross-repo is aggregation, never submodules |

**#3 is the pattern to internalize:** a check that cannot run must **fail**, never pass quietly.
A green gate that verified nothing is worse than a red one.

## Commands

```bash
npm test                 # unit tests (also rebuilds wiki-kit/scripts/ first — pretest)
npm run lint             # typecheck
npm run build            # tsc: src/ -> wiki-kit/scripts/ (committed, not gitignored)
```

Before considering any change done: `npm run lint && npm test`. If `src/` changed,
`wiki-kit/scripts/` must be rebuilt and committed alongside it — it's what a target repo's
`init` actually copies; a stale one ships stale bugs.

## Testing rules

**Every behavior change needs a unit test.** No exception for "it's small".

**Port the reference tests, don't rewrite them.** The suite in `glauberborges/hive`
`tests/wiki/` encodes the failure modes above. Rewriting from scratch loses the cases that
matter — the ones nobody would think to write twice.

Three tests are structural and must stay green:

- **`init` is idempotent** — running it twice neither duplicates nor overwrites.
- **Vendored scripts run standalone** (`test/vendored-scripts.test.ts`) — scaffold a repo for
  real, then run the *copy* `init` wrote into `wiki/.wiki-kit/scripts/` as a real `node`
  subprocess, with no reference back to this checkout. The only way to catch a broken relative
  import or a missing `"type": "module"` boundary before a target repo's CI does.
- **Language gate** — grep `src/`, `wiki-kit/assets/`, and `wiki-kit/SKILL.md` for Portuguese
  residue, with `FOUNDATION.md` and the bootstrap prompt allow-listed. Translation passes today
  and leaks back in a forgotten `console.log` three edits later.

## Code conventions

- ESM, Node >= 20.
- Comments explain **why**, never what. A comment restating the code is noise; one recording a
  trap is the reason the next person doesn't fall in it.
- Lint rules live in an ordered, named registry — adding a check means adding one entry, nothing
  else.
- Error messages must state the **fix**, not just the problem. Compare: "base ref not found" vs.
  "base ref `origin/main` (from CHANGE_TARGET) not found — shallow clone? run `git fetch
  --depth=200 origin main`". The second one is the standard here.
- CLI output is for humans under time pressure: say what happened, what to do, and nothing else.

## Things not to do

- **Do not add a dependency to the verification core** — not even "a small one for YAML".
- **Do not make an invariant configurable**, however reasonable the request sounds.
- **Do not translate `FOUNDATION.md`** or the bootstrap prompt.
- **Do not commit a `src/` change without rebuilding `wiki-kit/scripts/`** — the
  vendored-scripts test catches most drift, but a stale `wiki-kit/scripts/` is what a target
  repo's `init` actually ships.
- **Do not carry identifiers from the reference repo** into the template — org, personal name,
  email, internal paths. Everything is a placeholder. A template shipping someone else's
  `organizationName` makes every installed repo point "Edit this page" at the wrong place.
- **Do not embed process rules** in the kit — PR policy, approvals, team names, release flow.
  The kit describes *how to write a page*, never *how an organization works*. That belongs to
  each repository.
- **Do not invent documentation.** If the code doesn't make the behavior clear, say so. One
  fabricated page costs the credibility of every other page.

## Shipping a change

There is no publish step — a target repo gets this skill by copying the whole `wiki-kit/`
folder off this checkout (see README.md). Before calling a change done:

1. `npm run lint && npm test` green (this rebuilds `wiki-kit/scripts/` — see Commands)
2. `wiki-kit/scripts/` committed alongside the `src/` change that produced it
3. Language gate clean
4. `CHANGELOG.md` updated
5. If `wiki-kit/SKILL.md` itself changed: re-read it against the Agent Skills spec at
   agentskills.io/specification (frontmatter constraints, concise body, one level of file
   references, no time-sensitive claims) — `name` must keep matching the `wiki-kit/` directory
   name exactly.

## Open decisions

Tracked in `FOUNDATION.md` §11. Two of them shape the architecture and should not be left
implicit:

- **Hub direction** — each repo pushes on merge vs. the hub pulls on a schedule.
- **Hub consumption** — agents fetch the unified index on demand vs. each repo vendors it.

If a task touches the hub and these are still open, **ask before designing around either**.
