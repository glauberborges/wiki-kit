# Package architecture design — @glauberborges/wiki-kit

> Companion to `FOUNDATION.md` (the decision record, in Portuguese) and
> `PROMPTSESSAONOVA.md` (the opening prompt). This document is the concrete
> package architecture and CLI surface proposed for v1, worked out and
> approved in the session that opened this repository. It follows the
> project's language rule (English) — `FOUNDATION.md` and the opening prompt
> remain the only Portuguese exceptions.

## 1. Reference implementation

Source of truth: `glauberborges/hive`, PR #71, branch
`claude/wiki-docusaurus-model-sp1f5w` (open at design time — not yet merged
to `main`). Inspected directly to ground this design:

| File | Lines | Role |
| --- | --- | --- |
| `wiki/scripts/lib/frontmatter.mjs` | 154 | Hand-written front-matter parser (stdlib only) |
| `wiki/scripts/lib/pages.mjs` | 179 | Page loading, glob matching, sidebar order, `map` |
| `wiki/scripts/wiki-lint.mjs` | 530 | 10 lint rules + `--affected` + `--prompt` + base-ref detection |
| `wiki/scripts/wiki-llms.mjs` | 174 | `llms.txt`, `llms-full.txt`, `map.json`, OKF bundle |
| `tests/wiki/*.test.ts` | 347 (4 files) | Vitest, encode the 5 failure modes from `FOUNDATION.md` §5 |
| `.claude/skills/wiki-kit/` | — | Current install path: `SKILL.md` walks an agent through `cp -r template/wiki/` + manual placeholder substitution. This is what `init` replaces. |
| `.claude/agents/wiki.md` | 88 | L1 subagent prompt (ingest flow) |
| `.github/workflows/wiki.yml` | — | Two jobs: `lint` (no npm install) and `build` (npm install + Docusaurus) |

`wiki/scripts/` and `.claude/skills/wiki-kit/template/wiki/scripts/` are
byte-identical today — the exact duplication `FOUNDATION.md` §10 warns will
diverge if the skill keeps vendoring the scripts instead of calling the
published CLI.

## 2. Already decided, not re-litigated here

Per `FOUNDATION.md` §7 and the opening prompt: package name
`@glauberborges/wiki-kit`, `npx` distribution, `publishConfig.access: public`,
bin `wiki-kit`, Node >=20, ESM. Per this project's `CLAUDE.md`:
`npm run lint` is a typecheck step and `npm run build` produces the published
artifact — the package is authored in **TypeScript** and compiled to `dist/`;
`src/` is never published.

Hub decisions made in this session (`FOUNDATION.md` §8 left both open):
- **Direction: push.** Each repo pushes its artifacts on merge, using its own
  credentials — the only clean path across organizations (personal + company).
- **Consumption: fetch on demand.** Agents read the hub's published
  `llms.txt` over HTTP at query time; no per-repo vendoring.
- **Push mechanism: direct git push.** The source repo's CI commits into
  `knowledge-hub/docs/<repo>/` using a deploy key or PAT scoped to write only
  that path in the hub. Simpler than a `repository_dispatch` receiver
  workflow; the trade-off (a cross-org write-scoped secret living in every
  source repo) was accepted explicitly.

## 3. Directory structure

```
wiki-kit/
├── bin/
│   └── cli.js                # thin shim: #!/usr/bin/env node → imports dist/cli.js
├── src/
│   ├── cli.ts                 # node:util.parseArgs + command routing + help text
│   ├── commands/
│   │   ├── init.ts
│   │   ├── lint.ts
│   │   ├── affected.ts
│   │   ├── ingest-prompt.ts
│   │   ├── llms.ts
│   │   └── hub.ts
│   ├── core/                  # zero runtime dependencies — ported ~1:1 from reference
│   │   ├── frontmatter.ts     # ← lib/frontmatter.mjs
│   │   ├── pages.ts           # ← lib/pages.mjs
│   │   ├── config.ts          # loads wiki/wiki-kit.config.yaml (reuses the frontmatter parser)
│   │   ├── lint-rules.ts      # ← wiki-lint.mjs, the 10 rules as a registry
│   │   ├── base-ref.ts        # ← base-ref detection, extracted from wiki-lint.mjs
│   │   └── llms.ts            # ← wiki-llms.mjs
│   └── init/                  # init-only; the one place allowed interactive I/O
│       ├── detect-stack.ts
│       ├── scaffold.ts
│       ├── placeholders.ts
│       └── ci-select.ts
├── templates/                 # shipped verbatim via package.json "files"
│   ├── wiki/                  # → <target>/wiki/
│   │   ├── Makefile, WIKI.md → AUTHORING.md (translated), wiki-kit.config.yaml (defaults)
│   │   ├── docs/{getting-started,guides,architecture,reference,contributing}/
│   │   └── docusaurus.config.js, sidebars.js, package.json
│   ├── github/wiki.yml
│   ├── jenkins/Jenkinsfile.wiki
│   └── claude/agents/wiki.md
├── test/                       # ported from tests/wiki/*.test.ts (Vitest), plus new CLI-level tests
├── dist/                       # build output; published, not committed
├── tsconfig.json
├── package.json                # files: ["dist", "bin", "templates"]
├── README.md / CHANGELOG.md / LICENSE
```

