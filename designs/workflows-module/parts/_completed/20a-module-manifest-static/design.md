# Part 20a — Module manifest (static surface) + tracker-only demo wiring

**Source rationale:** [workflows-module-concept/module-surface/spec.md](modules-mongodb/designs/workflows-module-concept/module-surface/spec.md). **Layer:** surface. **Size:** S. **Repo:** `modules/workflows/` + `apps/demo/`.

Split from the original Part 20. This half lands the manifest entries that do **not** depend on the upstream Lowdefy extensions in [part 01 (`callApi`)](../01-call-api-primitive/design.md) or [part 02 (dynamic module page exports)](../02-dynamic-module-pages/design.md), plus a tracker-only worked-example wiring that exercises the static surface end-to-end. The dynamic resolver-emitted exports — per-action pages from [part 12](../12-resolver-pages/design.md) and per-action submit endpoints from [part 13](../13-resolver-apis/design.md) — land in [part 20b](../20b-module-manifest-dynamic/design.md).

The split lets every static export (connections, shared pages, operational APIs, components, enums) be wired and verified before the upstream Lowdefy work (parts 01, 02) lands.

## Starting state

Most of the static surface already ships on disk. `modules/workflows/module.lowdefy.yaml` (currently v0.6.0) already declares all five shared pages (`task-edit`, `task-view`, `task-review`, `workflow-overview`, `group-overview`), all six operational APIs (`start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`), all three entity components (`actions-on-entity`, `workflow-header`, `action_role_check`), and both enums merged with their display-overrides vars (`action_statuses`, `workflow_lifecycle_stages`). The plugin pin is already `^0.6.0`. The files those entries reference exist under `modules/workflows/{api,components,enums,pages}/`.

What's missing is captured by the header comment at the top of the existing manifest: "WorkflowAPI connection, workflows-collection / actions-collection connections, MONGODB_URI secret, menu exports, user_schema + app_name + entities vars, form-fields component library (part 14)". This part closes everything in that list **except** the form-fields component library (deferred to [part 20b](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md)) and the menu exports (a separate concern — see "Out of scope"), and adds the demo wiring needed to exercise the static surface end-to-end.

## Goal

Close the static-surface gap against `modules/workflows/module.lowdefy.yaml` — add the three connection refs, the three missing vars (`app_name`, `user_schema`, `entities`), `dependencies:`, `secrets:`, and a top-level `connections:` key. Convert the module's last remaining `global:` export (`action_form_configs`) and every consumer-side `_global:` read site to the `components:` / `_ref: { module, component }` idiom, and propagate that to the concept spec. Ship `modules/workflows/README.md`. Wire a tracker-only onboarding workflow into `apps/demo/` so the closed surface runs end-to-end against a real entity without requiring resolver-emitted pages or per-action submit endpoints.

## Proposed change

