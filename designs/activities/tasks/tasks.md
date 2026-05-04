# Implementation Tasks — Activities Module

## Overview

These tasks implement the `activities` module described in `designs/activities/design.md` — a CRM-activity entity module with create/edit/complete/cancel/reopen/delete lifecycle, multi-entity linking to contacts and companies, sidebar tile integration, and a reusable capture flow. Reserved schema for future auto-ingestion (calendar, email, WhatsApp).

## Tasks

| #   | File                                          | Summary                                                                                       | Depends On |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-module-skeleton.md`                       | Module skeleton: manifest, package.json, README/CHANGELOG/VARS, menus, connection, enums, defaults, validate | —          |
| 2   | `02-api-create-activity.md`                   | API: `create-activity` + shared `defaults/event_target.yaml`                                  | 1          |
| 3   | `03-api-update-activity.md`                   | API: `update-activity`                                                                        | 1, 2       |
| 4   | `04-api-change-activity-status.md`            | API: `change-activity-status` + three action wrappers (complete/cancel/reopen)                | 1, 2       |
| 5   | `05-api-delete-activity.md`                   | API: `delete-activity` (soft-delete)                                                          | 1, 2       |
| 6   | `06-request-stages.md`                        | Shared pipeline stages: `add_derived_fields`, `match_filter`, `lookup_contacts`, `lookup_companies` | 1          |
| 7   | `07-requests.md`                              | Requests: list, detail, selector feed, for-entity, Excel data                                 | 1, 6       |
| 8   | `08-form-and-fields.md`                       | Form: `form_activity` + `fields/core` + `fields/links`                                        | 1          |
| 9   | `09-display-components.md`                    | Internal display: `view_activity`, `table_activities`, `filter_activities`, `excel_download`  | 1, 7       |
| 10  | `10-chips-and-tile-files.md`                  | Chips and attachment tile: `contact_list_items`, `company_list_items`, `tile_files`           | 1          |
| 11  | `11-export-selector-and-timeline.md`          | Cross-module exports: `activity-selector`, `activities-timeline`                              | 1, 7, 9    |
| 12  | `12-export-capture-flow.md`                   | Cross-module exports: `capture_activity` (button + modal), `open_capture` (action sequence)   | 1, 8       |
| 13  | `13-pages-new-edit.md`                        | Pages: `new` (with URL prefill) and `edit`                                                    | 1, 8, 12   |
| 14  | `14-pages-view-and-all.md`                    | Pages: `view` (detail) and `all` (list, with URL hydration)                                   | 1, 9, 11   |
| 15  | `15-companies-wiring.md`                      | Companies: local `tile_activities.yaml`, sidebar embed, `tile_events` "Activity"→"History"    | 1, 11, 12  |
| 16  | `16-contacts-wiring.md`                       | Contacts: local `tile_activities.yaml`, sidebar embed, `tile_events` "Activity"→"History"     | 1, 11, 12  |
| 17  | `17-shared-event-types-ref.md`                | Add activities event_types `_ref` to `modules/shared/enums/event_types.yaml`                  | 1          |
| 18  | `18-demo-app-integration.md`                  | Demo app: register module + vars + nav + home-page `capture_activity` reference               | 1, 12, 14  |

## Ordering Rationale

**Layer 1 — Foundations (Task 1):** The module skeleton has to exist before anything else. After this task, `modules/activities/module.lowdefy.yaml` declares all vars/exports/dependencies, the connection points at MongoDB, and the enum/default/validate config files are present. The module loads at build time but has no functional API or UI yet.

**Layer 2 — APIs (Tasks 2–5):** Build the API surface bottom-up. `create-activity` (Task 2) introduces the shared `defaults/event_target.yaml` used by every emit site, so it lands first. `update-activity` (Task 3), `change-activity-status` (Task 4), and `delete-activity` (Task 5) reuse the target shape. Action wrappers ride with Task 4 since they're CallApi wrappers around `change-activity-status`. APIs don't depend on each other strictly but landing them in this order keeps the events-emit pattern consistent.

**Layer 3 — Data plumbing (Tasks 6–7):** Pipeline stages (Task 6) factor the shared aggregation logic — derived fields, filter match, lookups. Requests (Task 7) compose the stages into list/detail/selector/for-entity/excel queries. Both can run in parallel with API work but must complete before any UI component reads from the database.

**Layer 4 — Internal UI (Tasks 8–10):** Form + fields (Task 8), display components (Task 9), and chips + tile_files (Task 10). These are internal — referenced only by the activities module's own pages and exports. They consume APIs and requests from Layers 2 and 3.

**Layer 5 — Cross-module exports (Tasks 11–12):** `activity-selector` + `activities-timeline` (Task 11) and the capture flow (Task 12). These are the components consumers (companies/contacts) reach for. They depend on internal UI being in place.

**Layer 6 — Pages (Tasks 13–14):** `new` + `edit` (Task 13) compose form + capture flow. `view` + `all` (Task 14) compose display components and the timeline. These are the activities module's own pages.

**Layer 7 — Cross-module wiring (Tasks 15–17):** Companies + contacts wiring (Tasks 15, 16) embed the local `tile_activities.yaml` wrapper and rename `tile_events` titles. These are independent of each other and can run in parallel. Shared `event_types` ref (Task 17) is a one-line update to `modules/shared/enums/event_types.yaml`.

**Layer 8 — Demo app (Task 18):** Final integration in `apps/demo/`. Registers the module, wires deps, adds nav link, drops a reference `capture_activity` on the home page.

**Parallel-safe pairs:**
- Tasks 2/3/5 (different APIs) — can be done in any order after Task 1.
- Tasks 6 and 8 — pipeline stages and form/fields work in parallel.
- Tasks 11 and 12 — selector/timeline export and capture-flow export are independent.
- Tasks 13 and 14 — different pages (new+edit vs view+all) can be in parallel.
- Tasks 15 and 16 — companies and contacts wiring are mirror-image independent.
- Task 17 has only Task 1 as a dependency and can run very early.

## Scope

**Source:** `designs/activities/design.md`
**Context files considered:** `designs/activities/decisions.md`
**Review files skipped:** `review/review-1.md`, `review/review-3.md`, `review/review-5.md`, `review/consistency-2.md`, `review/consistency-4.md`, `review/consistency-5.md`
