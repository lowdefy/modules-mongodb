---
title: Indexes
module: workflows
type: reference
concepts: [indexes, mongodb, actions, workflows, validator]
---

# Workflows — Indexes

The module does not create indexes — index creation is a host-app concern. Host apps must add the following indexes to the collections backing the `actions-collection` and `workflows-collection` connections.

## `actions` collection

### Index: `{ workflow_id: 1 }` — non-partial

Serves every workflow-stream read:

| Query site                  | Operation                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `get-workflow-overview`     | `$lookup foreignField: workflow_id` on every workflow overview load                                                  |
| `get-action-group-overview` | `$lookup foreignField: workflow_id` with sub-pipeline filter on `action_group` on every group overview load          |
| `get-entity-workflows`      | `$lookup foreignField: workflow_id` once per workflow on every entity page render                                    |
| Engine load phase           | `find({ workflow_id })` in every handler's load phase (submit, start, cancel, close, and each tracker-cascade level) |

**Keep it non-partial.** The future tasks module writes `kind: task` adhoc docs with `workflow_id: null`. A non-partial index includes those null entries, costs nothing for workflow-stream queries (which all filter by a concrete workflow `_id`), and stays usable for future tasks-module queries that join on `workflow_id`. Do not "optimise" it into a partial index filtered on `workflow_id` existing — that would silently break tasks-module queries that share this index path.

## `workflows` collection

### Index: `{ entity_collection: 1, entity_id: 1 }` — non-partial

Serves the entity workflow list:

| Query site             | Operation                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `get-entity-workflows` | `$match: { entity_collection, entity_id }` then `$sort: { display_order: 1, created.timestamp: -1 }` on every entity page render |

The compound index matches the equality prefix exactly. Per-entity workflow counts are small (single-digit rows in typical apps), so the post-match in-memory sort on `display_order` + `created.timestamp` is inexpensive.

## `actions` validator constraint

The `actions` collection must remain free of any collection-level required-field **validator** beyond the always-present `_id`, `kind`, `status`, `change_stamp`. The shipped `connections/actions-collection.yaml` carries no `validator:` block — keep it that way.

The future tasks module writes `kind: task` adhoc docs with `workflow_id: null` and no `type`; a MongoDB collection validator enforcing workflow-shaped fields would block that write path. Field-level invariants, if ever needed, belong in the write APIs, not a collection validator.
