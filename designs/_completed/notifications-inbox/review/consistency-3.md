# Consistency Review 3

## Summary

Checked all 12 files in the notifications-inbox design tree against the 11 review decisions (review-1: 7, review-2: 4) and 9 consistency-2 resolutions. Found 5 inconsistencies — 4 auto-resolved, 1 user-resolved.

## Files Reviewed

**Design:**

- `design.md`

**Reviews:**

- `review/review-1.md`
- `review/review-2.md`
- `review/consistency-2.md`

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

### 1. Stale `link` (singular) in design.md link page description

**Type:** Internal (Stale Reference)
**Source of truth:** Review-1 finding #2 — schema uses `links` (plural) with `links.button` as default key
**Files affected:** `design.md` line 605
**Resolution:** Changed "from the notification's `link` data" to "from the notification's `links.button` data". All code blocks already used `links.button` correctly; only the prose description was stale.

### 2. Stale `match-filter-type` reference in task 02 prose

**Type:** Design-vs-Task (Stale Reference)
**Source of truth:** Review-1 finding #7 — renamed to `match-filter-read-status`
**Files affected:** `tasks/02-requests.md` line 54
**Resolution:** Changed "via `match-filter-type` stage" to "via `match-filter-read-status` stage". Consistency-2 renamed all code references but missed this prose description.

### 3. Stale "seven" count in task 02 intro

**Type:** Internal (Stale Reference)
**Source of truth:** Task 02 content — 6 request files after consistency-2 removed `get-notification-type-for-link` per review-1 finding #6
**Files affected:** `tasks/02-requests.md` line 5
**Resolution:** Changed "all seven request files" to "all six request files". Consistency-2 renumbered sections (5→4, 6→5, 7→6) and updated acceptance criteria to "six" but didn't update the intro text.

### 4. Design Tasks section missing VARS.md update for task 07

**Type:** Review-vs-Design (R2#4 resolution not propagated to design)
**Source of truth:** Review-2 finding #4 — added VARS.md update to task 07
**Files affected:** `design.md` (Tasks section, task 07)
**Resolution:** Added "Update `VARS.md`: Document the `app_name` var" to the task 07 summary in design.md. Task file `07-module-manifest.md` already had section 4 covering this.

### 5. form-filter.yaml properties differ between design and task

**Type:** Design-vs-Task Drift
**Source of truth:** `design.md` lines 579-600
**Files affected:** `tasks/04-components.md` (form-filter section)
**Resolution:** Asked user — updated task to match design. Changed DateRangeSelector from `label: { disabled: true }` + `placeholder: [Start date, End date]` to `title: Date Range`. Changed MultipleSelector from `label: { disabled: true }` + `placeholder: Filter by type` to `title: Type` + `placeholder: Select type`. Consistency-2 had assessed this as "minor allowed variations" but it changed the visual presentation (visible labels vs hidden labels).

## Additional: tasks.md summary update

Updated `tasks/tasks.md` task 07 summary from "Update module.lowdefy.yaml with new vars, pages, exports" to "Update manifest, unread-count-request, app wiring, and VARS.md" to reflect the full scope of the task file.

## No Issues

- **Task 01 (request stages)** — both stage files match design exactly
- **Task 02 (requests)** — all six request code blocks match design; acceptance criteria and files section correct
- **Task 03 (actions)** — all four action files match design exactly
- **Task 04 (components)** — `list-notifications.yaml`, `view-notification.yaml`, `area-selected.yaml` match design exactly; `form-filter.yaml` now matches after fix #5
- **Task 05 (inbox page)** — full page definition matches design (margin, `filter.type` id, all refs correct)
- **Task 06 (link + invalid pages)** — both pages match design; `links.button.*` references correct; single-request `$or` pattern correct
- **Task 07 (module manifest)** — manifest changes, unread-count-request, app wiring, and VARS.md all match design + review decisions
- **Review-1 finding #3 (event_type vs type)** — correctly rejected, no propagation needed
- **All review-2 decisions** — fully propagated to design and tasks
- **All consistency-2 resolutions** — verified correct (with the exception of the 3 stale references it missed)
