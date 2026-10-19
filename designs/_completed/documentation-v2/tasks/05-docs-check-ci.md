# Task 5: `docs:check` Script + First PR-CI Workflow (Phase 1d)

## Context

The two generators from Tasks 3 and 4 each expose a `--check` mode (regenerate to temp, fail on diff; the llms generator also lints front-matter). Generation only removes drift when a check _enforces_ regeneration — otherwise the committed `vars.md` / `llms.txt` go stale silently. This task exposes a single `pnpm docs:check` and adds the repo's **first PR-CI workflow** to run it on every pull request. This is a deliberate, in-scope new cost: without the gate, the design carries the same drift risk it set out to eliminate.

The repo currently has only `.github/workflows/release.yaml` — no `pull_request`-triggered CI.

## Task

**1. Add the `docs:check` script** to root `package.json`:

```json
"docs:check": "node scripts/gen-var-docs.mjs --check && node scripts/gen-llms-txt.mjs --check"
```

The order runs the var generator check first (cheaper, module-scoped), then the llms.txt + front-matter check. Both must pass. Optionally add a convenience `docs:gen` that runs both generators in write mode (`node scripts/gen-var-docs.mjs && node scripts/gen-llms-txt.mjs`) so authors can regenerate in one command.

**2. Add `.github/workflows/ci.yaml`** — a `pull_request`-triggered workflow that:

- Checks out the repo.
- Sets up Node and pnpm matching the repo's versions (`packageManager: pnpm@10.6.2` in `package.json`; check `release.yaml` for the established Node/pnpm setup actions and reuse them for consistency).
- Runs `pnpm install` (frozen lockfile).
- Runs `pnpm docs:check`.

Keep it minimal and mirror the conventions already in `release.yaml` (action versions, pnpm setup). Do not add unrelated jobs (lint/test) unless trivially aligned — the design scopes this workflow to the docs gate.

## Acceptance Criteria

- `pnpm docs:check` exists and runs both generators' `--check` modes; exits 0 on a clean tree, non-zero when `vars.md`/`llms.txt` are stale or front-matter is invalid.
- `.github/workflows/ci.yaml` triggers on `pull_request`, installs deps, and runs `pnpm docs:check`.
- The workflow reuses the Node/pnpm setup conventions from `release.yaml`.
- Locally, editing a manifest without regenerating makes `pnpm docs:check` fail (proves the gate works).

## Files

- `package.json` — modify — add `docs:check` (and optional `docs:gen`) script.
- `.github/workflows/ci.yaml` — create — first PR-CI workflow running `pnpm docs:check`.

## Notes

- This depends on both generators existing (Tasks 3 and 4) and their `--check` modes behaving correctly.
- The front-matter linter rides along inside `gen-llms-txt.mjs --check`, so `docs:check` covers it without a separate step.
- Reference `release.yaml` rather than inventing new action versions — keep CI setup consistent across the two workflows.
