# Task 16: Contacts — `tile_events` Title Rename

## Context

Mirror image of Task 15. Single-line rename of contacts' `tile_events.yaml` card title from `"Activity"` to `"History"`, pre-emptively avoiding collision with `tile_activities` and giving the system-audit log a better label.

Per `decisions.md` §7 (Sam's PR-32 #4 review) activities is an optional dependency for contacts; contacts' module manifest does NOT add activities as a dep, and contacts' `view.yaml` does NOT embed `tile_activities`. Apps that want activities tiles wire them into `components.sidebar_slots` from app config (see Task 18).

Can run in parallel with Task 15.

## Task

### `modules/contacts/components/tile_events.yaml` (modify)

Same edit as Task 15. Change `title: Activity` → `title: History`. Leave the embedded `events-timeline` ref untouched.

## Acceptance Criteria

- `modules/contacts/components/tile_events.yaml`'s card title now reads `History`.
- A contact detail page renders the events tile labelled "History".
- If an app wires `tile_activities` into `components.sidebar_slots`, both tiles render side-by-side without title collision.
- Contacts' `module.lowdefy.yaml` is **unchanged** — no activities dep added.
- Contacts' `pages/view.yaml` is **unchanged** — no `tile_activities` embed.
- Build is clean.

## Files

- `modules/contacts/components/tile_events.yaml` — modify — rename `title: Activity` → `title: History`.

## Notes

- See Task 15's notes for the rename rationale and the optional-dep architecture context.
- Contacts' old `tile_files.yaml` deletion is handled in this PR's `tile_files` consolidation (per `decisions.md` §4) — not part of this task.
