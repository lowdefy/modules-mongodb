# Task 6: Kind-based universal-fields rule in `planActionTransition`

## Context

`plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` carries the legacy generic `fields` passthrough: both its insert (create/upsert) and update paths spread `...payload.fields` onto the planned doc verbatim, kind-agnostic, without naming any field. Its JSDoc already anticipates this task:

> `fields` is a kind-agnostic verbatim passthrough (today's `updateAction` `...fields` spread — no named universal fields; Part 24 layers a kind-based rule later).

Part 24 is where the universal-fields concept enters the planner. The rule (design, "Submit-planner guard") applies **only to the update path** (`:170` — an existing action transitioned by a user submit), the one place a form submit could clobber universal fields: **strip `assignees` / `due_date` / `description` from the payload bag unless `kind: check`** — check being the kind whose submission content *is* those fields. For `kind: form` (and `tracker`) the universal keys are dropped on update; they're owned exclusively by the `UpdateActionFields` operation. The rule keys on the action's **kind** (from `actionConfig`, already in scope), not the payload shape — a stray `fields` payload on a form submit must be inert. This makes Part 39's payload-drop hygiene rather than a correctness precondition.

**The create/upsert path (`:162`) is NOT guarded** — it stays a verbatim spread for every kind. That path seeds field values onto newly-spawned actions via cascade/auxiliary composition (a pre-hook can spawn an action carrying `fields`, e.g. a `kind: form` `kickoff` action seeded with `fields.description`). That is initialization, not a form-submit clobber. Guarding it would break the existing `SubmitWorkflowAction.test.js` `kickoff` upsert (`kind: form`, asserts `spawned.description === 'spawned'`) — keep that test green.

Critically, the `fields` bag is used for more than universal fields: pre-hook auxiliary entries seed arbitrary data via it (`PreHookResult.actions[].fields`, see `shared/phases/types.js`), and tracker cascade fires forward child-link fields (`child_workflow_id` / `child_entity_id` / `child_entity_collection`) through `payload.fields`. On the update path **only the three universal keys are filtered; all other keys keep passing through verbatim for every kind.**

## Task

In `planActionTransition.js`:

1. Add a module-level constant `const UNIVERSAL_FIELDS = ['assignees', 'due_date', 'description'];`.
2. On the **update path only** (the existing-action doc composition, `:170`), replace the verbatim `...payload.fields` spread with a kind-filtered bag: when `actionConfig.kind !== 'check'`, strip the three universal keys from the bag before spreading; when `kind === 'check'`, spread verbatim exactly as today. Implement the filter as a small helper above the planner.
3. **Leave the insert/create-upsert path (`:162`) unchanged** — keep its verbatim `...payload.fields` spread for every kind. Do NOT apply the filter there: cascade/auxiliary seeding must keep writing universal keys onto spawned actions of any kind (this is initialization, not a form clobber). The seeded defaults (`assignees: []`, `due_date: null`, `description: null`) remain as they are — the payload bag overrides them when present, exactly as today.
4. Update the JSDoc `payload` description: replace the "Part 24 layers a kind-based rule later" forward-reference with the present-tense rule (on the update path, universal keys written only for `kind: check`; the create path and all other keys remain kind-agnostic verbatim).

Extend `planActionTransition.test.js`:

- `kind: check` update with `fields: { assignees, due_date, description }` → all three written (existing behaviour preserved).
- `kind: form` update with the same bag → none of the three written (stored values preserved); a non-universal key in the same bag IS written.
- `kind: form` upsert/insert spawn with universal keys in the bag → the **payload values ARE written** (create path is unguarded). This mirrors the existing `SubmitWorkflowAction.test.js` `kickoff` regression (`kind: form`, `description: 'spawned'`) — keep it green.
- `kind: tracker` **update** with child-link fields (`child_workflow_id` etc.) in the bag → written (cascade path unbroken); universal keys in the same bag → not written.
- `kind: check` insert via seed mode with universal keys → written (check seeding keeps full passthrough — same as every kind on the create path).

## Acceptance Criteria

- `pnpm --filter modules-mongodb-plugins test planActionTransition` passes; all pre-existing cases untouched.
- Form-kind **update** (user submit) plans can never write `assignees` / `due_date` / `description` regardless of payload shape.
- Form-kind **create/upsert** plans (cascade/auxiliary seeding) still write universal keys from the payload — the `kickoff` regression stays green.
- Tracker cascade child-link forwarding and pre-hook data seeding are demonstrably unaffected.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — kind-based universal-fields filter on the **update-path** `payload.fields` spread (create path left verbatim) + JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.test.js` — modify — kind-rule cases.

## Notes

- This task is independent of tasks 1–5 and can land in any order relative to them: before the handler exists, form-kind submits simply stop honouring a `fields` payload they should never have honoured; check submits are bit-identical throughout.
- This file is currently modified on the working branch (Part 38 task 23 just touched it) — rebase carefully and keep the seed-mode behaviour intact.
- Do NOT touch the `metadata` bag — only `fields` carries the rule.
