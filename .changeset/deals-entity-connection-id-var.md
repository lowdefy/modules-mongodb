---
"@lowdefy/modules-mongodb-deals": minor
---

Add an `entity_connection_id` var (default `deals`) replacing the hardcoded
`deals` literal everywhere the module matches or passes a workflow doc's
`entity.connection_id` — the list/detail aggregations (get_selected_deal,
get_active_deals, get_deals_list, get_selected_deal_open_actions), the outcome
modal's get-entity-workflows refetch, the deal view and compact list-item
get-entity-workflows payloads, and the `entity_connection_id` passed to the
embedded `actions-on-entity` component. Lets a host map its deals collection
under any connection id, as long as it matches the workflow config's
`entity.connection_id`.
