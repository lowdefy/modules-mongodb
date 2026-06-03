# Task 3: Shared `simple-action-surface` component (D1 / D2 / D3)

## Context

The three simple-action pages (`workflow-action-edit` / `workflow-action-view` / `workflow-action-review`) and the new in-context modal (Task 5) all render the **same body**: header + universal fields + comment + a signal button bar. This task extracts that body into one reusable component, `modules/workflows/components/simple-action-surface.yaml`, parameterised by a `mode` var (`edit` | `view` | `review`). One body, two containers — the DRY payoff is the reason it's extracted now.

This depends on **Task 1** (the `global.simple_action_buttons` map) and on Part 39's enum **`modules/workflows/enums/button_signal_sources.yaml`** (a build-time `_ref` source-stage map). Confirm that enum file exists before wiring (Part 39 ships it; this part consumes it verbatim). Its contents:

```yaml
submit:          [action-required, in-progress, changes-required, done]
progress:        [action-required, in-progress]
not_required:    [action-required, in-progress, changes-required, blocked, in-review, error]
approve:         [in-review]
request_changes: [in-review, done]
resolve_error:   [error]
```

**State contract (D1).** The surface reads everything from a single `_state.surface` namespace: `{ action, fields, comment, action_allowed }`. The surface is a pure reader of this namespace — its **writers** are the page `onMount` (Task 4) and the modal open handler (Task 5). Specifically the surface reads:

- `_state: surface.action` — the loaded action doc (`._id`, `.key`, `.type`, `.status.0.stage`, `.title`, `.required_after_close`, `.assignees`, `.due_date`, `.description`).
- `_state: surface.fields` — editable universal fields (`assignees` / `due_date` / `description`) in `edit` mode.
- `_state: surface.comment` — the comment / recovery-note field.
- `_state: surface.action_allowed` — the **per-verb** role-gate map `{ view, edit, review, error }` ([Part 34 D8]). See Notes on the cross-wave dependency.

The current pages do **not** use this namespace (they prime top-level `fields.*`, `status`, `comment`, and a single boolean `action_allowed`). Migrating the pages to write the `surface` namespace is Task 4; this task defines the read side.

**Mode → renders (D1):**

| `mode`   | Renders                                                                     | Button bar                                          |
| -------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| `edit`   | universal fields (editable) + comment                                       | `submit`, `progress`, `not_required`                |
| `view`   | header + universal fields (read-only) + status-history + comments timeline  | `resolve_error` (only at stage `error`)             |
| `review` | header + universal fields (read-only) + comment                             | `approve`, `request_changes` (comment modal)        |

The header (title + status badge), status-history card, and comments card come from the current `workflow-action-view.yaml` (`:64–286`). Universal fields render via `_ref: components/universal-fields/universal-fields.yaml` with `mode: edit` (editable, `edit` surface mode) or `mode: display` (read-only, `view`/`review`), `kind: simple`, `action_data` sourced from `surface.fields` (edit) or `surface.action` (display).

## Task

Create `modules/workflows/components/simple-action-surface.yaml` accepting a `mode` var and rendering per the table above.

### Button visibility (D2) — three-way AND

Every signal button's `visible` is the same three-way AND as [Part 39 D3]:

```yaml
visible:
  _and:
    - _global: simple_action_buttons.<type>.<signal>.visible      # author opt-out (Task 1) — see Notes on <type>
    - _array.includes:
        - _ref: { path: enums/button_signal_sources.yaml, key: <signal> }   # FSM source-stages (build-time)
        - _state: surface.action.status.0.stage
    - _eq: [{ _state: surface.action_allowed.<verb> }, true]       # per-verb role gate (Part 34 D8)
```

The membership check is **runtime** (`_array.includes`, not `_build.array.includes`) — the source-stage list is a build-time constant but the action's current stage is only known at runtime.

**Per-verb role-gate term** ([Part 34 D6]):

| Signal                               | Required verb | Role-gate term                          |
| ------------------------------------ | ------------- | --------------------------------------- |
| `submit`, `progress`, `not_required` | `edit`        | `_state: surface.action_allowed.edit`   |
| `approve`, `request_changes`         | `review`      | `_state: surface.action_allowed.review` |
| `resolve_error`                      | `error`       | `_state: surface.action_allowed.error`  |

This mixed-verb gating is what lets **one** surface render correctly for an editor, a reviewer, or an error-recoverer. The `resolve_error` button (source list `[error]`, gated on `action_allowed.error`) falls out of the same map — it shows only when the stage is `error`.

This **deletes** the old `_js` priority lookup that drove the selector (`workflow-action-edit.yaml:144–156`) — no JS visibility logic remains.

### Button payload (D1) — nullary on target

Every button's `CallAPI` payload:

