---
"@lowdefy/modules-mongodb-plugins": patch
"@lowdefy/modules-mongodb-workflows": patch
"@lowdefy/modules-mongodb-deals": patch
---

The workflow engine no longer lets a client payload rewrite what it doesn't own.

- A submit's `fields` can no longer set engine-owned action fields (`_id`, `status`, `workflow_id`, `type`, `key`, `action_group`, and the rest). Before, a user with edit access could forge a status to skip review, or retarget the write onto another action in their organization. Custom fields still pass through.
- Cancel and close `references` can no longer overwrite the workflow's parent links, title, key or display order.
- Under `policy: tenant`, no update can move a workflow or action into another organization: every update now re-stamps the organization field.
- The server takes a keyed action's key from the stored action, not from the request. This covers which form-data slot a submit merges into, which earlier files a resubmit may carry over, and the pre-hook check against redirecting the current action. The submit endpoint no longer accepts `current_key`, and the shipped pages no longer send it. Hook payloads still carry `current_key`, now always the action's real key.
- Request ids that go into a database filter (`workflow_id`, `action_id`, `group_id`, `parent_action_id`, `entity.id`, `entity.connection_id`, `reference_value`) must be plain values. An object such as `{ "$ne": null }` is rejected with `invalid_params` instead of being read as a query operator.
- The entity workflows read now prunes `form_data` to the actions the user can see, matching the two overview reads.
- The events timeline returns nothing for a null reference value, instead of every event that lacks the reference field. It also returns only the fields the timeline renders, so another app's display block (including its internal comments) and event metadata no longer reach the client.
- Editing an action's assignees or due date re-renders its card message again. The update-fields endpoint now carries the workflow's status map.
