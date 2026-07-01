# Consistency Review 3 (parent-level)

## Summary

Parent-level consistency pass following the parent-scope review-1 action-review cycle (11 findings resolved — handler rename, sibling sub-design rewrites, `resolve_error` interaction rename, always-on notifications dispatch). Most sub-design files were rewritten in place during the action review, so this pass mainly sweeps for dangling references to the v0 surfaces that survived. Found **9 residual drifts** — all auto-resolved. None required user input.

## Files Reviewed

**Parent-level:**

- [designs/workflows-module/design.md](../design.md)
- [designs/workflows-module/spec.md](../spec.md)

**Sub-designs (design.md + spec.md per sub-design, swept for stale-shape references):**

- engine, module-surface, action-authoring, ui, action-groups, submit-pipeline, call-api

**Reviews (decision register inputs):**

- [review-1.md](designs/workflows-module-concept/review/review-1.md) — 11 findings, all resolved.
- [consistency-1.md](designs/workflows-module-concept/review/consistency-1.md), [consistency-2.md](designs/workflows-module-concept/review/consistency-2.md) — historical parent-level.
- Sub-design reviews under each sub-design's `review/` folder — historical, already propagated.

**Tasks / plans:** None exist yet.

## Inconsistencies Found

### 1. module-surface manifest connection description named the old handler

