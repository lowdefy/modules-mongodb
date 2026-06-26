/**
 * Server-side verb/link/button policy (Part 46 task 2).
 *
 * Consolidates the logic that was previously split across four surfaces:
 *   - `modules/shared/workflow/visible_verbs.yaml` (MongoDB $addFields stage)
 *   - `modules/shared/workflow/resolve_action_link.yaml` (MongoDB $addFields stage)
 *   - `modules/workflows/components/action_role_check.yaml` (client _js mirror)
 *   - `modules/workflows/enums/button_signal_sources.yaml` (source-stage table)
 *
 * Exports:
 *   - `computeAllowed`   — four-key `{ view, edit, review, error }` access bag
 *   - `collapseLink`     — highest-priority accessible link (edit > review > error > view)
 *   - `resolveButtons`   — six-key button visibility map based on stage + access
 */

import { gateAllows, SIGNAL_VERBS } from "../phases/loadWorkflowState.js";

export { gateAllows };

/**
 * Source-stages for each of the six user-facing button signals. A faithful
 * inversion of `FSM_TABLES.form` (../fsm/tables.js) restricted to the six
 * user-initiated signals — internal signals (`activate`, `block`,
 * `internal_mirror_*`) are intentionally absent, and the transient `none`
 * sentinel stage is excluded. Guarded against FSM drift by the consistency
 * suite in resolveActionAccess.test.js (set equality per signal).
 */
export const BUTTON_SIGNAL_SOURCES = {
  submit: ["action-required", "in-progress", "changes-required", "done"],
  progress: ["action-required", "in-progress"],
  not_required: [
    "action-required",
    "in-progress",
    "changes-required",
    "blocked",
    "in-review",
    "error",
  ],
  approve: ["in-review"],
  request_changes: ["in-review", "done"],
  resolve_error: ["error"],
};

/**
 * Compute the four-key allowed bag for one action/app combination.
 *
 * Ported from `visible_verbs.yaml` and `action_role_check.yaml`
 * (`computeActionAllowed`). For each verb, applies `gateAllows` against the
 * gate value in `access[app_name][verb]` and the user's role array.
 *
 * @param {{ access?: object, app_name: string, userRoles?: string[] }}
 * @returns {{ view: boolean, edit: boolean, review: boolean, error: boolean }}
 */
export function computeAllowed({ access, app_name, userRoles }) {
  const appAccess = (access && access[app_name]) || {};
  const roles = Array.isArray(userRoles) ? userRoles : [];
  return {
    view: gateAllows(appAccess.view, roles),
    edit: gateAllows(appAccess.edit, roles),
    review: gateAllows(appAccess.review, roles),
    error: gateAllows(appAccess.error, roles),
  };
}

/**
 * Collapse the per-verb links map to the single link a surface renders.
 *
 * Ported from `resolve_action_link.yaml`'s `$switch`. Returns the link for the
 * highest-priority verb whose cell is BOTH non-null (state) AND truthy in
 * `allowed` (access). Priority: edit > review > error > view. Returns `null`
 * when no verb qualifies.
 *
 * @param {{ links: { view, edit, review, error } | null | undefined, allowed: { view: boolean, edit: boolean, review: boolean, error: boolean } }}
 * @returns {object | null}
 */
export function collapseLink({ links, allowed }) {
  if (!links) return null;
  if (allowed.edit && links.edit != null) return links.edit;
  if (allowed.review && links.review != null) return links.review;
  if (allowed.error && links.error != null) return links.error;
  if (allowed.view && links.view != null) return links.view;
  return null;
}

/**
 * Resolve button visibility for the six user-facing signals.
 *
 * For each signal, a button is visible (true) only when ALL of:
 *   1. The action's current `stage` is in that signal's source-stage list.
 *   2. `allowed` is true for at least one of `SIGNAL_VERBS[signal]` (Part 49:
 *      `request_changes` accepts `view`, `edit`, or `review`).
 *   3. For `not_required` only: `allow_not_required === true`.
 *
 * Internal signals (`activate`, `block`, `internal_mirror_*`) never appear in
 * the output — only the six user-facing signals are keyed here.
 *
 * @param {{ actionConfig?: object, stage?: string, allowed: { view: boolean, edit: boolean, review: boolean, error: boolean }, allow_not_required?: boolean }}
 * @returns {{ submit: boolean, approve: boolean, request_changes: boolean, resolve_error: boolean, progress: boolean, not_required: boolean }}
 */
export function resolveButtons({ stage, allowed, allow_not_required }) {
  const result = {};
  for (const signal of Object.keys(BUTTON_SIGNAL_SOURCES)) {
    const sources = BUTTON_SIGNAL_SOURCES[signal];
    const verbs = SIGNAL_VERBS[signal];
    let visible =
      sources.includes(stage) && verbs.some((verb) => allowed[verb]);
    if (signal === "not_required") {
      visible = visible && allow_not_required === true;
    }
    result[signal] = Boolean(visible);
  }
  return result;
}
