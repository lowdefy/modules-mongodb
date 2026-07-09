import createContext from "./shared/phases/createContext.js";
import { WorkflowEngineError } from "./shared/errors.js";

import StartWorkflow from "./handlers/StartWorkflow/StartWorkflow.js";
import CancelWorkflow from "./handlers/CancelWorkflow/CancelWorkflow.js";
import CloseWorkflow from "./handlers/CloseWorkflow/CloseWorkflow.js";
import handleSubmit from "./handlers/SubmitWorkflowAction/handleSubmit.js";
import UpdateActionFields from "./handlers/UpdateActionFields/UpdateActionFields.js";
import GetEntityWorkflows from "./handlers/GetEntityWorkflows/GetEntityWorkflows.js";
import GetWorkflowOverview from "./handlers/GetWorkflowOverview/GetWorkflowOverview.js";
import GetWorkflowActionGroupOverview from "./handlers/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js";
import GetWorkflowAction from "./handlers/GetWorkflowAction/GetWorkflowAction.js";
import GetEventsTimeline from "./handlers/GetEventsTimeline/GetEventsTimeline.js";

/**
 * The workflows engine facade (workflows-sdk-split design).
 *
 * `createWorkflowsEngine(config)` binds the instance config — connection-schema
 * vocabulary (databaseUri, databaseName, collection names, workflowsConfig,
 * app_name, entry_id, changeLog, …) plus `callbacks` and `logger` — and returns
 * the engine's verb surface. Each method is
 * `(params, { user, stamp, audit } = {}) => Promise<result>`:
 *
 *   - `params` — the request params the handler consumes (`context.params`).
 *   - `user`   — the authenticated user (access gate + event author).
 *   - `stamp`  — the per-invocation change stamp; becomes `context.now`.
 *     `{ timestamp, user }` by convention — only `timestamp` is enforced.
 *   - `audit`  — opaque request-context bag stamped onto change-log entries.
 *
 * Callbacks (instance config, design D2):
 *   - `emitEvent(eventDoc)` — required for write verbs; persists the
 *     per-invocation event doc.
 *   - `sendNotification({ event_ids })` — optional; absent → silent no-op.
 *   - `resolveEntityData({ workflow_type, entity_id })` — optional; absent →
 *     entity data degrades to null.
 *
 * Pre/post hooks are per-call: plain async `(payload) => result` functions on
 * the leaves of `params.hooks[actionType][signal].{pre,post}`.
 *
 * Write verbs are guarded here — once, for all of them (design D4): a missing
 * `stamp.timestamp` would commit docs with an undefined CAS anchor, and a
 * missing `emitEvent` would silently drop the invocation's event. Reads have
 * no such gate.
 */

function assertWritePreconditions(config, stamp, methodName) {
  if (stamp?.timestamp == null) {
    throw new WorkflowEngineError(
      `${methodName}: stamp.timestamp is required on write calls — pass { stamp: { timestamp, user } } as the per-call input.`,
      { code: "invalid_params" },
    );
  }
  if (typeof config.callbacks?.emitEvent !== "function") {
    throw new WorkflowEngineError(
      `${methodName}: callbacks.emitEvent is required for write calls — the engine emits exactly one event per invocation and has nowhere to send it.`,
      { code: "missing_callback" },
    );
  }
}

function createWorkflowsEngine(config) {
  const call = (handler) => async (params, perCall) => {
    const context = await createContext(config, { ...perCall, params });
    return handler(context);
  };

  const writeCall = (handler, methodName) => {
    const run = call(handler);
    return async (params, perCall) => {
      assertWritePreconditions(config, perCall?.stamp, methodName);
      return run(params, perCall);
    };
  };

  return {
    startWorkflow: writeCall(StartWorkflow, "startWorkflow"),
    submitAction: writeCall(handleSubmit, "submitAction"),
    cancelWorkflow: writeCall(CancelWorkflow, "cancelWorkflow"),
    closeWorkflow: writeCall(CloseWorkflow, "closeWorkflow"),
    updateActionFields: writeCall(UpdateActionFields, "updateActionFields"),
    getEntityWorkflows: call(GetEntityWorkflows),
    getWorkflowOverview: call(GetWorkflowOverview),
    getWorkflowActionGroupOverview: call(GetWorkflowActionGroupOverview),
    getWorkflowAction: call(GetWorkflowAction),
    getEventsTimeline: call(GetEventsTimeline),
  };
}

export default createWorkflowsEngine;
