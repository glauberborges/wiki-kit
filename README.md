# @glauberborges/wiki-kit

Documentation that can't quietly go stale — because every page declares which
source files it documents, and a zero-dependency CLI checks that on every PR.

## The problem

Docs rot silently. Someone changes `src/auth/session.ts`, nobody touches the
page that documents it, and there's no signal anywhere that the two drifted
apart — not in code review, not in CI, not for an AI agent trying to
understand the codebase before making a change.

The usual fixes don't hold: a wiki nobody is forced to update decays in
weeks. A giant `AGENTS.md` that tries to describe the whole repo in one file
gets expensive to read and impossible to keep accurate. And "just ask an LLM
to write the docs" produces confident prose with no way to tell if it's still
true.

wiki-kit fixes the actual gap: each page's front matter declares which files
it documents, so staleness becomes a fact you can check with `git log`, not a
guess.

```yaml
---
title: "Auth: sessions and tokens"
type: Architecture
sources:
  - resource: src/auth/session.ts
  - resource: src/auth/*.ts
generated: { by: human:jane, at: 2026-08-01 }
---
```

From that one field, deterministically, with **no LLM in the loop**:

- **staleness** — did `session.ts` change after this page was last touched?
- **affected** — given a diff, which pages need updating, and which changed
  files have *no* page at all (usually: new functionality nobody documented)
- **a reverse index** (`map.json`) — "before I touch this file, what should I
  read first?"
- **a CI gate** that fails a PR whose code changed but whose docs didn't

## Install

```bash
npx @glauberborges/wiki-kit init      # one-off, no permanent install
```

or, if you use it often:

```bash
npm install -g @glauberborges/wiki-kit
wiki-kit init
```

Works the same in a Node, Go, PHP, Python, or polyglot monorepo — the
verification commands (`lint`, `affected`, `ingest-prompt`, `llms`) run on
Node's standard library only. **No `npm install` needed to run them**, even
in a repo that has nothing to do with JavaScript.

## Quick start

```bash
cd your-repo
npx @glauberborges/wiki-kit init
```

`init` detects your stack from the manifest it finds (`go.mod`,
`composer.json`, `package.json`, `pyproject.toml`, ...), scaffolds a
Docusaurus wiki under `wiki/`, writes `.claude/agents/wiki.md`, and picks a
CI file based on what you already have (`.github/workflows/wiki.yml` if
`.github/` exists, a Jenkins stage file if there's a `Jenkinsfile`, or two
manual commands to wire in yourself otherwise). It asks interactively for
whatever it can't infer — project name, org, locale — or takes flags for
non-interactive/CI use:

```bash
wiki-kit init --project acme-api --org acme --locale en \
  --tagline "Payments API" --tagline-long "Handles checkout and refunds."
```

Running `init` again is safe — it never overwrites without asking, and a
clean rerun makes no changes at all.

## Everyday commands

### `lint` — is the wiki healthy right now?

```bash
wiki-kit lint            # errors fail the command; warnings don't
wiki-kit lint --strict   # warnings fail too — what CI uses
```

```
✗ wiki/docs/architecture/webhooks.md: `src/webhooks/old.ts` matches no tracked file (renamed or removed?)
! wiki/docs/architecture/auth.md: sources changed after the page: src/auth/session.ts

2 pages · 1 error(s) · 1 warning(s)
```

### `affected` — what does this diff touch?

```bash
wiki-kit affected --base origin/main
```

```
diff origin/main...HEAD — 3 file(s)

Pages to update:
  architecture/auth.md  ← src/auth/session.ts, src/auth/token.ts

Not covered (no page declares these sources):
  src/billing/refunds.ts

→ new functionality needs a new page, or `sources:` added to an existing page.
```

`wiki-kit affected --strict` is the actual CI gate: it fails the PR when a
page's declared sources changed but the page itself didn't — code moved on
without its docs.

### `ingest-prompt` — hand it to any agent CLI

```bash
wiki-kit ingest-prompt --base origin/main | claude -p
```

Prints the same `affected` result as a ready-to-paste instruction: which
pages to update, what changed in them, and how to write the update (describe
behavior, not the diff; update `sources:` if new files joined the topic; mark
`generated:`, never `verified:` — that's for whoever reviews the PR).

### `llms` — generate the layer other agents actually read

```bash
wiki-kit llms
```

Writes `llms.txt` (a curated index — small enough to fit in a prompt),
`llms-full.txt` (everything concatenated, for pasting into a chat or
indexing), `map.json` (the reverse file → page index), and an OKF-conformant
bundle — all from the same markdown the human-facing site builds from.

### `update` — let an agent do the writing

```bash
wiki-kit update
```

Reads `update.agent` from `wiki/wiki-kit.config.yaml`, builds the same
prompt `ingest-prompt` would print, and dispatches it to that agent CLI —
fire-and-forget, so `wiki-kit update` returns immediately instead of
blocking on the agent's session. Output goes to
`wiki/.wiki-kit/update.log`.

```yaml
# wiki/wiki-kit.config.yaml
update:
  agent: claude
```

### `hub push` — one index across several repos

```bash
export WIKI_HUB_TOKEN=ghp_...
wiki-kit hub push
```

If you maintain a handful of related repos (a payments API, the worker that
consumes its webhooks, the frontend that calls it), each one's `wiki-kit
llms` output can be pushed into a shared hub repo, under `docs/<repo>/`. The
hub is just another wiki-kit repo — its own `wiki-kit llms` builds the
unified index with zero extra code. Opt in during `init`:

```bash
wiki-kit init --hub-repo your-org/knowledge-hub --hub-branch main
```

Cross-repo sharing here is **aggregation, never a git submodule** — a
submodule was tried and found to silently break staleness and defeat the
same-PR CI gate (see `FOUNDATION.md` §5.5 if you're curious why).

## Configuration

`wiki/wiki-kit.config.yaml`, written by `init` with sane defaults:

```yaml
rules:
  sources-present: { severity: error, apply-to: [architecture, reference] }
  staleness:       { severity: warn }
  unverified:      { severity: warn }
  workspace-absorbed: { severity: warn }
okf:
  types: [Architecture, Guide, Reference, Runbook, Concept]
output:
  dir: static
  artifacts: [llms, llms-full, map, okf]
  llms-max-kb: 8
```

A rule can be turned `off` per repo. The legitimate way to exempt a specific
page is adjusting its `sources:` — not turning off the gate.

## Why zero dependencies

Every verification command (`lint`, `affected`, `ingest-prompt`, `llms`)
runs on Node's standard library alone — no packages, no `node_modules`, no
install step. That's what makes it reasonable to drop into a Go or PHP repo:
checking the docs costs nothing; only building the human-facing site does.

## Status

v1, ported and packaged from a reference implementation that's been running
in production. See `FOUNDATION.md` for the full design record — the
standards it's built on, the invariants, and five failure modes already
found and fixed (submodules, tolerant-vs-strict YAML parsing, glob edge
cases, silent CI gates, monorepo workspace absorption).

License: TBD.
