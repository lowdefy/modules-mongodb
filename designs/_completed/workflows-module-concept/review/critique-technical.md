# Technical Concerns — Workflows Module

Reviewer notes on infrastructure/plumbing concerns in the workflows-module-concept design. Each section is a concern plus a recommendation rooted in how comparable systems (Temporal, Camunda, transactional outbox pattern, MongoDB SDK conventions) handle the same problem.

## 1. Transactional atomicity

**Concern.** A single `SubmitWorkflowAction` invocation writes: action transitions, workflow `summary`, `groups[]`, `form_data`, log event, notification dispatch, group `on_complete` fan-out, tracker subscription (potentially recursive), post-hook. None of this is wrapped in a transaction.

The design accepts "caller retry converges to the same end state via idempotency guards." This works for _pure_ retry shapes (network failure mid-call, user clicks twice). It does **not** cover:

- Hook fired but engine write failed → user resubmits, hook fires again (duplicate Slack message, duplicate billing event).
- Engine write succeeded but log event write failed → no audit record exists for a state change that did happen.
- Group `on_complete` is acknowledged in design (action-groups Risks): "if `SubmitWorkflowAction` retries after step 2 succeeded but before step 11 ran, the hook is missed entirely."

**Recommendations.**

- **MongoDB sessions/transactions for the core write batch.** Action transitions + `summary` + `groups[]` + `form_data` in one `withTransaction` block. The community-plugin dispatcher doesn't expose sessions; a parallel raw-driver helper for engine-internal writes is the right path. The cost is one helper + one shared `MongoClient`; the win is atomicity across the writes that are most coupled.
- **Transactional outbox for side effects.** Log event, notifications, group `on_complete`, tracker subscription emit rows to an `outbox` collection _inside_ the same transaction as the writes that produced them. A separate worker drains the outbox with retries. This is the standard transactional outbox pattern; it gives you exactly-once-delivery semantics without distributed transactions.
- **`submit_id` on every write.** Caller-supplied or engine-generated UUID. The outbox consumer keys on `submit_id` for deduplication; the engine's idempotency check on retry compares `submit_id` to detect "this submit already wrote, return the cached result."

## 2. Connection pooling

**Concern.** The community-plugin `MongoDBCollection` opens a fresh `MongoClient` per request and closes it in a `finally` block. A single submit invokes many community-plugin handlers — action reads, action writes, workflow doc update, log event write, notification dispatch. Each is a separate client lifecycle.

The design notes "driver-side pooling makes this cheap." The MongoDB Node driver pools connections _within_ a `MongoClient` instance. Opening a fresh `MongoClient` per request **bypasses** the pool — each one establishes new connections, performs handshakes/auth, and tears down on close. Pooling is an in-process concept tied to the client object's lifetime.

**Recommendations.**

- **Reuse one `MongoClient` per engine handler invocation.** Build it once at `SubmitWorkflowAction` entry, pass through `context`, close at handler exit. This was proposed in engine review-1 then walked back in review-2 for dispatcher-alignment reasons — worth revisiting if performance becomes a real concern.
- **Module-level cached client.** Lowdefy plugin handlers are long-running processes. A module-scoped `MongoClient` (built once on plugin load) with the pool reused across invocations is the standard MongoDB SDK pattern. The community plugin's "fresh client per request" posture is itself worth re-examining at the platform layer.

## 3. Synchronous tracker subscription

**Concern.** When a child workflow completes, the engine synchronously recurses into the parent's tracker action update, which may auto-complete the parent, which fires the grandparent's tracker, up to depth 10. All on the user's submit thread.

For a 3-level nest: 3× the writes, 3× the side effects, 3× the log events, all sequential, all on one call's latency budget. Concurrent submissions on the same parent workflow risk write conflicts on the workflow doc (`summary`, `groups[]` denormalisations).

**Recommendations.**

- **Move tracker propagation to the outbox** (see point 1). When a workflow status changes, the engine emits a `tracker_event` to the outbox. A worker reads the event, looks up the parent tracker action, fires `SubmitWorkflowAction` against it. Parent updates run on their own thread, with their own retry budget, with their own log events.
- **Idempotency key for cascading writes.** Each tracker event carries the `submit_id` of the original transition; the worker writes a "processed" marker so a retried event doesn't double-fire.

