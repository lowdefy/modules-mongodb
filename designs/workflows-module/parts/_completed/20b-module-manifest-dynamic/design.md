# Part 20b — Resolver-emitted manifest surface + form/task/keyed demo wiring

**Source rationale:** [workflows-module-concept/module-surface/spec.md](modules-mongodb/designs/workflows-module-concept/module-surface/spec.md). **Layer:** surface. **Size:** M. **Repo:** `modules/workflows/` + `apps/demo/`.

Closes the workflow-engine v1 surface. The two resolver-channel manifest entries — `makeActionPages` for per-action form pages and `makeWorkflowApis` for per-action submit endpoints — already shipped via commit [`574960a`](../../../../../../tree/574960a) (a Lowdefy framework fix made `_ref: { resolver, vars }` work from inside a module, removing the original need for the part-02 channel — see [Implemented — manifest dynamic surface § Why this differs](#implemented--manifest-dynamic-surface) for the audit posture). This part replaces the tracker-only demo from [part 20a](modules-mongodb/designs/workflows-module/parts/_completed/20a-module-manifest-static/design.md) with the four-kind worked example — one action per kind: form / form-with-review / task / form-keyed — plus pre/post-hook routines (authored as inline `_ref`s into sibling YAML files), plus a tracker action that keeps the child `installation` workflow in the picture.

After this part lands the demo exercises every engine path that hangs off the per-action endpoint: form-action `submit_edit`, form-review `approve` / `request_changes`, task-action `submit_edit`, pre/post hooks (dormant until [part 9](modules-mongodb/designs/workflows-module/parts/09-hook-invocation/design.md) ships), log events and notifications, group `on_complete` fan-out (dormant until [part 11](modules-mongodb/designs/workflows-module/parts/11-group-on-complete-fanout/design.md) ships), and keyed fan-out at workflow start.

## Proposed change

1. **Replace `onboarding` workflow.** Drop the three tracker actions (`track-step-1` / `-2` / `-3`) on `apps/demo/modules/workflows/workflow_config/onboarding/`. Author five new actions: `qualify` (form), `send-quote` (form, with `form_review`), `schedule-followup` (task), `proof-of-installation` (form, keyed by device), and `track-installation` (tracker pointing at the existing `installation` child workflow). Restructure the workflow's `starting_actions`, `action_groups`, and `blocked_by` chain around the new shape.
2. **Author hook routines.** Author three pre/post hook routines and reference each inline from its action's `hooks:` block. Routine content lives in sibling YAML files under `apps/demo/modules/workflows/workflow_config/onboarding/hooks/` (`qualify-pre-submit.yaml`, `send-quote-pre-submit.yaml`, `send-quote-post-approve.yaml`); the action's `hooks:` block pulls them in via `_ref` so the resolver sees one inline routine at build time. The routines stay dormant until [part 9](modules-mongodb/designs/workflows-module/parts/09-hook-invocation/design.md) lands the hook invocation path.
3. **Start-onboarding modal on lead-view.** Replace the existing "Start onboarding" button on `apps/demo/pages/leads/lead-view.yaml` with a modal that collects per-device input (one row per device, with an Add / Remove control) and constructs the `actions:` payload for `start-workflow` at submit time — one `proof-of-installation` action instance per device row.
4. **Fix per-status `message` / `link` projection in three operational APIs.** The current four-operand `_string.concat: [$apps, ., {app_name}, .link]` shape in `modules/workflows/api/get-entity-workflows.yaml`, `get-workflow-overview.yaml`, and `get-action-group-overview.yaml` produces the literal string `"$apps.demo.link"` instead of projecting from the action root. Replace with the three-operand `_string.concat: [$, {app_name}, .link]` shape that builds `"$demo.link"` at build time (see [Per-status projection fix](#per-status-projection-fix) below). Pairs with engine-side work landing on a sibling branch that writes `{app_name}: { message, link }` onto the action root at every status transition.
5. **Export `entity-workflows-refetch` action component.** Add `modules/workflows/components/entity-workflows-refetch.yaml` — a reusable action sequence (`CallAPI` `get-entity-workflows` → `SetState` `entity_workflows`) that any consumer mutating workflows on an entity can chain to refresh `actions-on-entity` without knowing the module's endpoint id or state key. Register under `module.lowdefy.yaml` `components:`. Consumed by the lead-view modal's submit sequence (item 3); `actions-on-entity.onMount` continues to inline the same CallAPI+SetState pair (refactor to consume the component too is an obvious follow-up but isn't load-bearing for 20b).
6. **README update.** Drop the "shipped in part 20b" pointer from `modules/workflows/README.md` Exports and replace it with inline descriptions of the resolver-emitted entries (one page set per form action; one endpoint per form/task action; ids derived from `workflow_type` / `action_type` per the [part 12](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md) + [part 13](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) contracts). Add a worked-example block in "How to Use" walking through a single form action. Also document the new `entity-workflows-refetch` component.
7. **Manifest surface — already Implemented.** The dynamic-surface manifest entries (`makeActionPages` + `makeWorkflowApis`) and the `validated_workflows_config` + `action_form_configs` resolver-wrapper components shipped in commit [`574960a`](../../../../../../tree/574960a). See [Implemented — manifest dynamic surface](#implemented--manifest-dynamic-surface) below for the on-disk shape.

## Implemented — manifest dynamic surface

The on-disk shape that replaced this part's original "part-02 channel" plan:

```yaml
api:
  _build.array.concat:
    - - _ref: api/start-workflow.yaml
      # ... five other static operational APIs
    - _ref:
        resolver: resolvers/makeWorkflowApis.js
        vars:
          workflows:
            _module.var: workflows_config

pages:
  _build.array.concat:
    - - _ref: pages/task-edit.yaml
      # ... four other static shared pages
    - _ref:
        resolver: resolvers/makeActionPages.js
        vars:
          workflows:
            _module.var: workflows_config
          app_name:
            _module.var: app_name
```

`_build.array.concat` splices the resolver-returned array alongside the static refs — Lowdefy doesn't auto-splice resolver array output into a parent array, so each resolver invocation sits as one operand of the concat. The api: resolver entry takes only `workflows` (per-action endpoints don't read `app_name`); the pages: resolver entry takes both (page emission is gated by `access.{app_name}` verb lists per [part 12](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md)).

The same pattern wires `makeActionFormConfigs` (the per-action form metadata map consumed by `workflow-overview` and `group-overview`) into the `action_form_configs` component, and `makeWorkflowsConfig` (the part-4 validator) into the `validated_workflows_config` component which the `workflow-api` connection reads instead of raw `_module.var: workflows_config`. Both are already on disk under `modules/workflows/components/`.

**Why this differs from the original plan.** Part 02's dynamic-page-exports channel was meant to fix a build-time bug where `_ref: { resolver }` paths resolved against the host app's cwd rather than the module root. The fix landed in upstream Lowdefy ahead of part 02's wider scope, so the manifest was wired up directly without the channel. Part 02's primary problem is now solved by [`574960a`](../../../../../../tree/574960a); whether any remaining scope (dedicated `exports.pages` channel semantics, dynamic-page representation in `exports`) is still worth pursuing should be audited during 20b closeout.

## Per-status projection fix

The WIP commit [`5352646`](../../../../../../tree/5352646) intended to project per-status `message` / `link` onto each action so consumers read `_state: actions_list.$.message / .link` directly. The status-traversal half lives in the engine (writes `{app_name}: { message, link }` onto the action root at every status transition — separate work, not on this branch). The read-side projection in the three operational APIs is currently wrong:

```yaml
# modules/workflows/api/get-entity-workflows.yaml:62–73 (current, broken)
message:
  _string.concat: [$apps, ., { _module.var: app_name }, .message]
link:
  _string.concat: [$apps, ., { _module.var: app_name }, .link]
```

`_string.concat` joins its operands as literals — `$apps` becomes the string `"$apps"`, not a projection — so every action gets the constant string `"$apps.demo.message"` / `"$apps.demo.link"`. There is no `apps` field on the action doc.

Once the engine writes `{app_name}: { message, link }` onto the action root, the action carries (e.g.) `demo: { message: …, link: … }` directly. The projection collapses to a three-operand concat that builds the Mongo projection string `"$demo.link"` at build time:

```yaml
# Replacement projection — same shape in all three APIs.
message:
  _string.concat:
    - $
    - _module.var: app_name
    - .message # → "$demo.message" at build time
link:
  _string.concat:
    - $
    - _module.var: app_name
    - .link # → "$demo.link" at build time
```

Three files take the same swap: `modules/workflows/api/get-entity-workflows.yaml`, `get-workflow-overview.yaml`, `get-action-group-overview.yaml`. Authors continue to declare `status_map.{status}.demo.{message|link}` on the action YAML per the [Onboarding actions worked example](#onboarding-actions-replaces-the-three-trackers); the engine traverses `status_map` at write time and the APIs read the projected field at query time.

**Runtime dependency.** Verification of this projection passes once the engine-side `status_map → action_root.{app_name}` write lands (separate work, tracked elsewhere). Until then the action root has no `{app_name}` field and the projection returns `null`.

## Worked-example demo extension (`apps/demo/`)

Builds on [part 20a](modules-mongodb/designs/workflows-module/parts/_completed/20a-module-manifest-static/design.md)'s leads/lead-view scaffolding. The `onboarding` workflow grows from three trackers into a five-action workflow that exercises every action kind. The `installation` child workflow stays on disk unchanged — `track-installation` re-attaches it to `onboarding`.

### Onboarding actions (replaces the three trackers)

All actions declare `entity_collection: leads-collection`, app `demo` in `access.{app_name}` with the verbs each kind needs, and a `status_map` whose per-status `link:` is a `{ pageId, urlQuery }` block pointing at the resolver-emitted page (or shared `task-edit` / `workflow-overview` for non-form kinds). Form-content fields use the form-components library from [part 14](modules-mongodb/designs/workflows-module/parts/_completed/14-form-components-library/design.md) under `modules/workflows/components/fields/`.

The `link:` shape matches both the [action-authoring spec example](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md) and the consuming [ActionSteps block contract](../../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md) — `{ pageId, urlQuery, input?, newTab?, disabled? }`. Worked example for `qualify`:

```yaml
# apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml (excerpt)
status_map:
  action-required:
    demo:
      message: Qualify the lead.
      link:
        pageId:
          _module.pageId:
            id: onboarding-qualify-edit
            module: workflows
        urlQuery:
          action_id: true
  in-progress:
    demo:
      message: Qualifying the lead.
      link:
        pageId:
          _module.pageId:
            id: onboarding-qualify-view
            module: workflows
        urlQuery:
          action_id: true
  done:
    demo:
      message: Lead qualified.
```

Every action's `status_map` follows this pattern — terminal statuses (`done`, `not-required`) drop `link:` (the action is read-only chrome); active statuses point at the verb's resolver-emitted page (`-edit` for `action-required` / `in-progress` / `changes-required`; `-review` for `in-review`; `-view` for closed-but-clickable states). Task actions (`schedule-followup`) point at the shared `task-edit` / `task-view`; the tracker (`track-installation`) points at `workflow-overview` (see [Finding 7](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/review/review-1.md) resolution).

| Action                  | Kind    | Group                  | Verbs                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------- | ---------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qualify`               | form    | `g1`                   | `edit`, `view`           | Pre-hook on `submit_edit` (routine in `hooks/qualify-pre-submit.yaml`). `interactions.submit_edit.status: done`. Exercises a plain form-action submit through the engine and the side-effect dispatch (log event + notifications).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `send-quote`            | form    | `g2` (blocked by `g1`) | `edit`, `view`, `review` | Pre-hook on `submit_edit` and post-hook on `approve` (routines in `hooks/send-quote-pre-submit.yaml` and `hooks/send-quote-post-approve.yaml`). `form_review:` block declared. `interactions.submit_edit.status: in-review`, `interactions.approve.status: done`, `interactions.request_changes.status: action-required`. Exercises form review per [submit-pipeline spec](modules-mongodb/designs/workflows-module-concept/submit-pipeline/spec.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `schedule-followup`     | task    | `g2`                   | `edit`, `view`           | Universal fields (`due_date`, `assignees`, `description`) only — no custom `form:` block. Drives the shared `task-edit` page end-to-end.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `proof-of-installation` | form    | `g3` (blocked by `g2`) | `edit`, `view`           | Instanced action — declares `key: $device_serial` as a symbolic placeholder per [action-authoring spec § Instanced actions](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md). Concrete `key` values arrive at spawn time via the `actions:` payload on `start-workflow`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `track-installation`    | tracker | `g3`                   | `view`                   | `tracker.workflow_type: installation`. Keeps the tracker subscription path in the demo. The existing `installation/install-step` child workflow stays unchanged. `status_map.{status}.demo.link` points at the child workflow's `workflow-overview` page — since `installation` ships with a single `install-step` action, the workflow-overview becomes the de-facto install-step view; users click through and reach `task-edit` from the action card. The link's `urlQuery.workflow_id` references `tracker.child_workflow_id` (engine-written at `start-workflow` time per [action-authoring spec line 455](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md)) — lighting up at runtime depends on the same engine-side runtime-field projection that powers the per-status `{app_name}.link` write (see [Runtime-only deps](#runtime-only-verification-blocked-until-they-land)). |

The starting-action set is `[qualify]`. Group `g1` opens with `qualify` `action-required`, everything else `blocked`.

### Hook routines

Hook routines live inline on the action YAML's `hooks:` block per [action-authoring spec line 16](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md) — `makeWorkflowApis` reads them off the action and emits the Lowdefy Api at build time with auto-derived id `update-action-{type}-{interaction}-{phase}`. There is no separate on-disk Api file the resolver knows about.

To keep individual action files small, each routine's _content_ is authored in a sibling YAML and pulled in via `_ref`. The resolver sees one inline routine array — the `_ref` resolves at build time, before the resolver runs. Three routines:

```yaml
# apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml
hooks:
  submit_edit:
    pre:
      routine:
        _ref: modules/workflows/workflow_config/onboarding/hooks/qualify-pre-submit.yaml
```

App `_ref` paths resolve relative to `apps/demo/lowdefy.yaml` (the app root), not relative to the file containing the `_ref` — so the full path from app root is required. See the existing `onboarding.yaml`'s action refs for the precedent.

- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/qualify-pre-submit.yaml` — pre-hook routine for `qualify.submit_edit`. Returns a `event_overrides.display` string showing how display overrides flow into the engine-emitted log event.
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/send-quote-pre-submit.yaml` — pre-hook routine for `send-quote.submit_edit`.
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/send-quote-post-approve.yaml` — post-hook routine for `send-quote.approve`. Demonstrates a post-hook reading `result` (per submit-pipeline spec).

Each file is a routine array (the value of `routine:`), not a full Lowdefy Api descriptor. The on-disk emitted Api id is determined by the resolver from the action `type` + interaction + phase; authors don't pick it.

The same pattern applies to the `g1` `on_complete` callback referenced in [Verification step 5](#verification) — `onboarding.yaml`'s `action_groups[g1].on_complete.routine` pulls in `modules/workflows/workflow_config/onboarding/hooks/g1-on-complete.yaml` via `_ref` (listed in [Files touched / added](#files-touched--added)). `makeWorkflowApis` emits the per-group `workflow-{type}-group-{id}-on-complete` Api at build time per the same inline-routine contract.

### Files touched / added

- `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` — restructured `starting_actions`, `action_groups`, and `actions[]`.
- `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml`, `send-quote.yaml`, `schedule-followup.yaml`, `proof-of-installation.yaml`, `track-installation.yaml` — new action files.
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/qualify-pre-submit.yaml`, `send-quote-pre-submit.yaml`, `send-quote-post-approve.yaml` — new hook routine files. Each holds the routine array referenced inline via `_ref` from the corresponding action's `hooks:` block.
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/g1-on-complete.yaml` — new routine file for `g1.on_complete`. Authored as a demo-visible step (e.g. a log entry) so the callback fires observably once [part 11](modules-mongodb/designs/workflows-module/parts/11-group-on-complete-fanout/design.md) lands. Referenced inline via `_ref` from `onboarding.yaml`'s `action_groups[g1].on_complete.routine`.
- `apps/demo/modules/workflows/workflow_config/onboarding/track-step-1.yaml`, `track-step-2.yaml`, `track-step-3.yaml` — **deleted**.
- `modules/workflows/api/get-entity-workflows.yaml`, `get-workflow-overview.yaml`, `get-action-group-overview.yaml` — replace the broken four-operand `_string.concat: [$apps, …]` with the three-operand `_string.concat: [$, {app_name}, .link]` shape from [Per-status projection fix](#per-status-projection-fix). One projection swap per file.
- `modules/workflows/components/entity-workflows-refetch.yaml` — new component, action sequence (CallAPI `get-entity-workflows` → SetState `entity_workflows`). Takes `entity_id` + `entity_collection` as vars. Mirrors the pair already running on `actions-on-entity.onMount`.
- `modules/workflows/module.lowdefy.yaml` — register the new component under `components:`.
- `modules/workflows/README.md` — document the new component in the Components section (item 6 below).
- `apps/demo/pages/leads/lead-view.yaml` — replace the existing "Start onboarding" button (added in 20a) with a "Start onboarding" button that opens a modal. The new button preserves the existing `visible: { _eq: [{ _state: entity_workflows.length }, 0] }` guard so you can't start a second onboarding workflow on the same lead. The modal contains:
  - A `ControlledList` of device rows, each with a `device_serial` text input and a Remove button.
  - Add and Cancel / Submit buttons.
  - An `onClick` action sequence on Submit that calls `workflows/start-workflow` with `workflow_type: onboarding`, `entity_id: <lead-id>`, and `actions:` built from the device rows — one `{ type: proof-of-installation, key: <serial>, fields: { device_serial: <serial> } }` per row. After `start-workflow` returns, the sequence chains `_ref: { module: workflows, component: entity-workflows-refetch }` so `actions-on-entity` re-renders without a page reload (replaces the existing inline `refetch_entity_workflows` + `set_entity_workflows` pair from 20a).
  - The `actions-on-entity` widget itself needs no edits; once the action `status_map` blocks land (see [Onboarding actions](#onboarding-actions-replaces-the-three-trackers)) and the projection fix lands ([Per-status projection fix](#per-status-projection-fix)), clickable actions surface automatically.

### Demo flows newly exercised

After this part lands, the demo walks through every bullet from the [concept worked example](modules-mongodb/designs/workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs):

- Click `qualify` on lead-view → navigates to `workflows/onboarding-qualify-edit` (resolver-emitted page).
- Submit the form → calls `workflows/update-action-qualify` (resolver-emitted endpoint) → engine writes through `submit_edit` → side effects fire (log event + notifications).
- Group `g1` completes → group state machine flips `g2` actions from `blocked` to `action-required`.
- `send-quote` → submit → `in-review` → review page → approve → `done`. Post-hook fires (once part 9 ships).
- `schedule-followup` → `task-edit?action_id=<id>` → set `due_date`, `assignees`, type a comment, pick `done` → save → engine writes; comment lands in `metadata.comment` on the engine-emitted event ([part 13 design.md § Comment mapping](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md)).
- `proof-of-installation` keyed fan-out — start payload provides `actions: [{ type: proof-of-installation, key: device-1, ... }, { ..., key: device-2 }]`; both instances render under one parent slot in `actions-on-entity` and `workflow-overview`.
- `track-installation` → click the tracker row → navigates to the child `installation` workflow's `workflow-overview` page → open `install-step` via `task-edit` → save status. The tracker subscription ([part 10](modules-mongodb/designs/workflows-module/parts/_completed/10-tracker-subscription/design.md)) fans the child's lifecycle up to the parent `track-installation` action and lead-view re-renders. (Click-through depends on engine-side runtime-field projection — see [Runtime-only deps](#runtime-only-verification-blocked-until-they-land).)

## README update (`modules/workflows/README.md`)

- Replace the "Per-action pages and per-action submit endpoints ship in part 20b" pointer in "Exports" with the inline description of the resolver-emitted entries: one page per `(workflow_type, action_type, verb)` tuple, where `verb` is the action's `access.{app_name}.verbs` filtered by `[edit, view, review, error]`; one `update-action-{action_type}` endpoint per form/task action.
- Add a "How to Use" example that walks through declaring a single workflow with one form action, dropping it into `vars.workflows_config`, and observing the emitted pages (`/{entryId}/{workflow_type}-{action_type}-edit`, etc.) + endpoint (`/api/{entryId}/update-action-{action_type}`) in the built app's routes.
- Drop the "static surface shipped by part 20a; part 20b adds…" framing paragraph at the top — replace with a description of the full surface as one coherent thing.

## Out of scope / deferred

- **Static manifest surface** — already shipped in [part 20a](modules-mongodb/designs/workflows-module/parts/_completed/20a-module-manifest-static/design.md).
- **Tracker-only `onboarding` variant** — superseded; the new `onboarding` covers tracker via the `track-installation` action.
- **End-to-end Playwright e2e tests** — owned by [part 22](modules-mongodb/designs/workflows-module/parts/22-workflows-e2e-suite/design.md). This part contributes the form-action / hook / task-action / keyed fan-out / group `on_complete` spec slices; the tracker spec from 20a still applies via `track-installation`.
- **Custom action kind** (`kind: custom`) — owned by [part 28](modules-mongodb/designs/workflows-module/parts/28-custom-action-kind/design.md). Independent of the manifest split; ships its own demo wiring when it lands.
- **Universal fields component** — owned by [part 24](modules-mongodb/designs/workflows-module/parts/24-universal-fields/design.md). Required for `assignees` / `due_date` / `description` to render; assumed shipped before this part runs end-to-end.
- **Hook invocation** — owned by [part 9](modules-mongodb/designs/workflows-module/parts/09-hook-invocation/design.md). The three hook routines (referenced inline via `_ref` from the action `hooks:` blocks) ship dormant; verification walk-through steps that observe pre/post-hook firing only pass once part 9 lands.
- **Group `on_complete` fan-out** — owned by [part 11](modules-mongodb/designs/workflows-module/parts/11-group-on-complete-fanout/design.md). The `g1 → g2` `on_complete` callback is declared on the new `onboarding.yaml` but only fires once part 11 ships.
- **Part 02 audit.** The framework fix in [`574960a`](../../../../../../tree/574960a) solves the path-resolution problem the channel was originally proposed for. During 20b closeout, audit part 02's remaining scope against the now-wired manifest and decide whether the part still has work to do.
- **Migration tooling** — concept marks as out of v1.

## Depends on

- [Part 20a](modules-mongodb/designs/workflows-module/parts/_completed/20a-module-manifest-static/design.md) — the static surface + `leads-collection` + `lead-view` page that this demo extension builds on.
- [Part 12](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md) — `makeActionPages` resolver. **Implemented + wired** in commit [`574960a`](../../../../../../tree/574960a).
- [Part 13](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) — `makeWorkflowApis` resolver. **Implemented + wired** in commit [`574960a`](../../../../../../tree/574960a).
- [Part 14](modules-mongodb/designs/workflows-module/parts/_completed/14-form-components-library/design.md) — form components used in `qualify.yaml` / `send-quote.yaml` form blocks.
- [Part 15](../15-resolver-form-builder/design.md) — form-rendering resolver invoked by [part 16](modules-mongodb/designs/workflows-module/parts/_completed/16-page-templates/design.md) templates.
- [Part 16](modules-mongodb/designs/workflows-module/parts/_completed/16-page-templates/design.md) — per-action form-action templates (`edit` / `view` / `review` / `error`).
- [Part 24](modules-mongodb/designs/workflows-module/parts/24-universal-fields/design.md) — universal-fields component used on the task-edit page and on form pages that read `fields:`. Must ship before verification steps that touch `schedule-followup`.

### Runtime-only (verification blocked until they land)

- [Part 1](modules-mongodb/designs/workflows-module/parts/01-call-api-primitive/design.md) — `context.callApi` primitive. Required at runtime by the per-action endpoint's hook invocation, side-effect dispatch, log-event emission, and `on_complete` fan-out.
- [Part 9](modules-mongodb/designs/workflows-module/parts/09-hook-invocation/design.md) — hook dispatch. Required for the hook YAMLs to fire.
- [Part 11](modules-mongodb/designs/workflows-module/parts/11-group-on-complete-fanout/design.md) — `on_complete` fan-out. Required for the `g1 → g2` callback declared on `onboarding.yaml`.
- **Engine-side `status_map → action_root.{app_name}` write.** Sibling-branch work that projects `status_map.{status}.{app_name}` onto the action doc's root (as `{app_name}: { message, link }`) at every status transition. Required for the three-operand projection in [Per-status projection fix](#per-status-projection-fix) to return non-null values. The same projection path also resolves authored `urlQuery.{key}: $<action_field>` references against the action doc (e.g. `urlQuery.workflow_id: $child_workflow_id` on `track-installation`'s link) — required for the tracker action row to be clickable.
- [Part 6](modules-mongodb/designs/workflows-module/parts/_completed/06-submit-action-writes/design.md), [Part 7](../07-group-state-machine/design.md), [Part 8](modules-mongodb/designs/workflows-module/parts/_completed/08-side-effect-dispatch/design.md), [Part 10](modules-mongodb/designs/workflows-module/parts/_completed/10-tracker-subscription/design.md) — engine paths exercised end-to-end by the form/task/keyed/tracker demo flows. Already shipped.

## Verification

- **Per-status projection.** Walk through `get-entity-workflows` against a lead with at least one in-progress and one terminal action; confirm `link` is the structured `{ pageId, urlQuery }` block from the action's `status_map.{status}.demo.link` (not the literal string `"demo.link"`) and `message` is the per-status text (not `"demo.message"`). Repeat against `get-workflow-overview` and `get-action-group-overview`.
- **Build smoke.** `apps/demo` builds with the rewritten `onboarding` workflow. `makeActionPages` emits the expected page ids: `onboarding-qualify-edit`, `onboarding-qualify-view`, `onboarding-send-quote-edit`, `onboarding-send-quote-view`, `onboarding-send-quote-review`, `onboarding-schedule-followup-edit`, `onboarding-schedule-followup-view`, `onboarding-proof-of-installation-edit`, `onboarding-proof-of-installation-view`. `makeWorkflowApis` emits the expected endpoints: `update-action-qualify`, `update-action-send-quote`, `update-action-schedule-followup`, `update-action-proof-of-installation` (one per form/task action; `track-installation` emits none). Tracker action emits no per-action page or endpoint per [part 12](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md) + [part 13](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md).
- **Worked-example walk-through (manual).** Run, in order:
  1. Open lead-view → `actions-on-entity` renders five actions across three groups; `qualify` is `action-required`, everything else `blocked`.
  2. Click `qualify` → navigates to `workflows/onboarding-qualify-edit` → form renders.
  3. Submit → engine transitions `qualify` to `done` → log event + notifications fire via [part 8](modules-mongodb/designs/workflows-module/parts/_completed/08-side-effect-dispatch/design.md) → pre-hook also fires once [part 9](modules-mongodb/designs/workflows-module/parts/09-hook-invocation/design.md) lands.
  4. `send-quote` flips to `action-required` → submit → goes to `in-review` → review page → approve → `done`. Post-hook fires once part 9 lands.
  5. Group `g1` `on_complete` callback fires when `qualify` lands — observable via the configured callback API once [part 11](modules-mongodb/designs/workflows-module/parts/11-group-on-complete-fanout/design.md) lands.
  6. `schedule-followup` task → open `task-edit?action_id=<id>` → set fields, save → engine writes; comment lands in `metadata.comment` on the engine-emitted event ([part 13 design.md § Comment mapping](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md)).
  7. Click "Start onboarding" on lead-view → modal opens → add two device rows with distinct `device_serial` values → submit → both `proof-of-installation` action instances render under one parent slot in `actions-on-entity` and `workflow-overview`. Each is independently clickable into `workflows/onboarding-proof-of-installation-edit?action_id=<id>`.
  8. `track-installation` — click the tracker action on lead-view → navigates to the child `installation` workflow's `workflow-overview` page → click into the single `install-step` action card → opens `task-edit` → set status to `done`, save. The save fires `update-action-install-step`; the tracker subscription ([part 10](modules-mongodb/designs/workflows-module/parts/_completed/10-tracker-subscription/design.md)) fans the child's lifecycle up to the parent `track-installation` action; lead-view re-renders showing the parent tracker flipped to `done`. (The tracker action's link only lights up once engine-side runtime-field projection lands — see [Runtime-only deps](#runtime-only-verification-blocked-until-they-land); until then, the user reaches `workflow-overview` via a direct URL or via the same engine-side enhancement.)
- **Plugin version.** Manifest's pin to `@lowdefy/modules-mongodb-plugins` matches the version that ships `WorkflowAPI` + the version that adds `callApi`-aware handlers (part 1). Bump as needed.
- **E2E spec contribution.** This part lands the spec slices that need form/task pages or per-action endpoints: `submit-action.spec.js` (form-action `submit_edit` + form-review `approve` / `request_changes`), `hooks.spec.js` (pre/post hook — gated on part 9), `side-effects.spec.js` (log event + notifications via `callApi`), `group-on-complete.spec.js` (gated on part 11), `resolver-pages.spec.js` (emitted page ids match expected), `resolver-apis.spec.js` (emitted endpoint ids match expected), `shared-pages.spec.js` (task-edit save). Per the [part 22 e2e suite contract](modules-mongodb/designs/workflows-module/parts/22-workflows-e2e-suite/design.md). Tracker spec from 20a continues to pass via `track-installation`.
- **README accuracy.** "Exports" section lists resolver-emitted pages and endpoints inline (no part-20b pointer); README example builds against a real `vars.workflows_config` value; manifest is the source of truth (var schema mismatches between README and manifest fail review).

## Open questions

(None remaining. Two were resolved during initial review and recorded below.)

### Closed during review

- **Group structure under the four-kind shape.** Multiple actions per group is fine. `g2` carries both `send-quote` and `schedule-followup` to exercise two-actions-in-one-group + intra-group ordering via `sort_order`; `g3` carries `proof-of-installation` + `track-installation` so the tracker fan-up doesn't unblock anything else.
- **`proof-of-installation` start payload source.** Build a small start-onboarding modal on `lead-view` that collects per-device input via a `ControlledList`, then constructs the `actions:` array dynamically at submit time. Replaces the simpler "Start onboarding" button shipped in 20a. See [Proposed change](#proposed-change) item 3.

## Related

- Splits the original Part 20 — see [part 20a](modules-mongodb/designs/workflows-module/parts/_completed/20a-module-manifest-static/design.md) for the static half.
- [Concept module-surface spec](modules-mongodb/designs/workflows-module-concept/module-surface/spec.md) is the authoritative source for var shapes and export lists.
- [Concept worked example](modules-mongodb/designs/workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs) — the canonical end-to-end the demo grows into.
