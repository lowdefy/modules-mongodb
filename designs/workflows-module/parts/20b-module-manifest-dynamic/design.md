# Part 20b — Module manifest (dynamic surface) + form/task demo wiring

> **⚠️ Deviation from original design — substantive rework required before implementation.**
>
> [Part 02](../_completed/02-dynamic-module-pages/design.md) was resolved upstream by **removing the static `exports:` block from `module.lowdefy.yaml` entirely** rather than by adding a resolver-emit channel. The two YAML snippets in "Manifest scope — dynamic surface only" below (the `_ref: { resolver: ..., vars: ... }` shape under `exports.pages` and `exports.api`) **no longer match the upstream API.** The replacement: the manifest's `pages:` / `api:` arrays use `_build.array.map` over `_module.var: workflows_config` directly — no `exports:` block, no resolver-channel entry. Concrete YAML shape needs to be pinned against a real build when task 3 of parts 12/13 lands.
>
> Scope unaffected: the demo wiring half (qualify / send-quote / schedule-followup / proof-of-installation YAML, the three hook APIs, lead-view link updates).
>
> Scope to rewrite: "Manifest scope — dynamic surface only" (both YAML snippets + framing), the README-update bullet ("per-action resolver-emitted exports"), the part-02 line under "Depends on", and the first open question (channel shape for `exports.api`) — dissolved.

**Source rationale:** [workflows-module-concept/module-surface/spec.md](../../../workflows-module-concept/module-surface/spec.md). **Layer:** surface. **Size:** S. **Repo:** `modules/workflows/` + `apps/demo/`.

Split from the original Part 20. This half lands the manifest entries that depend on the upstream Lowdefy extensions in [part 01 (`callApi`)](../_completed/01-call-api-primitive/design.md) and [part 02 (dynamic module page exports)](../_completed/02-dynamic-module-pages/design.md), plus the form-action and task-action demo flows that need those primitives. The static surface — connections, shared pages, operational APIs, components, enums — ships in [part 20a](../20a-module-manifest-static/design.md).

After this part lands the v1 feature set is live end-to-end against the [concept worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs).

## Goal

Extend `module.lowdefy.yaml` (shipped by [part 20a](../20a-module-manifest-static/design.md)) with the two resolver-channel entries — `makeActionPages` for per-action form pages and `makeWorkflowApis` for per-action submit endpoints — and grow the demo onboarding workflow from tracker-only into the full four-action worked example (one action per kind: form / task / tracker / form-keyed). After this part ships, the demo exercises every engine path: form-action `submit_edit`, task-action `submit_edit`, pre/post hooks, log events, notifications, group `on_complete` fan-out, and tracker subscription end-to-end.

## Proposed change

1. Extend `modules/workflows/module.lowdefy.yaml` with two resolver-channel entries — `makeActionPages` under `exports.pages` and `makeWorkflowApis` under `exports.api` — using the [part 02](../_completed/02-dynamic-module-pages/design.md) shape.
2. Extend `apps/demo/workflow_config/onboarding/` from the tracker-only variant ([part 20a](../20a-module-manifest-static/design.md)) into the four-action worked example — adding `qualify` (form), `schedule-followup` (task), and `proof-of-installation` (form, keyed by device) alongside the existing `track-installation` (tracker).
3. Author the worked-example pre/post hook APIs (`qualify-pre-submit.yaml`, `send-quote-pre-submit.yaml`, `send-quote-post-approve.yaml`) under `apps/demo/workflow_config/onboarding/api/` and wire them into the action YAML's `hooks:` blocks.
4. Update `modules/workflows/README.md` to drop the "shipped in part 20b" pointer and list the per-action resolver-emitted exports inline.
5. Part 27 (demo-workflows-wiring) is retired in 20a (see [20a § Open questions / Closed during review](../20a-module-manifest-static/design.md)) — no follow-up needed here.

## Manifest scope — dynamic surface only

