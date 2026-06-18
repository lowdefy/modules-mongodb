---
"@lowdefy/modules-mongodb-activities": patch
---

Activities list: stop scoping the table via url-query params, and fix free-text search over the rich-text description.

- The list page (`pages/all.yaml`) no longer hydrates `contact_id` / `company_id` from `_url_query`. The page renders no visible entity (contact/company/deal) filter control, so url-driven scoping produced a silently filtered, uncloseable table — and the `activities-timeline` "View all" link, when mounted on a deal (`reference_field: deal_ids`), passed neither branch so both resolved to `null`. "View all" now navigates to the full list with a clean url; the entity-scoped subset is already shown in the timeline tile itself.
- `get_activities.yaml` still honours `state.filter.contact_id` / `company_id` as a request-side extension point for consumers that add their own *visible* picker via `components.filters`; only the hidden url hydration is removed.
- `get_activities.yaml` free-text search now targets `description.text` instead of `description`. The description field is Tiptap rich text stored as `{ html, text }`, so the previous path against the object never matched; searching the plain-text subpath (not the html markup) keeps results free of tag noise.
