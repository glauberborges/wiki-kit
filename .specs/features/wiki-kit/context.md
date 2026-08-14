# wiki-kit Context

**Gathered:** 2026-08-14
**Spec:** `.specs/features/wiki-kit/spec.md`
**Status:** Ready for design

---

## Feature Boundary

`@glauberborges/wiki-kit` v1: a published npm CLI (`npx @glauberborges/wiki-kit`)
that ports the verified Hive reference implementation (`glauberborges/hive`
PR #71 — `wiki/scripts/`, its tests, and the `.claude/skills/wiki-kit/`
template) into a standalone, zero-runtime-dependency package. Four command
groups: verification (`lint`, `affected`, `ingest-prompt`, `llms`),
scaffolding (`init`), agent-dispatched maintenance (`update`), and cross-repo
aggregation (`hub push`). Full context in `FOUNDATION.md` (decision record)
and `docs/superpowers/specs/2026-08-14-package-architecture-design.md`
(architecture).

---

## Implementation Decisions

### Hub push failure handling

- On a rejected `git push` (non-fast-forward — another repo pushed to the
  hub concurrently), `hub push` fails the CI job directly. No automatic
  retry or rebase loop. A human re-runs the job.

### Hub credential

- `hub push` reads the write-scoped credential from a fixed environment
  variable: `WIKI_HUB_TOKEN`. No indirection through the config file.

### Init overwrite confirmation

- When `init` finds existing target files and `--force` was not passed, it
  lists every conflicting file once and asks a single batch confirmation
  ("overwrite all? y/N") — not a prompt per file, and never a silent skip.

### Lint `--strict` exit code contract

- `lint --strict` makes both `error` and `warn` severities exit-code-failing.
  Plain `lint` (no flag) only fails on `error`. This is the exact contract
  the CI gate in `templates/github/wiki.yml` depends on.

### Hub connection is chosen during `init`, not only afterward

- `init` asks (same interactive/flag rule as its other questions) whether
  this repo's wiki stays local-only or also connects to a hub repo. If the
  answer is "connect to a hub," `init` writes the `hub.repo`/`hub.branch`
  block into `wiki/wiki-kit.config.yaml` right there, so `wiki-kit hub push`
  works without a later manual config edit. The `hub push` mechanism itself
  is unchanged (see Hub push failure handling / Hub credential above) —
  this only moves *when* the connection gets configured.

### `wiki-kit update` — agent CLI selection

- The agent CLI `update` dispatches to is read from an explicit config key,
  `update.agent` in `wiki/wiki-kit.config.yaml` (e.g. `claude`, `codex`).
  No auto-detection from `PATH` — explicit is more predictable in CI
  environments where more than one agent CLI might be installed.

### `wiki-kit update` — execution mode

- `update` dispatches the configured agent CLI **fire-and-forget**: it
  returns control immediately after launching, it does not block waiting
  for the agent to finish. The prompt content is the same affected-pages
  result `ingest-prompt` already computes and formats.

### Agent's Discretion

None — every gray area raised (across both discussion rounds) came back
with an explicit user choice, none deferred to agent judgment.

### Declined / Undiscussed Gray Areas → Assumptions

None declined. Every gray area raised during the dimensions sweep, in both
discussion rounds, was discussed and resolved above.

### Rejected Approaches

- **`wiki/` as a git submodule**, considered as the cross-repo sharing
  mechanism (so multiple repos' wikis would physically be the same checked-
  out repo). Rejected: the reference implementation tested this exact setup
  and found two concrete breakages recorded in `FOUNDATION.md` §5.5 —
  staleness silently stops running (`git log` in the host repo can't see
  into a submodule's own history) and the CI gate false-flags clean PRs
  (the host's diff shows only the gitlink moving, never the actual page
  content). The second failure is structural, not fixable by rescoping git
  calls — it permanently loses the "docs update in the same PR as code"
  guarantee `FOUNDATION.md` §8(a) calls out as load-bearing. Confirmed
  rejected by the repo owner; recorded here so it isn't proposed again
  without first re-reading this note.

---

## Specific References

No specific references — standard approaches apply throughout.

---

## Deferred Ideas

None new. The cross-repo dependency graph, license choice, and hub
bootstrapping runbook were already deferred in
`docs/superpowers/specs/2026-08-14-package-architecture-design.md` §9 and
are not reopened here.