This half adds **only** the two resolver-channel entries under `exports.pages` and `exports.api`. Everything else in `module.lowdefy.yaml` already shipped via [part 20a](../20a-module-manifest-static/design.md).

### `exports.pages` — resolver channel

Per the [concept module-surface spec](../../../workflows-module-concept/module-surface/spec.md), the dynamic entry rides the [part 02](../_completed/02-dynamic-module-pages/design.md) shape. Concrete syntax pinned during part 02 implementation; expected form:

```yaml
pages:
  - _ref:
      resolver: resolvers/makeActionPages.js
      vars:
        workflows: { _module.var: workflows_config }
        app_name: { _module.var: app_name }
```

The resolver — owned by [part 12](../12-resolver-pages/design.md) — emits up to four pages per form action: `{workflow_type}-{action_type}-{edit|view|review|error}`, gated by the action's `access.{app_name}` verb list. Tracker actions emit nothing; task actions emit nothing (the shared `task-*` pages in [part 17](../_completed/17-shared-pages/design.md) handle them).

### `exports.api` — resolver channel

Same channel shape (or the parallel `exports.api` channel — pinned during part 02 implementation):

```yaml
api:
  - _ref:
      resolver: resolvers/makeWorkflowApis.js
      vars:
        workflows: { _module.var: workflows_config }
        app_name: { _module.var: app_name }
```

The resolver — owned by [part 13](../13-resolver-apis/design.md) — emits one `update-action-{action_type}` Lowdefy Api per form / task action, baking in `hooks:`, `event_overrides:`, and `interactions:` as build-time literals. Tracker actions emit nothing.

## Worked-example demo extension (`apps/demo/`)

Builds on [part 20a](../20a-module-manifest-static/design.md)'s tracker-only worked example. Three new action YAML files plus three pre/post hook API files, plus any demo navigation tweaks needed to drive the new actions.

### Files added under `apps/demo/`

- `apps/demo/workflow_config/onboarding/qualify.yaml` — `kind: form` action with a `form:` block exercising the form components library ([part 14](../14-form-components-library/design.md)) and `interactions: { submit_edit: { status: done } }`.
- `apps/demo/workflow_config/onboarding/send-quote.yaml` — `kind: form` action with `pages.edit.formHeader`, an `approve` verb in `access.{app_name}`, and `interactions: { submit_edit: { status: in-review }, approve: { status: done } }`. Exercises `form_review` per [submit-pipeline spec](../../../workflows-module-concept/submit-pipeline/spec.md).
- `apps/demo/workflow_config/onboarding/schedule-followup.yaml` — `kind: task` action with universal fields (`due_date`, `assignees`, `description`); drives `task-edit` end-to-end.
- `apps/demo/workflow_config/onboarding/proof-of-installation.yaml` — `kind: form` action, keyed by device, fanned out per device at start time via the `actions:` payload on `start-workflow` (action-authoring D9).
- `apps/demo/workflow_config/onboarding/api/qualify-pre-submit.yaml` — pre-hook on `qualify.submit_edit`. Demonstrates pre-hook return shape (`actions[]`, `event_overrides`, `form_overrides`).
- `apps/demo/workflow_config/onboarding/api/send-quote-pre-submit.yaml` — pre-hook on `send-quote.submit_edit`.
- `apps/demo/workflow_config/onboarding/api/send-quote-post-approve.yaml` — post-hook on `send-quote.approve`. Demonstrates post-hook reading `result` (per [submit-pipeline spec](../../../workflows-module-concept/submit-pipeline/spec.md)).
- Update `apps/demo/workflow_config/onboarding/onboarding.yaml` to add the three new actions to `actions[]`, add their `action_groups[]` declarations, and (if needed) wire `on_complete` for the first group ([part 11](../11-group-on-complete-fanout/design.md)).
- Update `apps/demo/pages/leads/lead-view.yaml` so `actions-on-entity` surfaces the new form actions as clickable links into `workflows/onboarding-qualify-edit`, etc.

