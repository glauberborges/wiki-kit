# STATE

## Decisions

### AD-001
- **Decision**: The published package has zero runtime dependencies. Flag/subcommand parsing uses `node:util.parseArgs`; no `commander`/`yargs`; no terminal color library.
- **Reason**: Every invariant in `FOUNDATION.md` §4 exists to minimize what a target repo's CI has to trust. Extending that discipline to wiki-kit's own dependency tree keeps `npx @glauberborges/wiki-kit` a single-package fetch and minimizes supply-chain surface in a tool CI blindly trusts.
- **Trade-off**: Manual `--help` text, no color output.
- **Scope**: All commands (`src/cli.ts`, `src/commands/*`), all future features.
- **Date**: 2026-08-14
- **Status**: active

### AD-002
- **Decision**: The package is authored in TypeScript, compiled to `dist/` via `tsc`; `src/` is never published. `npm run lint` is the typecheck step; `npm run build` produces the published artifact.
- **Reason**: Already fixed by this project's own `CLAUDE.md` command table before this session started — not re-litigated, only made explicit here as a constraint the architecture must honor.
- **Trade-off**: A build step exists (unlike the reference `.mjs` scripts, which ran unbuilt); `npm pack --dry-run` must be checked to confirm `dist/` is what ships.
- **Scope**: Whole package.
- **Date**: 2026-08-14
- **Status**: active

### AD-003
- **Decision**: The config file lives at `wiki/wiki-kit.config.yaml` — inside `wiki/`, never at the target repo root.
- **Reason**: `FOUNDATION.md` §4 lists only two exceptions to "nothing outside `wiki/`" (the CI file and `.claude/agents/wiki.md`); §7 proposed the config at root, which would silently add a third exception and contradicts that same section's own "everything in one place" reasoning. Corrected during design; confirmed with the repo owner.
- **Trade-off**: None — closes an inconsistency, adds no new exception to the invariant.
- **Scope**: `core/config.ts`, `init` scaffolding, all commands that read config (`lint`, `affected`, `llms`, `update`, `hub push`).
- **Date**: 2026-08-14
- **Status**: active

### AD-004
- **Decision**: The CLI is the only public contract. No programmatic JS API (`import { lint } from '@glauberborges/wiki-kit'`) ships in v1.
- **Reason**: Nothing in `FOUNDATION.md` asks for one; every consumer described (human, CI, agent) shells out.
- **Trade-off**: A future caller needing programmatic access must shell out to the CLI or wait for an `exports` map to be added.
- **Scope**: Whole package's public surface.
- **Date**: 2026-08-14
- **Status**: active

### AD-005
- **Decision**: `core/` mirrors the reference implementation file-for-file (`frontmatter.ts` ← `frontmatter.mjs`, `pages.ts` ← `pages.mjs`, `lint-rules.ts` ← `wiki-lint.mjs`'s `RULES` array, `llms.ts` ← `wiki-llms.mjs`) rather than being reorganized by feature/command.
- **Reason**: Keeps the port auditable 1:1 against the reference's existing test suite without renaming anything mid-translation, reducing the risk of silently changing behavior while adding types.
- **Trade-off**: `core/` isn't organized the way a greenfield design might choose; accepted for traceability.
- **Scope**: `src/core/*`.
- **Date**: 2026-08-14
- **Status**: active

### AD-006
- **Decision**: Cross-repo sharing is aggregation via `hub push` (copy generated artifacts into a checkout of a separate hub repo, commit, direct `git push`) — never a git submodule.
- **Reason**: Submodule-based sharing was tested in the reference implementation and found to break staleness silently (`git log` in the host can't see into a submodule's own history) and to defeat the CI gate (the host's diff shows only the gitlink moving, never actual page content) — `FOUNDATION.md` §5.5. The second failure is structural: it permanently loses the "docs update in the same PR as code" guarantee §8(a) calls load-bearing. Considered again and explicitly rejected during this feature's design — see `.specs/features/wiki-kit/context.md` "Rejected Approaches."
- **Trade-off**: `hub push` requires a write-scoped credential (`WIKI_HUB_TOKEN`) per source repo, rather than the simpler (but broken) shared-checkout model.
- **Scope**: `src/commands/hub.ts`, any future feature touching cross-repo docs.
- **Date**: 2026-08-14
- **Status**: active

### AD-007
- **Decision**: Templates ship as real files under `templates/`, declared in `package.json`'s `files` field, located at runtime via `fileURLToPath(import.meta.url)`. No inlining, no template-content build step.
- **Reason**: `npm pack --dry-run` doubles as an audit of exactly what ships; matches the pattern used by comparable scaffolding CLIs (create-vite, create-react-app).
- **Trade-off**: None identified.
- **Scope**: `src/init/scaffold.ts`, `templates/`.
- **Date**: 2026-08-14
- **Status**: active

### AD-008
- **Decision**: Tests use Vitest, ported from the reference's `tests/wiki/*.test.ts` with the same assertions and failure-mode coverage — never rewritten to a different framework or weakened.
- **Reason**: `FOUNDATION.md` §9 and this project's `CLAUDE.md` both say "port the tests, don't rewrite them" — swapping frameworks mid-port would be exactly that kind of rewrite.
- **Trade-off**: Vitest + TypeScript are devDependencies (compile-time / test-time only — never present in the published `dist/`, so this doesn't conflict with AD-001).
- **Scope**: `test/*`.
- **Date**: 2026-08-14
- **Status**: active

## Handoff

- **Feature**: wiki-kit (`.specs/features/wiki-kit/`)
- **Phase / Task**: Tasks — `tasks.md` written (24 tasks, 5 phases), awaiting user approval before Execute
- **Completed**: Specify (spec.md + context.md, approved), Design (design.md, approved)
- **In-progress**: `.specs/features/wiki-kit/tasks.md` — written, validated (granularity/diagram-cross-check/test-co-location all pass), not yet approved by user
- **Next step**: Present tasks.md + ask about MCPs/Skills per tasks.md process step 6, then on approval invoke Execute (tlc-spec-driven skill, per tasks.md's Execution Protocol)
- **Blockers**: none
- **Uncommitted files**: `.specs/` tree (new — spec.md, context.md, design.md, tasks.md, STATE.md), `docs/superpowers/specs/2026-08-14-package-architecture-design.md` (already committed)
- **Branch**: feat/setup
