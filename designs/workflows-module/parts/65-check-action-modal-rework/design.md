# Part 65 — Check-action modal rework + decouple universal fields from transitions

The in-context check-action modal is the last action surface still using the original Part 24 arrangement: it edits `assignees`/`due_date` inline, writes them onto the doc **on submit** (as part of the FSM transition), and shows a status-history card. Every other action surface has since converged on a calmer pattern — assignees/due render as display-only chips edited through a separate modal, the authored `description` (Part 64) renders as a read-only lead-in, and the page header is the shared `title-block`. This part brings the modal onto that same pattern and, in doing so, removes the engine special-case that let a check submit double as a field write. The governing decision: **changing an action's assignees or due date is not the same as submitting the action** — universal-field writes flow exclusively through the `UpdateActionFields` operation, never through a transition.

## Proposed change

1. **Universal fields are never written on a transition.** Remove the `kind === "check"` branch in `applyUpdateFieldsRule` (`planActionTransition.js`) so `assignees`/`due_date` are stripped from the update-path `fields` bag for **every** kind. The create/upsert path is unchanged (it never calls the rule), so start-time seeding still works.
2. **Both check surfaces stop sending `fields` on submit.** Drop the `fields:` mapping from the `submit` and `progress` payloads — and the now-pointless `^current_action\.fields\.` `Validate` before submit — on the modal (`check-action-surface.yaml`) and the workspace check page (`action.yaml.njk`). (Form-mode pages are untouched: their `fields` payload is the form body, which is correctly written on submit.)
3. **Modal: delete the status-history card.** The modal is a quick in-context shortcut; full history lives on the action's own page and entity timeline.
4. **Modal: assignees/due become display-only chips + a ✎ edit modal.** Replace the inline `universal-fields.yaml` (edit/display) composition with the converged Part 56-addendum fragments — `universal-fields-chips.yaml` (assignee avatars + due pill + ✎) and a nested `universal-fields-modal.yaml` whose `Update` calls `{workflow_type}-update-fields`. Editing fields no longer touches the signal bar.
5. **Modal: render the authored `description`.** Add the `action-description.yaml` read-only Markdown lead-in (sourced from `current_action.description`) — the render Part 64 deferred to "a separate design." This is that design.
6. **Modal: header becomes the shared `title-block`.** Replace the hand-rolled `action_header` (Title + Tag) with `modules/shared/layout/title-block.yaml`, configured exactly as the workspace page configures it (status pill left, `message` as title, chips in `page_actions`) **minus the workflow-name eyebrow** — the modal's host page already establishes that context.

The net effect: the modal becomes the same composition the workspace pages already use, and the engine no longer carries a kind-conditional field-write path.

## Background — what each surface does today

| Surface                                            | Universal fields        | `description`    | Status history | Header                              | Writes fields on submit?          |
| -------------------------------------------------- | ----------------------- | ---------------- | -------------- | ----------------------------------- | --------------------------------- |
| Form pages (`edit/review/error/view.yaml.njk`)     | chips + edit modal      | authored lead-in | no             | shared `title-block` (with eyebrow) | no (form body only)               |
| Workspace check page (`action.yaml.njk`)           | chips + edit modal      | authored lead-in | no             | shared `title-block` (with eyebrow) | **yes — `current_action.fields`** |
| **In-context modal (`check-action-surface.yaml`)** | **inline edit/display** | **none**         | **yes**        | **hand-rolled Title + Tag**         | **yes — `current_action.fields`** |

The form/workspace surfaces converged via Part 56-addendum (chips/modal) and Part 64 (authored `description`, two-field universal set). Part 64 explicitly deferred the modal's `description` render and layout to a follow-on; meanwhile the modal kept the original Part 24 inline arrangement and the transition-field coupling. This part closes both gaps.

The "edge case" in the engine is `applyUpdateFieldsRule(fields, kind)`:

```js
function applyUpdateFieldsRule(fields, kind) {
  if (fields == null) return {};
  if (kind === "check") return fields; // ← the special case being removed
  const filtered = { ...fields };
  for (const key of UNIVERSAL_FIELDS) delete filtered[key];
  return filtered;
}
```

It exists only so a check submit could carry `assignees`/`due_date` through the transition. With both check surfaces no longer sending `fields` on submit, the branch is dead — and removing it makes the rule uniform: universal keys are stripped on the update path for **all** kinds, written exclusively by `UpdateActionFields`.

