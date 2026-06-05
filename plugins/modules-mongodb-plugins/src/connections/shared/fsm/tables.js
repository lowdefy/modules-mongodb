/**
 * Per-kind finite-state-machine tables. Transcribed verbatim from
 * `designs/workflows-module-concept/state-machine/design.md` ("FSM tables per
 * kind"). state-machine.md is authoritative — transcribe, don't invent.
 *
 * Shape: `FSM_TABLES[kind][currentStage][signal]` resolves to an entry that is
 * one of:
 *   - a string  — the direct target stage,
 *   - a function `({ action, actionConfig }) => stage` — the `submit`
 *     in-review/done split (the only function cell),
 *   - absent     — no-op for that (stage, signal) pair.
 *
 * The eight-status enum is fixed and engine-locked (Non-goals). `none` is a
 * transient resolution-time sentinel (the creation source state), never a
 * stored status.
 */

/**
 * Whether the action declares a `review` verb in any app's access block. This
 * is an action-global property — one action doc is shared across every app, so
 * whether a review step exists is the action's, not the submitting app's. Takes
 * no submitting-app argument (design D4 / state-machine.md).
 */
export function hasReview(actionConfig) {
  return Object.values(actionConfig?.access ?? {}).some(
    (appBlock) => appBlock != null && 'review' in appBlock,
  );
}

// The `submit` function cell: in-review iff the action declares a review verb,
// else done. Same rule for form and simple kinds.
const submitTarget = ({ actionConfig }) =>
  hasReview(actionConfig) ? 'in-review' : 'done';

// --- Form kind (inherited by `simple` via the alias below). -----------------
const form = {
  // Creation source state — only reachable via the upsert-spawn path (task 10).
  none: {
    request_changes: 'changes-required',
    error: 'error',
    activate: 'action-required',
    block: 'blocked',
  },
  blocked: {
    not_required: 'not-required',
    error: 'error',
    unblock: 'action-required',
    activate: 'action-required',
    internal_cancel_action: 'not-required',
  },
  'action-required': {
    submit: submitTarget,
    progress: 'in-progress',
    not_required: 'not-required',
    error: 'error',
    block: 'blocked',
    internal_cancel_action: 'not-required',
  },
  'in-progress': {
    submit: submitTarget,
    progress: 'in-progress',
    not_required: 'not-required',
    error: 'error',
    activate: 'action-required',
    block: 'blocked',
    internal_cancel_action: 'not-required',
  },
  'in-review': {
    not_required: 'not-required',
    approve: 'done',
    request_changes: 'changes-required',
    error: 'error',
    activate: 'action-required',
    block: 'blocked',
    internal_cancel_action: 'not-required',
  },
  'changes-required': {
    submit: submitTarget,
    not_required: 'not-required',
    error: 'error',
    activate: 'action-required',
    block: 'blocked',
    internal_cancel_action: 'not-required',
  },
  error: {
    not_required: 'not-required',
    resolve_error: 'in-review',
    activate: 'action-required',
    block: 'blocked',
    internal_cancel_action: 'not-required',
  },
  done: {
    submit: submitTarget,
    request_changes: 'changes-required',
    activate: 'action-required',
  },
  'not-required': {},
};

// --- Tracker kind. The `none` row carries only the birth signals `activate` /
// `block` — a pre-hook can conditionally spawn a tracker (state-machine.md
// "Creation"); the mirror/cancel signals never resolve from `none`. ----------
const tracker = {
  none: {
    activate: 'action-required',
    block: 'blocked',
  },
  blocked: {
    unblock: 'action-required',
    internal_mirror_child_active: 'in-progress',
    internal_mirror_child_completed: 'done',
    internal_mirror_child_cancelled: 'not-required',
    internal_cancel_action: 'not-required',
  },
  'action-required': {
    internal_mirror_child_active: 'in-progress',
    internal_mirror_child_completed: 'done',
    internal_mirror_child_cancelled: 'not-required',
    internal_cancel_action: 'not-required',
  },
  'in-progress': {
    internal_mirror_child_completed: 'done',
    internal_mirror_child_cancelled: 'not-required',
    internal_cancel_action: 'not-required',
  },
  done: {
    internal_mirror_child_active: 'in-progress',
    internal_mirror_child_cancelled: 'not-required',
  },
  'not-required': {
    internal_mirror_child_active: 'in-progress',
    internal_mirror_child_completed: 'done',
  },
};

export const FSM_TABLES = {
  form,
  tracker,
  // `simple` is IDENTICAL to form — aliased by object identity, never a copy,
  // so a future edit to `form` can't silently diverge from `simple`
  // (state-machine.md "Simple kind"; CLAUDE.md "One correct way").
  simple: form,
};

export default FSM_TABLES;