This decouples parent latency from child completion latency and lets you scale tracker depth without compounding submit time.

## 4. Recursive plugin → API → plugin via `callApi`

**Concern.** The `context.callApi` primitive lets a plugin handler invoke a Lowdefy API endpoint, which itself is implemented by a plugin handler. Group `on_complete` fan-out, pre/post hooks, log events, notifications all use this. Depth-limited at 10.

This is a recursive cross-layer call: plugin (JS) → API resolver (YAML routine) → plugin (JS) → … . Concerns:

- Stack and resource consumption — each level holds open Mongo clients, the call context, the request object.
- Tracing/observability — a 5-level deep failure is hard to root-cause without explicit correlation IDs.
- Synchronous coupling — a slow hook blocks the whole submit chain.

**Recommendations.**

- **Same outbox treatment for post-write effects.** Pre-hook stays synchronous (it can abort the submit). Post-hook, log event, notification, group `on_complete` all run _after_ the engine writes commit — push them to the outbox and run asynchronously.
- **Correlation ID threaded through every callApi.** The engine generates a `correlation_id` on entry; every nested call inherits it; logs and events carry it. This is table stakes once you have callApi recursion.
- **Document the depth limit's user-facing behaviour.** When the limit trips, what does the user see? "Workflow misconfigured" with a structured error citing the chain? Decide and ship.

## 5. Reconciliation job (referenced everywhere, designed nowhere)

**Concern.** The design references "periodic reconciliation" as the catch-all for:

- `summary` drift after partial writes (engine Risks).
- `groups[]` drift on direct DB writes (action-groups Decision 4).
- Missing tracker updates after partial-write failures (engine Failure-mode story).
- Missing `on_complete` hooks on retry-and-no-op (action-groups Risks).
- Bidirectional parent↔child pointer half-writes (engine Tracker subscription).

This job is load-bearing for the design's correctness story. It does not exist as a designed artifact.

**Recommendation.** Design and ship a reconciliation job as a v1 deliverable, not a deferred follow-up. Minimum:

- Scan workflows with terminal child workflows whose trackers aren't terminal.
- Scan `groups[]` for workflows whose action state contradicts the persisted group state.
- Scan workflows in terminal stages with non-terminal actions.
- Scan for half-broken parent↔child pointers.

Ship as a Lambda or scheduled job in the module package. Until this exists, the "we accept the drift" position has no recovery path.

## 6. Workflow definition versioning

**Concern.** The design has no notion of definition version. When `onboarding.yaml` is edited (add an action, change `blocked_by`, rename a status_map key), what happens to in-flight onboarding instances?

Today: nothing. The instance has whatever action docs it had at start. New actions on the definition won't have action docs in the instance. `auto-complete` evaluates against the current action docs only, so it appears to work — until an author references a new action in `blocked_by` and the engine evaluates against an in-flight instance that has no such action.

Industry standard (Camunda, Flowable, Temporal): each instance pins to the definition version at start; new instances use the new version; migrating in-flight instances is an explicit operation.

### Chosen approach: latest-wins + data migrations

**Decision.** In-flight instances evaluate against the current definition at all times. When a definition change affects in-flight instances, ship a data migration alongside the YAML change to bring instance docs into line with the new definition.

This is the right call at the project's scale — pinned-version models pay overhead (definition stores, version-aware lookups, migration APIs) that only earns its keep when there are many concurrent in-flight instances of long-running workflows.

**Recommendations to make this robust:**

- **Stamp `definition_hash` on each workflow instance at `start-workflow`.** Content hash of the resolved workflow definition. Cheap, write-once, never read by the engine at runtime. Buys drift detection: an admin view / health check lists instances whose `definition_hash` doesn't match the current definition's hash — your "are migrations needed?" report.
- **Stamp the resolved action-type list on the workflow doc at start** (`declared_action_types: [...]`). The minimum schema-level pinning. Lets migrations precisely identify what's missing vs current definition.
- **Co-locate migrations with the workflow YAML change in the same PR.** Splice migrations pattern. Repo convention enforced by review.
- **Document a change-type taxonomy in the design** (display-only / additive / behaviour-changing / structural) so PR reviewers have a checklist for "does this need a migration?" — see the conversation thread that produced this doc for the canonical table.
- **Idempotent migrations with a marker.** Each migration writes `migrations_applied: [migration_id, ...]` on touched instance docs; re-runs are no-ops.
- **Pre-deploy script.** "What would this change affect?" Count in-flight instances by `workflow_type`, hash-diff the definition, output the taxonomy bucket. Optional CI gate that fails the build if a definition changed without a migration or `no_migration_required` annotation.
- **Decide policy on completed instances.** Default: historical record stays as it was when the workflow ran; migrations operate on in-flight only.

