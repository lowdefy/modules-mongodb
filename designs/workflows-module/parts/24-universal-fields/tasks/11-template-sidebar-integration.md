# Task 11: Template sidebar integration (Parts 16/17 follow-on)

## Context

This is the design's mandated follow-on for the template/layout work whose owning parts (16 — page templates, 17 — shared check pages) live in `_completed/`: "Their template edits are deviations from already-implemented designs — handle as a follow-on task, not by reopening those folders."

Current state: all four form templates (`modules/workflows/templates/{edit,view,review,error}.yaml.njk`) embed the universal-fields `_ref` **inside the form card as a header band** (e.g. `edit.yaml.njk:131` and `:168`), passing only `mode` / `kind` / `action_data`. The design moves form-kind universal fields to a **right-hand sidebar card** beside the form body, gated on `universal_fields` being non-empty — when an action declares `universal_fields: false` / `[]`, the column is omitted and the form body spans full width.

Prior tasks supply everything: the real component with `show` / `workflow_type` / `action_type` vars (task 10), `action_config.universal_fields` normalized to an array on the template vars (task 7), `assignee_docs` on `get_action` (task 9). `makeActionPages.js` already passes `workflow_type` as a top-level template var. The edit template's existing `onMount` SetState (priming `_state.fields.*` from the loaded action — `edit.yaml.njk:102-108`) stays: it's what the sidebar inputs bind to.

Placement matrix (design):

| Surface                | Mode      | Placement                                                          |
| ---------------------- | --------- | ------------------------------------------------------------------ |
| Form `edit`            | `edit`    | Right sidebar card with own Update button                          |
| Form `view` / `review` / `error` | `display` | Right sidebar card, read-only                            |
| Check `edit`           | `edit`    | Primary content (unchanged position; written on `submit`)          |
| Check `view` / `review` | `display` | Primary content, read-only                                        |

## Task

1. **All four form templates** — restructure the content area into a two-column row (24-col grid per `.claude/guides/page-layouts.md` / `styling`: form column ~`span: 16`, sidebar ~`span: 8`; pick spans consistent with existing repo two-column pages):
   - Remove the in-card universal-fields header-band `_ref`s (both branches in `edit/review/error` — the "first form entry owns chrome" and the Card-wrapped branch).
   - Add the sidebar column rendering the component, **emitted at build time iff `action_config.universal_fields` is non-empty** (`_build.if` on array length — the value is always an array after task 7). When empty, no sidebar column is emitted and the form column spans 24.
   - Vars per surface:
     - `edit.yaml.njk`: `mode: edit`, `kind: form`, `workflow_type: { _var: workflow_type }`, `action_type: { _var: action_config.type }`, `show: { _var: action_config.universal_fields }`, `action_data` bound to `_state.fields.*`.
     - `view/review/error.yaml.njk`: `mode: display`, `kind: form`, `show: { _var: action_config.universal_fields }`, `action_data` with `assignees/due_date/description` from the template's existing read source (the form templates prime `_state.action` from `get_action.0` in `onMount` — bind `_state: action.*`) plus `assignee_docs` (`_state: action.assignee_docs` once primed, or directly `_request: get_action.0.assignee_docs` — never un-indexed `get_action.*`).
   - Do **not** touch the submit/progress button payloads or the submit `Validate` regex — Part 39 owns that hygiene (independent by design; the kind guard makes the stray `fields` payload inert).
2. **Check pages** (`pages/workflow-action-{edit,view,review}.yaml`) — minimal touch:
   - Keep the component refs in their primary-content position with no `show` var (default all three — the design pins "no behavioural change" for check pages).
   - Add the `assignee_docs` leaf to the display pages' `action_data` (`workflow-action-view.yaml`, `workflow-action-review.yaml`) so display-mode avatars resolve.
   - Fix the display pages' `action_data` request paths to the **pinned** shape (settled — review-3 #5): `get_action` is a `MongoDBAggregation`, so the response is an **array**; direct reads must be `_request: get_action.0.assignees` / `.0.due_date` / `.0.description` / `.0.assignee_docs`. The current un-indexed `get_action.assignees` reads on `workflow-action-{view,review,edit}.yaml` resolve `undefined`. Fix any other un-indexed `get_action.*` reads on the same pages the same way, but keep the fix minimal — Part 40's rewrite replaces these pages with its `surface.*` namespace, so don't restructure them onto SetState here.
3. **Deviation notes** — add a one-paragraph note at the top of `_completed/16-page-templates/design.md` and `_completed/17-shared-pages/design.md` recording the Part 24 layout deviation and pointing to this part (notes documenting deviations are allowed; reopening/redesigning is not).

## Acceptance Criteria

- `apps/demo` builds clean (`pnpm ldf:b` or repo equivalent) with zero universal-fields refs left inside the form cards.
- Form edit page (demo): sidebar card right of the form; changing the assignee + Update writes the doc and the entity-page status-map cell shows the new assignee, without touching form data or stage; a `done` action's sidebar still edits.
- Form action with `universal_fields: false` (add/adjust one demo fixture action): no sidebar, form body spans full width.
- View/review/error pages: read-only sidebar card with avatars, formatted date, rich-text description, placeholders when empty.
- Check edit page: fields render as primary content and persist via `submit` exactly as before.

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — two-column layout, sidebar ref with full vars, remove header band.
- `modules/workflows/templates/view.yaml.njk` — modify — display sidebar.
- `modules/workflows/templates/review.yaml.njk` — modify — display sidebar.
- `modules/workflows/templates/error.yaml.njk` — modify — display sidebar (both branches).
- `modules/workflows/pages/workflow-action-view.yaml` — modify — `assignee_docs` leaf (+ binding sanity check).
- `modules/workflows/pages/workflow-action-review.yaml` — modify — `assignee_docs` leaf (+ binding sanity check).
- `modules/workflows/pages/workflow-action-edit.yaml` — verify only (no `show`, primary content unchanged).
- `designs/workflows-module/parts/_completed/16-page-templates/design.md` — modify — deviation note.
- `designs/workflows-module/parts/_completed/17-shared-pages/design.md` — modify — deviation note.

## Notes

- Coordinate with Part 39's tasks if they're in flight — they edit the same templates (button payloads/signals). The two parts are order-independent by design, but a rebase across both will conflict textually.
- Reviewers who need to change metadata use the edit page's sidebar — do NOT add an edit-mode sidebar to the review template (design's placement table is explicit).
- The error template has two universal-fields refs (two layout branches) — both move to the sidebar pattern.
- End-to-end coverage is explicitly deferred to Part 22's e2e suite; this task's verification is build + manual demo-app checks.
