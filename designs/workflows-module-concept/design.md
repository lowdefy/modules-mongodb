# Workflows Module Design

The module-level design for the `workflows` module — a modules-mongodb module that supports multiple parallel workflows on one entity, with a two-collection schema (`workflows` + `actions`), a status-array history shape, an opinionated access model anchored on the user-admin module's user schema, and an engine-orchestrated submit pipeline (`SubmitWorkflowAction`) that owns the full lifecycle (validate → pre-hook → writes → side effects → post-hook) with per-interaction `hooks:` as the author's pre/post extension points. The transition model layers `blocked_by` over engine-evaluated unblocks; the engine writes form_data, log events, notifications, and tracker subscription propagation in one in-process invocation.

The design splits into seven sub-designs by concern. This parent doc carries the framing, an end-to-end worked example that exercises all seven sub-designs, and the cross-cutting open questions / non-goals / risks. Each sub-design is self-contained at its own layer.

| Sub-design                                     | What it owns                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [engine](engine/design.md)                     | Server-side workflow engine — `WorkflowAPI` plugin, references write contract, tracker subscription, status enum priority rule.                                                                                                                                                                                                                                             |
| [module-surface](module-surface/design.md)     | `module.lowdefy.yaml` manifest (exports, vars, dependencies) and the four module APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`) that apps call. The submit endpoint is per-action and resolver-emitted (`update-action-{action_type}`) per submit-pipeline.                                                                    |
| [action-authoring](action-authoring/design.md) | YAML surface for workflows and actions — three action kinds (form / task / tracker) declared via required `kind:` field, universal fields (`assignees`, `due_date`, `description`), tracker `tracker:` block, resolver pipeline, form components library, module-shipped status enum.                                                                                       |
| [ui](ui/design.md)                             | Per-action page generation strategy, form-action templates (`edit` / `view` / `review` / `error`), static `task-edit` / `task-view` / `task-review` pages, and the three entity-page UI components (`actions-on-entity`, `workflow-header`, `action_role_check`).                                                                                                           |
| [action-groups](action-groups/design.md)       | Elevates `action_group` from UI label to engine concept — workflow-level `action_groups:` declaration, persisted three-value group status on the workflow doc, `blocked_by` accepting group IDs, engine-driven `blocked_by` re-evaluation, optional per-group `on_complete` hook (mechanism TBD).                                                                           |
| [submit-pipeline](submit-pipeline/design.md)   | Engine-orchestrated submit lifecycle — `SubmitWorkflowAction` plugin request replacing `UpdateWorkflowActions`, per-action `update-action-{action_type}` resolver-emitted APIs, fixed button vocabulary on templates, pre/post hooks per interaction, default log event shape. Supersedes the routine-orchestrated `submit-action` shape in module-surface Decisions 4 & 5. |
| [call-api](call-api/design.md)                 | Upstream-Lowdefy primitive that submit-pipeline depends on — `context.callApi(endpointId, payload)` capability on plugin connections, auth-context inheritance, depth-limit guard, error propagation. First-time work in `@lowdefy/api`.                                                                                                                                    |

## Problem

The module exists to give apps a uniform way to run multi-step business processes on any entity. Apps drop the module into their `modules.yaml`, supply a `workflows_config` describing their workflows and actions, and get:

- A persistent workflow + action data model with priority-based status transitions, eager summary writeback, and auto-complete semantics.
- A small server API surface — four module-level operational APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`) plus one resolver-generated per-action submit endpoint (`update-action-{action_type}`) per form / task action.
- Page generation per action — form-action pages emitted per `(workflow_type, action_type, verb)`; task-action shared pages addressed by `?action_id=<id>`; tracker actions rendered inline.
- An entity-page block (`actions-on-entity`) that renders an entity's workflows + grouped action lists end-to-end.
- A small form components library that lets authors compose action `form:` blocks from reusable building blocks.

The seven sub-designs commit:

