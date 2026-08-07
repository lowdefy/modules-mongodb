---
"@lowdefy/modules-mongodb-workflows": patch
---

Fix the shared `check-action-click` handler so clicking a check action in the workflow-progress / actions-on-entity panel on an action page no longer logs `Cannot read properties of undefined (reading 'methods')`. The handler always tried to open the fixed `check_action_modal` block, but that block is only dropped on entity-view pages — on action pages the CallMethod ran against a missing block and threw. The modal open is now gated on being on an entity page (detected via absence of `_url_query.action_id`); check clicks on action pages navigate instead.