1. **Connection files.** Author three YAML files under a new `modules/workflows/connections/` directory (the only export category not yet on disk): `workflows-collection.yaml` (`MongoDBCollection` on `workflows`), `actions-collection.yaml` (`MongoDBCollection` on `actions`), `workflow-api.yaml` (`WorkflowAPI` from `@lowdefy/modules-mongodb-plugins`, reading the normalized config emitted by [part 4](../04-workflow-config-schema/design.md)'s `makeWorkflowsConfig`).
2. **Manifest deltas.** Add to the existing `modules/workflows/module.lowdefy.yaml`:
   - Three `vars`: `app_name: string` (required), `user_schema: object` (default `{ roles_path: roles }`), `entities: object` (required) — see the "[`vars`](#vars-final-matching-the-concept-spec-plus-entities)" section below for the full schema.
   - `dependencies:` block (see "[`dependencies`](#dependencies)" below for the final list — the existing manifest has no `dependencies:` key).
   - `secrets:` block with `MONGODB_URI` (no `secrets:` key today).
   - Top-level `connections:` key with `_ref`s to the three files added in step 1.
   - `exports.connections:` entries naming the three connections.
   - Existing static exports (pages, APIs, components, enums) and the plugin pin stay as-is.
3. **README.** Author `modules/workflows/README.md` (file does not exist today). Fixed template per [CLAUDE.md "Documentation"](modules-mongodb/CLAUDE.md): Description, Dependencies, How to Use, Exports (Pages / Components / API Endpoints / Connections / Menus), Vars (narrative restating the manifest), Secrets, Plugins, Notes. Per-action pages and per-action submit endpoints get a "shipped in part 20b" pointer. The "How to Use" section carries a worked-example block for `vars.entities` showing at least one entry with all three subfields (`page_id`, `id_query_key`, `title`) — since `entities` is not in the concept spec, the README is the canonical place apps look for the shape.
4. **Demo module wiring.** Add the `workflows` module entry to `apps/demo/modules.yaml` with `vars.workflows_config`, `vars.entities`, `vars.app_name`, and `vars.user_schema` populated for the demo.
5. **Demo leads entity.** Add a `leads` connection inline in `apps/demo/lowdefy.yaml`'s `connections:` block (matching the existing `demo-contacts` inline entry at line 99 of the file) and four lead pages under `apps/demo/pages/leads/` (`lead-view.yaml`, `lead-edit.yaml`, `lead-new.yaml`, `lead-list.yaml`). This is the demo's actual app-specific pattern, not the reusable-module pattern under `modules/`.
6. **Demo workflow config.** Author a tracker-only worked-example onboarding workflow at `apps/demo/workflow_config/onboarding/` — three actions, exercising `kind: tracker` and `blocked_by` but no `kind: form` or `kind: task`.
7. **Convert global → components in the manifest.** Move `action_form_configs` from the `global:` block to `components:`; add it to `exports.components`; delete the `global:` block. Update the concept spec ([`module-surface/spec.md`](modules-mongodb/designs/workflows-module-concept/module-surface/spec.md)) so the enums sit under `components:` there too.
8. **Convert global → components in the consumer pages.** Rewrite every `_global: action_statuses` / `_global: workflow_lifecycle_stages` / `_global: action_form_configs` read site across the six shipped files (`pages/task-edit.yaml`, `pages/task-view.yaml`, `pages/task-review.yaml`, `pages/workflow-overview.yaml`, `pages/group-overview.yaml`, `components/workflow-header.yaml`) to use the build-time component ref `_ref: { module: workflows, component: <id> }`. Per repo convention ("[Review changes touching implemented parts](memory:feedback_review_implemented_parts.md)"), this is a small change folded into 20a rather than spun out; the touched files are owned by parts 17/18/25.

## Manifest scope — static surface only

This half adds everything in `module.lowdefy.yaml` _except_ the two resolver-channel entries that depend on [part 02](../02-dynamic-module-pages/design.md).

### `vars` (final, matching the [concept spec](modules-mongodb/designs/workflows-module-concept/module-surface/spec.md) plus `entities`)

The five vars below match the [concept spec](modules-mongodb/designs/workflows-module-concept/module-surface/spec.md) verbatim. `entities` is **not** in the concept spec — it was introduced by [part 17 shared-pages](modules-mongodb/designs/workflows-module/parts/_completed/17-shared-pages/design.md) (see "`entities` module var" there), which explicitly hands the manifest-level declaration to this part ("part 20 obligation: `vars.entities` declared with `type: object`, `required: true`").

- `workflows_config: array` (required) — app's workflow YAML.
- `app_name: string` (required) — host app deployment name.
- `entities: object` (required) — entity-collection → `{ page_id, id_query_key, title }` map. Introduced by [part 17 shared-pages](modules-mongodb/designs/workflows-module/parts/_completed/17-shared-pages/design.md); extended by [part 26](modules-mongodb/designs/workflows-module/parts/26-entity-data-contract/design.md).
- `user_schema: object` (default `{ roles_path: roles }`).
- `action_statuses_display: object` (default `{}`).
- `workflow_lifecycle_stages_display: object` (default `{}`).

Per the repo's docs convention (CLAUDE.md "Documentation"), every var description, type, `required`, `default`, and `enum` lives on `module.lowdefy.yaml` first — README narrative restates them but the manifest is the source of truth.

### `dependencies`

- `layout` — consumed by every shared page (`module: layout` refs in `pages/task-edit.yaml`, `pages/task-view.yaml`, `pages/task-review.yaml`, `pages/workflow-overview.yaml`, `pages/group-overview.yaml`).
- `events` — `connections/workflow-api.yaml` wires `changeStamp: { _ref: { module: events, component: change_stamp } }` so the WorkflowAPI plugin stamps every engine write (workflow + action doc inserts and updates) with `created` and `updated` metadata. The plugin schema documents this as the canonical wiring pattern ([WorkflowAPI/schema.js](modules-mongodb/plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js) line 54–58). Engine writes are real in 20a (`start-workflow`, `cancel-workflow`, `close-workflow`, tracker subscription fan-up) — leaving them un-stamped would be a behavioural gap, not a deferred feature.

`notifications` is **not** declared. The static surface doesn't reach `notifications`-module consumers — those land in [part 20b](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md) alongside the per-action endpoint that fires hook-driven and `event:`-override notifications. The one-line addition to `dependencies:` lands in 20b alongside its consumer.

### `connections` (refs to `connections/*.yaml`)

- `workflows-collection` — `MongoDBCollection` on `workflows`.
- `actions-collection` — `MongoDBCollection` on `actions`.
- `workflow-api` — `WorkflowAPI` from `@lowdefy/modules-mongodb-plugins`. Reads normalized config from [part 4](../04-workflow-config-schema/design.md)'s `makeWorkflowsConfig`.

### `plugins`

- `@lowdefy/modules-mongodb-plugins` at the version that ships `WorkflowAPI` (per [part 3](../03-engine-plugin-shell/design.md)). The pin matches `plugins/modules-mongodb-plugins/package.json` — currently `^0.6.0`, and the existing `modules/workflows/module.lowdefy.yaml` already carries that pin.

### Existing static exports (unchanged in shape, repositioned)

The pages, APIs, and components already declared in `modules/workflows/module.lowdefy.yaml` stay as-is. The enums (`action_statuses`, `workflow_lifecycle_stages`) are already declared as components on disk and stay there. See the existing manifest for the canonical list — the on-disk header comment lines 1–13 trace each entry back to the shipping part (17, 19, 23, 25 for pages/APIs; 18 for components; 4 for enums). The resolver-channel entries (`makeActionPages`, `makeWorkflowApis`) land in [part 20b](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md).

### Convert `global:` exports to `components:`

**Principle.** Module exports go through `exports.components` (addressable via `_ref: { module, component }`), not through `exports.global` and the `global:` register. The global register is app-level state shared across pages — using it as a module export surface leaks module internals into a flat namespace and breaks the scoped, build-tracked addressability that `_ref: { module, component }` provides.

The on-disk manifest already gets this right for the two enums (`action_statuses` / `workflow_lifecycle_stages` are declared under `components:`, lines 88–97 of `modules/workflows/module.lowdefy.yaml`). Two pieces of drift remain — both fixed in this part:

1. **`action_form_configs` is currently under `global:`** (`module.lowdefy.yaml` lines 123–130). It's a resolver-emitted register (part 15's `makeActionFormConfigs.js`) consumed by `workflow-overview` and `group-overview` as `_global: action_form_configs`. Move it to `components:` and add it to `exports.components`. Delete the `global:` block entirely (it's the only entry there).

2. **The shipped pages still consume the enums and `action_form_configs` via `_global:`** instead of via component refs. The enums' on-disk exports.components declaration is unreachable from consumers using `_global:` syntax. Rewrite each consumer site to use the build-time component ref `_ref: { module: workflows, component: <id> }`. Six files touched: `pages/task-edit.yaml`, `pages/task-view.yaml`, `pages/task-review.yaml`, `pages/workflow-overview.yaml`, `pages/group-overview.yaml`, `components/workflow-header.yaml`.

3. **Concept-spec drift.** The concept spec at [`module-surface/spec.md`](modules-mongodb/designs/workflows-module-concept/module-surface/spec.md) lines 113–117 still describes the enums under `global:`. Move them to `components:` in the spec so the canonical exports list matches the principle.

The `_global:` → `_ref: { module, component }` swap is a build-time read of the same enum data. Nothing in the existing consumer sites mutates the enums at runtime; every read is feeding static data into `_js` `params` or templated chrome (status badges, lifecycle labels, comment-banner copy). The swap is semantically equivalent for read-only data, and the build-time form has the benefit of being statically resolvable — broken refs fail the build instead of silently returning `undefined` at runtime.

### `secrets`

- `MONGODB_URI`.

## Tracker-only demo wiring (`apps/demo/`)

The original Part 20 wired the four-action worked example verbatim from the [concept worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs) — one action per kind, including `kind: form` and `kind: task`. Form actions need resolver-emitted pages (part 12) and resolver-emitted submit endpoints (part 13); task actions need the per-action endpoint to drive `task-edit`'s save. Both require [part 02](../02-dynamic-module-pages/design.md).

This half ships a **tracker-only-parent** variant that exercises every static surface without needing parts 01, 02, 12, or 13:

- **Parent workflow (onboarding).** Three actions, all `kind: tracker`, declared on a `leads-collection` entity. One `action_group` per action plus a starting-group + sequential `blocked_by` chain to exercise the group state machine ([part 7](../07-group-state-machine/design.md)).
- **Child workflow (installation).** One `kind: task` action declared on the same entity — the spec's documented "minimal workflow shim" (action-authoring/spec.md:489). Status driven via direct `close-workflow` / `cancel-workflow` calls. See "Child workflow rendering — skipped in 20a" below for why the child's `task-*` pages aren't surfaced in the demo UI.
- No `form:` authoring on either workflow; no `hooks:`, `interactions:`, or `event:` blocks (those flow through the per-action endpoint, which ships in part 20b).

A tracker-only flow exercises:

- `start-workflow` with a `parent_action_id` link (start the child workflow against the tracker parent — [part 5](../05-start-cancel-handlers/design.md)).
- The tracker subscription's child→parent fan-up (engine-internal, [part 10](modules-mongodb/designs/workflows-module/parts/_completed/10-tracker-subscription/design.md)).
- Group state machine + `blocked_by` re-evaluation as tracker actions transition between `blocked`, `action-required`, `in-progress`, `done` ([part 7](../07-group-state-machine/design.md)).
- `cancel-workflow` and `close-workflow` ([parts 5](../05-start-cancel-handlers/design.md) + [23](modules-mongodb/designs/workflows-module/parts/_completed/23-close-workflow-handler/design.md)).
- `get-entity-workflows` rendered via `actions-on-entity` on the lead page ([part 18](../18-entity-components/design.md)).
- `get-workflow-overview` rendered via the `workflow-overview` page ([part 17](modules-mongodb/designs/workflows-module/parts/_completed/17-shared-pages/design.md)).
- `get-action-group-overview` rendered via the `group-overview` page ([part 25](modules-mongodb/designs/workflows-module/parts/_completed/25-group-overview-page/design.md)).

What it does **not** exercise (deferred to part 20b's demo extension):

- Form-action pages (`-edit` / `-view` / `-review` / `-error`).
- Per-action `update-action-{action_type}` endpoints.
- `submit_edit` / `approve` / `request_changes` interactions, pre/post hooks, `event:` overrides, `on_complete` group fan-out.
- Task-action `task-edit` / `task-review` save flow. The shared task pages are declared in the manifest and resolve at build time, but the demo's parent tracker action does not link into them — the only task action in the demo is the child workflow's "installation step," whose pages are intentionally not surfaced (see "Child workflow rendering — skipped in 20a" below). Writes against `update-action-{task_type}` ship in part 20b.

### Files added under `apps/demo/`

- `apps/demo/modules.yaml` — add `workflows` module entry with vars listed above.
- `apps/demo/workflow_config/onboarding/onboarding.yaml` — workflow definition with three tracker actions + `action_groups[]` declaration. The `apps/demo/workflow_config/` directory is new (no existing demo workflow configs); the workflows module reads it via the demo's `modules.yaml` `workflows` entry: `vars.workflows_config: { _ref: workflow_config/workflows.yaml }` (or an inline `_ref` array). [Part 4](../04-workflow-config-schema/design.md)'s `makeWorkflowsConfig` validator consumes the resolved array at build time.
- `apps/demo/workflow_config/onboarding/track-step-1.yaml`, `track-step-2.yaml`, `track-step-3.yaml` — three `kind: tracker` action YAML files (one per step), each with a `tracker:` block pointing at the `installation` child `workflow_type`.
- `apps/demo/workflow_config/installation/installation.yaml` — minimal child workflow: one `kind: task` action ("installation step"). This is the spec's documented "minimal workflow shim" for tracking simple entities ([action-authoring/spec.md § Tracking simple entities](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md) line 489: "for entities whose lifecycle is a single status field, declare a minimal workflow with one `kind: task` action; the user marks it `done` (or app calls `cancel-workflow`) and the existing tracker subscription flips the parent"). Schema requires a real `workflow_type` on the parent's `tracker:` block (line 99 of action-authoring/spec); a placeholder pointed at nothing isn't valid.
- `apps/demo/pages/leads/lead-view.yaml`, `lead-edit.yaml`, `lead-new.yaml`, `lead-list.yaml` — demo-only lead pages. `apps/demo/pages/` currently holds only top-level pages (`404.yaml`, `avatar.yaml`, `home.yaml`, `router.yaml`); this is the first domain subdirectory under it, by design (the demo doesn't have a publishable `leads` module — these are inline demo pages, not module exports).
- `apps/demo/lowdefy.yaml` — two edits:
  - Extend the existing `connections:` block (currently containing one entry: `demo-contacts` at line 99) with a `leads-collection` `MongoDBCollection` on collection `leads`. The connection ID is `leads-collection` (not `leads`) to align with the workflow concept spec's definition of `entity_collection` as the MongoDB collection connection id ([module-surface/spec.md](modules-mongodb/designs/workflows-module-concept/module-surface/spec.md)) and with the keys used in `vars.entities` and `entity_collection` fields on the workflow YAML. No new top-level `connections/` directory in `apps/demo/` — the connection lives inline alongside `demo-contacts`.
  - Extend the existing `pages:` block (line 107 onward) with `_ref`s to the four `pages/leads/*.yaml` files.
- Demo menu addition: "Workflows" entry on the CRM menu + a "Start onboarding" button on `lead-view` that calls `start-workflow`. **No link** from the parent tracker action into the child workflow's `task-edit` page — see "Child workflow rendering" below.

### Child workflow rendering — skipped in 20a

The child `installation` workflow exists in MongoDB (so the tracker subscription has something to fan up from) but the demo UI never renders its `task-edit` / `task-view` pages. Rationale: `task-edit`'s Save button calls `update-action-{task_type}` which ships in [part 20b](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md). Linking the parent tracker action into the child's task page would surface a dead Save button — exactly the "this button is dead until 20b" UX the design otherwise avoids.

Instead, the demo drives the child workflow's lifecycle via direct `close-workflow` / `cancel-workflow` calls (per spec line 489's "app calls `cancel-workflow`" path):

- A "Close installation child" admin-style button on `lead-view` calls `close-workflow` with the parent tracker action's `child_workflow_id` for verification step 5 of the walk-through below.
- A "Cancel installation child" admin-style button on `lead-view` calls `cancel-workflow` with the same id, used during exploration but not part of the canonical walk-through.

When 20b lands, the demo extension wires the link from the parent tracker action into the child's `task-edit` page and removes the admin-style buttons.

## Per-module README (`modules/workflows/README.md`)

Per the [CLAUDE.md docs section](modules-mongodb/CLAUDE.md), the README uses the fixed template — Description, Dependencies, How to Use, Exports (Pages / Components / API Endpoints / Connections / Menus), Vars (narrative matching `module.lowdefy.yaml` verbatim), Secrets, Plugins, Notes.

The "Exports" section's _pages_ and _api_ lists carry the static entries shipped here plus a one-line callout: "Per-action pages (`-edit` / `-view` / `-review` / `-error`) and per-action submit endpoints (`update-action-{action_type}`) ship in part 20b; see [docs/idioms.md](../../docs/idioms.md) anchors if a new idiom emerges." Part 20b updates the README in place when it lands.

## Out of scope / deferred

- **Resolver-channel manifest entries.** `makeActionPages` and `makeWorkflowApis` resolver entries — deferred to [part 20b](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md).
- **Form-action and task-action demo flows.** Anything that needs `update-action-{action_type}` to write a transition — deferred to part 20b.
- **End-to-end Playwright e2e tests.** Owned by [part 22](modules-mongodb/designs/workflows-module/parts/22-workflows-e2e-suite/design.md). Each shipping part contributes its spec; the operational-APIs spec lands as part of this half's verification path.
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
- [Part 10](modules-mongodb/designs/workflows-module/parts/_completed/10-tracker-subscription/design.md) — tracker subscription (fans up child lifecycle into the parent tracker action).
- [Part 17](modules-mongodb/designs/workflows-module/parts/_completed/17-shared-pages/design.md) — `task-edit` / `task-view` / `task-review` / `workflow-overview` page files.
- [Part 18](../18-entity-components/design.md) — `actions-on-entity` / `workflow-header` / `action_role_check` components.
- [Part 19](modules-mongodb/designs/workflows-module/parts/_completed/19-operational-apis/design.md) — four operational APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`).
- [Part 21](../21-entity-type-to-collection/design.md) — `entity_collection` as the sole entity-identity scalar.
- [Part 23](modules-mongodb/designs/workflows-module/parts/_completed/23-close-workflow-handler/design.md) — `close-workflow` API + handler.
- [Part 25](modules-mongodb/designs/workflows-module/parts/_completed/25-group-overview-page/design.md) — `group-overview` page + `get-action-group-overview` API.

Does **not** depend on parts [01](../01-call-api-primitive/design.md), [02](../02-dynamic-module-pages/design.md), [12](../12-resolver-pages/design.md), [13](../13-resolver-apis/design.md), [14](../../14-form-components-library/design.md), [15](../../15-resolver-form-builder/design.md), [16](../16-page-templates/design.md), [24](designs/workflows-module/parts/_completed/24-universal-fields/design.md), or [28](designs/workflows-module/parts/28-custom-action-kind/design.md). Those land via [part 20b](../20b-module-manifest-dynamic/design.md) or are independent of this manifest split.

## Verification

- **Build smoke.** After wiring the workflows module entry into `apps/demo/modules.yaml` with the new vars (`workflows_config`, `app_name`, `user_schema`, `entities`), `apps/demo` builds with no missing `_ref` errors; the manifest carries the three new connection refs, the three new vars, `dependencies:`, `secrets:`, and the existing static exports unchanged; [part 4](../04-workflow-config-schema/design.md)'s `vars.entities` completeness validator passes on the tracker-only worked example.
- **Tracker-only worked-example walk-through (manual).** Run, in order:
  1. Open the lead-view page → `actions-on-entity` renders three tracker actions, the first in `action-required`, the rest `blocked`.
  2. Click "Start onboarding" → first tracker action transitions to `in-progress` (engine writes through the `start-workflow` API; tracker subscription fires from the child workflow start).
  3. Open the workflow-overview page → all three actions render in declaration order with current status, summary tile, and lifecycle badge.
  4. Open the group-overview page for the workflow's first `action_group` → renders the single action in that group with its status timeline.
  5. Close the child workflow via `close-workflow` → parent tracker action transitions to `done`; second tracker action flips from `blocked` to `action-required` via `blocked_by` re-evaluation; group state machine fires the right transitions.
  6. Cancel the lead's workflow via `cancel-workflow` → remaining tracker actions flip to `not-required`; lifecycle badge shows `cancelled`; `actions-on-entity` re-renders with terminal-state styling.
- **README accuracy.** Every var listed in `module.lowdefy.yaml` has a matching narrative entry in `README.md`; every export in the README exists in the manifest (and vice versa); plugin version pin matches `plugins/modules-mongodb-plugins/package.json`.
- **E2E spec contribution.** This part lands a single spec at `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js` per the [part 22 e2e suite contract](modules-mongodb/designs/workflows-module/parts/22-workflows-e2e-suite/design.md). The spec automates the six-step tracker-only walk-through above: lead-view renders three tracker actions in the right initial state; "Start onboarding" transitions the first to `in-progress`; `workflow-overview` and `group-overview` render correctly; closing the child workflow flips the parent tracker to `done` and unblocks the second tracker via `blocked_by` re-evaluation; `cancel-workflow` flips remaining trackers to `not-required` and the workflow lifecycle to `cancelled`. Engine-internal e2e specs (parts 6/8/9/11) defer to part 20b.

## Open questions

(None remaining. Two were resolved during review and recorded below.)

### Closed during review

- **Skeleton `makeActionPages` / `makeWorkflowApis` resolvers.** Skip. Pre-registering no-op resolvers would require [part 02](../02-dynamic-module-pages/design.md)'s resolver channel shape, which is the very dependency this split is built to avoid. The resolver-channel entries land cleanly in [part 20b](../20b-module-manifest-dynamic/design.md) alongside the resolvers themselves.
- **Child workflow shape for the tracker-only demo.** Resolved as a `kind: task` "installation step" workflow (the spec's documented minimal shim, action-authoring/spec.md:489) whose pages are intentionally not surfaced in the demo UI. See "Child workflow rendering — skipped in 20a" above.
- **Part 27 fate.** Retire. Part 27 (demo-workflows-wiring) was originally scoped for the full worked example. After this split, 20a absorbs the static-testable demo wiring (tracker-only) and 20b absorbs the form/task demo flows — leaving Part 27 with nothing of its own to ship. The retirement was applied during the consistency review: the part 27 directory was deleted, its row was removed from [implementation-plan.md](implementation-plan.md), and the "Part 27 spun out" sentence in the plan's "Shipped so far" paragraph was rewritten. Historical references to Part 27 inside completed-parts task files (`_completed/17-shared-pages/tasks/`, `_completed/18-entity-components/tasks/`, `_completed/25-group-overview-page/tasks/`) are left intact as accurate records of what those parts spun out at the time. Keeping a "thin verification-record pointer" version would have created three places (20a verification, 20b verification, Part 27) that all claim to verify the same thing — net negative.

## Related

- Splits the original Part 20 — see [part 20b](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md) for the dynamic half.
- [Concept module-surface spec](modules-mongodb/designs/workflows-module-concept/module-surface/spec.md) is the authoritative source for var shapes and export lists.
