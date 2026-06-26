# Task 12: Event + change-log planners

## Context

The remaining two plan-phase planners build the event payload (rendered against planned post-state) and the change-log deltas. They consume the render layer (task 3) and phase types (task 9). `planEventDispatch` absorbs the template constants from the deleted `dispatchLogEvent.js` (the dispatch action itself moves to commit).

**No `planNotifications`.** The engine builds no notification doc — nothing in the repo produces a `NotificationDoc`. Notifications are dispatched post-commit by `dispatchNotifications.js` via `callApi("send-notification", { event_ids: [event_id] })`, keyed on the committed event id (commit step 4, task 13; the wire field stays the batch-shaped `event_ids` — the notifications endpoint's existing contract). Composing a notification payload here would be speculative surface (CLAUDE.md "Build for what exists, not what might").

## Task

**Create `shared/phases/planners/planEventDispatch.js`:**

- Compose + render the event payload — exactly **one** per invocation, emitted as `Plan.event` (D3: the doc's `_id` is the per-invocation `event_id`, so a second entry would collide on `_id`; the singular type enforces the invariant). Three source layers merged via `mergeEventOverrides` (carried from Part 30): engine default → YAML override → pre-hook return, all plain Nunjucks strings, rendered during the plan phase. **The three-source merge applies to Submit action events only.** The YAML lookup key is the **signal name** (post-rename; today `params.event_overrides[interaction]`). Lifecycle events (`workflow-started`/`-cancelled`/`-closed`) and the tracker-mirror event render the **engine default only** in v1 — both override layers are structurally absent (no pre-hook for Start/Cancel/Close, no `event_overrides` channel on their payloads; the mirror commit is engine-internal with no payload at all), and no config channel is invented for them ("build for what exists").
- **Today's runtime `comment` layer is deliberately not reproduced.** `buildDefaultLogEventPayload`'s fold of `params.comment` into `metadata.comment` is a latent no-op bug (pages send the TipTap object; the `typeof comment === "string"` guard drops it — [Part 33](designs/workflows-module/parts/_completed/33-comment-rendering/design.md) Background) and is superseded by Part 33's `foldCommentIntoEvent`, which lands on this planner after Part 38 and writes the comment to `display.{app_name}.description` post-merge. Part 38 only keeps the `comment` param flowing on the emitted payload (task 19) so Part 33's wire contract (its D5) survives the rebuild; `planEventDispatch` writes no `metadata.comment`.
- **Branch on handler/event type to pick the render context** (D12):
  - **Event `type`:** `action-{signal}` for Submit action events. The tracker-mirror types are a **special-cased literal mapping**, not the generic template: `internal_mirror_child_active` → `action-internal-mirror-active`, `internal_mirror_child_completed` → `action-internal-mirror-completed`, `internal_mirror_child_cancelled` → `action-internal-mirror-cancelled`. In the mirror render context and `metadata`, `signal` binds to the **raw signal name** (e.g. `internal_mirror_child_active`) — the truthful value; nothing renders it.
  - **Action-event context** (for `action-{signal}` and the tracker-mirror `action-internal-mirror-{state}` event — both have a single target action):
    ```js
    { user, action: plannedActionDoc, workflow: plannedWorkflowDoc,
      signal, status_before, status_after, submitted_form }
    ```
    `submitted_form` is the pre-merged form from `planFormDataMerge` (task 11). `workflow.form_data` remains available for cross-action templates.
  - **Workflow-lifecycle context** (for `workflow-started` / `workflow-cancelled` / `workflow-closed` — no single target action):
    ```js
    { user, workflow: plannedWorkflowDoc, signal }
    ```
- Engine-default titles are plain Nunjucks strings per the "Engine entry points emit events" table:
  - `StartWorkflow` → `workflow-started` → `{{ user.profile.name }} started {{ workflow.workflow_type }}`
  - `SubmitWorkflowAction` → `action-{signal}` → `{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}`
  - `CancelWorkflow` → `workflow-cancelled` → `{{ user.profile.name }} cancelled {{ workflow.workflow_type }}`
  - `CloseWorkflow` → `workflow-closed` → `{{ user.profile.name }} closed {{ workflow.workflow_type }}`
  - Tracker-mirror → `action-internal-mirror-{state}` → `Tracker mirrored child {{ status_after }}` (system event, lower prominence)
- **Full event-doc composition — not just titles.** `planEventDispatch` absorbs the *whole* of `buildDefaultLogEventPayload`'s composition (dispatchLogEvent.js:37–89), not only the template constants:
  - **`display`** keyed by `connection.app_name`, with the existing missing-`app_name` guard (throw when absent — apps must wire `app_name`).
  - **`references`** — `{ workflow_ids: [workflow._id], action_ids: [...], [refKey]: [workflow.entity_id] }` with `refKey` = **`workflow.entity_ref_key`** (required authored workflow config, copied onto the workflow doc at start — see design "Event references"; supersedes `deriveEntityRefKey`, whose collection-name-plural derivation contradicts the repo's singular `lead_ids`/`contact_ids` convention). **`action_ids` lists every action doc the plan touches** — one uniform rule for all event types (see design "Engine entry points emit events"): Submit → submitted + auxiliary + auto-unblocked actions; tracker-mirror → the mirrored tracker action; `workflow-started` → all initially created actions; Cancel/Close → the actions marked `not-required`. This widens today's single-id `action_ids` and is load-bearing for Part 42's timeline action cards (card attaches to the latest referencing event). References are what make an event findable — the entity timeline and the notifications `send_routine` query by them.
  - **`metadata`** — action events (incl. tracker-mirror): `{ action_type, workflow_type, signal, current_key, status_before, status_after }` (no `metadata.comment` — see above). Lifecycle events: `{ workflow_type, signal }`. The legacy `metadata.interaction` key is renamed to `metadata.signal` (greenfield; matches the render-context rename — design D12).
- `planEventDispatch` **receives** the per-invocation `event_id` (minted up front at the handler entry — task 15, finding-1 model — not produced here) and uses it as the dispatched event doc's `_id`. It is the same `event_id` already stamped onto every action `status[]` entry by `planActionTransition` (task 10), so the event doc and the action status entries share one id.
- **Relocate `mergeEventOverrides.js`** (with its test) from `SubmitWorkflowAction/` to `shared/` in this task — task 15 later dismantles `SubmitWorkflowAction/`, and the planner must not import from a directory that task 15 deletes around it. **Delete `utils/deriveEntityRefKey.js`** (with its tests) — superseded by the required `entity_ref_key` config field; do not relocate it.

**Create `shared/phases/planners/planChangeLog.js`:**

- Build `log-changes` entries from the per-doc `{ before, after }` deltas accumulated during planning (D7) — `plan.actions[i].changeLog` (from `planActionTransition`, task 10) and `plan.workflow.changeLog` (from `planWorkflowRecompute`, task 11). Those planners emit **only** the raw delta; `planChangeLog` is the single owner of the community-schema transform. The finished entries are collected onto the top-level `plan.changeLog[]`, which the commit phase (task 13 step 5) inserts via `insertManyDocs`.
- One entry per affected doc (N action transitions + 1 workflow update → N+1 entries), in the **community-plugin schema**, which is **per-type** (verified against the `@lowdefy/community-plugin-mongodb@3.0.0` dist source — D7):
  - **Update entries** (`type: "MongoDBUpdateOne"` — action/workflow update): `{ type, args: { filter: { _id }, update: { $set: <planned doc> } }, before, after, payload, blockId, connectionId, pageId, requestId, timestamp, meta }` — **no `response`** (the plugin logs none on updates; the engine's bulk writes return counts only). `before` = loaded doc; `after` = planned doc.
  - **Insert entries** (`type: "MongoDBInsertOne"` — action insert): `{ type, args: { doc: <planned doc> }, response: { acknowledged: true, insertedId }, payload, blockId, connectionId, pageId, requestId, timestamp, meta }` — **no `before`/`after`** (the plugin logs none on inserts; the doc is in `args.doc`). `insertedId` is the plan-time minted `_id`, so the entry is truthful at plan time.
- `payload` (the request payload) is included on every entry — the plugin logs it on every op; it comes from the same `lowdefyContext` as the request-context fields.
- `meta` is a **verbatim copy** of `connection.changeLog.meta` — the plugin does **no** resolution (Lowdefy already evaluated operators like `_user` when building connection properties). Do not build operator evaluation here.
- Request-context fields shared across all entries from one invocation. These come from `lowdefyContext` — Lowdefy's `callRequestResolver` passes `{ blockId, connectionId, pageId, requestId, endpointId }` to every connection resolver, so the entry-point handler (`SubmitWorkflowAction.js` et al.) threads them into the engine context. Parity with the community plugin is exact (it reads the same source); when an invocation lacks a page/block, `pageId`/`blockId` are `undefined` for both.
- **Opt-out:** when `changeLog` is not configured, produce **no** entries (same as the community plugin).
- Do **not** double-log events (the events module's own `changeLog` logs the `new-event` write) or notifications. No engine-specific fields (`commit_id` etc. — Non-goal).

## Acceptance Criteria

- `planEventDispatch` selects the correct context per event type (action-event vs workflow-lifecycle), asserted **separately** in tests; tracker-mirror uses the action-event context.
- Event docs carry the full composition: app-keyed `display` (with missing-`app_name` throw), `references` with the all-touched-actions `action_ids` rule (asserted for a multi-action submit: submitted + unblocked ids present), the entity key from `workflow.entity_ref_key`, and per-type `metadata`. No `deriveEntityRefKey` import remains.
- Three-source override merge order correct **for Submit action events** (YAML key = signal name); lifecycle and tracker-mirror events render the engine default only (asserted: overrides are not consulted for them); per-event-type defaults render as specified.
- `planChangeLog` emits N+1 community-schema entries with the per-type field sets (update: `before`/`after`, no `response`; insert: `args.doc` + `response`, no `before`/`after`), `payload` on every entry, and verbatim `meta`; emits **nothing** when `changeLog` is unconfigured.
- No `planNotifications` file is created; the Plan carries no `notifications` field.
- Tests: `planEventDispatch.test.js` (both contexts asserted separately, override layering, per-type defaults, branch assertion), `planChangeLog.test.js` (entry-per-doc, per-type community schema asserted separately for update and insert entries, before/after sourcing on updates, `args.doc`/`response` on inserts, `payload` inclusion, verbatim `meta` copy, opt-out).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planChangeLog.js` — create
- `…/planners/planEventDispatch.test.js` — create
- `…/planners/planChangeLog.test.js` — create
- `…/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.js` (+ test) — move to `shared/`
- `…/WorkflowAPI/SubmitWorkflowAction/utils/deriveEntityRefKey.js` (+ test) — delete (superseded by `entity_ref_key` config)

## Notes

- The engine-default templates are plain Nunjucks strings (idioms.md § Event display) — the rewrite from object templates is part of this.
- `planChangeLog` reproduces the community plugin's `log-changes` output so a reader can't distinguish engine-written from plugin-written entries except by `type`/content.