## Key decisions

### D1 — Decouple field writes from transitions (the governing decision)

A check action's _submission_ is a signal (`approve` / `request_changes` / `progress` / …) plus an optional comment. Its assignees and due date are metadata about _who/when_, not submission content — editing them is a distinct intent with its own operation (`UpdateActionFields`) and its own event. Coupling them to the submit transition meant: (a) the engine needed a kind-conditional write path, (b) a submit silently re-wrote fields from whatever was in `current_action.fields`, and (c) the surface needed inline editable inputs in the signal flow. Decoupling removes all three. This **reverses** the original Part 24/40 modal decision ("the surface's submit/progress signals additionally carry `fields`") — recorded here as a deliberate change of direction, not a drift.

### D2 — Reuse the converged fragments; don't build modal-bespoke blocks

The modal composes the _same_ leaves the workspace pages already use — `title-block.yaml`, `universal-fields-chips.yaml`, `universal-fields-modal.yaml`, `action-description.yaml`. This is the "one correct way" payoff Part 56-addendum set up (it built the chips/modal as reusable fragments precisely so the modal could adopt them later) and Part 64 anticipated ("the shared `action-description.yaml` leaf is built so that design can drop it straight into the modal card"). No new component files are created.

### D3 — Modal header: shared `title-block`, eyebrow omitted, no subtitle

The header reuses `title-block.yaml` with `title: current_action.message`, the status pill (left), and the chips in `page_actions` — identical to `action.yaml.njk`'s wiring — but **without** the `type` (eyebrow) var. Rationale: the modal is opened from a host page (an entity page, a timeline card) that already names the workflow; repeating the workflow name as a page-sized eyebrow is redundant chrome inside a modal. No `description`/`doc` var is passed, so there is **no subtitle** (matching the workspace page, which also passes none) — the action's guidance lives in the `description` lead-in immediately below the header, so a subtitle would duplicate it. (Mockups explored a compact hand-rolled header and a two-row variant; the shared component minus eyebrow was chosen for maximum consistency with the page.)

### D4 — Keep the `current_action.stage` scalar

The `current_action.stage` scalar exists because the status-history `List` (bound at `id: current_action.status`) was pruned by Lowdefy whenever it was hidden, deleting `current_action.status` and making `status.0.stage` undefined. Deleting the List removes that pruning, so the _original rationale_ for the scalar is gone — but the scalar is **kept**: it is still read by the header status pill and the error-stage comment gate, and the workspace pages seed an identical `current_action.stage`, so keeping it holds "one correct way" across surfaces and avoids editing the workspace template's reseed sites. Only the explanatory comment in `check-action-surface.yaml` changes (the pruning justification no longer applies; the scalar is retained as the stable stage source, consistent with the workspace pages).

### D5 — Edit-modal `on_complete`: refetch + reseed

The nested edit modal's `Update` writes fields server-side; the chips read `current_action.assignee_docs` / `current_action.due_date` from the envelope. So after a successful `Update` the modal's `on_complete` refetches `get_workflow_action` and reseeds `current_action` (the same spread+seed the open handler runs), then the edit modal self-closes (appended by `universal-fields-modal.yaml`). This mirrors the reseed the workspace page already runs after each signal — the inline-reseed duplication is pre-existing across the workflow templates; DRYing all of it into a shared action-list is a possible later cleanup, out of scope here.

## Modal composition after this part

`check-action-surface.yaml`, top to bottom:

```
1. workflow_closed_banner          (unchanged — Alert, gated workflow_closed AND not required_after_close)
2. title-block.yaml                (NEW header — status pill · message title · chips in page_actions; no eyebrow)
3. action-description.yaml          (NEW — authored description lead-in; self-hides when null)
4. comment (TiptapInput)           (unchanged — edit/review modes, or view-when-error)
5. signal_button_bar               (unchanged buttons; submit/progress no longer carry `fields`; no fields Validate)
6. request_changes_modal           (unchanged)
7. universal-fields-modal.yaml      (NEW — nested edit modal, opened by the chips ✎)
   ── DELETED: action_header (hand-rolled), inline universal-fields.yaml, status_history_card
```

The chips bind `current_action.assignee_docs` / `current_action.due_date` (the resolved values, as on the workspace page — not `current_action.fields.*`). The edit-modal inputs bind `current_action.fields.{assignees,due_date}` (the working copy the open handler already seeds). `current_action.fields` is still seeded by `check-action-modal.yaml`'s open handler — unchanged.

