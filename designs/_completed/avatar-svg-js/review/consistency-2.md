# Consistency Review 2

## Summary

Checked design.md against all 7 resolved findings in review-1. Found 2 inconsistencies in the Files Changed table — both auto-resolved from the review decisions and design body.

## Files Reviewed

**Design:** `design.md`
**Reviews:** `review/review-1.md`
**Tasks:** None (not yet created)
**Plans:** None (not yet created)

## Inconsistencies Found

### 1. Create API notes say "remove" fields that should be passed through

**Type:** Review-vs-Design Drift
**Source of truth:** Review-1 Finding #5 resolution + Decision 5 + Section 2 pass-through example
**Files affected:** `design.md` Files Changed table (lines 292, 294)

The Files Changed notes for `invite-user.yaml` and `create-contact.yaml` said:

> Remove SVG generation, remove `profile.picture` and `profile.avatar_color`

But the review-1 Finding #5 resolution states:

> All create flows (invite-user, create-contact, first profile save) now generate the SVG client-side. `avatar_color` is persisted on the profile at creation and preserved on edit.

Decision 5 confirms: "avatar_color and picture are both persisted to the profile." Section 2 shows the pass-through pattern for both fields. The create APIs must pass through these fields from the payload — removing them would discard the client-generated SVG and color.

**Resolution:** Updated both entries to "Remove SVG generation, pass through `profile.picture` and `profile.avatar_color` from payload" — matching the update API pattern.

### 2. Update API notes omit `profile.avatar_color` pass-through

**Type:** Internal Contradiction (Section 2 vs Files Changed)
**Source of truth:** Section 2 pass-through example (lines 116-120) + Decision 6
**Files affected:** `design.md` Files Changed table (lines 291, 293, 295)

The Files Changed notes for `profile-set-fields.yaml`, `update-user.yaml`, and `update-contact.yaml` only mentioned passing through `profile.picture`. But Section 2 explicitly shows pass-through for **both** fields:

```yaml
profile.picture:
  _payload: contact.profile.picture
profile.avatar_color:
  _payload: contact.profile.avatar_color
```

The shuffle button (Section 5) changes `avatar_color` during edit, so update APIs must persist it. Decision 6 confirms avatar_color is part of the persisted profile data.

**Resolution:** Updated all three entries to include "and `profile.avatar_color`" in the pass-through notes.

## No Issues

- **Review Finding #1** (cross-module var scope): Design correctly shows shared palette with per-module vars (Section 5, Decision 6, Files Changed). Consistent.
- **Review Finding #2** (all modules need SetState-on-save): Create and edit flows tables include all three modules. `form_contact.yaml` in Files Changed. Consistent.
- **Review Finding #3** (`view_profile.yaml` added): Present in both Display Components table and Files Changed. Consistent.
- **Review Finding #4** (implicit API dependencies): `create-profile.yaml` and `update-profile.yaml` listed in Files Changed with "No changes" note. Consistent.
- **Review Finding #6** (`profile-set-fields.yaml` categorization): Current State table shows "Shared fragment" with Type column. Consistent.
- **Review Finding #7** (`.js.njk` pattern comment): Explanatory comment present in code example (line 65). Consistent.
- **Decisions 1-7**: All internally consistent with the design body and review resolutions.
