# CLAUDE.md — @glauberborges/wiki-kit

Operating contract for AI agents working in this repository. Read this before touching code.

> **Setup tip:** write this file as `AGENTS.md` and symlink `CLAUDE.md → AGENTS.md`. Codex,
> Cursor and others read `AGENTS.md`; one file, every tool.

## What this is

A CLI that keeps a repository's documentation **verifiably** in sync with its code, and exposes
that same documentation to AI agents.

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

**Everything is in English**: code, comments, command and flag names, CLI output, README,
CHANGELOG, npm description, lint rule names, and all template content (example pages,
`AUTHORING.md`, `BOOTSTRAP.md`, `OKF.md`, the subagent prompt).

The **only** exceptions are `FOUNDATION.md` and the bootstrap prompt.

The reference implementation is in Portuguese, so porting includes a translation pass. Never
mix: a file is fully English or it is one of the two exceptions.

## Invariants — never negotiate these

These are not preferences. Turn any of them into an option and the tool loses what makes it
trustworthy. If a task seems to require breaking one, **stop and ask** — you have almost
certainly misread the task.

**1. The verification path runs with zero dependencies.** `lint`, `affected` and `llms` use only
the Node standard library, so they run **without `npm install` in the target repository**. That
is what makes this tool acceptable in a Go or PHP repo: *verification costs nothing; only
publishing the site costs*. The front-matter parser is hand-written for this reason — not by
preference.

> The published package may have dependencies (arg parsing, terminal colors). What it may not
> have is a verification path that depends on anything installed in the target repo. When in
> doubt, keep the core dependency-free.

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
npm test                 # unit tests
npm run lint             # typecheck
npm run build            # build the package
npm pack --dry-run       # inspect what actually ships
```

Before considering any change done: `npm run lint && npm test`.

## Testing rules

**Every behavior change needs a unit test.** No exception for "it's small".

**Port the reference tests, don't rewrite them.** The suite in `glauberborges/hive`
`tests/wiki/` encodes the failure modes above. Rewriting from scratch loses the cases that
matter — the ones nobody would think to write twice.

Three tests are structural and must exist before the first publish:

- **`init` is idempotent** — running it twice neither duplicates nor overwrites.
- **Real install** — `npm pack` → install into a temp dir → run `wiki-kit lint`. The only way to
  catch a broken `bin`, `files` or `publishConfig` **before** publishing. With a scoped package
  that is exactly the risk.
- **Language gate** — grep the publishable package for Portuguese residue, with `FOUNDATION.md`
  and the bootstrap prompt allow-listed. Translation passes today and leaks back in a forgotten
  `console.log` three edits later.

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
- **Do not publish** without the real-install test passing.
- **Do not carry identifiers from the reference repo** into the template — org, personal name,
  email, internal paths. Everything is a placeholder. A template shipping someone else's
  `organizationName` makes every installed repo point "Edit this page" at the wrong place.
- **Do not embed process rules** in the kit — PR policy, approvals, team names, release flow.
  The kit describes *how to write a page*, never *how an organization works*. That belongs to
  each repository.
- **Do not invent documentation.** If the code doesn't make the behavior clear, say so. One
  fabricated page costs the credibility of every other page.

## Release checklist

1. `npm run lint && npm test` green
2. Real-install test passing
3. Language gate clean
4. `CHANGELOG.md` updated
5. `npm pack --dry-run` — confirm `files` ships the templates and nothing else
6. `npm publish` (`publishConfig.access: public` is already set — a scoped package is private by
   default and the publish fails without it)

## Open decisions

Tracked in `FOUNDATION.md` §11. Two of them shape the architecture and should not be left
implicit:

- **Hub direction** — each repo pushes on merge vs. the hub pulls on a schedule.
- **Hub consumption** — agents fetch the unified index on demand vs. each repo vendors it.

If a task touches the hub and these are still open, **ask before designing around either**.
