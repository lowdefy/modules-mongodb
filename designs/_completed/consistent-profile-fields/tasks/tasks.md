# Implementation Tasks — Consistent Profile Fields

## Overview

These tasks implement the consistent profile fields design, centralizing shared profile field definitions in `modules/shared/profile/` and refactoring user-account, contacts, and user-admin modules to use core + injection patterns for forms, APIs, and views.

## Tasks

| #   | File                         | Summary                                                    | Depends On |
| --- | ---------------------------- | ---------------------------------------------------------- | ---------- |
| 1   | `01-shared-profile-files.md` | Create shared profile field definitions in modules/shared/ | —          |
| 2   | `02-user-account-form.md`    | Refactor user-account form to core + injection pattern     | 1          |
| 3   | `03-user-account-api.md`     | Refactor user-account API to core + injection pattern      | 1          |
| 4   | `04-user-account-view.md`    | Refactor user-account view to core + injection pattern     | 1          |
| 5   | `05-contacts-form.md`        | Refactor contacts form to core + injection pattern         | 1          |
| 6   | `06-contacts-api.md`         | Refactor contacts APIs to core + injection pattern         | 1          |
| 7   | `07-contacts-view.md`        | Refactor contacts view to core + injection pattern         | 1          |
| 8   | `08-user-admin-form.md`      | Create user-admin built-in form_profile component          | 1          |
| 9   | `09-user-admin-pages.md`     | Update user-admin pages to use built-in form_profile       | 8          |
| 10  | `10-user-admin-api.md`       | Refactor user-admin APIs to core + injection pattern       | 1          |
| 11  | `11-module-vars.md`          | Update module.lowdefy.yaml vars for all three modules      | 2–10       |
| 12  | `12-consumer-app-vars.md`    | Wire shared profile files into consumer app vars           | 11         |
| 13  | `13-avatar-normalization.md` | Normalize DiceBear avatar URLs across contacts module      | 6          |

## Ordering Rationale

**Task 1** creates the shared files that all other tasks depend on — the form fields, set fields, and view fields definitions.

**Tasks 2–4** (user-account) and **5–7** (contacts) and **8–10** (user-admin) are three independent module refactoring streams that all depend on task 1. Within each module, the form/API/view changes are independent of each other, so tasks within a module stream can run in parallel.

**Task 11** updates the module.lowdefy.yaml var declarations for all three modules. It comes after all module changes are done because it documents the new vars that the refactored files consume.

**Task 12** updates the consumer app (apps/demo) vars files to wire the shared profile files into each module. This must come after the module var declarations are updated.

**Task 13** normalizes the DiceBear avatar URL in the contacts module — the contacts APIs use a shorter URL format missing `backgroundType=gradientLinear&scale=75`. This is a cleanup that depends on the contacts API task being complete.

**Parallel opportunities:** Tasks 2–4 can run in parallel. Tasks 5–7 can run in parallel. Tasks 8–10 can run in parallel. All three module streams (2–4, 5–7, 8–10) can run in parallel with each other.

## Scope

**Source:** `designs/consistent-profile-fields/design.md`
**Review files incorporated:** `designs/consistent-profile-fields/review/review-1.md`
