// Shared signal constants for hook/event emission and validation.
//
// Used by makeWorkflowApis.js (emitter) and makeWorkflowsConfig.js (validator)
// so both resolvers stay in mechanical sync — the signal list is the single
// source of truth for which keys are legal in `hooks:` and `event:` blocks.
//
// Dev-rebuild cache note: the dev-rebuild cache-bust query applies only to the
// entry file. Edits to this shared module require a build restart in dev.

// Submit-time signal names. `submit` covers form/simple direct submission;
// `progress` is the form pre-review step (task 12). The remaining four are
// review-outcome signals (D12 rename from old interaction names).
export const HOOK_SIGNALS = [
  'submit',
  'progress',
  'not_required',
  'resolve_error',
  'approve',
  'request_changes',
];

export const HOOK_PHASES = ['pre', 'post'];