- The shape of the module's `module.lowdefy.yaml` and the API consuming apps see — [module-surface](module-surface/design.md).
- **Where per-action pages live**, and what page kinds exist for form / task / tracker actions — [ui](ui/design.md).
- The submit-time API surface — resolver-emitted per-action `update-action-{action_type}` endpoints; engine-orchestrated lifecycle with pre/post hooks per interaction; fixed button vocabulary on templates — [submit-pipeline](submit-pipeline/design.md).
- The plugin mechanics for the server-side `WorkflowAPI` connection in `@lowdefy/modules-mongodb-plugins`, the references write contract, and the synchronous in-process tracker subscription — [engine](engine/design.md).
- The shape of the default Nunjucks page templates the module ships, plus the form components library — [ui](ui/design.md) for templates, [action-authoring](action-authoring/design.md) for the components library.
- The YAML grammar for tracker actions (`tracker:` block on the action), the universal action fields, the action-kind taxonomy, the status enum, and the resolver pipeline — [action-authoring](action-authoring/design.md).
- Action groups as a first-class engine concept — workflow-level `action_groups:` declaration, persisted group status on the workflow doc, group references in `blocked_by`, engine-driven unblock evaluation, optional `on_complete` hook per group — [action-groups](action-groups/design.md).
- The upstream Lowdefy primitive (`context.callApi`) that submit-pipeline depends on — [call-api](call-api/design.md).

## Reference Material

The design lifts heavily from existing modules-mongodb modules:

- **[`modules-mongodb/modules/events`](../../modules/events/)** — closest existing analogue (server-side connection + API + components + `references` field shape). Read [`events/module.lowdefy.yaml`](../../modules/events/module.lowdefy.yaml) and [`events/api/new-event.yaml`](../../modules/events/api/new-event.yaml) as concrete examples of the exports / vars / api / connections shape.
- **[`modules-mongodb/modules/companies`](../../modules/companies/)** — module that ships pages (`all`, `view`, `edit`, `new`). Demonstrates the page-export pattern for static pages.
- **[`modules-mongodb/CLAUDE.md`](../../CLAUDE.md)** — module-system conventions: ID scoping, `_module.pageId` / `_module.connectionId` / `_module.endpointId` / `_module.var` operators, page-id verb conventions (`all` / `view` / `edit` / `new`).

## Worked example — end to end across all seven sub-designs

A minimal end-to-end flow demonstrating the sub-designs composed.

**Scenario.** A generic onboarding workflow on a `lead` entity. Four actions, one per kind so the example exercises the full taxonomy:

