# Review 1 — Correctness, infrastructure assumptions, and cross-design consistency

Scope: first review of Part 38. Verified against the current engine code
(`plugins/modules-mongodb-plugins/src/connections/`), the concept docs
(`state-machine`, `engine`, `submit-pipeline`), Part 35, and the events module.

The architecture is sound — load-plan-commit collapses the staleness bug class
the design targets, and the Plan-as-render-source argument holds. The findings
below are about two infrastructure assumptions that don't match the codebase, a
concurrency-ordering correctness bug, and several cross-design inconsistencies.

## Correctness

### 1. CAS on `workflow.updated` is checked _after_ action writes are already committed — retry is non-idempotent

> **Resolved.** Two-part fix. (1) **Reorder:** D9 now commits workflow-first — the workflow `findOneAndUpdate` CAS claim is step 1 and throws `ConcurrentSubmitError` before any action write, with an explicit "no action write is durable until the workflow claim succeeds" invariant. Data-flow diagram and worked-example commit blocks reordered to match. (2) **Conditional transactions (D11):** on a replica set, D9 steps 1–2 (workflow + actions) run in one `session.withTransaction`, making the ordering moot; on standalone mongod the reordered+CAS path is the correct fallback. D15 updated to explain CAS works _with_ transactions (converts write-conflict retries into clean throws). The Non-goal "transactions deferred" is replaced; only threading the txn across the callApi boundary remains deferred.

D9 fixes commit order as: (1) `bulkWriteActions`, (2) workflow `findOneAndUpdate`
with the CAS filter, (3) events, (4) notifications, (5) change-log. D15 puts the
optimistic-concurrency gate on step 2.

In the no-transaction v1 (the default — Non-goals, D11), this means **the action
transitions for `plan.actions` are durably written before the CAS gate runs.**
When the CAS misses (a concurrent submit moved the workflow between our load and
commit), the engine throws `ConcurrentSubmitError` (data-flow line 414) — but the
action docs have _already_ been mutated. Two concrete problems:

- **Orphaned action writes.** The actions advanced; the workflow summary/groups
  did not. D9's own "action writes succeed, workflow write fails" bullet describes
  exactly this as a stale-summary recoverable state — but it's reframed there as a
  rare mid-commit throw, not as _the expected outcome of every CAS miss_, which is
  the case the whole CAS mechanism exists to handle.
- **Retry is not idempotent.** D15 says "the engine itself does not auto-retry…
  caller's retry policy decides." On retry, the load phase re-reads the now-already-
  advanced action, and the planner re-resolves the user signal against the _new_
  stage. For most signals the FSM has an entry from the new stage (e.g. task
  `submit_edit` is accepted from `done` → `in-review`/`done` per state-machine.md
  line 137), so the retry prepends a **second** status entry — a double transition,
  not a no-op. D15's claim that "per-action concurrency… typically lands in same-
  stage no-ops via the FSM" is about two users racing the same action; it does not
  cover retry-after-partial-commit, where our own prior write is what we re-plan
  against.

Fix options, in rough order of preference:

- **Gate first.** Do the workflow `findOneAndUpdate` CAS as commit step 1 (it
  writes the new `updated` stamp, claiming the workflow), then write actions. A CAS
  miss then throws before any action write. This reorders D9 but matches the intent.
- Require transactions for multi-action submits (couples to D11, which is a non-goal).
- Make `bulkWriteActions` operations CAS-filtered per action (`_id` + prior
  `status[0]` discriminator) so a re-applied transition self-rejects — heavier, and
  D15 already defers per-action CAS.

Either way, the design should state the invariant explicitly: _no action write is
durable until the workflow claim succeeds._ As written, the commit order defeats
the CAS.

### 2. `context.mongoDb` (raw `Db`) and `context.mongoClient` do not exist and cannot be cheaply extracted — D8/D11 rest on absent infrastructure

> **Resolved.** D8 rewritten: `mongo/getMongoDb.js` constructs the engine's **own** `MongoClient` from `databaseUri` and caches it at module scope (the community plugin exposes no client and creates a fresh one per request — confirmed by the user — so there's nothing to reuse). Exposes both `context.mongoDb` (Db, for helpers) and `context.mongoClient` (for `startSession`, D11). Two clients coexist (engine cached-pooled + community per-request); documented as the root cause that callApi'd event writes can't join the engine transaction (D9). The persistent pooled client is also what makes the v1 transaction path viable.

