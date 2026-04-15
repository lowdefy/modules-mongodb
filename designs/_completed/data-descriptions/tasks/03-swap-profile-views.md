# Task 3: Swap profile views from DataView to DataDescriptions

## Context

Tasks 1-2 created the DataDescriptions block. This task updates profile view YAML files to use it instead of DataView, which was the original motivation for the block.

There are exactly two DataView usages in the codebase, both with the same pattern (`sectionCards: false`, `maxColumns: 2`):

- `modules/user-account/components/view_profile.yaml` — user profile display
- `modules/contacts/components/view_contact.yaml` — contact profile display

## Task

### 1. Update `modules/user-account/components/view_profile.yaml`

Change the `profile_data` block (currently lines 26-61):

**From:**

```yaml
- id: profile_data
  type: DataView
  properties:
    sectionCards: false
    maxColumns: 2
    data:
      _object.assign: ...
    formConfig: ...
```

**To:**

```yaml
- id: profile_data
  type: DataDescriptions
  properties:
    bordered: true
    column: 2
    size: small
    data:
      _object.assign: ...
    formConfig: ...
```

Changes:

- `type: DataView` → `type: DataDescriptions`
- Remove `sectionCards: false` and `maxColumns: 2`
- Add `bordered: true`, `column: 2`, `size: small`
- Keep `data` and `formConfig` properties exactly as they are

### 2. Update `modules/contacts/components/view_contact.yaml`

Same change for the `profile_data` block (currently lines 14-49):

- `type: DataView` → `type: DataDescriptions`
- Remove `sectionCards: false` and `maxColumns: 2`
- Add `bordered: true`, `column: 2`, `size: small`
- Keep `data` and `formConfig` exactly as they are

### 3. Verify no other DataView usages

These are the only two `type: DataView` usages in the codebase. No other files need changes.

## Acceptance Criteria

- `modules/user-account/components/view_profile.yaml` uses `type: DataDescriptions` with `bordered: true`, `column: 2`, `size: small`.
- `modules/contacts/components/view_contact.yaml` uses `type: DataDescriptions` with `bordered: true`, `column: 2`, `size: small`.
- The `data` and `formConfig` properties are unchanged in both files.
- No `type: DataView` references remain in `modules/` or `apps/` directories.
- The Lowdefy app builds successfully.

## Files

- `modules/user-account/components/view_profile.yaml` — **modify** — swap DataView → DataDescriptions
- `modules/contacts/components/view_contact.yaml` — **modify** — swap DataView → DataDescriptions

## Notes

- The `email_display` Descriptions block in both files should remain as-is — it's a simple single-item display that doesn't need DataDescriptions.
- The `notes_display` Descriptions block in `view_contact.yaml` should also remain unchanged.
- `size: small` matches the `email_display` Descriptions block above the profile data for visual consistency.
