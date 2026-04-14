# Consistency Review 2

## Summary

Checked design.md against all 6 resolved findings in review-1. Found 1 inconsistency (same issue in 2 locations) — the `get_my_profile` request was described as "unconditional" in sections 3 and 5 but still called "conditional" in the file changes table and decision 6. Both were auto-resolved to match the review-1 finding #3 resolution.

## Files Reviewed

**Design:** design.md
**Reviews:** review/review-1.md

## Inconsistencies Found

### 1. File changes table still said "conditional" for `get_my_profile`

**Type:** Review-vs-Design Drift
**Source of truth:** Review-1 finding #3 — resolved as unconditional
**Files affected:** design.md (line 820, user-account file changes table)
**Resolution:** Changed "Add conditional `get_my_profile` request for attributes" to "Add unconditional `get_my_profile` request (provides signed-up date for identity header and full document for optional attributes section)."

### 2. Decision 6 still described request as "conditional"

**Type:** Review-vs-Design Drift (same root cause as #1)
**Source of truth:** Review-1 finding #3 — resolved as unconditional
**Files affected:** design.md (line 873, decision 6)
**Resolution:** Rewrote decision 6 to describe the request as unconditional, noting the identity header's signed-up date dependency as the reason it must always be present.

## No Issues

- **Finding #1** (attributes_set_fields in var summary): Section 6 has contacts-only table with `attributes_set_fields`. ✓
- **Finding #2** (user-admin needs profile_view_config): Present in both module.lowdefy.yaml file changes and consumer vars.yaml file changes. ✓
- **Finding #4** (access sidebar YAML): Full YAML sketch present for `view_access.yaml` with status tag, role tags, signed-up date, and invite link. ✓
- **Finding #5** (internal_details migration note): Decision 4 ends with breaking change acknowledgment. Contacts `form_contact.yaml` file changes include conditional divider. ✓
- **Finding #6** (contacts module.lowdefy.yaml vars): All three vars listed (`attributes_view_config`, `view_extra`, `attributes_set_fields`). ✓
- **Internal consistency**: All four references to `get_my_profile` in design.md now agree (unconditional). Section 3, section 5, file changes table, and decision 6 are aligned.
- **Design-vs-review decisions**: All 6 review resolutions are accurately reflected in the current design.md.