D8: "The plugin shell exposes `context.mongoDb` (raw `Db` from the driver), in
addition to the existing `context.mongoDBConnection`." D11: `context.mongoClient.
startSession()`.

Neither exists today, and the community plugin does not expose them. Engine MongoDB
access is entirely through `shared/createMongoDBConnection.js`, which closes over
`@lowdefy/community-plugin-mongodb`'s `MongoDBCollection` and returns a
per-collection request dispatcher (`MongoDBFindOne`, `MongoDBUpdateOne`, …). The
plugin **owns the `MongoClient` lifecycle and connection pool privately**; there is
no `getClient()`/`getDb()` on its public surface (verified in the community plugin
connection code).

So `mongo/getMongoDb.js` ("extracts the raw `Db` reference from the plugin context")
has nothing to extract. The realistic implementation is: read `databaseUri` from the
connection (it's in `WorkflowAPI/schema.js`) and construct **our own** `MongoClient`.
Consequences the design doesn't account for:

- **A second connection pool** alongside the community plugin's. In serverless/Lambda
  this is a real cold-start and connection-cap concern; the engine needs the same
  cross-invocation client caching the community plugin already does, or every engine
  call opens a fresh pool.
- **The transaction seam (D11) is dirtier than claimed.** A session is bound to the
  client that created it; for the commit to be transactional, every write in it must
  use _our_ client. But events go through `callApi("new-event")` → the events module →
  the _community plugin's_ client (D9 already notes events can't join the transaction).
  The stated root cause is "callApi crosses the boundary"; the deeper root cause is
  **two independent clients**. D11's "clean seam… every Mongo helper accepts an
  optional `session`" is only clean for the helpers that share our client; it can
  never extend to the callApi'd event/notification writes without a much larger change.

This needs a dedicated decision: how the engine obtains and caches a raw client/Db,
how it coexists with the community plugin's pool, and an honest restatement of how
far the transaction seam can actually reach. Right now D8 presents `context.mongoDb`
as a given when it's net-new infrastructure with non-trivial lifecycle implications.

## Prerequisite / cross-design consistency

### 3. The "settled" prerequisite edits have not landed

> **Resolved — prerequisite confirmed landed; follow-on drift logged for a separate Part 38 pass.** The concept edits have since been made: engine D4 is now "Signal-driven FSM transitions" (with a supersession note; tracker uses `emitSignal`/`CHILD_STAGE_SIGNAL`, no `force`), submit-pipeline D3 is "Per-template button bars over the signal namespace," and state-machine.md's Next-step note confirms items 1–4 were carried out. So the original "not settled" concern no longer holds.
>
> However, cross-checking Part 38 against the _current_ concept surfaced three model drifts that postdate Part 38. The user will reconcile these in a separate Part 38 update (not done in this action-review):
>
> 1. **Simple kind has no `target_status` / status selector** (state-machine.md line 149; submit-pipeline D3 line 166 — "v0 selector removed, review #6"). `submit` is nullary, resolving in-review/done from the `review` verb like form. Part 38's worked example (`target_status: done`) and **Q2** (entirely about `target_status` validation) are stale — Q2 likely disappears.
> 2. **No current-action redirect** (state-machine.md line 201; submit-pipeline D3 line 169). Part 38's pre-hook `{ signal }` root redirect (D5, the `PreHookResult { signal }` shape, D4's "pre-hook auxiliary signals" framing) must drop to `actions[]` + overrides only.
> 3. **Signal renames:** `submit_edit`→`submit`, `save_draft`→`progress` (now also simple "mark started"). Part 38 uses `submit_edit` throughout.

The design's opening Prerequisite says concept reconciliation "lands first" and "this
implementation design assumes those edits are settled": state-machine.md becomes the
transition authority, with engine Decision 4 and submit-pipeline Decision 3 citing it.

None of that is in the tree:

- `engine/design.md` Decision 4 (line 422) still reads "Status enum priority rule" and
  documents `force: true` per-call and per-entry (lines 426–437). Line 295 still has
  `force: true, // tracker writes bypass priority rule (see Decision 4)`. No mention of
  FSM / signals / state-machine.md.
- `submit-pipeline/design.md` Decision 3 (line 137) is still "Button vocabulary on
  templates (open: validate)"; the priority rule and `force` are referenced throughout
  (lines 71, 194, 298).
- The parent `workflows-module-concept/design.md` has **no `state-machine` row** in its
  sub-design table (grep finds none).

Part 38 isn't wrong to depend on these edits, but it currently builds on a foundation
that hasn't been poured. Either land the three concept edits (state-machine.md § "Next
step" lists them) before tasking Part 38, or downgrade the Prerequisite from "settled"
to "must land as the first task of this part" so the dependency is tracked rather than
assumed.

