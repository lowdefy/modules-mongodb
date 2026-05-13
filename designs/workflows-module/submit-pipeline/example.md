# Submit Pipeline — Worked Example

Concrete example of the `SubmitWorkflowAction` shape committed in [design.md](design.md) / [spec.md](spec.md). Single optional post-submit hook fired by the plugin handler after engine writes. Companion code only — full rationale lives in design.md.

For an alternative shape with both a pre and post hook (not committed), see [example-pre-post-hooks.md](example-pre-post-hooks.md).

**Scenario.** A `qualify` form action on an onboarding workflow. The form captures contact details + qualification notes; on submit the engine transitions `qualify` to `done`, unblocks `send-quote`, writes an entity-stage update on the lead, logs the qualification event, and the optional submit hook then syncs the lead's record to an external CRM. Static unblock list (always the same regardless of form input) comes from the page payload; the hook does the app-specific CRM sync.

## Action YAML

```yaml
# workflow_config/onboarding/qualify.yaml
type: qualify
kind: form
action_group: discovery
sort_order: 10
description: Confirm the lead's contact details and capture qualification notes.
access:
  my-team-app: [view, edit]
  roles: [account-manager]
form:
  - { component: text_input, key: contact_name, required: true }
  - { component: text_area, key: notes }
submit_hook: lead-onboarding-qualify-on-submit # optional; endpoint id
status_map:
  action-required:
    my-team-app:
      message: Qualify the lead
      link:
        pageId:
          _module.pageId: { id: onboarding-qualify-edit, module: workflows }
        urlQuery: { action_id: true }
  done:
    my-team-app: { message: Lead qualified }
```

## Submit hook (app-side Api)

```yaml
# workflow_config/onboarding/api/qualify-on-submit.yaml
id: lead-onboarding-qualify-on-submit
type: Api
routine:
  # Sync the lead's CRM record with the qualification notes.
  - id: sync_crm
    type: CallApi
    properties:
      endpointId:
        _module.endpointId: { id: push-lead, module: crm-sync }
      payload:
        lead_id: { _payload: entity_id }
        notes: { _payload: form_data.notes }
        qualified_at: { _date: now }

  - :return:
      success: true
      crm_id: { _step: sync_crm.crm_id }
```

