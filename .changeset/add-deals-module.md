---
"@lowdefy/modules-mongodb-deals": minor
---

Add the **deals** module: a workflow-driven deal/opportunity workspace (list,
create, and a master-detail workspace) that orchestrates the workflows, events,
activities, files, companies, and contacts modules. The pipeline is a workflows
workflow selected via the `workflow_type` var; the `deals` collection is
host-app-owned and mapped in. Ships pages `all`/`new`/`view`, a create/update/
task/outcome API surface, a `deal-status-chip` component, and app-configurable
stages/outcomes/reasons/filters/card-fields plus main/info-grid/sidebar/card slots.
