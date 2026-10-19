# Implementation Tasks — Part 03: Engine Plugin Shell

## Overview

These tasks make `@lowdefy/modules-mongodb-plugins` dual-runtime (client blocks + server connections) and land the `WorkflowAPI` connection scaffold with a stub-handler dispatcher, the community-plugin-backed Mongo helper, document schemas, and the shared utility placeholders consumed by parts 5+. No request handlers ship in this part — all dispatcher entry points throw `"not implemented: <handler>"`. Derived from `designs/workflows-module/parts/03-engine-plugin-shell/design.md`.

> The Mongo helper was originally specced as a raw-driver `{ client, workflowsCollection, actionsCollection }` shape with runtime index assertions (per [engine review-1](../../../workflows-module-concept/engine/review/review-1.md)). It now wraps `@lowdefy/community-plugin-mongodb`'s `MongoDBCollection.requests` instead — see [engine review-2](../../../workflows-module-concept/engine/review/review-2.md) for rationale. Indexes are documented as consumer-owned (matching every other module in the repo), not runtime-asserted.

## Tasks

| #   | File                                     | Summary                                                                                                              | Depends On |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-dual-runtime-build.md`               | Split `src/blocks` vs `src/connections`, add `connections.js` + `types.js` registration, bump pkg, ensure dist split | —          |
| 2   | `02-document-schemas.md`                 | Commit workflow + action JSDoc types + status-history shape under `src/connections/shared/types.js`                  | 1          |
| 3   | `03-shared-mongodb-connection.md`        | Implement `createMongoDBConnection` as a per-collection dispatcher over `MongoDBCollection.requests`                 | 1, 2       |
| 4   | `04-shared-utility-placeholders.md`      | Stub `getActions.js`, `getActionFields.js`, `populateIds.js` against the dispatcher                                  | 2, 3       |
| 5   | `05-workflow-api-connection-scaffold.md` | Connection schema + request-type dispatcher with `"not implemented"` handler stubs                                   | 1, 2, 3    |

## Ordering Rationale

Task 1 is the load-bearing foundation: until `src/connections/` builds to `dist/connections/` and `types.js` exposes the `connections` / `requests` arrays, nothing the plugin produces is loadable as a server-side connection. Task 2 commits the document shape contracts as JSDoc — it's pure types, has no runtime, and unblocks both the connection helper and the utility stubs that document their inputs/outputs against those typedefs.

Task 3 lands the community-plugin dispatcher (`createMongoDBConnection`). Task 4 layers the three utility helpers (`getActions`, `getActionFields`, `populateIds`) on top of it — they're thin pass-throughs that take the dispatcher as their first argument.

Task 5 lands the dispatcher itself: the connection's `requests` map of `{ SubmitWorkflowAction, StartWorkflow, CancelWorkflow }` each pointing at a stub that throws `"not implemented: <handler>"`. This is the seam parts 5, 6, 7, 8, 9, 10, 11 plug their real handlers into.

End-to-end verification (wiring the connection into a real Lowdefy build, clicking through the stubs) was originally task 6 (`fixture-app-verification`); it's been dropped. The plugin build itself is the verification surface for part 03 — the `WorkflowAPINotImplemented` stubs ship as the seam parts 5/6 plug into, and the dispatcher-shape correctness gets exercised end-to-end by those parts' real handler implementations against real entity workflows. Adding a temporary fixture app to verify a dispatcher that will be exercised by real code one part later is overhead, not coverage.

Tasks 4 and 5 can run in parallel after task 3.

## Scope

**Source:** `designs/workflows-module/parts/03-engine-plugin-shell/design.md`
**Context files considered:**

- `designs/workflows-module-concept/engine/spec.md` (source rationale linked from design)
- `designs/workflows-module-concept/call-api/spec.md` (handler context shape consumers will rely on later)
- `CLAUDE.md` (module-system + plugin conventions)
- `docs/idioms.md` (cross-cutting patterns)
- `modules/events/module.lowdefy.yaml`, `modules/events/connections/events-collection.yaml`, `modules/events/api/new-event.yaml` (closest analogue for connection + change_stamp wiring)
- `plugins/modules-mongodb-plugins/package.json`, `src/types.js`, `src/blocks.js`, `src/actions.js`, `src/metas.js`, `.swcrc` (current plugin layout)
- `apps/demo/lowdefy.yaml`, `apps/demo/modules.yaml` (workspace + plugin wiring pattern)

**Review files skipped:** none (no review/ subfolder in this part)
