# Task 7: Concept-doc and parent-design reconciliation

## Context

Part 40 resolves a standing open question and introduces the in-context modal + runtime button-config opt-outs. The concept docs and the parent design must be updated to match. The relevant docs:

- `workflows-module-concept/ui/design.md` — Decisions 3 and 7, Open Question 4.
- `workflows-module-concept/state-machine/design.md` — the `Next step` list (item 3).
- `designs/workflows-module/design.md` — the parent design's follow-on parts.

Part 39 already reconciled `submit-pipeline` D3 and `ui` D2/D4 — **do not touch those**.

## Task

Make these edits exactly (per the design's "Concept-doc reconciliation" table):

1. **`ui/design.md` Open Question 4 → resolve.** Simple-action error recovery is a `resolve_error` button on `simple-view`, rendered only at stage `error` (FSM `error → resolve_error → in-review`); **no `simple-error` page**. Move this out of Open Questions and into Decision 7's body.
2. **`ui/design.md` Decision 7** (already signal-based) — add:
   - the D3 note: button `visible` opt-outs are read at runtime from `global.simple_action_buttons`, with `not_required` opt-in (default `false`), others default-shown;
   - the resolved error-recovery line (from item 1);
   - the in-context modal (D5) as the in-app open path **alongside** the canonical page.
3. **`ui/design.md` Decision 3** (`actions-on-entity`) — note the bundled `simple-action-modal` + `ActionSteps.onActionClick` wiring.
4. **`state-machine/design.md` `Next step` item 3** — mark the remaining sub-question (how simple pages surface `error` recovery) as resolved by this part.
5. **`designs/workflows-module/design.md` (parent)** — add a Part 40 row to the follow-on parts (depends on Parts 34, 35, 38, 24; with/after 39). Flag that Part 34 (per-verb access model) is not yet in the parent dependency graph — Part 40 adopts its model, so the parent should slot Part 34 ahead of the 24/39/40 UI wave and note that 24/39 migrate to per-verb alongside. Note the discovered **Part 41** (action items in the event timeline) as a follow-on that consumes this part's `simple-action-modal`.

## Acceptance Criteria

- `ui/design.md` Open Question 4 is resolved and folded into Decision 7; no `simple-error` page is implied anywhere.
- `ui/design.md` Decision 7 mentions the runtime `global.simple_action_buttons` opt-outs (with `not_required` opt-in), the resolved error recovery, and the in-context modal.
- `ui/design.md` Decision 3 notes the bundled modal + `onActionClick` wiring.
- `state-machine/design.md` `Next step` item 3's error-recovery sub-question is marked resolved.
- The parent `designs/workflows-module/design.md` has a Part 40 row with the stated dependencies and the Part 34 / Part 41 flags.
- No edits to `submit-pipeline` D3 or `ui` D2/D4 (already reconciled by Part 39).

## Files

- `workflows-module-concept/ui/design.md` — modify — OQ4 resolve + Decisions 3 and 7 notes.
- `workflows-module-concept/state-machine/design.md` — modify — mark `Next step` item 3's sub-question resolved.
- `designs/workflows-module/design.md` — modify — add Part 40 follow-on row + Part 34 / Part 41 flags.

## Notes

- This task has no code dependency and can be done at any point — the resolutions are fixed by the Part 40 design itself.
- Keep edits surgical; match the surrounding doc style (these are concept docs, not implementation files).
