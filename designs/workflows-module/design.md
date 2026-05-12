# Workflows Module Design

The module-level design for the `workflows` module — a modules-mongodb module that supports multiple parallel workflows on one entity, with a two-collection schema (`workflows` + `actions`), a status-array history shape, an opinionated access model anchored on the user-admin module's user schema, and a two-layer transition model (`blocked_by` + `submit_hook`) sitting on `UpdateWorkflowActions` / `StartWorkflow` / `CancelWorkflow` primitives.

The design splits into five sub-designs by concern. This parent doc carries the framing, an end-to-end worked example that exercises the core four, and the cross-cutting open questions / non-goals / risks. Each sub-design is self-contained at its own layer.

| Sub-design                                     | What it owns                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [engine](engine/design.md)                     | Server-side workflow engine — `WorkflowAPI` plugin, references write contract, sub-workflow tracker subscription, status enum priority rule.                                                                                                                                                      |
| [module-surface](module-surface/design.md)     | `module.lowdefy.yaml` manifest (exports, vars, dependencies) and the four module APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `submit-action`) that apps call.                                                                                                              |
| [action-authoring](action-authoring/design.md) | YAML surface for workflows and actions — three action kinds (form / task / sub-workflow) inferred from shape, universal fields (`assignees`, `due_date`, `description`), sub-workflow `tracker:` block, resolver pipeline, form components library, module-shipped status enum.                   |
| [ui](ui/design.md)                             | Per-action page generation strategy, form-action templates (`edit` / `view` / `error`), static `task-edit` / `task-view` pages, and the three entity-page UI components (`actions-on-entity`, `workflow-header`, `action_role_check`).                                                            |
| [action-groups](action-groups/design.md)       | Elevates `action_group` from UI label to engine concept — workflow-level `action_groups:` declaration, persisted three-value group status on the workflow doc, `blocked_by` accepting group IDs, engine-driven `blocked_by` re-evaluation, optional per-group `on_complete` hook (mechanism TBD). |

## Problem

The module exists to give apps a uniform way to run multi-step business processes on any entity. Apps drop the module into their `modules.yaml`, supply a `workflows_config` describing their workflows and actions, and get:

- A persistent workflow + action data model with priority-based status transitions, eager summary writeback, and auto-complete semantics.
- A small server API surface (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `submit-action`) that callers use to drive workflow lifecycles.
- Page generation per action — form-action pages emitted per `(workflow_type, action_type, verb)`; task-action shared pages addressed by `?action_id=<id>`; sub-workflow actions rendered inline.
- An entity-page block (`actions-on-entity`) that renders an entity's workflows + grouped action lists end-to-end.
- A small form components library that lets authors compose action `form:` blocks from reusable building blocks.

The five sub-designs commit:

- The shape of the module's `module.lowdefy.yaml` and the API consuming apps see — [module-surface](module-surface/design.md).
- **Where per-action pages live**, and what page kinds exist for form / task / sub-workflow actions — [ui](ui/design.md).
- The submit-time API surface — one `submit-action` endpoint that covers submit / approve / request-changes via caller-supplied `current_status` — [module-surface](module-surface/design.md).
- The plugin mechanics for the server-side `WorkflowAPI` connection in `@lowdefy/modules-mongodb-plugins`, the references write contract, and the synchronous in-process tracker subscription — [engine](engine/design.md).
- The shape of the default Nunjucks page templates the module ships, plus the form components library — [ui](ui/design.md) for templates, [action-authoring](action-authoring/design.md) for the components library.
- The YAML grammar for sub-workflow actions (`tracker:` block on the action), the universal action fields, the action-kind taxonomy, the status enum, and the resolver pipeline — [action-authoring](action-authoring/design.md).
- Action groups as a first-class engine concept — workflow-level `action_groups:` declaration, persisted group status on the workflow doc, group references in `blocked_by`, engine-driven unblock evaluation, optional `on_complete` hook per group (invocation mechanism deferred to a follow-up sub-design) — [action-groups](action-groups/design.md).

## Reference Material

The design lifts heavily from existing modules-mongodb modules:

