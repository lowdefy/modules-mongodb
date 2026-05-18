# Consistency Review 2 (parent-level)

## Summary

Parent-level consistency pass triggered by the submit-pipeline sub-design's review-1 + consistency-1 cycle, which committed major changes (engine-orchestrated submit lifecycle, per-action endpoints, pre/post hooks, flat `form_data` layout, hook auth rule). The parent design.md and parent spec.md still described the pre-submit-pipeline routine-orchestrated shape (`submit_hook`, `submit-action`, `UpdateWorkflowActions`). Found six parent-level drifts — all auto-resolved by rewriting the affected sections to use the new shape. The user authorized a full rewrite (option (a)) of the worked example over a banner-only fix. Sub-design files (module-surface, action-authoring, ui) still describe the v0 shape internally; submit-pipeline's cross-ref section already flags those as follow-up sub-design passes and they were left untouched here.

## Files Reviewed

**Parent-level:**

- [designs/workflows-module/design.md](../design.md)
- [designs/workflows-module/spec.md](../spec.md)

**Sub-designs (design.md + spec.md, scanned for cross-design ripple):**

- engine, module-surface, action-authoring, ui, action-groups, submit-pipeline, call-api

**Reviews (decision register inputs):**

- [review-sam-1.md](review-sam-1.md), [review-steph-1.md](review-steph-1.md) — parent-level, both annotated.
- [submit-pipeline/review/review-1.md](../submit-pipeline/review/review-1.md) — 15 findings, all resolved.
- [submit-pipeline/review/consistency-1.md](../submit-pipeline/review/consistency-1.md) — submit-pipeline-scoped consistency, 10 fixes.
- Other sub-design reviews (engine, action-authoring, module-surface, ui) — historical, already propagated by the prior parent-level consistency-1.

**Tasks / plans:** None exist yet.

## Inconsistencies Found

### 1. Parent design's opening paragraph described the v0 transition model

**Type:** Review-vs-Design (submit-pipeline supersedes the routine-orchestrated shape)
**Source of truth:** submit-pipeline design + spec (engine-orchestrated lifecycle).
**Files affected:** [design.md:3](../design.md)
**Resolution:** Replaced "two-layer transition model (`blocked_by` + `submit_hook`) sitting on `UpdateWorkflowActions` / `StartWorkflow` / `CancelWorkflow` primitives" with a description of the engine-orchestrated submit pipeline: `SubmitWorkflowAction` plugin handler, per-interaction `hooks:` as the author's pre/post extension points, engine-driven form_data / log event / notifications / tracker propagation.

### 2. Sub-design table's module-surface row listed `submit-action` as a module API

**Type:** Review-vs-Design (submit-pipeline drops `submit-action`)
**Source of truth:** submit-pipeline Decision 2; module-surface spec (post-submit-pipeline) lists four operational APIs.
**Files affected:** [design.md:10](../design.md) (sub-design table)
**Resolution:** Replaced "the four module APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `submit-action`)" with "the four module APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`)" and added a note that the submit endpoint is per-action and resolver-emitted (`update-action-{action_type}`) per submit-pipeline.

### 3. Parent design "Problem" framing claimed four operational module APIs including `submit-action`

**Type:** Stale Reference
**Source of truth:** module-surface (four operational APIs); submit-pipeline (per-action submit endpoints).
**Files affected:** [design.md:22](../design.md)
**Resolution:** Reworded the bullet: "A small server API surface — four module-level operational APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`) plus one resolver-generated per-action submit endpoint (`update-action-{action_type}`) per form / task action."

### 4. Parent design's worked example was a complete v0 walkthrough

**Type:** Review-vs-Design (full rewrite needed; user picked option (a) — substantial rewrite)
**Source of truth:** submit-pipeline design + spec; engine D5 form_data layout; action-authoring `hooks:` / `interactions:` / `event:` grammar.
**Files affected:** [design.md:46-255](../design.md) (entire "Worked example" section)
**Resolution:** Rewrote end-to-end:

