# Consistency Review 6

## Summary

Scanned `design.md`, `decisions.md`, and all 19 task files for drift between this session's PR-32 actioning (#1 tasks/notes dropped, #2 collection var removed, #3 `tile_files` consolidated, #4 activities-as-optional-dep) and the rest of the design. Found four inconsistencies — all auto-resolved. No user-resolved items.

## Files Reviewed

**Design:**

- `designs/activities/design.md`

**Supporting:**

- `designs/activities/decisions.md`

**Reviews (skipped per skill workflow):**

- `designs/activities/review/review-1.md`
- `designs/activities/review/review-3.md`
- `designs/activities/review/review-5.md`
- `designs/activities/review/consistency-2.md`
- `designs/activities/review/consistency-4.md`
- `designs/activities/review/consistency-5.md`

**Tasks:**

- `designs/activities/tasks/tasks.md`
- `designs/activities/tasks/01-module-skeleton.md`
- `designs/activities/tasks/02-api-create-activity.md`
- `designs/activities/tasks/03-api-update-activity.md`
- `designs/activities/tasks/04-api-change-activity-status.md`
- `designs/activities/tasks/05-api-delete-activity.md`
- `designs/activities/tasks/06-request-stages.md`
- `designs/activities/tasks/07-requests.md`
- `designs/activities/tasks/08-form-and-fields.md`
- `designs/activities/tasks/09-display-components.md`
- `designs/activities/tasks/10-chips.md`
- `designs/activities/tasks/11-export-selector-and-timeline.md`
- `designs/activities/tasks/12-export-capture-flow.md`
- `designs/activities/tasks/13-pages-new-edit.md`
- `designs/activities/tasks/14-pages-view-and-all.md`
- `designs/activities/tasks/15-companies-wiring.md`
- `designs/activities/tasks/16-contacts-wiring.md`
- `designs/activities/tasks/17-shared-event-types-ref.md`
- `designs/activities/tasks/18-demo-app-integration.md`

## Inconsistencies Found

### 1. Task 1's `exports.components` list missing `tile_activities`

**Type:** Design-vs-Task drift
**Source of truth:** PR-32 #4 resolution (decisions.md §7 + design.md Linking section + Task 11 rewrite — `tile_activities` is now a primary cross-module export).
**Files affected:** `tasks/01-module-skeleton.md:113-121`.
**Resolution:** Added `tile_activities` entry to the exports.components list with description "Self-contained sidebar tile (layout.card + activities-timeline + capture_activity in header). For app-level slot wiring on companies/contacts." Also rewrote `activities-timeline`'s description, which still said "consumers wrap in their own tile_activities.yaml" — the pre-PR-32-#4 framing. Updated to "Content-only block (list + filters + view-all link, no card). Building block for apps wanting custom wrappers."

### 2. Task 11 dependency missing Task 12

**Type:** Design-vs-Task drift (architectural change to `tile_activities` introduced a new transitive dep)
**Source of truth:** PR-32 #4 resolution. `tile_activities` (created in Task 11) embeds `capture_activity` as a `_ref` in its `header_buttons` block. `capture_activity` is created in Task 12. Task 11 can't build cleanly without Task 12 done first.
**Files affected:** `tasks/tasks.md:21` (Task 11 row) and `tasks/tasks.md:48-54` (parallel-safe pairs).
**Resolution:** Updated Task 11's `Depends On` from `1, 7, 9` to `1, 7, 9, 12`. Removed "Tasks 11 and 12 — selector/timeline export and capture-flow export are independent" from the parallel-safe pairs list and replaced with a "**Note on Tasks 11 + 12.**" stanza explaining the dep.

### 3. Task 18 deps missing Tasks 15 + 16

**Type:** Design-vs-Task drift (visual correctness of demo)
**Source of truth:** Task 18 wires `tile_activities` into companies/contacts sidebars. Tasks 15 + 16 rename `tile_events` title from "Activity" to "History". Without 15 + 16, the demo app would show two cards titled "Activity" — defeating the demo's purpose as a working reference.
**Files affected:** `tasks/tasks.md:28` (Task 18 row).
**Resolution:** Updated Task 18's `Depends On` from `1, 11, 12, 14` to `1, 11, 12, 14, 15, 16`.

### 4. Tasks 15, 16, 18 reference `decisions.md §5` for activities-as-optional-dep — wrong section number

