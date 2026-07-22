---
"@lowdefy/modules-mongodb-workflows": minor
---

Add the **open-actions** component — a compact, colour-keyed card list of an
entity's OPEN workflow actions, for hosts that want a lighter summary than
the full `actions-on-entity` stepper. Takes the same `entity_id` +
`entity_connection_id` vars, fetches via the existing `get-entity-workflows`
endpoint, flattens every workflow's groups, and keeps only non-terminal
actions (everything except `done`/`not-required`), styled off the
`action_statuses` enum. Actions-only — never reads tasks or activities.
