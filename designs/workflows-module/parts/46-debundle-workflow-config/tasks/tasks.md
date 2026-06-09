# Implementation Tasks — Part 46: Debundle workflow config + consolidate action reads server-side

## Overview

These tasks implement Part 46 (`designs/workflows-module/parts/46-debundle-workflow-config/design.md`):
move all runtime config reads and client-side access/visibility computation into
the `WorkflowAPI` engine connection via five new read methods, delete every
client config embed and the client verb mirror, and port the verb/link/timeline
policy into one plugin-JS implementation.

> **Naming note (verified against the repo):** this part **renames** the
> detail-read request `get_action` → `get_workflow_action` (design intro line 9,
> D8 — "a workflow action, not any action"). The current repo file is
> `modules/workflows/requests/get_action.yaml` (id `get_action`), consumed by the
> detail pages/templates as `_request: get_action`. Task 7 renames the file/id to
> `requests/get_workflow_action.yaml` (id `get_workflow_action`); task 10 updates
> every `_request: get_action` read on the detail surfaces to
> `_request: get_workflow_action`. `GetWorkflowAction` is the new engine _method_
> name (the method the renamed request routes to).

## Tasks

| #   | File                                       | Summary                                                                                                                                | Depends On   |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | `01-connection-user-entities-plumbing.md`  | Declare `user` + `entities` + `eventsCollection` connection props; read `connection.user` in `createEngineContext` (fixes submit gate) | —            |
| 2   | `02-port-access-link-button-policy.md`     | Port the `allowed` bag, link collapse, and per-signal button resolution into plugin JS                                                 | —            |
| 3   | `03-validated-config-additions.md`         | `makeWorkflowsConfig`: add `title`, compute `form_meta`, validate `allow_not_required`                                                 | —            |
| 4   | `04-overview-read-methods.md`              | Three overview methods (`GetEntityWorkflows`/`GetWorkflowOverview`/`GetWorkflowActionGroupOverview`)                                   | 1, 2, 3      |
| 5   | `05-get-workflow-action-method.md`         | `GetWorkflowAction`: curated envelope + `allowed` + `buttons` + null guards                                                            | 1, 2, 3      |
| 6   | `06-get-events-timeline-method.md`         | `GetEventsTimeline`: cross-stream events + action enrichment (ported timeline lookup)                                                  | 1, 2         |
| 7   | `07-rewire-endpoints-to-methods.md`        | Route the 3 overview endpoints to methods; rename `get_action`→`get_workflow_action` + route it; add timeline request                  | 4, 5, 6      |
| 8   | `08-overview-pages-render-dumb.md`         | Rewrite `workflow-overview` / `workflow-group-overview` to render from the responses                                                   | 7            |
| 9   | `09-actions-on-entity-render-dumb.md`      | Rewrite `actions-on-entity` group display to render from the response                                                                  | 7            |
| 10  | `10-action-detail-surfaces-rewrite.md`     | Rewrite form templates + detail pages: AND `buttons`, read `allowed`, drop the client mirror                                           | 7            |
| 11  | `11-events-timeline-surface-migration.md`  | New workflows timeline surface using `GetEventsTimeline`; migrate demo; drop events splice                                             | 7            |
| 12  | `12-cleanup-shared-stages-and-manifest.md` | Delete the three shared YAML stages + filter + tests; clean manifest exports; verify build                                             | 8, 9, 10, 11 |

## Ordering Rationale

Three independent foundations come first and can run in parallel:

- **Task 1** repairs the user-threading seam (`connection.user`) — required by every
  read method's verb gate _and_ a latent fix for the shipped submit gate. It also
  declares the three new top-level connection schema properties (`user`,
  `entities`, `eventsCollection`).
- **Task 2** ports the verb/link/button policy into plugin JS — the "one
  implementation" the design centers on. Every read method consumes it.
- **Task 3** extends the validated config (`title`, `form_meta`, `allow_not_required`)
  so the methods have display data + the not-required flag to resolve.

The **read methods (4, 5, 6)** build on all three foundations. They are split by
shape: the three overview methods share one structure (4); `GetWorkflowAction`
adds button resolution + the curated envelope + read-auth null guards (5);
`GetEventsTimeline` is cross-stream and reads events itself (6, depends only on
1+2 — it doesn't need `form_meta`).

**Task 7** rewires the module's endpoints/requests to call the methods — the seam
between server and client. Everything client-side (8–11) depends on it because
the response shapes change here. These four client tasks are independent of each
other and can run in parallel:

- 8 — the two full overview pages
- 9 — the entity-embedded action steps
- 10 — the action detail surfaces (form templates + static detail pages)
- 11 — the events timeline surface + demo + events-module splice removal

**Task 12** is the final consolidation: only once all consumers are migrated can
the three shared YAML stages, the `visible_verbs_filter`, their tests, and the
orphaned manifest exports be deleted, and the full build + test suite verified.

## Scope

**Source:** `designs/workflows-module/parts/46-debundle-workflow-config/design.md`
**Context files considered:** none (the design folder contains only `design.md` and a `review/` folder).
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/consistency-1.md`, `review/consistency-2.md`, `review/todo-discuss.md`.