**Type:** Stale section-number reference
**Source of truth:** decisions.md sections — §5 is "task as a built-in activity type"; §7 is "Activities-on-companies/contacts — required dep or optional + app-wired?". The activities-as-optional-dep rationale lives in §7, not §5.
**Files affected:** `tasks/15-companies-wiring.md:5`, `tasks/16-contacts-wiring.md:7`, `tasks/18-demo-app-integration.md:8`.
**Resolution:** Updated all three references from `§5` to `§7`. Also dropped the `(revised — ...)` parenthetical since §7 is a fresh decision in this session, not a revised earlier one.

### 5. decisions.md §7 self-reference to "§5 follow-on" was meaningless

**Type:** Internal cross-reference
**Source of truth:** decisions.md §7's prose claims the `tile_events` rename is a "§5 follow-on", but §5 is about tasks-deferred and has nothing to do with the rename. The rename rationale is documented in design.md's key-decisions section (prose, not numbered) and tied to the activities module introduction (§7 itself, since §7 explains why activities is wired).
**Files affected:** `decisions.md:280-281`.
**Resolution:** Reworded "the `tile_events` 'Activity' → 'History' rename (§5 follow-on, retained for collision protection if apps wire activities)" to "the `tile_events` 'Activity' → 'History' rename — retained for collision protection if apps wire activities, and a better label for the system-audit log regardless." Drops the bad cross-reference.

## No Issues

Areas checked where everything was consistent:

- Stale `task` / `note` type refs in design + tasks — none. Both fully removed from v1 built-ins per decisions.md §5 + §6.
- Stale `collection` var refs — none beyond intentional explanatory text in Task 1 ("`collection: activities` hardcoded — not `_module.var: collection`").
- Stale `tile_files.yaml` refs — all hits are intentional explanatory mentions (deletion notices, "no wrapper" instructions). No stale create/ref instructions.
- Companies/contacts depending on activities — all design and task prose explicitly states "no activities dep on companies/contacts." Consistent.
- Local `tile_activities.yaml` files in companies/contacts — design and tasks all reflect that these don't exist. Removed from file tree, file-changed list, integration section, and Tasks 15 + 16.
- Old `10-chips-and-tile-files.md` filename — fully renamed to `10-chips.md`; no stale refs.
- Decisions.md section numbering — §1 through §8 sequential, no gaps. Cross-refs (§4, §6) within decisions.md correct after the §7 fix.
- review-5 #4 partial-reversal acknowledgements — all three mentions (decisions.md §7 + design.md Linking section) frame this correctly as a partial reversal, not a contradiction.
- Manifest exports list in Task 1 vs design.md's Exports table — both list 5 cross-module components: `activity-selector`, `tile_activities`, `activities-timeline`, `capture_activity`, `open_capture`.
- File tree entries match `exports.components` — `tile_activities.yaml` and `activities-timeline.yaml` both listed under `components/`.
- Task 14's view-page sidebar embed (`files.file-card` inline) matches design.md Attachments section and decisions.md §4.
- Task 11's manifest update (4 component `_ref` entries: activity_types, activity-selector, activities-timeline, tile_activities) matches the design's Module Surface and Task 1's exports declaration.
- Demo app slot-wiring example in Task 18 matches the example shape shown in design.md Linking → Forward.
- All `decisions.md §N` references in tasks point at the right section after fix #4 above.
- Past review annotations (review-1, review-3, review-5, consistency-2, consistency-4, consistency-5) preserved intact as historical record. Review-5 #4's annotation reads under the old shape but the partial-reversal is documented in decisions.md §7 + design.md, which the implementer reaches first.

## Files Modified

- `designs/activities/tasks/01-module-skeleton.md` (lines 113-121 — added `tile_activities` to exports list, rewrote `activities-timeline` description)
- `designs/activities/tasks/tasks.md` (line 21 — Task 11 deps; line 28 — Task 18 deps; lines 48-54 — parallel-safe pairs)
- `designs/activities/tasks/15-companies-wiring.md` (line 5 — `§5` → `§7`)
- `designs/activities/tasks/16-contacts-wiring.md` (line 7 — `§5` → `§7`)
- `designs/activities/tasks/18-demo-app-integration.md` (line 8 — `§5` → `§7`)
- `designs/activities/decisions.md` (line 280 — dropped meaningless `§5 follow-on` cross-ref)

## Remaining Open Questions

None. Forward-looking inline notes in `design.md` ("Future cleanup — `tile_files` consolidation" was actioned this session, "Future consideration — modal-from-link triggers", "Future consideration — delink visibility") are tracked inline and not pending consistency resolution.
