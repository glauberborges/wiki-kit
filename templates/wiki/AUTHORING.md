# How to write a page

The wiki's writing conventions: what a page needs to have, how to write it, and how to
verify it hasn't gone stale. Applies to humans and agents alike.

> This file is installed as `wiki/AUTHORING.md` in the target repository. It describes
> **how to write a page** — never how the organization works. PR policy, approvals, team
> names, and release flow belong to each repository and have no place in a distributed
> artifact.

`docs/` is the **single source of truth**. From it come two things: the site (Docusaurus,
for humans) and the LLM-consumption layer (`llms.txt`, `llms-full.txt`, `map.json`, OKF
bundle). Never write to the generated artifacts — only to the pages.

## Commands

```bash
make -C wiki lint            # front matter, sources, staleness, links
make -C wiki affected        # what the current diff broke in the docs
make -C wiki ingest-prompt   # a ready-to-paste prompt for an agent to update the docs
make -C wiki llms            # regenerate the LLM artifacts
make -C wiki serve           # run the site locally
```

`lint`, `affected`, `ingest-prompt` and `llms` run on **plain `node`, no `npm install`** —
that's what makes verification free in a repo that isn't JavaScript. Only `serve` and
`build` need the Docusaurus toolchain.

## Front matter

Docusaurus fields plus the ones from [OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md):

```yaml
---
sidebar_position: 4
title: "Workflow: tasks, status, and sync"
description: Tasks, status, dependencies, locks, and the review queue.
type: Architecture
status: stable
sources:
  - resource: src/workflow/*.ts
  - resource: src/commands/workflow-dispatch.ts
generated: { by: human:<id>, at: 2026-07-29 }
---
```

| Field | Required | What for |
| --- | --- | --- |
| `title` | yes | the page's title (or a `#` heading in the body) |
| `description` | recommended | becomes the page's line in `llms.txt` — if missing, it's inferred from the body, and comes out worse |
| `type` | **yes** | the only field OKF requires. Base set: `Architecture`, `Guide`, `Reference`, `Runbook`, `Concept`. Safe to extend: the spec requires consumers to tolerate unknown types |
| `sources` | in `architecture/` and `reference/` | **the code files this page documents** |
| `status` | optional | `draft` · `stable` · `deprecated` |
| `stale_after` | optional | `YYYY-MM-DD` — a date by which the content must be reviewed regardless |
| `generated` | recommended | who wrote it: `human:<id>`, or `<producer>/<version>` for an agent |
| `verified` | see below | list of `{by, at}` — who checked it against the code |

### `sources` is what makes the wiki verifiable

Without it a page is loose prose and nobody knows when it went stale. With it, `lint`
compares the page's last commit against its sources' and warns; `affected` says, given a
diff, exactly which pages to update.

Write **globs at subsystem granularity**, not file by file:

| Language | Good | Bad |
| --- | --- | --- |
| Go | `internal/workflow` | 40 lines listing every `.go` file |
| PHP | `app/Http/Controllers/*.php` | every controller |
| JS/TS | `src/workflow/*.ts` | every module |

A path with no `*` that points at a directory matches everything below it. Globs are
expanded against `git ls-files`, so `vendor/`, `node_modules/`, and `target/` are already
excluded for free.

### The limit of git-based staleness

The signal is "the source's last commit is newer than the page's last commit." That means
**any** commit to the page clears the warning — including one that only touched the front
matter or fixed a comma. That's the price of a cheap, stateless signal: git has no way of
knowing whether you reread the page against the code or just tweaked the formatting.

That's why `stale_after` and `verified` exist: they're explicit declarations of review that
an accidental commit doesn't erase. For a subject that changes a lot, prefer `stale_after`
over relying on git alone.

### `generated` and `verified`: who wrote it, who checked it

An agent that writes a page stamps `generated: { by: <model>, at: <date> }` and does **not**
fill in `verified`. The lint then warns *"agent-generated and still unverified — nobody has
checked it"*. Whoever reviews and approves is who stamps `verified`.

Don't stamp `verified` on a page you haven't read against the code. The field is only true
while it stays true; a false `verified` is worse than none, because it clears the warning
without resolving anything.

## How to write a page

**Describe behavior, not changes.** Readers want to understand the system as it is today,
not what changed last week. "The daemon holds the PTYs beyond the CLI process's lifetime" —
not "the daemon now holds the PTYs."

**Open architecture pages with "Where it lives in the code."** A concept → file table,
before any prose. It's what lets someone jump straight to the code, and it's where
`sources` comes from. At the granularity of the language: package in Go, namespace in PHP,
module in JS.

**Say why, not just what.** The design decision and the problem it solves are worth more
than the description of the structure — the reader can see the structure in the code, not
the reason.

**Record the trap.** If something already broke in a non-obvious way, that's worth a
paragraph. It's the knowledge that isn't in the code.

**One page per subsystem.** If a page passes ~500 lines or covers two subjects that change
for different reasons, split it.

**Relative links with `.md`** (`./terminal.md`, `../reference/cli.md`) — the lint checks
them and the build fails on a broken link.

**Mermaid** for a state, sequence, or flow diagram, when the text can't carry it alone.

## Structure

| Directory | What goes there | Needs `sources` |
| --- | --- | --- |
| `getting-started/` | install and take the first step | no |
| `guides/` | how to do a task, from the user's point of view | no |
| `architecture/` | how the system works internally | **yes** |
| `reference/` | exhaustive lists: CLI, config, API | **yes** |
| `contributing/` | build, tests, troubleshooting | no |

`index.md` is reserved (it's the home page and the index). OKF's `log.md` is **generated
from `git log`** — never written by hand.

## The maintenance cycle

1. **Ingest** — code changed, run `make -C wiki affected`. It says what to update and what
   still has no page at all (new functionality).
2. **Query** — before touching a file, `map.json` says which page documents it.
3. **Lint** — `make -C wiki lint` finds a missing source, a stale page, and broken links.

The CI gate fails the PR when the code changed and the page that declares it didn't. If the
change genuinely doesn't affect the docs, remove that file from the page's `sources` — the
correct fix is adjusting the declaration, never bypassing the gate.
