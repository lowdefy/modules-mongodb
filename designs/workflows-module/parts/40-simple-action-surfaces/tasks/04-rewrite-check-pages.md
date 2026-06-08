# Task 4: Rewrite the three `workflow-action-*` pages onto the shared surface (D1 / D2 / D4 / D6)

## Context

The three shared check-action pages still run the v0 interaction model and must move to the signals + FSM model, with their body delegated to the `check-action-surface` component (Task 3, `mode: edit|view|review`). This task rewrites the page shells: each keeps its own `onMount` scaffolding (guards, requests, role check) but populates the **`_state.surface`** namespace the surface reads, swaps its inline body for an `_ref` of the surface, and drops the v0 selector / `interaction:` / `current_status` machinery.

Current files:

- `modules/workflows/pages/workflow-action-edit.yaml` — 8-step `onMount`; body has a workflow-closed banner, universal-fields (`mode: edit`), a **status `Selector`** with a `_js` priority filter (`:135–156`), a "No transitions available" Alert (`:124–134`), a comment, and a single **Save** button firing `interaction: submit_edit` + `current_status` (`:196–215`).
- `modules/workflows/pages/workflow-action-view.yaml` — read-only header + universal-fields (`mode: display`) + status-history card + a **Comments** card. **Note:** [Part 33](../../33-comment-rendering/design.md), ordered before this part, deletes the Comments card and replaces it with the shared `events-timeline` `_ref` filtered to the action; by the time this part runs the view body carries the timeline, not the card. No button bar, no stale-URL guard.
- `modules/workflows/pages/workflow-action-review.yaml` — workflow-closed banner, header, universal-fields (`mode: display`), comment, **floating-actions** bar with Request Changes (opens a comment `Modal`) + Approve (`interaction: approve`), and a `request_changes_modal` (`interaction: request_changes`). Stale-URL guard allowlists `[in-review, error]`.

**What carries over unchanged (D6):** the `action_id` presence guard; `get_action` / `get_workflow` requests; `action_role_check`; the workflow-closed banner + `required_after_close` gate; the stale-URL guard on `workflow-action-edit` (`[action-required, in-progress, changes-required]`) and `workflow-action-review` (`[in-review, error]`). Only the selector, the `interaction:`/`current_status` payloads, and the per-button `_js` visibility are replaced.

## Task

### All three pages

1. **Body → surface.** Replace each page's inline body blocks with an `_ref` of `components/check-action-surface.yaml` passing `mode: edit` / `view` / `review`. The header, banner, fields, comment, button bars, and (view) status-history now live in the surface — remove the now-duplicated inline blocks.
2. **Populate the `surface` namespace in `onMount`.** Rewrite each page's priming `SetState`:
   - `surface.action` ← `_request: get_action` (the full action doc, including `allow_not_required`).
   - `surface.fields` ← `{ assignees, due_date, description }` from `get_action` (**edit page only** — primes editable fields; view/review read display fields from `surface.action`).
   - `surface.comment` ← `null`.
   - `surface.action_allowed` ← a following `SetState` copying `action_role_check`'s root output: `surface.action_allowed: { _state: action_allowed }` (see Notes).
3. **`interaction:` → `signal:`** and **drop `current_status`** everywhere — now entirely the surface's concern. After the body moves to the surface, no `interaction:`/`current_status` should remain on any page.

### `workflow-action-edit.yaml`

- Delete the status `Selector` (`:135–156`), the "No transitions available" Alert (`:124–134`), and the `current_status` payload — gone with the body move to `mode: edit`.
- Keep the 8-step `onMount` structure (action_id guard → `get_action` → stale-URL guard `[action-required, in-progress, changes-required]` → `get_workflow` → `action_role_check` → prime `surface.*`).
- The Save/`submit`, `progress`, and `not_required` buttons now come from the surface; remove the inline floating-actions Save button.

### `workflow-action-view.yaml`

