import buildHookPayload from "./buildHookPayload.js";
import { WorkflowEngineError } from "../errors.js";

/**
 * Allowed keys on a PreHookResult `actions[]` entry (closed grammar, design D13).
 * Any key outside this set is a typo or a cross-workflow form (both invalid).
 */
const ALLOWED_ENTRY_KEYS = new Set([
  "type",
  "key",
  "action_id",
  "signal",
  "upsert",
  "fields",
  "metadata",
]);

/**
 * Normalise an absent or null key to `null` for comparison (today's
 * normalisePreHook rule: absent key → null).
 *
 * @param {string | null | undefined} key
 * @returns {string | null}
 */
function normaliseKey(key) {
  return key == null ? null : key;
}

/**
 * Determine whether a PreHookResult `actions[]` entry resolves to the
 * current (target) action — i.e. attempts a current-action signal redirect.
 *
 * An entry redirects the current action iff:
 *   - its `action_id` equals the target action's `_id`, OR
 *   - its `(type, key)` — key-normalised — equals the target action's
 *     `(type, current_key-normalised)`.
 *
 * A `{ type: <currentType>, key: <other> }` entry is a sibling keyed instance
 * (a legal auxiliary target) and must NOT be rejected.
 *
 * @param {object} entry - a PreHookResult actions entry
 * @param {object} targetAction - the loaded target action doc
 * @param {string | null} currentKey - normalised current_key from params
 * @returns {boolean}
 */
function resolvesToCurrentAction(entry, targetAction, currentKey) {
  if (entry.action_id != null) {
    return String(entry.action_id) === String(targetAction._id);
  }
  const entryKey = normaliseKey(entry.key);
  const targetKey = normaliseKey(currentKey);
  return entry.type === targetAction.type && entryKey === targetKey;
}

/**
 * Pre-hook phase wrapper (design D5).
 *
 * Resolves `params.hooks?.[params.signal]?.pre` — signal-keyed, matching the
 * emitted hooks map (task 19 re-keys by signal). The leaf is a plain async
 * `(payload) => result` function (workflows-sdk-split D2; the Lowdefy adapter
 * wraps each endpointId as such a function). Any level undefined / not a
 * function → return the empty result without invoking anything.
 *
 * No try/catch. Both generic crashes and a hook `:reject` (UserError with
 * isReject: true) propagate transparently to the caller.
 *
 * Response validation enforces the closed grammar (D13): unknown entry keys
 * throw `WorkflowEngineError` with `code: "invalid_prehook_response"`;
 * a current-action signal redirect throws with `code: "prehook_redirect"`.
 *
 * @param {import('./types.js').LoadedState} loadedState
 * @param {object} params - caller-supplied request params (signal, hooks, form, …)
 * @param {object} user - the authenticated user
 * @returns {Promise<import('./types.js').PreHookResult>}
 */
async function invokePreHook(loadedState, params, user) {
  const hookFn = params?.hooks?.[params?.signal]?.pre;

  if (typeof hookFn !== "function") {
    return { actions: [], event_overrides: {}, form_overrides: {} };
  }

  const { workflow, targetAction } = loadedState;
  const payload = buildHookPayload({
    params,
    workflow,
    action: targetAction,
    user,
  });

  const raw = await hookFn(payload);

  // Normalise null/undefined return (no-return hook) to empty result.
  if (raw == null) {
    return { actions: [], event_overrides: {}, form_overrides: {} };
  }

  const actions = raw.actions ?? [];
  const currentKey = normaliseKey(params.current_key ?? null);

  // Validate each entry in the response (closed grammar + redirect check).
  for (const entry of actions) {
    // Closed grammar: reject unknown keys (catches typos like `singal` and the
    // cross-workflow `workflow_id` form deleted from state-machine.md).
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_ENTRY_KEYS.has(key)) {
        throw new WorkflowEngineError(
          `invokePreHook: pre-hook response entry has unknown key "${key}". Allowed keys: ${[...ALLOWED_ENTRY_KEYS].join(", ")}.`,
          { code: "invalid_prehook_response" },
        );
      }
    }

    // No current-action signal redirect: the current action lands per the
    // signal the user fired (state-machine.md "How signals get emitted").
    if (
      targetAction &&
      resolvesToCurrentAction(entry, targetAction, currentKey)
    ) {
      throw new WorkflowEngineError(
        `invokePreHook: pre-hook attempted to redirect the current action (type: "${targetAction.type}", key: ${JSON.stringify(currentKey)}). Pre-hooks may only target auxiliary actions.`,
        { code: "prehook_redirect" },
      );
    }
  }

  return {
    actions,
    event_overrides: raw.event_overrides ?? {},
    form_overrides: raw.form_overrides ?? {},
  };
}

export default invokePreHook;
