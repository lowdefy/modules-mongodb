# Task 9: Retire `components-current/` and `card_template.yaml`

## Context

`modules/workflows/components-current/edit/*.yaml.njk` (27 files) was the porting source for tasks 1–7. `modules/workflows/components-current/card_template.yaml` is a one-off Card wrapper that isn't on the spec's 27-component list. With tasks 2–7 shipped and the README written (task 8), the staging directory has no remaining purpose.

Task 1's `PORTING.md` recorded the decision on `card_template.yaml`. The default (per task 1's instructions) is to drop it; if task 1 surfaced a reason to keep it, the `PORTING.md` will say so and this task acts accordingly.

## Task

1. **Re-read `modules/workflows/components/fields/PORTING.md`** for any open decisions or notes from tasks 1–7. Specifically: the `card_template.yaml` decision and any "carry-over" notes about behaviour that didn't make the port.

2. **If `card_template.yaml` is to be kept**, port it under the same `vars: / config:` shape into `modules/workflows/components/fields/card_template.yaml`. **Then** raise it as a follow-up issue against part 14's design — the spec lists 27 components and a 28th needs a design entry. Do **not** silently extend the library.

3. **If `card_template.yaml` is to be dropped** (the default), proceed to step 4.

4. **Delete `modules/workflows/components-current/` recursively** — all 27 `.yaml.njk` files plus `card_template.yaml`.

5. **Delete `modules/workflows/components/fields/PORTING.md`** — the porting note was an internal working document for tasks 1–7. The README (task 8) is the durable doc.

6. **Verify nothing else references `components-current/`**: `grep -r "components-current" modules/ apps/ designs/ docs/ 2>/dev/null` returns nothing (or only the matches inside `designs/workflows-module/parts/14-form-components-library/tasks/`, which describe historical context and can stay).

## Acceptance Criteria

- `modules/workflows/components-current/` no longer exists.
- `modules/workflows/components/fields/PORTING.md` no longer exists.
- The 27 ported components at `modules/workflows/components/fields/*.yaml` are intact.
- `grep -r "components-current" modules/ apps/` returns no matches.
- If `card_template.yaml` was kept, a follow-up issue exists referencing part 14's design and the new 28th component is documented in the README.

## Files

- `modules/workflows/components-current/` — delete recursively
- `modules/workflows/components/fields/PORTING.md` — delete
- (conditional) `modules/workflows/components/fields/card_template.yaml` — create only if task 1's `PORTING.md` directed keeping it

## Notes

- This task is the last one in part 14; if any earlier task surfaces a need to keep `components-current/` for ongoing comparison (e.g. a contested port decision), defer this task and unblock the comparison work first.
- After this task lands, the only reference to the staging directory's existence is the task files in this directory — that's intentional history, not debt.
