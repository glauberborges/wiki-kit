# Language-neutral entry point for the wiki.
#
# `lint`, `affected` and `llms` run the scripts vendored under `.wiki-kit/scripts/`
# by `init` — plain Node, no npm install, no network. That's what makes verification
# free in a Go, PHP or Python repo. There's no `build` target: Mintlify deploys on
# push to this repo's default branch, nothing to produce locally first.

BASE ?= origin/main
SCRIPTS := .wiki-kit/scripts/commands

.PHONY: lint strict affected affected-strict llms serve clean help

help:
	@echo "make lint             check the wiki (front matter, sources, staleness, links)"
	@echo "make strict           same, but warnings fail too"
	@echo "make affected         pages affected by the diff vs \$$BASE ($(BASE))"
	@echo "make affected-strict  same, but fails when an affected page wasn't updated (the CI gate)"
	@echo "make llms             generate llms.txt, llms-full.txt, map.json and the OKF bundle"
	@echo "make serve            preview the site locally (needs the mint CLI: npm i -g mint)"

lint:
	@node $(SCRIPTS)/lint.js

strict:
	@node $(SCRIPTS)/lint.js --strict

affected:
	@node $(SCRIPTS)/affected.js --base $(BASE)

affected-strict:
	@node $(SCRIPTS)/affected.js --base $(BASE) --strict

llms:
	@node $(SCRIPTS)/llms.js

serve:
	@mint dev

clean:
	@rm -rf static/llms.txt static/llms-full.txt static/map.json static/okf
