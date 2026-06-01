# Task 8: `action_role_check` client component (Part 18 amendment)

## Context

Part 34 D8 amends Part 18's `action_role_check` component. Part 38 is where that completed-part amendment actually lands. The component is the **client mirror** of the role-gate semantics: it populates per-verb `_state.action_allowed: { view, edit, review, error }`, and page templates read the verb-specific bool to decide which controls to show.

This is one of the three engine-independent access surfaces (per D16), and it is the client runtime of the shared role-gate oracle (task 5).

## Task

Update the `action_role_check` component (from Part 18) to populate `_state.action_allowed` as a **per-verb** bag `{ view, edit, review, error }` instead of a single boolean. Each verb's bool is computed by evaluating the action's `access.{current_app}.{verb}` gate against `_user.apps.{current_app}.roles`, using the same `(gate, roles) → bool` semantics as the query-time and submit-time runtimes.

Page templates that previously read a single `action_allowed` boolean must be updated to read the verb-specific bool (`_state.action_allowed.edit`, etc.). Audit and update those references — but note the demo page-template migration (the bulk of template consumers) rides along in task 20; this task owns the component itself + the module's own fixed-page templates if any consume it.

**Add a test** that runs the shared `gates.fixtures.js` (task 5) through the client gate helper, asserting it matches the oracle.

## Acceptance Criteria

- `action_role_check` writes `_state.action_allowed: { view, edit, review, error }`.
- Each verb bool uses the same gate semantics as tasks 7 and 9.
- The client gate helper passes the shared `gates.fixtures.js` cases.
- Any module-owned templates reading the old single boolean are updated to the verb-specific bool.

## Files

- `action_role_check` component (Part 18 — locate via the component referenced in the workflows module / demo; likely under `modules/workflows/` components or a shared component) — modify
- client gate helper test — create (runs `gates.fixtures.js`)

## Notes

- Locate the existing `action_role_check` definition before editing (search for `action_role_check` and `action_allowed` across `modules/workflows/` and `apps/demo/`).
- The demo's page-template consumers are migrated in task 20 (Proposed change #13's page-template migration) — keep this task scoped to the component + module-owned consumers.
