# Task 8: Reconcile concept docs and register Part 39 in the parent design

## Context

The button-bar prose in the concept docs (`ui` Decisions 2/4/7, `submit-pipeline` Decision 3) was **already migrated to the signal model** in an earlier reconciliation commit. The residual edits are driven by this part's two new things: the `progress` button's dedicated `onProgress` verb (D5) and the net-new `view` button bar (D4). One stale claim in `state-machine` also needs fixing, and the parent design index needs a Part 39 row.

This task is markdown-only. The relevant files:

- `designs/workflows-module-concept/ui/design.md` — Decision 2 button table (~lines 122–130) and Decision 4 event-verb table (~lines 281–292).
- `designs/workflows-module-concept/state-machine/design.md` — "Default v1 button bars" table (~line 250–255).
- `designs/workflows-module/design.md` — Follow-on parts section (~line 115+).

## Task

### 1. `ui` Decision 2 button table

- Change the **`progress` row's** "Author event handler fired" column from `onSubmit` to **`onProgress`** (D5 — the Save Draft button fires its own verb, not `onSubmit`).
- Add a **`view` / `request_changes` row**: page template `view.yaml.njk`, signal `request_changes`, handler `onRequestChanges`, target `changes-required`. Note it is **opt-in** (default hidden) and gated by the standard `action_allowed` — **not** "reviewers only".

### 2. `ui` Decision 4 event-verb vocabulary

- The locked vocabulary grows from **four to five**: add **`onProgress`** to the event-handler table (page `edit`, wired to the Save Draft / `progress` button).
- Update any prose that states the count is "four" to "five" and lists the verbs (`onMount`, `onSubmit`, `onApprove`, `onRequestChanges`, `onProgress`).

### 3. `state-machine` "Default v1 button bars" table

- The `view` row currently asserts `request_changes` "surfaces only to users with `review` access" / "gated on the `review` verb." **Reconcile to the actual gating:** gated like every other template button (the coarse `action_allowed`) and **opt-in**, with the **no-`review`-verb case** as its concrete justification (an action with no `review` verb ships no review page, so `view` is the only surface that can send it back to `changes-required`). Do **not** introduce verb-scoped gating.

### 4. Parent design — register Part 39

- In `designs/workflows-module/design.md`'s Follow-on parts section, add a **Part 39** entry (matching the existing bullet style for Parts 28/25/etc.), summarizing: form-action submit buttons migrate from the interaction model to signals + FSM-derived visibility, add the `progress` (Save Draft) button, add a `view` button bar. Include the dependency note: **depends on Part 38's signal contract; sequences after Part 35** (`kind: task` → `simple`) and with/after Part 38.

## Acceptance Criteria

- `ui` D2's `progress` row handler reads `onProgress`; a `view` / `request_changes` row exists (opt-in, `action_allowed`-gated, not "reviewers only").
- `ui` D4 lists five event verbs including `onProgress`, and any "four" count is updated to "five".
- `state-machine`'s "Default v1 button bars" `view` row no longer claims "reviewers only"/verb-gated `request_changes`; it reflects coarse `action_allowed` + opt-in with the no-`review`-verb justification.
- `designs/workflows-module/design.md` has a Part 39 follow-on entry with the dependency note.
- No other claims in these docs are altered (the docs are already on the signal model — only the residual edits above).

## Files

- `designs/workflows-module-concept/ui/design.md` — modify — D2 `progress` handler + new `view` row; D4 fifth verb.
- `designs/workflows-module-concept/state-machine/design.md` — modify — fix the `view` row's gating claim in "Default v1 button bars".
- `designs/workflows-module/design.md` — modify — add the Part 39 follow-on entry.

## Notes

- `submit-pipeline` Decision 3 and `ui` Decision 7 are already reconciled — do not re-edit them.
- This is documentation only; no code changes. It can be done in parallel with the template tasks since it transcribes decisions already final in `design.md`.
