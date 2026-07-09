import { createWorkflowsEngine } from "@lowdefy/mongodb-workflows-sdk";

/**
 * Lowdefy adapter for the workflows engine (workflows-sdk-split design).
 *
 * The engine lives in @lowdefy/mongodb-workflows-sdk and is framework-agnostic:
 * it takes semantic callbacks instead of Lowdefy's `callApi`, per-call
 * `{ user, stamp, audit }` instead of connection-evaluated properties, and
 * plain async functions as pre/post hooks instead of endpointId strings. This
 * adapter is the single place that maps a Lowdefy connection-request resolver
 * invocation (`lowdefyContext`) onto the SDK:
 *
 *   - `connection.endpoints.new_event`        → `callbacks.emitEvent`
 *   - `connection.endpoints.send_notification`→ `callbacks.sendNotification`
 *   - workflow config `entity.data_endpoint`  → `callbacks.resolveEntityData`
 *   - `request.hooks[actionType][signal].{pre,post}` endpointIds → functions
 *     wrapping `callApi({ endpointId, payload })`
 *   - `connection.user` / `connection.changeStamp` (evaluated per request by
 *     Lowdefy) → per-call `user` / `stamp`
 *   - `{ blockId, connectionId, pageId, requestId, request }` → the `audit`
 *     bag stamped onto change-log entries
 *
 * The remaining connection properties (databaseUri, collection names,
 * workflowsConfig, app_name, entry_id, changeLog, …) share the SDK's config
 * vocabulary and pass through verbatim. `createWorkflowsEngine` is cheap to
 * call per request — the SDK caches its pooled MongoClient by databaseUri.
 */

function makeCallbacks({ endpoints, workflowsConfig, callApi }) {
  const callbacks = {};
  // EventsTimeline's connection declares no endpoints — its read verb needs
  // no dispatch callbacks, so wire each only when the endpoint is configured.
  if (endpoints?.new_event) {
    callbacks.emitEvent = (eventDoc) =>
      callApi({ endpointId: endpoints.new_event, payload: eventDoc });
  }
  if (endpoints?.send_notification) {
    callbacks.sendNotification = (payload) =>
      callApi({ endpointId: endpoints.send_notification, payload });
  }
  // Entity data: the host's inline `entity.data` routine is generated into an
  // engine-only `{type}-entity-data` InternalApi; makeWorkflowsConfig carries
  // the resolved endpoint id on each workflow config's `entity.data_endpoint`.
  // The SDK calls this with { workflow_type, entity_id }; no endpoint declared
  // for the type → null (the SDK's existing graceful degrade).
  callbacks.resolveEntityData = async ({ workflow_type, entity_id }) => {
    const endpointId = (workflowsConfig ?? []).find(
      (w) => w.type === workflow_type,
    )?.entity?.data_endpoint;
    if (!endpointId) return null;
    return callApi({ endpointId, payload: { entity_id } });
  };
  return callbacks;
}

/**
 * Map the request's per-workflow hooks map — endpointId string leaves on
 * `hooks[actionType][signal].{pre,post}` (built by makeWorkflowApis via
 * `_module.endpointId`) — to the SDK's plain async hook functions.
 */
function wrapHookEndpoints(hooks, callApi) {
  if (hooks == null) return hooks;
  const wrapped = {};
  for (const [actionType, signals] of Object.entries(hooks)) {
    wrapped[actionType] = {};
    for (const [signal, leaf] of Object.entries(signals ?? {})) {
      wrapped[actionType][signal] = {};
      for (const phase of ["pre", "post"]) {
        const endpointId = leaf?.[phase];
        if (endpointId) {
          wrapped[actionType][signal][phase] = (payload) =>
            callApi({ endpointId, payload });
        }
      }
    }
  }
  return wrapped;
}

/**
 * Build one Lowdefy connection-request resolver delegating to an SDK engine
 * method. `meta` carries the resolver's checkRead/checkWrite flags (a Lowdefy
 * concern the SDK no longer knows about).
 *
 * @param {string} methodName — createWorkflowsEngine method (e.g. "startWorkflow")
 * @param {{ checkRead: boolean, checkWrite: boolean }} meta
 */
function makeWorkflowRequest(methodName, meta) {
  async function resolver(lowdefyContext) {
    const {
      request = {},
      connection = {},
      callApi,
      blockId,
      connectionId,
      pageId,
      requestId,
    } = lowdefyContext;
    // Split off what becomes per-call input or callbacks; the rest of the
    // connection IS the SDK config (shared vocabulary). `read`/`write` are
    // Lowdefy connection-level flags; `actionsEnum` is display-only config the
    // engine never reads — both are dropped from the SDK config.
    const { endpoints, user, changeStamp, actionsEnum, read, write, ...config } =
      connection;

    const engine = createWorkflowsEngine({
      ...config,
      callbacks: makeCallbacks({
        endpoints,
        workflowsConfig: connection.workflowsConfig,
        callApi,
      }),
    });

    const params = request.hooks
      ? { ...request, hooks: wrapHookEndpoints(request.hooks, callApi) }
      : request;

    return engine[methodName](params, {
      user,
      stamp: changeStamp,
      audit: { blockId, connectionId, pageId, requestId, payload: request },
    });
  }

  resolver.schema = {};
  resolver.meta = meta;
  return resolver;
}

export default makeWorkflowRequest;
