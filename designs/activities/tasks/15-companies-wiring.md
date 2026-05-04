# Task 15: Companies Wiring

## Context

After Tasks 11 + 12, `activities-timeline` and `capture_activity` are exported from the activities module. This task wires them into the companies module:

1. New file: `modules/companies/components/tile_activities.yaml` — local wrapper that puts `activities-timeline` inside a `layout.card` titled "Activity", with `capture_activity` in the header buttons.
2. Modify `modules/companies/pages/view.yaml` — add the local `tile_activities` to the sidebar slots.
3. Modify `modules/companies/components/tile_events.yaml` — rename the card title from "Activity" to "History" (the existing system-events tile collides with the new activities tile; renaming resolves the name collision per `design.md`'s key decision and review-1 #4).

This task can run in parallel with Task 16 (the contacts wiring is the mirror image).

Reference: `modules/companies/components/tile_events.yaml` shows the local-wrapper pattern this task follows. The new `tile_activities.yaml` mirrors it exactly, swapping `events.events-timeline` → `activities.activities-timeline` and adding `capture_activity` in the header.

## Task

### `modules/companies/components/tile_activities.yaml` (new)

Local wrapper. Mirrors the `tile_events.yaml` shape, with two additions: a `header_buttons` block embedding `capture_activity`, and the embedded timeline is `activities.activities-timeline`.

```yaml
_ref:
  module: layout
  component: card
  vars:
    title: Activity
    header_buttons:
      - _ref:
          module: activities
          component: capture_activity
          vars:
            label: Log activity
            icon: AiOutlinePlus
            button_type: link
            size: small
            mode: modal
            prefill:
              company_ids:
                - _url_query: _id
            on_created:
              - id: refetch_activities
                type: Request
                params: get_activities_for_entity
    blocks:
      - _ref:
          module: activities
          component: activities-timeline
          vars:
            reference_field: company_ids
            reference_value:
              _url_query: _id
```

The `on_created` action sequence refetches `get_activities_for_entity` — the request that the embedded `activities-timeline` reads. This auto-wires the "captured activity appears in the tile immediately" behavior without a page refresh.

### `modules/companies/pages/view.yaml` (modify)

Add the new local `tile_activities` to the sidebar slots area. Mirror however the existing `tile_events` is embedded in the same file. Likely:

```yaml
# Inside the sidebar column's blocks list:
- _ref: ../components/tile_activities.yaml
- _ref: ../components/tile_events.yaml
- _ref: ../components/tile_files.yaml
# ... and the consumer hook _module.var: components.sidebar_slots
```

Place `tile_activities` above `tile_events` (or wherever the visual hierarchy makes sense — recent activities first, audit history second). The exact slot positioning is a design choice within companies; place to match the design's intent of "activities are what was done, history is the audit log."

### `modules/companies/components/tile_events.yaml` (modify)

Single-line change: rename the card title.

Current:
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
      - _ref: ...events-timeline...   # unchanged
```

Just the `title` value changes. The embedded `events-timeline` ref stays exactly as it is.

## Acceptance Criteria

- `modules/companies/components/tile_activities.yaml` exists and mirrors `tile_events.yaml`'s shape, swapping the embedded cross-module ref to `activities.activities-timeline` and adding `capture_activity` in the header.
- A company detail page renders **two tiles in the sidebar**: "Activity" (the new tile, listing activities linked to the company) and "History" (the renamed events tile, listing system events). Title collision resolved.
- "Log activity" button in the Activity tile's header opens a modal pre-filled with `company_ids: [<this-company's-uuid>]`. After submit, the new activity appears in the tile list immediately (auto-refetch).
- "View all" link inside the Activity tile (provided by `activities-timeline`) navigates to `pageId: all, module: activities` with `?company_id=<this-company-uuid>` — the activities list page hydrates the filter from the URL (Task 14).
- `tile_events`'s card title now reads "History" everywhere it's rendered.
- Companies-side build is clean. The companies module loads activities as a dependency (declared in companies' `module.lowdefy.yaml:8-9` already, since events depends on activities at the app level — actually verify: companies declares `dependencies: events, contacts, files` — does it need to add `activities`? If activities is required by companies' own page, yes — add to companies' manifest `dependencies` list).

## Files

- `modules/companies/components/tile_activities.yaml` — create — local wrapper.
- `modules/companies/pages/view.yaml` — modify — add `tile_activities` to sidebar.
- `modules/companies/components/tile_events.yaml` — modify — rename `title: Activity` → `title: History`.
- `modules/companies/module.lowdefy.yaml` — modify — add `activities` to `dependencies:` list (if companies-side now depends on activities for its detail page).

## Notes

- **Title collision is the central reason for renaming `tile_events`.** Both tiles existed pre-redesign with no conflict (only one was titled "Activity"). Adding the new tile_activities forces the rename. The user mental model is: activities = things users did, history = system audit log. Lock in this framing in the rename.
- **Don't rename `tile_events` to anything other than "History".** This is the chosen value from review-1 #4. Don't pick "Audit", "System", or "Log" — consistency across companies + contacts (Task 16 makes the same change there).
- **`on_created` wires to `get_activities_for_entity`.** The id of the request inside `activities-timeline` is `get_activities_for_entity` (Task 7) — make sure it matches exactly. Otherwise the refetch silently does nothing.
- **`capture_activity`'s `mode: modal`** keeps the user on the company detail page. They click "Log activity", a modal opens with the company pre-linked, they fill in title/type/description, submit, modal closes, tile updates. No page navigation.
- **Companies' dependency on activities.** Pre-task: companies' manifest declares deps on `layout, events, contacts, files`. After this task, companies' detail page references `activities.activities-timeline` and `activities.capture_activity` cross-module. Lowdefy's build will fail if activities isn't in companies' dependency list. Add it.
- **Don't move `tile_files`.** Sidebar order: tile_activities → tile_events → tile_files (and tile_contacts, etc.). Don't disturb the existing files/contacts tile placement during this task.
