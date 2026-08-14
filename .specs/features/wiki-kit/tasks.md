# wiki-kit Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by
name and follow its Execute flow and Critical Rules.** Do not search for
skill files by filesystem path. The skill is the source of truth for the
full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed
without it.**

---

**Design**: `.specs/features/wiki-kit/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from project guidelines and spec — confirm before Execute.
> Guidelines found: `CLAUDE.md` (this project's own command table — `npm
> test`, `npm run lint`, `npm run build`, `npm pack --dry-run` — plus its
> explicit "every behavior change needs a unit test" and "port the reference
> tests, don't rewrite them" rules, and the three named structural tests:
> init-idempotent, real-install, language-gate). No existing test files in
> this repo yet (greenfield) — the reference's `tests/wiki/*.test.ts` (4
> files, Vitest) is the porting source, per `AD-008`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| `core/*` (frontmatter, pages, config, lint-rules, base-ref, llms) | unit | All branches; 1:1 to spec ACs; every listed edge case; reference tests ported unmodified where a reference test exists, new tests written for `findRepoRoot`, `config.ts`, `llms.ts` (no reference equivalent — see design.md Risks & Concerns) | `test/core/*.test.ts` | `npm test` |
| `src/commands/*` (lint, affected, ingest-prompt, llms, init, update, hub) | integration | Happy path + every listed edge case + error/failure path per that command's ACs, run against a fixture repo (fixture `wiki/` tree or scratch temp repo) | `test/commands/*.test.ts` | `npm test` |
| `src/init/*` (detect-stack, scaffold, placeholders, prompts, ci-select) | unit | 1:1 to INIT ACs; `scaffold`'s idempotency and batch-overwrite behavior get dedicated cases | `test/init/*.test.ts` | `npm test` |
| `src/cli.ts` (routing) | integration | Unknown command → error; `--help` → non-empty output; flag parsing delegates correctly | `test/cli.test.ts` | `npm test` |
| Package config (`package.json`, `tsconfig.json`, `bin/cli.js`) | none | Build gate only | — | `npm run build && npm pack --dry-run` |
| `templates/` (content) | none | Covered transitively by `init` integration tests and the real-install/language-gate structural tests | — | build gate only |
| Whole package — real install | integration (structural) | `npm pack` → install into temp dir → `wiki-kit lint` runs clean | `test/install.test.ts` | `npm test` |
| Whole package — language gate | integration (structural) | Zero Portuguese residue in the publishable package outside `FOUNDATION.md`/opening prompt | `test/language-gate.test.ts` | `npm test` |

**Coverage Expectation defaults applied** (no per-layer guideline beyond
CLAUDE.md's blanket rule, so the strong default governs): domain logic
(`core/*`) maps 1:1 to spec ACs with every edge case covered; command
adapters get happy+edge+error; config/build-only layers get no dedicated
test, just the build gate.

## Gate Check Commands

> Generated from `CLAUDE.md`'s own command table — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks touching only `core/*` (unit tests) | `npx vitest run test/core` |
| Full | After tasks touching `src/commands/*`, `src/init/*`, or `src/cli.ts` (integration tests) | `npm test` |
| Build | After phase completion, or any task touching `package.json`/`tsconfig.json`/`templates/` | `npm run build && npm run lint && npm test` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the
next begins, and tasks within a phase execute in order.

### Phase 1: Package scaffolding + front-matter/pages port

```
T1 → T2 → T3
```

### Phase 2: Core engine (config, lint rules, base-ref, llms)

```
T4 → T5 → T6 → T7
```

### Phase 3: CLI plumbing + verification commands

```
T8 → T9 → T10 → T11 → T12 → T13
```

### Phase 4: init subsystem

```
T14 → T15 → T16 → T17 → T18 → T19 → T20
```

### Phase 5: update + hub + structural tests

```
T21 → T22 → T23 → T24
```

---

## Task Breakdown

### T1: Package scaffolding (package.json, tsconfig.json, .gitignore)

**What**: Create `package.json` (name `@glauberborges/wiki-kit`, `bin`,
`engines: {node: ">=20"}`, `files: ["dist","bin","templates"]`,
`publishConfig.access: public`, scripts `build`/`lint`/`test`,
devDependencies `typescript`, `vitest`, `@types/node` — zero runtime
`dependencies`, per AD-001/AD-002), `tsconfig.json` (ESM, Node 20 target,
strict), and `.gitignore` (`dist/`, `node_modules/`).
**Where**: `package.json`, `tsconfig.json`, `.gitignore`
**Depends on**: None
**Reuses**: `docs/superpowers/specs/2026-08-14-package-architecture-design.md` §2-4 (already-decided package.json shape)
**Requirement**: N/A (project scaffolding, no direct AC)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `package.json` has zero entries under `dependencies`
- [ ] `npm run build`/`npm run lint`/`npm test` scripts are defined (may no-op until later tasks add source, but must not error on an empty `src/`)
- [ ] `npm pack --dry-run` lists exactly `dist/`, `bin/`, `templates/` content (once those exist) plus standard files

**Tests**: none
**Gate**: build

---

### T2: `core/frontmatter.ts`

**What**: Port `wiki/scripts/lib/frontmatter.mjs` to `src/core/frontmatter.ts` — `splitFrontMatter`, `parseFrontMatter`, `readFrontMatter` — with TypeScript types added, zero behavior change.
**Where**: `src/core/frontmatter.ts`
**Depends on**: T1
**Reuses**: `wiki/scripts/lib/frontmatter.mjs` (154 lines) — ported near-verbatim per AD-005
**Requirement**: supports CORE-01, CORE-09 (yaml-safe consumes `rawHead`)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All three exported functions match the reference's behavior for scalars, inline maps/lists, and block lists of maps
- [ ] The loop-termination regression case (from `tests/wiki/frontmatter.test.ts`) passes
- [ ] No TypeScript errors (`npm run lint`)

**Tests**: unit — ported from `tests/wiki/frontmatter.test.ts`, same assertions
**Gate**: quick

---

### T3: `core/pages.ts`

**What**: Port `wiki/scripts/lib/pages.mjs` to `src/core/pages.ts` — `loadPages`, `normalizeSources`, `trackedFiles`, `globToRegExp`, `expandSource`, `buildSourceMap` — AND add `findRepoRoot(cwd)`, new code (not a port) that walks up from `cwd` to the nearest `.git` entry, replacing the reference's module-location-relative `WIKI_DIR`/`REPO_ROOT` computation (design.md Risks & Concerns — this breaks once wiki-kit is an installed package).
**Where**: `src/core/pages.ts`
**Depends on**: T2
**Reuses**: `wiki/scripts/lib/pages.mjs` (179 lines) per AD-005; `frontmatter.ts` from T2
**Requirement**: CORE-10 (glob `**` nested matching)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `globToRegExp`/`expandSource` match the reference's glob semantics, including `internal/**` matching nested files (CORE-10 regression guard)
- [ ] `findRepoRoot` resolves correctly from a nested cwd inside a repo, and from a git worktree (`.git` as a file, not a directory)
- [ ] `trackedFiles` uses `git ls-files`, never filesystem walking, per invariant #4

**Tests**: unit — ported from `tests/wiki/pages.test.ts` + new cases for `findRepoRoot` (cwd resolution, worktree `.git` file case)
**Gate**: quick

---

### T4: `core/config.ts`

**What**: Implement `loadConfig(wikiDir)` reading `wiki/wiki-kit.config.yaml`, reusing `frontmatter.ts`'s `parseFrontMatter` on the raw file content (no `---` fencing needed — same flat scalar/list/map grammar). Throws with file path + offending line on malformed input (design.md Error Handling Strategy).
**Where**: `src/core/config.ts`
**Depends on**: T2
**Reuses**: `parseFrontMatter` from T2, directly (AD-003 decision to avoid a second YAML parser)
**Requirement**: supports all commands reading config (`hub.repo`/`hub.branch`, `update.agent`, `rules`, `okf.types`, `output`)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Parses the exact shape in `spec.md` §6 (`rules`, `okf`, `output`, optional `hub`, optional `update`)
- [ ] Missing file → typed error naming the expected path
- [ ] Malformed file → error naming file + line, never a silent default

**Tests**: unit — new (no reference equivalent)
**Gate**: quick

---

### T5: `core/lint-rules.ts`

**What**: Port the 11-rule `RULES` array from `wiki-lint.mjs` (lines 43-231) to `src/core/lint-rules.ts` — `yaml-safe`, `okf-type`, `title`, `sources-present`, `sources-exist`, `staleness`, `stale-after`, `unverified`, `orphan`, `workspace-absorvido`→`workspace-absorbed` (translated rule name per FOUNDATION §7), `links`. Wire rule severity/`apply-to` to `config.ts`'s `rules` block. Drop the dead ternary at `wiki-lint.mjs:401` if it's still present in this module's port path (it's in `printAffected`, not `RULES` — verify at port time it doesn't leak in here).
**Where**: `src/core/lint-rules.ts`
**Depends on**: T3, T4
**Reuses**: `wiki-lint.mjs`'s `RULES` array per AD-005; ordered/named registry pattern matches `CLAUDE.md`'s own stated convention
**Requirement**: CORE-01, CORE-09

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All 11 rules present, same `name`/`describe`/behavior as the reference
- [ ] `yaml-safe` still catches the exact regression case (unquoted scalar starting with `` ` ``) — CORE-09
- [ ] `workspace-absorbed` (English name) fires only when the root `package.json` has a `workspaces` glob that reaches `wiki/`
- [ ] Severity/`apply-to` come from `config.ts`, not hardcoded

**Tests**: unit — `yaml-safe` ported from `tests/wiki/yaml-safe.test.ts`; the other 10 rules get new tests, one case per rule, derived from CORE-01/CORE-09 and the Edge Cases in spec.md
**Gate**: quick

---

### T6: `core/base-ref.ts`

**What**: Port `resolveBase`, `refExists`, `changedFiles`, `computeAffected` from `wiki-lint.mjs` (lines 278-379) to `src/core/base-ref.ts`.
**Where**: `src/core/base-ref.ts`
**Depends on**: T3
**Reuses**: `wiki-lint.mjs` base-ref detection logic per AD-005; `buildSourceMap` from T3
**Requirement**: CORE-04, CORE-08, CORE-11, CORE-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `resolveBase` checks, in order, `--base` → `WIKI_BASE` → `GITHUB_BASE_REF` → `CHANGE_TARGET` → `ghprbTargetBranch` → `gitlabTargetBranch` → `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` → `BITBUCKET_PR_DESTINATION_BRANCH` → `origin/HEAD` → `origin/main` (CORE-08)
- [ ] `changedFiles` unions committed diff, uncommitted working-tree changes, and untracked new files (CORE-11)
- [ ] `computeAffected` returns `affected`/`uncovered`/`touchedPages` matching the reference's shape, used later by the "missed pages" gate check (CORE-12)
- [ ] Unresolvable base ref surfaces `baseOk: false` + `baseFrom`, never throws / never silently empties the diff (CORE-04)

**Tests**: unit — new, derived from CORE-04/08/11/12 (no single reference test file covered this; it was previously exercised only via the reference's manual/CI testing, per design.md)
**Gate**: quick

---

### T7: `core/llms.ts`

**What**: Port `renderIndex`, `renderFull`, `renderLog`, `writeArtifacts` (formerly `main`'s body) from `wiki-llms.mjs` to `src/core/llms.ts`. Translate every generated-content label (`Origem:`→`Source:`, `Documenta:`→`Documents:`, `(histórico indisponível)`→`(history unavailable)`, `# Log`, `conteúdo completo`→`full content`, etc. — full audit, not just the ones FOUNDATION §7 named). Replace the hardcoded `8 * 1024` threshold with `config.output["llms-max-kb"]`.
**Where**: `src/core/llms.ts`
**Depends on**: T3, T4
**Reuses**: `wiki-llms.mjs` (174 lines) per AD-005
**Requirement**: CORE-06, CORE-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `llms.txt`/`llms-full.txt`/`map.json`/OKF bundle generated match the reference's structure for the same input pages
- [ ] Every hardcoded string in the generator is in English (verified against `test/language-gate.test.ts` later, T24)
- [ ] The oversize warning threshold reads from config, defaulting to 8 KB

**Tests**: unit — new (design.md flagged: the reference has no test for `wiki-llms.mjs` at all; this is a genuine coverage gap being closed, not a port)
**Gate**: quick

---

### T8: `src/cli.ts` — routing

**What**: Implement flag/subcommand parsing with `node:util.parseArgs` (AD-001) and dispatch to `src/commands/*`. Unknown command → error + usage; `--help` → usage text.
**Where**: `src/cli.ts`, `bin/cli.js` (shim: `#!/usr/bin/env node` importing `dist/cli.js`)
**Depends on**: T1
**Reuses**: none from the reference (the reference has no CLI router — it's separate scripts invoked by `Makefile` targets)
**Requirement**: N/A (infrastructure all commands sit on top of)

**Tools**:
- MCP: Context7 — REQUIRED, verify current `node:util.parseArgs` API shape before implementing (confirmed with user)
- Skill: NONE

**Done when**:
- [ ] Routes `lint`/`affected`/`ingest-prompt`/`llms`/`init`/`update`/`hub` to their command modules (later tasks fill these in — routing may target stub functions until T10-T22 land)
- [ ] Unrecognized subcommand exits non-zero with a usage message
- [ ] `--help` prints non-empty usage text

**Tests**: integration — command-not-found and `--help` cases
**Gate**: quick

---

### T9: Wire `bin/cli.js` end-to-end smoke path

**What**: Confirm `node bin/cli.js --help` works after a build (`npm run build`), closing the loop from shim → compiled `dist/cli.ts` output → routing.
**Where**: `bin/cli.js` (verify only — no logic change expected beyond T8's shim)
**Depends on**: T8
**Reuses**: T8's router
**Requirement**: N/A (verification step for T8's shim, kept separate because it requires a build, unlike T8's unit-level routing test)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `npm run build && node bin/cli.js --help` prints usage and exits 0

**Tests**: none (covered by T8's integration test at the unit level; this is a manual/CI build-gate check, not a new test file)
**Gate**: build

---

### T10: `src/commands/lint.ts`

**What**: CLI adapter for `wiki-kit lint [--strict]` — runs all rules from `lint-rules.ts` against `loadPages()`, prints findings, sets exit code per CORE-02.
**Where**: `src/commands/lint.ts`
**Depends on**: T5, T8
**Reuses**: `lint-rules.ts` (T5), reference `wiki-lint.mjs`'s `main()` output-formatting loop (lines 514-527) per AD-005
**Requirement**: CORE-01, CORE-02, CORE-09, CORE-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Plain `lint` exits non-zero only on `error`-severity findings
- [ ] `lint --strict` exits non-zero on `error` OR `warn` findings (CORE-02)
- [ ] Output format matches the reference's `✗`/`!` marker convention

**Tests**: integration — run against a fixture `wiki/docs/` tree with known violations of each severity
**Gate**: full

---

### T11: `src/commands/affected.ts`

**What**: CLI adapter for `wiki-kit affected [--base <ref>]` — calls `computeAffected`, prints via a ported `printAffected` (translated to English), implements the `--strict` "missed pages" gate check (CORE-12).
**Where**: `src/commands/affected.ts`
**Depends on**: T6, T8
**Reuses**: `base-ref.ts` (T6); `wiki-lint.mjs`'s `printAffected` (lines 381-413) and the `--affected --strict` branch of `main()` (lines 481-511), translated
**Requirement**: CORE-03, CORE-04, CORE-11, CORE-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Reports "pages to update" and "not covered" as two distinct sections, in English
- [ ] Unresolvable base ref fails loud with the exact `git fetch` remediation command, in English (CORE-04)
- [ ] `--strict` fails when a page's declared sources changed but the page wasn't touched (CORE-12)

**Tests**: integration — fixture repo with a resolvable base, an unresolvable base, and a missed-page scenario
**Gate**: full

---

### T12: `src/commands/ingest-prompt.ts`

**What**: CLI adapter for `wiki-kit ingest-prompt` — calls `computeAffected`, prints a ported-and-translated `printPrompt` (the L0 agent-ready prompt).
**Where**: `src/commands/ingest-prompt.ts`
**Depends on**: T6, T8
**Reuses**: `base-ref.ts` (T6); `wiki-lint.mjs`'s `printPrompt` (lines 416-470), fully translated to English
**Requirement**: CORE-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Prompt content and structure match the reference's sections (pages to update / files without coverage / how to write), entirely in English
- [ ] "No affected pages" case prints a plain English message and does not emit an empty prompt shell

**Tests**: integration — affected case, uncovered-files case, no-affected-pages case
**Gate**: full

---

### T13: `src/commands/llms.ts`

**What**: CLI adapter for `wiki-kit llms` — calls `writeArtifacts` from `core/llms.ts`, prints the size/coverage summary (translated).
**Where**: `src/commands/llms.ts`
**Depends on**: T7, T8
**Reuses**: `core/llms.ts` (T7); `wiki-llms.mjs`'s `main()` summary-printing lines (162-171), translated
**Requirement**: CORE-06, CORE-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Writes `llms.txt`/`llms-full.txt`/`map.json`/`okf/` under the configured output dir
- [ ] Prints the same KB-size/page-count summary shape as the reference, translated
- [ ] Runs with zero `npm install` in the target repo (verified structurally in T23)

**Tests**: integration — fixture repo, confirm all four artifacts are written with expected content
**Gate**: full

---

### T14: `src/init/detect-stack.ts`

**What**: Port the manifest→stack table from `BOOTSTRAP.md` §1 (`go.mod`→Go, `composer.json`→PHP, `package.json`→Node, `pyproject.toml`/`setup.cfg`→Python, `Cargo.toml`→Rust, `pom.xml`/`build.gradle`→Java/Kotlin, `Gemfile`→Ruby) into `detectStack(repoRoot)`, translated.
**Where**: `src/init/detect-stack.ts`
**Depends on**: T1
**Reuses**: `.claude/skills/wiki-kit/references/BOOTSTRAP.md` §1 table, translated
**Requirement**: INIT-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Detects each stack in the table from its manifest file
- [ ] Multiple manifests present → returns all matches (polyglot monorepo case, per `BOOTSTRAP.md`)
- [ ] No manifest recognized → returns `null`, not a throw

**Tests**: unit — one case per manifest type + the polyglot case + the none-found case
**Gate**: quick

---

### T15: Port + translate `templates/` tree

**What**: Copy `.claude/skills/wiki-kit/template/**` into `templates/`, translating: doc sections (`comecando/`→`getting-started/`, `guias/`→`guides/`, `arquitetura/`→`architecture/`, `referencia/`→`reference/`, `contribuindo/`→`contributing/`), `WIKI.md`→`AUTHORING.md`, all Portuguese prose in every template file, and the `wiki-kit.config.yaml` template (new — didn't exist in the reference's template, since the config file itself is new to this port, AD-003).
**Where**: `templates/wiki/**`, `templates/github/wiki.yml`, `templates/jenkins/Jenkinsfile.wiki`, `templates/claude/agents/wiki.md`
**Depends on**: T1
**Reuses**: `.claude/skills/wiki-kit/template/**` (confirmed by grep: placeholders `{{...}}` appear in exactly `docusaurus.config.js`, `docs/index.md`, `github/wiki.yml` — no other file needs placeholder logic)
**Requirement**: INIT-01, INIT-03, INIT-06, INIT-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every template file's prose is in English (no Portuguese residue — pre-check ahead of T24's formal gate)
- [ ] Section directory names match FOUNDATION §7's translation table
- [ ] `templates/wiki/wiki-kit.config.yaml` exists with the default `rules`/`okf`/`output` blocks from spec.md §6
- [ ] All `{{...}}` placeholder tokens preserved verbatim (not translated away) in the 3 files that use them

**Tests**: none directly (content) — validated by T19/T20's integration tests and T24's language gate
**Gate**: build

---

### T16: `src/init/placeholders.ts`

**What**: Implement `substitutePlaceholders(content, answers)` replacing `{{PROJECT}}`, `{{ORG}}`, `{{REPO}}`, `{{LOCALE}}`, `{{SEARCH_LANG}}`, `{{TAGLINE}}`, `{{TAGLINE_LONG}}`.
**Where**: `src/init/placeholders.ts`
**Depends on**: T1
**Reuses**: none from the reference (substitution was a manual `sed` step, per FOUNDATION §7 — this formalizes it)
**Requirement**: INIT-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All 7 placeholders replaced when present in input
- [ ] Missing an answer for a placeholder present in the content → throws naming which one (surfaces as `init`'s non-interactive failure path, INIT edge case)

**Tests**: unit — one case per placeholder + the missing-answer case
**Gate**: quick

---

### T17: `src/init/ci-select.ts`

**What**: Implement `selectCi(repoRoot)` → `"github" | "jenkins" | "manual"` based on presence of `.github/` or `Jenkinsfile`.
**Where**: `src/init/ci-select.ts`
**Depends on**: T1
**Reuses**: `.claude/skills/wiki-kit/SKILL.md`'s CI-selection table (today's fallback logic for GitLab/Bitbucket/Drone → manual instructions)
**Requirement**: INIT-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `.github/` present → `"github"`
- [ ] No `.github/`, `Jenkinsfile` present → `"jenkins"`
- [ ] Neither → `"manual"`

**Tests**: unit — one case per branch
**Gate**: quick

---

### T18: `src/init/prompts.ts`

**What**: Implement `askInteractive(known)` — prompts via `node:readline` only for missing answers, only when `process.stdin.isTTY`; returns immediately with defaults/flag values when not a TTY.
**Where**: `src/init/prompts.ts`
**Depends on**: T1
**Reuses**: none from the reference (today's flow is entirely manual, no prompting code exists)
**Requirement**: INIT-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] TTY + missing answer → prompts
- [ ] Non-TTY + missing answer → uses documented default (locale) or leaves it to `scaffold.ts`'s non-interactive failure path (INIT edge case) for values with no default
- [ ] Flag values always win over prompting, TTY or not

**Tests**: unit — mock `process.stdin.isTTY` true/false, with and without pre-filled answers
**Gate**: quick

---

### T19: `src/init/scaffold.ts`

**What**: Implement `scaffold(repoRoot, answers, opts)` — idempotent template copy (skip existing files unless `--force`), batch-overwrite confirmation listing every conflict once, writes `wiki/wiki-kit.config.yaml` with defaults plus the `hub:` block when the hub-connection question was answered "yes" (INIT-08).
**Where**: `src/init/scaffold.ts`
**Depends on**: T15, T16, T18, T4
**Reuses**: `templates/` (T15), `substitutePlaceholders` (T16), `askInteractive` (T18), `config.ts`'s shape (T4)
**Requirement**: INIT-04, INIT-05, INIT-07, INIT-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Second run with no conflicts makes zero file changes (idempotent, INIT-04)
- [ ] Conflicting files are listed once, single batch y/N confirmation, never per-file (INIT-05)
- [ ] Written config contains the FOUNDATION §7 defaults, plus `hub.repo`/`hub.branch` only when opted into (INIT-07, INIT-08)

**Tests**: unit + integration — idempotency case, conflict-batch case, hub-opted-in case, hub-declined case
**Gate**: full

---

### T20: `src/commands/init.ts`

**What**: CLI adapter wiring `detect-stack` (T14) → `prompts` (T18) → `scaffold` (T19) → `ci-select` (T17) into `wiki-kit init`. This is the task where the full INIT-01..08 flow becomes end-to-end runnable.
**Where**: `src/commands/init.ts`
**Depends on**: T14, T17, T19, T8
**Reuses**: all of T14/T17/T18/T19
**Requirement**: INIT-01, INIT-02, INIT-03, INIT-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] End-to-end run in a scratch repo with only a `go.mod` produces a working `wiki/` skeleton, `.claude/agents/wiki.md`, and the right CI file, per INIT-01's Independent Test
- [ ] Running `init` twice makes no further changes (structural idempotency test lives here)
- [ ] No placeholder tokens remain in any written file

**Tests**: integration — the INIT-01/04 Independent Test scenario, run against scratch Go/Node fixture repos
**Gate**: full

---

### T21: `src/commands/update.ts`

**What**: Implement `wiki-kit update` — read `update.agent` from config (fail naming the key if absent), resolve the binary on `PATH` (fail naming it if missing), compute affected pages via `computeAffected` (skip + report if none), spawn the agent CLI detached with the same prompt content `ingest-prompt` builds, redirect stdio to `wiki/.wiki-kit/update.log`, `.unref()` and return immediately.
**Where**: `src/commands/update.ts`
**Depends on**: T6, T4, T8, T12 (reuses its prompt-building function directly, not a copy)
**Reuses**: `base-ref.ts` (T6), `config.ts` (T4), `ingest-prompt.ts`'s prompt builder (T12)
**Requirement**: UPD-01, UPD-02, UPD-03, UPD-04, UPD-05

**Tools**:
- MCP: Context7 — REQUIRED, verify current `node:child_process.spawn` detached/`unref` semantics before relying on them (confirmed with user)
- Skill: `security-review` — REQUIRED before marking this task done (confirmed with user): pass on argument-injection risk, since the prompt text becomes a spawned process's argument

**Done when**:
- [ ] Missing `update.agent` → fails before any process spawn, names the config key (UPD-01)
- [ ] Configured binary not on `PATH` → fails, names the binary, no dangling process (UPD-03)
- [ ] No affected pages → reports and does not spawn (UPD-05)
- [ ] Successful dispatch returns control immediately — command exits without waiting for the spawned process (UPD-04)
- [ ] Prompt content passed to the agent matches what `ingest-prompt` would print (UPD-02)

**Tests**: integration — missing config, missing binary, no-affected-pages, and a mocked-spawn happy path asserting `unref`/non-blocking behavior and exact argument content
**Gate**: full

---

### T22: `src/commands/hub.ts`

**What**: Implement `wiki-kit hub push` — verify artifacts exist on disk (fail naming `wiki-kit llms` if not), verify `WIKI_HUB_TOKEN` is set (fail before any git call if not), checkout the hub repo (from `config.hub.repo`/`hub.branch`), copy artifacts under `docs/<repo-name>/`, commit, `git push` — on rejection, fail directly, no retry.
**Where**: `src/commands/hub.ts`
**Depends on**: T4, T8
**Reuses**: nothing from the reference (genuinely new; the reference has no cross-repo code) — `config.ts` (T4) for `hub.repo`/`hub.branch`
**Requirement**: HUB-01, HUB-02, HUB-03, HUB-04

**Tools**:
- MCP: NONE
- Skill: `security-review` — REQUIRED before marking this task done (confirmed with user): confirm the `WIKI_HUB_TOKEN` credential never lands in a logged command line or error message

**Done when**:
- [ ] No artifacts on disk → fails naming `wiki-kit llms` (HUB independent test)
- [ ] `WIKI_HUB_TOKEN` unset → fails before any git operation (HUB-02)
- [ ] Successful push lands artifacts under `docs/<repo-name>/` in a new commit on the hub's default branch (HUB-01)
- [ ] Rejected push (non-fast-forward) fails the command directly, no retry loop (HUB-03)
- [ ] The credential never appears in a printed command, log line, or error message

**Tests**: integration — missing artifacts, missing token, mocked-git happy path, mocked-git rejection
**Gate**: full

---

### T23: `test/install.test.ts` — real-install structural test

**What**: `npm pack` → install the tarball into a temp directory → run `wiki-kit lint` there → confirm it runs clean against a fixture wiki, catching any broken `bin`/`files`/`publishConfig` before publish.
**Where**: `test/install.test.ts`
**Depends on**: T1, T10
**Reuses**: none — this test exists specifically because nothing else catches packaging bugs (per `CLAUDE.md`'s own rationale for this test)
**Requirement**: CORE-07 (structural verification that the shipped package needs no `npm install` in the target repo)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Test builds the package, packs it, installs into an isolated temp dir, and asserts `wiki-kit lint` exits 0 against a clean fixture
- [ ] Test fails if `bin`, `files`, or `publishConfig` in `package.json` is wrong (verified by deliberately breaking one during development and confirming the test catches it, then reverting)

**Tests**: this task IS the test
**Gate**: build

---

### T24: `test/language-gate.test.ts` — language gate structural test

**What**: Grep the publishable package (`dist/`, `bin/`, `templates/`) for Portuguese residue (`ção`, `ções`, `não`, `página`, `arquivo`, `código`, and the other markers CLAUDE.md/FOUNDATION.md §9 name), with `FOUNDATION.md` and the opening prompt allow-listed (they aren't part of the published package anyway, but exclude them explicitly for clarity).
**Where**: `test/language-gate.test.ts`
**Depends on**: T15, T1
**Reuses**: FOUNDATION.md §9's named markers as the grep pattern list
**Requirement**: whole-package Success Criteria in spec.md ("zero Portuguese residue")

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Test fails if any Portuguese marker is found in `dist/`/`bin/`/`templates/`
- [ ] Test passes clean against the fully-translated `templates/` from T15 and the ported/translated `core`/`commands` from earlier tasks

**Tests**: this task IS the test
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4 ──→ T5 ──→ T6 ──→ T7
Phase 3:  T8 ──→ T9 ──→ T10 ──→ T11 ──→ T12 ──→ T13
Phase 4:  T14 ──→ T15 ──→ T16 ──→ T17 ──→ T18 ──→ T19 ──→ T20
Phase 5:  T21 ──→ T22 ──→ T23 ──→ T24
```

Execution is strictly sequential — no intra-phase parallelism. 24 tasks
total, packing into 4 batches of ~6-7 at the standard worker budget:

- **Batch 1**: Phase 1 + Phase 2 (T1-T7, 7 tasks)
- **Batch 2**: Phase 3 (T8-T13, 6 tasks)
- **Batch 3**: Phase 4 (T14-T20, 7 tasks)
- **Batch 4**: Phase 5 (T21-T24, 4 tasks)

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Package scaffolding | 3 tiny config files, no independent behavior | ✅ Granular (cohesive config bundle) |
| T2: core/frontmatter.ts | 1 module, direct port | ✅ Granular |
| T3: core/pages.ts | 1 module, direct port + 1 new function | ✅ Granular |
| T4: core/config.ts | 1 module | ✅ Granular |
| T5: core/lint-rules.ts | 1 module (11 rules, but one registry array — the reference itself treats this as one file/one concept) | ✅ Granular |
| T6: core/base-ref.ts | 1 module | ✅ Granular |
| T7: core/llms.ts | 1 module | ✅ Granular |
| T8: src/cli.ts | 1 module (routing) | ✅ Granular |
| T9: bin/cli.js smoke path | verification only, no new logic | ✅ Granular |
| T10: src/commands/lint.ts | 1 file | ✅ Granular |
| T11: src/commands/affected.ts | 1 file | ✅ Granular |
| T12: src/commands/ingest-prompt.ts | 1 file | ✅ Granular |
| T13: src/commands/llms.ts | 1 file | ✅ Granular |
| T14: src/init/detect-stack.ts | 1 file | ✅ Granular |
| T15: templates/ port+translate | many files, one cohesive migration concern (content only, no branching logic) | ✅ Granular (content-only; see note below) |
| T16: src/init/placeholders.ts | 1 file | ✅ Granular |
| T17: src/init/ci-select.ts | 1 file | ✅ Granular |
| T18: src/init/prompts.ts | 1 file | ✅ Granular |
| T19: src/init/scaffold.ts | 1 file | ✅ Granular |
| T20: src/commands/init.ts | 1 file (wiring) | ✅ Granular |
| T21: src/commands/update.ts | 1 file | ✅ Granular |
| T22: src/commands/hub.ts | 1 file | ✅ Granular |
| T23: test/install.test.ts | 1 file | ✅ Granular |
| T24: test/language-gate.test.ts | 1 file | ✅ Granular |

**Note on T15**: spans many files under `templates/`, which would normally
be a split signal. Kept as one task because every file gets the *same*
treatment (copy + translate prose), there's no branching logic to test
independently per file, and splitting it would produce ~15 tasks that are
identical in kind — pure translation busywork, not independent
deliverables. If a worker executing T15 finds it unwieldy mid-task, further
splitting by template file group (`wiki/docs/**` vs. CI templates vs. agent
template) is a reasonable in-flight call.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (start of Phase 1) | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | T2 | (Phase 2 start, arrow from T2 in prior phase) | ✅ Match |
| T5 | T3, T4 | T4→T5 (T3 dependency implicit — same phase 1→2 boundary already carried by T4) | ✅ Match |
| T6 | T3 | (Phase 2, depends on Phase 1's T3) | ✅ Match |
| T7 | T3, T4 | (Phase 2, depends on Phase 1's T3 and same-phase T4) | ✅ Match |
| T8 | T1 | (Phase 3 start, depends on Phase 1's T1) | ✅ Match |
| T9 | T8 | T8→T9 | ✅ Match |
| T10 | T5, T8 | T9→T10 (sequential slot); cross-phase dep on T5 | ✅ Match |
| T11 | T6, T8 | T10→T11; cross-phase dep on T6 | ✅ Match |
| T12 | T6, T8 | T11→T12; cross-phase dep on T6 | ✅ Match |
| T13 | T7, T8 | T12→T13; cross-phase dep on T7 | ✅ Match |
| T14 | T1 | (Phase 4 start, depends on Phase 1's T1) | ✅ Match |
| T15 | T1 | T14→T15 (sequential slot); dep on T1 | ✅ Match |
| T16 | T1 | T15→T16 (sequential slot); dep on T1 | ✅ Match |
| T17 | T1 | T16→T17 (sequential slot); dep on T1 | ✅ Match |
| T18 | T1 | T17→T18 (sequential slot); dep on T1 | ✅ Match |
| T19 | T15, T16, T18, T4 | T18→T19 (sequential slot); cross-phase/cross-task deps on T15/T16/T4 | ✅ Match |
| T20 | T14, T17, T19, T8 | T19→T20 (sequential slot); cross-task deps on T14/T17/T8 | ✅ Match |
| T21 | T6, T4, T8, T12 | (Phase 5 start); all deps in earlier phases | ✅ Match |
| T22 | T4, T8 | T21→T22 (sequential slot); deps in earlier phases | ✅ Match |
| T23 | T1, T10 | T22→T23 (sequential slot); deps on T1/T10 | ✅ Match |
| T24 | T15, T1 | T23→T24 (sequential slot); deps on T15/T1 | ✅ Match |

**Rule check**: no task depends on a task in a later phase — confirmed for
all 24 rows above.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Package config | none | none | ✅ OK |
| T2 | core/* | unit | unit | ✅ OK |
| T3 | core/* | unit | unit | ✅ OK |
| T4 | core/* | unit | unit | ✅ OK |
| T5 | core/* | unit | unit | ✅ OK |
| T6 | core/* | unit | unit | ✅ OK |
| T7 | core/* | unit | unit | ✅ OK |
| T8 | src/cli.ts (routing) | integration | integration | ✅ OK |
| T9 | build-gate verification only | none | none | ✅ OK |
| T10 | src/commands/* | integration | integration | ✅ OK |
| T11 | src/commands/* | integration | integration | ✅ OK |
| T12 | src/commands/* | integration | integration | ✅ OK |
| T13 | src/commands/* | integration | integration | ✅ OK |
| T14 | src/init/* | unit | unit | ✅ OK |
| T15 | templates/ (content) | none | none | ✅ OK |
| T16 | src/init/* | unit | unit | ✅ OK |
| T17 | src/init/* | unit | unit | ✅ OK |
| T18 | src/init/* | unit | unit | ✅ OK |
| T19 | src/init/* | unit | unit + integration (highest of the two applicable) | ✅ OK |
| T20 | src/commands/* | integration | integration | ✅ OK |
| T21 | src/commands/* | integration | integration | ✅ OK |
| T22 | src/commands/* | integration | integration | ✅ OK |
| T23 | whole package (structural) | integration | this task IS the test | ✅ OK |
| T24 | whole package (structural) | integration | this task IS the test | ✅ OK |

No violations. No task defers its tests to "later" — every task with a
matrix-required test type writes those tests in the same task.

---

## Tips

(kept from the skill template — not project-specific content)
