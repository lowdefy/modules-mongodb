# Engine Review 2 — Client model: walk back review-1's raw-driver shape

**Status:** Resolved. Engine spec + design updated. Part 03 of the implementation design is refactored.

**Context.** Review-1 settled the engine's "Client and transaction model" by committing to a single-`MongoClient`-per-invocation raw-driver shape — handlers open one `MongoClient`, thread `ctx = { client, workflowsCollection, actionsCollection }` through every sub-step, close on exit. That resolution was correct against the design as it stood at the time: it removed an internally-inconsistent multi-client model and gave a clear seam for a future `session.withTransaction(...)` opt-in.

This review walks that resolution back. The engine now delegates every Mongo read/write to `@lowdefy/community-plugin-mongodb`'s `MongoDBCollection` handlers via a thin per-collection dispatcher (`createMongoDBConnection(lowdefyContext)('actions').MongoDBFindOne(...)`-style). The dispatcher is built once per handler invocation from the Lowdefy request context.

## Why the change

1. **Prior-generation engine code is dispatcher-shaped and reusable.** A complete previous-generation `WorkflowAPI` implementation exists under `plugins/modules-mongodb-plugins/src/connections/old/` — `StartWorkflow`, `UpdateWorkflowActions`, `CloseWorkflowActions`, plus the supporting `shouldCreate` / `shouldUpdate` / `getCurrentAction` / `createAction` / `updateAction` utilities. All of it goes through `createMongoDBConnection(lowdefyContext)(<collection>).MongoDB<Op>(...)`. Rewriting it for the raw-driver shape would re-derive existing, tested code without changing observable behaviour.

2. **`changeLog` integration comes for free.** The `WorkflowAPI` connection config carries the same `changeLog: { collection, meta }` block as `events-collection.yaml` and every other write-bearing connection in this repo. Going through community-plugin handlers means every workflow + action mutation lands in the app's `log-changes` collection automatically — no per-handler code. The raw-driver approach would force the engine to either replicate `changeLog` semantics or accept that workflow writes don't show up in the change log alongside everything else.

3. **Alignment with every other module in the repo.** `events`, `contacts`, `companies`, `notifications`, `activities`, `user-admin`, `user-account` — all write through community-plugin handlers. The raw-driver approach would have made workflows the only module with a different Mongo posture. The dispatcher shape keeps workflows consistent with the rest of the codebase.

4. **The transaction seam was already deferred.** Review-1's main argument for the raw-driver shape was that it preserved a future `session.withTransaction(...)` opt-in. But the concept design's deferred list (`spec.md`) already had MongoDB transactions in v1's "not-yet" bucket. The seam was theoretical — losing it costs nothing in v1.

5. **Indexes have an existing idiom.** Review-1's resolution had `createMongoDBConnection` assert the three engine-required indexes on first call. With the dispatcher approach that seam disappears, but the rest of the repo doesn't auto-assert indexes either — `activities`, `companies`, `notifications` all document required indexes prose-style in their READMEs and leave creation to the consumer's migration pipeline (the repo's `r:index-dev` skill ships templates). The workflows module follows the same convention: indexes documented in the module README; consumers create them via migrations.

## Trade-offs accepted

- **Each helper-issued request opens and closes its own `MongoClient`.** A single `SubmitWorkflowAction` invocation now issues N separate connect/close cycles instead of sharing one client across the call. Driver-side pooling makes this cheap in steady state but it is a real per-request cost. Acceptable — every other module in the repo accepts it; revisit only if a real consumer surfaces latency. Listed as a v1 risk in the spec.
- **Transactional opt-in path closes.** The community-plugin handlers don't expose sessions, so `session.withTransaction(...)` is unreachable. A future ACID path would require a parallel raw-driver helper alongside the dispatcher. v1 risk documented; mitigation is the existing "caller retry + periodic reconciliation" story that was already the v1 stance.
- **Indexes become a consumer-owned concern.** Drift risk if consumers skip the index step in their migration pipeline. Mitigation: required-indexes section in the workflows module README; flag in onboarding checklist.

## What changed in the docs

- [`engine/spec.md`](../spec.md) — `§ Connection structure` (helper descriptions), `§ Package shape` (drop `mongodb` direct dep, add `@lowdefy/community-plugin-mongodb` peerDep), `§ Client and transaction model` (full rewrite + back-reference to this review), `§ Indexes` (consumer-owned), `§ Tracker subscription` pseudo-code (dispatcher calls), `§ Risks` (connection-per-call, consumer-owned indexes).
- [`engine/design.md`](../design.md) — same set of sections plus Decision 3 pseudo-code + the worked-example ASCII trace + "Sequential writes + idempotent retry" rationale.
- [`concept/design.md`](../../design.md) — "No transactional atomicity in v1" risk paragraph.
- [`concept/spec.md`](../../spec.md) — "MongoDB transactions" entry under Deferred items.
- [Part 03 task 03 + task 04 designs](../../../workflows-module/parts/03-engine-plugin-shell/tasks/) — helper signatures, test strategy, removal of `assertIndexes`.

## What did not change

- The 11-step submit lifecycle, the priority rule, the universal-terminal exception, the `references` write contract, the tracker child-stage map, the idempotency guards, the per-call `eventId` audit, the schema, the action/workflow doc shapes, the access enforcement points, the action-groups model, the per-action endpoint contract — all unchanged. This review is strictly about the **medium** through which the engine talks to Mongo. The shape of the engine's behaviour is the same.
