---
"@lowdefy/modules-mongodb-ai-reporting": minor
"@lowdefy/modules-mongodb-deals": patch
---

Module routines no longer build page URLs by hand, so nothing they return or store breaks when a page has a `path` or the app has a `basePath`.

- ai-reporting: **Breaking:** `generate-report`, `create-report` and `duplicate-report` return `{ ok, report_id }` without `url`. Open a report with a `Link` to the `report` page and `urlQuery: { report_id }`. The reporting agent no longer replies with a link; it points the user to the panel's "Reports from this chat" list, where the saved report appears with an Open button.
- deals: deal event titles name the user as plain text, like every other module's events. The hand-built link pointed at `/contacts/view` with the user's id, which is not a contact id.
