---
name: wiki-kit
description: Keeps a repository's documentation verifiably in sync with its code. Each wiki page's front matter declares which source files it documents (sources:), so staleness, "what does this diff affect", and a CI gate are all computed deterministically from git — no LLM needed to verify. Use when setting up a docs wiki from scratch, checking whether docs are stale, updating docs for a PR or diff, adding a new documented page or section (even for existing, previously undocumented code), or sharing a docs index across repos via a hub.
compatibility: Requires git and Node.js 20+ on PATH. Network access only for `hub.js` (push to a configured hub repo).
allowed-tools: Bash(node:*) Bash(git:*) Bash(make:*)
---

# wiki-kit

Docs rot silently because nothing ties a page to the code it describes. wiki-kit's fix: a
page's front matter names its sources, e.g.

```yaml
sources:
  - resource: src/auth/session.ts
```

From that one field, deterministically: staleness (did a source change after the page?),
`affected` (given a diff, which pages need updating, and which changed files have no page at
all), and a CI gate that fails a PR whose code changed but whose docs didn't.

**Verification never needs an LLM.** `lint`, `affected`, and `llms` are plain Node scripts.
`init` vendors a copy of them into the target repo (`wiki/.wiki-kit/scripts/`), so once a repo
is set up, its own CI runs the gate with `node` on PATH — no wiki-kit skill, no network,
forever. Only *writing* pages needs an agent, and that's this skill's other job.

## Which workflow

Three different things get asked of this skill — tell them apart by what's actually being
requested, not only by whether `wiki/wiki-kit.config.yaml` exists:

- **Starting from nothing** — "set up docs for this repo", no wiki exists yet → **Init**.
- **Catching the docs up to code that already changed** — "update the docs for this PR/diff",
  "what does my change affect" → **What a diff affects**, then **Update pages**.
- **An explicit, standalone ask to document something** — "document X", "add a page about Y" —
  not necessarily tied to any diff, often about code that's existed for a while and was never
  written up → **Add a new page**.
- "Is the wiki healthy / does CI pass?" → **Check health**.
- Sharing this repo's docs index into a central hub → **Hub push**.

All scripts live under `scripts/` in this skill and take the target repo's `wiki/` as their
working directory context (they find it by walking up from `cwd` to the nearest `.git`, same
as git itself). Run them with `node`, e.g. `node scripts/commands/lint.js`.

## Init

Scaffolds a new wiki: `wiki/docs/`, `wiki-kit.config.yaml`, `AUTHORING.md`, a site (Docusaurus
or Mintlify), `.claude/agents/wiki.md`, a CI file, and the vendored verification scripts.

**1. Ask the user** (don't guess):

- Project name and GitHub org/owner.
- Which doc engine — **Docusaurus** (default, self-hosted static site, `.md` pages, explicit
  `make build`) or **Mintlify** (hosted, deploys on push to the default branch with no local
  build, `.mdx` pages, needs `npm i -g mint` only to preview locally). These are the only two
  engines with an asset tree (`assets/wiki-docusaurus/`, `assets/wiki-mintlify/`) — if the user
  names a third one, say so plainly and ask whether to proceed with Docusaurus (the default) or
  stop, never silently scaffold either engine after they asked for something else.
- Docs locale (default `en`).
- Whether to connect this wiki to a hub repo (see **Hub push**) — if yes, also its
  `owner/name` and branch (default `main`).
- Whatever else the repo's own context makes relevant (e.g. a tagline, since `--tagline` and
  `--tagline-long` have no default and the script fails naming them if missing — ask rather
  than invent marketing copy).

**2. Run the script** with what you gathered:

```bash
node scripts/commands/init.js \
  --project "Acme API" --org acme --tagline "Payments API" \
  --tagline-long "Handles checkout and refunds." \
  [--engine docusaurus|mintlify] \
  [--locale en] [--repo <dir-name-default>] [--hub-repo owner/hub] [--hub-branch main] [--force]
```

`--engine` defaults to `docusaurus` when omitted.

It detects the stack from whatever manifest it finds (`go.mod`, `composer.json`,
`package.json`, `pyproject.toml`, ...) and picks a CI file: `.github/workflows/wiki.yml` if
`.github/` exists, `Jenkinsfile.wiki` if there's a `Jenkinsfile` (wire its two gate stages into
the existing pipeline), or it prints the two manual commands otherwise. The CI file's content
(whether it has a "build the site" job) also follows the chosen engine — Mintlify has none,
since deployment happens outside this CI entirely.

**3. Idempotent** — running it again makes no changes if nothing drifted. If a file was hand-
edited since, it lists the conflicts and stops; pass `--force` only if the user confirms
overwriting is fine.

## Check health

```bash
node scripts/commands/lint.js [--strict]
```

Checks front matter, that declared `sources:` still exist, staleness, broken relative links,
and a few structural rules (11 total — see `scripts/core/lint-rules.js`'s `RULES` for the
full, authoritative list). `--strict` also fails on warnings — that's what CI uses.

## What a diff affects

```bash
node scripts/commands/affected.js [--base <ref>] [--strict]
```

Prints which pages declare sources touched by the diff, and which changed files have *no*
page at all (usually new functionality). Base resolves automatically from whichever CI
env var is set (`GITHUB_BASE_REF`, `CHANGE_TARGET`, ...); pass `--base` to override.

