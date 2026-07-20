// Shared signal constants for hook/event emission and validation.
//
// Used by makeWorkflowApis.js (emitter) and makeWorkflowsConfig.js (validator)
// so both resolvers stay in mechanical sync — the signal list is the single
// source of truth for which keys are legal in `hooks:` and `event:` blocks.
//
// Dev-rebuild cache note: the dev-rebuild cache-bust query applies only to the
// entry file. Edits to this shared module require a build restart in dev.

// Submit-time signal names. `submit` covers form/check direct submission;
// `progress` is the form pre-review step. The remaining four are
// review-outcome signals.
export const HOOK_SIGNALS = [
  "submit",
  "progress",
  "not_required",
  "resolve_error",
  "approve",
  "request_changes",
];

export const HOOK_PHASES = ["pre", "post"];

// Mirror signals fired against tracker actions when a child workflow reaches
// a terminal state. Only valid as event: keys on kind: tracker actions (D4).
export const MIRROR_SIGNALS = [
  "internal_mirror_child_active",
  "internal_mirror_child_completed",
  "internal_mirror_child_cancelled",
];

// Workflow-level lifecycle signals. Valid as keys in the workflow.event map
// (D8). Delivered via {type}-start/cancel/close endpoints (task 9).
export const LIFECYCLE_SIGNALS = ["started", "cancelled", "closed"];
