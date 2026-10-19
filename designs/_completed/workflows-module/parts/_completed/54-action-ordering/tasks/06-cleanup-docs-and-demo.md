# Task 6: Strip `sort_order` from demo configs + concept docs; correct D1 prose; fix F12 pointer

## Context

This task removes the remaining `sort_order` references — cosmetic in the demo
configs, and prose/spec corrections in the concept design — and corrects the
contradicting concept-doc prose so the declaration-order model is not relitigated
later. It also redirects Part 51's F12 to this design.

`sort_order` is already a no-op after tasks 2–5; these edits remove the dangling
references. There is no hard dependency on the other tasks, but land it alongside or
after them.

The demo configs that still declare `sort_order:` (confirmed via grep):

- `apps/demo/modules/workflows/workflow_config/onboarding/`: `qualify.yaml`,
  `site-visit.yaml`, `send-quote.yaml`, `schedule-followup.yaml`, `upload-po.yaml`,
  `track-company-setup.yaml`
- `apps/demo/modules/workflows/workflow_config/company-setup/`: `kickoff-call.yaml`,
  `assign-account-manager.yaml`, `billing-details.yaml`

## Task

1. **Demo configs** — strip the `sort_order:` line from each of the nine YAML files
   listed above. Purely cosmetic (the field is already dropped by `pick()`); the
   declared order of the files within each workflow's `actions[]` now defines order.
   Verify the resulting `actions[]` declaration order matches the intended display
   order (the design's worked example for `onboarding` is the reference:
   `qualify, site-visit, send-quote, schedule-followup, upload-po, track-company-setup`).

2. **`designs/workflows-module-concept/action-authoring/spec.md`**:
   - Remove the `sort_order` field-table row (~line 190). The field no longer
     qualifies as the prose's "opaque display metadata the engine treats…".
   - Strip `sort_order:` from the example snippets (~lines 343, 378, 417, 446).

3. **`designs/workflows-module-concept/action-authoring/design.md`**:
   - Remove the `sort_order` field-table row (~line 275).
   - **Rework the rationale paragraph** (~line 277) so it no longer describes a
     `blocked_by` topological display-order fallback. Per Part 54 D1, display order is
     **declaration order** — group position in `action_groups[]` then action position
     in `actions[]`; there is no topological sort and no numeric `sort_order` axis.
     Correct the prose to state this plainly so the model is not relitigated.
   - Strip `sort_order:` from the example snippets (~lines 310, 872).

4. **`designs/workflows-module/parts/51-ui-fix-sweep/tasks-build.md`** — update the
   **F12** entry ("timeline action order follows workflow order") to point to this
   design (`parts/54-action-ordering/design.md`), noting it was generalized from the
   timeline alone to all four read engines. Do **not** alter F15 (latest-at-top) —
   it is already done and unaffected.

## Acceptance Criteria

- No `sort_order:` remains in any `apps/demo/modules/workflows/workflow_config/**`
  YAML; each workflow's `actions[]` declaration order matches intended display order.
- `spec.md` and `action-authoring/design.md` no longer contain a `sort_order` field
  row or `sort_order:` in example snippets.
- `action-authoring/design.md`'s display-order rationale describes declaration order
  (D1), not a `blocked_by` topological fallback or a numeric `sort_order`.
- Part 51 `tasks-build.md` F12 points to `parts/54-action-ordering/design.md`.
- `grep -rn sort_order apps/demo modules/workflows designs/workflows-module-concept`
  returns nothing (outside Part 54's own design/tasks).
- `pnpm ldf:b` (from `apps/demo`) builds clean.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/{qualify,site-visit,send-quote,schedule-followup,upload-po,track-company-setup}.yaml`
  — **modify** — strip `sort_order:`.
- `apps/demo/modules/workflows/workflow_config/company-setup/{kickoff-call,assign-account-manager,billing-details}.yaml`
  — **modify** — strip `sort_order:`.
- `designs/workflows-module-concept/action-authoring/spec.md` — **modify** — remove
  field row + snippet occurrences.
- `designs/workflows-module-concept/action-authoring/design.md` — **modify** — remove
  field row, rework rationale per D1, strip snippet occurrences.
- `designs/workflows-module/parts/51-ui-fix-sweep/tasks-build.md` — **modify** —
  repoint F12 to this design.

## Notes

- The concept `ui/`, `action-groups/`, `module-surface/`, and top-level `design.md`
  also mention `sort_order` (per grep). Scan those occurrences; correct any that
  assert `sort_order` drives display order, but leave purely historical narrative
  alone if rewriting would distort the record. The acceptance grep above is scoped to
  the files this task owns — widen only if a remaining reference would actively
  mislead a future reader.
- Line numbers are approximate; locate by content.
