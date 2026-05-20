import deriveEntityRefKey from "./utils/deriveEntityRefKey.js";

const DEFAULT_TITLE_TEMPLATE =
  "{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}";

/**
 * Assemble the default log-event payload.
 *
 * Pure function — no context, no I/O. Returns the unkeyed
 * `{ type, display, references, metadata }` shape per
 * designs/workflows-module-concept/submit-pipeline/spec.md § Default log event.
 *
 * Part 9 imports this as the bottom layer of its three-layer event_overrides
 * merge (engine default < YAML override < pre-hook override).
 *
 * @param {object} args
 * @param {object} args.workflow         - context.workflow (has _id, workflow_type, entity_id, entity_collection)
 * @param {object} args.action           - context.action (has _id, type, key)
 * @param {object} args.actionConfig     - context.actionConfig (kind, access, etc.)
 * @param {string} args.interaction      - one of submit_edit | not_required | resolve_error | approve | request_changes
 * @param {string|null} args.current_key - per-submit key or null for non-keyed
 * @param {string|null} args.status_before - pre-step-4 action.status[0].stage
 * @param {string} args.status_after     - engine-resolved targetStatus
 * @param {string} args.appName - connection.app_name (required; throws if missing)
 * @returns {{ type: string, display: object, references: object, metadata: object }}
 */
export function buildDefaultLogEventPayload({
  workflow,
  action,
  // actionConfig reserved for Part 9's three-layer merge; unused in default
  // eslint-disable-next-line no-unused-vars
  actionConfig,
  interaction,
  current_key,
  status_before,
  status_after,
  appName,
}) {
  if (typeof appName !== "string" || appName.length === 0) {
    throw new Error(
      "buildDefaultLogEventPayload: appName is required (read from connection.app_name). " +
        "Apps must wire app_name on the workflows module entry — see designs/workflows-module/parts/08-side-effect-dispatch/design.md § app_name plumbing.",
    );
  }
  const refKey = deriveEntityRefKey(workflow.entity_collection);

  return {
    type: `action-${interaction}`,
    display: {
      [appName]: {
        title: {
          _nunjucks: {
            template: DEFAULT_TITLE_TEMPLATE,
            on: { user: true, action_type: true, status_after: true },
          },
        },
      },
    },
    references: {
      workflow_ids: [workflow._id],
      action_ids: [action._id],
      [refKey]: [workflow.entity_id],
    },
    metadata: {
      action_type: action.type,
      workflow_type: workflow.workflow_type,
      interaction,
      current_key: current_key ?? null,
      status_before: status_before ?? null,
      status_after,
    },
  };
}

/**
 * Dispatch the default log event for the just-completed submit.
 *
 * Builds the default payload via `buildDefaultLogEventPayload`, passes
 * `_id: context.eventId` so the event doc's `_id` matches every action's
 * `status[0].event_id` (engine spec § Client and transaction model:
 * "one id per invocation"). Fires `context.callApi` to the events module's
 * `new-event` Api.
 *
 * Returns `context.eventId` for the response payload — no round-trip
 * dependency on `new-event`'s return.
 *
 * @param {object} context - handler context (must carry workflow, action,
 *   actionConfig, user, eventId, connection, callApi)
 * @param {object} inputBag - log-event inputs captured at step 1 of handleSubmit:
 *   { interaction, current_key, status_before, status_after }
 * @returns {Promise<string>} eventId (= context.eventId)
 */
async function dispatchLogEvent(context, inputBag) {
  const payload = buildDefaultLogEventPayload({
    workflow: context.workflow,
    action: context.action,
    actionConfig: context.actionConfig,
    interaction: inputBag.interaction,
    current_key: inputBag.current_key,
    status_before: inputBag.status_before,
    status_after: inputBag.status_after,
    appName: context.connection?.app_name,
  });

  const result = await context.callApi(
    { id: "new-event", module: "events" },
    { _id: context.eventId, ...payload },
    { user: context.user },
  );

  if (!result.success) {
    const err = new Error(
      `dispatchLogEvent: new-event failed: ${result.error?.message ?? "unknown"}`,
    );
    err.cause = result.error;
    err.step = "dispatch-log-event";
    throw err;
  }

  return context.eventId;
}

export default dispatchLogEvent;