- Body → `mode: view`. The `resolve_error` button (D4) is rendered **by the surface** (source `[error]`, gated `action_allowed.error`) — appears only at stage `error`. **No `check-error` page.** The Part 38 link table already routes `kind: check` `error` → `workflow-action-view`, so the button lands where the engine points — no Part 30/38 change needed here.
- **Render the Part 33 events-timeline `_ref` at page level, below the surface `_ref`** (D1 / review-2 #4) — it is **not** inside the surface. Carry over Part 33's action-filtered `events-timeline` `_ref` from the current view page (the swap Part 33 made), placed as a sibling block after the surface.
- The status-history `List` is **inside the surface** (`view` mode reads `surface.action.status` — no request). Drop the page's separate `status_history_list` `SetState` seed (`:36–40`) and the inline status-history card — the surface owns it.

### `workflow-action-review.yaml`

- Body → `mode: review`. The `approve` + `request_changes` buttons and the `request_changes` comment modal now live in the surface (so they work identically in the modal container). Remove the page-level floating-actions bar and the page-level `request_changes_modal` — the review flow is preserved **inside** the surface, not deleted.
- Keep the stale-URL guard allowlist `[in-review, error]`.

## Acceptance Criteria

- All three pages render their body via `_ref: components/check-action-surface.yaml` with the correct `mode`.
- No status `Selector`, "No transitions available" Alert, or `_js` priority filter remains on any page.
- No `interaction:` or `current_status` / `target_status` payload keys remain on any page.
- Each page's `onMount` populates `_state.surface.{action, fields?, comment, action_allowed}`; the surface's reads resolve.
- Carried-over scaffolding (guards, `get_action`/`get_workflow`, `action_role_check`, workflow-closed banner + `required_after_close` gate, stale-URL guards) is intact.
- `workflow-action-view` renders the Part 33 events-timeline `_ref` at **page level below the surface** (not inside it); the status-history is inside the surface's `view` mode.
- `workflow-action-view` surfaces `resolve_error` only at stage `error`; `workflow-action-review` preserves the approve / request-changes flow via the surface.
- The demo build succeeds and the pages render.

## Files

- `modules/workflows/pages/workflow-action-edit.yaml` — modify — delete selector/Alert/`current_status`; body → surface (`edit`); `onMount` primes `surface.*`.
- `modules/workflows/pages/workflow-action-view.yaml` — modify — body → surface (`view`); `resolve_error` via surface; events-timeline `_ref` stays page-level below the surface; drop the inline status-history card + `status_history_list` seed.
- `modules/workflows/pages/workflow-action-review.yaml` — modify — body → surface (`review`); move approve/request-changes flow into the surface; keep stale-URL guard.

## Notes

- **`action_role_check` namespace (review-2 #3).** The surface reads `surface.action_allowed.{verb}`. `components/action_role_check.yaml` writes the per-verb map `{ view, edit, review, error }` to **root** `action_allowed` (shipped). Its target is fixed because Part 39's four form templates also `_ref` it and read root `action_allowed`. So run it as-is, then add a following `SetState` in the same `onMount`: `surface.action_allowed: { _state: action_allowed }`. Do **not** parameterise the component's key — it is plain `.yaml`, so a configurable key would force a `.yaml.njk` conversion plus `_ref`-path edits in the four out-of-scope form templates, for no enforcement gain.
- **Events-timeline request-id collision.** Keeping the events timeline page-level (one instance per page) avoids the `Duplicate requestId` build error from the component's fixed `get-events` request id (request ids are not `_ref`-scoped) — this is why it must not go inside the surface.
- **Audit state refs** ([CLAUDE.md]): moving from top-level `fields.*` / `status` / `comment` / `action_allowed` to the `surface.*` namespace changes auto-bound input paths and every operator that read the old paths. Sweep each page for stale `_state: fields.*`, `_state: status`, `_state: comment`, `_state: action_allowed` references after the move.
- The modal (Task 5) replicates this same `onMount` gating sequence for its open handler — keep the sequence identical so both containers behave the same.
