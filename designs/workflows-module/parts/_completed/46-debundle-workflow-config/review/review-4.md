# Review 4 — form-data _values_ vs `form_meta`: the workflow-doc join the read methods don't account for

Reviews 1–3 and consistency-2 settled the user/`schema.js`/`meta` plumbing, the FSM-inversion hazard, `allow_not_required`, the `entity_link` move, and the D6 timeline port. This pass verifies the **form-data** story end-to-end against shipped source — the one area the design describes confidently but, traced through the code, conflates two different things stored in two different places.

Verified accurate first (no action):

- **`GetEntityWorkflows` gaining `_id`/`kind` is buildable.** The current `$push` (`get-entity-workflows.yaml:67–76`) carries `{type, status, visible_verbs, message, link}` and drops `_id`/`kind` exactly as the design claims (line 158). `kind` is a real top-level field on every action doc (`planActionTransition.js:147`, `kind: actionConfig.kind`) and is in `ACTION_FIELDS` (`makeWorkflowsConfig.js:9`), so `$kind` projects a real value. Sound.
- **`app_name` ≡ events `display_key` is intended, not assumed.** D6 / "The read methods" (line 147) replaces the events `display_key` with the connection's `app_name` for the event-card projection. The workflows `app_name` var description (`module.lowdefy.yaml:53–58`) explicitly documents role (2): "keys the engine's default log event display block (**matching the events module's `display_key` projection**)." So the conflation is by design and the host is meant to set both equal — fine. (Worth a one-line note in D6 that the port _requires_ this equality, since today's lookup happens to read both off `display_key`; but it is not a defect.)
- `event_types`/`action_statuses` are confirmed client-side on the `EventsTimeline` block (`events-timeline.yaml`, `eventTypeConfig`/`actionStatusConfig`), so "not a method input" (line 150) holds.

## Gaps — under-specified mechanics

### 1. `GetWorkflowAction`'s "form-field values" cannot come from the action doc — they live on the **workflow** doc, and the existing `get_workflow` request is never addressed

> **Resolved.** Finding validated against source (`planFormDataMerge.js:62–72`, `get_action.yaml`, `get_workflow.yaml`, all four `*.yaml.njk`). Chose option **(a)+(b)-delete**: `GetWorkflowAction` now reads **two docs** — the action by `_id` and the parent workflow by `action.workflow_id` — and projects this action's `form_data[type]`/`[type][key]` slice, allowlisted by the validated form keys. The D8 "Form-field values" bullet was corrected (knowing-the-keys ≠ having-the-values; values come from `workflow.form_data`). "The read methods" §4 now pins the two-read mechanism. `requests/get_workflow.yaml` is **deleted** and the four form templates rewired to read submitted values off the single `GetWorkflowAction` response (added to "What gets deleted" and the response table) — delivering "one call, render dumb" and removing a second ungated `$match` on the workflows collection from the detail path.

D8 (line 95) and the response table (line 161) list **form-field values** as part of the `GetWorkflowAction` envelope:

> **Form-field values:** the author's form data — a genuine allowlist, not a passthrough, because the engine knows the form field keys from the action's validated config (the same projection that feeds `form_meta`).

This conflates _knowing the field keys_ (which the validated config does carry, via `form_meta`) with _having the values_ — which it does not. Submitted form values are **not stored on the action document at all**; they live on the **workflow** document, keyed by action type (and key, for keyed actions):

- `planFormDataMerge.js:62–72` writes `workflow.form_data[type]` (unkeyed) or `workflow.form_data[type][key]` (keyed).
- The action doc carries only `{_id, workflow_id, type, kind, key, action_group, status, metadata, created, updated, entity_id, entity_collection, assignees, due_date, description, tracker, child_*, access, workflow_type}` (`planActionTransition.js:143–192`) — **no form values**.

This is exactly why the **detail pages fire two requests today**, not one. The trivial action read is `get_action.yaml` (`$match` on `actions-collection` by `_id`), and a **second** request `get_workflow.yaml` (`$match` on `workflows-collection` by `get_action.workflow_id`) supplies the values. All four templates render submitted data from the second one:

- `edit.yaml.njk:36,83–100` → `get_workflow.form_data.{type}…`
- `view.yaml.njk:38,69–89` → `get_workflow.form_data.{type}…`
- `review.yaml.njk:36,76–98` → `get_workflow.form_data.{type}…`
- `error.yaml.njk:37,76–93` → `get_workflow.form_data.{type}…`

