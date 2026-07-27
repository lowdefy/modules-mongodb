# Consistency Review 4

## Summary

Top-level sweep following the [part 8 review-1](../parts/08-side-effect-dispatch/review/review-1.md) action-review pass (which cascaded edits into part 8's design plus the concept submit-pipeline spec and design). Found 3 inconsistencies — all auto-resolved. Also surveyed the post-`_completed/`-archive link state (commit `82cabf1`) and confirmed it's a known, user-deferred follow-up out of scope here.

## Files Reviewed

**Top-level:**

- `designs/workflows-module/design.md`
- `designs/workflows-module/implementation-plan.md`
- `designs/workflows-module/review/{review-1, consistency-1, consistency-2, consistency-3}.md`

**Concept docs (cross-checked for cascaded amendments):**

- `designs/workflows-module-concept/submit-pipeline/spec.md`
- `designs/workflows-module-concept/submit-pipeline/design.md`
- `designs/workflows-module-concept/engine/spec.md` (event_id contract)
- `designs/workflows-module-concept/module-surface/{spec,design}.md` (app_name var)

**Part designs touched by part 8 review (and their neighbours):**

- `parts/08-side-effect-dispatch/design.md` + `review/review-1.md`
- `parts/09-hook-invocation/design.md`
- `parts/10-tracker-subscription/design.md`
- `parts/11-group-on-complete-fanout/design.md`
- `parts/18-entity-components/design.md` (timeline rendering check)
- `parts/19-operational-apis/design.md`
- `parts/20-module-manifest/design.md` (already declares `app_name`)
- `parts/22-workflows-e2e-suite/design.md` (matrix row 8)

**Live code cross-referenced:**

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js`
- `modules/events/api/new-event.yaml`
- `modules/events/module.lowdefy.yaml`
- `modules/events/components/events-timeline.yaml`
- `modules/notifications/module.lowdefy.yaml`
- `modules/workflows/module.lowdefy.yaml`
- `apps/demo/modules/events/vars.yaml`

## Decisions Extracted from [parts/08-side-effect-dispatch/review/review-1.md](../parts/08-side-effect-dispatch/review/review-1.md)

1. **`event_id` is engine-generated on entry, not captured from `new-event`'s return.** Part 8 passes `_id: context.eventId` into the `new-event` payload; `new-event.yaml` falls back to `_uuid: true` when no `_id` is supplied. Preserves the engine-spec one-id-per-invocation contract. (review-1 #1 → resolved.)
2. **`display` is keyed by the consuming app's `app_name`** (mirroring events module's per-`display_key` projection in [events-timeline.yaml](../../../../modules/events/components/events-timeline.yaml)). Workflows module's existing `app_name` manifest var plumbs down to `WorkflowAPI.connection.app_name`. (review-1 #2 → resolved.)
3. **Default `references` includes `<entity-ref-key>: [workflow.entity_id]`** derived from `workflow.entity_collection` (strip trailing `-collection`, kebab→snake, append `_ids`). So workflow events surface on entity-page timelines without per-action authoring. Spec amended too. (review-1 #5 → resolved.)
4. **`dispatchLogEvent.js` is split** into pure `buildDefaultLogEventPayload(...)` + dispatcher `dispatchLogEvent(context, inputBag)`. Part 9 imports the pure function as the bottom layer of its three-layer event-overrides merge. (review-1 #9 → resolved.)
5. **`status_before` / `status_after` are pinned**: captured at handler entry from `context.action.status?.[0]?.stage` (pre-step-4) and the resolved `targetStatus` respectively. (review-1 #3 → resolved.)
6. **Cancel-workflow event dropped from part 8.** Concept is silent on whether `CancelWorkflow` emits an event; if needed, it's a follow-on part touching `CancelWorkflow.js` and the concept spec together. (review-1 #6 → resolved.)
7. **Error-path log events deferred to open questions** alongside part 9's `hook_error` design. (review-1 #4 → deferred.)

## Inconsistencies Found

### 1. `submit-pipeline/design.md` still showed the old `display: default:` form, missing entity-ref

**Type:** Review-vs-Design cascade (part 8 review-1 #2 + #5 amended `submit-pipeline/spec.md` but `submit-pipeline/design.md` carried the pre-amendment form).
**Source of truth:** [part 8 design § dispatchLogEvent.js](../parts/08-side-effect-dispatch/design.md) and the amended [submit-pipeline/spec.md § Default log event](../../workflows-module-concept/submit-pipeline/spec.md).
**Files affected:** `designs/workflows-module-concept/submit-pipeline/design.md:359-377` (the **Default event shape** block).
**Resolution:** Rewrote the default-event shape block to key `display` by `{app_name}`, add the `{entity-ref-key}: [<workflow.entity_id>]` line under `references`, and add explanatory paragraphs naming `connection.app_name` and the entity-collection-derived ref-key rule. Now matches the spec verbatim.

### 2. Part 8 design said "Add `app_name` as a workflows module manifest var" — Part 20 already declares it

**Type:** Internal contradiction (within the workflows-module tree).
**Source of truth:** [part 20 design § module.lowdefy.yaml > vars](../parts/20-module-manifest/design.md) — `app_name: string (required)` declared from inception (commit `de05711`). Also corroborated by [module-surface/spec.md:54-57](../../workflows-module-concept/module-surface/spec.md) declaring `app_name` as a top-level var.
**Files affected:** `designs/workflows-module/parts/08-side-effect-dispatch/design.md` § `app_name` plumbing.
**Resolution:** Rewrote the sub-section. Part 8 no longer claims to add the var; it points at [Part 20](../parts/20-module-manifest/design.md)'s existing declaration and scopes part 8's own work to (a) adding `app_name` to the `WorkflowAPI` connection schema ([schema.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js)) as a sibling edit, and (b) referencing `_module.var: app_name` from `connections/workflow-api.yaml` when Part 20 wires the connection file.

### 3. Part 9 referenced "part 8's default-payload function" generically; part 8 now pins `buildDefaultLogEventPayload`

**Type:** Stale reference (now that the name is committed).
**Source of truth:** [part 8 design § dispatchLogEvent.js](../parts/08-side-effect-dispatch/design.md) commits `buildDefaultLogEventPayload(...)` as the pinned function name.
**Files affected:** `designs/workflows-module/parts/09-hook-invocation/design.md` (event_overrides bullet + Verification line).
**Resolution:** Replaced both occurrences with `buildDefaultLogEventPayload` and noted the unkeyed `{ type, display, references, metadata }` return shape so the part 9 implementer doesn't misinterpret the merge layering.

## No Issues

Areas checked where everything was consistent:

- **Engine spec on `eventId`** ([engine/spec.md:213](../../workflows-module-concept/engine/spec.md)) — already commits "generated by `SubmitWorkflowAction` on entry; threaded through every write in this invocation". The part 8 amendment honors this verbatim.
- **Live `SubmitWorkflowAction.js`** generates `eventId: randomUUID()` on entry (line 15) and `handleSubmit.js` threads `context.eventId` into every `action.status[].event_id`. Matches part 8's commitment to pass that id into `new-event` as `_id`.
- **Module-surface concept docs** (`module-surface/{spec,design}.md`) already declare `app_name` as a top-level var with the same semantics part 8 now consumes. No drift.
- **`apps/demo/modules/events/vars.yaml`** already sets `display_key: { _ref: app_config.yaml.app_name }` — the convention part 8 relies on (`events.display_key === workflows.app_name`) is already live in the demo wiring.
- **Part 11** payload reads `event_id` "from the just-dispatched log event" — consistent with part 8's commitment to return `context.eventId` (no diverging UUIDs).
- **Part 22 matrix row 08** (`side-effects.spec.js`) — already names log event via `events.new-event`, notifications via `notifications.send-notification`, and the eventId thread. Tighter assertions about entity-ref or app_name-keyed display are owned by part 8's unit/integration tests; the e2e row stays terse.
- **Part 18 timeline rendering** — does not consume the entity-ref convention directly (the entity-page timeline component comes from the events module). No drift.
- **`new-event.yaml` extension** — the proposed `_id: { _if_none: [_payload: _id, _uuid: true] }` change is backwards-compatible with existing app-level callers (`apps/demo/.claude/guides/events.md` showed several call sites that don't pass `_id`, all of which fall through to `_uuid: true`).
- **Cancel-workflow event drop** — searched concept docs and no commitment exists; part 8's `§ Out of scope` note is the only mention.

## Out of scope here

- **`_completed/` link sweep.** Commit `82cabf1` moved parts 3, 4, 5, 6, 7, 14, 15, 21 into `parts/_completed/` and explicitly deferred fixing existing relative markdown links per user direction. Affected files include parts 8, 9, 10, 11, 12, 22, 23, and the implementation-plan / top-level design. This is a separate sweep — out of scope for the part-8 cascade. Surfaced here so it's not lost.
- **Part 3's design line 46** ("Connection schema: `databaseUri` required, optional `databaseName`/`workflowsCollection`/`actionsCollection`") has been stale since `workflowsConfig`, `changeStamp`, `actionsEnum` were added to the live schema in earlier work — pre-existing drift unrelated to part 8. Part 3 is now under `_completed/` and its design is frozen per the parts-archive policy.

## Files Modified

1. `designs/workflows-module-concept/submit-pipeline/design.md` — rewrote default-event shape block (`app_name`-keyed display, entity-ref line, explanatory paragraphs).
2. `designs/workflows-module/parts/08-side-effect-dispatch/design.md` — corrected `§ app_name plumbing` to point at Part 20's existing declaration and scope part 8's work to the connection schema field + workflow-api.yaml reference.
3. `designs/workflows-module/parts/09-hook-invocation/design.md` — pinned `buildDefaultLogEventPayload` (event_overrides bullet + Verification line).
