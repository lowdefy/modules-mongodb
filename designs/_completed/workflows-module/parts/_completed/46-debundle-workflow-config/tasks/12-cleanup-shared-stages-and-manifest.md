# Task 12: Delete the orphaned shared stages, clean the manifest, and verify the build

## Context

Tasks 4–11 moved all verb/link/timeline policy into plugin JS and migrated every
consumer. The shared read-side YAML stages, their tests, the build-time
config-embed components, and several `module.lowdefy.yaml` exports are now
orphaned. The design's "What gets deleted" mandates **zero stragglers**: all
three shared YAML stages deleted in this part, not deferred. This task sweeps the
remaining orphans and verifies the whole repo builds + tests green.

By this point the following should already be deleted by earlier tasks (verify):
`action_form_configs.yaml` + `makeActionFormConfigs.js` (task 8),
`action_role_check.yaml` + `evaluateVerbGate.js` (task 10). If any were deferred
to here, delete them now.

## Task

**1. Delete the three shared YAML stages + the filter + their tests** (all
consumers migrated to plugin JS — D2/D6):

- `modules/shared/workflow/visible_verbs.yaml`
- `modules/shared/workflow/resolve_action_link.yaml` (+ `resolve_action_link.test.js`)
- `modules/shared/workflow/timeline_action_lookup.yaml`
- `modules/workflows/api/stages/visible_verbs_filter.yaml` (+ `visible_verbs_filter.test.js`)

First `grep -rn` for any remaining `_ref` to each across `modules/` and
`apps/` — there must be none. (Expected remaining refs before this task:
`module.lowdefy.yaml`'s `timeline-action-lookup` export, removed below.)

**2. Delete the all-workflows titles map** (if not already removed in task 9):

- `modules/workflows/components/workflows_config.yaml`

**3. `button_signal_sources.yaml` decision.** Task 2 chose whether the engine
reads this enum server-side or derives stages from its FSM table. If the engine
does **not** read the file, delete `modules/workflows/enums/button_signal_sources.yaml`
(+ `button_signal_sources.test.js`). If it does read it (or it moved into the
plugin), keep/relocate accordingly. The build-time `_ref` from the templates is
already gone (task 10).

**4. Clean `module.lowdefy.yaml` exports + components.** Remove the entries for
every deleted component:

- `action_role_check` (component + the `components:` block)
- `workflows_config`
- `action_form_configs`
- `timeline-action-lookup` (both the `exports.components` entry and the
  `components:` `_ref` to `../shared/workflow/timeline_action_lookup.yaml`)

Confirm `validated_workflows_config`, `actions-on-entity`,
`entity-workflows-refetch`, the enum components, and the new
`workflows-events-timeline` (task 11) remain.

**5. Update module docs.** Per CLAUDE.md's documentation layout, update
`modules/workflows/README.md` (Exports / Components / Notes) and, if affected,
`docs/idioms.md` to reflect: config now read server-side via the five
`WorkflowAPI` read methods; the `allow_not_required` flag (every kind, default
`false`); the `not_required` opt-out flip; and the new workflows-provided
timeline surface replacing the events-module inline lookup. Document the consumer
migration rule for `allow_not_required` (form actions previously showing the
not_required button via `page_config.buttons.not_required.visible: true` must add
`allow_not_required: true`).

**6. Verify.** Run the full build + test suite:

- `pnpm --filter @lowdefy/modules-mongodb-plugins test` (engine + new read methods).
- The workflows resolver tests (`makeWorkflowsConfig`, `makeWorkflowApis`, etc.).
- `pnpm ldf:b` (demo build) — no unresolved `_ref`s, no schema rejections.
- Smoke-render the demo: entity page action steps, workflow + group overview
  pages, an action detail page (buttons/access), and the lead activity timeline.

## Acceptance Criteria

- The three shared YAML stages, `visible_verbs_filter.yaml`, and their tests are
  deleted; `grep -rn` finds no `_ref` to any of them.
- `components/workflows_config.yaml`, `action_form_configs.yaml`,
  `action_role_check.yaml`, `makeActionFormConfigs.js`, `evaluateVerbGate.js`
  are all deleted and unreferenced.
- `module.lowdefy.yaml` has no exports/components pointing at deleted files.
- Net result (design): **zero** `_module.var: workflows_config` runtime reads and
  **zero** client access/visibility computation outside the build-time resolvers
  (`makeWorkflowApis`, `makeActionPages`, `validated_workflows_config`).
- Full build + test suite green; demo renders all affected surfaces.

## Files

- `modules/shared/workflow/visible_verbs.yaml` — delete.
- `modules/shared/workflow/resolve_action_link.yaml` (+ `.test.js`) — delete.
- `modules/shared/workflow/timeline_action_lookup.yaml` — delete.
- `modules/workflows/api/stages/visible_verbs_filter.yaml` (+ `.test.js`) — delete.
- `modules/workflows/components/workflows_config.yaml` — delete (if not already).
- `modules/workflows/enums/button_signal_sources.yaml` (+ `.test.js`) — delete or keep per task-2 decision.
- `modules/workflows/module.lowdefy.yaml` — modify — remove all orphaned exports/components.
- `modules/workflows/README.md` — modify — document the server-side reads, `allow_not_required`, the timeline surface.
- `docs/idioms.md` — modify (if affected).

## Notes

- This is the "zero stragglers" gate — the design is explicit that nothing in the
  verb/link/timeline policy is left in YAML. If a `grep` still finds a reference,
  the migrating task (4–11) is incomplete; fix it there, not by keeping the file.
- Keep `gates.fixtures.js` — task 2's `resolveActionAccess.test.js` uses it.
- Do not move any design folder into `_completed/` (CLAUDE.md) unless the user
  asks.
