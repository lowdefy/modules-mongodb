import buildHookPayload from "./utils/buildHookPayload.js";

/**
 * Step 2 of the SubmitWorkflowAction lifecycle: invoke the action's pre-hook.
 *
 * Resolves `params.hooks?.[interaction]?.pre` (any level undefined → return
 * null, no callApi). Hook Apis are emitted under the workflows module entry
 * by makeWorkflowApis (Part 13), so dispatch uses the `{ id, module: 'workflows' }`
 * form — a bare string would dispatch into the consuming app's own-Api
 * namespace.
 *
 * No try/catch. Throws — both generic crashes and `:reject` (UserError with
 * isReject: true) — propagate transparently. Classification happens at the
 * wrapping per-action endpoint's `runRoutine` once the Part 29 upstream
 * tweak lands.
 *
 * @param {object} context - handler context (params, user, workflow, action, callApi)
 * @returns {Promise<any | null>} raw pre-hook response, or null when no pre-hook declared.
 */
async function invokePreHook(context) {
  const hookId = context.params?.hooks?.[context.params?.interaction]?.pre;
  if (!hookId) return null;

  const payload = buildHookPayload(context);
  return context.callApi({ id: hookId, module: "workflows" }, payload, {
    user: context.user,
  });
}

export default invokePreHook;
