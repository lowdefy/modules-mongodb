---
"@lowdefy/modules-mongodb-events": minor
---

Add exported `note-capture` — an `@mention` rich-text note-capture modal
writing through this module's own `new-event` api, generalised from
deals' original deal-only `add_note_modal`. Four seams keep this from
being a lossy generalization: a `mentionable_users` options source (plus
optional `mentionable_users_request_id` to refetch on open) so `events`
never queries an app's users itself, an `entity_id` + `reference_field`
pair naming the emitted event's primary reference array (e.g.
`deal_ids`), an optional `company_id` for a secondary `company_ids`
reference, and a `type` + `title_template` pair controlling the emitted
event's type and Nunjucks display copy.
