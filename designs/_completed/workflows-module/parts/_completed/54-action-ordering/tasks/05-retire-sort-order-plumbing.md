# Task 5: Retire `sort_order` from config plumbing and module docs

## Context

With the four engines no longer reading `sort_order` (tasks 2–4), the field is fully
dead. Order is now derived from declaration position in the config arrays, so
`sort_order` should stop riding the config blob and stop being documented as a field
the engine reads. This task removes it from the config-resolution plumbing and the
module-level docs/template.

This is safe and (functionally) a no-op: the engines read `sort_order` off **action
documents**, never off config, and `sort_order` was never written onto docs anyway.
Removing it from `ACTION_FIELDS` simply means configs that still declare it are
silently dropped by `pick()` — declaring it becomes a harmless no-op.

## Task

1. **`modules/workflows/resolvers/makeWorkflowsConfig.js`** — remove the `'sort_order',`
   entry from the `ACTION_FIELDS` array (line ~23). `pick()` already drops unknown
   fields, so no other change is needed.
2. **`modules/workflows/resolvers/makeActionPages.js`** — remove the `"sort_order",`
   entry from the `ACTION_FIELDS_FOR_TEMPLATE` array (line ~16).
3. **`modules/workflows/README.md`** — in the line-85 sentence listing "The
   action-level fields the engine reads at runtime are …", remove `sort_order` from
   that list (it is no longer true that the engine reads it).
4. **`modules/workflows/templates/view.yaml.njk`** — remove `sort_order` from the
   `action_config: { … }` field-list comment (lines ~4–6). Cosmetic; no template logic
   reads it.

## Acceptance Criteria

- `sort_order` no longer appears in `ACTION_FIELDS` (`makeWorkflowsConfig.js`) or
  `ACTION_FIELDS_FOR_TEMPLATE` (`makeActionPages.js`).
- The README line-85 field list no longer mentions `sort_order`.
- The `view.yaml.njk` `action_config` comment no longer mentions `sort_order`.
- `pnpm ldf:b` (from `apps/demo`) builds clean — config still compiles with the field
  dropped.
- Any resolver unit tests that assert `sort_order` is carried through config are
  updated or removed.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — **modify** — drop
  `'sort_order'` from `ACTION_FIELDS`.
- `modules/workflows/resolvers/makeActionPages.js` — **modify** — drop `"sort_order"`
  from `ACTION_FIELDS_FOR_TEMPLATE`.
- `modules/workflows/README.md` — **modify** — remove `sort_order` from the line-85
  runtime-fields list.
- `modules/workflows/templates/view.yaml.njk` — **modify** — remove `sort_order` from
  the `action_config` comment.

## Notes

- Demo config YAML still declaring `sort_order:` will not break after this change
  (it is dropped by `pick()`); stripping those lines is the separate cleanup in
  task 6.
- This task has no hard dependency on tasks 2–4, but should land alongside or after
  them so the change reads as one coherent unit.