**What this approach gives up:**

- Multiple definition versions can't coexist. Every in-flight instance evaluates against the latest.
- Rollback is "deploy old YAML + run inverse migration" — not a one-button operation.
- Long-running workflows accumulate migration debt over their lifetime.
- A/B testing workflow variants requires two workflow types, not two versions.

### Alternative: Camunda-style version pinning

For reference: how full version pinning would work in this codebase, and why it doesn't fit cleanly.

**Shape it would take.**

- **Definition store.** New MongoDB collection `workflow_definitions`, one doc per `(workflow_type, version)`. Holds the resolved definition — actions, `blocked_by` graph, `action_groups`, `status_map`, hook ids, access rules, transitions table (if FSM lands).
- **Deploy step.** When workflow YAML changes, the deploy pipeline writes a new doc to `workflow_definitions` with an auto-incremented version. Old versions stay; new instances pick up the highest version.
- **Instance pinning.** Workflow doc carries `workflow_definition_version: N`. Set at `start-workflow`, never changed except by explicit migration.
- **Runtime resolution.** Every `SubmitWorkflowAction` and `get-entity-workflows` reads the definition by `(workflow_type, workflow_definition_version)` from the store (cache in memory by version key). Replaces the current "read from `connection.workflowsConfig` global" path.
- **Migration API.** New module endpoint or admin tool: `migrate-workflow-instance(workflow_id, target_version, action_mapping)`. Validates the mapping (old action_type → new action_type), rewrites the instance's action docs, increments `workflow_definition_version`. Dry-run mode for safety.

**Where it fights the architecture.**