- `qualify` — **form action** (linear; captures contact name + notes via a form)
- `send-quote` — **form action** (gated on `qualify`; captures quote details)
- `schedule-followup` — **task action** (gated on `send-quote`; no domain form, just a status selector + assignees + due date — typical "remember to call them on X date" task)
- `track-installation` — **tracker action** (only present when the lead has an installation ticket; mirrors the installation workflow's lifecycle)

### App-side files

```
my-app/
  workflow_config/
    workflows.yaml
    onboarding/
      onboarding.yaml
      qualify.yaml              # form action
      send-quote.yaml           # form action
      schedule-followup.yaml    # task action — no form
      track-installation.yaml   # tracker action — no form, has tracker:
      api/
        qualify-pre-submit.yaml         # pre-hook for qualify's submit_edit interaction
        send-quote-pre-submit.yaml      # pre-hook for send-quote's submit_edit interaction
        send-quote-post-approve.yaml    # post-hook for send-quote's approve interaction
        # schedule-followup needs no hooks — engine runs the default lifecycle
        # track-installation never receives interactions — engine drives its status
  modules.yaml
  lowdefy.yaml
```

### `workflow_config/workflows.yaml`

```yaml
- _ref: workflow_config/onboarding/onboarding.yaml
```

### `workflow_config/onboarding/onboarding.yaml`

```yaml
type: onboarding
title: Onboarding
entity_collection: leads-collection
display_order: 1
starting_actions:
  - { type: qualify, status: action-required }
  - { type: send-quote, status: blocked }
  - { type: schedule-followup, status: blocked }
  - { type: track-installation, status: blocked }
actions:
  - _ref: workflow_config/onboarding/qualify.yaml
  - _ref: workflow_config/onboarding/send-quote.yaml
  - _ref: workflow_config/onboarding/schedule-followup.yaml
  - _ref: workflow_config/onboarding/track-installation.yaml
```

### `workflow_config/onboarding/qualify.yaml` — form action

Form actions declare `kind: form` and carry a `form:` block. The [ui](ui/design.md) sub-design's resolver emits per-action `edit` / `view` / `review` / `error` pages with the five-button vocabulary wired in; the [submit-pipeline](submit-pipeline/design.md) sub-design's resolver emits one `update-action-{action_type}` endpoint per action that the buttons call with an `interaction` value.

```yaml
type: qualify
kind: form
action_group: discovery
sort_order: 10
description: Confirm the lead's contact details and capture qualification notes.
access:
  my-team-app: [view, edit]
  roles: [account-manager]
hooks:
  submit_edit:
    pre: qualify-pre-submit # author-supplied Lowdefy Api id
form:
  - { component: TextInput, id: contact_name, required: true }
  - { component: TextArea, id: notes }
status_map:
  action-required:
    my-team-app:
      message: Qualify the lead
      link:
        pageId:
          _module.pageId: { id: onboarding-qualify-edit, module: workflows }
        urlQuery: { action_id: true }
  done:
    my-team-app: { message: Lead qualified }
```

The `description:` is a universal action field (see [action-authoring](action-authoring/design.md) "Universal action fields") — it lives on every action regardless of kind. On a form action it renders alongside the form on the edit page; on a task action it's primary content; on a tracker action it's a subtitle in the inline display. `assignees` and `due_date` are also universal but typically left null at YAML time and set per-instance via the edit page (or by a pre-hook).

The action declares no `interactions:` block, so the engine uses defaults: `submit_edit` → `done` (because `qualify` has no `review` verb in any `access.{app_name}` map). The pre-hook lets the author inject auxiliary writes alongside the engine's transitions.

### `workflow_config/onboarding/api/qualify-pre-submit.yaml` — pre-hook

The pre-hook is a Lowdefy Api invoked by the engine via the [call-api](call-api/design.md) primitive before any engine writes. It returns optional `actions[]` (merged with the engine's auto-unblocks), `event_overrides`, `form_overrides`, or `hook_error` (to abort).

```yaml
id: qualify-pre-submit
type: Api
auth:
  public: false
  roles: [account-manager] # ⊇ action.access.roles per submit-pipeline Decision 4
routine:
  - :return:
      actions:
        # Explicitly unblock send-quote on this submit. (Could also rely on
        # engine-computed auto-unblocks from blocked_by, but staging the
        # unblock here lets the pre-hook decide based on form values.)
        - { type: send-quote, status: action-required }
      event_overrides:
        type: lead-qualified
        display:
          my-team-app: { title: "Lead qualified" }
        references:
          lead_ids: [{ _payload: workflow_id }]
```

No helper composition; the engine reads the return value and merges it into its own writes. Entity writes (if the app wants to update the `lead` doc on qualification) live in this pre-hook routine alongside the `:return:` step — it's a regular Lowdefy Api with full Mongo access.

### `workflow_config/onboarding/schedule-followup.yaml` — task action

Task actions declare `kind: task` and carry neither `form:` nor `tracker:`. The [ui](ui/design.md) sub-design's resolver emits no per-action pages; the user-facing edit/view/review experience is the module-shipped `task-edit` / `task-view` / `task-review` pages addressed by `?action_id=<id>`.

```yaml
type: schedule-followup
kind: task
action_group: follow-up
sort_order: 30
description: Schedule a follow-up call with the lead within a week of qualification.
blocked_by: [send-quote]
access:
  my-team-app: [view, edit]
  roles: [account-manager]
status_map:
  blocked:
    my-team-app: { message: Awaiting quote acceptance. }
  action-required:
    my-team-app:
      message: Schedule a follow-up call
      link:
        pageId:
          _module.pageId: { id: task-edit, module: workflows }
        urlQuery: { action_id: true }
  done:
    my-team-app: { message: Follow-up scheduled. }
```

No `hooks:` declared — task transitions go through the default engine path with no pre/post extension. The shared `task-edit` page composes the payload from its status selector + universal-fields inputs + comment field and calls `update-action-schedule-followup` with `interaction: submit_edit` and `current_status: <user-selected>` (task `submit_edit` is the one interaction where the caller supplies `current_status` because the page surfaces a status selector — see submit-pipeline Decision 3 "Interaction → target status"). Apps that need extra logic on task transitions add a form action instead — task actions intentionally share one experience.

### `workflow_config/onboarding/track-installation.yaml` — tracker action

Tracker actions declare `kind: tracker` and carry a `tracker:` block. The [ui](ui/design.md) sub-design's resolver emits no pages; the action renders inline in `actions-on-entity`; the [engine](engine/design.md) sub-design's synchronous in-process subscription writes the parent action's status whenever the tracked child workflow transitions. The hard-coded child-stage map handles the parent-stage update — apps don't supply one.

```yaml
type: track-installation
kind: tracker
action_group: setup
sort_order: 40
description: Tracks the device-installation workflow on the linked installation ticket.
blocked_by: [schedule-followup]
access:
  my-team-app: [view] # display-only — no edit / submit page
  roles: [account-manager]
tracker:
  workflow_type: device-installation # the only field on tracker:
status_map: # display copy per parent stage; mapping itself is hard-coded
  blocked:
    my-team-app: { message: Awaiting follow-up scheduling. }
  in-progress:
    my-team-app: { message: Installation in progress. }
  done:
    my-team-app: { message: Installation completed. }
```

No `hooks:` and no callable endpoints (tracker actions never receive caller submissions). The action's runtime `child_workflow_id` / `child_entity_id` / `child_entity_collection` are set when an app-side flow that creates the installation ticket calls `start-workflow` with `parent_action_id` — the engine writes both sides of the parent/child link in one server-side call. See [action-authoring](action-authoring/design.md) "How parent and child get linked at runtime."

### `modules.yaml`

```yaml
- id: events
  source: file:../../modules/events
- id: notifications
  source: file:../../modules/notifications
- id: workflows
  source: file:../../modules/workflows
  vars:
    workflows_config:
      _ref: workflow_config/workflows.yaml
    app_name: my-team-app
```

No `entity_relationships` — the engine doesn't need to know how leads and tickets are related. The flow that creates the installation ticket (often itself a pre-hook on some other action, or an app-side page action) calls `start-workflow` with `parent_action_id` set, and the engine writes the bidirectional link in one server-side call.

### Build-time output

The build composes the workflows module into the app, runs the resolvers, and the action-kind inference branches per action:

- **Per-action pages generated** (`makeActionPages`): only for form actions. Each form action gets up to four pages (`-edit` / `-view` / `-review` / `-error`) scoped under `workflows/` — e.g. `workflows/onboarding-qualify-edit`. All four verbs are gated identically: a `-{verb}` page is emitted only when the verb is present in the action's `access.{app_name}` list (`qualify` doesn't list `error`, so no `-error` is generated for it in this example). Templates ship the five-button vocabulary (`submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`) — each button block calls the per-action endpoint with the right `interaction` value. `schedule-followup` (task) and `track-installation` (tracker) get **no per-action pages**; task actions use the module's shared `workflows/task-edit` / `task-view` / `task-review` pages, tracker actions render inline.
- **Per-action submit endpoints generated** (`makeWorkflowApis`): one Lowdefy Api per form / task action — `workflows/update-action-qualify`, `workflows/update-action-send-quote`, `workflows/update-action-schedule-followup`. Each endpoint bakes in the action's `hooks:`, `event:`, and `interactions:` maps as build-time literals; its routine is a thin call to the `SubmitWorkflowAction` plugin handler. `track-installation` (tracker action) gets no endpoint — the engine writes its status via the tracker subscription. `makeWorkflowApis` also validates `hook.auth.roles ⊇ action.access.roles` at build time (submit-pipeline Decision 4 "Hook auth gate"); the build fails if `qualify-pre-submit`'s auth doesn't include every role in `qualify`'s `access.roles`.
- **Runtime config generated** (`makeWorkflowsConfig`): one global object the `workflow-api` connection reads. Wired via `connections/workflow-api.yaml`.
- **Status enums** (`global.action_statuses`, `global.workflow_lifecycle_stages`): static module-shipped files, available to templates and the WorkflowAPI plugin without any per-app generation.

### Runtime flow

1. **Lead created** in the app's normal flow. App calls `start-workflow` API: `CallApi { endpoint_id: _module.endpointId: { id: start-workflow, module: workflows }, payload: { workflow_type: onboarding, entity_id: <lead_id>, entity_collection: leads-collection } }`.
2. **Module's `start-workflow`** routes to the WorkflowAPI plugin's `StartWorkflow`. Plugin writes a workflow doc + four action docs (one form action waiting on user, three blocked), returns `workflow_id` and `action_ids`.
3. **User opens the lead page.** App-side page calls the module's `get-entity-workflows` API with `entity_collection=leads-collection`, `entity_id=<lead_id>`. Module returns workflow docs + grouped actions.
4. **App page renders** using the module's `actions-on-entity` component, which iterates workflows by `display_order`, renders each `workflow-header` followed by grouped action lists.
5. **User clicks the qualify action** — navigates to `workflows/onboarding-qualify-edit` (form action; per-action page). Page reads action + entity, renders form via `makeActionsForm`. The edit template ships a `submit_edit` button block already wired to `workflows/update-action-qualify`.
6. **User clicks "Submit"** — the button block first fires the author's `pages.edit.events.onSubmit` (if declared, for page-state work), then calls `workflows/update-action-qualify` with `interaction: submit_edit` + `form` / `form_review` / `fields` payloads. The endpoint's routine is one step that invokes the `SubmitWorkflowAction` plugin handler.
7. **`SubmitWorkflowAction` runs the lifecycle in one in-process call** (see submit-pipeline Decision 1):
   1. Validates payload + role gate (account-manager).
   2. Resolves `hooks[submit_edit].pre = qualify-pre-submit`; engine invokes it via `context.callApi`. Pre-hook returns `{ actions: [{ type: send-quote, status: action-required }], event_overrides: { type: lead-qualified, ... } }`.
   3. Engine computes auto-unblocks from `blocked_by`; merges with pre-hook `actions[]` (pre-hook entries take precedence).
   4. Resolves `interaction: submit_edit` → default target status `done` (since `qualify` has no `review` verb).
   5. Writes action transitions: `qualify` → `done`, `send-quote` → `action-required`.
   6. Recomputes workflow summary + groups[]; writes `form_data.qualify.contact_name` / `form_data.qualify.notes`.
   7. Generates log event (engine default merged with pre-hook's `event_overrides`).
   8. Dispatches notifications via `send-notification` (the app's `send_routine` decides recipients; silent no-op if none wired).
   9. No groups completed, no workflow status change, no tracker fire.
   10. No `hooks[submit_edit].post` declared, so post-hook step skipped.
   11. Returns `{ action_ids, completed_groups: [], event_id, tracker_fired: null }`.
8. **Lead page re-renders** — `qualify` shows as `done`, `send-quote` shows as `action-required`, `schedule-followup` and `track-installation` remain `blocked`.
9. **Later: user clicks schedule-followup** (task action) — navigates to `workflows/task-edit?action_id=<id>` (the module's shared task page). Page renders status selector + assignees / due-date inputs + comment field. User picks `done`, sets a `due_date`, types a comment, clicks Submit. The page calls `update-action-schedule-followup` with `interaction: submit_edit` + `current_status: done` + `fields` block + a top-level `comment` field (the resolver-emitted API maps it to `event.metadata.comment`). Engine writes the transition; `schedule-followup`'s `blocked_by` re-evaluation flips `track-installation` from `blocked` to `action-required` (`schedule-followup` is now terminal).
10. **Sometime later: an installation ticket is created** for this lead. The flow that creates it (often a pre-hook on a separate "create installation" form action, or an app-side page action) calls `start-workflow` with `workflow_type: device-installation`, `entity_id: <new_ticket_id>`, `entity_collection: tickets-collection`, and `parent_action_id: <track-installation._id>`. The engine writes the new child workflow doc (recording `parent_action_id`, `parent_entity_id`, `parent_entity_collection`), the N starting action docs for the child, and the parent `track-installation` action's `child_workflow_id` + `child_entity_id` + `child_entity_collection` + `in-progress` transition — all in one server-side call, one `eventId`. Whenever the child transitions (active → completed → cancelled), the engine's synchronous in-process subscription reads the child's `parent_action_id`, fetches the tracker action by primary key, and applies the hard-coded child-stage map — no further app-side glue. When the child workflow completes, the parent submit response (or any post-hook reading `result.tracker_fired`) sees `{ parent_action_id: <track-installation._id>, parent_workflow_id: <onboarding._id>, new_status: done }`.

The whole thing — from app YAML to runtime behaviour — exercises form actions, task actions, tracker actions, the universal-fields update channel, and the engine-orchestrated submit pipeline in one example. Every sub-design is load-bearing: engine + submit-pipeline drive the runtime; module-surface and ui shape what the app and user see; action-authoring defines the YAML; action-groups feeds engine writes via `action_group`; call-api gives the engine its hook-invocation primitive.

## Non-Goals

- A user-facing template builder. Workflow YAML is authored by developers, not end users.
- A Lowdefy routine helper library exposed by the module. The submit chain runs server-side inside the `SubmitWorkflowAction` plugin handler ([submit-pipeline](submit-pipeline/design.md)) — apps don't compose routines; they declare per-interaction pre/post hooks on the action YAML and let the engine drive the lifecycle. If Lowdefy ever grows a `routines` export kind, the module can revisit — but no current shape needs it.
- Per-action page styling parity with existing app-specific templates. The module's templates ship a default; apps that need bespoke pages override per action.
- Migration tooling for existing app-specific workflow schemas. Out of scope — each consuming app decides whether to migrate when adopting.

## Cross-cutting open questions and risks

Sub-design-specific open questions are owned by each sub-design. The items below cross sub-design boundaries or are otherwise parent-level.

### Open Questions

1. **`makeActionsForm` recursion across module boundaries (early-implementation spike required).** Cross-cuts [action-authoring](action-authoring/design.md) (the resolver) and [ui](ui/design.md) (the templates that call it). The resolver recursively invokes itself to build nested form sections (e.g. a `controlled_list` whose rows carry their own sub-form). Lowdefy's `_ref: { resolver }` from inside a Nunjucks template hasn't been verified for modules. Before relying on the recursive pattern, run a minimal spike: a template inside a module that calls `_ref: { resolver: <relative-path> }` and confirms the resolver runs and the path resolves correctly. If the spike fails, the form builder becomes a flat (non-recursive) emitter — apps that need nested form sections supply a per-action template override.

### Risks

- **Plugin dual-runtime build complexity.** First-time server-side code in a package that currently ships React blocks. Treated as a v1 milestone with its own verification step. See [engine](engine/design.md) "Dual-runtime build."
- **No transactional atomicity in v1.** The `WorkflowAPI` handler delegates every Mongo read and write to `@lowdefy/community-plugin-mongodb`'s handlers via a per-collection dispatcher; each request opens its own `MongoClient` and there is no transaction wrapping the sequence. Mid-sequence failure leaves earlier writes durable and later steps unrun — same risk class as `summary` writeback drift. Mitigation: caller retry (idempotent), periodic reconciliation as catch-all. Transactions are not available through the dispatcher; a future ACID path would require a parallel raw-driver helper. See [engine](engine/design.md) "Client and transaction model."
- **Workflow-doc write contention** under highly-parallel workflows. Mitigation: provide a `summary_dirty: true` lazy-writeback fallback as an opt-in mode (set per workflow YAML), so apps with high parallelism can defer the recompute. Default stays eager.
- **Resolver path resolution from templates.** Module-loader path resolution for resolvers invoked from inside Nunjucks templates (e.g. `makeActionsForm` calling itself) is a known sharp edge. Mitigation: verify with a working spike before relying on the recursive pattern.
- **Cross-module API invocation from the engine.** The `SubmitWorkflowAction` plugin handler calls into the events module (`new-event`), the notifications module (`send-notification`), pre/post hook APIs declared on actions, and group `on_complete` endpoints — all via the `context.callApi` primitive ([call-api](call-api/design.md)). Cross-module reference works from inside another module's API routine (verified — the contacts module already does this pattern in `update-contact`); the new piece is doing it from JS inside a plugin handler. The call-api sub-design carves out the primitive; submit-pipeline is its first consumer.
- **Submit-pipeline API surface stability.** v1 ships one resolver-generated endpoint per form / task action (`update-action-{action_type}`), all interactions multiplexed via the `interaction:` payload field. Authors declare pre/post hooks per interaction at the action root. If real apps surface complex submit flows that don't fit the hook contract, apps add additional pre-hook returns (extra `actions[]` entries, `event_overrides`, `form_overrides`) or post-hook follow-up writes; the module adds extension fields additively if patterns emerge across multiple apps.

## Next Step

Each sub-design is implementation-ready at its own layer. Suggested order:

1. **`/r:design-review workflows-module/{name}`** on each sub-design for a critical review.
2. **`/r:design-task workflows-module/{name}`** per sub-design once reviews are clean, breaking each into implementation tasks. Sub-design dependencies (drives implementation sequencing):
   - **[call-api](call-api/design.md)** ships first — it's an upstream Lowdefy primitive that submit-pipeline depends on.
   - **[engine](engine/design.md)** and **[action-authoring](action-authoring/design.md)** ship in parallel (no inter-dependency); engine unblocks plugin work, action-authoring unblocks workflow authors.
   - **[action-groups](action-groups/design.md)** and **[submit-pipeline](submit-pipeline/design.md)** land after engine + call-api. Submit-pipeline is gated on call-api.
   - **[module-surface](module-surface/design.md)** and **[ui](ui/design.md)** ship alongside submit-pipeline — they're its primary consumers (the module manifest exposes the per-action endpoints; templates ship the five-button vocabulary that calls them).

The worked example above exercises all seven sub-designs; treat it as the integration smoke test for v1.