**Type:** Stale Reference (handler rename from review-1 #1)
**Source of truth:** submit-pipeline Decision 1 + engine D1 rename to `SubmitWorkflowAction`.
**Files affected:** [module-surface/design.md:57](../module-surface/design.md) (`workflow-api` connection description)
**Resolution:** Changed "Server-side WorkflowAPI connection (UpdateWorkflowActions, StartWorkflow, CancelWorkflow)" to "(SubmitWorkflowAction, StartWorkflow, CancelWorkflow)" in the manifest sketch.

### 2. action-authoring's instanced-action spawning paragraph used the old handler name

**Type:** Stale Reference
**Source of truth:** review-1 #1 (handler renamed to `SubmitWorkflowAction`).
**Files affected:** [action-authoring/design.md:860](../action-authoring/design.md)
**Resolution:** Changed "Both paths flow through the same `UpdateWorkflowActions` engine API" to "Both paths flow through the same `SubmitWorkflowAction` engine handler."

### 3. module-surface starting-action resolution paragraph referenced the old handler

**Type:** Stale Reference
**Source of truth:** review-1 #1.
**Files affected:** [module-surface/design.md:268](../module-surface/design.md)
**Resolution:** "Both paths flow through the same `UpdateWorkflowActions` write path" → "Both paths flow through the same `SubmitWorkflowAction` write path."

### 4. call-api depth-limit example referenced the dropped `submit-action` Api

**Type:** Stale Reference (submit-action removed per review-1 #2)
**Source of truth:** submit-pipeline Decision 2 + module-surface review-1 #2 resolution.
**Files affected:** [call-api/design.md:88](../call-api/design.md) (Decision 3 "Depth-limit guard"), [call-api/spec.md:65](../call-api/spec.md) (example call chain)
**Resolution:** Replaced "submit-action" with "the per-action endpoint (`update-action-{action_type}`)" in the design's recursion example; replaced the spec's depth-error sample chain with `SubmitWorkflowAction → pre-hook(qualify-pre-submit) → update-action-qualify → SubmitWorkflowAction → ...`.

### 5. engine sub-design described `on_complete` fan-out as "outer Layer-1 orchestration"

**Type:** Review-vs-Design (review-1 #5 + submit-pipeline Decision 6: engine-internal fan-out as step 11 of the lifecycle)
**Source of truth:** action-groups Decision 6 + submit-pipeline Decision 1.
**Files affected:** [engine/design.md:74](../engine/design.md) (Action groups capability bullet), [engine/spec.md:165](../engine/spec.md) (`SubmitWorkflowAction` capabilities)
**Resolution:** Both bullets rewritten to "the engine fans out one `context.callApi` per declared `on_complete` engine-internally as step 11 of the submit-pipeline lifecycle (see action-groups Decision 6, submit-pipeline Decision 1)." Engine spec's capability also gained `tracker_fired?` in the return-value list to match submit-pipeline's `SubmitWorkflowAction` return.

### 6. submit-pipeline Next Step list had a stale follow-up checklist for cross-design rewrites

**Type:** Stale Status (the cross-ref pass landed in the review-1 action-review cycle)
**Source of truth:** review-1 findings #2, #3, #4, #5 resolutions (action-authoring, module-surface, ui rewrites all completed).
**Files affected:** [submit-pipeline/design.md:461](../submit-pipeline/design.md) (Next Step step 6); [submit-pipeline/spec.md:331-333](../submit-pipeline/spec.md) (Implementation order steps 6-8)
**Resolution:** Dropped the "Cross-ref pass: update action-authoring / module-surface / ui" step from design.md Next Step and the matching three "Update {sub-design} spec" steps from spec.md's implementation order. The remaining steps (call-api lands, button vocabulary lock, plugin handler, `makeWorkflowApis`, template button vocabulary) are the actual implementation milestones.

### 7. Engine design's connection-structure listing didn't enumerate the new SubmitWorkflowAction helper files

**Type:** Internal Contradiction (submit-pipeline spec listed `handleSubmit.js`, `invokePreHook.js`, `invokePostHook.js`, `computeAutoUnblocks.js`, `dispatchLogEvent.js`, `dispatchNotifications.js`, `fireGroupOnComplete.js` but pointed at engine spec as canonical; engine design hadn't been updated)
**Source of truth:** submit-pipeline consistency-1's spec-pointer commitment + the lifecycle steps from submit-pipeline Decision 1.
**Files affected:** [engine/design.md:28-47](../engine/design.md) (`src/connections/WorkflowAPI/` connection-structure listing)
**Resolution:** Added the seven SubmitWorkflowAction helper files (handler, pre/post hook invokers, auto-unblock computation, log-event dispatch, notification dispatch, group on_complete fan-out) to the engine design's directory listing, each with a one-line description of its role.

## No Issues

Verified consistent — no edits needed:

- **Parent design + parent spec** are aligned (sub-design table lists all seven; worked example uses the new shape; Risks bullets match the new contracts; core invariants reflect `SubmitWorkflowAction` + per-call/per-entry `force`).
- **`resolve_error` rename (review-1 #7)** fully propagated — submit-pipeline design + spec, parent design's worked-example "Build-time output" all use `resolve_error`; no `submit_error` references survive outside review files.
- **Always-on notifications dispatch (review-1 #8)** consistent across submit-pipeline design Decision 6, spec side-effects table, parent design's worked-example runtime step 8, and module-surface's dependency description.
- **Hook auth gate (review-1 #9, prior cycle)** consistent: submit-pipeline design + spec, action-authoring spec's per-action build-time validation list.
- **`form_data` flat layout, `.error` / `.review` sub-keys dropped (prior cycle)** consistent: engine design + spec, module-surface design + spec, action-authoring design + spec, ui design + spec, call-api design.
- **`UpdateWorkflowActions` → `SubmitWorkflowAction` rename** fully propagated across the seven sub-design design.md + spec.md files (engine, action-groups, submit-pipeline, module-surface, action-authoring, ui, call-api) and the parent files.
- **`force: true` per-call + per-entry** invariant aligned: engine D4 design.md + engine spec.md payload + parent spec invariant all match.
- **Tracker sync/async closed (review-1 prior cycle, item #7)** — no `(open: sync/async)` markers survive anywhere in the tree.
- **"Layer 1" framing** appears once in action-groups/design.md as an explicit "Earlier drafts framed the fan-out as a Layer 1 routine step" historical reference — intentional preservation of the rejected-alternative rationale.
- **"submit-action" / "submit_hook" / "UpdateWorkflowActions" historical references** survive in submit-pipeline's framing prose (the "this design supersedes X" sections in design.md opening + spec Status line + Renamed list + Dropped from module-surface list) and in module-surface Decision 5's "earlier drafts" superseded-section pointer. All preserve "we chose X over Y because Z" without dragging the full prior exploration along.

## Open follow-ups

None. The parent-level review-1 action-review + this consistency pass clear the remaining drift surface. Tasks / plans haven't been generated yet — the next natural step is `/r:design-task` per sub-design (call-api first as the gate, then engine + action-authoring in parallel, then action-groups + submit-pipeline, then module-surface + ui as consumers — per the parent design's Next Step).