`--strict` is the CI gate: it fails when a page's declared sources changed but the page itself
wasn't touched in the same diff — code moved on without its docs.

## Update pages

Catches the docs up to code that already changed — e.g. "update the docs for this PR". Run
**What a diff affects** first (if the change is an open PR rather than the current branch's
diff, get that diff with `gh pr diff <number>` or `git diff <base>...<pr-branch>` and use that
as the file list), then:

1. For each page listed under "Pages to update": read the actual diff (`git diff
   <base>...HEAD -- <files>`) to understand what changed — don't guess from the file list.
   Edit the page. Describe **behavior**, not the diff. Keep a "Where it lives in the code"
   table current if the page has one. Update `sources:` if new files joined the topic.
2. In the front matter of every page you touch, set `generated: { by: <your-model>, at:
   <YYYY-MM-DD> }`. **Do not set `verified:`** — that's for whoever reviews the PR. Marking
   yourself verified silences the warning without anyone having actually checked it, which is
   worse than leaving it on.
3. For files under "Not covered": **propose**, don't create — a new file with no page might
   need a new page, might extend an existing one, or might be an internal detail that never
   needed documenting. Ask before writing (or see **Add a new page** once they decide).
4. Run **Check health** and fix whatever it reports.

Writing conventions live in the target repo's `wiki/AUTHORING.md` (installed by init) — read
it before writing prose, it's more detailed than this summary.

## Add a new page

An explicit, standalone ask to document something — "document the retry logic", "add a page
about X" — not driven by any diff. Often about code that's existed for a while and was simply
never written up, so **What a diff affects** won't surface it.

**1. Ask the user** (don't guess):

- Which section it belongs in — `architecture/` or `reference/` (needs `sources:`),
  `guides/`, `getting-started/`, or `contributing/` (don't). The target repo's
  `wiki/AUTHORING.md` has the full table if the categories aren't obvious from the subject.
- Whether this extends an existing page or deserves a new one — check the existing pages'
  `sources:` and content first (grep `wiki/docs/`) and propose an answer rather than assuming;
  one page covering two subjects that change for different reasons should split instead.

**2. Determine the sources, don't ask for an enumeration.** Read the actual code to find which
files the subject lives in — a glob at subsystem granularity (`src/auth/*.go`, not one entry
per file). Confirm the list with the user only if the codebase doesn't make it obvious.

**3. Write the page** following `wiki/AUTHORING.md`'s conventions: required front matter
(`title`, `type`, `sources` if applicable), a "Where it lives in the code" table for
architecture/reference pages, behavior described from reading the code — never invented. Set
`generated: { by, at }`, never `verified:`.

**4. Link it.** Always add it to `wiki/docs/index.md`'s (or `index.mdx`'s) "Where to start"
table. **On Mintlify** (`wiki/docs.json` exists), also add the page to the right group in
`navigation.groups[].pages` — Mintlify's nav is explicit, not autogenerated, so skipping this
makes the page invisible on the site even though `lint`/`llms` see it fine. **On Docusaurus**
no second edit is needed — its sidebar is autogenerated per directory.

**5.** Run **Check health** and fix whatever it reports.

## Regenerate the agent-readable layer

```bash
node scripts/commands/llms.js
```

Writes `llms.txt` (curated index), `llms-full.txt` (everything concatenated), `map.json` (file
→ page reverse index), and an OKF-conformant bundle, under the config's `output.dir`. Only the
artifacts listed in `output.artifacts` get written. Run this before **Hub push**, and before
building the Docusaurus site (CI does this automatically).

## Hub push

For repos that opted into a hub during init (`wiki-kit.config.yaml` has a `hub:` block):

```bash
export WIKI_HUB_TOKEN=ghp_...   # a write-scoped token for the hub repo
node scripts/commands/hub.js
```

Clones the hub repo, copies this repo's generated artifacts (from **Regenerate the
agent-readable layer**, must be run first) under `docs/<this-repo-name>/`, commits, and
pushes. Fails directly on a rejected push (concurrent write from another repo) — no retry, no
rebase; re-run after checking the hub's history. The hub is just another wiki-kit repo: its
own `llms` run builds the unified index across every repo pushed into it.

Cross-repo sharing here is aggregation via a real commit + push, never a git submodule — a
submodule was tried in an earlier iteration and found to silently break staleness detection
and defeat the same-PR CI gate.

## Config reference

`wiki/wiki-kit.config.yaml`, written by init with sane defaults:

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
hub:               # only present if init's hub question was answered yes
  repo: owner/hub-repo-name
  branch: main
```

Any rule can be set to `off` per repo. The legitimate way to exempt one page from a rule is
adjusting its `sources:` — never turning off the rule to make a specific page pass.

## Limits

- Never fabricate documentation. If the diff doesn't make behavior clear and the code doesn't
  answer it, say so instead of writing something plausible — invented documentation costs the
  credibility of every other page.
- Never stamp `verified:` yourself — see **Update pages** step 2 or **Add a new page** step 3.
- These scripts only ever write inside `wiki/`, `.claude/agents/wiki.md`, and the one CI file
  init selected. Nothing else in the target repo.
