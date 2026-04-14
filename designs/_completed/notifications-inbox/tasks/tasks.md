# Implementation Tasks — Notifications Inbox Module

## Overview

These tasks implement the notifications inbox, deep-link, and invalid pages from `designs/notifications-inbox/design.md`. The work adds a full inbox UI (two-column list + detail, filtering, pagination), a link routing page for notification deep-links, an error page for invalid links, and updates the module manifest.

## Tasks

| #   | File                       | Summary                                                                     | Depends On |
| --- | -------------------------- | --------------------------------------------------------------------------- | ---------- |
| 01  | `01-request-stages.md`     | Create pipeline stage fragments for filtering                               | —          |
| 02  | `02-requests.md`           | Create all request files (list, detail, link lookup, update)                | 01         |
| 03  | `03-actions.md`            | Create action files (update-list, set-selected, set-types, filter-onchange) | —          |
| 04  | `04-components.md`         | Create inbox UI components (list, detail view, selected area, filter form)  | —          |
| 05  | `05-inbox-page.md`         | Replace stub inbox page with full implementation                            | 02, 03, 04 |
| 06  | `06-link-invalid-pages.md` | Create link and invalid pages                                               | 02         |
| 07  | `07-module-manifest.md`    | Update manifest, unread-count-request, app wiring, and VARS.md              | 05, 06     |

## Ordering Rationale

**01** (stages) comes first because the request files `_ref` into them — they must exist before requests are written.

**02** (requests) depends on 01 for the stage fragments. **03** (actions) and **04** (components) are independent of each other and of 02 — they reference requests by `_request` name at runtime, not via `_ref` to request files. Tasks 02, 03, and 04 can run in parallel after 01.

**05** (inbox page) is the assembly step — it `_ref`s request files, action files, and component files, so it depends on all three.

**06** (link + invalid pages) only depends on 02 because the link page `_ref`s request files. It doesn't use any actions or components from 03/04.

**07** (manifest) comes last — it adds page refs and the `app_name` var. Must reference all page files.

Parallelizable groups:

- After 01: tasks 02, 03, 04 can run in parallel
- After 02: task 06 can start immediately (doesn't need 03/04)
- Task 05 must wait for 02 + 03 + 04
- Task 07 must wait for 05 + 06

## Scope

**Source:** `designs/notifications-inbox/design.md`
**Context files considered:** `designs/notifications-inbox/design.md`
**Review files skipped:** none
