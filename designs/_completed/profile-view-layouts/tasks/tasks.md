# Implementation Tasks — Profile View Layouts

## Overview

These tasks implement the profile-view-layouts design: a unified person view pattern across user-account, contacts, and user-admin modules. The design introduces a shared identity header component, replaces DataView with DataDescriptions, adds optional attribute display, and creates a new read-only user-admin view page.

## Prerequisites

- **DataDescriptions** — Implemented.
- **Avatar SVG** (`designs/avatar-svg-js/design.md`) — Identity header uses `Avatar` block with `UserOutlined` fallback for null `profile.picture`.

## Tasks

| #   | File                               | Summary                                                | Depends On |
| --- | ---------------------------------- | ------------------------------------------------------ | ---------- |
| 1   | `01-identity-header-component.md`  | Create shared identity header in modules/shared/layout | —          |
| 2   | `02-shared-attribute-configs.md`   | Create shared attribute view/form/set config files     | —          |
| 3   | `03-user-account-profile-view.md`  | Update user-account profile page with new layout       | 1, 2       |
| 4   | `04-contacts-detail-view.md`       | Update contacts detail view with new layout            | 1, 2       |
| 5   | `05-contacts-form-api-decouple.md` | Decouple internal_details from contacts form and APIs  | 2          |
| 6   | `06-user-admin-view-page.md`       | Create new read-only user-admin view page              | 1, 2       |
| 7   | `07-user-admin-edit-page.md`       | Update user-admin edit page with identity header       | 1          |
| 8   | `08-user-admin-navigation.md`      | Wire user-admin table to view page and update exports  | 6          |

## Ordering Rationale

**Task 1 (identity header)** is the foundation — every view page depends on this shared component.

**Task 2 (shared configs)** is independent of task 1 but needed by tasks 3, 4, 5, and 6. It creates the consumer-level attribute configuration files that modules reference.

**Tasks 3 and 4** (user-account and contacts views) can run in parallel. Both adopt the identity header + DataDescriptions pattern on existing view pages. User-account is simpler (single-column, no sidebar) so it's listed first.

**Task 5** (contacts form/API decouple) is independent of the view changes in task 4 — it modifies the write path (form + APIs) while task 4 modifies the read path (view component). Listed after task 4 for logical grouping but could run in parallel.

**Task 6** (user-admin view page) creates entirely new files — the view page, view_user component, and view_access sidebar. It's the most substantial task.

**Task 7** (user-admin edit page) updates the existing edit page to use the identity header. It removes the old avatar/email/signed-up components that are superseded by the identity header (task 1) and the view_access tile (task 6).

**Task 8** (navigation + exports) is the final wiring — updating the table to link to the view page and updating module.lowdefy.yaml exports. Depends on task 6 (view page must exist).

**Parallelism:** Tasks 1 and 2 can run in parallel. Tasks 3, 4, 5, 6, and 7 can all run in parallel once their dependencies are met. Task 8 must wait for task 6.

## Scope

**Source:** `designs/profile-view-layouts/design.md`
**Context files considered:** None (no non-review supporting files in the design folder)
**Review files skipped:** `review/review-1.md`, `review/consistency-2.md`