- **Build-time page generation.** `makeActionPages` emits one page per `(workflow_type, action_type, verb)` at build time. With versioning, every in-flight version's pages must exist simultaneously — so you'd need `(workflow_type, version, action_type, verb)` pages, proliferating page count by N versions. Either accept the proliferation, or move page schema to runtime resolution (form schema, status_map, button bar all read the pinned version's definition at render time). The latter is a major architecture shift — `makeActionsForm` recursion, `makeActionFormConfigs`, all the resolver pipeline becomes runtime-evaluated.
- **Build-time API generation.** `makeWorkflowApis` emits one `update-action-{action_type}` endpoint per action with hooks, `event_overrides`, and `interactions` baked in as build-time literals. With versioning, hooks for an old version may reference Lowdefy Apis the new build doesn't ship. Either pin Api content too (impractical), commit to "deployed Apis are append-only" (practical), or generate per-version endpoints (proliferation again).
- **Hook references.** `action.hooks.submit_edit.pre: qualify-pre-submit` is a Lowdefy Api ID. The Api is built and deployed from the current YAML. If an in-flight instance pinned to v1 expects `qualify-pre-submit-v1` and the current deploy only ships `qualify-pre-submit` (now v3 internally), the instance is referencing an Api whose behaviour has changed. Camunda doesn't have this problem because BPMN script tasks are inline in the definition; here, hooks are external Apis.
- **Form components library.** `components/fields/` substitutions run at build time. A v1 instance whose form uses `text_input` resolves against the current `text_input` component. If the component's vars change, old instances may break. Either pin component versions too, or commit to additive-only component changes.

**A pragmatic hybrid: per-instance definition snapshot.**

If you ever wanted _some_ of the version-pinning benefit without the full architecture shift:

- At `start-workflow`, snapshot the resolved definition (just the behavioural bits — actions list, `blocked_by`, `action_groups`, `status_map`, interaction → status table, hook ids) onto the workflow doc under `definition_snapshot: {...}`.
- Engine reads `definition_snapshot` instead of the live `workflowsConfig` for submit-time decisions on this instance.
- Pages stay generated from the current definition (no proliferation). Page renders read instance state from `definition_snapshot` for stale-tolerant display.
- Hooks: commit to additive-only Api changes (deployed hook Apis never have breaking changes; new behaviour goes in new Api IDs).
- Migration becomes "rewrite `definition_snapshot` on selected instances" — same migration discipline as the latest-wins approach, just with a richer per-instance state to migrate.

This sidesteps the page-generation and endpoint-generation problems while preserving the _behaviour_ pinning that's the main value of versioning. The cost is a larger workflow doc and the discipline of keeping hook Apis backward-compatible.

**When to revisit the chosen approach.** Latest-wins + migrations is correct for the current project scale. Signals that would push toward pinning (or the hybrid above):

- Multi-month workflows where instances reliably span 3+ definition changes.
- Many tens of thousands of concurrent in-flight instances.
- A regulated domain where audit requires "exactly what definition was this instance running under."
- Deployments where multiple workflow variants need to A/B test concurrently.

At that point, the per-instance snapshot hybrid is the right next step — it doesn't require the build-time → run-time architecture shift that full Camunda-style pinning would.

## 7. Document size growth

**Concern.** `form_data`, `groups[]`, `summary`, status history, references-spread keys all live on the one workflow doc. For workflows with many actions, keyed/instanced actions, long history, and non-trivial form payloads (location fields, contact details), the doc grows unbounded. Mongo's 16MB document limit is a real ceiling.

The design has no archive, split, or eviction strategy.

**Recommendations.**

- **Store `form_data` per-action**, on the action doc, not on the workflow doc. The workflow doc keeps `summary`, `groups[]`, status — bounded. Action docs grow per their own form, bounded by the action's form size.
- **Cap status history length** with a configurable limit + archive table for overflow. Most consumers only need the top of stack; full history is for audit.
- **File-like fields go to S3 with a reference**, never inline on the doc. (Implementation likely already does this — worth being explicit.)

## 8. Observability / correlation

**Concern.** The engine's submit lifecycle has 11+ steps, with recursive callApi possible at multiple points. There is no mention of:

- Structured logging with correlation IDs.
- Request tracing across plugin → callApi → plugin transitions.
- Metrics on step latencies, retry counts, hook failures.
- A debugging surface for "why did this submit do what it did."

For a system this central to consumer apps, this isn't optional.

**Recommendations.**

- **Correlation ID generated at submit entry**, propagated through every write, every callApi, every log event. Include in error messages.
- **Structured log per lifecycle step** with `(correlation_id, step, action_id, duration_ms, result)`.
- **A debug-mode submit response** that returns the lifecycle trace (which hooks ran, which auto-unblocks fired, which groups recomputed, which tracker updates fired). Useful in dev; gated behind a flag in prod.

## 9. Idempotency keys

**Concern.** The design relies on the priority rule + same-stage no-op guard for retry safety. This protects against accidental double-write of the same state, but not against:

- "I already submitted; the response is in flight; I clicked again" with different `form_data` — the second submit succeeds and overwrites the first.
- Double-firing post-hooks on retry (no key to dedupe on).
- Distinguishing "deliberate resubmit after error" from "accidental duplicate."

**Recommendation.** Caller passes a `submit_id` (UUID generated client-side) on every submit. Engine writes `last_submit_id` on the action doc; reject (or no-op-and-return-cached-result) on duplicate. This is a well-trodden pattern (Stripe `Idempotency-Key`, AWS request IDs) and a small addition to the payload.

## 10. Bidirectional pointer integrity

**Concern.** `child_workflow.parent_action_id` and `parent_action.child_workflow_id` are written in one handler call but without a transaction. One can land and the other not. The result is a half-linked pair that no reconciliation step currently looks for.

**Recommendations.**

- **Pick one side as the source of truth.** The child knows the parent (`child_workflow.parent_action_id`); derive the reverse with a query rather than denormalising. The tracker subscription doesn't need `child_workflow_id` on the tracker action — it walks child → parent. Apps that need the reverse lookup query by `parent_action_id`.
- **If denormalisation stays**, wrap both writes in the same transaction (see point 1), and add a reconciliation pass for half-links (see point 5).

## Priority order

If you only tackle three: **transactional core writes + outbox for side effects** (1), **definition versioning** (6), **reconciliation job** (5). These three together close the correctness gaps the design currently accepts as "drift class." The rest (pooling, observability, idempotency keys) are quality-of-life improvements that compound but aren't load-bearing for v1 correctness.
