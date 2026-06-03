import buildHookPayload from "./utils/buildHookPayload.js";

/**
 * Step 2 of the SubmitWorkflowAction lifecycle: invoke the action's pre-hook.
 *
 * Resolves `params.hooks?.[interaction]?.pre` (any level undefined → return
 * null, no callApi). makeWorkflowApis (Part 13) wraps each emitted hook id
 * in string-form `_module.endpointId`, so the build resolves it to a
 * pre-scoped opaque string — the engine passes it to
 * `callApi({ endpointId, payload })` verbatim, never constructing prefixes
 * at runtime.
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
  return context.callApi({ endpointId: hookId, payload });
}

export default invokePreHook;
