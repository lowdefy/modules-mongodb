# Task 21: `entity_ref_key` catch-up on implemented tasks (reviews 8–9 actioning)

## Context

The review-8–9 actioning pass (commit `8a9fddd` — titled "reviews 8-13", but only reviews 8–9 carry resolution annotations from it; reviews 10+ were actioned separately) amended the contracts of several **already-implemented** tasks. Most amendments turned out to be already satisfied by the landed code or were patched in the actioning commit itself — audited and confirmed aligned:

- Task 9: `types.js` Plan typedef (singular `event`, `workflow.operation`) — patched in `8a9fddd`.
- Task 10: `planActionTransition` stamps `updated: now` on the **update** path too (`planActionTransition.js:134`), with test coverage.
- Task 11: `planWorkflowRecompute` stamps `updated: now` with the CAS-soundness test (`planWorkflowRecompute.test.js:241–244`).
- `insertManyDocs.js` comment (change-log only, not notifications) — patched in `8a9fddd`.

What remains is the **`entity_ref_key` requirement** added to tasks 4 and 6 (review-9 #3 actioning: the new required workflow-config field naming the event-references key, replacing the to-be-deleted `deriveEntityRefKey` derivation whose collection-name-plural output contradicted the repo's singular `lead_ids`/`contact_ids` convention), plus one stale docstring. Task 12's `planEventDispatch` reads `entity_ref_key` off the workflow config, so this task runs **first among the remaining Band 3 tasks** (before 12) — the field must be real (validated, in the resolver's pick whitelist, present in demo configs) before new code is written against it; the resolver currently drops it silently.

## Task

**`modules/workflows/resolvers/makeWorkflowsConfig.js`** (task 6 amendment):

- Add an `entity_ref_key` validator to `validateWorkflow`: **required** on every workflow config (sibling of `entity_collection`), non-empty string (e.g. `lead_ids`) — hard-error via `fail()` when absent or empty. Message should name the field's purpose (event-references key for the workflow's entity) so config authors know what to put there.
- Add `entity_ref_key` to the `WORKFLOW_FIELDS` pick whitelist (`makeWorkflowsConfig.js:18–24`) — without this the field is **silently dropped** from the normalized output even when configured, and the engine never sees it.

**`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`** (task 4 amendment):

- Add `entity_ref_key` to the workflow shape: extend the workflow-shape description (`schema.js:56`) to include it, and add it to the items `required` list (`schema.js:61`). `string` — the event-references key for the workflow's entity (e.g. `lead_ids`). Design "Event references" owns the rationale.

**`apps/demo/modules/workflows/workflow_config/installation/installation.yaml` and `.../onboarding/onboarding.yaml`:**

- Add `entity_ref_key: lead_ids` beside `entity_collection: leads-collection` (line 3 in both). The hard-error validator above breaks the demo build without this — landing it here keeps the build green until the Part 45 demo rebuild replaces these configs (task 20 is superseded; the rebuilt configs carry the field from authoring).

**`plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js`** (task 10 amendment, cosmetic):

- Fix the stale `now` docstring (`planActionTransition.js:54`): it says "(status[].created; created/updated on inserts)" but the contract (and the code at lines 126/134) stamps `updated` on **both** operations — update to match the task-10 wording: written to `status[].created` and to the doc's `updated` on both operations, plus `created` for inserts.

## Acceptance Criteria

- `makeWorkflowsConfig` hard-errors on a workflow config missing `entity_ref_key` (and on an empty string), with a message naming the field and its purpose; a valid config passes `entity_ref_key` through to the normalized output (it appears in the resolver result, proving the `WORKFLOW_FIELDS` addition).
- `schema.js` workflow shape lists `entity_ref_key` in the description and `required`.
- Demo `installation.yaml` and `onboarding.yaml` carry `entity_ref_key: lead_ids`; the demo build passes.
- `planActionTransition.js` docstring matches the both-operations `updated` stamp behaviour.
- Tests: `makeWorkflowsConfig.test.js` covers missing / empty / valid `entity_ref_key` (valid case asserts passthrough). Existing fixtures updated to include the field so unrelated tests stay green.
