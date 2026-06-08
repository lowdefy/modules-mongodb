# Task 3: Shared `simple-action-surface` component (D1 / D2 / D3)

## Context

The three simple-action pages (`workflow-action-edit` / `workflow-action-view` / `workflow-action-review`) and the new in-context modal (Task 5) all render the **same body**: header + universal fields + comment + a signal button bar. This task extracts that body into one reusable component, `modules/workflows/components/simple-action-surface.yaml`, parameterised by a `mode` var (`edit` | `view` | `review`). One body, two containers — the DRY payoff is the reason it's extracted now.

It consumes Part 39's enum **`modules/workflows/enums/button_signal_sources.yaml`** (a build-time `_ref` source-stage map, shipped). Its contents:

```yaml
submit:          [action-required, in-progress, changes-required, done]
progress:        [action-required, in-progress]
not_required:    [action-required, in-progress, changes-required, blocked, in-review, error]
approve:         [in-review]
request_changes: [in-review, done]
resolve_error:   [error]
```

**No new enum, no resolver-emitted global.** Button visibility is the FSM source-stage check AND the per-verb role gate; `not_required` alone adds a doc-borne `allow_not_required` term (D3). There is **no** `global.simple_action_buttons` (that model was dropped — D3); do not read any runtime button-config global.

**State contract (D1).** The surface reads everything from a single `_state.surface` namespace: `{ action, fields, comment, action_allowed }`. The surface is a pure reader — its **writers** are the page `onMount` (Task 4) and the modal open handler (Task 5). It reads:

- `_state: surface.action` — the loaded action doc (`._id`, `.key`, `.type`, `.status.0.stage`, `.title`, `.required_after_close`, `.assignees`, `.due_date`, `.description`, **`.allow_not_required`** — the doc-borne flag stamped by the engine, Task 1).
- `_state: surface.fields` — editable universal fields (`assignees` / `due_date` / `description`) in `edit` mode.
- `_state: surface.comment` — the comment / recovery-note field.
- `_state: surface.action_allowed` — the **per-verb** role-gate map `{ view, edit, review, error }` (Part 34 D8; see Notes).

**Mode → renders (D1):**

| `mode`   | Renders                                                                  | Button bar                            |
| -------- | ------------------------------------------------------------------------ | ------------------------------------- |
| `edit`   | universal fields (editable) + comment                                    | `submit`, `progress`, `not_required`  |
| `view`   | header + universal fields (read-only) + status-history (a `List` over `surface.action.status` — **no request**) | `resolve_error` (only at stage `error`) |
| `review` | header + universal fields (read-only) + comment                          | `approve`, `request_changes` (modal)  |

