# Task 5: Rewrite `workflow-action-review` onto the surface (`mode: review`)

## Context

`modules/workflows/pages/workflow-action-review.yaml` carries its own banner,
header, universal-fields `_ref`, comment field, a floating-actions bar with
Request Changes + Approve firing `interaction: approve` /
`interaction: request_changes` (`:130–187`), and a `request_changes_modal`
(`:188–234`). Task 3's `check-action-surface.yaml` absorbs all of it in
`review` mode — including the request-changes modal — with the buttons firing
`signal: approve` / `signal: request_changes` and visibility reading the
server-resolved `current_action.buttons.{approve, request_changes}`.

Two page-level changes beyond the body swap (design D6):

- **Stale-URL guard allowlist shrinks to `[in-review]`** — `error` is
  dropped. A check action at `error` renders no review buttons, and the
  engine routes its `error` verb to `workflow-action-view` (where
  `resolve_error` lives, task 6), so the guard now redirects an `error`-stage
  hit to the view page instead of stranding the user on a buttonless review
  render.
- The `interaction:` payloads disappear with the body (the surface owns the
  signal calls).

## Task

Rewrite `modules/workflows/pages/workflow-action-review.yaml`:

1. **`onMount`**:
   - `redirect_no_action` and `get_action` — unchanged.
   - `redirect_stale_status` (`:35–46`): allowlist becomes just
     `- in-review` (drop `error`); redirect target stays
     `workflow-action-view`.
   - Replace `prime_form_state` (`:53–56`) with the same two SetState steps
     as task 4 (`set_current_action` spreading the response;
     `seed_working_state` seeding `current_action.fields.{assignees, due_date,
     description}` from the response, `current_action.comment: null`, and the
     mode literal **`current_action.mode: review`** — tasks.md "Decisions
     applied" #4). Seeding `fields` on the review page is deliberate:
     universal-fields
     editability is edit-verb-gated (design D1), so an `edit`-verb reviewer
     gets live inputs bound at `current_action.fields.*`.
2. **Body** — replace the `action_card` (`:60–129`), the floating-actions
   `_ref` (`:130–187`), and the `request_changes_modal` (`:188–234`) with:

   ```yaml
   blocks:
     - _ref:
         path: components/check-action-surface.yaml
   ```

   No `mode` var — the surface reads `_state: current_action.mode`, set in
   `onMount` above. The request-changes modal now lives inside the surface
   (task 3 block 7) —
   "keep `request_changes_modal`" from the design's Files table is satisfied
   there, not on the page.
3. **Deletions to verify gone**: `interaction:`, the page-level
   `request_changes_modal`, the inline banner/header/universal-fields/comment
   blocks, the `allowed.review` button visibility reads (now
   `buttons.{signal}` inside the surface).
4. **Header comment** — update `:1–8` to describe the thin container and note
   the `[in-review]`-only guard rationale.

## Acceptance Criteria

- Guard allowlist is exactly `[in-review]`; an `error`-stage action_id
  redirects to `workflow-action-view`.
- `grep -E "interaction|allowed\.review"` on the page is empty; the page has
  no block definitions besides the surface `_ref`.
- A `review`-verb user at stage `in-review` sees Approve + Request Changes;
  Request Changes requires a comment before submitting (modal validation,
  via the surface).
- Demo app build succeeds.

## Files

- `modules/workflows/pages/workflow-action-review.yaml` — modify — thin container, guard allowlist `[in-review]`

## Notes

- The old page's modal validated `params: comment`; the surface's version
  validates the namespaced `current_action.comment` — no page involvement.
- The approve/request_changes payloads carry `comment` but never `fields`
  (review mode is read-only content; design D1 / review-4 #7) — enforced in
  the surface, listed here because this page is where review-mode behaviour
  is verified.
