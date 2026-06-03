# Task 4: Rewrite the three `simple-*` pages onto the shared surface (D1 / D2 / D4 / D6)

## Context

The three shared simple-action pages still run the v0 interaction model and must move to the signals + FSM model, with their body delegated to the `simple-action-surface` component (Task 3, `mode: edit|view|review`). This task rewrites the page shells: each keeps its own `onMount` scaffolding (guards, requests, role check) but populates the **`_state.surface`** namespace the surface reads, swaps its inline body for an `_ref` of the surface, and drops the v0 selector / `interaction:` / `current_status` machinery.

Current files:

- `modules/workflows/pages/workflow-action-edit.yaml` — 8-step `onMount`; body has a workflow-closed banner, universal-fields (`mode: edit`), a **status `Selector`** with a `_js` priority filter (`:135–156`), a "No transitions available" Alert, a comment, and a single **Save** button firing `interaction: submit_edit` + `current_status` (`:196–215`).
- `modules/workflows/pages/workflow-action-view.yaml` — read-only header + universal-fields (`mode: display`) + status-history card + comments card. No button bar, no stale-URL guard.
- `modules/workflows/pages/workflow-action-review.yaml` — workflow-closed banner, header, universal-fields (`mode: display`), comment, **floating-actions** bar with Request Changes (opens a comment `Modal`) + Approve (`interaction: approve`), and a `request_changes_modal` (`interaction: request_changes`). Stale-URL guard allowlists `[in-review, error]`.

**What carries over unchanged (D6):** the `action_id` presence guard; `get_action` / `get_workflow` requests; `action_role_check`; the workflow-closed banner + `required_after_close` gate; the stale-URL guard on `workflow-action-edit` (`[action-required, in-progress, changes-required]`) and `workflow-action-review` (`[in-review, error]`); `workflow-action-view`'s status-history + comments (now living **inside** the surface component). Only the selector, the `interaction:`/`current_status` payloads, and the per-button `_js` visibility are replaced.

## Task

### All three pages

1. **Body → surface.** Replace each page's inline body blocks with an `_ref` of `components/simple-action-surface.yaml` passing `mode: edit` / `view` / `review` respectively. The header, banner, fields, comment, button bars, status-history, and comments now live in the surface — remove the now-duplicated inline blocks from the pages.
2. **Populate the `surface` namespace in `onMount`.** Rewrite each page's priming `SetState` so the surface's `_state.surface` reads resolve:
   - `surface.action` ← `_request: get_action` (the full action doc).
   - `surface.fields` ← `{ assignees, due_date, description }` from `get_action` (edit page) — primes editable fields; for view/review the surface reads display fields from `surface.action`, so seeding `surface.fields` is only required where fields are editable (`edit`).
   - `surface.comment` ← `null`.
   - `surface.action_allowed` ← the per-verb map produced by `action_role_check` (see Notes). The current top-level `action_allowed` key must move under `surface.action_allowed`.
3. **`interaction:` → `signal:`** and **drop `current_status`** everywhere it appears — this is now entirely the surface's concern (the surface owns the button bar and payloads). After the body moves to the surface, no `interaction:`/`current_status` should remain on any page.

### `workflow-action-edit.yaml`

- Delete the status `Selector` (`:135–156`), the "No transitions available" Alert (`:124–134`), and the `current_status` payload — gone with the body move to `mode: edit`.
- Keep the 8-step `onMount` structure (action_id guard → `get_action` → stale-URL guard `[action-required, in-progress, changes-required]` → `get_workflow` → `action_role_check` → prime `surface.*`).
- The Save/`submit` button, `progress`, and `not_required` now come from the surface; remove the inline floating-actions Save button.

### `workflow-action-view.yaml`

- Body → `mode: view`. The `resolve_error` button (D4) is rendered by the surface (source list `[error]`, gated `action_allowed.error`) — it appears only when the action's stage is `error`. **No `simple-error` page.** The engine's `linkDefaults` already routes `kind: simple` `error` → `workflow-action-view`, so the button lands exactly where the engine points — no Part 30 change needed.
- Keep the `set_status_history` seeding only if the surface still relies on a page-level state key; otherwise the surface's status-history card reads from `surface.action.status` directly — prefer reading from the `surface` namespace and drop the separate `status_history_list` seed if the surface handles it. (Resolve against the surface's actual implementation from Task 3.)

### `workflow-action-review.yaml`

- Body → `mode: review`. The `approve` + `request_changes` buttons and the `request_changes` comment modal now live in the surface (so they work identically in the modal container). Remove the page-level floating-actions bar and the page-level `request_changes_modal` — the review flow is preserved **inside** the surface, not deleted.
- Keep the stale-URL guard allowlist `[in-review, error]`.

## Acceptance Criteria

- All three pages render their body via `_ref: components/simple-action-surface.yaml` with the correct `mode`.
- No status `Selector`, no "No transitions available" Alert, no `_js` priority filter remains on any page.
- No `interaction:` or `current_status` / `target_status` payload keys remain on any page.
- Each page's `onMount` populates `_state.surface.{action, fields?, comment, action_allowed}`; the surface's reads resolve.
- Carried-over scaffolding (guards, `get_action`/`get_workflow`, `action_role_check`, workflow-closed banner + `required_after_close` gate, stale-URL guards) is intact.
- `workflow-action-view` surfaces `resolve_error` only at stage `error`; `workflow-action-review` preserves the approve / request-changes flow via the surface.
- The demo build succeeds and the pages render.

## Files

- `modules/workflows/pages/workflow-action-edit.yaml` — modify — delete selector/Alert/`current_status`; body → surface (`edit`); `onMount` primes `surface.*`; `interaction:`→`signal:` removed (now in surface).
- `modules/workflows/pages/workflow-action-view.yaml` — modify — body → surface (`view`); `resolve_error` via surface; reconcile status-history/comments seeding with the surface.
- `modules/workflows/pages/workflow-action-review.yaml` — modify — body → surface (`review`); move approve/request-changes flow into the surface; keep stale-URL guard.

## Notes

- **`action_role_check` namespace.** The surface reads `surface.action_allowed.{verb}`. The shipped `components/action_role_check.yaml` writes a top-level single-boolean `action_allowed` via `SetState`. Two things must align: (1) the per-verb map is [Part 34 D8]'s output (cross-wave dependency — see `tasks.md`); (2) its result must land under `surface.action_allowed`. Wire the `onMount` so `action_role_check`'s output is written to `surface.action_allowed` (either by parameterising the component's target key, or by a following `SetState` that maps it). Match whatever Part 34 produces.
- **Audit state refs** ([CLAUDE.md]): moving from top-level `fields.*` / `status` / `comment` / `action_allowed` to the `surface.*` namespace changes auto-bound input paths and every operator that read the old paths. Sweep each page for stale `_state: fields.*`, `_state: status`, `_state: comment`, `_state: action_allowed` references after the move.
- The modal (Task 5) replicates this same `onMount` gating sequence for its own open handler — keep the sequence identical so both containers behave the same.
