# Task 3: Add `workflow_id` and optional `entity_link.name` to the GetWorkflowAction envelope

## Context

`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`
returns a curated, allowlisted envelope for the action detail pages. Two header
deep-links in Part 56 need data the envelope does not carry today:

1. **Workflow breadcrumb link (D9)** — the Workflow segment links to
   `workflow-overview?workflow_id=…`. `action.workflow_id` exists on the doc
   (it drives the workflow lookup at `:162`) but is **omitted from the response
   allowlist** (`:233–260`). Add it.

2. **Entity instance name (D10)** — `entity_link` (built ~`:217–227`) carries
   `{ pageId, urlQuery, title }`, where `title` is the entity **type** label. The
   specific instance **name** ("Acme Corp") is not on the response. Part 56 adds
   an **opt-in** `name_field` (a dot-path) on the workflow's `entity:` block; when
   set, resolve the value and attach it as `entity_link.name`, so the breadcrumb
   can render "{type} · {name}". When unset, `entity_link.name` is null and **no
   extra query fires**.

This task assumes **Part 57** has landed: the per-workflow `entity:` block is the
source of the routing fields, so `entity_link` is built from `wfConfig.entity`
(resolved by `action.workflow_type` at `:147`), and `name_field` lives at
`wfConfig.entity.name_field`. (Validation of `name_field` is Task 4.)

## Task

1. **Add `workflow_id` to the envelope.** In the return object (`:233–260`), add
   `workflow_id: action.workflow_id` to the allowlist. Update the envelope
   JSDoc comment block (`:18–27`) to list it.

2. **Resolve `entity_link.name` from `entity.name_field` (null-safe, opt-in).**
   When `wfConfig.entity?.name_field` is a non-empty string and `entity_link` is
   non-null, run one lightweight projected `findOne` on the entity collection
   (`action.entity_collection`) by `_id: action.entity_id`, projecting only the
   `name_field` dot-path. Read the value at that dot-path from the result and set
   `entity_link.name` to it (or `null` if missing). When `name_field` is unset,
   set `entity_link.name = null` and skip the query entirely. Use the existing
   `findDocs` helper (as the other reads in this file do). Guard so a missing
   entity doc or missing field yields `name: null`, never throws.

3. Update the inline comment near the `entity_link` construction to note the new
   optional `name` field and its gating.

## Acceptance Criteria

- The response carries `workflow_id` (the action's `workflow_id`).
- With `wfConfig.entity.name_field` set, `entity_link.name` holds the projected
  field value (dot-path resolved), and a single projected `findOne` fires.
- With `name_field` unset, `entity_link.name` is `null` and **no** entity query
  fires (assert via the mongo mock call count in the test).
- Unconfigured / de-configured workflows are unaffected: `entity_link` null →
  no name resolution; `workflow_id` still present.
- `GetWorkflowAction.test.js` covers: `workflow_id` present; `name` resolved when
  `name_field` set; `name` null + no query when unset.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — modify — add `workflow_id`; resolve optional `entity_link.name` from `wfConfig.entity.name_field`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.test.js` — modify — add `workflow_id`, `entity_link.name` set/unset cases.

## Notes

- **No connection `schema.js` change.** `name_field` rides through the workflow's
  `entity:` block into the `additionalProperties: true` `workflowsConfig`
  (`schema.js:87,100`), so no strict-schema entry is needed.
- **`wfConfig.entity.name_field` presence depends on Task 4.** Part 57's resolver
  lifts `entity.collection`/`entity.ref_key` to flat names and carries the routing
  remainder; Task 4 ensures that carry preserves `name_field` (wholesale, not
  whitelisted) so this read resolves. If `wfConfig.entity.name_field` is undefined
  at runtime, that carry is the thing to check.
- Depends on Part 57's `entity:` block. If, when implementing, `GetWorkflowAction`
  still reads `connection.entities[...]` (Part 57 not yet merged), coordinate:
  the `name_field` source is `wfConfig.entity.name_field` per the design — do not
  re-introduce a connection-level `entities` read.
- Keep `entity_link` shape otherwise unchanged (`pageId`, `urlQuery`, `title`);
  `name` is purely additive.
- Future cleanup (out of scope): a shared `buildEntityLink` helper across the
  envelope builders if `GetEntityWorkflows`/`GetWorkflowOverview` later need the
  name too.
