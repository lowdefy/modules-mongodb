# Implementation Tasks — Module Field Pattern

## Overview

These tasks implement the Module Field Pattern design: flattening state namespaces across user-admin, user-account, and contacts modules so that a single block array serves as the field definition for edit forms, view pages (via SmartDescriptions), and API writes. Derived from `designs/module-field-pattern/design.md`.

## Tasks

| #   | File                                  | Summary                                                                     | Depends On |
| --- | ------------------------------------- | --------------------------------------------------------------------------- | ---------- |
| 1   | `01-shared-profile-core.md`           | Create shared `form_core.yaml` for profile fields                           | —          |
| 2   | `02-user-admin-state-namespace.md`    | Flatten user-admin state root from `user.*` to flat namespace               | 1          |
| 3   | `03-user-admin-api-pipeline.md`       | Rewrite user-admin APIs to pipeline update with $mergeObjects               | 2          |
| 4   | `04-user-admin-manifest-vars.md`      | Restructure user-admin manifest vars to `fields` / `request_stages.write`   | 3          |
| 5   | `05-contacts-state-namespace.md`      | Flatten contacts state root from `contact.*` to flat namespace              | 1          |
| 6   | `06-contacts-api-pipeline.md`         | Rewrite contacts APIs to pipeline update with $mergeObjects                 | 5          |
| 7   | `07-contacts-manifest-vars.md`        | Restructure contacts manifest vars to `fields` / `request_stages.write`     | 6          |
| 8   | `08-user-account-state-namespace.md`  | Flatten user-account state root from `contact.*` to flat namespace          | 1          |
| 9   | `09-user-account-api-pipeline.md`     | Rewrite user-account APIs to pipeline update with $mergeObjects             | 8          |
| 10  | `10-user-account-manifest-vars.md`    | Restructure user-account manifest vars to `fields` / `request_stages.write` | 9          |
| 11  | `11-demo-app-consumer.md`             | Rewrite demo app field files and vars for new interface                     | 4, 7, 10   |
| 12  | `12-view-pages-smart-descriptions.md` | Replace DataDescriptions with SmartDescriptions on view pages               | 11         |

## Ordering Rationale

**Foundation first (Task 1):** The shared `form_core.yaml` is referenced by all three modules, so it must exist before any module can adopt the new pattern.

**Module-by-module, state → API → manifest (Tasks 2-10):** Each module follows a three-step sequence:

1. **State namespace** — flatten page state, update forms, actions, SetState, avatar generation. This is the largest change per module and must land first because the API payload shape depends on it.
2. **API pipeline** — rewrite the write endpoints to use pipeline update syntax with `$mergeObjects` and accept the new flat payload. Must follow the state change since the payload structure changes.
3. **Manifest vars** — restructure the module manifest to expose `fields.*` and `request_stages.write` instead of the old `components.*` / `request_stages.{operation}` vars. Must be last since it changes the consumer interface.

**Parallel tracks:** user-admin (2-4), contacts (5-7), and user-account (8-10) are independent tracks that can run in parallel within each module, but are serialized here for reviewability.

**Demo app (Task 11):** Depends on all three module manifest changes since it wires vars for all modules.

**View pages (Task 12):** Depends on SmartDescriptions being implemented (separate design) and on the demo app consumer being updated. This task is deferred — it can ship later when SmartDescriptions is ready. The DataDescriptions view pages continue to work with the flat namespace in the interim.

## Scope

**Source:** `designs/module-field-pattern/design.md`
**Context files considered:** Module manifests, form components, view components, API endpoints, demo consumer files, shared profile resources, action files, page files for all three modules
**Review files skipped:** `designs/module-field-pattern/review/review-1.md`
