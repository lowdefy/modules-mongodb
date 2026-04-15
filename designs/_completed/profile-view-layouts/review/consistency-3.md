# Consistency Review 3

## Summary

Checked design.md (updated by review-2 action review) against all 8 task files. Found 6 inconsistencies across 6 files — all auto-resolved from review-2 decisions (identity header location, `_user:` data access, user-admin app_attributes flattening).

## Files Reviewed

**Design:** design.md
**Reviews:** review/review-1.md, review/review-2.md, review/review-sam-1.md, review/consistency-2.md
**Tasks:** tasks/tasks.md, tasks/01 through tasks/08

## Inconsistencies Found

### 1. Task 1 still described layout module export

**Type:** Design-vs-Task Drift
**Source of truth:** Review-2 finding #5 — identity header moved to `modules/shared/layout/`, referenced via file ref
**Files affected:** tasks/01-identity-header-component.md
**Resolution:** Removed step 2 (layout module export). Updated context, acceptance criteria, and files list. Component is now file-ref only — no module export needed.

### 2. Task 3 claimed `_user:` only provides profile and email

**Type:** Design-vs-Task Drift
**Source of truth:** Review-2 finding #1 — `_user:` includes global_attributes, app_attributes, and roles via `userFields`
**Files affected:** tasks/03-user-account-profile-view.md
**Resolution:** Updated context to note `_user:` provides all fields. Updated request justification to cite only `sign_up.timestamp`. Changed attributes data source from `_request: get_my_profile.0` to `_user: global_attributes` and `_user: app_attributes`.

### 3. Tasks 3, 4, 6, 7 used `module: layout, component: identity-header` ref

**Type:** Design-vs-Task Drift
**Source of truth:** Review-2 finding #5 — file ref `path: modules/shared/layout/identity-header.yaml`
**Files affected:** tasks/03, tasks/04, tasks/06, tasks/07
**Resolution:** Changed all `_ref` blocks from `module: layout, component: identity-header` to `path: modules/shared/layout/identity-header.yaml`.

### 4. Task 6 used `_get` with dynamic path for user-admin app_attributes

**Type:** Design-vs-Task Drift
**Source of truth:** Review-2 finding #3 — `get_user` already flattens via `$project`, use `_state: user.app_attributes` directly
**Files affected:** tasks/06-user-admin-view-page.md
**Resolution:** Simplified attributes data from `_get` with `_string.concat` to `_state: user.app_attributes`.

### 5. tasks.md summary said "in layout module"

**Type:** Stale Reference
**Source of truth:** Review-2 finding #5
**Files affected:** tasks/tasks.md
**Resolution:** Changed to "in modules/shared/layout".

## No Issues

- **Task 2** (shared attribute configs): No identity header or data access references. Consistent. ✓
- **Task 5** (contacts form/API decouple): No identity header or data access references. Consistent. ✓
- **Task 8** (user-admin navigation): No identity header or data access references. Consistent. ✓
- **Task 4 contacts `_get` for app_attributes**: Correctly uses `_get` with dynamic path — `get_contact` returns raw document. Consistent with review-2 finding #3 resolution. ✓
- **Task 6 access tile `_state: user.roles`**: Correct — `get_user` projection flattens roles. Consistent with review-2 finding #6 rejection. ✓
- **All review-1 resolutions**: Still consistent (verified in consistency-2). ✓
