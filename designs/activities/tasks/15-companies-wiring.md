# Task 15: Companies — `tile_events` Title Rename

## Context

Single-line change in companies, motivated by the activities module being added: the existing `tile_events.yaml` uses card title `"Activity"`, which collides with `tile_activities` once apps slot it in. Rename to `"History"` pre-emptively. Per `decisions.md` §7 (Sam's PR-32 #4 review) activities is an optional dependency for companies; companies' module manifest does NOT add activities as a dep, and companies' `view.yaml` does NOT embed `tile_activities`. Apps that want activities tiles wire them into `components.sidebar_slots` from app config (see Task 18).

This task can run in parallel with Task 16 (the contacts-side rename is the mirror image).

## Task

### `modules/companies/components/tile_events.yaml` (modify)

Single-line edit. Read the file. Change `title: Activity` to `title: History`. Leave the embedded `_ref: { module: events, component: events-timeline, ... }` untouched.

Before:
```yaml
_ref:
  module: layout
  component: card
  vars:
    title: Activity
    blocks:
      - _ref: ...events-timeline...
```

After:
```yaml
_ref:
  module: layout
  component: card
  vars:
    title: History
    blocks:
      - _ref: ...events-timeline...
```

## Acceptance Criteria

- `modules/companies/components/tile_events.yaml`'s card title now reads `History`.
- A company detail page renders the events tile labelled "History" (the system-audit log).
- If an app wires `tile_activities` into `components.sidebar_slots` (see Task 18), both tiles render side-by-side without title collision: "Activity" (the cross-module activities tile) and "History" (the renamed events tile).
- Companies' `module.lowdefy.yaml` is **unchanged** — no activities dep added.
- Companies' `pages/view.yaml` is **unchanged** — no `tile_activities` embed.
- Build is clean.

## Files

- `modules/companies/components/tile_events.yaml` — modify — rename `title: Activity` → `title: History`.

## Notes

- **Why rename pre-emptively.** Two reasons: (1) collision protection for apps that DO wire `tile_activities` — they'd see two cards titled "Activity" otherwise. (2) "History" is a better label for a system-audit log regardless. The existing label was always slightly off — system events aren't "activities" in the user's mental model.
- **No activities dependency, no view embed.** Per the optional-dep architecture (see `design.md`'s Linking → Forward and Integration sections), companies stays decoupled from activities. Don't add `- id: activities` to companies' manifest dependencies. Don't add `_ref: ../components/tile_activities.yaml` to companies' `view.yaml`. The wiring lives at app level.
- **Companies' old `tile_files.yaml` deletion** is a separate change handled in this PR's `tile_files` consolidation (per `decisions.md` §4) — not part of this task. If the file already exists when you reach this task, leave it alone; if it's been deleted, that's expected.
