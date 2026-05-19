# Part 22 — Workflows e2e suite

**Source rationale:** [workflows-module-concept/design.md § Worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs). **Layer:** verification. **Size:** M. **Repo:** `apps/demo/e2e/workflows/`.

## Goal

Single home for end-to-end Playwright coverage of the workflows module. Every engine path that earlier parts ship — `StartWorkflow`, `CancelWorkflow`, `SubmitWorkflowAction`, group state machine, side effects, hook invocation, tracker subscription, group fan-out, resolvers, page templates, entity components, operational Apis — gets exercised against the worked-example onboarding workflow wired in `apps/demo` by part 20. Each earlier part's verification list points here for e2e coverage; this part owns the spec authoring.

The unit-test verification in each engine / resolver / UI part continues to live there. This part is the *integration* layer.

## In scope

### Suite layout

```
apps/demo/e2e/workflows/
  fixtures.js                       # workflow-suite-specific fixtures, extends apps/demo/e2e/fixtures.js
  snaps/                            # MongoDB snap files for seed states
    onboarding-fresh/               #   - empty workflow + entity
    onboarding-mid-flight/          #   - first action submitted, group transition pending
    onboarding-with-tracker-child/  #   - parent linked to child workflow
  start-cancel.spec.js              # part 05 paths
  submit-action.spec.js             # part 06 + 07 paths (writes, priority rule, group recompute, blocked_by re-eval, auto-complete)
  side-effects.spec.js              # part 08 (log event + notifications dispatch via callApi)
  hooks.spec.js                     # part 09 (pre/post hooks, hook_error abort, three-layer status resolution)
  tracker-subscription.spec.js      # part 10 (child→parent fan-up across status changes)
  group-on-complete.spec.js         # part 11 (on_complete callApi fan-out)
  resolver-pages.spec.js            # part 12 (per-action pages emitted under each app_name verb)
  resolver-apis.spec.js             # part 13 (per-action endpoints; hook auth gate)
  resolver-form-builder.spec.js     # part 15 (form rendering + read-only review/error variants)
  page-templates.spec.js            # part 16 (edit / review / error template flows)
  shared-pages.spec.js              # part 17 (task-edit / task-view / task-review / workflow-overview)
  entity-components.spec.js         # part 18 (actions-on-entity, workflow-header)
  operational-apis.spec.js          # part 19 (start / cancel / get-entity-workflows / get-workflow-overview)
```

### Fixture surface

- Build on `apps/demo/e2e/fixtures.js` — the existing `ldf` and `mdb` fixtures already cover navigation, block interaction, request mocking, and MongoDB seed/snap.
- Add a `workflow` fixture (extends `mdb`) with helpers that match the engine's contract:
  - `workflow.start({ workflow_type, entity, ...overrides })` — drives `start-workflow` via the operational Api (part 19) and returns `{ workflow_id, action_ids }`.
  - `workflow.submit(action_id, { interaction, fields?, form?, form_review? })` — drives the per-action endpoint (part 13).
  - `workflow.cancel(workflow_id, { reason? })` — drives `cancel-workflow`.
  - `workflow.assertSummary(workflow_id, expected)` / `workflow.assertGroups(workflow_id, expected)` / `workflow.assertStatus(action_id, expected)` — assertion helpers backed by direct `mdb` reads, so tests can verify engine state without depending on UI rendering.
- Reuse the `apps/demo/e2e/snaps/` snap mechanism for repeatable seed states.

### Worked example as the spine

The concept design's [worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs) is the canonical end-to-end fixture: `lead` entity, onboarding workflow with four actions (one per kind: form `qualify`, task `verify`, tracker `track-installation`, form `proof-of-installation` instanced by device), plus a child `device-installation` workflow on a `ticket` entity. Part 20 wires this workflow into `apps/demo/workflow_config/onboarding/`; part 22 exercises it.

Specs prefer the worked example over invented fixtures so the suite doubles as live documentation of the module's expected behaviour.

### Coverage matrix (per earlier-part)

For each shipping part, the matrix below names the file and the load-bearing assertions it owns. Specs may share fixtures but each part's behaviour must be asserted somewhere in the suite.

