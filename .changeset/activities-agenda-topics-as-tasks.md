---
"@lowdefy/modules-mongodb-activities": minor
---

Activities: built-in meeting agenda topics, stored as tasks in the actions collection.

- New built-in Agenda Topics section on the activity form (meeting only): topic, details, action, person responsible (options from the activity's attendees), and due date, with an info alert explaining that agenda changes create/update tasks. Previously this lived in consumer `fields.attributes` config writing to `attributes.agenda_topics`.
- Topics are no longer stored on the activity doc. `create-activity` and `update-activity` accept a new `agenda_topics` payload array and persist each topic as a task document in the actions collection — `kind: task`, `title` = topic, `description` = details, `attributes.action`, `assignees` = [person responsible], `due_date`, app-keyed `{app_name}.message`, initial stage `action-required` — linked back via `activity_ids` and stamped with the activity's `company_ids` + `references` payload (e.g. `deal_ids`) so they surface in host-app task lists.
- `update-activity` diffs incoming topics against the activity's existing tasks by `_id`: new rows insert (upsert), existing rows get field edits only (status untouched), and removed rows get a `not-required` status entry pushed — never deleted. `delete-activity` marks the activity's open (`action-required`) tasks `not-required`.
- No per-task events: the existing `create-activity` / `update-activity` / `delete-activity` events carry affected task ids in `references.action_ids`, and task status entries reference that event's id.
- `get_activity` gains a `lookup_agenda_tasks` stage (`_id` → `activity_ids`, excluding `not-required`) feeding a new read-only Agenda Topics section on the view page and the edit form's seeded rows (hidden task `_id` per row round-trips through the ControlledList).
- New `actions-collection` connection (default collection `actions`, write enabled) and `lookup_collections.actions` var (default `actions`) — consumers mapping the actions collection to another name must set both.
- Activity docs now also store the create `references` payload verbatim under a `references` field, so tasks added later from the edit page inherit the same references.
