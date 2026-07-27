# Task 1: Rename `simple` → `check` in the config-schema validator and resolver tests

## Context

The workflows module validates app-authored `workflow_config` at build time in `modules/workflows/resolvers/makeWorkflowsConfig.js`. The set of legal action kinds lives in an `ACTION_KINDS` array, and the validator emits string error messages naming the legal kinds and rejecting illegal field combinations. We are renaming the kind value `simple` to `check` — a pure vocabulary swap with no behavioural change.

The demo `workflow_config` on this branch already declares `kind: check` (e.g. `apps/demo/modules/workflows/workflow_config/company-setup/kickoff-call.yaml`), so the validator currently **rejects** the demo with an "unknown kind" error. This task makes the validator accept `check` and reject `simple`, un-breaking the demo build.

This task is package-scoped to `modules/workflows/resolvers` and is independent of the engine/plugin rename (Task 2). After this task, the resolver test suite must be green.

Current sites in `modules/workflows/resolvers/makeWorkflowsConfig.js`:

- Line 29: `const ACTION_KINDS = ['form', 'simple', 'tracker'];`
- Line ~352: unknown-kind error — `` `${where} has unknown kind "${action.kind}" (expected form, simple, or tracker).` ``
- Line ~362: `if (action.kind === 'simple' && (action.form || action.tracker)) {`
- Line ~365: error — `` `${where} has kind "simple" but defines form: or tracker:.` ``

There are **no test assertions on this error wording** (the only "unknown kind" test, `resolveSignal.test.js:66`, belongs to the FSM and is unrelated), so the string edits are safe.

## Task

In `modules/workflows/resolvers/makeWorkflowsConfig.js`:

1. Change `ACTION_KINDS` to `['form', 'check', 'tracker']`.
2. Update the unknown-kind error message to read `(expected form, check, or tracker).`
3. Change the kind-equality branch `action.kind === 'simple'` to `action.kind === 'check'`.
4. Update the field-combination error message to `` `${where} has kind "check" but defines form: or tracker:.` ``.

In the resolver tests, replace every `kind: "simple"` / `kind: 'simple'` fixture with `kind: 'check'`, and update any test description strings that say "simple kind" to "check kind":

- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` (~23 occurrences)
- `modules/workflows/resolvers/makeActionPages.test.js` (~line 39)
- `modules/workflows/resolvers/makeActionFormConfigs.test.js` (~line 52)
- `modules/workflows/resolvers/makeWorkflowApis.test.js` (~lines 44, 180, 262)

Grep the whole `modules/workflows/resolvers/` directory for `simple` (case-insensitive) afterward to confirm no action-kind reference remains. Leave any `simple` occurrences that are genuinely unrelated to the action kind (none are expected) — flag them rather than blindly replacing.

## Acceptance Criteria

- `grep -rn "simple" modules/workflows/resolvers/` returns no action-kind references (validator, fixtures, or test descriptions).
- `ACTION_KINDS` is `['form', 'check', 'tracker']`; both error messages name `check` (not `simple`).
- The resolver test suite passes: `pnpm --filter <workflows-module-package> test` (or the repo's test command scoped to `modules/workflows/resolvers/*.test.js`).
- A `workflow_config` action with `kind: simple` now fails validation with the generic unknown-kind error; `kind: check` validates.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — `ACTION_KINDS` array, two error strings, one kind-equality branch.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — replace `simple` fixtures + descriptions.
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — replace `simple` fixture(s).
- `modules/workflows/resolvers/makeActionFormConfigs.test.js` — modify — replace `simple` fixture(s).
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — replace `simple` fixtures.

## Notes

- Do **not** add a bespoke "did you mean `check`?" hint for the rejected `simple` value — the design explicitly leaves the generic unknown-kind error in place (Out of scope).
- Do not touch page ids, file paths, or routes — they are already final (`workflow-action-*`).
