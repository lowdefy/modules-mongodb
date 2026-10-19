# Task 2: Port the verb/access, link-collapse, and button policy into plugin JS

## Context

The verb/link/button policy is today re-implemented across **four** surfaces:

- `modules/shared/workflow/visible_verbs.yaml` — the four-key `{ view, edit,
review, error }` access bag, computed in a MongoDB `$addFields` stage.
- `modules/shared/workflow/resolve_action_link.yaml` — the
  `edit > review > error > view` collapse of the per-verb `links` map to a single
  `link` (a `$switch`).
- `modules/shared/workflow/timeline_action_lookup.yaml` — composes both for the
  events timeline.
- `modules/workflows/components/action_role_check.yaml` — a client `_js` mirror
  of `evaluateVerbGate.js` that writes `_state.action_allowed`.

The engine plugin today has only the per-gate primitive `gateAllows`
(`plugins/.../shared/phases/loadWorkflowState.js:28`) and `computeEngineLinks`
(`plugins/.../shared/render/computeEngineLinks.js`, which builds the per-verb
link **map**, not the collapse).

This task **ports** the missing pieces into new plugin JS so all five read
methods (tasks 4–6) and the submit gate share one implementation (D2/D5). It
adds **no** consumers yet — those come in tasks 4–6.

The button policy (D5 layer 1) is the AND of three read-time-knowable
dimensions:

1. **FSM source-stage** — a signal shows only from a stage it can fire from. The
   authoritative table is `modules/workflows/enums/button_signal_sources.yaml`
   (already restricted to the six user signals: `submit`, `progress`,
   `not_required`, `approve`, `request_changes`, `resolve_error`). Reading this
   table server-side sidesteps the hazard of inverting `FSM_TABLES` and
   accidentally surfacing internal signals (`activate`, `block`,
   `internal_mirror_*`). **Bring this six-signal source-stage map into the plugin**
   (a JS constant in the new module, faithfully copied from the enum — or read the
   enum; implementer's choice, but keep it restricted to the six).
2. **Per-verb role gate** — `allowed[verb]` for the signal's required verb. The
   verb-per-signal map is `SIGNAL_VERBS` in `loadWorkflowState.js`:
   `{ submit: edit, progress: edit, not_required: edit, resolve_error: error,
approve: review, request_changes: review }`.
3. **`allow_not_required`** — for the `not_required` signal only, read from the
   action's validated config (added in task 3; default `false`).

## Task

Create a new plugin module (suggested:
`plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.js`,
beside `computeEngineLinks.js`) exporting:

1. **`computeAllowed({ access, app_name, userRoles })`** → `{ view, edit, review,
error }`. Ported from `visible_verbs.yaml` / `action_role_check.yaml`'s
   `computeActionAllowed`: for each verb, `gateAllows(access?.[app_name]?.[verb],
userRoles)`. Reuse the existing `gateAllows` semantics (`true` → pass; array ∩
   roles ≠ ∅ → pass; else fail-closed). Import or re-export the canonical
   `gateAllows` from `loadWorkflowState.js` rather than re-defining it.

2. **`collapseLink({ links, allowed })`** → a single link object or `null`.
   Ported from `resolve_action_link.yaml`: highest-priority verb whose cell is
   BOTH non-null (state) AND truthy in `allowed` (access), priority
   `edit > review > error > view`; else `null`. `links` is the per-verb map
   `computeEngineLinks` produces for the current app slug
   (`action[app_name].links`).

3. **`resolveButtons({ actionConfig, stage, allowed, allow_not_required })`** →
   `{ submit, approve, request_changes, resolve_error, progress, not_required }`
   of booleans (D5 layer 1). For each of the six signals:
   - `false` unless `stage` is in that signal's source-stage list.
   - AND `allowed[SIGNAL_VERBS[signal]]`.
   - For `not_required` only, additionally AND `allow_not_required === true`.

Add unit tests (`resolveActionAccess.test.js`) covering all three exports.
`computeAllowed` and the gate semantics **must** be tested against the shared
oracle `modules/workflows/resolvers/__fixtures__/gates.fixtures.js`
(the existing `evaluateVerbGate.test.js` and `visible_verbs_filter.test.js` use
it) so the ported logic provably matches the retired YAML/client runtimes.

## Acceptance Criteria

- `computeAllowed` produces the same four-key bag as `visible_verbs.yaml` for
  every case in `gates.fixtures.js`.
- `collapseLink` reproduces `resolve_action_link.yaml`'s `$switch` priority and
  null-handling.
- `resolveButtons` returns `false` for a signal fired from a non-source stage,
  `false` when the verb gate denies, and gates `not_required` on
  `allow_not_required`. Internal signals (`activate`, `block`, `internal_mirror_*`)
  never appear in the output.
- New unit tests pass; `pnpm --filter @lowdefy/modules-mongodb-plugins test`
  green.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.js` — create — `computeAllowed`, `collapseLink`, `resolveButtons` (+ the six-signal source-stage constant).
- `plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.test.js` — create — unit tests against `gates.fixtures.js`.

## Notes

- Do **not** delete the YAML stages or the client mirror here — they are still
  referenced by the live endpoints/pages until tasks 7–11 migrate consumers, and
  are removed in tasks 10/12.
- Keep `gateAllows` single-sourced: import it from `loadWorkflowState.js` (or
  move it to a shared util both import) rather than copying a third definition.
- The `allowed` bag key — the design mandates one name (`allowed`) across every
  method that surfaces it, replacing `visible_verbs` (overview APIs) and
  `action_allowed` (client mirror). The function returns the bag; the methods
  assign it to the `allowed` response field.
