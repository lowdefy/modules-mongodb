# Task 2: View template (`templates/view.yaml.njk`)

## Context

`view.yaml.njk` is the simplest of the four templates: read-only display, no write buttons, no interaction payload, no outer-card suppression, no confirm modals. Implementing it second (after the requests in task 1) produces the first end-to-end-renderable template and validates the `_ref` paths + Nunjucks substitution patterns + layout-module composition before the more complex templates land.

The current file at `modules/workflows/templates/view.yaml.njk` is a placeholder shipped by part 12 task 1 — replace its body.

The template receives these build-time vars from part 12's resolver (`makeActionPages.js`):

- `action_config` — `{ type, kind, key, tracker, blocked_by, action_group, sort_order, required_after_close, access, status_map, form, form_review, form_error, hooks, interactions, event }`. **`pages` is not included** — it's lifted to `page_config`.
- `page_config` — per-verb slice of `action.pages.view` (`title`, `requests`, `events`, `formHeader`, `formFooter`, `modals`, `maxWidth`). Defaults to `{}`.
- `page_ids` — `{ view, edit?, review?, error? }` — only emitted verbs have keys.
- `workflow_type` — the workflow's `type` field.
- `entity_collection` — the workflow's `entity_collection` field.

`view.yaml.njk` is the **only** template with no stale-URL guard ("View is always reachable; renders read-only at any stage" per the design's allowlist table). And view has **no write buttons** — `not_required` was moved to edit-only opt-in per review-1 #2.

## Task

Replace the body of `modules/workflows/templates/view.yaml.njk` with the implementation below.

### Top-level shape

A single `_ref: { module: layout, component: page }` wrapper carrying the page chrome, requests, events, and content blocks. No hard-coded `PageHeaderMenu` — host app picks the page-block variant.

### Requests (page-level `requests:` list)

Concatenate three module-shipped requests + author-supplied `page_config.requests`:

```yaml
requests:
  _build.array.concat:
    - - _ref: ../requests/get_action.yaml
      - _ref: ../requests/get_workflow.yaml
      - _ref:
          path: ../requests/get_entity.yaml.njk
          vars:
            entity_collection: { { entity_collection } }
    - _var:
        key: page_config.requests
        default: []
```

The path is relative from the template file (`modules/workflows/templates/view.yaml.njk`) to the request files (`modules/workflows/requests/`), so `../requests/`.

### `onMount` sequence

Steps per the design's "Template `onMount` sequence (all four templates)" — task 2 implements the **view variant** which is the same 8 steps minus step 3 (no stale-URL guard for view). Concatenate the steps onto `events.onMount`, with the author's `page_config.events.onMount` appended at the end:

```yaml
events:
  onMount:
    _build.array.concat:
      - # Step 1: action_id presence guard
        - id: redirect_no_action
          type: Link
          skip:
            _ne:
              - _url_query: action_id
              - null
          params:
            back: true
        # Step 2: get_action
        - id: get_action
          type: Request
          params: get_action
        # Step 3 (stale-URL guard) — SKIPPED for view template
        # Step 4: get_workflow
        - id: get_workflow
          type: Request
          params: get_workflow
        # Step 5: get_entity
        - id: get_entity
          type: Request
          params: get_entity
        # Step 6: action_role_check (sets _state.action_allowed)
        - _ref:
            path: ../components/action_role_check.yaml
            vars:
              action_config:
                _var: action_config
        # Step 7: SetState — prime form state from get_workflow.form_data
        - id: prime_form_state
          type: SetState
          params:
            form:
              _request:
                _string.concat:
                  - get_workflow.form_data.
                  - _var: action_config.type
            fields:
              assignees:
                _request: get_action.assignees
              due_date:
                _request: get_action.due_date
              description:
                _request: get_action.description
      # Step 8: author-supplied onMount appended last
      - _var:
          key: page_config.events.onMount
          default: []
```

Note step 6 references `../components/action_role_check.yaml` — that file is shipped by part 18. If part 18 hasn't landed yet, the build will surface a missing-ref error; that's expected (per the design's cross-part-dependency callout in tasks.md).

### Title

Render `page_config.title` if set; otherwise omit:

```yaml
title:
  _var:
    key: page_config.title
    default: null
```

### Content blocks inside `layout.card`

Per the design's block-ordering subsection, view's interior content is:

1. `page_config.formHeader` (author-supplied blocks above the form).
2. Universal-fields band (part 24 component, `mode: display`, `kind: form` — task action `view`/`review` is handled by task 4's template, not this one).
3. Form body via `DataView` (read-only main form per finding #12 resolution).
4. `page_config.formFooter` (author-supplied blocks below the form).

No buttons, no `layout.floating-actions` — view is read-only.

```yaml
blocks:
  - _ref:
      module: layout
      component: card
      vars:
        hide_title: true
        blocks:
          _build.array.concat:
            - _var:
                key: page_config.formHeader
                default: []
            - - _ref:
                  path: ../components/universal-fields/universal-fields.yaml
                  vars:
                    mode: display
                    kind: form
                    action_data:
                      assignees:
                        _request: get_action.assignees
                      due_date:
                        _request: get_action.due_date
                      description:
                        _request: get_action.description
            - - id: form_body
                type: DataView
                properties:
                  formConfig:
                    _var: action_config.form
                  data:
                    form:
                      _state: form
                    entity:
                      _request: get_entity
                  s3GetPolicyRequestId: null
            - _var:
                key: page_config.formFooter
                default: []
```

### Outer-card suppression

**Skipped for view** — per the design's "Outer-card suppression (v0 parity)" subsection: "This applies to `edit.yaml.njk` and `error.yaml.njk` only — `view.yaml.njk` and `review.yaml.njk` use `DataView` / read-only rendering with their own composition."

So view always wraps in `layout.card`. No `_build.if` test on `action_config.form[0]?.form`.

## Acceptance Criteria

- `modules/workflows/templates/view.yaml.njk` no longer contains the placeholder Html block.
- The template's top-level block is a single `_ref: { module: layout, component: page }`.
- The page-level `requests:` list concatenates the three module-shipped requests (in order: action, workflow, entity) with `page_config.requests`.
- The `entity_collection` Nunjucks substitution is wired into the `get_entity` `_ref`.
- `events.onMount` runs the 7-step sequence (steps 1, 2, 4, 5, 6, 7, then author-supplied step 8) — no step-3 stale-URL guard.
- Form body renders via `DataView` with `formConfig: action_config.form`, not via `makeActionsForm` (per finding #12 resolution).
- Universal-fields band composes via `_ref` to part 24's component with `mode: display`, `kind: form`.
- No `submit_edit` / `not_required` / `approve` / `request_changes` / `resolve_error` / `Edit` buttons (view is read-only).
- No `layout.floating-actions` block (no button bar on view).
- `page_config.formHeader` / `page_config.formFooter` slots render in the right positions.
- Building the demo app (`pnpm ldf:b`) emits the page with the right id (e.g. `workflows/onboarding-qualify-view`) and the page renders in the demo without runtime errors. (Part 18's `action_role_check` and part 24's universal-fields component must be in place; if they're not, the build will fail with missing-ref errors — that's expected per tasks.md cross-part-dependency note.)

## Files

- `modules/workflows/templates/view.yaml.njk` — modify — replace placeholder body with the full read-only view-page implementation.

## Notes

- **`DataView` block availability.** The repo previously migrated some surfaces from `DataView` to `DataDescriptions` (per the completed `designs/_completed/data-descriptions/` design — user profile + contact profile views). The part-16 design specifies `DataView` for v0 parity. If the Lowdefy block set in this repo no longer ships `DataView` (verify by searching `node_modules/@lowdefy/blocks-*` for the registration), use `DataDescriptions` instead — the prop shape is compatible enough that the swap is documented in `designs/_completed/data-descriptions/tasks/03-swap-profile-views.md`.
- **No comment field on view.** The design's template description for view says "No write buttons" — and there's no comment input either (comments flow through the submit payload, and view doesn't submit). If the v0 view template carried a read-only comment display, that's a deliberate v1 drop; not in scope here.
- **No `not_required` button on view.** Per review-1 #2's resolution: "view is a read-only surface, and adding a write button there contradicts that contract."
- **The `s3GetPolicyRequestId: null` line** on the DataView block is a placeholder — if the form schema contains file_download fields, the host app needs to supply a download policy. v0 used `download_files`; v1 leaves this null and lets apps override via `page_config.formHeader` adding a download-policy request to `requests:`. Alternatively, drop the prop entirely and let it be undefined.