**The Part 33 events timeline is NOT part of the surface (D1 / review-2 #4).** It is page-level chrome rendered by `workflow-action-view` **below** the surface `_ref` (Task 4), and is **omitted** in the modal. Do not put an `events-timeline` `_ref` inside this component. (Reasons: the modal's host entity pages already show the action's events; a second `events-timeline` instance would collide on the component's fixed `get-events` request id — request ids are not `_ref`-scoped.) The `view` mode's status-history is a plain `List` over `surface.action.status` (no request), so it is modal-safe.

Universal fields render via `_ref: components/universal-fields/universal-fields.yaml` with `mode: edit` (editable) or `mode: display` (read-only), `kind: simple`. **In edit mode pass `state_path: surface.fields`** (Part 24's renderer var, default `fields`) so the renderer's input block IDs become `surface.fields.{assignees, due_date, description}` — required so the scoped `Validate` and the `fields` payload bind to the surface's namespace (see Validate scope below). The header (title + status badge) carries over from `workflow-action-view.yaml` (lines 64–119), reading `surface.action.*`.

## Task

Create `modules/workflows/components/simple-action-surface.yaml` accepting a `mode` var and rendering per the table above.

### Button visibility (D2)

Every signal button's `visible` is an `_and` of the FSM source-stage membership AND the per-verb role gate:

```yaml
visible:
  _and:
    - _array.includes:
        - _ref: { path: enums/button_signal_sources.yaml, key: <signal> }   # FSM source-stages (build-time)
        - _state: surface.action.status.0.stage                              # current stage (runtime)
    - _eq: [{ _state: surface.action_allowed.<verb> }, true]                 # per-verb role gate (Part 34 D8)
    # not_required ONLY — third term:
    - _eq: [{ _state: surface.action.allow_not_required }, true]             # D3 doc-borne policy flag
```

The membership check is **runtime** (`_array.includes`, the stage is only known at runtime) over the build-time `_ref` list. Only the `not_required` button carries the third `allow_not_required` term; all other buttons are the two-term AND.

**Per-verb role-gate term** (Part 34 D6):

| Signal                               | Required verb | Role-gate term                          |
| ------------------------------------ | ------------- | --------------------------------------- |
| `submit`, `progress`, `not_required` | `edit`        | `_state: surface.action_allowed.edit`   |
| `approve`, `request_changes`         | `review`      | `_state: surface.action_allowed.review` |
| `resolve_error`                      | `error`       | `_state: surface.action_allowed.error`  |

This mixed-verb gating is what lets **one** surface render correctly for an editor, a reviewer, or an error-recoverer. `resolve_error` (source `[error]`, gated on `action_allowed.error`) falls out of the same map — it shows only at stage `error`.

This **deletes** the old `_js` priority lookup that drove the v0 selector (`workflow-action-edit.yaml:144–156`) — no JS visibility logic remains.

### Button payload (D1) — nullary on target

Every button's `CallAPI` payload:

```yaml
payload:
  action_id:  { _state: surface.action._id }
  signal:     <signal>            # submit | progress | not_required | approve | request_changes | resolve_error
  current_key: { _state: surface.action.key }
  fields:     { _state: surface.fields }     # assignees / due_date / description (edit-relevant signals)
  comment:    { _state: surface.comment }
```

- **No `current_status` / `target_status`** — the v0 selector payload is gone. `submit` carries no target; the engine resolves `in-review` vs `done` from the action's `review` verb.
- **No `form` / `form_review`** — simple actions have no form body.
- **Endpoint** aligns with the form templates: `endpointId: { _module.endpointId: { _build.string.concat: [update-action-, <type>] } }` where `<type>` is `_state: surface.action.type`. (The current pages use `_string.concat` of `_module.id` + `/update-action-` + type — replace with `_module.endpointId` per the design.)

### Validate scope (D1) — critical

`submit` keeps a `Validate` step **scoped to the surface's own field namespace**: `params: { regex: ^surface\.fields\. }`. The surface renders both as a page **and** inside the modal on a host entity page — an unscoped `Validate` inside the modal would validate every unrelated input on the host page. Scoping to `surface.fields.*` makes validation identical in both containers (this is why the universal-fields renderer must bind at `surface.fields.*` via `state_path`).

`progress` has **no** `Validate` step (a draft is intentionally partial). Like the form template (Part 39 D2), `progress` fires its own author hook — `onProgress` — before the engine `CallAPI` (the engine-side `progress_saved` log + field persistence is Part 38, out of scope here).

`request_changes` (review mode) opens a comment modal whose `onOk` validates the comment then fires `signal: request_changes` — mirror the current `workflow-action-review.yaml:219–266` `request_changes_modal`, but **inside the surface** so it works in both containers.

### Mode-specific bodies

- **`edit`**: workflow-closed banner (carry over from `workflow-action-edit.yaml:90–108`, gated on `surface.action` fields), editable universal fields (`state_path: surface.fields`), comment, button bar `submit` / `progress` / `not_required`. **No status selector, no "No transitions available" Alert** — both deleted.
- **`view`**: header (title + status badge), read-only universal fields, status-history `List` over `surface.action.status` (no request — modal-safe), button bar with only `resolve_error`. **No events timeline here** (page-level — D1).
- **`review`**: workflow-closed banner, header, read-only universal fields, comment, button bar `approve` + `request_changes` (with its comment modal).

The submit-style buttons keep the `disabled` workflow-closed gate (`required_after_close`) from the current pages (`workflow-action-edit.yaml:176–187`, gated on `surface.action.required_after_close`).

## Acceptance Criteria

- `simple-action-surface.yaml` exists, takes a `mode` var, and renders the correct body + button bar per mode.
- Button `visible` = FSM source-stage `_ref` membership AND per-verb role gate; `not_required` adds the `surface.action.allow_not_required` term. No `_js` priority lookup and no button-config global remain.
- Button payloads are nullary on target (`signal:` only — no `current_status`/`target_status`/`form`/`form_review`); endpoint uses `_module.endpointId`.
- `submit` has a `Validate` scoped to `^surface\.fields\.`; `progress` has no `Validate` and fires `onProgress` first; `request_changes` validates its comment in a modal inside the surface.
- Edit-mode universal fields bind at `surface.fields.*` via `state_path: surface.fields`.
- The `view` mode renders status-history as a `List` over `surface.action.status` with no request, and contains **no** events-timeline `_ref`.
- The surface reads exclusively from `_state.surface.*` and the `button_signal_sources.yaml` `_ref`.

## Files

- `modules/workflows/components/simple-action-surface.yaml` — create — the shared body + mode-keyed signal button bar.
- `modules/workflows/module.lowdefy.yaml` — modify (if needed) — register under `components:` only if it must be referenced cross-module (the three pages `_ref` it by path; the modal does too).

## Notes

- **Per-verb `action_allowed`.** The surface reads `surface.action_allowed.{edit|review|error}`. The shipped `components/action_role_check.yaml` already emits the per-verb map `{ view, edit, review, error }` at **root** `action_allowed` (Part 38 task 8 — Part 34 D8's shape, shipped; no cross-wave migration pending). Task 4 (pages) and Task 5 (modal) run `action_role_check` then copy its output into `surface.action_allowed` via a following `SetState` (D1, review-2 #3). The surface is a pure reader of the namespace.
- **`allow_not_required` value at runtime** comes from the engine doc stamp (Task 1). The component only *reads* `surface.action.allow_not_required`; until Task 1 ships, the doc field is absent → the `_eq … true` term is false → `not_required` stays hidden (the safe default). No authoring dependency on Task 1.
- **`state_path` var** is added to the universal-fields renderer by Part 24 (default `fields`). If Part 24 has not yet landed that var, the surface still `_ref`s the renderer as the pages do today; coordinate with the Part 24 wave so the edit-mode binding lands at `surface.fields.*`.
- Per [CLAUDE.md "build for what exists"], do not add slots, flags, or modes beyond `edit`/`view`/`review`.
