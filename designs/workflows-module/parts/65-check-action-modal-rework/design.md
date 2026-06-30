# Part 65 — Check-action modal rework + decouple universal fields from transitions

The in-context check-action modal is the last action surface still using the original Part 24 arrangement: it edits `assignees`/`due_date` inline, writes them onto the doc **on submit** (as part of the FSM transition), and shows a status-history card. Every other action surface has since converged on a calmer pattern — assignees/due render as display-only chips edited through a separate modal, the authored `description` (Part 64) renders as a read-only lead-in, and the page header is the shared `title-block`. This part brings the modal onto that same pattern and, in doing so, removes the engine special-case that let a check submit double as a field write. The governing decision: **a user's submission is not the place to change an action's assignees or due date** — a user edits universal fields through the `UpdateActionFields` operation, never as a side effect of a transition they trigger. (Hook/engine orchestration may still seed universal fields on a transition; see D1.)

## Proposed change

1. **User submits never write universal fields; hooks still may.** Re-gate `applyUpdateFieldsRule` (`planActionTransition.js`) on the transition **source** instead of `kind`: strip `assignees`/`due_date` from the update-path `fields` bag when `source === "user"` (a user button-click submit, for **every** kind), and pass them through when the source is `"auxiliary"`/`"cascade"` (pre-hook seeding, engine cascade). The create/upsert path is unchanged (it never calls the rule), so start-time seeding still works.
2. **Both check surfaces stop sending `fields` on submit.** Drop the `fields:` mapping from the `submit` and `progress` payloads — and the now-pointless `^current_action\.fields\.` `Validate` before submit — on the modal (`check-action-surface.yaml`) and the workspace check page (`action.yaml.njk`). (Form-mode pages are untouched: their `fields` payload is the form body, which is correctly written on submit.)
3. **Modal: delete the status-history card.** The modal is a quick in-context shortcut; full history lives on the action's own page and entity timeline.
4. **Modal: assignees/due become display-only chips + a ✎ edit modal.** Replace the inline `universal-fields.yaml` (edit/display) composition with the converged Part 56-addendum fragments — `universal-fields-chips.yaml` (assignee avatars + due pill + ✎) and a nested `universal-fields-modal.yaml` whose `Update` calls `{workflow_type}-update-fields`. Editing fields no longer touches the signal bar.
5. **Modal: render the authored `description`.** Add the `action-description.yaml` read-only Markdown lead-in (sourced from `current_action.description`) — the render Part 64 deferred to "a separate design." This is that design.
6. **Modal: header becomes the shared `title-block`.** Replace the hand-rolled `action_header` (Title + Tag) with `modules/shared/layout/title-block.yaml`, configured exactly as the workspace page configures it (status pill left, `message` as title, chips in `page_actions`) **minus the workflow-name eyebrow** — the modal's host page already establishes that context.

