---
"@lowdefy/modules-mongodb-events": minor
"@lowdefy/modules-mongodb-plugins": minor
---

**Breaking: the events `contact_page_url` var is replaced by `contact_page_id`.** The events timeline avatar, the timestamp and the @mentions in a note link to the contact page by page id, so they follow page paths and `basePath`.

- Set `contact_page_id` to the contact page's id, such as `contacts/view`. The id goes in the query as `contact_id_query_key` (default `_id`), in a path value named by `contact_id_path_key` when the page has a path like `contacts/{contact_id}`, or both.
- The events-timeline component takes the same three vars per call, and the `EventsTimeline` block takes `contactPageId`, `contactIdQueryKey` and `contactIdPathKey` in place of `contactPageUrl`.
- `note-capture` stores each @mention with a `#contact-<id>` href, and `EventsTimeline` turns it into a link to the contact page. The block renders event titles, descriptions and info as HTML links, so `data-page-id` links in them work. Notes saved before this change show their mentions unlinked.
