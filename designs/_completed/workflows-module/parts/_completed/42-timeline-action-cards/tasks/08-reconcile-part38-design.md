# Task 8: Verify Part 38 carries no residual "UI applies the selection rule" prose

## Context

Part 42 D5 moves link _resolution_ from the view layer to a server-side
aggregation stage (`resolve_action_link.yaml`). The engine (Part 38) still
**writes** the per-verb `links` map, but it no longer owns _which_ link renders.
The design's proposed change #7 / Files table requires dropping the superseded
"UI applies the per-verb selection rule" prose from Part 38 (its D14 display-surface
note, D16, test strategy, Files-changed display row, and generated tasks 7 + 18).

**This was largely already done.** Commit `d462706`
("Part 42 consistency-2 — resolve D5 link boundary") updated Part 38's `design.md`
(now carrying ~7 pointers to "owned by the display layer / Part 42 D5") and its
task files `07-visible-verbs-read-path.md` and `18-display-surface-renames.md`
(both now state the single rendered link is resolved server-side by
`resolve_action_link.yaml`, not the UI). A pre-task grep found **no** residual
"UI applies / UI selection / view-layer selection" phrasing in
`designs/workflows-module/parts/38-engine-rebuild/design.md`.

This task is therefore a **verification/closeout**: confirm the reconciliation is
complete, and only edit if a residual is found.

## Task

1. Grep `designs/workflows-module/parts/38-engine-rebuild/design.md` and its
   `tasks/07-visible-verbs-read-path.md` and `tasks/18-display-surface-renames.md`
   for residual prose that still attributes link _selection/collapsing/resolution_
   to the UI / view layer / client (e.g. "UI applies", "view layer selects",
   "the card selects", "client picks the link"):

   ```bash
   grep -rniE "UI applies|UI selection|view layer .*select|client .*(select|pick).*link|card .*selects.*link|applies the (per-verb )?selection" \
     designs/workflows-module/parts/38-engine-rebuild/design.md \
     designs/workflows-module/parts/38-engine-rebuild/tasks/07-visible-verbs-read-path.md \
     designs/workflows-module/parts/38-engine-rebuild/tasks/18-display-surface-renames.md
   ```

2. Confirm the inverse — these files state that collapsing the `links` map to the
   single rendered link is a **read-side / server-side display concern owned by
   Part 42 D5** (the `resolve_action_link.yaml` stage). They should already.

3. **Only if** a residual UI-selection statement is found: rewrite it to point at
   the server-side `resolve_action_link.yaml` resolution (priority
   `edit > review > error > view` over non-`null` ∩ visible cells), preserving the
   engine's unchanged responsibility of _writing_ the per-verb `links` map. Do not
   alter any engine/write-contract prose.

## Acceptance Criteria

- The grep in step 1 returns no matches (no residual UI-selection attribution).
- Part 38 `design.md`, task 07, and task 18 consistently attribute link resolution
  to the server-side `resolve_action_link.yaml` stage / Part 42 D5, and attribute
  the per-verb `links` map _write_ to the engine.
- If no edits were needed, record that explicitly (the reconciliation already
  landed in `d462706`); no design files are modified.

## Files

- `designs/workflows-module/parts/38-engine-rebuild/design.md` — verify (modify only if residual found).
- `designs/workflows-module/parts/38-engine-rebuild/tasks/07-visible-verbs-read-path.md` — verify (modify only if residual found).
- `designs/workflows-module/parts/38-engine-rebuild/tasks/18-display-surface-renames.md` — verify (modify only if residual found).

## Notes

- This is a docs-only consistency task; it touches no code and can run any time
  (no task dependency).
- Per project convention, designs are the source of truth — keeping Part 38 and
  Part 42 consistent on the link-resolution boundary prevents a future implementer
  from re-introducing UI-side selection.