## Files changed

### Plugin — engine

- **`shared/phases/planners/planActionTransition.js`** — simplify `applyUpdateFieldsRule`: drop the `kind` parameter and the `if (kind === "check") return fields;` branch so universal keys are stripped on the update path for all kinds. Update the call site (`...applyUpdateFieldsRule(payload.fields)`), the `UNIVERSAL_FIELDS` comment, and the JSDoc (the `payload.fields` note no longer carries a kind exception).
- **`shared/phases/planners/planActionTransition.test.js`** — rewrite the `check kind update: payload.fields is a verbatim passthrough (universal keys written)` test → universal keys are now **stripped** for `check` too (parity with form/tracker). The insert/upsert/seed-mode tests (universal keys written on create) are unchanged.
- **Audit** `shared/phases/planSubmit.test.js` and `WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js` for any assertion that a `check` submit persists `assignees`/`due_date` on transition; update to the new behavior (transition does not write universal fields).

### Module — `modules/workflows/`

- **`components/check-action-surface.yaml`** — the main rework:
  - Replace `action_header` (Title + status Tag) with `_ref` to `../shared/layout/title-block.yaml`: `title: current_action.message`, `status: current_action.stage`, `status_enum: ../shared/enums/action_statuses.yaml`, `show_back_button: false`, **no `type`**, `page_actions: [ universal-fields-chips.yaml ]` (vars: `modal_id`, `action_data.assignee_docs`, `action_data.due_date`).
  - Delete the inline `universal-fields/universal-fields.yaml` composition.
  - Delete `status_history_card` (the whole `List` block).
  - Add `action-description.yaml` `_ref` (`content: _state: current_action.description`) as the lead-in below the header.
  - Mount `universal-fields/universal-fields-modal.yaml` (vars: matching `modal_id`, `state_path: current_action.fields`, `workflow_type: _state current_action.workflow_type`, `action_id: _state current_action._id`, `allowed_edit: _state current_action.allowed.edit`, `on_complete: [ refetch get_workflow_action, reseed current_action ]`).
  - Remove `fields:` from the `progress` and `submit` payloads; remove the `Validate { regex: ^current_action\.fields\. }` step before `submit`.
  - Update the header comment block: drop the status-history/pruning rationale; note the `current_action.stage` scalar is retained as the stable stage source (D4).
- **`templates/action.yaml.njk`** (workspace check page) — remove `fields:` from the `progress` and `submit` payloads; remove the `Validate { regex: ^current_action\.fields\. }` before `submit`. (Header/chips/description already converged — no other change.)

No new component files; `universal-fields.yaml`'s `display` group stays (still used by `mode: display` consumers elsewhere — unaffected).

## No migration

Nothing to migrate: the module is unreleased and there are no stored docs to clean up. The change is purely behavioral (transitions stop writing universal fields) and presentational (modal composition). Action docs continue to carry `assignees`/`due_date`, written by `UpdateActionFields` exactly as before.

## Non-goals / deferred

- **DRYing the reseed.** The spread+seed+derive-mode sequence is repeated across the workflow templates and now the edit-modal `on_complete`; extracting a shared action-list is a separate cleanup.
- **Engine-driven assignee/due seeding mid-life.** With the `kind: check` branch gone, no transition can carry universal fields for any kind. If a future need arises for the engine to set assignees on a transition (vs. at create or via `UpdateActionFields`), that is a new, explicit design — not reintroducing the removed special-case.
- **Form-mode pages.** Their submit `fields` payload is the form body and is unaffected; this part touches only the two check surfaces.

## Relates to / depends on

- **Part 64 (action `description` rework)** — implemented (HEAD). Provides `action-description.yaml`, the two-field universal set, and the deferred-modal note this part fulfills.
- **Part 56-addendum (action-page layout revision)** — provides `universal-fields-chips.yaml` / `universal-fields-modal.yaml` and the chips-+-modal pattern the modal now adopts.
- **Part 24 (universal-fields surface)** — its `assignees`/`due_date` write path via `UpdateActionFields` is the path this part makes the _only_ path; the modal's inline-edit + write-on-submit decisions are reversed here (D1).
- **Part 40 (in-context check modal)** — the modal this part reworks.
