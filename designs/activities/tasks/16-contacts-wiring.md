# Task 16: Contacts Wiring

## Context

Mirror image of Task 15. Wires the activities exports into the contacts module:

1. New file: `modules/contacts/components/tile_activities.yaml` — local wrapper, parallels Task 15's companies wrapper but uses `contact_ids` instead of `company_ids`.
2. Modify `modules/contacts/pages/view.yaml` — add the local `tile_activities` to the sidebar.
3. Modify `modules/contacts/components/tile_events.yaml` — rename title from "Activity" to "History".

Can run in parallel with Task 15.

## Task

### `modules/contacts/components/tile_activities.yaml` (new)

Mirror Task 15's companies wrapper exactly, swapping `company_ids` → `contact_ids`:

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
              contact_ids:
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
            reference_field: contact_ids
            reference_value:
              _url_query: _id
```

### `modules/contacts/pages/view.yaml` (modify)

Add the new local `tile_activities` to the sidebar slots, parallel to Task 15. Same placement reasoning — above `tile_events`.

### `modules/contacts/components/tile_events.yaml` (modify)

Rename `title: Activity` → `title: History`. Same single-line change as Task 15.

### `modules/contacts/module.lowdefy.yaml` (modify, if needed)

If contacts-side now depends on activities for its detail page, add `activities` to the `dependencies:` list.

## Acceptance Criteria

- Contact detail page renders two tiles in the sidebar: "Activity" (linked activities) and "History" (system events). No title collision.
- "Log activity" button in the Activity tile pre-fills `contact_ids: [<this-contact-uuid>]`. After submit, the new activity appears in the tile list immediately.
- "View all" link inside the Activity tile navigates to `pageId: all, module: activities` with `?contact_id=<this-contact-uuid>`. List page hydrates filter from URL.
- `tile_events`'s title reads "History" everywhere.
- Contacts-side build is clean.

## Files

- `modules/contacts/components/tile_activities.yaml` — create — local wrapper.
- `modules/contacts/pages/view.yaml` — modify — add `tile_activities` to sidebar.
- `modules/contacts/components/tile_events.yaml` — modify — rename `title: Activity` → `title: History`.
- `modules/contacts/module.lowdefy.yaml` — modify — add `activities` to `dependencies:` list (if not already).

## Notes

- **Mirror image of Task 15.** The only differences are `company_ids` → `contact_ids` and the placement file (`contacts/` instead of `companies/`). Same shape, same rename, same dependency add.
- **The contacts-side embedded `tile_activities`** uses `reference_field: contact_ids`. The activities-timeline will pass that through to `get_activities_for_entity`'s payload, which builds a `$match: { contact_ids: <this-uuid> }` query — hits the `{ contact_ids: 1 }` btree index from the design's Indexes section.
- **`on_created` wires to `get_activities_for_entity`** — same as Task 15. Same request id, same auto-refetch behavior.
- **Don't disturb tile_companies, tile_files placement** in contacts' detail page. Just add tile_activities and rename tile_events.
- See Task 15's notes for the "History" rename rationale and the dependency declaration discussion.
