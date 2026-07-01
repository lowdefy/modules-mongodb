# Consistency Review 3

## Summary

Checked all 16 files in the module-field-pattern design tree for inconsistencies between the design, two reviews, and 12 task files. Found 4 inconsistencies — all auto-resolved.

## Files Reviewed

**Design:**

- `design.md`

**Reviews:**

- `review/review-1.md`
- `review/review-2.md`

**Tasks:**

- `tasks/tasks.md`
- `tasks/01-shared-profile-core.md`
- `tasks/02-user-admin-state-namespace.md`
- `tasks/03-user-admin-api-pipeline.md`
- `tasks/04-user-admin-manifest-vars.md`
- `tasks/05-contacts-state-namespace.md`
- `tasks/06-contacts-api-pipeline.md`
- `tasks/07-contacts-manifest-vars.md`
- `tasks/08-user-account-state-namespace.md`
- `tasks/09-user-account-api-pipeline.md`
- `tasks/10-user-account-manifest-vars.md`
- `tasks/11-demo-app-consumer.md`
- `tasks/12-view-pages-smart-descriptions.md`

## Inconsistencies Found

### 1. Review-1 #3 stale resolution annotation — `profile.show_title` vs `fields.show_title`

**Type:** Stale Reference
**Source of truth:** design.md consumer vars (line 59) and all task files
**Files affected:** `review/review-1.md`
**Resolution:** Updated review-1 finding #3 resolution text from `_module.var: profile.show_title` / "under `profile`" to `_module.var: fields.show_title` / "under `fields`". The design groups `show_title` under the `fields` namespace, not `profile`. All tasks already use `fields.show_title`.

### 2. Task 12 visibility pattern uses null comparison instead of array length

**Type:** Design-vs-Task Drift
**Source of truth:** design.md (lines 260-267) and review-2 finding #3 resolution
**Files affected:** `tasks/12-view-pages-smart-descriptions.md`
**Resolution:** Updated both visibility patterns in task 12:

- **User-admin attributes_view** (was `_build.or` with `_build.ne: null`): Changed to `_build.gt` + `_build.array.length` + `_build.array.concat` matching the design's pattern. With `[]` defaults (per review-2 #3), the old null comparison always passed — the section would always be visible even with no fields.
- **Contacts attributes_view** (was `_build.ne: null`): Changed to `_build.gt` + `_build.array.length` for the same reason.

### 3. Task 2 uses old `show_title` var path while tasks 5 and 8 use new path

**Type:** Internal Contradiction (task-vs-task)
**Source of truth:** Tasks 5, 8, and design.md
**Files affected:** `tasks/02-user-admin-state-namespace.md`
**Resolution:** Updated task 2's `form_profile.yaml` code example from `_module.var: show_title` to `_module.var: fields.show_title`, and updated the accompanying note to mention both var renames (`fields.profile` and `fields.show_title`). This makes all three module tracks (user-admin, contacts, user-account) consistent — they all reference the new var names in the state namespace task, with the manifest task wiring them later.

### 4. tasks.md scope note only references review-1

**Type:** Stale Reference
**Source of truth:** File system (review-2.md exists)
**Files affected:** `tasks/tasks.md`
**Resolution:** Changed "Review files skipped: review-1.md" to "Review files considered: review-1.md, review-2.md". Review-2 decisions (especially #3 — default vars to `[]`, use array length for visibility) are now reflected in the tasks via fix #2 above.

## No Issues

- **Design-vs-review decisions:** All review-1 and review-2 resolutions are correctly reflected in design.md (two-stage pipeline, `$mergeObjects` + `$ifNull`, `fields` namespace, `request_stages.write`, `[]` defaults, user-account scope callout).
- **API pipeline pattern:** All three module API tasks (3, 6, 9) consistently use the two-stage pipeline pattern with `$mergeObjects` and `request_stages.write`.
- **Manifest var structure:** All three manifest tasks (4, 7, 10) consistently define `fields` with `show_title` + field arrays, and `request_stages.write` replacing per-operation vars.
- **Consumer interface:** Task 11 (demo app) matches the design's consumer vars example.
- **Shared core file:** Task 1 matches the design's `form_core.yaml` specification.
- **File paths:** All task file references match the design's file structure.
- **Dependency chain:** Task ordering and dependencies are consistent and complete.
- **SmartDescriptions dependency:** Correctly noted in both the design and task 12.