```yaml
payload:
  action_id: { _state: surface.action._id }
  signal: <signal>            # submit | progress | not_required | approve | request_changes | resolve_error
  current_key: { _state: surface.action.key }
  fields: { _state: surface.fields }     # universal fields (edit-relevant signals)
  comment: { _state: surface.comment }
```

- **No `current_status` / `target_status`** — the v0 selector payload is gone. `submit` carries no target; the engine resolves `in-review` vs `done` from the action's `review` verb.
- **No `form` / `form_review`** — simple actions have no form body.
- **Endpoint** resolves the same way as the form templates: `endpointId: { _module.endpointId: { _build.string.concat: [update-action-, <action type>] } }` where `<action type>` is `_state: surface.action.type`. (Confirm `_module.endpointId` is the correct resolution operator here, aligning with the form templates — the current pages use `_string.concat` of `_module.id` + `/update-action-` + type; the design says to align to `_module.endpointId`.)

### Validate scope (D1) — critical

`submit` keeps a `Validate` step, **scoped to the surface's own field namespace**: `params: { regex: ^surface\.fields\. }`. This matters because the surface renders both as a page **and** inside the modal (Drawer) on a host entity page — an unscoped `Validate` inside the modal would validate every unrelated input on the host page. Scoping to `surface.fields.*` makes validation identical in both containers.

`progress` has **no** `Validate` step (a draft is intentionally partial). Like the form template, `progress` fires its own author hook — `onProgress` — before the engine `CallAPI` (the engine-side `progress_saved` log + field persistence is Part 38, out of scope here).

`request_changes` (review mode) opens a comment modal whose `onOk` validates the comment then fires the `request_changes` signal (mirror the current `workflow-action-review.yaml:219–266` `request_changes_modal`, but inside the surface so it works in both containers).

### Mode-specific bodies

- **`edit`**: workflow-closed banner (carry over from `workflow-action-edit.yaml:90–108`, gated on `surface.action` fields), editable universal fields, comment, button bar `submit` / `progress` / `not_required`. **No status selector, no "No transitions available" Alert** — both deleted.
- **`view`**: header (title + status badge), read-only universal fields, status-history card, comments card (carry over from `workflow-action-view.yaml`), button bar with only `resolve_error`.
- **`review`**: workflow-closed banner, header, read-only universal fields, comment, button bar `approve` + `request_changes` (with its comment modal).

The submit-style buttons keep the `disabled` workflow-closed gate (`required_after_close`) from the current pages (`workflow-action-edit.yaml:176–187`).

## Acceptance Criteria

- `simple-action-surface.yaml` exists, takes a `mode` var, and renders the correct body + button bar per mode.
- All button `visible` expressions use the three-way AND (author opt-out + build-time enum source-stage membership + per-verb role gate); no `_js` priority lookup remains.
- Button payloads are nullary on target (`signal:` only, no `current_status`/`target_status`/`form`/`form_review`); endpoint aligns to `_module.endpointId`.
- `submit` has a `Validate` scoped to `^surface\.fields\.`; `progress` has no `Validate` and fires `onProgress` first; `request_changes` validates its comment in a modal.
- The surface reads exclusively from `_state.surface.*` and `_global: simple_action_buttons` and the `button_signal_sources.yaml` `_ref`.
- The static build resolves the component (no missing-`_ref` errors); the demo build succeeds once Tasks 4–6 consume it.

## Files

- `modules/workflows/components/simple-action-surface.yaml` — create — the shared body + mode-keyed signal button bar.
- `modules/workflows/module.lowdefy.yaml` — modify (if needed) — register the component under `components:` if it is exported; pages `_ref` it by path, so a manifest export is only required if it must be referenced cross-module.

## Notes

- **Per-verb `action_allowed` is a [Part 34 D8] dependency.** The surface reads `surface.action_allowed.{edit|review|error}`. The shipped `components/action_role_check.yaml` currently emits a **single boolean** `action_allowed`. Producing the per-verb map is Part 34's scope. Task 4 (pages) and Task 5 (modal) are responsible for running `action_role_check` and landing its result under `surface.action_allowed`; if Part 34 has not migrated `action_role_check` to the per-verb shape, that migration must land before this part works end-to-end. Write the surface against the per-verb shape regardless (design is source of truth).
- **`<type>` in the author-opt-out term** must be the action's runtime type. Use dot-notation against `surface.action.type` if `_global` supports composed keys here; otherwise resolve the per-type map via the action type at read time. Match whatever runtime-key pattern the form templates use to read `page_config`/global button config.
- The `request_changes` source list is `[in-review, done]`; on the review surface it shows at `in-review` (and at `done` if an author opts in elsewhere) — the FSM source-stage AND handles this; do not special-case it.
- Per [CLAUDE.md "build for what exists"], do not add slots, flags, or modes beyond `edit`/`view`/`review`.