### Demo flows newly exercised

After this part lands, the demo walks through every bullet from the [concept worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs):

- Click `qualify` on the lead-view page → navigates to `workflows/onboarding-qualify-edit` (per-action page emitted by `makeActionPages`).
- Submit the form → calls `workflows/update-action-qualify` (per-action endpoint emitted by `makeWorkflowApis`) → pre-hook fires → engine writes → side effects (log event + notifications) fire via `context.callApi`.
- Group `on_complete` fan-out fires when the first group completes (per [part 11](../11-group-on-complete-fanout/design.md)) — exercises `callApi` from inside the engine.
- Task action `schedule-followup` → navigates to `workflows/task-edit?action_id=<id>` → save fires `update-action-schedule-followup` → engine transitions → re-render.
- Tracker fan-up of the child `device-installation` workflow on the parent `track-installation` action — already wired in [part 20a](../20a-module-manifest-static/design.md), still works.
- `proof-of-installation` keyed fan-out — start payload provides `actions: [{ type: proof-of-installation, key: device-1, ... }, { ..., key: device-2 }]`; both action instances render under one parent slot in `actions-on-entity` and `workflow-overview`.

## README update (`modules/workflows/README.md`)

- Replace the "Per-action pages and per-action submit endpoints ship in part 20b" pointer in "Exports" with the inline description of the resolver-emitted entries (one page set per form action, one endpoint per form/task action; ids derived from `workflow_type` / `action_type` / `app_name` per the part 12 + part 13 contracts).
- Add a "How to Use" example that walks through declaring a single workflow with one form action, dropping it into `vars.workflows_config`, and observing the emitted pages + endpoint in the built app's routes.

## Out of scope / deferred

- **Static manifest entries** — already shipped in [part 20a](../20a-module-manifest-static/design.md).
- **Tracker-only demo wiring** — already shipped in [part 20a](../20a-module-manifest-static/design.md).
- **End-to-end Playwright e2e tests** — owned by [part 22](../22-workflows-e2e-suite/design.md). This part contributes the form-action / hook / task-action / group `on_complete` spec slices.
- **Custom action kind** (`kind: custom`) — owned by [part 28](../28-custom-action-kind/design.md). Independent of the manifest split; ships its own demo wiring when it lands.
- **Universal fields component** — owned by [part 24](../24-universal-fields/design.md). Required for `assignees` / `due_date` / `description` to render; assumed shipped before this part runs end-to-end.
- **Migration tooling** — concept marks as out of v1.
- **Cleanup of `designs/workflows-module-concept/ui/example_workflow/`** — orthogonal; revisit after this part lands.

## Depends on

- [Part 20a](../20a-module-manifest-static/design.md) — the static manifest entries this part extends.
- [Part 01](../_completed/01-call-api-primitive/design.md) — `context.callApi` primitive. Required at runtime for the per-action endpoint's hook invocation, side-effect dispatch, log-event emission, and group `on_complete` fan-out.
- [Part 02](../_completed/02-dynamic-module-pages/design.md) — dynamic page (and likely api) exports channel. Required for the two resolver entries this part lands.
- [Part 12](../12-resolver-pages/design.md) — `makeActionPages` resolver.
- [Part 13](../13-resolver-apis/design.md) — `makeWorkflowApis` resolver.
- [Part 14](../14-form-components-library/design.md) — form components used in `qualify.yaml` / `send-quote.yaml` form blocks.
- [Part 15](../15-resolver-form-builder/design.md) — form-rendering resolver invoked by part 16 templates.
- [Part 16](../_completed/16-page-templates/design.md) — per-action form-action templates (`edit` / `view` / `review` / `error`).
- [Part 24](../24-universal-fields/design.md) — universal-fields component used on the task-edit page and on form pages that read `fields:`.
- [Part 6](../_completed/06-submit-action-writes/design.md), [Part 7](../07-group-state-machine/design.md), [Part 8](../08-side-effect-dispatch/design.md), [Part 9](../09-hook-invocation/design.md), [Part 11](../11-group-on-complete-fanout/design.md) — engine paths exercised end-to-end by the form/task demo flows.