- File layout: `api/qualify-submit-hook.yaml` → `api/qualify-pre-submit.yaml` (etc.) per the new pre/post hook authoring shape; added the hook auth comment.
- `qualify.yaml`: removed `submit_hook:`, added `hooks: { submit_edit: { pre: qualify-pre-submit } }`.
- `qualify-pre-submit.yaml`: rewrote as a Lowdefy Api with `auth: { roles: [account-manager] }` (matching the action's `access.roles`), routine returns `{ actions: [...], event_overrides: {...} }`.
- `schedule-followup.yaml`: noted task `submit_edit` is the one interaction where the caller supplies `current_status` directly (status selector on `task-edit`).
- Build-time output: `makeWorkflowApis` emits `update-action-{action_type}` per form/task action (not `{workflow}-{action}-submit`); calls out `hook.auth.roles ⊇ action.access.roles` build-time validation.
- Runtime flow: rewrote steps 5-10 around the per-action endpoint + button-vocabulary + `SubmitWorkflowAction` 11-step lifecycle, including the pre-hook → auto-unblock → write → side effects → post-hook ordering. Step 10 now mentions `result.tracker_fired` on the parent submit response.
- Closing paragraph: changed "the four sub-designs … are each load-bearing" to enumerate all seven and explain each one's role.

### 5. Non-Goals justification for "no helper library" cited the dropped `submit-action` API

**Type:** Stale Reference (the justification cited a removed API)
**Source of truth:** submit-pipeline (engine handler owns the lifecycle).
**Files affected:** [design.md:278](../design.md)
**Resolution:** Rewrote the bullet to cite `SubmitWorkflowAction` and the per-interaction pre/post hook authoring model. Non-Goal itself (no helper library) preserved.

### 6. Parent design Risks list referenced `submit-action` and `UpdateWorkflowActions` for cross-module endpoint resolution and API-surface stability

**Type:** Review-vs-Design (submit-pipeline replaced both)
**Source of truth:** submit-pipeline (calls `new-event` / `send-notification` / hooks via `context.callApi` from the plugin handler); call-api sub-design owns the primitive.
**Files affected:** [design.md:296-297](../design.md) (Risks)
**Resolution:** Rewrote both bullets. Cross-module endpoint resolution risk now refers to the engine handler invoking `context.callApi` (and points at the call-api sub-design). API surface stability risk now refers to the per-action endpoint + pre/post hook contract rather than the `submit-action` payload.

### 7. Parent spec's core invariants described `submit-action` as the user-submit path and used pre-submit-pipeline `UpdateWorkflowActions` wording

**Type:** Review-vs-Design
**Source of truth:** submit-pipeline spec.
**Files affected:** [spec.md:27,29,30,32](../spec.md) (four bullets in "Core invariants")
**Resolution:**

- "**`submit-action` is the user-submit path**" → "**`SubmitWorkflowAction` is the user-submit path**" with description of the per-action endpoint + interaction → status resolution + per-call/per-entry `force` semantics.
- "submit-time (`submit-action` re-checks role gate)" → "submit-time (the `SubmitWorkflowAction` handler re-checks the role gate)."
- "`makeWorkflowApis` emits one endpoint per form action only" → "one endpoint per form / task action" with `update-action-{action_type}` shape and the hook auth build-time validation.
- "recomputed eagerly inside `UpdateWorkflowActions`" → "recomputed eagerly inside `SubmitWorkflowAction`"; "an outer Layer-1 orchestration mechanism (deferred)" → "fans out one `context.callApi` per declared `on_complete` (mechanism in submit-pipeline Decision 6, dependent on call-api)."

### 8. Parent spec's worked example used v0 file layout + v0 runtime flow

**Type:** Review-vs-Design
**Source of truth:** submit-pipeline; aligned with the rewritten parent design worked example.
**Files affected:** [spec.md:55-69](../spec.md) ("App-side files" + "Runtime flow")
**Resolution:**

- File layout: hook files renamed to the pre/post-hook authoring convention (`qualify-pre-submit.yaml`, `send-quote-pre-submit.yaml`, `send-quote-post-approve.yaml`).
- Runtime steps 3-6 rewritten to describe the per-action endpoint + interaction value flow, the `SubmitWorkflowAction` lifecycle, and the `tracker_fired` signal on the submit response.

## No Issues

Verified consistent — no edits needed:

- **Seven-sub-designs framing** in parent design + parent spec (added in the prior submit-pipeline session). Submit-pipeline and call-api are both listed in the sub-design table and the spec's bullet list.
- **Submit-pipeline ↔ engine engine D5 form_data layout** propagation: confirmed during the submit-pipeline consistency-1 pass; the parent design and spec don't redocument form_data structure (it's owned by engine D5), so no cascade.
- **Hook auth rule (`hook.auth.roles ⊇ action.access.roles`)** lives in submit-pipeline design + spec and action-authoring spec. The parent files don't describe hook auth specifics — they would over-document if they did. No parent edit needed.
- **Per-entry `force` on `actions[]`** lives in engine D4 + submit-pipeline pre-hook contract. Parent files don't describe entry-level engine semantics; no parent edit needed.
- **Open-questions and risks lists** at the parent level (engine dual-runtime build, ACID, resolver-from-template spike, write contention, footgun) — none reference submit-pipeline-superseded surfaces; all still apply.
- **Call-api sub-design** has its own Decision 4 error-propagation wording that the submit-pipeline consistency-1 pass already updated (engine D5 `status[0]` carries error context, not `form_data.{action_type}.error`).

## Open follow-ups (not consistency drifts within parent-level scope — surfaced for downstream work)

The submit-pipeline cross-ref already names these and they're sub-design rewrites, not consistency fixes:

- **module-surface/design.md + spec.md still describe `submit-action`** as an exported API with a full payload contract, routine, and notifications-dispatch description. The whole `submit-action` section needs to be replaced with a pointer at submit-pipeline plus updated descriptions of the four remaining operational APIs.
- **action-authoring** does not document the new authoring vocabulary added by submit-pipeline review-1: `hooks:` block on the action (replacing `submit_hook:`), `interactions:` block (per-interaction `status:` overrides), `event:` block (per-interaction log-event overrides). The cross-ref flags these; the grammar additions belong in an action-authoring pass.
- **ui/design.md + spec.md** describe the form-action page templates without the five-button vocabulary (`submit_edit`, `not_required`, `submit_error`, `approve`, `request_changes`). The cross-ref flags this; the template descriptions belong in a ui pass.

These three are the natural next consistency / design-task targets once submit-pipeline implementation work begins.