So for `GetWorkflowAction` to return form-field values in one envelope (the design's stated goal — "call `GetWorkflowAction`, render," D8 line 110), the method must **additionally read the workflow doc by `workflow_id`** and project the `form_data[type]` (or `form_data[type][key]`) slice — a `$lookup`/second read that "runs the doc read" (line 140, described as the trivial `$match`) never mentions. The engine has everything it needs server-side (`action.type`, `action.key`, `workflow.form_data`), so it's buildable — but it is an **unpriced join**, and it is the mechanism that makes the "form-field values" allowlist real.

Two consequences the design must state:

a. **Pin the workflow-doc read inside `GetWorkflowAction`.** Add to "The read methods" §4: `GetWorkflowAction` reads the parent workflow by `workflow_id` and projects `form_data[action.type]` (keyed: `[action.key]`) as the form-field-values slice. The "genuine allowlist" framing in D8 should be corrected from "the engine knows the form field keys from the action's validated config" to "the engine reads `workflow.form_data` for this action's `type`/`key` and allowlists it by the validated form keys."

b. **`get_workflow.yaml` is in scope and unaddressed.** "What gets deleted" (lines 174–184) routes `get_action` → `GetWorkflowAction` but is silent on `get_workflow.yaml`. If `GetWorkflowAction` now returns form values, the four templates' separate `get_workflow` request becomes redundant and should be **deleted** (and the templates rewired to read values off the single response) — otherwise the "one call, render dumb" win is not delivered and a second open `workflows-collection` read survives on the detail path (also bypassing the new read-auth gate, since `get_workflow` is itself an ungated raw `$match`). State the deletion + template rewire, or, if `get_workflow` is intentionally kept, drop the "form-field values" claim from the `GetWorkflowAction` envelope and say the values still come from a separate workflow read.

### 2. The ported overview methods must preserve `workflow.form_data` (values) — the response tables list only `form_meta` (schema)

> **Resolved.** Finding validated (`workflow-overview.yaml:253/277/294/305`, `workflow-group-overview.yaml:289/313/330/341`, `get-workflow-overview.yaml` whole-doc `$match` returning `workflow: query.0`). The overview responses now carry the submitted **values** alongside `action.form_meta` (schema) — but `workflow.form_data` is **filtered to the view-visible actions**, not preserved whole. Rationale (raised in action review): the whole blob holds values for _every_ action in the workflow, including ones dropped by the server-side view filter, so shipping it raw leaks a view-denied action's submitted data into the response payload — the exact "ship a raw input, filter for display" pattern D8 closes. It's a pre-existing leak in today's raw-`$match` routines; this part closes it. Mechanism: prune `form_data` to the surviving actions' `type`/`key` (same map shape, pages' `_state: workflow.form_data.{type}` reads unchanged) — a few lines of JS over the already-computed surviving-actions list. Chosen over per-action slices (same security benefit, more template churn). Updated: both response-table rows, "The read methods" bullet 3 (new `form_data` mechanism), and the `action_form_configs` deletion note (line 178).

The same values/schema split bites the overview methods. Today the overview pages render submitted data inline with two inputs:

- the **schema** — `action_form_configs.yaml` `formConfig` (`workflow-overview.yaml:300`), which the design correctly migrates to `action.form_meta`; and
- the **values** — `_state: workflow.form_data`, keyed by `{type}` or `{type}.{key}` (`workflow-overview.yaml:253,277,305`; `workflow-group-overview.yaml:289,313,341`), feeding the `DataDescriptions` `data.form` and the empty-state `visible` checks.

`workflow.form_data` reaches the page because `get-workflow-overview` `$match`es the workflows collection and the whole doc (including `form_data`) rides through (`get-workflow-overview.yaml:5–11`). The response-additions table (lines 159–160) lists for `GetWorkflowOverview`/`GetWorkflowActionGroupOverview` only `workflow.title`, `workflow.entity_link`, group display fields, and `action.form_meta` — **`form_data` is not mentioned**. If the ported method returns a curated response and drops `form_data`, the inline `DataDescriptions` rendering silently goes empty (every action shows "No data submitted yet").

**Fix.** State explicitly that the ported `GetWorkflowOverview`/`GetWorkflowActionGroupOverview` responses **preserve `workflow.form_data`** (or return the per-action value slice alongside `form_meta`). This is the value half of the `action_form_configs` → `form_meta` deletion; the deletion note (line 177, "overview pages read `action.form_meta` off the response instead") covers the schema half only and reads as if it covers both.

## Minor — accuracy

### 3. "today the trivial `requests/get_workflow_action.yaml`" describes a file that is currently named `get_action.yaml`

> **Resolved (auto).** All "today/current-state" references now name the real file `requests/get_action.yaml`, with the rename noted at first mention (intro line 9: "renamed to `get_workflow_action` in this part — the id throughout this doc is the post-rename name"), and at D8 ("`get_workflow_action` (today `get_action`)") and the current-state table. Also corrected proposal-2's "`get_workflow_action` keeps its id" → "(renamed from `get_action`) keeps its payload", which had read as a no-op rename.

The design refers to the _current_ detail-read request as `get_workflow_action.yaml` (line 9, D8 line 90, current-state table line 122). On this branch the file is `get_action.yaml`; the `get_action`→`get_workflow_action` rename is itself part of this part (consistency-2 confirms). Calling the pre-rename file by its post-rename name is a small anachronism in the "today/current state" descriptions — either qualify ("`get_action.yaml`, renamed to `get_workflow_action` here") or note the rename at first mention so the implementer greps for the right file.

## Verified accurate (no action)

- `kind` storage + `ACTION_FIELDS` membership (finding-1 buildability for `GetEntityWorkflows`) — `planActionTransition.js:147`, `makeWorkflowsConfig.js:9`.
- `app_name`/`display_key` equality is an intended host-config contract (`module.lowdefy.yaml:53–58`), not a silent assumption.
- The four detail templates and both overview pages all source form **values** from the workflow doc's `form_data` (never the action doc) — consistent across `edit/view/review/error.yaml.njk` and `workflow-overview`/`workflow-group-overview.yaml`.
