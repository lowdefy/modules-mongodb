# Consistency Review 4

## Summary

Scanned `design.md`, `decisions.md`, and the three review files for drift
between review-3's resolutions and the rest of the design. Found six
inconsistencies — three substantive (decisions.md vs review-3 / Sam's URL
fix), three minor (stale phrasings in design.md). All six resolved
interactively, one item per question. No issues left open.

## Files Reviewed

**Design:**

- `designs/activities/design.md`

**Supporting:**

- `designs/activities/decisions.md`

**Reviews:**

- `designs/activities/review/review-1.md`
- `designs/activities/review/consistency-2.md`
- `designs/activities/review/review-3.md` (most recent — primary source of truth)

No task files, no plan files exist yet — those haven't been created.

## Inconsistencies Found

### 1. `decisions.md` Decision #4 still described pre-review-3 files-module shape

**Type:** Review-vs-Design Drift
**Source of truth:** review-3 finding #1 resolution + design.md Attachments section.
**Files affected:** `decisions.md:75-77`.
**Resolution:** Updated the implementation prose in Decision #4 — `(entity_type: 'activity', entity_id: <uuid>)` keying, local `tile_files.yaml` wrapper around `files.file-card`, `entity_type` + `entity_id` vars. Decision (via files module, not inlined) and rationale unchanged.

### 2. `decisions.md` Soft-delete bullet inverted vs review-3

**Type:** Review-vs-Design Drift
**Source of truth:** review-3 finding #2 resolution + design.md `delete-activity` section.
**Files affected:** `decisions.md:122-125`.
**Resolution:** Rewrote the "Non-questions worth recording" bullet from "Soft delete via `update-activity`...matches the `companies` pattern" to "Dedicated `delete-activity` API for soft-delete...mirrors `change-activity-status` and `delete-file`." Removed the false continuity claim.

### 3. `decisions.md` Decision #6 still referenced `/activities/new` URL paths

**Type:** Review-vs-Design Drift (Sam's URL fix not propagated)
**Source of truth:** Sam's PR #22 review feedback + design.md's `pageId: new` framing.
**Files affected:** `decisions.md:142, 166-170, 172-174`.
**Resolution:** Three references replaced — "URL-param support on `/activities/new`" → "URL query-param support on `pageId: new`"; the "Why support URL params" header reframed with a parenthetical noting Lowdefy URLs don't carry path params; "Modes" paragraph updated to say `mode: page` "links to `pageId: new` with prefill in `urlQuery`."

### 4. `design.md:63` data-model comment claimed `removed` "same pattern as companies"

**Type:** Internal Contradiction (against review-3 #2 dropping equivalent claim elsewhere)
**Source of truth:** review-3 finding #2 (companies doesn't soft-delete) + the codebase facts review-3 verified.
**Files affected:** `design.md:63`.
**Resolution:** Comment updated to "null on insert (matches create-company); set to change_stamp by `delete-activity`" — points at what's actually true (insert-side parity) and which API does the flip.

### 5. `design.md:291` events table `update-activity` row had a vestigial qualifier

**Type:** Internal Contradiction (predates the `change-activity-status` / `delete-activity` API split)
**Source of truth:** `update-activity` API spec at `design.md:518-528`.
**Files affected:** `design.md:291`.
**Resolution:** "Activity edited (non-status fields, or status edit that isn't a stage transition)" → "Activity's editable fields edited (title, description, contact_ids, company_ids, attributes)". Matches the API's editable-fields list exactly; drops the half-thought about "status edits" that no longer routes through `update-activity`.

### 6. `design.md:295` events table `delete-activity` row implementation-leaned on the old design

**Type:** Internal Contradiction (predates review-3 #2's dedicated API decision)
**Source of truth:** `delete-activity` API spec at `design.md:550-572` + peer rows in the same table.
**Files affected:** `design.md:295`.
**Resolution:** "Soft-deleted via `removed` field" → "Activity soft-deleted". The "via `removed` field" framing implied the field-set was the trigger; under the dedicated-API design, the API call is the trigger and the field-set is the result. Trimmed to match peer rows' tone (`create-activity`: "New activity inserted"; `complete-activity`: "Status transitions to `done`").

## No Issues

Areas checked where everything was consistent:

- File tree (`design.md:139-194`) — all four pages renamed to semantic IDs (`all`, `view`, `edit`, `new`); `tile_files.yaml` and `delete-activity.yaml` both present per review-3 #1 / #2.
- `delete-activity` API spec (`design.md:550-572`) — input, routine, return all match the events table and the file tree.
- `change-activity-status` routine (`design.md:524-560`) — optimistic concurrency filter on `status.0.stage` + `updated.timestamp`, `$set: { updated }` alongside `$push`, matching review-3 #4.
- `update-activity` routine (`design.md:518-528`) — sketch mirrors `update-company.yaml` (concurrency filter + `updated` bump), matching review-3 #4.
- Derived values pipeline (`design.md:74-94`) — keeps Johann's simple `current_stage: { $arrayElemAt: ["$status.stage", 0] }`; `$let` form for `completed_at` / `cancelled_at` / `opened_at`. Matches review-3 #5's partial-overstatement annotation.
- Pages section (`design.md:600-638`) — section headers use `pageId: all/view/edit/new`; intro paragraph explains the `?_id=<uuid>` query-param convention; URL hydration paragraph on `pageId: all` matches review-3 #6.
- "Linking → Forward" → "View all" link (`design.md:330-344`) — concrete `pageId: { id: all, module: activities }` + `urlQuery: { contact_id }` / `{ company_id }` shape, mirrors `tile_contacts.yaml`.
- Capture flow prose (`design.md:317-455`) — `mode: page` and `open_capture` both link to `pageId: new` with `urlQuery`, no `/activities/new` references remain.
- Deep-link section (`design.md:431-455`) — `description` correctly omitted from supported URL prefill params; explanatory paragraph notes Tiptap rich-text doesn't round-trip through URLs.
- Non-goals (`design.md:632-643`) — "Rich-text description" entry removed per Sam's Tiptap fix; remaining items match design state.
- review-1.md and consistency-2.md annotations preserved intact; review-3.md annotations match the design changes applied.

## Files Modified

- `designs/activities/design.md` (lines 63, 291, 295)
- `designs/activities/decisions.md` (lines 75-82, 122-127, 141-143, 165-172, 174-177)

## Remaining Open Questions

None from this consistency pass. Forward-looking notes inline in
`design.md` ("Future cleanup — `tile_files` consolidation",
"Future consideration — modal-from-link triggers",
"Future consideration — delink visibility") are tracked as such — not
open questions pending resolution.