### 4. Kind naming: Part 38 uses `task`; state-machine.md and Part 35 use `simple` — and Part 35 edits a file Part 38 deletes

> **Resolved.** Renamed all kind references `task`→`simple` throughout Part 38 (Proposed change #2, `tables.js`, worked example, Q2, link names `task-view`/`task-edit`→`simple-view`/`simple-edit`). Added a Prerequisite line stating Part 38 sequences after Part 35, and annotated the `resolveTargetStatus.js` deletion as "renamed by Part 35, deleted here."

Part 38 says "FSM tables per action kind (form/task/tracker)" (Proposed change #2) and
`FSM_TABLES[action.kind]` resolving `FSM["task"][...]` (D4, line 119; D2 line 59; test
strategy). But state-machine.md — cited as the authority — names the kinds
**form / simple / tracker** throughout (line 3, the FSM tables at lines 127–158), and
Part 35 ("rename kind:task→simple") renames `task`→`simple` in the actual plugin code:
`types.js` `ActionKind`, `resolveTargetStatus.js`, `makeWorkflowsConfig.js`,
`makeWorkflowApis.js`, plus page files and demo config.

Two concrete problems:

- **The FSM tables Part 38 ships would be keyed on `task`**, contradicting
  state-machine.md's `simple`. The exhaustive `tables.test.js` (test strategy) would
  encode the wrong key.
- **Sequencing collision with Part 35.** Part 35 _edits_ `resolveTargetStatus.js`
  (line 45, `kind === "task"` → `"simple"`); Part 38 _deletes_ `resolveTargetStatus.js`
  (Files changed → Deleted). And Part 38's deletion of `computeAutoUnblocks.js` /
  `reevaluateBlockedActions.js` overlaps the same code Part 35 touches. The two parts
  need an explicit order (38 after 35, with 38 keying FSM tables on `simple` and noting
  it inherits the rename), or Part 38 absorbs the rename. As written they conflict.

Recommend: state the dependency on Part 35 explicitly, switch all `task` references in
Part 38 to `simple`, and drop `resolveTargetStatus.js` from the Deleted list as "already
renamed by Part 35; deleted here" or similar.

## Moderate

### 5. CAS pins the whole `updated` ChangeStamp object — pin the timestamp instead

> **Resolved.** D15 and the data-flow diagram now pin `"updated.timestamp"` (scalar) instead of the whole `updated` sub-document, with a note on why embedded-doc equality is brittle and why same-millisecond races are still caught.

D15's filter is `{ _id, updated: loadedState.workflow.updated }`. `workflow.updated`
is not a scalar — it's a `ChangeStamp` object `{ timestamp: Date, user: { id, name } }`
(verified in `shared/types.js` line 39 and written from `context.changeStamp` in
`StartWorkflow.js` line 90). Matching an embedded document in a Mongo filter is exact-
equality and **field-order/shape sensitive**; it's brittle against any future field
addition to the change stamp and harder to reason about than a scalar compare. Pin
`{ "updated.timestamp": loadedState.workflow.updated.timestamp }` instead — same
guarantee (every write stamps a fresh timestamp), scalar compare, order-independent.
Worth also confirming timestamp resolution is fine: two submits in the same millisecond
by the same user would produce equal stamps, but CAS still catches the race because the
first commit advances the stored value and the second's filter then misses.

### 6. The change-log "after" snapshot for events won't match the doc `new-event` actually writes; and D9 ↔ data-flow contradict on how events are written

> **Resolved (and superseded by a D7 redesign).** Both halves addressed. (1) The partial-snapshot concern is gone: D7 was reworked (user direction) so the engine no longer writes a bespoke `change_log` — it reproduces the community plugin's `log-changes` contract (same collection, same schema, same `changeLog: { collection, meta }` connection config), populating before/after from the Plan instead of extra reads. The event is logged by the events module's _own_ `changeLog`, not snapshotted by the engine, so there's no mismatch. (2) The data-flow diagram now shows the event write as `callApi('new-event', …)` only (matching D9 prose), with `_id: event_id` passed so `event_id` anchors the timeline entry. Note: this corrects the review's own imprecise "What checks out" line below — the `WorkflowAPI` `changeLog` property _is_ directly related to `log-changes`, not "a different thing." See finding #1/#2 resolutions for the transaction boundary (change-log stays outside, best-effort, last).

Good news first: `new-event` (`modules/events/api/new-event.yaml`) accepts a caller-
supplied `_id` (`_if_none: [_payload._id, _uuid]`) and does **not** render — it stores
the `display` object as passed. So `commit_id = event_id` (D7) holds and the plan-time
event render (D12) is the authoritative render. Both are fine.

But `new-event` _derives_ `date` (now) and `created` (change stamp) server-side and only
passes through `display`/`references`/`type`/`metadata`/`files`. So:

- The Plan's `events[].doc` ("fully rendered display, references, metadata", D3) is not
  the full stored doc — it lacks `date`/`created`. D7 says event change-log entries are
  `after = the inserted event doc`. The planner can't know `date`/`created` (they're set
  inside `new-event`), so the change-log "after" is a partial snapshot. Either accept
  that events change-log entries are best-effort partial (document it), or have the
  engine set `_id`/`date`/`created` and pass them through `new-event` so plan and storage
  agree.
- **Write-path contradiction.** D9 (text) says events "go through `callApi("new-event")`."
  The data-flow diagram (line 415) says `insertOneDoc(events, event.doc) via
callApi('new-event', ...)` — that's two different mechanisms (raw driver helper vs
  module endpoint) stated as one. Pick one. It matters: only the `insertOneDoc` path can
  ever join the engine transaction (D11), and only the `callApi` path preserves the
  events module's validation/type-keying. D9's prose already chose `callApi`; fix the
  diagram and drop `insertOneDoc` from the events step.

