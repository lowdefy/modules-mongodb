# Part 20a — Module manifest (static surface) + tracker-only demo wiring

**Source rationale:** [workflows-module-concept/module-surface/spec.md](../../../workflows-module-concept/module-surface/spec.md). **Layer:** surface. **Size:** S. **Repo:** `modules/workflows/` + `apps/demo/`.

Split from the original Part 20. This half lands the manifest entries that do **not** depend on the upstream Lowdefy extensions in [part 01 (`callApi`)](../01-call-api-primitive/design.md) or [part 02 (dynamic module page exports)](../02-dynamic-module-pages/design.md), plus a tracker-only worked-example wiring that exercises the static surface end-to-end. The dynamic resolver-emitted exports — per-action pages from [part 12](../12-resolver-pages/design.md) and per-action submit endpoints from [part 13](../13-resolver-apis/design.md) — land in [part 20b](../20b-module-manifest-dynamic/design.md).

The split lets every static export (connections, shared pages, operational APIs, components, enums) be wired and verified before the upstream Lowdefy work (parts 01, 02) lands.

## Goal

Ship `module.lowdefy.yaml` with every export that depends only on parts already in the module — three connections, four shared pages, six operational APIs, three entity components, two enums, every var, every dependency, the plugin pin, and the secrets list. Add a tracker-only onboarding workflow under `apps/demo/workflow_config/onboarding/` plus the leads collection + lead pages needed to host it, so the static surface runs end-to-end against a real entity without requiring resolver-emitted pages or per-action submit endpoints.

## Proposed change

1. Author `modules/workflows/module.lowdefy.yaml` with every static export, every var (matching the [concept spec](../../../workflows-module-concept/module-surface/spec.md) verbatim), three connection refs, `dependencies: [layout, events, notifications]`, and `plugins: ["@lowdefy/modules-mongodb-plugins": "^0.4.x"]`.
2. Add the three connection config files under `modules/workflows/connections/`: `workflows-collection.yaml`, `actions-collection.yaml`, `workflow-api.yaml`.
3. Wire the `workflows` module entry into `apps/demo/modules.yaml` with `vars.workflows_config`, `vars.entities`, `vars.app_name`, and `vars.user_schema`.
4. Add a leads collection + four lead pages (`lead-view`, `lead-edit`, `lead-new`, `lead-list`) to `apps/demo/`, mirroring the contacts-module pattern already in the demo.
5. Author a tracker-only worked-example onboarding workflow at `apps/demo/workflow_config/onboarding/` — three actions, exercising `kind: tracker` and `blocked_by` but no `kind: form` or `kind: task`.
6. Ship `modules/workflows/README.md` covering the static surface — vars, exports, dependencies, secrets, plugins, notes. Per-action pages and per-action submit endpoints get a "shipped in part 20b" pointer.

## Manifest scope — static surface only

This half adds everything in `module.lowdefy.yaml` *except* the two resolver-channel entries that depend on [part 02](../02-dynamic-module-pages/design.md).

### `vars` (final, matching the [concept spec](../../../workflows-module-concept/module-surface/spec.md))

- `workflows_config: array` (required) — app's workflow YAML.
- `app_name: string` (required) — host app deployment name.
- `entities: object` (required) — entity-collection → `{ page_id, id_query_key, title }` map. Introduced by [part 17 shared-pages](../_completed/17-shared-pages/design.md); extended by [part 26](../26-entity-data-contract/design.md).
- `user_schema: object` (default `{ roles_path: roles }`).
- `action_statuses_display: object` (default `{}`).
- `workflow_lifecycle_stages_display: object` (default `{}`).

Per the repo's docs convention (CLAUDE.md "Documentation"), every var description, type, `required`, `default`, and `enum` lives on `module.lowdefy.yaml` first — README narrative restates them but the manifest is the source of truth.

### `dependencies`

- `layout`
- `events`
- `notifications`

### `connections` (refs to `connections/*.yaml`)

- `workflows-collection` — `MongoDBCollection` on `workflows`.
- `actions-collection` — `MongoDBCollection` on `actions`.
- `workflow-api` — `WorkflowAPI` from `@lowdefy/modules-mongodb-plugins`. Reads normalized config from [part 4](../04-workflow-config-schema/design.md)'s `makeWorkflowsConfig`.

