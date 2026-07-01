# Review 2 — Codebase-fit corrections & under-specified mechanics

## Current-state claims that don't match the code

### 1. Two of the three "display surfaces read status_map" callouts are factually wrong

> **Resolved.** Rewrote "Current state → Display layer" to (a) frame the gap as the three aggregations projecting `$<app_name>.{message|link}` against keys the engine never writes, (b) drop the `actions-on-entity.yaml:92-99` and `workflow-overview.yaml:158/177/196` claims, and (c) keep the `group-overview.yaml:274/293/312` callout as the only page-side `status_map` read. Updated proposed-change item 8 and "Files changed → Modified" to reflect that only `group-overview.yaml` needs a page-side switch; the other two display surfaces light up via the existing aggregation projections once the engine writes `action[appName]`.

The design's "Current state → Display layer" section ([design.md:326-329](../design.md)) says three surfaces read fields that don't exist:

- `components/actions-on-entity.yaml:92-99` — reads `a.status_map[stage][appName]`.
- `pages/workflow-overview.yaml:158, 177, 196` — reads `_state: actions_list.$.status_map`.
- `pages/group-overview.yaml:274, 293, 312` — same.

Only the third is accurate.

- [`components/actions-on-entity.yaml:66-99`](../../../../../../modules/workflows/components/actions-on-entity.yaml) renders an `ActionSteps` block with `items: _state: entity_workflows.$.actions`. The component never references `status_map`. The `ActionSteps` block plugin ([`ActionSteps.js:171-180`](../../../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js)) reads top-level `action.link.pageId` / `action.message` off each item — exactly the target shape this part wants.
- [`pages/workflow-overview.yaml:147-168`](../../../../../../modules/workflows/pages/workflow-overview.yaml) already reads `_state: actions_list.$.message` and `_state: actions_list.$.link` directly off the per-action row. Lines 158/177/196 cited by the design are unrelated chrome (`actions_list.$.link` visibility check, then form-data viewability tests).
- The three read APIs ([`get-entity-workflows.yaml:62-71`](../../../../../../modules/workflows/api/get-entity-workflows.yaml), [`get-workflow-overview.yaml:40-49`](../../../../../../modules/workflows/api/get-workflow-overview.yaml), [`get-action-group-overview.yaml:48-57`](../../../../../../modules/workflows/api/get-action-group-overview.yaml)) already project `message`/`link` from `$<app_name>.message` / `$<app_name>.link` in the `$lookup` pipeline. Surfaces read those projected fields, not `status_map`.

What's actually broken today: those aggregations dot-into a top-level `${appName}` subdoc on the action that the engine never writes — so every projected `message`/`link` resolves to `undefined` and surfaces render blank. The fix is the same (engine writes the cell), but the proposed-change item 8 framing is wrong: only `group-overview.yaml` needs the page-side switch from `status_map[stage][appName]` to `[appName]`. The other two are already in the target shape; they just need the engine to start producing the data the aggregation already projects.

**Fix:**

