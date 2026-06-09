# Task 5: `GetWorkflowAction` — the detail-page read method

## Context

The detail pages (`workflow-action-view/edit/review`) and the form templates
read one action via `modules/workflows/requests/get_action.yaml` — today a
trivial `$match` by `_id` on the actions collection. The "logic" on the detail
path is **not** in MongoDB: it is the client `_js` mirror
(`components/action_role_check.yaml`, writing `_state.action_allowed`) plus the
per-button visibility AND baked into the templates
(`enums/button_signal_sources.yaml` `_ref` + `action_allowed` + opt-out).

This task adds the `GetWorkflowAction` engine method that returns a curated,
access-resolved detail envelope. The `get_action` request is rewired to it in
task 7; the surfaces are rewritten to consume it in task 10. This task only adds
and registers the method + tests.

Design D8 governs the contract: **a curated allowlist, not the raw doc** (a
contract over every field is one nobody can change later). The detail surfaces
read only a small known set and read **none** of the engine internals (`access`,
`workflow_type`, `metadata`, `[slug].links`, `tracker`, `child_*` — all
confirmed unread). Governing rule: **never ship a raw resolution input when its
resolved output is on the response** — shipping raw `access` would reopen the
client-recompute door this part closes.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`:

1. `const context = await createEngineContext(lowdefyContext);` — read
   `action_id` from `context.params`.
2. **Two reads, not one (D8 / review-4):** read the action doc by `_id`, **and**
   — after the guards in steps 3–4 pass — the **parent `workflow` doc** by
   `action.workflow_id`. Submitted form **values** are **not** on the action doc;
   they live on the workflow as `workflow.form_data[type]` (unkeyed) or
   `workflow.form_data[type][key]` (keyed action), written by `planFormDataMerge`
   at submit time. The action read alone cannot produce the form-field values the
   envelope returns (step 6). Resolve the action's `workflowConfig` +
   `actionConfig` from `context.workflowsConfig` (match `workflow_type` then
   `type`), as `loadWorkflowState` does.
3. **Task guard (D8/D6):** if the doc is missing **or** `workflow_id == null`,
   **return `null`** _before_ any verb-gate or button resolution. (`kind: task`
   has no FSM table — resolving it would throw. The name says "a workflow
   action".)
4. **Access:** `allowed = computeAllowed({ access: action.access, app_name,
userRoles })` (task 2). **Read-auth gate (D8):** if `allowed.view` is false,
   **return `null`** (empty response — matches the overview methods'
   access-vs-existence collapse; the detail page already handles render-nothing).
   This closes the open-`_id` hole the raw `get_action` has today.
5. **Buttons (D5 layer 1):** `buttons = resolveButtons({ actionConfig, stage:
action.status?.[0]?.stage, allowed, allow_not_required:
actionConfig.allow_not_required })` (task 2). Per-signal booleans
   `{ submit, approve, request_changes, resolve_error, progress, not_required }`.
   It does **not** evaluate the form's authored `.visible`/`.disabled` operators
   — those stay baked client-side (task 10, D5 layer 2).
6. **Curated envelope** (explicit allowlist projection — not a spread of the raw
   doc):
   - **Engine fields:** `_id`, `type`, `kind`, `key`, `status`, `action_group`,
     `description`, `due_date`, `assignees`, `entity_id`, `entity_collection`,
     `created`, `updated`.
   - **Config-derived display:** `title`, `required_after_close` (from the
     validated action/workflow config).
   - **Form-field values:** the author's submitted form data, **read from the
     parent workflow's `form_data[action.type]` slice** (keyed action:
     `form_data[action.type][action.key]`) via the step-2 second read — **not**
     from the action doc, which carries no form values. It is a genuine allowlist,
     not a passthrough: allowlist the slice by the validated form field keys (the
     same keys `form_meta`, task 3, is computed from). Knowing the keys lets the
     engine curate the values it reads from `workflow.form_data`.
   - **Resolved fields:** `allowed`, `buttons`.

   Exclude everything else: `access` (raw input — superseded by `allowed`),
   `workflow_type`, `metadata`, `[slug].links`, `tracker`, `child_*`.

7. `.schema = {}`, `.meta = { checkRead: false, checkWrite: false }`. Register in
   `WorkflowAPI.js`.

Add `GetWorkflowAction.test.js` (in-memory Mongo): assert the envelope allowlist
(no `access`/`metadata`/links leak), `allowed`/`buttons` resolution, `null` for
`allowed.view === false`, and `null` for a `workflow_id: null` (task) doc.

## Acceptance Criteria

- Returns a curated envelope with exactly the allowlisted fields +
  `allowed` + `buttons`; raw `access`, `metadata`, `[slug].links`, `tracker`,
  `child_*`, `workflow_type` are absent.
- Returns `null` when the doc is missing, when `workflow_id == null`, or when
  `allowed.view` is false.
- The envelope's form-field values come from the parent workflow's
  `form_data[type]` / `[type][key]` slice (the second read), allowlisted by the
  validated form keys — not from the action doc.
- `buttons.not_required` honors `allow_not_required` (false by default hides it).
- `buttons` reflects the FSM source-stage × verb-gate AND for the action's
  current stage.
- New tests pass; full plugin test suite green.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.test.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js` — modify — register `GetWorkflowAction`.

## Notes

- The envelope is an **explicit projection**, so `allowed`/`buttons` cannot be
  shadowed by a stray form field (D8 — no collision question).
- `null` (not a thrown `access_denied`) is deliberate — it matches the overview
  methods and the detail page's existing render-nothing path.
- The response is now a **single object** (the envelope), where the old
  `get_action` aggregation returned an **array**. Task 7/10 must adjust the
  client reads (`_request: get_action.0` → `_request: get_workflow_action`).
  Flag this in the method's doc comment.
- Because the envelope now carries form-field values (the second read), the
  separate detail-path request `requests/get_workflow.yaml` (an ungated raw
  `$match` on the workflows collection that supplies `form_data` today) becomes
  redundant. **It is deleted and the four form templates rewired to read
  submitted values off this single response in task 10** — delivering "one call,
  render dumb" and removing a second ungated read from the detail path.