### `plugins`

- `@lowdefy/modules-mongodb-plugins` at the version that ships `WorkflowAPI` (per [part 3](../03-engine-plugin-shell/design.md) — bumped to `^0.4.x` to match what's in `plugins/modules-mongodb-plugins/package.json` when this part lands).

### `exports.pages` — static only

- `task-edit`, `task-view`, `task-review` (from [part 17 shared-pages](../_completed/17-shared-pages/design.md)).
- `workflow-overview` (from [part 17](../_completed/17-shared-pages/design.md)).
- `group-overview` (from [part 25](../_completed/25-group-overview-page/design.md)).

The `makeActionPages` resolver channel entry lands in [part 20b](../20b-module-manifest-dynamic/design.md).

### `exports.api` — static only

- `start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview` (from [part 19](../_completed/19-operational-apis/design.md)).
- `close-workflow` (from [part 23](../_completed/23-close-workflow-handler/design.md)).
- `get-action-group-overview` (from [part 25](../_completed/25-group-overview-page/design.md)).

The `makeWorkflowApis` resolver channel entry — emitting one `update-action-{action_type}` per form/task action — lands in [part 20b](../20b-module-manifest-dynamic/design.md).

### `exports.components`

- `actions-on-entity`, `workflow-header`, `action_role_check` (from [part 18 entity-components](../18-entity-components/design.md)).

### `exports.global` (enums)

- `action_statuses` (from [part 4](../04-workflow-config-schema/design.md); merged with `vars.action_statuses_display` at build time).
- `workflow_lifecycle_stages` (from [part 4](../04-workflow-config-schema/design.md); merged with `vars.workflow_lifecycle_stages_display`).

### `secrets`

- `MONGODB_URI`.

## Tracker-only demo wiring (`apps/demo/`)

The original Part 20 wired the four-action worked example verbatim from the [concept worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs) — one action per kind, including `kind: form` and `kind: task`. Form actions need resolver-emitted pages (part 12) and resolver-emitted submit endpoints (part 13); task actions need the per-action endpoint to drive `task-edit`'s save. Both require [part 02](../02-dynamic-module-pages/design.md).

This half ships a **tracker-only** variant that exercises every static surface without needing parts 01, 02, 12, or 13:

- Three actions, all `kind: tracker`, declared on a `leads-collection` entity.
- A child workflow on a `tickets` entity that the tracker action watches.
- One `action_group` per action plus a starting-group + sequential `blocked_by` chain to exercise the group state machine ([part 7](../07-group-state-machine/design.md)).
- No `form:` or `tracker:`-on-non-tracker-action authoring; no `hooks:`, `interactions:`, or `event:` blocks (those flow through the per-action endpoint).

A tracker-only flow exercises:

- `start-workflow` with a `parent_action_id` link (start the child workflow against the tracker parent — [part 5](../05-start-cancel-handlers/design.md)).
- The tracker subscription's child→parent fan-up (engine-internal, [part 10](../_completed/10-tracker-subscription/design.md)).
- Group state machine + `blocked_by` re-evaluation as tracker actions transition between `blocked`, `action-required`, `in-progress`, `done` ([part 7](../07-group-state-machine/design.md)).
- `cancel-workflow` and `close-workflow` ([parts 5](../05-start-cancel-handlers/design.md) + [23](../_completed/23-close-workflow-handler/design.md)).
- `get-entity-workflows` rendered via `actions-on-entity` on the lead page ([part 18](../18-entity-components/design.md)).
- `get-workflow-overview` rendered via the `workflow-overview` page ([part 17](../_completed/17-shared-pages/design.md)).
- `get-action-group-overview` rendered via the `group-overview` page ([part 25](../_completed/25-group-overview-page/design.md)).

What it does **not** exercise (deferred to part 20b's demo extension):

- Form-action pages (`-edit` / `-view` / `-review` / `-error`).
- Per-action `update-action-{action_type}` endpoints.
- `submit_edit` / `approve` / `request_changes` interactions, pre/post hooks, `event:` overrides, `on_complete` group fan-out.
- Task-action `task-edit` / `task-review` save flow (the task pages render, but writes happen via `update-action-{task_type}` which lives in part 20b).

### Files added under `apps/demo/`

- `apps/demo/modules.yaml` — add `workflows` module entry with vars listed above.
- `apps/demo/workflow_config/onboarding/onboarding.yaml` — workflow definition with three tracker actions + `action_groups[]` declaration.
- `apps/demo/workflow_config/onboarding/track-step-1.yaml`, `track-step-2.yaml`, `track-step-3.yaml` — three `kind: tracker` action YAML files (one per step), each with a `tracker:` block pointing at a child `device-installation`-style workflow.
- `apps/demo/workflow_config/installation/` — minimal child workflow (could be tracker-only too, or a one-step `kind: task` placeholder that the static half doesn't drive — the tracker subscription only watches lifecycle status, not action-level activity).
- `apps/demo/pages/leads/` — `lead-view.yaml`, `lead-edit.yaml`, `lead-new.yaml`, `lead-list.yaml` (mirrors `apps/demo/pages/contacts/` structure).
- `apps/demo/connections/leads-collection.yaml` — `MongoDBCollection` on `leads`.
- Demo menu addition: "Workflows" entry on the CRM menu + a "Start onboarding" button on `lead-view` that calls `start-workflow`.

### Open question — child workflow shape

The child workflow the tracker action watches needs to exist for the subscription to fan up. Two options:

1. Make the child workflow tracker-only too (a placeholder that an admin starts/cancels manually). Simplest; keeps part 20a pure.
2. Make the child workflow a `kind: task` with one action, and acknowledge the task-edit save won't work until part 20b ships. The lifecycle still transitions via `cancel-workflow` / `close-workflow` directly. Slightly richer demo but introduces "this button is dead until part 20b" UX.

Lean toward option 1 (a pure tracker placeholder child); revisit during execution.

## Per-module README (`modules/workflows/README.md`)

Per the [CLAUDE.md docs section](../../../../CLAUDE.md), the README uses the fixed template — Description, Dependencies, How to Use, Exports (Pages / Components / API Endpoints / Connections / Menus), Vars (narrative matching `module.lowdefy.yaml` verbatim), Secrets, Plugins, Notes.

The "Exports" section's *pages* and *api* lists carry the static entries shipped here plus a one-line callout: "Per-action pages (`-edit` / `-view` / `-review` / `-error`) and per-action submit endpoints (`update-action-{action_type}`) ship in part 20b; see [docs/idioms.md](../../docs/idioms.md) anchors if a new idiom emerges." Part 20b updates the README in place when it lands.

## Out of scope / deferred

- **Resolver-channel manifest entries.** `makeActionPages` and `makeWorkflowApis` resolver entries — deferred to [part 20b](../20b-module-manifest-dynamic/design.md).
- **Form-action and task-action demo flows.** Anything that needs `update-action-{action_type}` to write a transition — deferred to part 20b.
- **End-to-end Playwright e2e tests.** Owned by [part 22](../22-workflows-e2e-suite/design.md). Each shipping part contributes its spec; the operational-APIs spec lands as part of this half's verification path.
- **Per-action page demo flows.** Form-action `submit_edit` from the demo lead page — deferred to part 20b.
- **Pre/post hooks demo wiring.** Hook files exist as static demo Lowdefy APIs once the per-action endpoint exists (part 20b). Static surface doesn't reach them.
- **Migration tooling** — concept marks as out of v1.
- **Cleanup of `designs/workflows-module-concept/ui/example_workflow/`** — orthogonal to the split; revisit after part 20b lands.

## Depends on

Every part that ships a static manifest entry referenced here:

- [Part 3](../03-engine-plugin-shell/design.md) — `WorkflowAPI` plugin (for `workflow-api` connection).
- [Part 4](../04-workflow-config-schema/design.md) — `makeWorkflowsConfig` validator + status / lifecycle enums.
- [Part 5](../05-start-cancel-handlers/design.md) — `StartWorkflow` + `CancelWorkflow` handlers.
- [Part 7](../07-group-state-machine/design.md) — group state machine (for cancel sweep + tracker fan-up to write `groups[]`).
- [Part 10](../_completed/10-tracker-subscription/design.md) — tracker subscription (fans up child lifecycle into the parent tracker action).
- [Part 17](../_completed/17-shared-pages/design.md) — `task-edit` / `task-view` / `task-review` / `workflow-overview` page files.
- [Part 18](../18-entity-components/design.md) — `actions-on-entity` / `workflow-header` / `action_role_check` components.
- [Part 19](../_completed/19-operational-apis/design.md) — five operational APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`, the build-time validator hooks for `vars.entities`).
- [Part 21](../21-entity-type-to-collection/design.md) — `entity_collection` as the sole entity-identity scalar.
- [Part 23](../_completed/23-close-workflow-handler/design.md) — `close-workflow` API + handler.
- [Part 25](../_completed/25-group-overview-page/design.md) — `group-overview` page + `get-action-group-overview` API.

Does **not** depend on parts [01](../01-call-api-primitive/design.md), [02](../02-dynamic-module-pages/design.md), [12](../12-resolver-pages/design.md), [13](../13-resolver-apis/design.md), [14](../14-form-components-library/design.md), [15](../15-resolver-form-builder/design.md), [16](../_completed/16-page-templates/design.md), [24](../24-universal-fields/design.md), or [28](../28-custom-action-kind/design.md). Those land via [part 20b](../20b-module-manifest-dynamic/design.md) or are independent of this manifest split.

## Verification

- **Build smoke.** `apps/demo` builds with the `workflows` module entry; no missing `_ref` errors; manifest declares all six exports listed above; manifest validator (whatever part 4 + part 26 wire up for `vars.entities` completeness) passes on the tracker-only worked example.
- **Tracker-only worked-example walk-through (manual).** Run, in order:
  1. Open the lead-view page → `actions-on-entity` renders three tracker actions, the first in `action-required`, the rest `blocked`.
  2. Click "Start onboarding" → first tracker action transitions to `in-progress` (engine writes through the `start-workflow` API; tracker subscription fires from the child workflow start).
  3. Open the workflow-overview page → all three actions render in declaration order with current status, summary tile, and lifecycle badge.
  4. Open the group-overview page for the workflow's first `action_group` → renders the single action in that group with its status timeline.
  5. Close the child workflow via `close-workflow` → parent tracker action transitions to `done`; second tracker action flips from `blocked` to `action-required` via `blocked_by` re-evaluation; group state machine fires the right transitions.
  6. Cancel the lead's workflow via `cancel-workflow` → remaining tracker actions flip to `not-required`; lifecycle badge shows `cancelled`; `actions-on-entity` re-renders with terminal-state styling.
- **README accuracy.** Every var listed in `module.lowdefy.yaml` has a matching narrative entry in `README.md`; every export in the README exists in the manifest (and vice versa); plugin version pin matches `plugins/modules-mongodb-plugins/package.json`.
- **E2E spec contribution.** This part lands a `start-cancel-close.spec.js` / `tracker-subscription.spec.js` slice under `apps/demo/e2e/workflows/` (or equivalent) per the [part 22 e2e suite contract](../22-workflows-e2e-suite/design.md). Engine-internal e2e specs (parts 6/8/9/11) defer to part 20b.

## Open questions

- **Where Part 27 lands once 20a + 20b ship.** [Part 27 (demo-workflows-wiring)](../27-demo-workflows-wiring/design.md) was originally scoped for the full worked example. After this split, 20a absorbs the static-testable demo wiring (tracker-only), and 20b absorbs the form/task demo flows. Part 27 becomes redundant — either retire it or repurpose as a thin "verification record" pointer once 20b lands.
- **Whether 20a needs a "skeleton" `makeActionPages` / `makeWorkflowApis` resolver path.** A no-op resolver registered against the static manifest (returning `[]`) would let 20a wire the resolver-channel keys early so 20b is a pure code change with no manifest churn. Costs: relies on part 02 already accepting the channel shape. Probably skip — leave manifest entries to 20b.
- **Child workflow shape for the tracker-only demo.** See "Open question — child workflow shape" above.

## Related

- Splits the original Part 20 — see [part 20b](../20b-module-manifest-dynamic/design.md) for the dynamic half.
- [Concept module-surface spec](../../../workflows-module-concept/module-surface/spec.md) is the authoritative source for var shapes and export lists.
