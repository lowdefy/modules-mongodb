# Task 7: `universal_fields` authoring field — validation, passthrough, normalization

## Context

Authors declare which universal fields an action's UI shows via a new optional action field:

```yaml
type: qualify
kind: form
universal_fields: [assignees, due_date]   # omit = all three; false / [] = none
```

It is purely a UI presence declaration — the action doc always physically carries all three fields. Two resolvers carry action fields from the raw workflow YAML to consumers, each with an allowlist:

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — `ACTION_FIELDS` (engine-runtime + per-action UI lookups; also the central authoring **validator** — every authored field gets validated here, e.g. `validateActionAccess`, `validateStatusMapCells`).
- `modules/workflows/resolvers/makeActionPages.js` — `ACTION_FIELDS_FOR_TEMPLATE` (the `action_config` template var the form page templates read).

`required_after_close` is the design-named precedent: present in both allowlists, passed through verbatim. The design's verification pins: "`universal_fields` reaches `action_config.universal_fields` with the all-three default" — so the template-side value must be a concrete array, never `undefined`/`false`.

`universal_fields_required` (proposed in an earlier draft) is **dropped** and was never in either allowlist — there is nothing to remove; do not add it.

## Task

1. **`makeWorkflowsConfig.js`**:
   - Add `'universal_fields'` to `ACTION_FIELDS` (verbatim passthrough — no runtime consumer reads it in v1, but the field follows the `required_after_close` pattern of being present in both surfaces).
   - Add a `validateUniversalFields(workflow, action)` check wired into `validateAction`, following the house validator style (`fail(workflow.type, ...)` messages): legal values are — field omitted; `false`; or an array whose every member is one of `assignees` / `due_date` / `description` with no duplicates. Anything else (e.g. `true`, a string, unknown names) hard-errors with a message naming the legal forms.
2. **`makeActionPages.js`**:
   - Add `'universal_fields'` to `ACTION_FIELDS_FOR_TEMPLATE`.
   - After the `pick`, **normalize** the value on the emitted `action_config`: omitted/`undefined` → `['assignees', 'due_date', 'description']`; `false` → `[]`; array → as-is. Templates and the component then always see a (possibly empty) array and can gate the sidebar column on non-emptiness with no type juggling.
3. **Tests** (`makeWorkflowsConfig.test.js`, `makeActionPages.test.js`, existing fixture conventions under `resolvers/__fixtures__/`):
   - Config resolver: valid forms pass through verbatim; invalid forms (unknown field name, `true`, duplicate entry, non-array non-false) throw with the action named.
   - Pages resolver: omitted → all-three default on `action_config.universal_fields`; `false` → `[]`; explicit subset → unchanged; `universal_fields_required` never appears in output even if present in input (allowlist semantics — no special code needed, just assert).

## Acceptance Criteria

- `pnpm --filter workflows test makeWorkflowsConfig makeActionPages` (or this repo's equivalent module test invocation) passes.
- A form template var dump for an action with no `universal_fields` key shows `action_config.universal_fields: ['assignees', 'due_date', 'description']`.
- Authoring `universal_fields: [bogus]` fails the build with a clear validator message.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — allowlist entry + validator.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — validation cases.
- `modules/workflows/resolvers/makeActionPages.js` — modify — allowlist entry + normalization.
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — normalization cases.

## Notes

- Normalization lives in `makeActionPages` (the template consumer), not `makeWorkflowsConfig` — the engine never reads `universal_fields`, so the runtime config carries the authored value verbatim. If a runtime consumer ever appears, revisit then ("build for what exists").
- The validator addition is pattern-following, not scope creep: `makeWorkflowsConfig` is where every other authored action field is validated, and an unvalidated enum-ish field would be the odd one out.
