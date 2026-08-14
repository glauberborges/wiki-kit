# wiki-kit Validation

**Date**: 2026-08-14
**Spec**: `.specs/features/wiki-kit/spec.md`
**Diff range**: `main..feat/setup` (28 commits — package scaffolding through the final structural test; the task brief's "32 commits" figure did not match `git log --oneline main..feat/setup`, which counted 28)
**Verifier**: independent sub-agent (author ≠ verifier) — no prior context, no access to earlier waves' agent reports; all findings re-derived from the committed code, tests, and spec text.

---

## Task Completion

Ground truth: `git log --oneline main..feat/setup` (tasks.md's checkboxes were never ticked during Execute, as expected — commit history is authoritative).

| Task | Status | Commit(s) |
| ---- | ------ | --------- |
| T1 Package scaffolding | ✅ Done | `ebdf3ef` |
| T2 core/frontmatter.ts | ✅ Done | `eb409a3` (+ root-cause fix `2697bf3`) |
| T3 core/pages.ts + findRepoRoot | ✅ Done | `57c14a5` |
| T4 core/config.ts | ✅ Done | `04d4476` |
| T5 core/lint-rules.ts | ✅ Done | `f751a15` |
| T6 core/base-ref.ts | ✅ Done | `d40c6bc` |
| T7 core/llms.ts | ✅ Done | `cb0b6e6` |
| T8 src/cli.ts routing | ✅ Done | `45f4f7a` |
| T9 bin/cli.js smoke path | ✅ Done | folded into `45f4f7a`/build gate (no separate commit needed — verification-only task) |
| T10 src/commands/lint.ts | ✅ Done | `f6b6d48` |
| T11 src/commands/affected.ts | ✅ Done | `1b44ee6` (+ `c366924` fix) |
| T12 src/commands/ingest-prompt.ts | ✅ Done | `a3bfe51` |
| T13 src/commands/llms.ts | ✅ Done | `2b0a402` |
| T14 src/init/detect-stack.ts | ✅ Done | `957fa13` (+ `9aadf3e`, `7a8f14a` follow-ups) |
| T15 templates/ port+translate | ✅ Done | `d0ede93` |
| T16 src/init/placeholders.ts | ✅ Done | `1685cf9` |
| T17 src/init/ci-select.ts | ✅ Done | `cbb78e1` (+ `72b81ae` follow-up) |
| T18 src/init/prompts.ts | ✅ Done | `a8de530` (+ `0d07878` follow-up) |
| T19 src/init/scaffold.ts | ✅ Done | `48fc911` |
| T20 src/commands/init.ts | ✅ Done | `2043554` |
| T21 src/commands/update.ts | ✅ Done | `00ba418` (earlier attempt `939e651` superseded) |
| T22 src/commands/hub.ts | ✅ Done | `79574ef` (earlier attempt `54dbe6f` superseded) |
| T23 test/install.test.ts | ✅ Done | `c109dff` |
| T24 test/language-gate.test.ts | ✅ Done | `f0b9aae` |

All 24 tasks show committed, working code with corresponding tests. Two root-cause fixes landed as separate commits rather than amends (`2697bf3` frontmatter, `c366924` affected routing test) — consistent with CLAUDE.md's "create new commits, don't amend" convention. `6f91046` ("Remove placeholder bootstrap test") is legitimate cleanup, not a deleted real test — confirmed no net test-count loss (0 → 224, all additions).

---

## Spec-Anchored Acceptance Criteria

### P1: Core CLI parity (CORE-01..12)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| CORE-01: `lint` applies exactly the 11 reference rules | `RULES` has exactly `yaml-safe, okf-type, title, sources-present, sources-exist, staleness, stale-after, unverified, orphan, workspace-absorbed, links`, in order | `src/core/lint-rules.ts:47-238` (RULES array); `test/core/lint-rules.test.ts:56-70` — `expect(RULES.map(r=>r.name)).toEqual([...11 names...])` | ✅ PASS |
| CORE-02: `--strict` exit-code contract | plain `lint` exits non-zero only on error; `--strict` exits non-zero on error OR warn | `src/commands/lint.ts:35-37`; `test/commands/lint.test.ts:87-94` (error→exit1), `:96-105` (warn-only, plain→exit undefined), `:107-114` (warn-only, `--strict`→exit1), `:116-123` (error, `--strict`→exit1) | ✅ PASS |
| CORE-03: `affected` reports two distinct sections | "pages to update" and "not covered" as separate sections | `src/commands/affected.ts:12-43`; `test/commands/affected.test.ts:57-76` — asserts output contains both `"Pages to update:"` and `"Not covered"` | ✅ PASS |
| CORE-04: unresolvable base fails loudly, names source + exact `git fetch` fix | error names the var/flag and the precise remediation command | `src/commands/affected.ts:80-92`; `test/commands/affected.test.ts:92-102` — `toThrow(/git fetch --no-tags --depth=200 origin main:origin\/main/)` (exact command matched, not just "an error") | ✅ PASS |
| CORE-05: `ingest-prompt` emits English, ready-to-paste prompt | same `affected` result formatted as prompt, entirely English | `src/commands/ingest-prompt.ts:12-65`; `test/commands/ingest-prompt.test.ts:57-97` — affected/uncovered/no-affected cases, asserts English section headers (`"## Pages to update"`, `"## Files without coverage"`) | ✅ PASS |
| CORE-06: `llms` generates 4 artifacts matching reference format | `llms.txt`, `llms-full.txt`, `map.json`, OKF bundle under configured output dir | `src/core/llms.ts:147-193`; `test/commands/llms.test.ts:77-97` — all 4 exist, `map.json` exact-object assertion, `llms-full.txt` contains `Source:` line, `okf/index.md` exists | ✅ PASS |
| CORE-07: zero `npm install` in target repo | verification commands run on stdlib only | `package.json` (`dependencies` key absent); grep confirms every `src/**` import is either `node:*` or relative — no npm package imported; `test/install.test.ts` (real `npm pack` → `npm install` → `wiki-kit lint` exits 0) | ✅ PASS — structurally verified, not just claimed |
| CORE-08: base-ref precedence order | `--base` → `WIKI_BASE` → `GITHUB_BASE_REF` → `CHANGE_TARGET` → `ghprbTargetBranch` → `gitlabTargetBranch` → `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` → `BITBUCKET_PR_DESTINATION_BRANCH` → `origin/HEAD` → `origin/main` | `src/core/base-ref.ts:30-38,61-84`; `test/core/base-ref.test.ts:56-69` — iterates the exact order array, asserting the correct winner at each step | ✅ PASS — exhaustive |
| CORE-09: `yaml-safe` regression guard | unquoted scalar starting with `` ` `` → error, never passes silently | `src/core/lint-rules.ts:47-71`; `test/core/lint-rules.test.ts:74-79` — "rejects a value starting with a backtick — the case that broke the build" | ✅ PASS |
| CORE-10: `**` glob matches nested files | `internal/**` matches nested files at any depth | `src/core/pages.ts:179-207`; `test/core/pages.test.ts:30-33,45-48` — `"src/**/*.ts"` matches `"src/workflow/sinks/github.ts"`; `"internal/**"` matches nested Go file | ✅ PASS |
| CORE-11: `changedFiles` 3-way union | committed-vs-base ∪ uncommitted ∪ untracked | `src/core/base-ref.ts:113-120`; `test/core/base-ref.test.ts:156-170` — exact-list assertion across all three sources plus dedup case | ✅ PASS |
| CORE-12: `affected --strict` missed-pages gate | fails, listing every page whose declared sources changed but the page itself wasn't touched | `src/commands/affected.ts:45-53,94-104`; `test/commands/affected.test.ts:104-115` (fails, names page + `wiki-kit update`), `:117-128` (passes when page also updated) | ✅ PASS |

**P1 status**: ✅ 12/12 ACs matched spec outcome — the MVP tier is fully verified.

### P2: `init` (INIT-01..08)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| INIT-01: detect stack, write `wiki/`, agent file, CI file | stack detected from manifest; skeleton + `.claude/agents/wiki.md` + right CI written | `src/commands/init.ts`, `src/init/detect-stack.ts:25-30`; `test/commands/init.test.ts:60-90` "INIT-01 Independent Test" — Go repo, asserts index.md/agent file/section dirs exist, `.github` absent, output names "Go" | ✅ PASS |
| INIT-02: interactive vs. non-interactive prompt rule | TTY + missing answer → prompt; non-TTY or flags present → non-interactive | `src/init/prompts.ts:18-48`; `test/init/prompts.test.ts:29-47` (TTY prompts), `:65-78` (non-TTY uses default/undefined, `question` never called), `:80-103` (flag values always win, TTY or not) | ✅ PASS |
| INIT-03: CI file selection (github/jenkins/manual) | `.github/` → copy workflow; `Jenkinsfile` (no `.github/`) → **print** the Jenkins stages to add; neither → print two manual commands | `src/init/ci-select.ts:8-12` (branch selection correct); `src/commands/init.ts:100-111` (summary printing) | ⚠️ **PARTIAL — see Gap 1 below.** GitHub branch and manual branch match spec exactly (file copy / two printed commands respectively — `test/commands/init.test.ts:108-115`, and `MANUAL_GATE_COMMANDS` printed for the manual case). The **Jenkins branch does not "print the Jenkins stages"** — it writes a `Jenkinsfile.wiki` file to disk (same treatment as the GitHub template) and prints only a one-line pointer (`"wrote Jenkinsfile.wiki — wire its stages into your Jenkins pipeline."`). No test asserts stage content is printed to stdout; none exists. |
| INIT-04: idempotent second run | no changes on a clean second run | `src/init/scaffold.ts:135-145`; `test/commands/init.test.ts:92-106` and `test/init/scaffold.test.ts:80-88` — byte-identical snapshot before/after, `question` never called | ✅ PASS |
| INIT-05: batch overwrite confirmation, never per-file | list every conflict once, single y/N | `src/init/scaffold.ts:105-159`; `test/init/scaffold.test.ts:101-127` — one `question` call listing 2 conflicting files, overwrite/decline both exercised | ✅ PASS |
| INIT-06: all 7 placeholders replaced | `{{PROJECT}},{{ORG}},{{REPO}},{{LOCALE}},{{SEARCH_LANG}},{{TAGLINE}},{{TAGLINE_LONG}}` all resolved | `src/init/placeholders.ts:31-47`; `test/init/placeholders.test.ts:15-31` — one case per placeholder (parameterized `it.each`) + missing-answer throw case | ✅ PASS |
| INIT-07: config defaults from spec §6 | `rules`/`okf`/`output` blocks match documented defaults | `templates/wiki/wiki-kit.config.yaml:1-11` — byte-identical to design.md's documented example; `test/core/config.test.ts:57-63` loads the shipped template unmodified without throwing | ✅ PASS |
| INIT-08: hub question writes `hub:` block conditionally | "yes" → `hub.repo`/`hub.branch` written; "same repo only" → no `hub:` block | `src/init/scaffold.ts:47-51`; `test/commands/init.test.ts:117-135`, `test/init/scaffold.test.ts:140-155` — both branches asserted, including that `loadConfig` reads the written block back correctly | ✅ PASS |

**P2 (init) status**: ⚠️ 7/8 ACs matched spec outcome; 1 partial (INIT-03's Jenkins sub-clause — see Gap 1).

### P2: `wiki-kit update` (UPD-01..05)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| UPD-01: missing `update.agent` fails before dispatch | fails, names the missing config key | `src/commands/update.ts:66-72`; `test/commands/update.test.ts:106-111` — `toThrow(/update\.agent/)`, `spawnMock` never called | ✅ PASS |
| UPD-02: same affected-pages content as `ingest-prompt` | `update` passes the exact `ingest-prompt` output as the dispatched prompt | `src/commands/update.ts:13,89` reuses `buildIngestPrompt` directly (not a copy); `test/commands/update.test.ts:138-168` — computes `expectedPrompt` independently via the same function and asserts `calledArgs).toEqual([expectedPrompt])` | ✅ PASS |
| UPD-03: missing binary on `PATH` fails, no dangling process | fails, names the binary | `src/commands/update.ts:35-52`; `test/commands/update.test.ts:113-119` — `toThrow(/totally-nonexistent-binary-xyz/)` and `/PATH/`, `spawnMock` never called | ✅ PASS |
| UPD-04: fire-and-forget, returns immediately | command returns control without waiting | `src/commands/update.ts:100-104` (`detached:true`, `.unref()`); `test/commands/update.test.ts:158-165` — asserts `calledOpts.detached===true`, `unrefMock` called once | ✅ PASS |
| UPD-05: no affected pages → report, no dispatch | reports and does not spawn | `src/commands/update.ts:84-87`; `test/commands/update.test.ts:121-136` — `spawnMock` not called, log contains "No pages affected" | ✅ PASS |

**P2 (update) status**: ✅ 5/5 ACs matched spec outcome.

### P3: `hub push` (HUB-01..04)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| HUB-01: copy artifacts, commit, push to hub under `docs/<repo>/` | artifacts land in a new commit on hub's branch, using `WIKI_HUB_TOKEN` | `src/commands/hub.ts:134-186`; `test/commands/hub.test.ts:111-133` — real local-bare-repo push, clones the result back and asserts exact byte content of all 4 artifact paths + commit subject | ✅ PASS |
| HUB-02: `WIKI_HUB_TOKEN` unset fails before any git op | fails, names the variable, before network/git call | `src/commands/hub.ts:39-45` (checked before `config.hub` lookup, before any `execFileSync`); `test/commands/hub.test.ts:94-101` — `toThrow(/WIKI_HUB_TOKEN/)` with an unreachable hub URL configured (network never touched, confirmed by the test not hanging/timing out) | ✅ PASS |
| HUB-03: rejected push fails directly, no retry | fails the job, never retries/rebases | `src/commands/hub.ts:174-183`; `test/commands/hub.test.ts:135-155` — real `pre-receive` hook rejects the push, asserts `toThrow(/rejected/)` AND that the hook fired exactly once (`calls).toHaveLength(1)`) — genuinely proves no retry, not just that an error was thrown | ✅ PASS |
| HUB-04: pushed artifacts processable by hub's own `llms`/`lint`, no hub-specific code | standard engine only, pointed at `docs/**` | By construction: `hub.ts` writes plain files under `docs/<repo>/`; `core/lint-rules.ts` and `core/llms.ts` contain zero hub-specific branches (confirmed by reading both files in full — no `hub` references anywhere in `src/core/`) | ✅ PASS — architectural property, not independently unit-tested (matches design.md: the whole point is the hub repo needs no new code) |

**P3 (hub) status**: ✅ 4/4 ACs matched spec outcome.

---

## Edge Cases (spec.md)

| Edge case | Handling | Result |
| --- | --- | --- |
| `sources:` entry matching no tracked file | `sources-exist` rule fires | `src/core/lint-rules.ts:110-121`; `test/core/lint-rules.test.ts:192-197` | ✅ PASS |
| Root `package.json` `workspaces: ["*"]` + `wiki/package.json` exists | `workspace-absorbed` fires | `src/core/lint-rules.ts:188-223`; `test/core/lint-rules.test.ts:301-308` | ✅ PASS |
| `init` non-interactive, missing info, no default | exits non-zero naming exactly the missing flag | `src/init/placeholders.ts:39-46`; `test/commands/init.test.ts:137-141` — `toThrow(/--tagline/)` | ✅ PASS |
| `hub push` with no artifacts on disk | fails naming `wiki-kit llms` | `src/commands/hub.ts:30-35`; `test/commands/hub.test.ts:89-92` | ✅ PASS |
| Page with no `title:` and no `#` heading | `title` rule fires | `src/core/lint-rules.ts:86-95`; `test/core/lint-rules.test.ts:123-126` | ✅ PASS |

**Edge cases**: ✅ 5/5 handled correctly.

---

## Findings Verified From the Implementation-Process Claims

1. **`inlineMap`/`inlineList` nested `[`/`{` dispatch bug** — real, root-cause fixed in `2697bf3`. `src/core/frontmatter.ts:53-58` (`inlineValue`) is now shared by `inlineMap` (`:39-48`) and `inlineList` (`:61-65`), and by the top-level `parseFrontMatter` (`:111-112`). Regression test at `test/core/frontmatter.test.ts:63-75` (nested list in a map) and `:77-80` (nested map in a list). Discrimination-sensor mutation reverting the fix (mutant 7) was killed by this exact test.
2. **Dead ternary drop** — confirmed genuinely absent. `src/commands/affected.ts:45-53` (`missedPages`) contains no such construct; the reference's `result.touchedPages.has(...) ? "" : ""` has no equivalent anywhere in the ported code.
3. **`.gitignore` packaging bug** — confirmed real and fixed. Empirically reproduced npm's behavior (a probe package with a `files`-allowlisted `.gitignore` had it silently stripped from the tarball; a sibling `normal.txt` survived). `templates/wiki/gitignore` ships dotless; `src/init/scaffold.ts:74-78` renames it back to `.gitignore` on write. `test/install.test.ts` genuinely exercises a packed tarball (`npm pack --json` → `npm install` into a scratch temp dir → run the installed binary), not just the source tree — confirmed by inspecting the packed tarball's file list directly (`templates/wiki/gitignore` present, no `.gitignore` entry).
4. **`hub.ts`/`update.ts` security-review pass** — both commits (`79574ef`, `00ba418`) document the review in their messages, and the actual code matches: `hub.ts` delivers the credential exclusively via a `GIT_ASKPASS` helper script that reads its own env (`src/commands/hub.ts:100-104`), the clone/push URL is username-only (`:140`), and `GIT_TERMINAL_PROMPT=0` prevents any interactive fallback (`:112`). `update.ts` spawns with an argv array (`[prompt]`) and no `shell` option (`:100-103`), so prompt content is never shell-interpreted.

---

## Discrimination Sensor

Scratch method: direct edits to the real working tree via `git checkout -- <file>` revert after each run (no stash/worktree needed since each mutation touched exactly one file and was reverted before the next). Verified `git status --porcelain` was clean before starting and after each revert.

Tier: expanded, per the higher security surface of `hub.ts`/`update.ts` (credential handling, process spawning) — 3 mutations each, plus 3 spread across the core engine.

| # | File:line | Description | Killed? |
| - | --- | --- | --- |
| 1 | `src/commands/hub.ts:40` | Flipped `if (!token)` → `if (token)` (bypasses HUB-02's missing-token check) | ✅ Killed — 3 tests failed |
| 2 | `src/commands/hub.ts:174-183` | Added a silent retry-once on push rejection (violates HUB-03's no-retry contract) | ✅ Killed — "no retry" test caught the 2nd hook call |
| 3 | `src/commands/hub.ts:30` | Flipped the missing-artifact filter (`!existsSync` → `existsSync`) | ✅ Killed — 2 tests failed |
| 4 | `src/commands/update.ts:19` | Made `isExecutableFile`'s catch return `true` (bypasses UPD-03's PATH check) | ✅ Killed |
| 5 | `src/commands/update.ts:101` | `detached: true` → `detached: false` (breaks UPD-04's fire-and-forget guarantee) | ✅ Killed |
| 6 | `src/commands/update.ts:84` | Flipped `&&` → `\|\|` in the no-affected-pages guard (breaks UPD-05/dispatch logic) | ✅ Killed |
| 7 | `src/core/frontmatter.ts:45` | Reverted the root-cause fix (`inlineValue` → `scalar` in `inlineMap`) | ✅ Killed — the fix's own regression test caught it |
| 8 | `src/core/base-ref.ts:139` | Flipped `touchedPages` filter (`f.startsWith` → `!f.startsWith`) — breaks CORE-12's gate data | ✅ Killed |
| 9 | `src/core/lint-rules.ts:284-285` | Removed the `severity === "off"` skip (rule stays active when configured off) | ✅ Killed |

**Sensor depth**: expanded (9 mutations: 6 on the two higher-risk files, 3 on the core engine)
**Result**: 9/9 killed — ✅ PASS. No survivors; no fix tasks needed from the sensor.

Working tree confirmed clean (`git status --porcelain` empty, `git diff --stat` empty) after all 9 mutations were reverted. Full gate re-run afterward: 224/224 passed.

---

## Interactive UAT Results

N/A — no user-facing UI beyond CLI prompts (`init`'s TTY-only readline prompts), which already have automated integration-test coverage (`test/init/prompts.test.ts`, `test/commands/init.test.ts`). No interactive UAT performed, per the task brief's explicit instruction to skip this section with this justification.

---

## Code Quality

| Principle | Status | Notes |
| --- | --- | --- |
| Minimum code | ✅ | No speculative abstractions found; `src/init/*` stays five small single-purpose modules per design.md's own stated rule |
| Surgical changes | ✅ | Diff is 100% new files (greenfield repo) — nothing pre-existing was touched or "improved" |
| No scope creep | ✅ | Every file under `src/`/`templates/`/`test/` traces to a task in tasks.md |
| Matches patterns | ✅ | Consistent style across all command/core/init modules (parseArgs, findRepoRoot, error-naming-the-fix convention) |
| Zero runtime dependencies (CLAUDE.md invariant #1) | ✅ | `package.json` has no `dependencies` key; grep of every `src/**` import confirms only `node:*` builtins and relative internal imports — no npm package reachable from the verification path |
| No comments except non-obvious WHY (CLAUDE.md convention) | ✅ | Spot-checked across `frontmatter.ts`, `hub.ts`, `update.ts`, `scaffold.ts`, `base-ref.ts` — every comment explains a trap or a design reason (e.g. the `.gitignore`-stripping npm quirk, the GIT_ASKPASS credential-safety rationale, the two-separate-fd note citing Node's own docs); none restates the code |
| Port-don't-rewrite discipline | ✅ | `frontmatter.ts`, `pages.ts`, `lint-rules.ts`, `base-ref.ts`, `llms.ts` are structurally near-verbatim ports with cited line ranges from the reference in commit messages/comments; genuinely new code (`findRepoRoot`, `hub.ts`, `update.ts`, config/prompts/scaffold) is called out as new, not disguised as a port |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ | 28/29 criteria match precisely; INIT-03's Jenkins sub-clause does not (see Gap 1) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ | `core/*` has 1:1 AC coverage plus edge cases; every command has happy/edge/error paths (missing config, missing binary, unresolvable base, rejected push, etc.) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ | Every test file's `describe` blocks map directly to a CORE/INIT/UPD/HUB id or a named edge case; no orphan test suites found |
| Documented guidelines followed | ✅ | `CLAUDE.md`'s own conventions (zero-dep, port-don't-rewrite, error messages state the fix, ordered/named rule registry) — all directly verified above, not assumed |

---

## Gate Check

- **Gate command**: `npm run build && npm run lint && npm test`
- **Result**: 224 passed, 0 failed, 0 skipped (21 test files)
- **Test count before feature**: 0 (greenfield repo, confirmed by task brief and by `main` having no `test/` directory)
- **Test count after feature**: 224
- **Delta**: +224 new tests
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Gap 1: INIT-03's Jenkins branch doesn't literally "print the Jenkins stages to add"

- **Root cause**: `src/commands/init.ts`'s `printSummary` (lines 100-111) treats the Jenkins case the same way as the GitHub case — write a template file (`Jenkinsfile.wiki`) to disk and print a one-line pointer to it. spec.md's P2 AC-03 (and the approved architecture design doc, `docs/superpowers/specs/2026-08-14-package-architecture-design.md:143`) says the Jenkins branch should **print the stages to add**, distinct from the GitHub branch's **copy the template**. No `// SPEC_DEVIATION` marker or other note records this as an intentional deviation; it reads as an oversight, not a deliberate re-scoping.
  - Note for calibration: the implemented behavior is arguably *more* useful in practice (a syntactically valid file to diff/copy from beats hand-copying multi-line Groovy out of a terminal), and the template file's own header comments already instruct the user how to use it. This may be worth accepting as an intentional improvement — but that decision belongs to the spec owner, not silently to the implementer.
- **Fix task**: Either (a) update `printSummary`'s Jenkins branch to also print the stage contents to stdout (satisfying the literal AC), or (b) update `spec.md`'s P2 AC-03 wording to describe the file-based delivery and record the change with a rationale, matching what was actually built. Either resolves the gap; (b) is recommended given the UX case above, but requires the spec owner's sign-off per CLAUDE.md's "do not invent process/behavior" spirit.
- **Priority**: Minor — functionally the information still reaches the user (via a file instead of stdout), no security or correctness impact, and both `.github/` and `manual` branches (the two most common cases) match spec exactly.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| CORE-01 | In Tasks | ✅ Verified |
| CORE-02 | In Tasks | ✅ Verified |
| CORE-03 | In Tasks | ✅ Verified |
| CORE-04 | In Tasks | ✅ Verified |
| CORE-05 | In Tasks | ✅ Verified |
| CORE-06 | In Tasks | ✅ Verified |
| CORE-07 | In Tasks | ✅ Verified |
| CORE-08 | In Tasks | ✅ Verified |
| CORE-09 | In Tasks | ✅ Verified |
| CORE-10 | In Tasks | ✅ Verified |
| CORE-11 | In Tasks | ✅ Verified |
| CORE-12 | In Tasks | ✅ Verified |
| INIT-01 | In Tasks | ✅ Verified |
| INIT-02 | In Tasks | ✅ Verified |
| INIT-03 | In Tasks | ⚠️ Needs Fix (Gap 1 — Jenkins sub-clause only; GitHub/manual sub-clauses verified) |
| INIT-04 | In Tasks | ✅ Verified |
| INIT-05 | In Tasks | ✅ Verified |
| INIT-06 | In Tasks | ✅ Verified |
| INIT-07 | In Tasks | ✅ Verified |
| INIT-08 | In Tasks | ✅ Verified |
| UPD-01 | In Tasks | ✅ Verified |
| UPD-02 | In Tasks | ✅ Verified |
| UPD-03 | In Tasks | ✅ Verified |
| UPD-04 | In Tasks | ✅ Verified |
| UPD-05 | In Tasks | ✅ Verified |
| HUB-01 | In Tasks | ✅ Verified |
| HUB-02 | In Tasks | ✅ Verified |
| HUB-03 | In Tasks | ✅ Verified |
| HUB-04 | In Tasks | ✅ Verified |

---

## Lessons Distilled

Signal found: 1 (`ac_gap` on INIT-03's Jenkins sub-clause). Recorded via `scripts/lessons.py`:

```
ADDED L-001 (status=candidate, recurrence=1)
feature: wiki-kit | signal: ac_gap
source: spec.md P2 AC-03 (INIT-03) vs src/commands/init.ts:100-111
text: When a spec AC specifies the literal I/O channel (e.g. print to stdout vs.
      write a file), verify the implementation matches that channel exactly — a
      file-based delivery of equivalent content is still a deviation from a
      'print' requirement, not an equivalent implementation.
scope: init
```

No other signal (no surviving mutants, no other spec-precision gaps, no `SPEC_DEVIATION` markers found anywhere in `src/`) — everything else is a clean pass, so no further lessons were recorded.

---

## Summary

**Overall**: ⚠️ Issues — one Minor, non-blocking spec-precision gap (INIT-03's Jenkins branch); everything else (28/29 ACs, all 5 edge cases, the full build gate, 9/9 discrimination-sensor mutations, and every specifically-flagged implementation-process claim) verified clean against the actual committed code.

**Spec-anchored check**: 28/29 ACs matched spec outcome exactly; 1 partial (INIT-03)
**Sensor**: 9/9 mutations killed
**Gate**: 224 passed, 0 failed, 0 skipped

**What works**: The entire P1 verification engine (lint/affected/ingest-prompt/llms) reproduces the reference behavior with precise, non-shallow test assertions — exact exit codes, exact error message content, exact CI-var precedence order. `init` is genuinely idempotent and its batch-overwrite confirmation is real (single prompt, not per-file). `update` and `hub push` both passed their claimed security-review with code that actually backs the claim (GIT_ASKPASS-only credential delivery, argv-array spawn with no shell). The `.gitignore` packaging bug fix is real and is exercised by a genuine packed-tarball install test, not just the source tree. The `inlineMap`/`inlineList` root-cause fix has a real regression test. Zero runtime dependencies holds at both the manifest level and the actual import graph.

**Issues found**: INIT-03's Jenkins CI-selection branch writes a file instead of printing stage content to stdout, as spec.md literally specifies — see Gap 1 for the two-option fix.

**Next steps**: Route Gap 1 to the spec owner: pick fix option (a) implementation change or (b) spec-wording update, per the two-option fix plan above. This is a single, low-effort fix either way and does not require a full fix→re-verify cycle of the whole feature — a targeted re-check of INIT-03 alone would suffice once resolved.

---

## Resolution (post-report)

Spec owner chose **option (b)**: `spec.md`'s P2 AC-03 wording corrected to describe the built file-based Jenkins delivery (write `Jenkinsfile.wiki` + print a pointer), with the rationale recorded inline — the file-based approach matches the reference `SKILL.md`'s own guidance ("incorporate into an existing Jenkinsfile") better than dumping Groovy to a terminal would. No code change — `src/commands/init.ts` and its tests were already correct against the corrected wording. `spec.md`'s Requirement Traceability updated: INIT-03 → ✅ Verified. Feature considered complete: 29/29 ACs verified, 224/224 tests passing, 9/9 discrimination-sensor mutations killed.
