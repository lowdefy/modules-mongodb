# Submit Pipeline — Worked Example (Alternative: Pre / Post Hooks)

**Status: alternative shape, not committed.** This example sketches what `SubmitWorkflowAction` would look like with **two submit hooks** — a pre-submit hook (runs before engine writes; returns a transition spec) and a post-submit hook (runs after engine writes; does side effects). This is a possible extension of the submit-pipeline design, not what design.md or spec.md commit. The canonical single-hook (post-only) shape that matches design.md is in [example.md](example.md).

This file exists as a record of the pre/post exploration — useful if the submit-pipeline design is ever revisited with form-data-driven transition specs as a goal. The pre-hook's job is to translate form data into the engine's transition spec, which the canonical single-hook shape can't do (the hook fires after engine writes, so it can't influence the current submission's transitions).

**Scenario.** A `qualify` form action on an onboarding workflow. The form captures a `lead_status` field; if the user picks `not_interested`, downstream `send-quote` is marked `not-required` and `mark-not-interested` is set to `action-required`. If `qualified`, the reverse. The pre-submit hook computes the transition spec from form data; the post-submit hook does CRM sync conditionally.

## Action YAML

```yaml
# workflow_config/onboarding/qualify.yaml
type: qualify
kind: form
action_group: discovery
sort_order: 10
description: Confirm the lead's contact details and qualification status.
access:
  my-team-app: [view, edit]
  roles: [account-manager]
form:
  - { component: text_input, key: contact_name, required: true }
  - { component: text_area, key: notes }
  - component: selector
    key: lead_status
    required: true
    options: [qualified, not_interested]
submit:
  pre: lead-onboarding-qualify-pre-submit
  post: lead-onboarding-qualify-post-submit
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

## Pre-submit hook

```yaml
# workflow_config/onboarding/api/qualify-pre-submit.yaml
id: lead-onboarding-qualify-pre-submit
type: Api
routine:
  - :return:
      actions:
        _build.switch:
          on: { _payload: form_data.lead_status }
          cases:
            qualified:
              - { type: send-quote, status: action-required }
              - { type: mark-not-interested, status: not-required }
            not_interested:
              - { type: send-quote, status: not-required }
              - { type: mark-not-interested, status: action-required }
      entity_update:
        connection: leads-collection
        _id: { _payload: entity_id }
        update:
          $set:
            stage:
              _build.if:
                test:
                  _build.eq:
                    - { _payload: form_data.lead_status }
                    - qualified
                then: qualified
                else: not_interested
            qualified_at: { _date: now }
      event:
        type: qualify-submitted
        display:
          my-team-app:
            title:
              _nunjucks:
                template: "{{ form_data.contact_name }} marked {{ form_data.lead_status }}"
                on: { _payload: true }
        references:
          lead_ids: [{ _payload: entity_id }]
        metadata:
          lead_status: { _payload: form_data.lead_status }
```

## Post-submit hook

```yaml
# workflow_config/onboarding/api/qualify-post-submit.yaml
id: lead-onboarding-qualify-post-submit
type: Api
routine:
  - id: sync_crm
    type: CallApi
    skip:
      _ne:
        - { _payload: form_data.lead_status }
        - qualified
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

## Page submit call

```yaml
# In the generated form-action edit page
- id: submit
  type: CallApi
  endpointId:
    _module.endpointId: { id: submit-action, module: workflows }
  payload:
    action_id: { _state: action_id }
    current_type: qualify
    current_status: done
    form_data: { _state: form }
```

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
      form_data: { _payload: form_data }

  - :return:
      success: true
      action_ids: { _step: submit.action_ids }
      event_id: { _step: submit.event_id }
      pre_hook_response: { _step: submit.pre_hook_response }
      post_hook_response: { _step: submit.post_hook_response }
```

## Plugin handler

```js
// src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js
async function SubmitWorkflowAction({ request, connection, context }) {
  const ctx = await createMongoDBConnection(connection);
  const eventId = uuid();

  try {
    // 1. Validate payload + access
    const action = await getActionById(ctx, request.action_id);
    validateSubmitPayload(action, request);
    enforceAccess(action, context.user);

    // 2. Pre-submit hook (optional)
    let preHookResponse = null;
    let transitionSpec = {
      actions: [
        {
          type: request.current_type,
          status: request.current_status,
          fields: request.fields,
        },
      ],
    };

    if (action.submit?.pre) {
      preHookResponse = await context.callApi(action.submit.pre, {
        action_id: action._id,
        action_type: action.type,
        workflow_id: action.workflow_id,
        entity_id: action.entity_id,
        entity_collection: action.entity_collection,
        form_data: request.form_data,
        event_id: eventId,
      });
      transitionSpec = mergePreHookSpec(transitionSpec, preHookResponse);
      validateTransitionSpec(action, transitionSpec);
    }

    // 3. Engine writes core
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

    //    b. Write the action transitions, run unblocks, group recompute, etc.
    const actionIds = await writeActions(ctx, {
      currentActionId: action._id,
      actions: transitionSpec.actions,
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

    // 4. Built-in side effects
    if (transitionSpec.entity_update) {
      await writeEntityUpdate(ctx, transitionSpec.entity_update);
    }
    if (transitionSpec.event) {
      await context.callApi("events.new-event", {
        ...transitionSpec.event,
        _id: eventId,
      });
    }
    if (transitionSpec.event?.notifications) {
      await context.callApi("notifications.send-notification", {
        event_ids: [eventId],
      });
    }

    // 5. Post-submit hook (optional)
    let postHookResponse = null;
    if (action.submit?.post) {
      postHookResponse = await context.callApi(action.submit.post, {
        action_id: action._id,
        action_type: action.type,
        workflow_id: action.workflow_id,
        workflow_status: autoCompleted ? "completed" : "active",
        entity_id: action.entity_id,
        entity_collection: action.entity_collection,
        form_data: request.form_data,
        action_ids: actionIds,
        event_id: eventId,
        summary,
      });
    }

    // 6. Finalize
    return {
      success: true,
      action_ids: actionIds,
      event_id: eventId,
      pre_hook_response: preHookResponse,
      post_hook_response: postHookResponse,
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
  status: [{ stage: "active", created: { ... } }],
  summary: { done: 1, not_required: 1, total: 4 },
  form_data: {
    qualify: {
      contact_name: "Jane Doe",
      notes: "...",
      lead_status: "not_interested"
    }
    // future form-action submissions add more keys here:
    // send-quote: { ... }, etc.
  },
  // ...
}
```
