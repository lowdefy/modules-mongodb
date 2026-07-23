---
"@lowdefy/modules-mongodb-deals": patch
---

Stop shipping a second, deal-only note-capture modal — delete
`components/detail/add_note_modal.yaml` and consume events' new exported
`note-capture` component (writing through events' own `new-event` api)
instead. The deal view passes its `get_mentionable_users` request as the
mention source, the deal id under `reference_field: deal_ids`, the deal's
`company_id`, and its `deal-note` event type/display template, so notes
still emit the same event type, references, and display markup as
before. `get_mentionable_users` stays in deals since it queries the
app's own users.