## Verification

- **Build smoke.** `apps/demo` builds with the extended manifest; `makeActionPages` emits the expected page ids (`onboarding-qualify-edit`, `onboarding-qualify-view`, `onboarding-send-quote-edit`, etc. per the action `access.{app_name}` verb lists); `makeWorkflowApis` emits the expected endpoints (`update-action-qualify`, `update-action-send-quote`, `update-action-schedule-followup`, `update-action-proof-of-installation`).
- **Worked-example walk-through (manual).** Run, in order, every step in the [concept worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs):
  1. Open lead-view → first form action `qualify` shows as `action-required`.
  2. Click `qualify` → navigates to the resolver-emitted edit page → form renders.
  3. Submit → pre-hook fires (`qualify-pre-submit`) → engine transitions to `done` → log event fires → notifications dispatch.
  4. `send-quote` flips from `blocked` to `action-required` → navigate, submit → goes to `in-review` → reviewer approves on the review page → post-hook fires (`send-quote-post-approve`) → action transitions to `done`.
  5. Group A `on_complete` callback fires (per [part 11](../11-group-on-complete-fanout/design.md)) — observable via the configured `on_complete` API endpoint.
  6. Task action `schedule-followup` flips to `action-required` → user opens `task-edit?action_id=<id>` → sets `due_date`, `assignees`, types a comment, picks `done` → saves → engine writes; comment lands in `metadata.comment` on the engine-emitted event ([part 13 design.md § Comment mapping](../13-resolver-apis/design.md)).
  7. Tracker subscription fan-up — already verified in part 20a; still works.
  8. Keyed fan-out — start a workflow with two `proof-of-installation` instances → both render under one parent slot; each submits independently.
- **Plugin version.** Manifest's pin to `@lowdefy/modules-mongodb-plugins` matches the version that ships `WorkflowAPI` *plus* the version that adds `callApi`-aware `WorkflowAPI` handlers. Bump as needed.
- **E2E spec contribution.** This part lands the spec slices that need form/task pages or per-action endpoints: `submit-action.spec.js` (form-action `submit_edit` + form-review `approve` / `request_changes`), `hooks.spec.js` (pre/post hook), `side-effects.spec.js` (log event + notifications via `callApi`), `group-on-complete.spec.js` (callApi fan-out), `resolver-pages.spec.js` (emitted page ids match expected), `resolver-apis.spec.js` (emitted endpoint ids match expected), `shared-pages.spec.js` (task-edit save). Per the [part 22 e2e suite contract](../22-workflows-e2e-suite/design.md).
- **README accuracy.** "Exports" section lists resolver-emitted pages and endpoints inline (no part-20b pointer); README example builds against a real `vars.workflows_config` value; manifest is the source of truth (var schema mismatches between README and manifest fail review).

## Open questions

- **Exact channel shape for `exports.api`.** [Part 02](../_completed/02-dynamic-module-pages/design.md) leaves "whether `exports.api` rides on the same channel" as an open question. Confirm during 20b implementation; manifest changes here are minor either way.
- **Whether 20b ships in one PR.** Three resolver-emitted pages + three resolver-emitted endpoints + four new YAML action files + three hook APIs is more surface than the original Part 20's S sizing. If 20a closes out cleanly, 20b may earn its own M sizing on first review.

## Related

- Splits the original Part 20 — see [part 20a](../20a-module-manifest-static/design.md) for the static half.
- [Concept module-surface spec](../../../workflows-module-concept/module-surface/spec.md) is the authoritative source for var shapes and export lists.
- [Concept worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs) — the canonical end-to-end the demo grows into.
