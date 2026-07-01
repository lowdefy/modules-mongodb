# Task 4: Converge the modal-container comments (pruning rationale now stale)

## Context

`modules/workflows/components/check-action-modal.yaml` is the Modal container that wraps the check-action surface and runs the open handler (fetch → spread response → seed working inputs → derive mode, all in one `SetState`). After Task 3 deletes the status-history `List` from `check-action-surface.yaml`, the modal's own comments are stale: several blocks justify the single-`SetState` open handler by the status-history List being **pruned when hidden** (Lowdefy deletes a non-visible block's state at its blockId, deleting `current_action.status`). With the List gone, `current_action.status` is never bound by a block and never pruned — so that justification no longer applies.

This is a **comment-only** change. **No behavior changes**: the open handler still spreads the response and derives mode from `_request` in one `SetState`, and the `current_action.stage` scalar is retained. The single-`SetState` pattern is kept for parity with the workspace page and because action params evaluate against pre-`SetState` state regardless of the List.

The reference wording already exists in `templates/action.yaml.njk` lines 38–43 (the corrected rationale): the page omits the status-history List, so `current_action.status` is never bound/pruned, but the single-`SetState` is preserved for parity and because params evaluate against pre-`SetState` state.

## Task

Update the comments in `check-action-modal.yaml` so the pruning justification is removed and the surviving rationale matches `action.yaml.njk:38–43`. Touch only these comment regions (current line ranges):

- The header "Mode derivation (D5)" note (~lines 49–66): drop the bullet that explains `current_action.status` being the bind path of the view-mode status-history List and getting pruned (the multi-line "load-bearing" pruning explanation). Keep the point that mode is derived from the **response** (`_request`), not `_state`, because action params evaluate against pre-`SetState` state — that reason stands on its own and is the durable justification for the single-`SetState`. Add the parity note (single-`SetState` retained for parity with the workspace page).
- The trailing header line about the status-history being "a stateful List, no request … modal-safe" (~lines 67–68): remove — there is no List anymore.
- The `set_current_action` inline comment (~lines 91–98): reframe from "splitting these would let an intermediate update prune `current_action.status`" to the `action.yaml.njk` wording — the List is gone so `current_action.status` is never bound/pruned, but the single-`SetState` is kept for parity and because params evaluate against pre-`SetState` state. Keep the note that `current_action` is the first key so the spread lands before the nested writes.
- The `current_action.stage` scalar inline comment (~lines 111–114): keep it — the scalar is still the stable stage source read by the header status pill (D4). Adjust only if it references the now-deleted List.

Do not change any `id`, `type`, `params`, request, or event — only comment text.

## Acceptance Criteria

- No comment in `check-action-modal.yaml` references the status-history List or its pruning as a justification.
- The single-`SetState` open handler's surviving rationale matches `action.yaml.njk:38–43` (parity + params-evaluate-pre-SetState).
- The `current_action.stage` scalar comment still explains it as the stable stage source (D4).
- Zero behavioral diff: `id` / `type` / `params` / events / requests are byte-identical to before (only comments changed).
- `pnpm ldf:b` (from `apps/demo`) compiles.

## Files

- `modules/workflows/components/check-action-modal.yaml` — modify — comment-only convergence.

## Notes

- Depends on Task 3: the comment convergence only makes sense once the List is actually deleted from the surface. If Task 3 is not yet done, the comments would describe a state that still exists.
- The matching scalar/pruning comment in `check-action-surface.yaml` is handled by Task 3 (step 3g). This task is solely the container file.
