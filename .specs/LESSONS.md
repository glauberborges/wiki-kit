# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — When a spec AC specifies the literal I/O channel (e.g. print to stdout vs. write a file), verify the implementation matches that channel exactly — a file-based delivery of equivalent content is still a deviation from a 'print' requirement, not an equivalent implementation.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `init` · harmful: 0
- features: wiki-kit
- evidence: spec.md P2 AC-03 (INIT-03) vs src/commands/init.ts:100-111 (init)
- last seen: 2026-08-14T21:21:37Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