### Module boundary: the CLI is the only public contract

No `exports` map for programmatic use (`import { lint } from
'@glauberborges/wiki-kit'`) in v1. Nothing in `FOUNDATION.md` asks for one —
every consumer described (human, CI, agent) shells out. Add it if a real
caller needs it; YAGNI until then.

`core/` mirrors the reference file-for-file on purpose, rather than being
reorganized by feature. This keeps the port auditable against the existing
47 test cases without renaming anything mid-translation — reduces the risk
of silently changing behavior while "just" adding types.

## 4. Dependency policy

**Zero runtime dependencies**, including in `bin/cli.js` / `dist/cli.js`.
Flag and subcommand parsing uses `node:util.parseArgs` (stable since Node
18, the project already requires >=20); no `commander`/`yargs`; no terminal
color library.

Rationale: every invariant in `FOUNDATION.md` §4 exists to minimize what a
target repo's CI has to trust. Extending that discipline to wiki-kit's own
dependency tree keeps `npx @glauberborges/wiki-kit` a single-package fetch,
not a subtree — relevant both for cold-start speed in CI matrices across many
repos and for supply-chain surface in a tool CI blindly trusts.

TypeScript (`typescript`, `vitest`, `@types/node`) are devDependencies only —
compiled away at build time, never present in `dist/`. This does not
conflict with the zero-runtime-dependency policy.

Trade-off accepted: manual `--help` text, no color output. Reversible —
swapping in a small dependency later costs one file if `parseArgs`'s ergonomics
prove insufficient once built.

## 5. `init` — discovery and writing

1. **Detect stack** from the manifest at the target repo root: `package.json`
   → Node, `go.mod` → Go, `composer.json` → PHP, `requirements.txt` /
   `pyproject.toml` → Python, etc. Table lives in the translated
   `BOOTSTRAP.md`.
2. **Ask only what can't be inferred**: project name (default: manifest name
   or directory name), org (for "Edit this page" links), locale. Interactive
   prompts (readline) only when attached to a TTY *and* the corresponding
   flag is missing — otherwise (CI, agent invocation, or explicit flags)
   `init` runs non-interactively. Same command works run by hand or
   dispatched by an agent; no separate "agent mode" flag.
3. **Write idempotently**: an existing target file is skipped unless
   `--force` or an explicit per-file confirmation. Running `init` twice never
   duplicates or overwrites silently.
4. **Choose CI**: `.github/` present → copy `templates/github/wiki.yml`;
   `Jenkinsfile` present → print the Jenkins stages to add; neither → print
   the two manual shell commands (the same fallback `SKILL.md` already uses
   today for GitLab/Bitbucket/Drone).
5. Placeholders substituted: `{{PROJECT}}`, `{{ORG}}`, `{{REPO}}`,
   `{{LOCALE}}`, `{{SEARCH_LANG}}`, `{{TAGLINE}}`, `{{TAGLINE_LONG}}`.

Templates are real files under `templates/`, declared in `package.json`'s
`files` field, located at runtime via `fileURLToPath(import.meta.url)`. No
inlining, no build step for template content — `npm pack --dry-run` doubles
as an audit of exactly what ships.

## 6. Config file

**Location: `wiki/wiki-kit.config.yaml`** — inside `wiki/`, not at the target
repo root.

