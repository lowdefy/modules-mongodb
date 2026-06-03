// entity_ref_key is the authoritative source (task 21 + task 12); the inline
// derivation below is a compat fallback for test fixtures that pre-date task 21
// and do not carry entity_ref_key on the workflow doc.
function deriveEntityRefKeyFallback(entityCollection) {
  const stripped = entityCollection.endsWith("-collection")
    ? entityCollection.slice(0, -"-collection".length)
    : entityCollection;
  return `${stripped.replace(/-/g, "_")}_ids`;
}

const DEFAULT_TITLE_TEMPLATE =
  "{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}";

/**
 * Assemble the default log-event payload (Part 9's four-layer merge layer 1 + 3).
 *
 * Pure function — no context, no I/O. Returns the unkeyed
 * `{ type, display, references, metadata }` shape per
 * designs/workflows-module-concept/submit-pipeline/spec.md § Default log event.
 *
 * Layer ordering for Part 9's event_overrides four-layer merge:
 *   1. Engine default                       ← this function (without comment)
 *   3. Runtime `comment` from params        ← this function folds it into metadata.comment
 *   2. YAML `event_overrides[interaction]`  ← mergeEventOverrides applies on top
 *   4. Pre-hook `event_overrides`           ← mergeEventOverrides applies last
 *
 * Layer 3 is intentionally folded into layer 1 here so a YAML override that
 * touches other metadata.* fields cannot clobber the user's comment. The
 * separate merge function (mergeEventOverrides.js) must NOT re-inject comment
 * — doing so would double-inject.
 *
 * @param {object} args
 * @param {object} args.workflow
 * @param {object} args.action
 * @param {object} args.actionConfig
 * @param {string} args.interaction
 * @param {string|null} args.current_key
 * @param {string|null} args.status_before
 * @param {string} args.status_after
 * @param {string} args.appName
 * @param {string|null} [args.comment] - user-supplied free-text comment; written to
 *   metadata.comment when a non-empty string; key omitted when falsy.
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
  comment,
}) {
  if (typeof appName !== "string" || appName.length === 0) {
    throw new Error(
      "buildDefaultLogEventPayload: appName is required (read from connection.app_name). " +
        "Apps must wire app_name on the workflows module entry — see designs/workflows-module/parts/08-side-effect-dispatch/design.md § app_name plumbing.",
    );
  }
  const refKey =
    workflow.entity_ref_key ??
    deriveEntityRefKeyFallback(workflow.entity_collection);

  const metadata = {
    action_type: action.type,
    workflow_type: workflow.workflow_type,
    interaction,
    current_key: current_key ?? null,
    status_before: status_before ?? null,
    status_after,
  };
  if (typeof comment === "string" && comment.length > 0) {
    metadata.comment = comment;
  }

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
    metadata,
  };
}

/**
 * Dispatch the log event for the just-completed submit.
 *
 * Accepts a fully-composed payload from the handler (Part 9 builds the
 * default via `buildDefaultLogEventPayload` and merges YAML + pre-hook
 * overrides on top via `mergeEventOverrides`). Passes `_id: context.eventId`
 * so the event doc's `_id` matches every action's `status[0].event_id`
 * (engine spec § Client and transaction model: "one id per invocation").
 *
 * Returns `context.eventId` — no round-trip dependency on `new-event`'s return.
 *
 * @param {object} context
 * @param {{ type: string, display: object, references: object, metadata: object }} payload
 * @returns {Promise<string>} eventId (= context.eventId)
 */
async function dispatchLogEvent(context, payload) {
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