### 7. Tracker "depth guard at 10" loses its meaning under the BFS loop

> **Resolved.** D10's `runTrackerCascade` now carries a per-fire `depth` field (seeded at 1, incremented per level) and throws `TrackerCascadeDepthError` when it exceeds `MAX_DEPTH`, with prose and the data-flow line clarifying the guard tracks chain depth, not loop iterations / fan-out.

D10 restructures `fireTrackerSubscription` from recursion into a queue:
`pendingFires.shift()` … `pendingFires.push(...levelPlan.trackerFires)` (BFS), and says
"the `MAX_DEPTH = 10` cycle guard… carries over as a counter on the loop."

Today's guard counts _recursion depth_ (chain length up the parent tree) — the thing
that detects a genuine cycle. A counter on the BFS loop counts _total dequeues across
the whole cascade tree_, which is breadth, not depth. A wide-but-shallow legitimate
cascade (one workflow with many tracker parents) could trip a dequeue-count guard of 10
without any cycle; a deep cycle through few-but-long chains could exceed real depth 10
while staying under a low dequeue count only if narrow. The guard needs to carry per-fire
depth (e.g. enqueue `{ ...fire, depth: parentDepth + 1 }` and check `fire.depth >= 10`),
not a single loop counter. State which semantics are intended.

## Minor

### 8. The "bulk-write idempotency" test (test strategy) tests the wrong property

> **Resolved.** Reworded the Mongo-helpers test note to explain why same-ops re-run isn't the hazard, and added an integration test ("retry after a CAS miss does not double-transition") asserting the action's `status[]` gains exactly one entry.

Test strategy → Mongo helpers: "Bulk-write idempotency (re-running the same bulk has the
same effect — important for retry semantics)." Re-running the _same_ `$set`-whole-doc ops
is trivially idempotent and not the retry hazard. The real retry path (finding 1) re-runs
the _load+plan_, producing **different** ops from the advanced state. The valuable test is
the end-to-end one: "submit → CAS miss → retry does not double-transition." Add that to the
integration band and reword the helper-level claim.

### 9. Empty-plan-is-noop (D3) vs throw-on-user-noop (D13/Q3) — reconcile

> **Resolved.** Added a sentence to D3 clarifying empty plans arise only from engine cascade / pre-hook auxiliary signals; user-driven current-action no-ops throw per D13/Q3.

D3: "commit on an empty Plan is a no-op… or a complete no-op if nothing changed." D13 (3)
and Q3: a user-driven current-action signal with no FSM entry **throws**. These don't
conflict (the empty plan arises only from cascade-only submits, since the user path throws
before planning completes), but the two statements read as if both describe the same path.
One sentence in D3 clarifying "empty plans arise only from engine cascade signals; user
no-ops throw per D13" removes the apparent tension.

## What checks out

- Render-against-planned-state eliminating the staleness class (D1, D12) — the argument is
  correct; `new-event` not rendering confirms the plan-time render is authoritative.
- `commit_id = event_id` (D7) — viable; `new-event` accepts a supplied `_id`.
- The auto-unblock fixpoint "at most once per submit" bound (D4) — holds given the FSM's
  structural safety (engine cascade is unblock-only per state-machine.md line 172;
  `unblock` no-ops from `action-required`).
- `change_log` is genuinely new (no existing references in the repo; the events module's
  unrelated `changeLog`→`log-changes` config is a different thing).
