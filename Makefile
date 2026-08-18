# Local dev install for wiki-kit itself — NOT the Makefile shipped into
# target repos (that one lives in templates/wiki/Makefile).
#
# Installs `wiki-kit-dev` as a symlink into npm's global bin dir, pointing
# at THIS checkout's bin/cli.js. A real `wiki-kit` (from `npx` or
# `npm install -g @glauberborges/wiki-kit`) is a different file in the same
# directory, so the two never collide: `wiki-kit` stays whatever's actually
# published, `wiki-kit-dev` always runs your local, uncommitted changes.
#
# Because it's a symlink, not a copy, you only run `make install-dev` once —
# after that, `make build` (which recompiles src/ -> dist/) is all you need
# between test runs; `wiki-kit-dev` picks up the new dist/ automatically.

NPM_GLOBAL_BIN := $(shell npm prefix -g)/bin
DEV_BIN        := $(NPM_GLOBAL_BIN)/wiki-kit-dev
CLI_ENTRY      := $(CURDIR)/bin/cli.js

.PHONY: help build install-dev uninstall-dev dev clean

help:
	@echo "make build          npm install + npm run build"
	@echo "make install-dev    build, then link wiki-kit-dev -> this checkout (one-time)"
	@echo "make dev            rebuild after a change (wiki-kit-dev already points here)"
	@echo "make uninstall-dev  remove the wiki-kit-dev symlink"
	@echo "make clean          remove dist/"

build:
	npm install
	npm run build

install-dev: build
	@mkdir -p "$(NPM_GLOBAL_BIN)"
	ln -sf "$(CLI_ENTRY)" "$(DEV_BIN)"
	@echo "wiki-kit-dev -> $(CLI_ENTRY)"
	@echo "Try: wiki-kit-dev --help"

dev: build
	@echo "Rebuilt — wiki-kit-dev already points at this checkout, nothing else to do."

uninstall-dev:
	rm -f "$(DEV_BIN)"

clean:
	rm -rf dist
