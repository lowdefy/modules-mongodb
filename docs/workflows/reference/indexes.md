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

### Index: `{ "entity.connection_id": 1, "entity.id": 1 }` — non-partial

Serves the entity workflow list (the entity pointer is a nested `entity` object; MongoDB indexes the dotted sub-fields identically to top-level fields):

| Query site             | Operation                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-entity-workflows` | `$match: { "entity.connection_id", "entity.id" }` then `$sort: { display_order: 1, created.timestamp: -1 }` on every entity page render |

The compound index matches the equality prefix exactly. Per-entity workflow counts are small (single-digit rows in typical apps), so the post-match in-memory sort on `display_order` + `created.timestamp` is inexpensive.

## `log-events` collection

### Index: `{ action_ids: 1 }` — non-partial

Serves the changes-requested callout's request-changes comment lookup (the first reader to match the events collection by `action_ids` — the existing timeline reads match by `reference_field` / `reference_value`):

| Query site          | Operation                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GetWorkflowAction` | `find({ type: "action-request_changes", action_ids }, { sort: { date: -1 }, limit: 1 })` on each `changes-required` action-page load |

`action_ids` is highly selective — a single action has only a handful of events — so the leading-field match narrows to a tiny set and the residual `type` filter + `date` sort + `limit 1` run in-memory over a few docs (the same reasoning the `{ workflow_id: 1 }` entry uses for the `actions` collection). A plain `{ action_ids: 1 }` therefore suffices. Without **any** index on `action_ids`, this query is a collection scan on a perpetually-growing log on every changes-required page load — the failure mode this entry exists to prevent. (`log-events` is the collection backing the WorkflowAPI / EventsTimeline `eventsCollection`, default `"log-events"`.)

## `actions` validator constraint

The `actions` collection must remain free of any collection-level required-field **validator** beyond the always-present `_id`, `kind`, `status`, `change_stamp`. The shipped `connections/actions-collection.yaml` carries no `validator:` block — keep it that way.

The future tasks module writes `kind: task` adhoc docs with `workflow_id: null` and no `type`; a MongoDB collection validator enforcing workflow-shaped fields would block that write path. Field-level invariants, if ever needed, belong in the write APIs, not a collection validator.
