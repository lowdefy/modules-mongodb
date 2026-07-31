---
"@lowdefy/modules-mongodb-reporting": minor
"@lowdefy/modules-mongodb-plugins": minor
---

reporting: standardise persisted field names on the repo's snake_case + change-stamp convention

The reporting module was the only module writing camelCase document fields and
plain `createdAt` / `updatedAt` timestamps, against
`apps/demo/.claude/guides/data-schema.md` ("snake_case everywhere; never
camelCase in the database") and against the `created` / `updated` / `deleted`
change-stamp idiom every other module follows.

Report and conversation documents:

- `userId` → `user_id`
- `createdAt` / `updatedAt` → `created` / `updated`, now full change stamps
  (`{ timestamp, user: { name, id } }`) rather than bare dates — so a report can
  say who made it without a second lookup
- `sourceConversationId` → `conversation_id`
- `dataParts` → `data_parts` (the persisted field only)

Endpoint and URL parameters: `reportId` → `report_id`, including the report
page's `?report_id=` query. The `:log` line in `resolve-report` follows.

New `modules/reporting/defaults/change_stamp.yaml` holds the stamp shape, `_ref`'d
by every writer instead of being copied into each — reporting declares no
dependencies so it cannot use the events module's component, but the shape is
identical and a host app reads it with the same predicate.

Demo data: `demo_orders.createdAt` → `order_date`. It is the order's placement
date — domain data, not an audit stamp — so it takes a domain name rather than
becoming a stamp.

Deliberately unchanged, because they are not this module's names to choose:
`conversationId` (the `AgentChat` block property and agent-hook payload key),
`messages` / `steps` / `toolResults` (the framework's `onFinish` payload), and
`dataParts` where it is the key the framework reads parts back from. The report
**spec** vocabulary (`optionsQuery`, `valueKey`, `labelKey`, `filterBy`) also
stays camelCase: a spec is a config DSL closer to Lowdefy's own vocabulary than
to a Mongo document.

Nothing in the module is released, so there is no migration.
