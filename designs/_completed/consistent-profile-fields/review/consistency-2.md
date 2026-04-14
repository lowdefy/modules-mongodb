# Consistency Review 2

## Summary

Checked alignment across design.md, review-1.md, tasks.md, and all 13 task files. Found 6 inconsistencies — all auto-resolved using the source of truth hierarchy (review decisions > design > tasks).

## Files Reviewed

**Design:** design.md
**Review:** review/review-1.md
**Tasks:** tasks.md, tasks/01 through tasks/13

## Inconsistencies Found

### 1. Task 3 uses `_object.assign` instead of `_build.object.assign`

**Type:** Review-vs-Task Drift
**Source of truth:** Review-1 finding #1 resolution + design API composition pattern (line 335)
**Files affected:** `tasks/03-user-account-api.md`
**Resolution:** Changed `_object.assign` to `_build.object.assign` in the code block, updated the explanatory note to clarify why build-time resolution is critical (runtime `_object.assign` would break `create-profile.yaml`'s `_build.object.assign` merge with `profile.profile_created`), and updated the acceptance criterion.

### 2. Task 6 keeps MongoDBInsertOne for create-contact

**Type:** Review-vs-Task Drift
**Source of truth:** Review-1 finding #2 resolution + design changes table (line 474)
**Files affected:** `tasks/06-contacts-api.md`
**Resolution:** Rewrote the create-contact section to use `MongoDBUpdateOne` with `upsert: true` and `$set` aggregation pipeline stage, following the `invite-user.yaml` pattern per the design. Uses `$ifNull` for insert-only fields (`_id`, `created`). Flat dot-notation keys allow direct reuse of shared `set_fields.yaml`. Removed the confused internal debate about nested vs dot-notation key formats. Updated acceptance criteria and notes.

### 3. Design shows user-admin referencing shared files with incompatible field IDs

**Type:** Internal Contradiction (Design)
**Source of truth:** Tasks 8, 10, 12 correctly identify the `contact.*` vs `user.*` mismatch
**Files affected:** `design.md` (consumer app example, lines 122-134)
**Resolution:** Updated the user-admin entry in the consumer app YAML example to reference `modules/user-admin/profile_form_fields.yaml` and `modules/user-admin/profile_set_fields.yaml` (user-admin-specific files with `user.profile.*` IDs) instead of the shared files. Added a note explaining why user-admin needs its own files.

### 4. view_fields.yaml labels don't match form_fields.yaml or Decision #8

**Type:** Internal Contradiction (Design)
**Source of truth:** Decision #8 + form_fields.yaml labels
**Files affected:** `design.md` (view_fields.yaml section, lines 203-213), `tasks/01-shared-profile-files.md`
**Resolution:** Changed "Work Phone" to "Work Number" and "Mobile Phone" to "Mobile Number" in both design.md's `view_fields.yaml` example and task 1's `view_fields.yaml` content, matching Decision #8's normalization to "Work Number"/"Mobile Number".

### 5. Task 5 keeps disabled TextInput for contacts email on edit

**Type:** Design-vs-Task Drift
**Source of truth:** Design email behavior table (line 264: "Plain text display"), changes table (line 472: "Replace disabled email with plain text on edit"), Decision #7
**Files affected:** `tasks/05-contacts-form.md`
**Resolution:** Replaced the `disabled: _var: email_disabled` TextInput with conditional rendering via `_build.if` on `_var: email_disabled`. When true (edit): `Descriptions` component showing email as plain text. When false (create): editable TextInput with validation. Updated key changes description and acceptance criteria.

### 6. tasks.md metadata is stale

**Type:** Stale Reference
**Source of truth:** Filesystem
**Files affected:** `tasks/tasks.md`
**Resolution:** Replaced "Context files considered: None (design.md is the only file in the design folder)" and "Review files skipped: None" with "Review files incorporated: designs/consistent-profile-fields/review/review-1.md".

## No Issues

- **Review-1 finding #3** (updated change_stamp): Correctly present in design API pattern and all task API code blocks.
- **Review-1 finding #4** (contacts Details divider): Correctly rejected. Task 5 preserves the divider in the contacts-specific section.
- **Review-1 finding #5** (phone defaultRegion/placeholders): Correctly rejected. Consumer app responsibility.
- **Review-1 finding #6** (label normalization): Decision #8 added. Shared files use normalized labels.
- **Review-1 finding #7** (request_stages): Both contacts API tasks preserve injection points.
- **Review-1 finding #8** (contacts not in consumer app): Task 12 correctly notes future/planned.
- **Review-1 finding #9** (\_array.map pattern): Correctly rejected. Used consistently in view tasks 4 and 7.
- **Tasks 2, 4, 7, 8, 9, 10, 11, 12, 13**: Consistent with design and review decisions.
- **Task dependency ordering**: Correct. No circular or missing dependencies.
