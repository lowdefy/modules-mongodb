# Task 6: Rewrite `workflow-action-view` onto the surface (`mode: view`) — error recovery lands here

## Context

`modules/workflows/pages/workflow-action-view.yaml` renders: an action header
(`:60–115`), the universal-fields `_ref` in display mode (`:116–127`), a
Status History card (`:128–195`), and a Comments card backed by a page-local
events aggregation (`:196–282`). It has no button bar and no stale-URL guard
(the view page is the canonical, always-available link target — including for
`done` / `not-required` / `error` stages).

Task 3's surface absorbs the header, fields, status history (a List bound
directly to `current_action.status` — the page's `set_status_history` SetState
at `:35–39` becomes unnecessary), the error-stage comment field, and the new
**`resolve_error`** button — Part 40's resolution of ui Open Question 4
(design D4): a check action reaches `error` only via a pre-hook error cascade,
and recovery is a button on the view page (FSM `error → resolve_error →
in-review`), **not** a separate `check-error` page. Its visibility is the
server-resolved `current_action.buttons.resolve_error` (true only at stage
`error` for an `error`-verb user).

**Part 33 caveat (differs from the design's assumed state):** the design
assumes Part 33 already swapped the Comments card for the shared
events-timeline `_ref`. Part 33 is still in `_next` and unimplemented — the
Comments card is live on this page. Part 40 treats the comments/timeline as
**page-level chrome, not part of the surface** (design D1 / review-2 #4), so
this task keeps the Comments card on the page, below the surface, untouched.
Part 33 owns the swap.

## Task

Rewrite `modules/workflows/pages/workflow-action-view.yaml`:

1. **`onMount`**:
   - `redirect_no_action` and `get_action` — unchanged.
   - **Delete** `set_status_history` (`:35–39`) — the surface's List binds
     `current_action.status` from the spread response.
   - Replace `prime_form_state` (the no-op at `:47–49`) with the same two
     SetState steps as tasks 4–5 (`set_current_action` spread +
     `seed_working_state` for `current_action.fields.*`,
     `current_action.comment: null`, and the mode literal
     **`current_action.mode: view`** — tasks.md "Decisions applied" #4).
     The fields seed matters here too:
     an `edit`-verb user opening a non-actionable action's view page gets
     editable universal fields (Part 24's Update path, design D1); the
     comment seed backs the `resolve_error` recovery note.
   - Still **no stale-URL guard** — view accepts every stage.
2. **Body**:

   ```yaml
   blocks:
     - _ref:
         path: components/check-action-surface.yaml
     - id: comments_card        # unchanged — Part 33 will replace this
       …                        # (keep :196–282 verbatim, page-level, below the surface)
   ```

   No `mode` var — the surface reads `_state: current_action.mode`, set in
   `onMount` above.

   Delete the `action_card` header/fields blocks (`:55–127`) and the
   `status_history_card` (`:128–195`) — both absorbed. Keep the
   `comments_card` and its `get_comment_events` request exactly as shipped.
3. **Header comment** — update `:1–8`: thin container + surface, error
   recovery via `resolve_error` (D4), Comments card retained pending Part 33.

## Acceptance Criteria

- The page body is the surface `_ref` followed by the untouched
  `comments_card`; `status_history_card`, `set_status_history`, and the
  inline header are gone.
- At stage `error` with an `error`-verb user, the page shows the comment
  field and a **Resolve Error** button (via the surface); firing it calls
  the `update-action-{type}` endpoint with `signal: resolve_error`, no
  `fields` key, and the comment as the recovery note.
- At any non-`error` stage, no signal buttons render for a view-only user;
  an `edit`-verb user still sees editable universal fields (observable once
  Part 24 lands — until then the stub renders nothing).
- Demo app build succeeds.

## Files

- `modules/workflows/pages/workflow-action-view.yaml` — modify — thin container + retained Comments card

## Notes

- There is **no `check-error` page** — do not create one; the engine's link
  table already routes the check `error` verb to this view page (Part 38
  task 18).
- When Part 33 lands later, it deletes the Comments card and drops the shared
  events-timeline `_ref` here (page-level, below the surface — the amended
  Part 33 contract per design D1).
