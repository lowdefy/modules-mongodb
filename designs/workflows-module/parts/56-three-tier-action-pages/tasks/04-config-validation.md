# Task 4: Validate `entity_view.slot` and optional `entity.name_field`

## Context

`modules/workflows/resolvers/makeWorkflowsConfig.js` validates and materializes
the workflow config the engine/connection consume. Two Part 56 additions to the
workflow grammar are UI-only / opt-in and need build-time validation here:

- **`entity_view` (proposed change 5, D2).** A new optional, read-only block on
  the workflow carrying `{ slot }` — a block array (typically a single `_ref`)
  rendered as the Details tab (form) / middle (check). It is **build-time UI
  only**: it must **never** reach the materialized engine config. It already
  won't — the `pick(workflow, WORKFLOW_FIELDS)` allowlist (~`:104–109,770`) omits
  it, so no strip is needed. The work is **validation**: confirm `entity_view`,
  when present, is an object whose `slot` is a block ref (an object/array, the
  shape Lowdefy `_ref`-resolves).

- **`entity.name_field` (D10).** An optional dot-path string on the workflow's
  `entity:` block (the block **Part 57** introduces and already validates here).
  When present it must be a non-empty string. `GetWorkflowAction` (Task 3) reads
  it to resolve the breadcrumb instance name.

The existing validators to slot alongside: `validateWorkflow` (~`:573`),
`validateAction` (~`:499`), `validateWorkflowEvent` (~`:551`). Under **Part 57**
the entity required-checks move onto the nested block — `entity.collection` and
`entity.ref_key` are required-checked by Part 57's `entity:`-block validation in
`validateWorkflow` (replacing today's flat `entity_ref_key` check at `~:582`),
and `entity.ref_key` (lifted to the flat `entity_ref_key`) is reused unchanged for
History — do not touch it. The workflow-grammar `title` field (D9's
breadcrumb/eyebrow label) already exists and is validated (~`:33,591`) — no change.

## Task

1. Add an `entity_view` check to `validateWorkflow` (or a small helper it calls):
   when `workflow.entity_view` is present, require it to be an object and require
   `entity_view.slot` to be a non-null block ref (object or array). Fail the
   build with a precise message, e.g.
   `workflow "<type>": "entity_view" must be an object with a "slot" block ref`.
   When absent, no error.

2. Add the optional `entity.name_field` validation **alongside Part 57's existing
   `entity:`-block validation** (in the same `validateWorkflow` path Part 57
   added): when `workflow.entity.name_field` is present, require a non-empty
   string; fail with a precise message otherwise. When absent, no error. Do not
   add a separate connection-`schema.js` layer (D10 — it rides the
   `additionalProperties: true` workflowsConfig).

3. Confirm (no code change expected) that `entity_view` is **not** in
   `WORKFLOW_FIELDS` and therefore does not appear in the materialized config;
   add/extend a test asserting it is absent from the resolver output.

4. **Ensure `name_field` survives into the materialized `entity` block.** Part 57's
   resolver lifts `entity.collection`/`entity.ref_key` to the flat names and carries
   the *routing remainder* of the `entity:` block into the materialized `entity`
   object. For `GetWorkflowAction` (Task 3) to read `wfConfig.entity.name_field`,
   that remainder must be carried **wholesale** — not whitelisted to only
   `page_id`/`id_query_key`/`title`. Verify Part 57's carry preserves `name_field`
   (and adjust it if it whitelists); add a test asserting `name_field` appears on
   the materialized `entity` block when authored.

## Acceptance Criteria

- A workflow with a valid `entity_view: { slot: { _ref: … } }` validates and the
  resolver output contains **no** `entity_view` key.
- A workflow with `entity_view` missing `slot` (or `slot` not a block ref) fails
  the build with a clear message.
- A workflow with `entity.name_field` set to a non-empty string validates; set to
  a non-string / empty fails with a clear message; omitted validates.
- When `entity.name_field` is authored, it is present on the materialized
  `entity` block in the resolver output (carried through Part 57's lift, not
  dropped).
- `makeWorkflowsConfig.test.js` covers all of the above.
- `pnpm jest` passes for `makeWorkflowsConfig.test.js`.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — add `entity_view` slot validation and optional `entity.name_field` validation.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — add validation + materialized-exclusion tests.

## Notes

- This is the validation Part 4 owns (per the design's "Files changed").
- Depends on Part 57 having added the `entity:` block validation; `name_field`
  validation extends that block's checks rather than introducing a new one.
- Do not validate the *contents* of the `slot` block tree — only that `slot` is a
  block ref. The block tree is resolved by the build walker when baked into pages
  (Task 10).