This corrects an inconsistency found in `FOUNDATION.md` §7, which suggested
the repo root while the same paragraph argues for preserving "everything in
one place." Putting the config at root would silently add a third exception
to the §4 invariant ("nothing outside `wiki/`" — currently only the CI file
and `.claude/agents/wiki.md` are exceptions). Placing it inside `wiki/`
needs no exception and keeps the invariant text in `FOUNDATION.md` accurate
as written. Confirmed with the repo owner during design.

Shape (per `FOUNDATION.md` §7, plus a `hub` block added here):

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
hub:
  repo: owner/knowledge-hub
  branch: main
```

Controls lint rule severity/scope, OKF vocabulary, and output artifacts —
never directory structure or names (`FOUNDATION.md` §7, unchanged). A rule
can be turned `off` per repo; the legitimate escape for a single page stays
adjusting its `sources:`, never the gate.

Parsed by `core/config.ts`, reusing the front-matter YAML-subset parser
already in `core/frontmatter.ts` — the config file needs the same flat
scalar/list/map-of-scalars subset front-matter already handles, so no new
parser and no YAML dependency. Loaded once per CLI invocation, passed into
`lint`, `affected`, `llms`, and `hub`.

`init` writes the initial config with `FOUNDATION.md`'s defaults; the `hub`
block is included only if the person opts into hub setup during `init`.

## 7. Hub architecture

**The hub is just another wiki-kit repo.** `wiki-kit hub push` is the only
genuinely new command for v1:

1. Reads the artifacts the source repo already generated via `wiki-kit llms`
   (`wiki/static/{llms.txt,llms-full.txt,map.json,okf/}`).
2. Copies them into a checkout of the hub repo, under `docs/<repo-name>/`.
3. Commits and pushes directly (git push, per §2's decision), using
   credentials read from the environment — wiki-kit does not manage the
   secret, only assumes it is present (e.g. `WIKI_HUB_TOKEN`, or an
   already-configured deploy key).

The hub repo then runs the **existing** `wiki-kit llms` / `wiki-kit lint` on
its own aggregated `wiki/docs/*` — no bespoke aggregation engine. The
standard single-repo pipeline already turns `docs/**` into a unified
`llms.txt`; the hub is that pipeline pointed at docs contributed by other
repos instead of authored locally. Agents consume the result by fetching the
hub's published `llms.txt` over HTTP (GitHub Pages or
`raw.githubusercontent.com`) — no new consumption command needed, matching
the "fetch on demand" decision in §2.

**Explicitly deferred, not silently dropped:** the `depends_on:` /
`okf://repo/...` cross-repo dependency graph (`FOUNDATION.md` §8) needs new
resolution logic across the aggregated docs. Real feature, not required for
`hub push` to work end-to-end — scoped out of v1's command surface as a
fast-follow once `hub push` is proven in practice.

## 8. Testing strategy

Vitest, matching the reference (`FOUNDATION.md` §9 — "port the tests, don't
rewrite them"; swapping test frameworks mid-port would be exactly the kind
of rewrite the project's own rules forbid).

- `test/frontmatter.test.ts`, `pages.test.ts`, `yaml-safe.test.ts`,
  `kit-hygiene.test.ts` — ported from `tests/wiki/*.test.ts`, same
  assertions, same failure-mode coverage.
- New, structural (per `FOUNDATION.md` §9):
  - `init.test.ts` — running `init` twice neither duplicates nor overwrites.
  - `install.test.ts` — `npm pack` → install into a temp dir → run
    `wiki-kit lint`; the only way to catch a broken `bin`/`files`/
    `publishConfig` before publishing.
  - `language-gate.test.ts` — grep the publishable package for Portuguese
    residue, with `FOUNDATION.md` and the opening prompt allow-listed.

## 9. Explicitly out of scope for this design

- License choice (MIT is the reasonable default per `FOUNDATION.md` §11, not
  decided here).
- The cross-repo dependency graph artifact (§7 above).
- A programmatic (non-CLI) API (§3 above).
- Hub repo bootstrapping mechanics beyond "it's a wiki-kit repo" — how an
  operator stands up `knowledge-hub` for the first time is an operational
  runbook, not part of the package architecture.

## 10. Migration path (pointer only)

Per `FOUNDATION.md` §10: once published, `.claude/skills/wiki-kit/` becomes a
thin wrapper calling `npx @glauberborges/wiki-kit` instead of vendoring
`wiki/scripts/`, and Hive itself migrates off the vendored scripts to consume
the published package — closing the dogfood loop and serving as the first
real install test. Not part of this design's implementation plan; tracked
here so it isn't lost.