- **[`modules-mongodb/modules/events`](../../modules/events/)** — closest existing analogue (server-side connection + API + components + `references` field shape). Read [`events/module.lowdefy.yaml`](../../modules/events/module.lowdefy.yaml) and [`events/api/new-event.yaml`](../../modules/events/api/new-event.yaml) as concrete examples of the exports / vars / api / connections shape.
- **[`modules-mongodb/modules/companies`](../../modules/companies/)** — module that ships pages (`all`, `view`, `edit`, `new`). Demonstrates the page-export pattern for static pages.
- **[`modules-mongodb/CLAUDE.md`](../../CLAUDE.md)** — module-system conventions: ID scoping, `_module.pageId` / `_module.connectionId` / `_module.endpointId` / `_module.var` operators, page-id verb conventions (`all` / `view` / `edit` / `new`).

## Worked example — end to end across all four sub-designs

A minimal end-to-end flow demonstrating the four sub-designs composed.

**Scenario.** A generic onboarding workflow on a `lead` entity. Four actions, one per kind so the example exercises the full taxonomy:

- `qualify` — **form action** (linear; captures contact name + notes via a form)
- `send-quote` — **form action** (gated on `qualify`; captures quote details)
- `schedule-followup` — **task action** (gated on `send-quote`; no domain form, just a status selector + assignees + due date — typical "remember to call them on X date" task)
- `track-installation` — **sub-workflow action** (only present when the lead has an installation ticket; mirrors the installation workflow's lifecycle)

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
      track-installation.yaml   # sub-workflow action — no form, has tracker:
      api/
        qualify-submit-hook.yaml
        send-quote-submit-hook.yaml
        # schedule-followup has no submit hook — the shared task-edit page
        #   calls submit-action directly
        # track-installation has no submit_hook — engine drives status
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
entity_type: lead
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

Form actions carry a `form:` block. Per the [action-authoring](action-authoring/design.md) inference rule, this makes them a form action — the [ui](ui/design.md) sub-design's resolver emits per-action `edit` / `view` / `error` pages, and the [module-surface](module-surface/design.md) sub-design's `submit-action` API receives the form data in submit payloads.

```yaml
type: qualify
action_group: discovery
sort_order: 10
description: Confirm the lead's contact details and capture qualification notes.
submit_hook: workflow_config/onboarding/api/qualify-submit-hook.yaml
access:
  my-team-app: [view, edit]
  roles: [account-manager]
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

The `description:` is a universal action field (see [action-authoring](action-authoring/design.md) "Universal action fields") — it lives on every action regardless of kind. On a form action it renders alongside the form on the edit page; on a task action it's primary content; on a sub-workflow action it's a subtitle in the inline display. `assignees` and `due_date` are also universal but typically left null at YAML time and set per-instance via the edit page (or by an upstream submit hook).

### `workflow_config/onboarding/api/qualify-submit-hook.yaml`

The submit hook is one `CallApi` step that hits the module's `submit-action` API with a structured payload — current action transition + optional unblocks + optional entity write + optional event:

```yaml
- id: submit
  type: CallApi
  endpointId:
    _module.endpointId: { id: submit-action, module: workflows }
  payload:
    action_id: { _payload: action_id }
    current_type: qualify
    unblocks:
      - { type: send-quote, status: action-required }
    event:
      type: lead-qualified
      display:
        my-team-app: { title: "Lead qualified" }
      references:
        lead_ids: [{ _payload: entity_id }]
```

No helper composition; one API call. The [module-surface](module-surface/design.md) sub-design's `submit-action` runs the four-step routine (advance, optional entity write, optional event log, optional notifications) server-side.

### `workflow_config/onboarding/schedule-followup.yaml` — task action

Task actions carry no `form:` and no `tracker:` block. The [ui](ui/design.md) sub-design's resolver emits no per-action pages; the user-facing edit/view experience is the module-shipped `task-edit` / `task-view` pages addressed by `?action_id=<id>`.

```yaml
type: schedule-followup
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

No `submit_hook:` declared — task actions don't have per-action endpoints. The shared `task-edit` page calls `submit-action` directly with the payload it builds from the form: `{ action_id, current_type, current_status: <selected>, fields: { assignees, due_date, description }, event: { type: task-action-update, metadata: { comment }, references: { lead_ids } } }`. Apps that need extra logic on task transitions add a form action instead — task actions intentionally share one experience.

### `workflow_config/onboarding/track-installation.yaml` — sub-workflow action

Sub-workflow actions carry a `tracker:` block. The [ui](ui/design.md) sub-design's resolver emits no pages; the action renders inline in `actions-on-entity`; the [engine](engine/design.md) sub-design's synchronous in-process subscription writes the parent action's status whenever the tracked child workflow transitions. The hard-coded child-stage map handles the parent-stage update — apps don't supply one.

```yaml
type: track-installation
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

No `submit_hook:` and no callable endpoints (sub-workflow actions never appear in the build-time `api:` list). The action's runtime `key` field is set when the trigger action's submit hook starts the child workflow and writes the new `workflow_id` into this action's `key` (see [action-authoring](action-authoring/design.md) "How parent and child get linked at runtime").

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

No `entity_relationships` — the engine doesn't need to know how leads and tickets are related. The trigger action's submit hook (the one that creates the installation ticket) has whatever knowledge it needs and links the new workflow's `_id` into the parent sub-workflow action's `key` directly.

### Build-time output

The build composes the workflows module into the app, runs the resolvers, and the action-kind inference branches per action:

- **Per-action pages generated** (`makeActionPages`): only for form actions. `qualify` and `send-quote` each get up to three pages (edit / view / error) scoped under `workflows/` — e.g. `workflows/onboarding-qualify-edit`. `schedule-followup` (task) and `track-installation` (sub-workflow) get **no per-action pages**; task actions use the module's shared `workflows/task-edit` page, sub-workflow actions render inline.
- **Requests generated** (`makeWorkflowApis`): one submit endpoint per **form action** only — `workflows/onboarding-qualify-submit`, `workflows/onboarding-send-quote-submit`. The endpoints `_ref` the action's `submit_hook` if declared, or fall back to a thin default that calls `submit-action` with `current_status: done`. `schedule-followup` (task action) doesn't get a per-action endpoint — the shared `task-edit` page calls `submit-action` directly. `track-installation` (sub-workflow action) doesn't get an endpoint either — the engine writes its status via the tracker subscription.
- **Runtime config generated** (`makeWorkflowsConfig`): one global object the `workflow-api` connection reads. Wired via `connections/workflow-api.yaml`.
- **Status enums** (`global.action_statuses`, `global.workflow_lifecycle_stages`): static module-shipped files, available to templates and the WorkflowAPI plugin without any per-app generation.

### Runtime flow

1. **Lead created** in the app's normal flow. App calls `start-workflow` API: `CallApi { endpoint_id: _module.endpointId: { id: start-workflow, module: workflows }, payload: { workflow_type: onboarding, entity_type: lead, entity_id: <lead_id> } }`.
2. **Module's `start-workflow`** routes to the WorkflowAPI plugin's `StartWorkflow`. Plugin writes a workflow doc + four action docs (one form action waiting on user, three blocked), returns `workflow_id` and `action_ids`.
3. **User opens the lead page.** App-side page calls the module's `get-entity-workflows` API with `entity_type=lead`, `entity_id=<lead_id>`. Module returns workflow docs + grouped actions.
4. **App page renders** using the module's `actions-on-entity` component, which iterates workflows by `display_order`, renders each `workflow-header` followed by grouped action lists.
5. **User clicks the qualify action** — navigates to `workflows/onboarding-qualify-edit` (form action; per-action page). Page reads action + entity, renders form via `makeActionsForm`.
6. **User submits qualify** — calls `workflows/onboarding-qualify-submit`. The generated endpoint `_ref`s the action's submit hook, which makes one `CallApi` to `submit-action`. `submit-action` advances qualify to `done` via `UpdateWorkflowActions` (also unblocking send-quote), then logs an event via the events module's `new-event` API.
7. **`UpdateWorkflowActions`** writes the action `done`, recomputes the workflow `summary` (`done: 1, total: 4`), checks for auto-complete (no — actions still open).
8. **Lead page re-renders** — `qualify` shows as `done`, `send-quote` shows as `action-required`, `schedule-followup` and `track-installation` remain `blocked`.
9. **Later: user clicks schedule-followup** (task action) — navigates to `workflows/task-edit?action_id=<id>` (the module's shared task page). Page renders status selector + assignees / due-date inputs + comment field. User picks `done`, sets a `due_date`, types a comment, submits — the page builds the `submit-action` payload (`fields:` block + `event.metadata.comment`) and calls the endpoint. The action transitions to `done`; `track-installation` unblocks.
10. **Sometime later: an installation ticket is created** for this lead. The trigger action's submit hook calls `start-workflow` for a `device-installation` workflow on the new ticket, captures the returned `workflow_id`, and calls `submit-action` on the parent `track-installation` action with `fields: { key: <child workflow_id> }, current_status: in-progress`. The sub-workflow action's `key` now points at the child workflow. Whenever the child transitions (active → completed → cancelled), the engine's synchronous in-process subscription looks up actions by `key` and applies the hard-coded child-stage map — no further app-side glue.

The whole thing — from app YAML to runtime behaviour — exercises form actions, task actions, sub-workflow actions, and the universal-fields update channel in one example. The four sub-designs (engine, module-surface, action-authoring, ui) are each load-bearing in this flow.

## Non-Goals

- A user-facing template builder. Workflow YAML is authored by developers, not end users.
- A Lowdefy routine helper library exposed by the module. The module ships a single `submit-action` API ([module-surface](module-surface/design.md) "Decision 4") that handles the submit chain server-side. Apps don't compose helpers; they `CallApi` the endpoint with a structured payload. If Lowdefy ever grows a `routines` export kind, the module can revisit — but no current shape needs it.
- Per-action page styling parity with existing app-specific templates. The module's templates ship a default; apps that need bespoke pages override per action.
- Migration tooling for existing app-specific workflow schemas. Out of scope — each consuming app decides whether to migrate when adopting.

## Cross-cutting open questions and risks

Sub-design-specific open questions are owned by each sub-design. The items below cross sub-design boundaries or are otherwise parent-level.

### Open Questions

1. **`makeActionsForm` recursion across module boundaries (early-implementation spike required).** Cross-cuts [action-authoring](action-authoring/design.md) (the resolver) and [ui](ui/design.md) (the templates that call it). The resolver recursively invokes itself to build nested form sections (e.g. a `controlled_list` whose rows carry their own sub-form). Lowdefy's `_ref: { resolver }` from inside a Nunjucks template hasn't been verified for modules. Before relying on the recursive pattern, run a minimal spike: a template inside a module that calls `_ref: { resolver: <relative-path> }` and confirms the resolver runs and the path resolves correctly. If the spike fails, the form builder becomes a flat (non-recursive) emitter — apps that need nested form sections supply a per-action template override.

### Risks

- **Plugin dual-runtime build complexity.** First-time server-side code in a package that currently ships React blocks. Treated as a v1 milestone with its own verification step. See [engine](engine/design.md) "Dual-runtime build."
- **No transactional atomicity in v1.** The `WorkflowAPI` handler runs sub-steps sequentially on one shared Mongo client but doesn't wrap them in a transaction. Mid-sequence failure leaves earlier writes durable and later steps unrun — same risk class as `summary` writeback drift. Mitigation: caller retry (idempotent), periodic reconciliation as catch-all, `session.withTransaction(...)` as a purely-additive opt-in. See [engine](engine/design.md) "Client and transaction model."
- **Workflow-doc write contention** under highly-parallel workflows. Mitigation: provide a `summary_dirty: true` lazy-writeback fallback as an opt-in mode (set per workflow YAML), so apps with high parallelism can defer the recompute. Default stays eager.
- **Resolver path resolution from templates.** Module-loader path resolution for resolvers invoked from inside Nunjucks templates (e.g. `makeActionsForm` calling itself) is a known sharp edge. Mitigation: verify with a working spike before relying on the recursive pattern.
- **Cross-module endpoint resolution at the module-level (`_module.endpointId: { id, module }`)** inside `submit-action`. The API calls into events (`new-event`) and notifications (`send-notification`); cross-module reference works from inside another module's API routine (verified — the contacts module already does this pattern in `update-contact`). If a future change to the module-loader breaks the cross-module reference, fallback is having the app pass endpoint IDs as caller-supplied vars.
- **`submit-action` API surface stability.** v1 ships one submit endpoint that handles submit, approve, and request-changes flows via caller-supplied `current_status`, plus three operational APIs. If real apps surface complex submit flows that don't fit the payload shape, apps wrap their own routine around the `CallApi` step with extra steps before/after; the module adds extension fields additively if patterns emerge across multiple apps.

## Next Step

Each sub-design is implementation-ready at its own layer. Suggested order:

1. **`/r:design-review workflows-module/{name}`** on each sub-design for a critical review.
2. **`/r:design-task workflows-module/{name}`** per sub-design once reviews are clean, breaking each into implementation tasks. Sub-designs commit independently; the engine sub-design unblocks plugin work, the module-surface sub-design unblocks app integration, the action-authoring sub-design unblocks workflow authors, and the ui sub-design unblocks page generation.

The worked example above exercises all four; treat it as the integration smoke test for v1.
