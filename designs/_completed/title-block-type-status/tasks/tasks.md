# Implementation Tasks — Title block: type label, status pill, loading state

## Overview

These tasks implement `designs/title-block-type-status/design.md`: the shared page title bar (`modules/shared/layout/title-block.yaml`) gains a `type` eyebrow, a `status` + `status_enum` pill (replacing the raw `badge_text`/`badge_color` props), and an opt-in `loading` skeleton state. All in-repo callers are migrated, a new group-status enum is added, and the prop interface is documented.

## Tasks

| #   | File                                    | Summary                                                                  | Depends On |
| --- | --------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| 1   | `01-action-group-statuses-enum.md`      | Add `action_group_statuses.yaml` enum (done / in-progress / blocked)     | —          |
| 2   | `02-title-block-component.md`           | Rewrite `title-block.yaml` + thread vars through `page.yaml`             | —          |
| 3   | `03-migrate-workflow-overview.md`       | Migrate workflow-overview to `type`/`status`/`status_enum`/`loading`     | 2          |
| 4   | `04-migrate-workflow-group-overview.md` | Migrate group-overview; wire the new group-status enum                   | 1, 2       |
| 5   | `05-migrate-contacts-pages.md`          | Migrate contacts view/edit/new (type out of title; loading on view)      | 2          |
| 6   | `06-migrate-activities-pages.md`        | Migrate activities view/edit/new (same)                                  | 2          |
| 7   | `07-migrate-user-admin-pages.md`        | Migrate user-admin view/edit/new (`app_title`/`User` → eyebrow)          | 2          |
| 8   | `08-docs-and-changeset.md`              | Document the title-bar prop interface; add the breaking-change changeset | 2          |

## Ordering Rationale

- **Task 1** (the new enum) is a standalone data file with no dependencies; it's needed only by task 4, so it can run any time before then (and in parallel with task 2).
- **Task 2** is the foundation: it defines the new prop interface on the component (`title-block.yaml`) and threads the vars through `page.yaml`. Every caller migration (3–7) depends on this prop interface existing. After task 2 the build still compiles — callers still passing the now-removed `badge_text`/`badge_color` simply have those vars ignored and temporarily lose their badge until migrated.
- **Tasks 3–7** are the caller migrations. They are independent of one another and can run in parallel once task 2 lands. Task 4 additionally depends on task 1 (it consumes the new enum).
- **Task 8** (docs + changeset) describes the final interface; it depends on task 2 and is best done last so the README and changeset reflect the shipped shape, but it does not block the migrations.

## Scope

**Source:** `designs/title-block-type-status/design.md`
**Context files considered:** `designs/title-block-type-status/mockups/mockup.html` (visual spec reference)
**Review files skipped:** `designs/title-block-type-status/review/review-1.md`
