# Language-neutral entry point for the wiki.
#
# `lint`, `affected`, `ingest-prompt` and `llms` run through `npx @glauberborges/wiki-kit`
# — NO npm install in this repo. That's what makes verification free in a Go, PHP or
# Python repo: only `build`/`serve` need the Docusaurus toolchain.

BASE ?= origin/main

.PHONY: lint strict affected ingest-prompt llms build serve clean help

help:
	@echo "make lint           check the wiki (front matter, sources, staleness, links)"
	@echo "make strict         same, but warnings fail too (used in CI)"
	@echo "make affected       pages affected by the diff vs \$$BASE ($(BASE))"
	@echo "make ingest-prompt  ready-to-paste prompt for an agent CLI"
	@echo "make llms           generate llms.txt, llms-full.txt, map.json and the OKF bundle"
	@echo "make build          build the site (needs npm install)"
	@echo "make serve          run the site in dev mode (needs npm install)"

lint:
	@npx -y @glauberborges/wiki-kit lint

strict:
	@npx -y @glauberborges/wiki-kit lint --strict

affected:
	@npx -y @glauberborges/wiki-kit affected --base $(BASE)

ingest-prompt:
	@npx -y @glauberborges/wiki-kit ingest-prompt --base $(BASE)

llms:
	@npx -y @glauberborges/wiki-kit llms

build: llms
	@npm install --no-audit --no-fund && npm run build

serve:
	@npm install --no-audit --no-fund && npm start

clean:
	@rm -rf build .docusaurus static/llms.txt static/llms-full.txt static/map.json static/okf
