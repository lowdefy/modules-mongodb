# Task 8: Reconcile concept docs and register Part 39 in the parent design

## Context

The button-bar prose in the concept docs (`ui` Decisions 2/4/7, `submit-pipeline` Decision 3) was **already migrated to the signal model** in an earlier reconciliation commit. The residual edits are driven by this part's two new things: the `progress` button's dedicated `onProgress` verb (D5) and the net-new `view` button bar (D4). One stale claim in `state-machine` also needs fixing, and the parent design index needs a Part 39 row.

This task is markdown-only. The relevant files:

- `designs/workflows-module-concept/ui/design.md` — Decision 2 button table (~lines 122–130) and Decision 4 event-verb table (~lines 281–292).
- `designs/workflows-module-concept/state-machine/design.md` — "Default v1 button bars" table (~line 250–255).
- `modules/workflows/README.md` — consumer-facing module reference ("Transition model (signals)" section, ~lines 117–131).
- `designs/workflows-module/design.md` — Follow-on parts section (~line 115+).

## Task

### 1. `ui` Decision 2 button table

- Change the **`progress` row's** "Author event handler fired" column from `onSubmit` to **`onProgress`** (D5 — the Save Draft button fires its own verb, not `onSubmit`).
- Add a **`view` / `request_changes` row**: page template `view.yaml.njk`, signal `request_changes`, handler `onRequestChanges`, target `changes-required`. Note it is **opt-in** (default hidden) and gated on `action_allowed.view` (the standard per-verb gate, keyed on this template's verb) — **not** "reviewers only".
- **D2 prose below the table (~line 130):** "Decision 4 above lists the **four-verb** event vocabulary" → five-verb, and the handler enumeration "(`onSubmit`, `onApprove`, `onRequestChanges`)" gains `onProgress`.
- **D2 standard-payload prose (~line 118):** the enumeration "the standard payload (`form`, `form_review`, `fields`, `current_key`)" still lists `fields` — Part 39 removes `fields` from every form-template payload (tasks 2–5), so drop it from the enumeration.

### 2. `ui` Decision 4 event-verb vocabulary

- The locked vocabulary grows from **four to five**: add **`onProgress`** to the event-handler table (page `edit`, wired to the Save Draft / `progress` button).
- Update any prose that states the count is "four" to "five" and lists the verbs (`onMount`, `onSubmit`, `onApprove`, `onRequestChanges`, `onProgress`) — including D4's intro sentence ("Action page YAML carries four event handlers…").
- **D4's `onRequestChanges` row** ("Pages that use it: `review`") gains **`view`** — task 5 wires `page_config.events.onRequestChanges` into `view`'s comment modal.

### 2b. `ui` Decision 3 floating-actions prose

- **~line 219:** "wire them to the **four** page-event handlers (`onSubmit`, `onApprove`, `onRequestChanges`)" — same stale count, same incomplete list. The sentence is about button-wired handlers, so list those and add `onProgress` (e.g. "the button-wired page-event handlers (`onSubmit`, `onProgress`, `onApprove`, `onRequestChanges`)").

### 3. `state-machine` "Default v1 button bars" table

- The `view` row currently asserts `request_changes` "surfaces only to users with `review` access" / "gated on the `review` verb." **Reconcile to the actual gating:** gated like every other template button (the per-verb gate, here `action_allowed.view`) and **opt-in**, with the **no-`review`-verb case** as its concrete justification (an action with no `review` verb ships no review page, so `view` is the only surface that can send it back to `changes-required`). Do **not** introduce review-scoped gating — `action_allowed.review` is `false` when the verb is absent from `access`, so it would dead-end exactly the case that justifies the button.

### 4. Module README — button-visibility rules for app authors

In `modules/workflows/README.md`, under the "Transition model (signals)" section (the template-button table at ~line 120 and the throw-on-incoherent-signal paragraph at ~line 130 are the anchors), document the **client-side visibility rules** for the template-shipped buttons. Each button renders iff **all three** hold:

1. **Author opt-out** — `pages.{verb}.buttons.{name}.visible`, default `true`, except the opt-in buttons `not_required` (`edit`) and `request_changes` (`view`) which default `false`. Accepts a boolean **or any operator expression**; it AND-combines with the other two gates, so an author can only further *restrict* visibility — never show a button the FSM or role gate rejects.
2. **FSM source-stage** — the action's current stage is in the signal's source list (`enums/button_signal_sources.yaml`, derived from the engine FSM and guarded by a unit test). This is why a button disappears rather than throwing: the engine rejects user-driven signals with no FSM entry, and the page hides the button before that can happen.
3. **Per-verb role gate** — `action_allowed.{verb}` for the page's own verb (`edit` page → `edit`, `review` → `review`, `error` → `error`, `view` → `view`), the bag `action_role_check` writes on mount.

Also record the new `view` bar: an Edit-nav `Link` (shows when `page_ids.edit` is set; carries `skip_status_redirect: true`) and the opt-in `request_changes` comment-modal button (the revise-after-`done` path — the only send-back surface for actions with no `review` verb).

### 5. Parent design — register Part 39

- In `designs/workflows-module/design.md`'s Follow-on parts section, add a **Part 39** entry (matching the existing bullet style for Parts 28/25/etc.), summarizing: form-action submit buttons migrate from the interaction model to signals + FSM-derived visibility, add the `progress` (Save Draft) button, add a `view` button bar. Include the dependency note: **depends on Part 38's signal contract; sequences after Part 35** (`kind: task` → `simple`) and with/after Part 38.

## Acceptance Criteria

- `ui` D2's `progress` row handler reads `onProgress`; a `view` / `request_changes` row exists (opt-in, `action_allowed.view`-gated, not "reviewers only").
- No "four-verb"/"four event handlers"/"four page-event handlers" count or three-verb handler enumeration remains anywhere in `ui/design.md` — D2 prose (~130), D3 floating-actions (~219), and D4 all read five verbs / include `onProgress`.
- `ui` D2's standard-payload enumeration (~118) no longer lists `fields`.
- `ui` D4's `onRequestChanges` row lists pages `review`, `view`.
- `ui` D4 lists five event verbs including `onProgress`, and any "four" count is updated to "five".
- `state-machine`'s "Default v1 button bars" `view` row no longer claims "reviewers only"/review-gated `request_changes`; it reflects the per-verb `action_allowed.view` gate + opt-in with the no-`review`-verb justification.
- `modules/workflows/README.md` documents the three-part visibility rule (author opt-out incl. operator expressions and restrict-only semantics + opt-in defaults; FSM source-stage via `enums/button_signal_sources.yaml`; per-verb `action_allowed.{verb}` keyed on the page's own verb) and the new `view` bar.
- `designs/workflows-module/design.md` has a Part 39 follow-on entry with the dependency note.
- No other claims in these docs are altered (the docs are already on the signal model — only the residual edits above).

## Files

- `designs/workflows-module-concept/ui/design.md` — modify — D2 `progress` handler + new `view` row; D4 fifth verb.
- `designs/workflows-module-concept/state-machine/design.md` — modify — fix the `view` row's gating claim in "Default v1 button bars".
- `modules/workflows/README.md` — modify — document the button-visibility rules + the new `view` bar.
- `designs/workflows-module/design.md` — modify — add the Part 39 follow-on entry.

## Notes

- `submit-pipeline` Decision 3 and `ui` Decision 7 are already reconciled — do not re-edit them.
- This is documentation only; no code changes. It can be done in parallel with the template tasks since it transcribes decisions already final in `design.md`.
