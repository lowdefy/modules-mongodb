# Task 3: Migrate workflow-overview to the new title-bar props

## Context

After task 2, the title bar exposes `type`, `status`, `status_enum`, and `loading`, and no longer reads `badge_text`/`badge_color`.

`modules/workflows/pages/workflow-overview.yaml` currently sets the title bar like this (lines ~16–39):

```yaml
title:
  _state: workflow.title
show_back_button: true
back_link: { ... }
badge_text:
  _get:
    from: { _ref: components/workflow_lifecycle_stages.yaml }
    key: { _string.concat: [ { _state: workflow.status.0.stage }, .title ] }
badge_color:
  _get:
    from: { _ref: components/workflow_lifecycle_stages.yaml }
    key: { _string.concat: [ { _state: workflow.status.0.stage }, .titleColor ] }
```

The two `_get` blocks re-derive the label and colour from the lifecycle-stages enum — exactly the resolution the title block now owns internally.

The page loads its data via a `CallAPI` (`get-workflow-overview`) whose response is stashed into `_state.workflow` by a `SetState` action. **There is no `get_workflow_overview` request** — the design's worked example showing `loading: { _not: { _request: get_workflow_overview } }` does not match this page. Gate `loading` on the state instead.

## Task

In the title-bar vars of `modules/workflows/pages/workflow-overview.yaml`:

- **Remove** both `badge_text` and `badge_color` blocks.
- **Add** `type: Workflow` (the eyebrow; normal case — the component uppercases).
- **Add** `status: { _state: workflow.status.0.stage }` (the slug).
- **Add** `status_enum: { _ref: components/workflow_lifecycle_stages.yaml }` — keep pointing at the **override-merged `components/` map**, not the raw `enums/` map, so any app's `workflow_lifecycle_stages_display` overrides are preserved.
- **Add** `loading: { _not: { _state: workflow } }` — gate on the CallAPI-populated state (the title/subtitle/status skeleton shows until `_state.workflow` is set). Do not reference a non-existent `get_workflow_overview` request.

Keep `title`, `show_back_button`, and `back_link` unchanged. The rest of the page (progress row, action cards) is untouched.

## Acceptance Criteria

- `badge_text`/`badge_color` are gone from the page.
- `type`, `status`, `status_enum`, `loading` are set as above; `status_enum` references `components/workflow_lifecycle_stages.yaml`.
- `loading` is gated on `_state.workflow` (not a `_request`).
- The eyebrow reads "WORKFLOW"; the status pill shows the lifecycle stage's label/colours; the title shows the workflow title.
- `pnpm ldf:b` builds successfully.

## Files

- `modules/workflows/pages/workflow-overview.yaml` — modify — badge → `status`/`status_enum`; add `type` + `loading`.

## Notes

The status slug `workflow.status.0.stage` and the `components/workflow_lifecycle_stages.yaml` map are exactly what the old `_get` blocks used — the title block now performs that lookup, so the in-page `_get`s are deleted, not relocated.
