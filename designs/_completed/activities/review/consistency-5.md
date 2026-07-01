# Consistency Review 5

## Summary

Scanned `design.md`, `decisions.md`, and the five review files for drift
between review-5's resolutions and the rest of the design. Found one
real inconsistency (auto-resolved) plus one minor wording cleanup.
No user-resolved items, no contradictions, no stale references in
decisions.md.

## Files Reviewed

**Design:**

- `designs/activities/design.md`

**Supporting:**

- `designs/activities/decisions.md`

**Reviews:**

- `designs/activities/review/review-1.md`
- `designs/activities/review/consistency-2.md`
- `designs/activities/review/review-3.md`
- `designs/activities/review/consistency-4.md`
- `designs/activities/review/review-5.md` (most recent — primary source of truth for this pass)

No task files, no plan files exist yet.

## Inconsistencies Found

### 1. `defaults/event_target.yaml` referenced in prose but missing from file tree

**Type:** Internal Contradiction (file tree vs prose)
**Source of truth:** review-5 finding #2 resolution + the design.md "Events emitted" section's factoring claim.
**Files affected:** `design.md:152-153` (file tree), `design.md:351` (prose).
**Resolution:** Added `defaults/event_target.yaml` to the file tree under `defaults/` with the comment "shared `target` object built at every emit site (title/type/type_label lookup) — see 'Events emitted'". The prose at line 351 was hedging — "Factored into a shared `defaults/event_target.yaml` (or similar) `_ref`" — now firmed up to "Factored into `defaults/event_target.yaml` and `_ref`'d from each API call site" since the file path is committed in the file tree.

### 2. "Events emitted" prose committed to file path, hedged with "(or similar)"

**Type:** Stylistic stale-hedge from review-5 #2 resolution wording
**Source of truth:** review-5 finding #2 resolution (committed to factoring into a shared default ref).
**Files affected:** `design.md:351`.
**Resolution:** Folded into #1's edit — dropped the "(or similar)" hedge now that the file is pinned in the file tree.

## No Issues

Areas checked where everything was consistent with review-5's resolutions:

- File tree component tree (`design.md:165-177`) — `activities-timeline.yaml` named correctly (review-5 #4); `excel_download.yaml` listed (review-5 #7); cross-module export comment matches the manifest exports table at `design.md:202-208`.
- File tree requests subtree (`design.md:182-185`) — `get_activities_excel_data.yaml` listed (review-5 #7); `get_activities_for_entity.yaml` comment updated to "feeds activities-timeline" (was "feeds tile_activities" before review-5 #4).
- "Exports" subsection (`design.md:198-216`) — pages/connections/api/components/menus listed; convention-shift rationale paragraph matches the `capture_activity` discussion at `design.md:436-475`.
- "Module vars" intro (`design.md:218-220`) — points at `modules/companies/module.lowdefy.yaml:15-99` as the canonical structured form per review-5 #6.
- "Dependencies" section (`design.md:251-262`) — required/optional editorial caveat per review-5 #9, with concrete failure-mode prose.
- "Events emitted" section (`design.md:328-352`) — `target` shape with `_get` lookup per review-5 #2; `defaults/event_target.yaml` factoring now matches file tree.
- "Linking → Forward" (`design.md:355-410`) — local-wrapper YAML for `companies/components/tile_activities.yaml`, matching review-5 #4. "View all" link uses `_module.pageId: { id: all, module: activities }` per consistency-4. The `_url_query: _id` reference resolution per consistency-2 #2 still in place.
- "Built-in placements" (`design.md:546-549`) — `tile_activities` header bullet rewritten to point at the consumer's local wrapper per review-5 #4. Auto-wired refetch (review-1 #10) preserved through the relocation.
- API surface intro paragraph (`design.md:565-567`) — names the four endpoints and the three `actions/` files explicitly per review-5 #8. Consistent with the file tree's `actions/` subtree (`design.md:191-194`) and the API specs that follow.
- `change-activity-status` routine step 1 (`design.md:625`) — load-step rationale note per review-5 #3 (departure from `update-company.yaml`, idempotency on concurrent same-direction flips).
- `create-activity` routine step 2 (`design.md:589`) — Atlas Search vs `$match` filter shapes split per review-5 #1; warning against `$ne: true` bug present.
- Indexes section (`design.md:66-73`) — Atlas Search index entry added per review-5 #1; partial index on source.external_ref preserved per review-1 #13; fixed-position note on `status.0.stage` preserved per review-1 #14.
- "Files changed / Touched modules" (`design.md:760-770`) — gains the two new `tile_activities.yaml` local wrappers in companies + contacts per review-5 #4. Existing `tile_events.yaml` "Activity"→"History" renames preserved (review-1 #4).
- `decisions.md` — no drift. The single `tile_activities` reference at line 59 ("the detail-page sidebar tiles (tile_activities)") still works conceptually; the user-facing tile concept is unchanged by review-5 #4's restructuring of the file topology. No file-naming references to update.
- All cross-module `_ref: { module: activities, component: ... }` blocks reference real exported components (`capture_activity`, `open_capture`, `activities-timeline`) — none reference the renamed `tile_activities`.
- Past review annotations (review-1 through consistency-4) preserved intact as historical record. Review-1 #10's "auto-wires its own list refetch" framing reads under the old shape but the spirit is preserved (auto-wiring still happens, in the consumer's local wrapper now); intentionally not retroactively rewritten.

## Files Modified

- `designs/activities/design.md` (lines 152-153 — added `event_target.yaml` to file tree; line 351 — dropped "(or similar)" hedge)

## Remaining Open Questions

None. Forward-looking notes inline in `design.md` ("Future cleanup —
`tile_files` consolidation", "Future consideration — modal-from-link
triggers", "Future consideration — delink visibility") are tracked
inline and not pending consistency resolution.
