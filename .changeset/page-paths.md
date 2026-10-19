---
"@lowdefy/modules-mongodb-activities": minor
"@lowdefy/modules-mongodb-ai-reporting": minor
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-deals": minor
"@lowdefy/modules-mongodb-events": minor
"@lowdefy/modules-mongodb-layout": minor
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-workflows": minor
"@lowdefy/modules-mongodb-plugins": minor
---

**Module links follow Lowdefy page paths and `basePath`.** No module builds a page URL by hand any more, so nothing breaks when a page has a `path` or the app has a `basePath`.

- **Pages with paths.** The layout `page` component takes a `path` var, such as `tickets/{ticket_id}`, to serve the page at a URL pattern.
- **Record links.** Links in HTML (company and contact lists, the activities timeline, the company hierarchy, the deal card and the deal's people, the workflow open-actions card and the overview subtitle) are `data-page-id` links, so they move within the app without a full page load. `DataDescriptions` and `SmartDescriptions` render contact and company links with Lowdefy's `Link`, and `ActionSteps`, `WorkflowProgress` and `EventsTimeline` pass a link's `pathParams` to it. The sign-in, sign-up, forgot-password and accept pages link to each other by page id.
- **Workflows.** A workflow's `entity:` block takes `id_path_key`, the entity page's path placeholder for the entity id (for a page at `deals/{deal_id}`, `id_path_key: deal_id`); the entity link then carries the id in `pathParams`. `id_query_key` defaults to `_id` only when `id_path_key` is not set, so set both to also pass the id in the query. `tracker.start_link` and the custom-kind `status_map` `link:` / `view_link:` cells take `pathParams` next to `urlQuery`, with the same `action_id: true` / `entity_id: true` sentinels. Breadcrumbs, the return to the entity after a terminal signal, the events timeline and the deal's open items pass `pathParams` too.
- **Breaking (events): `contact_page_url` is replaced by `contact_page_id`.** Set it to the contact page's id, such as `contacts/view`. The contact id goes in the query as `contact_id_query_key` (default `_id`), in the path value `contact_id_path_key` names when the page has a path like `contacts/{contact_id}`, or both. The events-timeline component takes the same three vars per call, and the `EventsTimeline` block takes `contactPageId`, `contactIdQueryKey` and `contactIdPathKey` in place of `contactPageUrl`. The timeline's avatar, timestamp and note @mentions link to the contact page; `note-capture` stores each @mention as a `#contact-<id>` link, and mentions in notes saved before this show unlinked.
- **Breaking (ai-reporting): `generate-report`, `create-report` and `duplicate-report` return `{ ok, report_id }` without `url`.** Open a report with a `Link` to the `report` page and `urlQuery: { report_id }`. The reporting agent points the user to the panel's "Reports from this chat" list instead of replying with a link.
- **Fix (deals):** deal event titles name the user as plain text. The old link pointed at `/contacts/view` with the user's id, which is not a contact id.
