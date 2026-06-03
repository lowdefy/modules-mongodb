import buildHookPayload from './buildHookPayload.js';
import { WorkflowEngineError } from '../errors.js';

/**
 * Allowed keys on a PreHookResult `actions[]` entry (closed grammar, design D13).
 * Any key outside this set is a typo or a cross-workflow form (both invalid).
 */
const ALLOWED_ENTRY_KEYS = new Set([
  'type',
  'key',
  'action_id',
  'signal',
  'upsert',
  'fields',
  'metadata',
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
 * emitted hooks map (task 19 re-keys by signal). Any level undefined → return
 * the empty result without calling callApi.
 *
 * Shipped callApi contract: `context.callApi({ endpointId, payload })`.
 * The hook id arrives pre-scoped from `params.hooks` (build-resolved
 * `_module.endpointId`) and is passed verbatim — no prefix construction, no
 * `{ id, module }` object, no third `{ user }` argument.
 *
 * No try/catch. Both generic crashes and a hook `:reject` (UserError with
 * isReject: true) propagate transparently to the wrapping per-action
 * endpoint's `runRoutine`.
 *
 * Response validation enforces the closed grammar (D13): unknown entry keys
 * throw `WorkflowEngineError` with `code: "invalid_prehook_response"`;
 * a current-action signal redirect throws with `code: "prehook_redirect"`.
 *
 * @param {import('./types.js').LoadedState} loadedState
 * @param {object} params - caller-supplied request params (signal, hooks, form, …)
 * @param {object} user - the authenticated user
 * @param {Function} callApi - `context.callApi`
 * @returns {Promise<import('./types.js').PreHookResult>}
 */
async function invokePreHook(loadedState, params, user, callApi) {
  const hookId = params?.hooks?.[params?.signal]?.pre;

  if (!hookId) {
    return { actions: [], event_overrides: {}, form_overrides: {} };
  }

  const { workflow, targetAction } = loadedState;
  const payload = buildHookPayload({
    params,
    workflow,
    action: targetAction,
    user,
  });

  const raw = await callApi({ endpointId: hookId, payload });

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
          `invokePreHook: pre-hook response entry has unknown key "${key}". Allowed keys: ${[...ALLOWED_ENTRY_KEYS].join(', ')}.`,
          { code: 'invalid_prehook_response' },
        );
      }
    }

    // No current-action signal redirect: the current action lands per the
    // signal the user fired (state-machine.md "How signals get emitted").
    if (targetAction && resolvesToCurrentAction(entry, targetAction, currentKey)) {
      throw new WorkflowEngineError(
        `invokePreHook: pre-hook attempted to redirect the current action (type: "${targetAction.type}", key: ${JSON.stringify(currentKey)}). Pre-hooks may only target auxiliary actions.`,
        { code: 'prehook_redirect' },
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
