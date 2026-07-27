# Task 2: Workflow + action document schemas (JSDoc types)

## Context

The engine spec ([engine/spec.md § Schema](../../../workflows-module-concept/engine/spec.md#schema)) commits the on-disk shape of the workflow and action documents. Part 03's deliverable for this is to land these as **JSDoc typedefs** under `src/connections/shared/types.js` — committed in code so handlers (parts 5+), the shared connection helper (task 3), and the utility placeholders (task 4) can refer to them, and reviewers can verify the spec is reflected verbatim before runtime code lands.

These are pure typedefs. No runtime behaviour ships in this task.

The shape per the engine spec:

**Workflow doc**

- `_id` (string, server-generated)
- `workflow_type` (string)
- `key` (string | null) — optional partition key
- `display_order` (number)
- `entity_type` (string)
- `entity_id` (string)
- `entity_collection` (string) — collection connection id
- `parent_action_id` (string | null)
- `parent_entity_id` (string | null)
- `parent_entity_collection` (string | null)
- `status` (StatusEntry[]) — history, newest at index 0; `[{ stage, created, ... }]`
- `summary` (`{ done, not_required, total }`)
- `groups` (`{ id, status, summary }[]`) — empty in part 03; populated by part 7
- `form_data` (object) — initially `{}`
- `created`, `updated` (ChangeStamp) — per events module convention
- `<reference keys>` — spread from `references` payload (`company_ids`, `region_ids`, ...)

**Action doc**

- `_id` (string)
- `workflow_id` (string)
- `type` (string)
- `kind` (`'form' | 'task' | 'tracker'`)
- `key` (string | null)
- `status` (StatusEntry[])
- `entity_type`, `entity_id`, `entity_collection`
- `assignees` (string[])
- `due_date` (Date | null)
- `description` (string | null)
- `tracker` (`{ workflow_type } | null`)
- `child_workflow_id` (string | null)
- `child_entity_id` (string | null)
- `child_entity_collection` (string | null)
- `<reference keys>` — spread

**StatusEntry**

- `stage` (string) — e.g. `action-required`, `in-progress`, `done`, `not-required`, `error`
- `created` (ChangeStamp)
- Open shape — error entries also carry `reason`, `error_message`, `error_metadata?` per engine spec § "Action error transition".

**ChangeStamp** — `{ timestamp: Date, user: { id, name } }` per `modules/events/defaults/change_stamp.yaml`. Re-document inline; don't import from another module.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/types.js` with JSDoc typedefs for `WorkflowDoc`, `ActionDoc`, `StatusEntry`, `ChangeStamp`, plus `WorkflowKind` ('form' | 'task' | 'tracker') and `WorkflowGroupEntry`. The file exports an empty object so it can be imported for side-effect-free JSDoc resolution:

```js
// src/connections/shared/types.js

/**
 * @typedef {Object} ChangeStamp
 * @property {Date} timestamp
 * @property {{ id: string, name: string }} user
 */

/**
 * @typedef {Object} StatusEntry
 * @property {string} stage
 * @property {ChangeStamp} created
 * @property {string} [reason]
 * @property {string} [error_message]
 * @property {Object} [error_metadata]
 */

/**
 * @typedef {Object} WorkflowGroupEntry
 * @property {string} id
 * @property {'blocked' | 'in-progress' | 'done'} status
 * @property {{ done: number, not_required: number, total: number }} summary
 */

/**
 * @typedef {Object} WorkflowDoc
 * @property {string} _id
 * @property {string} workflow_type
 * @property {string | null} key
 * @property {number} display_order
 * @property {string} entity_type
 * @property {string} entity_id
 * @property {string} entity_collection
 * @property {string | null} parent_action_id
 * @property {string | null} parent_entity_id
 * @property {string | null} parent_entity_collection
 * @property {StatusEntry[]} status
 * @property {{ done: number, not_required: number, total: number }} summary
 * @property {WorkflowGroupEntry[]} groups
 * @property {Object} form_data
 * @property {ChangeStamp} created
 * @property {ChangeStamp} updated
 */

/**
 * @typedef {'form' | 'task' | 'tracker'} ActionKind
 */

/**
 * @typedef {Object} ActionDoc
 * @property {string} _id
 * @property {string} workflow_id
 * @property {string} type
 * @property {ActionKind} kind
 * @property {string | null} key
 * @property {StatusEntry[]} status
 * @property {string} entity_type
 * @property {string} entity_id
 * @property {string} entity_collection
 * @property {string[]} assignees
 * @property {Date | null} due_date
 * @property {string | null} description
 * @property {{ workflow_type: string } | null} tracker
 * @property {string | null} child_workflow_id
 * @property {string | null} child_entity_id
 * @property {string | null} child_entity_collection
 */

export {};
```

Add a short header comment at the top of the file linking back to the source spec — for example: `// Document shapes per designs/workflows-module-concept/engine/spec.md § Schema.`

## Acceptance Criteria

- File `plugins/modules-mongodb-plugins/src/connections/shared/types.js` exists and exports `{}`.
- All seven typedefs (`ChangeStamp`, `StatusEntry`, `WorkflowGroupEntry`, `WorkflowDoc`, `ActionKind`, `ActionDoc`, plus one combined header comment) are present and structurally match the schema table in [engine/spec.md § Schema](../../../workflows-module-concept/engine/spec.md#schema).
- `pnpm --filter @lowdefy/modules-mongodb-plugins build` succeeds — `dist/connections/shared/types.js` exists.
- No runtime imports / side effects; the file imports nothing.
- A quick IDE-side check: opening a sibling file in `src/connections/shared/` and adding `/** @type {import('./types.js').WorkflowDoc} */` resolves without error.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — create — JSDoc typedefs for workflow + action documents and supporting shapes.

## Notes

- `groups` is **declared but empty** at this stage. Part 7 (`group-state-machine`) is responsible for populating it; this part just commits the schema slot so it doesn't need to be re-shaped later.
- The `<reference keys>` spread (e.g. `company_ids`, `region_ids`) is intentionally **not** part of the JSDoc shape — reference keys are app-supplied and arbitrary. The engine treats them via `Object.spread` at write time; locking them into the typedef would over-constrain.
- Do **not** import the events module's `change_stamp` template here. The template is a runtime operator template, not a static shape — the JSDoc inlines the resolved shape (`{ timestamp, user }`).
- Mongo's BSON `Date` is typed as JS `Date` in JSDoc. Don't reach for `mongodb.Date` — the engine reads/writes plain JS Date instances.
