---
"@lowdefy/modules-mongodb-workflows": patch
---

**Entity-context overview eyebrow** — the two workflow overview pages (`workflow-overview`, `workflow-group-overview`) now render an eyebrow that names the entity the workflow hangs off (`{type}: {name}`, e.g. "Company: Acme Corp") above the title, instead of the static "Workflow" label. Sourced from the `workflow.entity_link` on the overview responses via a shared `overview-entity-eyebrow` component, with a `title`-only fallback until the instance name resolves.
