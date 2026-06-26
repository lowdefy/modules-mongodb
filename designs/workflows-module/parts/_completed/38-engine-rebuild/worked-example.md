# Part 38 — Worked example (Submit)

A full `SubmitWorkflowAction` invocation walked through all five phases. Extracted from [design.md](designs/workflows-module/parts/_completed/38-engine-rebuild/design.md) § Worked example — decision references (D4, D7, D9, D11, D15, D16) resolve there.

**Workflow:** an installation workflow with three actions in one group:

```yaml
type: installation
action_groups:
  - id: install
    actions:
      - { type: install-step, kind: simple, action_group: install }
      - { type: install-verify, kind: form, action_group: install, blocked_by: [install-step] }
      - { type: install-cleanup, kind: simple, action_group: install, blocked_by: [install-step] }
```

State before submit:

- `install-step`: `action-required`
- `install-verify`: `blocked` (blocked_by install-step)
- `install-cleanup`: `blocked` (blocked_by install-step)
- Workflow summary: `{ done: 0, not_required: 0, total: 3 }`

**Caller submits:** `signal: submit` against `install-step` with `metadata: { physical_id: "D-42" }`. `install-step` declares no `review` verb in `access` (no app declares it), so `submit` lands `done` (the action-global `hasReview` rule from D4, identical for form and simple kinds). No `target_status` — the v0 simple selector is gone (state-machine.md review #6).

**Load phase:**

```js
loadedState = {
  workflow: {
    _id: "w1",
    summary: { done: 0, not_required: 0, total: 3 },
    groups: [{ id: "install", status: "in-progress" }],
    form_data: {},
    /* ... */
  },
  actions: [
    { _id: "a-step", type: "install-step", kind: "simple", status: [{ stage: "action-required" }], blocked_by: [] },
    { _id: "a-verify", type: "install-verify", kind: "form", status: [{ stage: "blocked" }], blocked_by: ["install-step"] },
    { _id: "a-cleanup", type: "install-cleanup", kind: "simple", status: [{ stage: "blocked" }], blocked_by: ["install-step"] },
  ],
  targetAction: <ref to a-step>,
};
```

**Pre-hook phase:** no pre-hook declared. `PreHookResult = { actions: [], event_overrides: {}, form_overrides: {} }`. The current-action signal is `payload.signal` (`submit`), not a pre-hook output.

**Plan phase:**

1. Resolve current-action signal: `FSM["simple"]["action-required"]["submit"]` → "in-review or done"; `hasReview(actionConfig)` is false (no app declares `review`) → `done`.
2. Initial planned transitions: `[ { action: a-step, target: "done", fields: {...}, metadata: { physical_id: "D-42" } } ]`.
3. Auto-unblock fixpoint over planned actions:
   - a-verify.blocked_by = ["install-step"]; planned install-step is "done" → terminal → emit `unblock` against a-verify.
   - FSM["form"]["blocked"]["unblock"] → `action-required`. Add to planned transitions.
   - a-cleanup.blocked_by = ["install-step"]; same → `unblock` → `action-required`.
   - Next iteration: planned transitions are a-step→done, a-verify→action-required, a-cleanup→action-required. No further unblocks (verify/cleanup don't accept unblock from action-required).
4. Compose planned action docs:
   - a-step planned doc: status prepended with `{ stage: "done", event_id: e1, created: now }`, metadata: `{ physical_id: "D-42" }`, rendered cell for `done` stage (e.g. `demo.message: "Installed D-42."`), per-verb links map `demo.links: { view: <workflow-action-view>, edit: null, review: null, error: null }` (the `done` stage exposes only `view`; D16 / Part 34 D7).
   - a-verify planned doc (kind `form` → derived pages): status prepended with `{ stage: "action-required", event_id: e1, created: now }`, sticky message from prior stage (none — was blocked, no cell), per-verb links map `demo.links: { view: <installation-install-verify-view>, edit: <installation-install-verify-edit>, review: null, error: null }`.
   - a-cleanup planned doc (kind `simple` → fixed pages): status prepended, per-verb links map `demo.links: { view: <workflow-action-view>, edit: <workflow-action-edit>, review: null, error: null }`.
5. Recompute groups: install group has 1 done + 2 action-required → "in-progress" (unchanged).
6. Recompute summary: `{ done: 1, not_required: 0, total: 3 }`.
7. Check auto-complete: no — `total !== done + not_required` (the full trigger is `total > 0 && total === done + not_required` with the current workflow stage not already `completed`/`cancelled` — preserves the old `recomputeWorkflowAfterActionWrite` guards). No completed push.
8. Merge form_data: `submitted_form = { physical_id: "D-42" }`. Planned workflow.form_data = `{ "install-step": { physical_id: "D-42" } }`.
9. Compose planned workflow doc with summary, groups, form_data.
10. Build event payload: render `display.{appName}.title` against `{ user, action: a-step-planned-doc, workflow: planned-workflow-doc, signal: "submit", status_before: "action-required", status_after: "done", submitted_form }`. Engine default renders to e.g. `"Sam marked install-step as done"`.
11. Build log-changes entries (community schema, D7): one per mutated doc — a-step, a-verify, a-cleanup, workflow — each with before (loaded) / after (planned). The event write logs itself via the events module's own changeLog config; the engine doesn't double-log it. (No notification payload is built — notifications dispatch post-commit from the committed `event_id`, D9 step 4.)

**Commit phase:**

```
// steps 1–2 in one transaction on a replica set; ordered fallback on standalone (D9/D11)
// 1. workflow claim first — CAS gate throws before any action write on a concurrency miss
findOneAndUpdateDoc(workflows,
  { _id: "w1", "updated.timestamp": <loaded w1 updated.timestamp> },
  { $set: <workflow-planned-doc minus _id> })   // null return → throw ConcurrentSubmitError
// 2. actions
bulkWriteActions([
  { updateOne: { filter: {_id: "a-step"}, update: {$set: <a-step-planned-doc minus _id>} } },
  { updateOne: { filter: {_id: "a-verify"}, update: {$set: <a-verify-planned-doc minus _id>} } },
  { updateOne: { filter: {_id: "a-cleanup"}, update: {$set: <a-cleanup-planned-doc minus _id>} } },
])
// 3–5. outside the transaction
callApi({ endpointId: connection.endpoints.new_event, payload: { _id: e1, ...eventPayload } })
callApi({ endpointId: connection.endpoints.send_notification, payload: { event_ids: ["e1"] } })   // engine builds no notification doc; send_routine fans out
insertManyDocs("log-changes", [...])   // community-schema entries built from the Plan
```

**Tracker cascade:** none (workflow didn't push `completed`).

**Post-hook:** none declared. Handler returns `{ action_ids: ["a-step", "a-verify", "a-cleanup"], event_id: e1, ... }`.

Renders all happened in step 4 + step 10 of planning, against the planned post-commit shape. No re-fetch. No in-memory mirroring. Adding a sixth or seventh write to the commit phase later doesn't reopen any staleness window — render context is the Plan.