The net effect: the modal becomes the same composition the workspace pages already use, and the engine's field-write rule keys off transition _source_ (user vs. orchestration) rather than action _kind_.

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
  if (kind === "check") return fields; // ← the kind special-case being replaced
  const filtered = { ...fields };
  for (const key of UNIVERSAL_FIELDS) delete filtered[key];
  return filtered;
}
```

The `kind === "check"` branch existed only so a check submit could carry `assignees`/`due_date` through the transition. But `kind` was never the right axis: the thing being guarded against is a _user submission_ clobbering metadata, and a submission is a user action regardless of kind. The auxiliary/cascade callers (pre-hook `fields` seeding via `planSubmit.js`; hook-forwarded `fields` via `buildHookPayload.js`) have a legitimate reason to set universal fields on a transition — orchestration intent, not a clobber. So the rule is re-gated on the transition `source` the engine already threads (`source: 'user' | 'auxiliary' | 'cascade'`, defaulting to `'user'`):

```js
function applyUpdateFieldsRule(fields, source) {
  if (fields == null) return {};
  if (source !== "user") return fields; // hook/cascade orchestration may seed universal fields
  const filtered = { ...fields };
  for (const key of UNIVERSAL_FIELDS) delete filtered[key];
  return filtered;
}
```

This is uniform across kinds (a form _or_ check user submit strips universal keys; the old check exception is gone) and preserves the hook seeding path. With both check surfaces also dropping `fields` from their submit payloads, the user path for check kind sends nothing to strip anyway — the source gate is the durable, kind-agnostic guarantee.

## Key decisions

### D1 — Decouple field writes from a user's submission (the governing decision)

A check action's _submission_ is a signal (`approve` / `request_changes` / `progress` / …) plus an optional comment. Its assignees and due date are metadata about _who/when_, not submission content — for a user, editing them is a distinct intent with its own operation (`UpdateActionFields`) and its own event. Coupling them to the submit transition meant: (a) the engine needed a kind-conditional write path, (b) a submit silently re-wrote fields from whatever was in `current_action.fields`, and (c) the surface needed inline editable inputs in the signal flow. Decoupling removes all three. This **reverses** the original Part 24/40 modal decision ("the surface's submit/progress signals additionally carry `fields`") — recorded here as a deliberate change of direction, not a drift.

**Scope: user submits, not all transitions.** The guarantee is specifically about _user-driven_ transitions. Hook/engine orchestration (pre-hook auxiliary signals, engine cascades) may still attach `assignees`/`due_date` to a transition via `fields` — that is deliberate orchestration, the legitimate counterpart to start-time seeding, not the silent clobber D1 guards against. The engine enforces this with the `source` gate (above): `source === "user"` strips universal keys; `"auxiliary"`/`"cascade"` pass them through. We gate on source rather than removing the path entirely because "no caller is visible in the demo" doesn't prove hooks don't need it, and removing a legitimate capability to guard against a mistake hooks can't make is over-restriction. (If the engine itself ever needs to _originate_ assignee/due changes on a user-path transition, that remains a separate design — but the hook seeding path is preserved here, not deferred.)

### D2 — Reuse the converged fragments; don't build modal-bespoke blocks

The modal composes the _same_ leaves the workspace pages already use — `title-block.yaml`, `universal-fields-chips.yaml`, `universal-fields-modal.yaml`, `action-description.yaml`. This is the "one correct way" payoff Part 56-addendum set up (it built the chips/modal as reusable fragments precisely so the modal could adopt them later) and Part 64 anticipated ("the shared `action-description.yaml` leaf is built so that design can drop it straight into the modal card"). No new component files are created.

### D3 — Modal header: shared `title-block`, eyebrow omitted, no subtitle

The header reuses `title-block.yaml` with `title: current_action.message`, the status pill (left), and the chips in `page_actions` — configured as `action.yaml.njk` does, except it reads the `current_action.stage` scalar (D4) in place of the page's `status.0.stage` (equivalent values) and omits the `type` (eyebrow) var. Rationale: the modal is opened from a host page (an entity page, a timeline card) that already names the workflow; repeating the workflow name as a page-sized eyebrow is redundant chrome inside a modal. No `description`/`doc` var is passed, so there is **no subtitle** (matching the workspace page, which also passes none) — the action's guidance lives in the `description` lead-in immediately below the header, so a subtitle would duplicate it. (Mockups explored a compact hand-rolled header and a two-row variant; the shared component minus eyebrow was chosen for maximum consistency with the page.)

**As-built shape and accepted trade-offs.** With both the eyebrow and the subtitle removed, the as-built header is: status pill (left) · bare `text-2xl` title · chips — the lone title is no longer flanked by the eyebrow/subtitle that balanced it in the original Option B mockup (the mockup is corrected to this true shape). The component is page-scaled and that scaling carries into the modal unchanged: a chunky status pill (`padding:15px 14px`), the large title, an empty `text-text-secondary` subtitle `<div>` that still renders as a small dead gap (identical to the workspace page, which also passes no subtitle), and the `page-actions` Box's hardcoded `margin:16` sitting inside the modal Card. These are accepted as the cost of "one correct way" — the modal uses the _exact_ page header, no modal-specific vars added to `title-block.yaml`. **Fallback:** if the page-scaled header reads as oversized chrome once rendered in the 750px modal, the documented fallback is the compact hand-rolled header (mockup Option A: pill · small title · chips on one row) — reverting D3, not patching the shared component. No build-time validation step is added for this; the header is eyeballed post-implementation and reverted to Option A if it looks wrong.

### D4 — Keep the `current_action.stage` scalar

The `current_action.stage` scalar exists because the status-history `List` (bound at `id: current_action.status`) was pruned by Lowdefy whenever it was hidden, deleting `current_action.status` and making `status.0.stage` undefined. Deleting the List removes that pruning, so the _original rationale_ for the scalar is gone — but the scalar is **kept**: it is still read by the header status pill and the error-stage comment gate, and the workspace pages seed an identical `current_action.stage`, so keeping it holds "one correct way" across surfaces and avoids editing the workspace template's reseed sites. The explanatory comments change in **both** files that carry the pruning rationale — `check-action-surface.yaml` (the scalar comment) and `check-action-modal.yaml` (the open-handler / `set_current_action` comments): the pruning justification no longer applies once the List is gone, so they converge to the workspace page's corrected wording (`action.yaml.njk:39-43`) — the single-`SetState` pattern is retained for parity and because params evaluate against pre-`SetState` state, and the `current_action.stage` scalar is retained as the stable stage source. Behavior in both files is unchanged; only the comments are corrected.

### D5 — Edit-modal `on_complete`: refetch + reseed

The nested edit modal's `Update` writes fields server-side; the chips read `current_action.assignee_docs` / `current_action.due_date` from the envelope. So after a successful `Update` the modal's `on_complete` refetches `get_workflow_action` and reseeds `current_action`, then the edit modal self-closes (appended by `universal-fields-modal.yaml`). This mirrors the reseed the workspace page already runs after each signal — the inline-reseed duplication is pre-existing across the workflow templates; DRYing all of it into a shared action-list is a possible later cleanup, out of scope here.

**The field-edit reseed does _not_ clear the comment.** It is the spread+seed the open/post-signal reseed runs, **minus** the `current_action.comment: null` / `current_action.change_request_comment: null` writes. A field edit is not a submission, so an in-progress reviewer comment must survive it (type a comment → open ✎ to fix a due date → Update → the comment is still there). Those two resets belong only on the **post-signal** reseed, where the transition consumed the comment. The `GetWorkflowAction` response never carries `comment` / `change_request_comment`, so simply omitting the resets leaves the working text untouched while everything else refreshes. This applies to **both** check surfaces: the modal authors its field-edit `on_complete` without the resets, and the workspace page's existing field-edit reseed (`action.yaml.njk`) drops them too — keeping "one correct way" (field-edit reseeds preserve comments; signal reseeds clear them).

## Modal composition after this part

`check-action-surface.yaml` is a `Box` (was a `Card`; `layout.gap: 16`) so it doesn't render a card inside the modal — content flows in the modal body. Top to bottom:

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

- **`shared/phases/planners/planActionTransition.js`** — re-gate `applyUpdateFieldsRule` on `source` instead of `kind`: replace the `kind` parameter with `source`, and the `if (kind === "check") return fields;` branch with `if (source !== "user") return fields;` so universal keys are stripped on the user-path update for all kinds and passed through for `auxiliary`/`cascade`. Update the call site to thread the transition source (`...applyUpdateFieldsRule(payload.fields, source)`), the `UNIVERSAL_FIELDS` comment, and the JSDoc (the `payload.fields` note now describes the source gate, not a kind exception).
- **`shared/phases/planners/planActionTransition.test.js`** — rewrite the `check kind update: payload.fields is a verbatim passthrough (universal keys written)` test → universal keys are now **stripped** for a `check` _user_ submit too (parity with form/tracker). **Add** a test asserting an `auxiliary`/`cascade`-source update _passes universal keys through_ (the hook seeding path). The insert/upsert/seed-mode tests (universal keys written on create) are unchanged.
- **Audit** `shared/phases/planSubmit.test.js` and `WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js` for any assertion that a `check` _user_ submit persists `assignees`/`due_date` on transition; update to the new behavior (a user-path transition does not write universal fields). Hook/auxiliary-path assertions that universal fields _are_ written stay valid — confirm they exercise a non-`user` source.

### Module — `modules/workflows/`

- **`components/check-action-surface.yaml`** — the main rework:
  - Change the surface's top-level block from `type: Card` to `type: Box` (keep `layout.gap: 16`). The surface is modal-only (the workspace page doesn't reuse it), and a Card mounted inside the Modal renders a bordered/padded box inside the modal's own padded body — box-in-box. As a Box, content sits directly in the modal body (which supplies the padding). Update the surface comments that frame the layout as "the card" / "at the bottom of the card" to refer to the modal body / Box.
  - Replace `action_header` (Title + status Tag) with `_ref` to `../shared/layout/title-block.yaml`: `title: current_action.message`, `status: current_action.stage`, `status_enum: ../shared/enums/action_statuses.yaml`, `show_back_button: false`, **no `type`**, `page_actions: [ universal-fields-chips.yaml ]` (vars: `modal_id`, `action_data.assignee_docs`, `action_data.due_date`).
  - Delete the inline `universal-fields/universal-fields.yaml` composition.
  - Delete `status_history_card` (the whole `List` block).
  - Add `action-description.yaml` `_ref` (`content: _state: current_action.description`) as the lead-in below the header.
  - Mount `universal-fields/universal-fields-modal.yaml` (vars: matching `modal_id`, `state_path: current_action.fields`, `workflow_type: _state current_action.workflow_type`, `action_id: _state current_action._id`, `allowed_edit: _state current_action.allowed.edit`, `on_complete: [ refetch get_workflow_action, reseed current_action — **without** the `comment`/`change_request_comment: null` resets (D5) ]`).
  - Remove `fields:` from the `progress` and `submit` payloads; remove the `Validate { regex: ^current_action\.fields\. }` step before `submit`.
  - Update the header comment block: drop the status-history/pruning rationale; note the `current_action.stage` scalar is retained as the stable stage source (D4).
- **`components/check-action-modal.yaml`** (modal container) — comment-only change: the header block (`:49-65`) and the `set_current_action` inline comments (`:91-98`, `:111-114`) justify the single-`SetState` pattern by the status-history List being pruned when hidden. With the List deleted (above), that justification is stale — converge these comments to the workspace page's corrected wording (`action.yaml.njk:39-43`): the List is gone so `current_action.status` is never bound/pruned, but the single-`SetState` is kept for parity and because params evaluate against pre-`SetState` state. No behavior change (the open handler still spreads the response and derives mode from `_request` in one `SetState`).
- **`templates/action.yaml.njk`** (workspace check page) — remove `fields:` from the `progress` and `submit` payloads; remove the `Validate { regex: ^current_action\.fields\. }` before `submit`. In the **field-edit** (universal-fields `Update`) `on_complete` reseed, drop the `current_action.comment: null` / `current_action.change_request_comment: null` writes so a field edit no longer wipes an in-progress comment (D5); leave the **post-signal** reseed's resets intact. (Header/chips/description already converged — no other change.)

No new component files; `universal-fields.yaml`'s `display` group stays (still used by `mode: display` consumers elsewhere — unaffected).

## No migration

Nothing to migrate: the module is unreleased and there are no stored docs to clean up. The change is purely behavioral (user-path transitions stop writing universal fields) and presentational (modal composition). Action docs continue to carry `assignees`/`due_date`, written by `UpdateActionFields` (and start-time/ hook seeding) exactly as before.

## Non-goals / deferred

- **DRYing the reseed.** The spread+seed+derive-mode sequence is repeated across the workflow templates and now the edit-modal `on_complete`; extracting a shared action-list is a separate cleanup.
- **Engine _originating_ assignee/due changes on a user-path transition.** The source gate keeps the _hook/cascade_ seeding path open (D1), but a `source: "user"` transition never writes universal fields. If a future need arises for the engine to originate an assignee/due change _on the user path_ (vs. at create, via `UpdateActionFields`, or via a hook/cascade signal), that is a new, explicit design.
- **Form-mode pages.** Their submit `fields` payload is the form body and is unaffected; this part touches only the two check surfaces.

## Relates to / depends on

- **Part 64 (action `description` rework)** — implemented (HEAD). Provides `action-description.yaml`, the two-field universal set, and the deferred-modal note this part fulfills.
- **Part 56-addendum (action-page layout revision)** — provides `universal-fields-chips.yaml` / `universal-fields-modal.yaml` and the chips-+-modal pattern the modal now adopts.
- **Part 24 (universal-fields surface)** — its `assignees`/`due_date` write path via `UpdateActionFields` is the path this part makes the _only_ path; the modal's inline-edit + write-on-submit decisions are reversed here (D1).
- **Part 40 (in-context check modal)** — the modal this part reworks.
