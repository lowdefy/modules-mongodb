# Consistency Review 1

## Summary

Scanned part 21's `design.md`, its `review-1.md` annotations, and the two sibling-part design edits (`05-start-cancel-handlers`, `19-operational-apis`) that landed during the action-review pass. Found three small drifts where decisions resolved in review-1 hadn't fully propagated into the design's secondary sections. All three auto-resolved.

## Files Reviewed

**Design (this part):**
- `designs/workflows-module/parts/21-entity-type-to-collection/design.md`

**Reviews (this part):**
- `designs/workflows-module/parts/21-entity-type-to-collection/review/review-1.md`

**Sibling part designs touched in the same PR:**
- `designs/workflows-module/parts/05-start-cancel-handlers/design.md` — checked lines 14, 15, 23, 25.
- `designs/workflows-module/parts/19-operational-apis/design.md` — checked lines 14, 15, 29.

**Sibling reviewed but not edited (no `entity_type` references):**
- `designs/workflows-module/parts/18-entity-components/design.md`

**No tasks or plan files exist for part 21 yet.**

## Inconsistencies Found

### 1. "Same for `cancel-workflow`" is misleading

**Type:** Internal Contradiction (within `design.md`)
**Source of truth:** `cancel-workflow` payload at [part 19 design.md:22](../../19-operational-apis/design.md) and [part 5 design.md:33](../../05-start-cancel-handlers/design.md) — both show `cancel-workflow` requires only `workflow_id`. `entity_type` was never part of its contract.
**Files affected:** `design.md:26`
**Resolution:** Reworded line 26 from "Same for `cancel-workflow` and any other handler payload that currently takes `entity_type`" to "`cancel-workflow` payload is unaffected — it keys off `workflow_id` and never took `entity_type`." Prevents a task-writer from grepping `cancel-workflow` for `entity_type` and being puzzled when nothing turns up.

### 2. Part 18 listed as needing a design edit when it doesn't

**Type:** Review-vs-Design Drift
**Source of truth:** review-1 finding #4 resolution explicitly noted "part 18 has no `entity_type` references so no edit needed." Verified via `grep -n "entity_type\|entity_collection" designs/workflows-module/parts/18-entity-components/design.md` returning empty.
**Files affected:** `design.md:48` (Documentation refresh list) and `design.md:60` (Implemented parts section).
**Resolution:** Tightened both lines to name parts 5, 12, 19 as the actual edit set, with part 18 called out explicitly as the one unimplemented sibling that doesn't need an edit. Keeps the rule (unimplemented siblings get edited) honest about what actually happened.

### 3. "Part 4 ... This part amends it" contradicts the no-edit-implemented-parts rule

**Type:** Internal Contradiction (within `design.md`)
**Source of truth:** review-1 finding #6 resolution + the "Implemented parts" section at lines 56–60 — implemented parts' designs and tasks are frozen; part 21 amends the shipped code, not the design.
**Files affected:** `design.md:82` (Contract to neighbours)
**Resolution:** Reworded from "Part 4 is the workflow-config-schema source of truth. This part amends it." to "Part 4 is the workflow-config-schema source of truth. Part 4's design and `tasks/` stay frozen (it has shipped); part 21 amends the shipped code directly per 'Shipped code edits' above." Makes the "what does 'amends' mean" question explicit and points the reader at the right section.

## No Issues

The following decisions from review-1 are fully consistent across design.md, the sibling part designs, and review-1's own annotations:

- **#1** (phantom `parent_entity_type` / `child_entity_type`): design.md lines 19–20 explicitly note "no `parent_entity_type` field today — nothing to drop there" and the part-3 follow-up at line 38 points at real touch sites only.
- **#2** (concept-doc scope via git grep): design.md line 45 carries the authoritative list.
- **#3** (reserved-keys strike): design.md line 46 is explicit.
- **#5** (part 19 optional-payload cleanup): part 19 line 15 drops `parent_entity_id` / `parent_entity_collection` from optional with a back-link to part 5 review-1 #1.
- **#7** (index recommendation): design.md line 47 is explicit.
- **#8** (demo-app verification reframed): design.md line 70 points at part 20 as the verification site.
- **#10** (both-fields rejection case): design.md lines 68–69 carry both verification lines.
- **#11, #12** (open questions kept as-is): design.md lines 77–78 unchanged.
- **Sibling part edits**: part 5 lines 14, 23 cleanly drop `entity_type`; part 19 lines 14, 15, 29 cleanly drop `entity_type` and the stale optional-payload fields.
