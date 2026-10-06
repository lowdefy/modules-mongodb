---
"@lowdefy/modules-mongodb-workflows": minor
"@lowdefy/modules-mongodb-events": minor
"@lowdefy/modules-mongodb-deals": minor
"@lowdefy/modules-mongodb-plugins": minor
---

Workflow links can point at pages with Lowdefy page paths.

- A workflow's `entity:` block takes `id_path_key`, the entity page's path placeholder for the entity id (for a page at `deals/{deal_id}`, `id_path_key: deal_id`). The entity link then carries the id in `pathParams`, and `id_query_key` no longer defaults to `_id` (set it as well to pass the id in the query string too).
- `tracker.start_link` and the custom-kind `status_map` `link:` / `view_link:` cells take `pathParams` next to `urlQuery`, with the same `action_id: true` / `entity_id: true` sentinels and static string values.
- The overview and action-page breadcrumbs, the return to the entity after a terminal signal, the action-steps click on an entity page, the events timeline and the deal's open items pass a link's `pathParams`.

This needs a Lowdefy release with page path parameters.
