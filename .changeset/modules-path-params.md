---
"@lowdefy/modules-mongodb-activities": minor
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-deals": minor
"@lowdefy/modules-mongodb-layout": minor
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-workflows": minor
"@lowdefy/modules-mongodb-plugins": minor
---

Module links no longer build page URLs by hand, so they follow Lowdefy page paths and `basePath`.

- The layout `page` component takes a `path` var, such as `tickets/{ticket_id}`, to serve the page at a URL pattern.
- Record links in HTML (company and contact lists, the activities timeline, the company hierarchy, the deal card and the deal's people, the workflow open-actions card and the overview subtitle) are `data-page-id` links, and they move within the app without a full page load. The workflow links pass `pathParams` when a link carries them.
- The sign-in, sign-up, forgot-password and accept pages link to each other by page id rather than by relative URL.
- `DataDescriptions` and `SmartDescriptions` render their contact and company links with the Lowdefy `Link`.
- `ActionSteps`, `WorkflowProgress` and `EventsTimeline` pass a link's `pathParams` to `Link`.

This needs a Lowdefy release with page path parameters.
