# Task 1: Add `custom: form` FSM alias

## Context

The workflows engine resolves submit signals through per-kind FSM tables in
`plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js`. The
exported `FSM_TABLES` is `{ form, tracker, check: form }`, where `check` is an
**object-identity alias** of `form` (never a copy, so a future edit to `form`
can't silently diverge from `check`).

`resolveSignal.js` looks up `FSM_TABLES[action.kind]`. A new `kind: custom` action
behaves exactly like `check` for the submit lifecycle (same eight-status machine,
same nullary signals). Without an entry, a custom submit throws on an undefined
table.

## Task

In `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js`, add
`custom: form` to the `FSM_TABLES` export as an **object-identity alias** (point
at the same `form` object, exactly as `check: form` does — do not copy). Update
the adjacent comment to cover `custom` alongside `check`.

```js
export const FSM_TABLES = {
  form,
  tracker,
  // `check` and `custom` are IDENTICAL to form — aliased by object identity,
  // never a copy, so a future edit to `form` can't silently diverge.
  check: form,
  custom: form,
};
```

In `plugins/modules-mongodb-plugins/src/connections/shared/fsm/resolveSignal.test.js`,
add a test asserting a `kind: custom` action resolves submit signals through the
same table as form/check (e.g. `submit` at `action-required` → `in-review` when a
review verb is declared, else `done`; `approve` at `in-review` → `done`).

## Acceptance Criteria

- `FSM_TABLES.custom === FSM_TABLES.form` (identity, not a structural copy).
- `resolveSignal` resolves a `kind: custom` submit identically to `kind: check`.
- New `resolveSignal.test.js` case for `kind: custom` passes.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` (or the package's test
  runner) passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/tables.js` — modify — add `custom: form` alias + comment.
- `plugins/modules-mongodb-plugins/src/connections/shared/fsm/resolveSignal.test.js` — modify — add a `kind: custom` resolution test.
