# Review 9 — Task 12 (event + change-log planners) contract completeness

Scope: `tasks/12-event-notification-changelog-planners.md`, checked against the
design (D3, D7, D9, D12, the "Engine entry points emit events" table), the code
it absorbs (`dispatchLogEvent.js`, `mergeEventOverrides.js`,
`dispatchNotifications.js`, `makeWorkflowApis.js`), the actual community plugin
(`@lowdefy/community-plugin-mongodb@3.0.0`, dist source), and the adjacent tasks
(9, 10, 11, 13, 15, 17, 19). Same class as reviews 5–8's per-task contract
passes.

What's correct and grounded: the no-`planNotifications` decision matches the
code (`dispatchNotifications.js:17–21` passes only `event_ids`; nothing in the
repo builds a `NotificationDoc`) and task 13 step 4 keeps the helper; the
two-render-context branch matches D12 as review-2 #3 left it; the received
`event_id` model matches review-5 #1 and task 10's `status[]` stamping; the
delta boundary (tasks 10/11 emit raw `{ before, after }`, task 12 owns the
community-schema transform onto `plan.changeLog[]`) matches review-5 #4 and the
task-9 Plan type; the opt-out matches the plugin (`getCollection` only returns
`logCollection` when `changeLog` is configured); the engine-default titles match
the design table; the events-module double-log exclusion is real
(`modules/events/connections/events-collection.yaml:7–10` configures its own
`changeLog`, so the `new-event` insert is plugin-logged).

## Correctness

### 1. The task's `log-changes` schema doesn't match what the community plugin actually writes — insert entries especially

> **Resolved.** Option (a) — exact mirror. Task 12 and design.md D7 now pin per-type field sets: update entries `{ args: { filter: { _id }, update: { $set } }, before, after, ... }` with no `response`; insert entries `{ args: { doc }, response: { acknowledged: true, insertedId } }` with no `before`/`after` (`insertedId` is the plan-time minted `_id`). `payload` added to every entry. `meta` wording corrected to "verbatim copy" (no operator resolution) in task 12, D7, and the D7 test plan. The exact-parity/indistinguishability claim is kept and now true.

Verified against the installed plugin source
(`@lowdefy/community-plugin-mongodb@3.0.0`,
`dist/connections/MongoDBCollection/`):

- **`MongoDBUpdateOne`** logs
  `{ args: { filter, update, options }, blockId, connectionId, pageId, payload, requestId, before, after, timestamp, type, meta }`
  — there is **no `response`** field on update entries.
- **`MongoDBInsertOne`** logs
  `{ args: { doc, options }, blockId, connectionId, pageId, payload, requestId, response, timestamp, type, meta }`
  — there is **no `before` and no `after`** on insert entries; the doc is in
  `args.doc` and `response` is the driver result (`{ acknowledged, insertedId }`).

Task 12 (line 36) prescribes one unified shape
`{ type, args, before, after, response, timestamp, meta, blockId, connectionId, pageId, requestId, ... }`
and line 38 prescribes "`before` = loaded doc (null for inserts); `after` =
planned doc". Three concrete consequences:

- An engine-written **insert** entry carrying `before: null, after: doc` (and
  no `args.doc`/`response`) is immediately distinguishable from a
  plugin-written insert entry — contradicting line 40's "Parity with the
  community plugin is exact" and the Notes line 62 claim that "a reader can't
  distinguish engine-written from plugin-written entries except by
  `type`/content".
- `response` on an engine **update** entry has no plugin counterpart, and the
  engine has nothing truthful to put there anyway (`bulkWriteActions` returns
  counts only — D7 says exactly this).
- `args` is listed in the schema but the task never says what the engine puts
  in it. The plugin logs the call arguments; the engine's planned ops are
  whole-doc `$set`s, so `args` is synthesizable but only if someone says so.