The hook receives `action_id`, `action_type`, `current_status`, `workflow_id`, `workflow_type`, `entity_type`, `entity_id`, `form_data`, `event_id`, `action_ids`, `summary`, `workflow_status` from the engine (see [spec.md "Submit hook payload contract"](spec.md#submit-hook-payload-contract)). The engine has already written `qualify.status = done`, unblocked `send-quote`, written the entity stage update, and logged the qualification event — the hook just does the CRM sync.

## Page submit call

```yaml
# In the generated form-action edit page (e.g. workflows/onboarding-qualify-edit)
- id: submit
  type: CallApi
  endpointId:
    _module.endpointId: { id: submit-action, module: workflows }
  payload:
    action_id: { _state: action_id }
    current_type: qualify
    current_status: done
    form_data: { _state: form }
    unblocks:
      - { type: send-quote, status: action-required }
    entity_update:
      connection: leads-collection
      _id: { _state: entity_id }
      update:
        $set:
          stage: qualified
          qualified_at: { _date: now }
    event:
      type: qualify-submitted
      display:
        my-team-app:
          title:
            _nunjucks:
              template: "{{ form.contact_name }} qualified"
              on: { _state: true }
      references:
        lead_ids: [{ _state: entity_id }]
      notifications: true
```

The page builds the full transition spec (unblocks, entity_update, event) because the post-only hook can't influence the engine writes. The page is the source of truth for what the engine writes; the hook is purely a side-effects extension point.

## Module's `submit-action` Api (thin wrapper)

```yaml
# modules/workflows/api/submit-action.yaml
id: submit-action
type: Api
routine:
  - id: submit
    type: SubmitWorkflowAction
    connectionId:
      _module.connectionId: workflow-api
    properties:
      action_id: { _payload: action_id }
      current_type: { _payload: current_type }
      current_status: { _payload: current_status }
      fields: { _payload: fields }
      form_data: { _payload: form_data }
      unblocks: { _payload: unblocks }
      entity_update: { _payload: entity_update }
      event: { _payload: event }

  - :return:
      success: true
      action_ids: { _step: submit.action_ids }
      event_id: { _step: submit.event_id }
      hook_response: { _step: submit.hook_response }
```

One step, one return. All orchestration happens inside the plugin handler.

## Plugin handler

```js
// src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js
async function SubmitWorkflowAction({ request, connection, context }) {
  const ctx = await createMongoDBConnection(connection);
  const eventId = uuid();

  try {
    // 1. Validate
    const action = await getActionById(ctx, request.action_id);
    validateSubmitPayload(action, request);
    enforceAccess(action, context.user);

    // 2. Engine writes core
    //    a. Write the submitted form_data onto the workflow doc, keyed by action type.
    //       Merges into workflows.form_data.{current_type}; preserves form_data for
    //       other actions; uses dot-notation $set so concurrent action submissions
    //       on the same workflow don't trample each other.
    if (request.form_data) {
      await ctx.workflowsCollection.updateOne(
        { _id: action.workflow_id },
        { $set: { [`form_data.${request.current_type}`]: request.form_data } },
      );
    }

    //    b. Write the action transitions (current action + unblocks from payload),
    //       run group recompute + blocked_by re-evaluation, auto-complete, tracker
    //       subscription, summary writeback.
    const actionIds = await writeActions(ctx, {
      currentActionId: action._id,
      actions: [
        {
          type: request.current_type,
          status: request.current_status,
          fields: request.fields,
        },
        ...(request.unblocks ?? []),
      ],
      eventId,
    });
    await recomputeGroupsAndUnblock(ctx, action.workflow_id);
    const autoCompleted = await autoCompleteCheck(
      ctx,
      action.workflow_id,
      eventId,
    );
    if (autoCompleted)
      await fireTrackerSubscription(ctx, action.workflow_id, eventId);
    const summary = await recomputeSummary(ctx, action.workflow_id);

    // 3. Built-in side effects (from payload)
    if (request.entity_update) {
      await writeEntityUpdate(ctx, request.entity_update);
    }
    if (request.event) {
      await context.callApi("events.new-event", {
        ...request.event,
        _id: eventId,
      });
    }
    if (request.event?.notifications) {
      await context.callApi("notifications.send-notification", {
        event_ids: [eventId],
      });
    }

    // 4. Invoke user submit hook (optional)
    let hookResponse = null;
    if (action.submit_hook) {
      hookResponse = await context.callApi(action.submit_hook, {
        action_id: action._id,
        action_type: action.type,
        current_status: request.current_status,
        workflow_id: action.workflow_id,
        workflow_type: action.workflow_type,
        workflow_status: autoCompleted ? "completed" : "active",
        entity_type: action.entity_type,
        entity_id: action.entity_id,
        form_data: request.form_data,
        event_id: eventId,
        action_ids: actionIds,
        summary,
      });
    }

    // 5. Finalize
    return {
      success: true,
      action_ids: actionIds,
      event_id: eventId,
      hook_response: hookResponse,
    };
  } finally {
    await ctx.client.close();
  }
}
```

## Resulting workflow doc

```js
{
  _id: "...",
  workflow_type: "onboarding",
  entity_type: "lead",
  entity_id: "...",
  entity_collection: "leads-collection",
  status: [{ stage: "active", created: { ... } }],
  summary: { done: 1, not_required: 0, total: 4 },
  form_data: {
    qualify: {
      contact_name: "Jane Doe",
      notes: "..."
    }
    // future form-action submissions add more keys here:
    // send-quote: { ... }, etc.
  },
  // ...
}
```