| Part | Spec file                          | Load-bearing assertions                                                                                                  |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 05   | `start-cancel.spec.js`             | Workflow + N action docs written; `display_order` carried; initial `summary` correct; payload `actions[]` override path; reference-key spread; parent linking (three fields + `force: true` `in-progress` push); parent-link rejections (wrong kind, already linked, mismatched `tracker.workflow_type`); keyed-action YAML rejection; change-stamp threading; cancel cancels open actions; terminal actions untouched; `reason` propagated; cancel `references` reserved-key merge order. |
| 06   | `submit-action.spec.js`            | Each interaction's default status mapping; priority rule + `currentActionId` self-exception; per-call and per-entry `force`; `form_data` writes at the correct path (keyed + non-keyed); idempotent re-submit no-op. |
| 07   | `submit-action.spec.js`            | Group transitions to `done`; mixed-type `blocked_by` re-evaluation; `completed_groups` returned; auto-complete pushes workflow to `completed`; `CancelWorkflow` `groups[]` recompute. |
| 08   | `side-effects.spec.js`             | Log event written via `events.new-event`; notifications dispatched via `notifications.send-notification`; both threaded with the submit's `eventId`. |
| 09   | `hooks.spec.js`                    | Pre-hook return overrides target status; pre-hook `hook_error` aborts as `error` transition; post-hook receives engine result; `event_overrides` / `form_overrides`; three-layer status resolution. |
| 10   | `tracker-subscription.spec.js`     | Child `active` → parent `in-progress`; child `completed` → parent `done`; child `cancelled` → parent `not-required`; same-stage refire no-ops; `tracker_fired` populated on originating submit. |
| 11   | `group-on-complete.spec.js`        | `on_complete` Api fires once per group `done` transition with the declared payload; retry no-ops. |
| 12   | `resolver-pages.spec.js`           | Per-action page emitted at the right path under each app's verb map (edit / view / review / error); kind/verb-incompatible combinations not emitted. |
| 13   | `resolver-apis.spec.js`            | Per-action endpoint reachable; hook auth gate rejects when caller roles miss; payload shape matches `SubmitWorkflowAction` contract. |
| 15   | `resolver-form-builder.spec.js`    | Form renders from `form:` block; review form layers `form_review:` writable below read-only `form:`; error page renders `form_error:`. |
| 16   | `page-templates.spec.js`           | Edit template submit drives status forward; review template submit emits approve / request-changes interactions; error template's `resolve_error` button recovers to `submit_edit`'s target. |
| 17   | `shared-pages.spec.js`             | Task-edit / task-view / task-review render against an action without per-type pages; workflow-overview shows summary + groups. |
| 18   | `entity-components.spec.js`        | `actions-on-entity` renders the right actions per app's verb map; `workflow-header` shows summary state; `action_role_check` hides actions where roles don't intersect. |
| 19   | `operational-apis.spec.js`         | `start-workflow` end-to-end; `cancel-workflow` end-to-end; `get-entity-workflows` filtering by app verb map; `get-workflow-overview` returns aggregated shape. |

### Specs as documentation

Spec files prefer descriptive `test()` titles matching the concept-doc language (e.g. `"completing the child device-installation workflow flips the parent's track-installation tracker to done"`). A reader skimming the suite should be able to map each test back to a concept-spec section or worked-example step.

## Out of scope / deferred

- **Performance / load tests.** Out of v1 e2e scope.
- **Cross-app verb-filter coverage.** v1 demo wires one app (`apps/demo`); cross-app coverage lands when a second app is added.
- **Migration tooling smoke tests.** Concept-level migration tooling is out of v1.
- **Unit-test backfill for already-implemented parts 3, 4, 14.** Those parts shipped without unit tests by design; their e2e coverage flows naturally from the engine specs that depend on them (parts 5+).

## Depends on

[Part 20](../20-module-manifest/design.md) — demo wiring, the worked-example workflow YAML, and the module manifest's connection / page / api exports. Every spec in this part assumes part 20's `apps/demo/modules.yaml` entry and `apps/demo/workflow_config/onboarding/` are in place.

Soft dependencies on every earlier part: a spec for part N can only land once part N has shipped. Implementation order within this part follows the engine waves — `start-cancel.spec.js` first (depends only on part 5 + 19 + 20), then `submit-action.spec.js`, then the side-effect / hook / tracker / fan-out specs, then resolvers and UI.

## Verification

- Every part listed in the coverage matrix has at least one passing spec in this suite.
- Worked-example flow from concept design.md runs end-to-end without skipped steps.
- `pnpm e2e` from `apps/demo/` runs the full suite green; CI integration matches the existing `apps/demo/e2e/` posture.
- A reviewer dropping the workflows module into a fresh app with a minimal `workflows_config` can follow `start-cancel.spec.js` as a usage template.

## Open questions

- **Per-part vs. coverage-matrix split.** Listed as per-part spec files above; an alternative is one spec per scenario (e.g. `worked-example-onboarding.spec.js`, `worked-example-tracker.spec.js`). Lean per-part for traceability back to design parts; revisit during implementation if specs duplicate setup.
- **MongoDB driver vs. operational-Api drive.** `workflow.start` / `submit` / `cancel` helpers drive engine paths through the operational Apis (part 19). For engine assertions that don't need UI exercise, direct `mdb` reads are used. Drawing the line between "drive via Api" and "drive via direct write" lands during implementation — lean Api-drive for anything user-reachable.

## Contract to neighbours

- **Every shipping part (5–20)** carries a single line in its Verification section: "End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only."
- **Part 20** strikes the "End-to-end Playwright e2e tests — recommend `/r:dev-playwright-gen` as a follow-up" out-of-scope bullet; e2e is no longer deferred from the workflows module, it has its own part.