Also: every plugin entry carries **`payload`** (the request payload —
`MongoDBUpdateOne.js` destructures and logs it), which the task's field list
omits. It's available on the same `lowdefyContext` the request-context fields
come from.

**Fix.** Pin per-type field sets in the task, and decide the insert question
explicitly rather than by accident:

- Update entries: `{ type: "MongoDBUpdateOne", args: { filter: { _id }, update: { $set: <planned doc> } }, before, after, payload, blockId, connectionId, pageId, requestId, timestamp, meta }` — no `response`.
- Insert entries: either (a) mirror the plugin exactly
  (`args: { doc }` + `response: { acknowledged: true, insertedId }`, no
  before/after — preserves the indistinguishability claim), or (b) keep the
  task's richer `before: null / after` shape and **drop the exact-parity /
  indistinguishability wording** (it becomes "same schema family, engine
  entries strictly richer on inserts"). Either is fine; the task must pick one.
- State that `payload` is included (or deliberately excluded — but exclusion is
  another parity break to acknowledge).

Propagate the same correction to design.md D7 (line 172 carries the identical
`{ ..., response, ... }` unified-shape imprecision).

While here, tighten the `meta` wording (line 39 "resolved from
`connection.changeLog.meta` (e.g. current user via `_user`)"): the plugin does
**no resolution** — it copies `connection.changeLog?.meta` verbatim, because
Lowdefy evaluated the `_user` operator when building connection properties. The
engine should do the same verbatim copy; an implementer must not build operator
evaluation here.

### 2. The runtime `comment` layer silently disappears from the merge

> **Resolved.** Deliberate drop, now stated: Part 33 (comment-rendering) owns the comment's home — today's `metadata.comment` fold is a latent no-op bug (pages send the TipTap object; the `typeof comment === "string"` guard drops it), superseded by Part 33's `foldCommentIntoEvent` writing `display.{app_name}.description` post-merge after Part 38 lands. Task 12 now states the comment layer is intentionally not reproduced; task 19 adds `comment` to the emitted payload list so Part 33's D5 wire contract survives the rebuild.

Today's event payload merge is **four** layers, not three
(`dispatchLogEvent.js:13–17`): engine default (1) + runtime `comment` from
params folded into `metadata.comment` (3) → YAML override (2) → pre-hook
override (4) — with deliberate machinery so a YAML override touching other
`metadata.*` keys can't clobber the user's comment, and an explicit "must NOT
re-inject comment" guard in `mergeEventOverrides.js:15`. `comment` is a live
payload param: `makeWorkflowApis.js:65` maps `comment: { _payload: 'comment' }`
and `handleSubmit.js:326` threads it.

Task 12 (line 13) specs "Three source layers … engine default → YAML override →
pre-hook return" and never mentions `comment`. Task 19's payload list
(`signal`, `metadata`, `form`, `form_review`, `event_overrides`, hooks) omits
`comment` too. Nothing in the design states a decision to drop the comment
feature — it just falls out of both task texts.

**Fix.** Either carry it: `planEventDispatch` folds `params.comment` into the
default payload's `metadata.comment` exactly as `buildDefaultLogEventPayload`
does today (layer 1+3), and task 19 adds `comment` to the payload list — or
drop it deliberately: say so in the design (an authored behaviour removal, with
the demo checked for usage). Don't leave it implicit.

### 3. References + metadata composition is unowned — "absorbs the template constants" understates what must survive

> **Resolved.** Task 12 now specs the full composition: app-keyed display with the missing-`app_name` guard, references with entity `refKey`, metadata six-pack for action events / `{ workflow_type, interaction }` for lifecycle. The lifecycle-references question resolved differently than proposed: a **uniform all-touched-actions rule** — `references.action_ids` lists every action the invocation's plan touches, for all event types (Submit → submitted + auxiliary + unblocked; started → all created; cancel/close → those marked not-required; mirror → the tracker action). This matches the v0 reference implementation and is load-bearing for Part 42's card-attachment/migration mechanic (a newly-unblocked action must be referenced by the unblocking event or it never surfaces in the timeline). Pinned in design.md "Engine entry points emit events"; Part 42 D4 gained the behaviour requirement and its join-field note was amended. `mergeEventOverrides.js` (+ test) relocation added to task 12's Files. Follow-up while resolving: `deriveEntityRefKey` is **deleted, not relocated** — its collection-name-plural output (`leads_ids`) contradicts the repo's singular reference convention (`lead_ids`, demo timeline + hooks), a live demo bug. Replaced by a **required `entity_ref_key`** workflow-config field: schema (task 4), resolver validation (task 6), copied onto the workflow doc at start (task 17), read by `planEventDispatch` (task 12), demo configs gain `entity_ref_key: lead_ids` (task 20).

Line 5 says `planEventDispatch` "absorbs the template constants from the
deleted `dispatchLogEvent.js`". But `buildDefaultLogEventPayload`
(dispatchLogEvent.js:37–89) composes far more than templates, and all of it is
load-bearing:

- **`references`** — `{ workflow_ids, action_ids, [refKey]: [entity_id] }` with
  `refKey` from `deriveEntityRefKey(workflow.entity_collection)`. The events
  timeline queries by references and the notifications `send_routine`
  re-fetches events to read them (D9 step 4) — an event without the entity ref
  never appears on the entity's timeline.
- **`metadata`** — `{ action_type, workflow_type, interaction, current_key, status_before, status_after }`.
- **display keyed by `appName`** (`connection.app_name`) with the
  missing-app_name guard.

Task 12 specs none of this, and for the **lifecycle events**
(`workflow-started`/`-cancelled`/`-closed`) the references/metadata content is
undefined anywhere — D12 defines only their *render context*, and task 17
defers to task 12 ("`planEventDispatch` already branches on type"). An
implementer following the task text produces lifecycle event docs with no
references, which silently breaks the entity timeline for the new event types
this rebuild exists to add (Proposed change #11).

**Fix.** Spec the full event-doc composition per event type in the task:

- Action events: carry `buildDefaultLogEventPayload`'s composition wholesale
  (type, appName-keyed display, references incl. entity refKey, the metadata
  six-pack + comment per finding 2).
- Lifecycle events: pin it now (per CLAUDE.md "resolve the open question") —
  e.g. references `{ workflow_ids: [workflow._id], [refKey]: [workflow.entity_id] }`
  (no `action_ids`), metadata `{ workflow_type, interaction }`.

Relocation ownership belongs here too: `planEventDispatch` consumes
`mergeEventOverrides.js` and `deriveEntityRefKey.js`, which live under
`SubmitWorkflowAction/` — but task 12 lands **before** task 15 (which only
"audits" dangling helpers). Add both relocations (with tests) to task 12's
Files list so the planner doesn't import from a handler directory that task 15
then deletes around it.

## Contract gaps

### 4. The three-source merge has no defined sources for lifecycle events

> **Resolved.** Task 12 now scopes the three-source merge to Submit action events only, pins the YAML lookup key as the signal name (post-rename), and states that lifecycle **and tracker-mirror** events render the engine default only in v1 (both override layers structurally absent; no config channel invented for the mirror event). AC updated to assert overrides are not consulted for lifecycle/mirror events.

For Submit, the YAML override arrives via the emitted-Api payload:
`makeWorkflowApis.js:68` bakes the action's `event_overrides` map into the
payload and `handleSubmit.js:330` reads `params.event_overrides?.[interaction]`.
For Start/Cancel/Close: there is **no pre-hook in v1** (task 17) and
`start-workflow.yaml` (and the cancel/close payloads) carry no
`event_overrides` channel. So for lifecycle events both override layers are
structurally empty — the merge degenerates to engine-default-only.

The task's AC ("Three-source override merge order correct") reads as if it
applies to all event types, inviting the implementer to invent an override
channel for lifecycle events that the design never defined.

**Fix.** One sentence in the task: lifecycle events render the engine default
only in v1 (no YAML channel exists on the Start/Cancel/Close payloads, no
pre-hook); the three-source merge and its tests apply to action events
(including tracker-mirror, whose YAML channel — if any — should also be named).
While here, pin the YAML lookup key post-rename: today it's
`params.event_overrides[interaction]`; under the signal model say explicitly
that the key is the signal name.

### 5. The tracker-mirror event `type` can't be derived from the stated rule

> **Resolved.** Task 12 pins the three literal mirror types (`action-internal-mirror-active` / `-completed` / `-cancelled`) as an explicit special-cased mapping from the `internal_mirror_child_*` signals (not the generic `action-{signal}` template), with the raw signal name bound in the mirror context/metadata. YAML override keying is moot for mirror events per #4 (engine default only). Follow-up while resolving: the leftover `interaction` key is **renamed to `signal`** across Part 38's render contexts, event metadata, and type-rule prose (design D12, events table, worked example, test plan; tasks 12 + 17) — aligning with the concept spec, which already uses `signal` (`submit-pipeline/spec.md:256,343`). "Interaction" survives only as prose for "button-surfaced signal".

The generic rule is `action-{interaction}` with `interaction: signal` (D12,
task line 16). The mirror signals are `internal_mirror_child_active` /
`_completed` / `_cancelled` (D3 `trackerFires`), so the generic rule yields
`action-internal_mirror_child_active` — but the table (task line 30, design
table) says `action-internal-mirror-{state}` (dashes, no `child`). These can't
both be true; `planEventDispatch` needs an explicit special-case mapping.

**Fix.** Pin the three literal type strings
(`action-internal-mirror-active` / `-completed` / `-cancelled`, presumably),
state that they are a special-cased mapping from the three `internal_mirror_child_*`
signals (not the generic `action-{signal}` template), and say what `interaction`
binds to in the mirror render context (the raw signal name, or the
`mirror-{state}` form the type uses — pick one; the default title doesn't
reference it, but YAML override keying and `metadata.interaction` do).

### 6. Request-context threading is asserted here but owned by no handler task

> **Resolved (auto).** Task 15's mint-at-entry step now threads `{ blockId, connectionId, pageId, requestId }` from `lowdefyContext` into the engine context via the same shared invocation-setup step, with a note that task 17's handlers get it through the same setup. Task 12 keeps the consumer-side sentence.

Line 40: "the entry-point handler (`SubmitWorkflowAction.js` et al.) threads
them into the engine context." Review-4 #5 verified the fields are *available*
on `lowdefyContext` — but neither task 15 nor task 17 (the tasks that rewrite
those handlers) mentions threading `{ blockId, connectionId, pageId, requestId }`,
and the current `SubmitWorkflowAction.js:6–19` does not thread them. As tasked,
`planChangeLog`'s request-context inputs have no producer.

**Fix.** Add the threading to task 15's mint-at-entry step (it already mints
`{ event_id, now, newId }` "via a small shared invocation-setup step" — thread
the four request-context fields in the same place) and note it applies to task
17's handlers via the same shared setup. Task 12 keeps the consumer-side
sentence; the producer must be in the producer's task.

## Summary

Finding 1 is the substantive one: the task pins `planChangeLog` to a schema the
community plugin demonstrably doesn't write (insert entries have no
before/after; update entries have no `response`; every entry has `payload`),
while simultaneously claiming exact parity — the contract is unimplementable as
written and the fix requires one deliberate decision (mirror vs enrich on
inserts). Findings 2–3 are behaviour-preservation drops of the same kind
review-8 #1 flagged for `updated` stamps: live code paths (`comment`,
references/metadata composition) whose replacement home is unspecified because
the task framed the absorption as "template constants". Findings 4–6 are
one-sentence pins that stop the implementer inventing channels, type strings,
and producers the design never defined.
