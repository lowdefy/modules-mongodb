# Consistency Review 1

## Summary

Scanned design.md against review-1.md (all 10 findings annotated) after the action-review cycle. Found 3 inconsistencies, all auto-resolvable — stale file-count totals, mis-categorised deletions, and out-of-order decision numbering. No task or plan files exist yet; this review only covers design + reviews.

## Files Reviewed

**Design**

- `designs/contacts-module-contact-selector/design.md`

**Reviews**

- `designs/contacts-module-contact-selector/review/review-1.md` (all 10 findings annotated)

**Supporting**

- none

**Tasks / Plans**

- none

## Inconsistencies Found

### 1. Files-changed totals stale after action-review

**Type:** Internal contradiction
**Source of truth:** Files-changed lists themselves (post action-review additions)
**Files affected:** `design.md` — Files changed section

**Before:** "Total: 4 new files, 3 deleted, 7 modified."
**Actual counts after action-review:**

- New: 5 — added `validate_email.yaml` when the form override section was rewritten.
- Deleted: 2 — `contact-selector.yaml` and `get_contacts_for_selector.yaml` (the old design listed these under Modified with "delete" annotation).
- Modified: 11 — action-review added `update-contact.yaml`, `create-contact.yaml`, and four block files; subtracted the two delete entries.

**Resolution:** Updated the total line to "5 new files, 2 deleted, 11 modified" and reworded the net-delta paragraph to reflect the block additions.

### 2. Deleted files mis-categorised under Modified

**Type:** Stale categorisation
**Source of truth:** Review-1 did not alter the delete decisions; the original design just put deletes in the wrong subsection.
**Files affected:** `design.md` — Files changed → Modified

**Before:** `contact-selector.yaml` and `get_contacts_for_selector.yaml` appeared in the Modified list with "— **delete**" annotations.
**After:** Added a new **Deleted** subsection under Files changed that lists both, and removed them from Modified.

**Resolution:** Created the `**Deleted**` subsection; moved the two entries; dropped the inline "— delete" annotations.

### 3. Decision numbering out of order (#7 → #8b → #8a → #8)

**Type:** Internal contradiction / readability
**Source of truth:** Action-review annotations for findings #1 and #2, and decision #8's rewrite under finding #3.
**Files affected:** `design.md` — Key decisions section headings and cross-references

**Before:** Decisions appeared in the order `#7 → #8b (upsertedId) → #8a (timestamp) → #8 (form)`. The `a/b` suffix pattern was also backwards (`#8b` came before `#8a`). Cross-references from Files changed → Modified pointed at `#8a` and `#8b`.

**After:** Linear ordering `#7 → #8 (form) → #9 (timestamp) → #10 (upsertedId)`. The form-override decision now follows verification; the two API patches trail the wrapper discussion so readers encounter the happy-path wiring before the bug-fix patches.

**Resolution:** Renumbered `#8a` → `#9` and `#8b` → `#10`; moved their blocks to after `#8`; updated the two cross-references in Files changed → Modified to match.

## No Issues

- **Review-vs-Design coverage.** Each of review-1's 10 findings has a corresponding design update or explicit resolution annotation. No finding is silently ignored.
- **Non-goals section.** The `allowVerify` block-exception carve-out (added under finding #8) is correctly reflected in both Non-goals and Files changed → Modified.
- **Decision #2's `keyword` Nunjucks note** (finding #10 auto-resolve) is present and consistent with the wrapper-is-`.yaml.njk` rationale in decision #1.
- **Decision #4's two-var `get_contact` pattern** (finding #4 resolution) is consistent with Goal #4 and the `contact-edit.yaml` entry in Files changed → Modified.
- **Decision #5's empty `company_ids` guard** (finding #7 resolution) is present and does not introduce a new file — it's a pipeline-shape requirement on `search_contacts.yaml` only.
- **Decision #8's `form_blocks` pattern** (finding #3 resolution) is consistent with the module-vars table (form/form_required removed from module-level), the per-call table (form_blocks/form_required present), and the data-flow diagram.
- **Decisions #9 and #10** cross-reference real file paths and match the exact patches proposed in review-1's findings #1 and #2.
