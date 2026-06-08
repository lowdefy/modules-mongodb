# Task 7: Concept-doc and parent-design reconciliation

## Context

Part 40 resolves a standing open question and introduces the doc-borne `allow_not_required` flag + the in-context modal. The concept docs and the parent design must be updated to match. The relevant docs:

- `workflows-module-concept/ui/design.md` — Decisions 2, 3, and 7, Open Question 4, and the "no per-action customisation" check-pages paragraph.
- `workflows-module-concept/state-machine/design.md` — the `Next step` list (item 3).
- `designs/workflows-module/design.md` — the parent design's follow-on parts.

Part 39 already reconciled `submit-pipeline` D3 and `ui` D2/D4 (the broader form thread) — **do not re-touch those beyond the `not_required` button-table row noted below**.

## Task

Make these edits exactly (per the design's "Concept-doc reconciliation" table):

1. **`ui/design.md` Open Question 4 → resolve.** Check-action error recovery is a `resolve_error` button on `workflow-action-view`, rendered only at stage `error` (FSM `error → resolve_error → in-review`); **no `check-error` page**. Move it out of Open Questions and into Decision 7's body.
2. **`ui/design.md` Decision 7** (already signal-based) — add:
   - the D3 note: **`not_required` is gated by the doc-borne `allow_not_required` flag** (authored at the action root, any kind, default `false`, persisted by the engine and enforced off live config); **no other per-action button config** — `submit`/`progress`/`approve`/`request_changes`/`resolve_error` are fixed (stage- and role-gated only);
   - the resolved error-recovery line (from item 1);
   - the in-context modal (D5) as the in-app open path **alongside** the canonical page.
3. **`ui/design.md` "no per-action customisation" (check-pages paragraph)** — record the single exception: the `allow_not_required` flag (D3).
4. **`ui/design.md` Decision 2 button table** — `not_required` row: the opt-in moves from `pages.edit.buttons.not_required.visible` to the root `allow_not_required` (engine-enforced, any kind); `page_config.buttons.not_required.visible` becomes a plain opt-out, default `true` (D3 form alignment).
5. **`ui/design.md` Decision 3 (`actions-on-entity`)** — note the bundled `check-action-modal` + `ActionSteps.onActionClick` wiring.
6. **`state-machine/design.md` `Next step` item 3** — mark the remaining sub-question (how check pages surface `error` recovery) as resolved by this part.
7. **`designs/workflows-module/design.md` (parent)** — add a Part 40 row to the follow-on parts (depends on Parts 34, 35, 38, 24; with/after 39). Flag that Part 34 (per-verb access model) should slot ahead of the 24/39/40 UI wave and that 24/39 migrate to per-verb alongside. Note that [Part 42](../../_completed/42-timeline-action-cards/design.md) (timeline action cards, shipped) consumes this part's `check-action-modal` via host composition.

## Acceptance Criteria

- `ui/design.md` Open Question 4 is resolved and folded into Decision 7; no `check-error` page is implied anywhere.
- `ui/design.md` Decision 7 mentions the doc-borne `allow_not_required` gate (with `not_required` opt-in, all other buttons fixed), the resolved error recovery, and the in-context modal.
- `ui/design.md` Decision 2's `not_required` row reflects the root-flag opt-in + plain opt-out default `true`.
- `ui/design.md` "no per-action customisation" paragraph records the `allow_not_required` exception.
- `ui/design.md` Decision 3 notes the bundled modal + `onActionClick` wiring.
- `state-machine/design.md` `Next step` item 3's error-recovery sub-question is marked resolved.
- The parent `designs/workflows-module/design.md` has a Part 40 row with the stated dependencies, the Part 34 sequencing flag, and the Part 42 consumes-modal note.
- No edits to `submit-pipeline` D3 or `ui` D2/D4 beyond the `not_required` button-table row.

## Files

- `workflows-module-concept/ui/design.md` — modify — OQ4 resolve + Decisions 2 (not_required row), 3, and 7 notes + the "no per-action customisation" exception.
- `workflows-module-concept/state-machine/design.md` — modify — mark `Next step` item 3's sub-question resolved.
- `designs/workflows-module/design.md` — modify — add Part 40 follow-on row + Part 34 sequencing flag + Part 42 note.

## Notes

- This task has no code dependency and can be done at any point — the resolutions are fixed by the Part 40 design itself.
- There is **no** `global.check_action_buttons` and no resolver-emitted button-config global — that model was dropped (D3). If any concept-doc prose still references it, that is stale and should be replaced with the `allow_not_required` model.
- Keep edits surgical; match the surrounding doc style (these are concept docs, not implementation files).
