# Consistency Review 2

## Summary

Checked all 10 files in the notifications-inbox design tree against the 7 review-1 resolutions. Found 9 inconsistencies — all auto-resolved by propagating review decisions and design updates into task files.

## Files Reviewed

**Design:**

- `design.md`

**Reviews:**

- `review/review-1.md`

**Tasks:**

- `tasks/tasks.md`
- `tasks/01-request-stages.md`
- `tasks/02-requests.md`
- `tasks/03-actions.md`
- `tasks/04-components.md`
- `tasks/05-inbox-page.md`
- `tasks/06-link-invalid-pages.md`
- `tasks/07-module-manifest.md`

## Inconsistencies Found

### 1. Stage file still named `match-filter-type.yaml` in tasks

**Type:** Review-vs-Task (Stale Reference)
**Source of truth:** Review-1 finding #7 — renamed to `match-filter-read-status.yaml`
**Files affected:** `tasks/01-request-stages.md`, `tasks/02-requests.md`
**Resolution:** Renamed all occurrences of `match-filter-type.yaml` to `match-filter-read-status.yaml` in both task files (5 occurrences total: heading, acceptance criteria, files section in task 01; two `_ref` paths in task 02 request pipelines).

### 2. `update-selected-notification` missing ownership filter in task 02

**Type:** Review-vs-Task (Design-vs-Task Drift)
**Source of truth:** Review-1 finding #1 — added `contact_id` and `app_name` to the update filter
**Files affected:** `tasks/02-requests.md`
**Resolution:** Updated task 02's `update-selected-notification.yaml` spec to include `contact_id: _user: id` and `created.app_name: _payload: app_name` in the filter, plus `app_name: _module.var: app_name` in the payload. Matches design.md lines 937-954.

### 3. Link page uses two-request pattern in task files, design uses single-request `$or`

**Type:** Review-vs-Task (Design-vs-Task Drift) — MAJOR
**Source of truth:** Review-1 finding #6 — replaced two-request pattern with single `$or` match in `get-notification-for-link`
**Files affected:** `tasks/02-requests.md`, `tasks/06-link-invalid-pages.md`
**Resolution:** Removed `get-notification-type-for-link` request from task 02 (was section 4, no longer exists in design). Updated `get-notification-for-link` in task 02 to use `$or` match with `contact_id` in payload. Rewrote task 06 link page to use single-request flow matching design.md lines 617-729. Renumbered remaining task 02 sections (5→4, 6→5, 7→6). Updated acceptance criteria and files sections in both tasks.

### 4. Link page reads `link.pageId` (singular) instead of `links.button.pageId`

**Type:** Review-vs-Task (Stale Reference)
**Source of truth:** Review-1 finding #2 — schema uses `links` (plural) with `links.button` as default key
**Files affected:** `tasks/06-link-invalid-pages.md`
**Resolution:** Updated all link page navigation params in task 06 to use `links.button.pageId`, `links.button.urlQuery`, `links.button.input` instead of `link.pageId`, `link.urlQuery`, `link.input`. Also updated acceptance criteria to reference `links.button.*`.

### 5. `apps/demo/modules.yaml` update missing from task 07

**Type:** Review-vs-Task (Design-vs-Task Drift)
**Source of truth:** Review-1 finding #5 — app wiring step added to module manifest task
**Files affected:** `tasks/07-module-manifest.md`
**Resolution:** Added section 3 to task 07 showing the `apps/demo/modules.yaml` update (add `vars: { app_name: demo }` to notifications module entry). Added to acceptance criteria and files section.

### 6. Design Tasks section numbering doesn't match task files

**Type:** Internal Contradiction (Design-vs-Task Drift)
**Source of truth:** Task files (01-07) — these are the actual implementation specs
**Files affected:** `design.md` (Tasks section)
**Resolution:** Rewrote design.md Tasks section to match the 7-task file structure: 01=stages, 02=requests, 03=actions, 04=components, 05=inbox page, 06=link+invalid pages, 07=module manifest. Previously, design task 01 merged stages+requests into one task, shifting all subsequent numbers. Moved `unread-count-request.yaml` update from task 01 to task 07 (where the task file actually covers it).

### 7. List notifications timestamp display differs between design and task

**Type:** Design-vs-Task Drift
**Source of truth:** `design.md` lines 435-452 — uses `_dayjs.humanizeDuration` for relative time ("Received 3 hours ago")
**Files affected:** `tasks/04-components.md`
**Resolution:** Updated task 04's `list-notifications.yaml` to use the design's `list.$.time_ago` block with `_dayjs.humanizeDuration` instead of the task's `list.$.timestamp` block with `date('D MMM YYYY')` format. The design explicitly notes this as a key difference from example (`_dayjs.humanizeDuration` instead of `_moment.humanizeDuration`).

### 8. Inbox page content_wrapper margin differs

**Type:** Design-vs-Task Drift (minor)
**Source of truth:** `design.md` line 199 — `margin: 64px auto`
**Files affected:** `tasks/05-inbox-page.md`
**Resolution:** Changed `margin: 40px auto` to `margin: 64px auto` in task 05 to match design.

### 9. Task 02 context note about unread-count-request timing

**Type:** Design-vs-Task Drift (minor)
**Source of truth:** Task file 07 covers the update (not task 07 as task 02 stated)
**Files affected:** `tasks/02-requests.md` line 9
**Resolution:** No change needed — task 02's note correctly says "will be updated separately in task 07", which matches the actual task file structure.

## No Issues

- **Task 03 (actions)** — all four action files match the design exactly
- **Task 04 (components)** — `view-notification.yaml`, `area-selected.yaml`, `form-filter.yaml` match the design (minor allowed variations in label/placeholder text are implementation refinements, not contradictions)
- **Task 05 (inbox page)** — matches design after margin fix
- **Task 07 (module manifest)** — `module.lowdefy.yaml` changes and `unread-count-request.yaml` update match design
- **Review-1 finding #3 (event_type vs type)** — correctly rejected, no propagation needed
- **tasks.md overview** — dependency graph and ordering rationale consistent with task files
