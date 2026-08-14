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

- **Feature**: wiki-kit (`.specs/features/wiki-kit/`) — DONE
- **Phase / Task**: Complete — Specify → Design → Tasks → Execute → Verify, all passed
- **Completed**: All 24 tasks (T1-T24) implemented and merged to `feat/setup`; independent Verifier ran (author ≠ verifier): 29/29 ACs verified, 224/224 tests passing, 9/9 discrimination-sensor mutations killed, zero-runtime-dependency invariant structurally confirmed. One minor spec-precision gap (INIT-03 Jenkins wording) found and resolved by correcting `spec.md` to match the built (better) behavior — see `.specs/features/wiki-kit/validation.md` Resolution section.
- **In-progress**: none
- **Next step**: Feature is ready for the user's own review; not yet published to npm (still `0.1.0`, `npm pack --dry-run` verified but no `npm publish` run — that's a separate, explicit decision per this project's release checklist in `CLAUDE.md`)
- **Blockers**: none
- **Uncommitted files**: `.specs/features/wiki-kit/spec.md` (INIT-03 correction), `.specs/features/wiki-kit/validation.md` (new), `.specs/LESSONS.md`/`.specs/lessons.json` (new, from the Verifier's L-001 candidate lesson)
- **Branch**: feat/setup (32 commits ahead of main for this feature, all local — nothing pushed)