- Rewrite "Current state → Display layer" to (a) drop the `actions-on-entity.yaml:92-99` and `workflow-overview.yaml:158/177/196` lines (they don't reference `status_map`); (b) add the three aggregation projections in `api/*.yaml` as the actual read path that resolves blank today; (c) keep the `group-overview.yaml:273/292/311` callout — that one's correct.
- Drop the `actions-on-entity.yaml` and `workflow-overview.yaml` switches from "Files changed". Keep `group-overview.yaml` — switch it to read `actions_list.$.message` / `actions_list.$.link` (matching what `workflow-overview` already does), or add aggregation projection to `get-action-group-overview` if the page benefits from the projected shape (it already has it — line 48-57). Either way, the page-side `_get from: status_map ...` blocks at lines 265-317 are the only display-side edit this part needs.

## Under-specified mechanics

### 2. `computeEngineLinks` signature is missing workflow context

> **Resolved.** Changed the signature to `computeEngineLinks(actionConfig, stage, actionDoc)` where `actionDoc` is the **merged** doc — `{ ...actionDocBeforeWrite, ...callerFields }` at update call sites, the in-memory draft for `createAction`. The merged doc carries every input the per-kind rules need: `_id` (task/form `urlQuery`), `workflow_type` (form `pageId`, already on the action doc per D10), `child_workflow_id` (tracker `urlQuery`). D4 now has an explicit per-kind table for `pageId` and `urlQuery`; D11 spells out the merge rule shared across all three call sites; the `computeEngineLinks.js` "New files" entry documents the signature; the `.test.js` entry asserts the per-kind shapes and the merged-doc tracker case.

D11 ([design.md:190-228](../design.md)) and the "New files" entry specify `computeEngineLinks(actionConfig, stage, actionId)`. D4 ([design.md:67-89](../design.md)) says `kind: form` "uses the same shape against form-emitted page IDs from Part 13" and `kind: tracker` "links to the child workflow's `workflow-overview` (page ID resolved via the existing `child_workflow_id` field on tracker action docs)."

Neither works with the proposed signature:

- Form page IDs are `${workflow.type}-${action.type}-${verb}` ([`makeActionPages.js:48`](../../../../../../modules/workflows/resolvers/makeActionPages.js)). To produce them, `computeEngineLinks` needs `workflow.type` — not on `actionConfig`. Either pass the workflow doc, or extend `actionConfig` upstream to include the workflow type.
- Tracker link target requires `child_workflow_id`, which lives on the action doc, not the config. And on `StartWorkflow.js:117-128` the same call that sets `child_workflow_id` is also the one that pushes `in-progress` — so the link must be computed against `{ ...actionDocBeforeWrite, ...fields }`, not the raw pre-write doc. Otherwise the tracker's `in-progress` cell gets a link with `child_workflow_id: null`.

**Fix:**

- Change `computeEngineLinks`'s signature to `(actionConfig, stage, actionId, { workflowType, actionDocBeforeWrite, extraFields })` or similar — enough context to build the per-kind URL.
- Add a tracker subcase explicit in the design: link computation runs against the merged `{ ...actionDocBeforeWrite, ...fields }` so the same `updateAction` call that sets `child_workflow_id` also produces a link that references it.
- D4's link table is shaped around `kind: task`. Add an explicit per-kind page-ID rule:
  - task → `task-{verb}` (module-scoped).
  - form → `${workflow.type}-${action.type}-{verb}` (resolves through `_module.pageId`).
  - tracker → host-app workflow-overview, `pageId: <module-scoped 'workflow-overview'>`, `urlQuery: { workflow_id: <child_workflow_id> }` (not `action_id`).
- The "urlQuery is always `{ action_id }`" claim at [design.md:87](../design.md) is wrong for trackers — call out the exception.

### 3. `metadata` is overloaded between render context and event payload

> **Resolved.** Dropped the top-level `metadata` alias from the event-display render context. Templates reach action metadata via `action.metadata.*` (the action doc carries the merged metadata post-write — events fire after the write). Updated: proposed-change item 9 list, D14's render-context table, the D14 "convenience" paragraph (replaced with an explicit "no top-level `metadata` binding" note explaining the collision), the `renderEventDisplay.js` "New files" entry inputs/list, and `dispatchLogEvent.js` "Modified" entry. The `renderEventDisplay.test.js` `action.metadata.*` assertion stays — that's the surviving path. Note this collision applies only to event display (D14); action-display context (D10) spreads metadata flat for short references on cell templates and isn't affected.

D14's render context binds `metadata` to the action's accumulated metadata ([design.md:269](../design.md)). The existing engine event payload also has a `metadata` field — [`dispatchLogEvent.js:58-65`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js) builds it with `action_type, workflow_type, interaction, current_key, status_before, status_after, comment`. That object lands on the event doc as `metadata: { ... }`.

So `{{ metadata.X }}` in an event-display template is ambiguous: is `X` an action-metadata key (e.g. `physical_id`) or an event-metadata key (e.g. `status_before`)? The design picks the action-metadata reading, but every existing template ergonomics around `dispatchLogEvent` (built-in + tests + four-layer merge) treats `metadata` as the event-payload field.

**Fix:**

- Rename the render-context binding to avoid the collision — `action_metadata` would be unambiguous; or just drop the top-level alias (it's already reachable as `action.metadata`) and remove the convenience that D14 calls out as "convenience, not authority." That cuts the collision and saves one binding.
- If the alias stays, add an explicit note in D14 spelling out that the template's `metadata` is **action.metadata**, not the event payload's `metadata` field. Spell out which keys are available (action-supplied) vs which are not (no `interaction`/`status_*` keys under `metadata`).

### 4. Default event template uses bindings that the new render context doesn't expose

> **Resolved.** "Files changed → Engine event-default templates" now spells out the rename (`{{ action_type }}` → `{{ action.type }}`), gives the new default title verbatim (`"{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}"`), and calls out the two `dispatchLogEvent.test.js` expectations that need to be updated alongside the template change.

[`dispatchLogEvent.js:3-4`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js):

```js
const DEFAULT_TITLE_TEMPLATE =
  "{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}";
```

The new render context (D14, [design.md:262-272](../design.md)) binds `user`, `action`, `workflow`, `interaction`, `metadata`, `status_before`, `status_after` — but **not** `action_type`. The "Files changed → engine event-default templates source" bullet says "change to plain Nunjucks template strings, matching `event_display`", but doesn't enumerate the binding renames. After the switch, the existing default would render `marked  as done` (empty `action_type`).

**Fix:** rewrite the default explicitly in the design — e.g. `"{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}"`. Also list the two existing test expectations that need updating ([`dispatchLogEvent.test.js`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.test.js)) so the implementer doesn't discover the rename via failing tests with no clear "correct" replacement.

### 5. `renderTree` walker has no home in "New files"

> **Resolved.** Added `plugins/modules-mongodb-plugins/src/utils/renderTree.js` and `renderTree.test.js` to "New files". The walker is the single source for the recursive Nunjucks pass; both `renderStatusMap.js` and `renderEventDisplay.js` import it from `utils/`, alongside `parseNunjucks.js`.

D13 ([design.md:237-253](../design.md)) defines the walker inline but lists no `renderTree.js`. Both `renderStatusMap.js` and `renderEventDisplay.js` need it ([design.md:551, 557](../design.md)). The "New files" entries describe both helpers as "uses the same `renderTree` walker" — implying it's shared, but the file isn't declared.

Per the "One correct way" principle, the walker should live in one place — likely `src/utils/renderTree.js` alongside `parseNunjucks.js`.

**Fix:** add `plugins/modules-mongodb-plugins/src/utils/renderTree.js` (and tests) to "New files". Update the `renderStatusMap.js` / `renderEventDisplay.js` "New files" entries to import from there.

## Scope / mechanics gaps

### 6. Parent-tracker `updateAction` path in `StartWorkflow` needs link computation against merged fields

> **Resolved.** D11's "Engine-link merge rule" paragraph spells out that all three call sites compute `mergedActionDoc = { ...actionDocBeforeWrite, ...callerFields }` and pass it into both `renderStatusMap` and `computeEngineLinks`. The `updateAction` bullet under D11 explicitly notes the `StartWorkflow.js:117-128` parent-tracker path: the same `updateAction` call that sets `child_workflow_id` now produces an `in-progress` tracker link that references it. The `computeEngineLinks.test.js` plan asserts this case.

[`StartWorkflow.js:117-128`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js) calls `updateAction({ actionId: parent_action_id, newStage: 'in-progress', fields: { child_workflow_id, child_entity_id, child_entity_collection } })` to advance the parent tracker. With render moved inside `updateAction`, this path inherits — but per finding #2, tracker link computation needs `child_workflow_id`, which is being set by this very call.

The design's D11 pipeline puts `...fields` (caller-supplied $set) and `...engineLinks` into the same `$set`. If `engineLinks`is computed pre-pipeline using`actionDocBeforeWrite`only, the parent's`in-progress`cell gets`link: { workflow_id: null }`because the fetched doc still has`child_workflow_id: null`.

**Fix:** compute engineLinks against `{ ...actionDocBeforeWrite, ...fields }` so caller-supplied fields participate. Document the rule in D10 (render context) and D4 (link computation).

### 7. Cancel/Close cascade's post-sweep summary still needs a read

> **Resolved.** Added a Cancel/Close ordering paragraph at the end of D11: post-sweep summary recompute runs after `bulkWrite` completes, preserving today's read-after-write structure. The switch to `bulkWrite` is mechanical and doesn't alter the two-write shape.

The design's D11 ([design.md:186-228](../design.md)) replaces the cascade's `MongoDBUpdateMany` with `bulkWrite`. [`CancelWorkflow.js:98-129`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) then does a `MongoDBFind` over all actions to recompute the workflow summary and groups. CloseWorkflow has the same shape. The design doesn't say whether the post-sweep summary read happens before or after the bulkWrite — it must be after (the swept actions need to land on disk first), but the existing two-write structure is preserved either way.

**Fix:** add a one-liner under D11 confirming the post-sweep summary read runs after `bulkWrite` completes (no structural change from today — just confirming the bulkWrite preserves the read-after-write invariant).

### 8. `createAction` sentinel substitution needs `_id` from the draft

> **Resolved.** Extended the `createAction.js` "Modified" bullet to spell out the ordering: assign `draft._id = randomUUID()` first (today's behaviour at line 31), then call `renderStatusMap` with `actionId = draft._id` so sentinel substitution can swap `{ action_id: true }` against the just-assigned id.

For `kind: custom`, sentinel substitution swaps `{ action_id: true }` → UUID ([design.md:91-96](../design.md), D5). [`createAction.js:31`](../../../../../../plugins/modules-mongodb-plugins/src/connections/shared/createAction.js) generates `_id = randomUUID()` inline. The "Modified" bullet for `createAction.js` doesn't specify the order: substitute against `draft._id` before the doc is returned.

**Fix:** add to the `createAction.js` "Modified" bullet: "sentinel substitution runs after `_id` is assigned on the draft; pass `draft._id` into the renderer."

### 9. `payload.display` shape conflict with event_overrides

> **Resolved.** Renamed the action-cell override payload field from `display` to `action_display`. The new name pairs naturally with `action.metadata`, clearly signals "the action's per-app cell" (not the event doc's display block), and keeps the established `event_overrides.{interaction}.display.{app}` channel — used across modules and tests — untouched. Updated: D8 code example + mechanics paragraph (plus an explicit disambiguation note on the field names), the data-flow diagram step, the `renderStatusMap.js` "New files" entry signature (`payloadDisplay` → `actionDisplay`), the `start-workflow.yaml` / `makeWorkflowApis.js` / `README.md` "Modified" bullets, and the override-path test in the Demo + tests section.

D8 introduces caller-supplied `payload.display` ([design.md:136-149](../design.md)) for per-call cell override. The submit pipeline already has `params.event_overrides.{interaction}.display.{app}` (Part 9's four-layer merge — see [`dispatchLogEvent.test.js:174`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.test.js) and `mergeEventOverrides`). Two completely different "display" payloads with the same name on the same endpoint:

- `payload.display.{slug}` — action-cell override, written to action doc top-level.
- `params.event_overrides.{interaction}.display.{slug}.title` — event-payload override, written to event doc.

A caller passing `display: { demo: { message: 'X' } }` at the top level of Submit means action-cell override. A caller passing `event_overrides: { approve: { display: { demo: { title: 'Y' } } } }` means event-display override. The names collide in documentation and test naming.

**Fix:** rename one. The least-invasive option is to name the action-cell override `action_display` (or `status_display`) on the public payload. Update D8, the `start-workflow.yaml` / `makeWorkflowApis.js` "Modified" entries, and the README documentation bullet. Alternatively, keep `display` and add a one-line disambiguation under the `start-workflow.yaml` "Modified" bullet so the implementer doesn't conflate the two.

## Minor

### 10. `urlQuery: { action_id }` blanket claim is wrong for trackers

> **Resolved.** D4's blanket "`urlQuery` is always `{ action_id }`" claim is gone. Replaced with a per-kind table: task/form use `{ action_id: action_doc._id }`, tracker uses `{ workflow_id: action_doc.child_workflow_id }` (with `link: null` when `child_workflow_id` is null). A note explicitly says "URL carries identity, page fetches the rest server-side" so the underlying principle — minimal URL surface — is still spelled out, just not as a false universal.

[design.md:87](../design.md) — "`urlQuery` is always `{ action_id }`." For `kind: tracker`, the link targets the child workflow's overview page, which is keyed by `workflow_id`, not `action_id` (see [`actions-on-entity.yaml:64-65`](../../../../../../modules/workflows/components/actions-on-entity.yaml) for the existing convention). Tied to finding #2 — fix together.

### 11. Worked example's `'Awaiting installation of {{ form_data.physical_id }}'` template never resolves on Start

> **Resolved.** No design change — the reviewer's own re-check confirms the worked example is internally consistent (Start uses `metadata.physical_id`; later transitions use `action.*` fields). Annotation-only.

The worked example at [design.md:438-457](../design.md) uses `{{ metadata.physical_id }}` in the `action-required` cell (line 448), and the StartWorkflow payload (line 469) passes `metadata: { physical_id: 'D-42' }`. The text "`'Install D-42.'`" in the post-Start doc is consistent. Good.

But the explanatory text earlier ([design.md:90](../design.md) — "Start templates referencing `assignees[0].name` would silently fail today" was a review-1 concern that's now resolved by D10's "draft action doc" decision) is still accurate context — `assignees` is on the draft so `{{ assignees[0].name }}` would resolve at Start. Just confirm the worked example covers both paths (a Start with `metadata.*`, and a later transition with `action.*`) — it does. No fix, just verified.

### 12. `actions-on-entity.yaml` listed in "Files changed → Modified" should be removed

> **Resolved.** Dropped the `components/actions-on-entity.yaml` and `pages/workflow-overview.yaml` bullets from "Files changed → Modified" (handled together with finding #1). Only `pages/group-overview.yaml` remains, with an explanatory line about why the other two need no edits.

Per finding #1, `components/actions-on-entity.yaml` doesn't need any code edits. Remove the bullet at [design.md:574](../design.md). Same for `pages/workflow-overview.yaml` at line 575 — already in target shape.

## Summary

Two concrete factual mistakes (display surfaces and demo file states) and three under-specified mechanics (engine link computation across kinds, metadata binding overload, render walker location). All are fixable inside the design without restructuring. The render-on-write architecture itself is sound; the gaps are at the surface and signature levels.
