# wiki-kit Specification

## Problem Statement

Repository documentation rots because nothing verifies it still describes
the code, and AI agents have no cheap entry point into it. The reference
implementation in `glauberborges/hive` (PR #71) solves this with a
front-matter `sources:` field and a small set of Node-stdlib scripts, fully
verified in that repo. It exists today only as vendored scripts plus a
Claude Code skill that copies them by hand into new repos — not
installable, not distributable, and the vendored copy already risks
diverging from the skill's own template copy. `wiki-kit` packages that
verified engine as a public, `npx`-installable CLI so any repo (Node, Go,
PHP, polyglot monorepo) can adopt it with one command instead of a manual
`cp -r` + `sed` pass.

## Goals

- [ ] `lint`/`affected`/`ingest-prompt`/`llms` reproduce the reference
      implementation's behavior exactly, running with zero `npm install` in
      the target repo.
- [ ] `init` replaces the manual copy-and-placeholder-substitution flow with
      an idempotent, stack-detecting command.
- [ ] `hub push` gives repos in different GitHub organizations a working
      cross-repo aggregation path without a git submodule.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Programmatic JS API (`import { lint } from '@glauberborges/wiki-kit'`) | Not requested anywhere in `FOUNDATION.md`; every consumer described shells out. The CLI is the only public contract for v1. |
| Cross-repo dependency graph (`depends_on:` / `okf://repo/...` resolution) | Needs new resolution logic across aggregated docs; deferred as a fast-follow once `hub push` is proven (architecture design §7). |
| Automatic retry/rebase on `hub push` conflict | Explicitly decided against during this spec's discussion — a rejected push fails the job directly; a human re-runs it. |
| Active git-submodule detection inside `lint` | Checked the reference `wiki-lint.mjs` directly — no such check exists. `FOUNDATION.md` §5.5 is an architectural conclusion (use `hub push`, never a submodule), not a runtime guard. Adding detection would be a new feature, not a port. |
| License selection | Tracked as open in `FOUNDATION.md` §11, resolved independently of this spec. |
| Hub repo first-time bootstrapping runbook | Operational documentation, not part of the package's command surface. |
| `wiki/` as a git submodule (cross-repo sharing via a shared checkout) | Tested in the reference implementation and found to break staleness silently and defeat the same-PR CI gate (`FOUNDATION.md` §5.5 / §8a). Considered and rejected during this spec's discussion — see `context.md` "Rejected Approaches." `hub push` (copy artifacts to a separate repo) is the only cross-repo mechanism in scope. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| `init`'s default locale when non-interactive and `--locale` is omitted | `en` | Matches the project's own all-English default; a repo's doc *content* language stays the repo owner's choice regardless of this default (`FOUNDATION.md` §7). | n |
| `hub push` does not itself invoke `llms` | Reads whatever artifacts already exist on disk under the configured output dir; composing `wiki-kit llms && wiki-kit hub push` is the caller's responsibility | Keeps the two commands independently composable rather than one command with a hidden side effect, matching the existing CLI surface table in `FOUNDATION.md` §7 | n |
| Reference rule count | 11 rules (`yaml-safe`, `okf-type`, `title`, `sources-present`, `sources-exist`, `staleness`, `stale-after`, `unverified`, `orphan`, `workspace-absorbed`, `links`), not the "10 regras" figure in `FOUNDATION.md`'s reference table | Verified by grepping the actual `RULES` array in `wiki-lint.mjs`; `title` is a real, separately-registered rule the summary count missed | y (verified against source, not a preference — informational) |
| `wiki-kit update`'s fire-and-forget process output | Redirected to a log file (`wiki/.wiki-kit/update.log`), not the parent terminal; the process is detached so it survives the CLI exiting | Fire-and-forget with no logging would make a failed dispatch invisible; a log file keeps output recoverable without blocking the command | n |

**Open questions:** none — all resolved above or in `context.md`.

---

## User Stories

### P1: Core CLI parity ⭐ MVP

**User Story**: As a maintainer of a repo that already has a Hive-style
`wiki/`, I want to run the verification engine as an installed CLI instead
of vendored scripts, so the exact same checks keep working without a
copy-pasted `wiki/scripts/` tree that can drift from upstream.

**Why P1**: Everything else (`init`, `hub`) is only useful once the ported
engine is proven correct against the one real, verified `wiki/` that exists
today (Hive's). This is also the smallest possible vertical slice: no new
UX, a straight behavioral port with an existing oracle to diff against.

**Acceptance Criteria**:

1. WHEN `wiki-kit lint` runs against a `wiki/docs/**` tree THEN it SHALL
   apply exactly the 11 reference rules — `yaml-safe`, `okf-type`, `title`,
   `sources-present`, `sources-exist`, `staleness`, `stale-after`,
   `unverified`, `orphan`, `workspace-absorbed`, `links` — and report the
   same violations the reference `wiki-lint.mjs` reports for the same input.
2. WHEN `wiki-kit lint --strict` runs THEN it SHALL exit non-zero if either
   `error`- or `warn`-severity findings exist. WHEN `wiki-kit lint` runs
   without `--strict` THEN it SHALL exit non-zero only on `error`-severity
   findings.
3. WHEN `wiki-kit affected --base <ref>` runs against a diff THEN it SHALL
   report (a) pages whose `sources:` match changed files and (b) changed
   files matched by no page's `sources:`, as two distinct sections.
4. WHEN the base ref cannot be resolved (no remote, missing branch, shallow
   clone) THEN `wiki-kit affected`/`lint --strict`/`ingest-prompt` SHALL fail
   loudly, naming which variable or flag the base came from and the exact
   `git fetch` command to fix it — never fall back to an empty diff.
5. WHEN `wiki-kit ingest-prompt` runs THEN it SHALL emit the same `affected`
   result formatted as a ready-to-paste agent prompt, entirely in English.
6. WHEN `wiki-kit llms` runs THEN it SHALL generate `llms.txt`,
   `llms-full.txt`, `map.json`, and the OKF bundle under the configured
   output directory, in the same format the reference generator produces.
7. WHEN any of `lint`/`affected`/`ingest-prompt`/`llms` runs THEN it SHALL
   execute using only Node's standard library — no `npm install` in the
   target repo.
8. WHEN base-ref detection runs THEN it SHALL check, in order: explicit
   `--base` → `WIKI_BASE` → `GITHUB_BASE_REF` → `CHANGE_TARGET` →
   `ghprbTargetBranch` → `gitlabTargetBranch` →
   `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` → `BITBUCKET_PR_DESTINATION_BRANCH`
   → `origin/HEAD` → `origin/main`.
9. WHEN a page's front matter would pass the tolerant hand-written parser
   but fail Docusaurus's strict YAML parser (e.g. an unquoted scalar
   starting with `` ` ``) THEN `lint` SHALL report it as an error via
   `yaml-safe` — never pass silently (regression guard, failure mode #1).
10. WHEN a `sources:` glob ends in `**` (e.g. `internal/**`) THEN matching
    SHALL include nested files at any depth, not only immediate children
    (regression guard, failure mode #2).
11. WHEN `wiki-kit affected` (and `ingest-prompt`/`update`) computes what
    changed THEN it SHALL union three sources — committed changes vs. the
    base ref, uncommitted working-tree changes, and untracked new files —
    not only the committed diff, so the tool is usable mid-development,
    before anything is committed.
12. WHEN `wiki-kit affected --strict` finds a page whose declared `sources:`
    changed but the page itself is not among the changed files THEN it
    SHALL fail, listing each such page — this is the actual CI-gate check
    (distinct from plain `lint --strict`'s error/warn promotion in AC 2).

**Independent Test**: Install `wiki-kit` as a devDependency inside Hive
(against its existing `wiki/`), run `wiki-kit lint`, `wiki-kit affected
--base origin/main`, and `wiki-kit llms`, and diff the output against
today's `make -C wiki lint|affected|llms` — results match.

---

### P2: `init` — scaffold a new wiki

**User Story**: As a maintainer of a repo with no wiki yet, I want one
command to detect my stack and install the skeleton, so I stop hand-copying
`template/wiki/` and hand-editing seven placeholders.

**Why P2**: The genuinely new command (`FOUNDATION.md` §7) — not a port,
built once P1 proves the underlying engine is correct.

**Acceptance Criteria**:

1. WHEN `wiki-kit init` runs in a repo with no `wiki/` directory THEN it
   SHALL detect the stack from the repo's manifest (`package.json`,
   `go.mod`, `composer.json`, `requirements.txt`/`pyproject.toml`,
   `Cargo.toml`, ...) and write the `wiki/` skeleton, `.claude/agents/
   wiki.md`, and one CI file.
2. WHEN information can't be inferred from the manifest (project name, org,
   locale) AND the process is attached to a TTY AND the corresponding flag
   is missing THEN `init` SHALL prompt interactively. WHEN not attached to a
   TTY, OR the flags were passed, THEN it SHALL run non-interactively using
   the flag values or the documented defaults (see Assumptions).
3. WHEN `.github/` exists in the target repo THEN `init` SHALL copy the
   GitHub Actions workflow template. WHEN `Jenkinsfile` exists (and
   `.github/` doesn't) THEN it SHALL print the Jenkins stages to add. WHEN
   neither exists THEN it SHALL print the two manual shell commands.
4. WHEN `wiki-kit init` runs a second time with no conflicting files THEN it
   SHALL make no changes to already-correct files (idempotent).
5. WHEN `init` finds existing target files without `--force` THEN it SHALL
   list every conflicting file once and ask a single batch confirmation
   before overwriting any of them.
6. WHEN `init` writes the skeleton THEN it SHALL replace every placeholder
   — `{{PROJECT}}`, `{{ORG}}`, `{{REPO}}`, `{{LOCALE}}`, `{{SEARCH_LANG}}`,
   `{{TAGLINE}}`, `{{TAGLINE_LONG}}` — none left unresolved in the written
   output.
7. WHEN `init` completes THEN the written `wiki/wiki-kit.config.yaml` SHALL
   contain the default `rules`/`okf`/`output` blocks from `FOUNDATION.md`
   §7 (the `hub` block only if hub setup was opted into).
8. WHEN `init` asks whether this repo's wiki connects to a hub (same
   interactive/flag rule as AC 2) AND the answer is "yes" THEN it SHALL
   write the `hub.repo`/`hub.branch` block into `wiki/wiki-kit.config.yaml`
   so `wiki-kit hub push` works with no further manual config edit. WHEN the
   answer is "same repo only" THEN no `hub:` block is written.

**Independent Test**: Run `wiki-kit init` in a scratch Go repo containing
only a `go.mod`; confirm `wiki/` appears with English doc sections, the CI
file matches what's present in the repo, no placeholder tokens remain in any
written file, and running `init` again produces no further file changes.
Run it again answering "connect to a hub" with a scratch hub repo name;
confirm `wiki/wiki-kit.config.yaml` contains a matching `hub:` block.

---

### P2: `wiki-kit update` — dispatch an agent to refresh docs

**User Story**: As a developer who just finished a change, I want one
command that hands the affected-pages context to my coding agent and lets
it update the docs, so I don't have to manually copy `ingest-prompt`'s
output into a chat window.

**Why P2**: Formalizes the L1 automation layer (`FOUNDATION.md` §7 —
"the agent edits alone") that today only exists as a documented manual step
(`.claude/agents/wiki.md`, invoked by hand through an IDE's agent feature).
Depends on `ingest-prompt` (P1) for its prompt content.

**Acceptance Criteria**:

1. WHEN `wiki-kit update` runs THEN it SHALL read `update.agent` from
   `wiki/wiki-kit.config.yaml`. WHEN that key is missing THEN it SHALL fail
   before dispatching anything, naming the missing config key and how to
   set it.
2. WHEN `update.agent` is configured THEN `wiki-kit update` SHALL compute
   the same affected-pages result `ingest-prompt` computes and pass it,
   formatted the same way, as the prompt to the configured agent CLI.
3. WHEN the configured agent CLI is not found on `PATH` THEN `wiki-kit
   update` SHALL fail with a message naming the missing binary — never
   silently no-op.
4. WHEN `wiki-kit update` dispatches the agent THEN it SHALL do so
   fire-and-forget: the command returns control immediately without
   blocking on the agent's completion.
5. WHEN the underlying `affected` computation finds no affected pages THEN
   `update` SHALL report that and SHALL NOT dispatch the agent (mirrors
   the "don't invent work" rule already in `.claude/agents/wiki.md`).

**Independent Test**: With `update.agent: claude` configured and a change
staged that touches a documented source file, run `wiki-kit update`; confirm
it returns immediately (no blocking wait) and that a `claude` process was
launched with the same content `wiki-kit ingest-prompt` would have printed.
With no affected pages, confirm no process is launched.

---

### P3: `hub push` — cross-repo aggregation

**User Story**: As a maintainer of several repos across personal and
company GitHub organizations, I want each repo's CI to push its generated
docs to a shared hub repo on merge, so agents in any repo can answer
"where do we document X" without me building a custom aggregation service.

**Why P3**: Depends on P1's `llms` output existing and being correct;
useful but not required for a single repo to benefit from `wiki-kit`.

**Acceptance Criteria**:

1. WHEN `wiki-kit hub push` runs AND artifacts already exist on disk from a
   prior `wiki-kit llms` run THEN it SHALL copy `llms.txt`, `llms-full.txt`,
   `map.json`, and the OKF bundle into a checkout of the hub repo (read from
   `wiki/wiki-kit.config.yaml`'s `hub.repo` / `hub.branch`) under
   `docs/<repo-name>/`, commit, and push using the credential read from
   `WIKI_HUB_TOKEN`.
2. WHEN `WIKI_HUB_TOKEN` is not set THEN `hub push` SHALL fail before
   attempting any git operation, naming the missing variable.
3. WHEN the push is rejected (non-fast-forward — another repo pushed to the
   hub concurrently) THEN `hub push` SHALL fail the command/CI job directly.
   No retry.
4. WHEN `hub push` succeeds THEN the artifacts it wrote SHALL be processable
   by the hub repo's own (separately invoked) `wiki-kit llms`/`lint` with no
   hub-specific aggregation code — the standard engine, pointed at
   `docs/**`, is what builds the hub's unified index.

**Independent Test**: Point `hub push` at a scratch hub repo after running
`wiki-kit llms` locally; confirm the artifacts land under `docs/<repo>/` in
a new commit on the hub's default branch, and confirm a missing
`WIKI_HUB_TOKEN` fails before any network call is made.

---

## Edge Cases

- WHEN a `sources:` entry references a file that doesn't exist in the repo
  THEN `lint` SHALL raise `sources-exist`.
- WHEN the target repo's root `package.json` declares `workspaces: ["*"]`
  (or an equivalent glob) AND `wiki/package.json` exists THEN `lint` SHALL
  raise `workspace-absorbed`.
- WHEN `wiki-kit init` is invoked non-interactively without required
  information and no documented default applies THEN it SHALL exit non-zero
  naming exactly which flag is missing — never guess a value silently.
- WHEN `hub push` runs and no artifacts exist yet on disk THEN it SHALL fail
  with a message naming `wiki-kit llms` as the command to run first.
- WHEN a page has no `title:` in front matter and no `#` heading in the body
  THEN `lint` SHALL raise `title`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CORE-01 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-02 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-03 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-04 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-05 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-06 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-07 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-08 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-09 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-10 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-11 | P1: Core CLI parity | Tasks | In Tasks |
| CORE-12 | P1: Core CLI parity | Tasks | In Tasks |
| INIT-01 | P2: init | Tasks | In Tasks |
| INIT-02 | P2: init | Tasks | In Tasks |
| INIT-03 | P2: init | Tasks | In Tasks |
| INIT-04 | P2: init | Tasks | In Tasks |
| INIT-05 | P2: init | Tasks | In Tasks |
| INIT-06 | P2: init | Tasks | In Tasks |
| INIT-07 | P2: init | Tasks | In Tasks |
| INIT-08 | P2: init | Tasks | In Tasks |
| UPD-01 | P2: wiki-kit update | Tasks | In Tasks |
| UPD-02 | P2: wiki-kit update | Tasks | In Tasks |
| UPD-03 | P2: wiki-kit update | Tasks | In Tasks |
| UPD-04 | P2: wiki-kit update | Tasks | In Tasks |
| UPD-05 | P2: wiki-kit update | Tasks | In Tasks |
| HUB-01 | P3: hub push | Tasks | In Tasks |
| HUB-02 | P3: hub push | Tasks | In Tasks |
| HUB-03 | P3: hub push | Tasks | In Tasks |
| HUB-04 | P3: hub push | Tasks | In Tasks |

**ID format:** `[CATEGORY]-[NUMBER]` — `CORE` (verification engine: lint /
affected / ingest-prompt / llms), `INIT` (scaffolding), `UPD` (agent-
dispatched update), `HUB` (cross-repo push).

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 29 total, 29 mapped to tasks (`.specs/features/wiki-kit/tasks.md`,
T1-T24), 0 unmapped ✅

---

## Success Criteria

- [ ] `wiki-kit lint`/`affected`/`llms`, run inside Hive's existing `wiki/`,
      produce output equivalent to today's `make -C wiki lint|affected|llms`.
- [ ] The ported test suite (from `tests/wiki/*.test.ts`) passes unmodified
      in assertion intent — same failure modes covered, no test weakened.
- [ ] `npx @glauberborges/wiki-kit init` scaffolds a working wiki in a
      scratch repo with zero manual placeholder edits required afterward.
- [ ] `wiki-kit hub push` lands artifacts in a scratch hub repo, and that
      hub repo's own `wiki-kit llms`/`lint` process them with no new code.
- [ ] `wiki-kit update`, run with a real `update.agent` configured, launches
      that agent CLI with the same content `ingest-prompt` would print, and
      returns control without waiting for the agent to finish.
- [ ] The real-install test (`npm pack` → install into a temp dir →
      `wiki-kit lint`) passes before any publish.
- [ ] The language gate finds zero Portuguese residue in the publishable
      package outside `FOUNDATION.md` and the opening prompt.
