# Task 6: Kind-based universal-fields rule in `planActionTransition`

## Context

`plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` carries the legacy generic `fields` passthrough: both its insert and update paths spread `...payload.fields` onto the planned doc verbatim, kind-agnostic, without naming any field. Its JSDoc already anticipates this task:

> `fields` is a kind-agnostic verbatim passthrough (today's `updateAction` `...fields` spread — no named universal fields; Part 24 layers a kind-based rule later).

Part 24 is where the universal-fields concept enters the planner. The rule (design, "Submit-planner guard"): **the planner writes `assignees` / `due_date` / `description` only for `kind: simple`** — the kind whose submission content *is* those fields. For `kind: form` the planner never touches them (they're owned exclusively by the `UpdateActionFields` operation); per the design's "only for `kind: simple`" phrasing, every non-simple kind (form, tracker) is excluded. The rule keys on the action's **kind** (from `actionConfig`, already in scope), not the payload shape — a stray `fields` payload on a form submit must be inert. This makes Part 39's payload-drop hygiene rather than a correctness precondition.

Critically, the `fields` bag is used for more than universal fields: pre-hook auxiliary entries seed arbitrary data via it (`PreHookResult.actions[].fields`, see `shared/phases/types.js`), and tracker cascade fires forward child-link fields (`child_workflow_id` / `child_entity_id` / `child_entity_collection`) through `payload.fields`. **Only the three universal keys are filtered; all other keys keep passing through verbatim for every kind.**

## Task

In `planActionTransition.js`:

1. Add a module-level constant `const UNIVERSAL_FIELDS = ['assignees', 'due_date', 'description'];`.
2. Where `payload.fields` is applied (both the insert and the update doc compositions), replace the verbatim spread with a kind-filtered bag: when `actionConfig.kind !== 'simple'`, strip the three universal keys from the bag before spreading; when `kind === 'simple'`, spread verbatim exactly as today. Implement the filter once (small helper above the planner), not twice inline.
3. Insert-path note: the seeded defaults (`assignees: []`, `due_date: null`, `description: null`) stay exactly as they are — the rule only governs what the *payload bag* may override.
4. Update the JSDoc `payload` description: replace the "Part 24 layers a kind-based rule later" forward-reference with the present-tense rule (universal fields written only for `kind: simple`; other keys kind-agnostic verbatim).

Extend `planActionTransition.test.js`:

- `kind: simple` update with `fields: { assignees, due_date, description }` → all three written (existing behaviour preserved).
- `kind: form` update with the same bag → none of the three written (stored values preserved); a non-universal key in the same bag IS written.
- `kind: form` upsert/insert spawn with universal keys in the bag → planned doc carries the seeded defaults, not the payload values; non-universal seeded keys land.
- `kind: tracker` update with child-link fields (`child_workflow_id` etc.) in the bag → written (cascade path unbroken); universal keys in the same bag → not written.
- `kind: simple` insert via seed mode with universal keys → written (simple seeding keeps full passthrough).

## Acceptance Criteria

- `pnpm --filter modules-mongodb-plugins test planActionTransition` passes; all pre-existing cases untouched.
- Form-kind plans can never write `assignees` / `due_date` / `description` regardless of payload shape.
- Tracker cascade child-link forwarding and pre-hook data seeding are demonstrably unaffected.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — kind-based universal-fields filter on the `payload.fields` spread (both paths) + JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.test.js` — modify — kind-rule cases.

## Notes

- This task is independent of tasks 1–5 and can land in any order relative to them: before the handler exists, form-kind submits simply stop honouring a `fields` payload they should never have honoured; simple submits are bit-identical throughout.
- This file is currently modified on the working branch (Part 38 task 23 just touched it) — rebase carefully and keep the seed-mode behaviour intact.
- Do NOT touch the `metadata` bag — only `fields` carries the rule.
