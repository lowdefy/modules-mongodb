# Workflows Action Authoring

What an author writes — the YAML surface for workflows, actions, and sub-workflow linking. Action kinds (form / task / sub-workflow) inferred from YAML shape. Universal action fields (`assignees`, `due_date`, `description`). Status enum vocabulary. Form components library. Resolver pipeline that consumes authored YAML.

This sub-design owns "what authors type." The engine's runtime semantics that consume these shapes come from [engine](../engine/design.md); the page surface generated from these YAMLs comes from [ui](../ui/design.md); the module-level wiring that ties resolvers together comes from [module-surface](../module-surface/design.md).

## Problem

What this sub-design commits about the authoring vocabulary:

- The status enum source — module-shipped and stable.
- The action-kind taxonomy — three kinds (form, task, sub-workflow) and how the YAML distinguishes them.
- Universal fields handling — `assignees`, `due_date`, `description` on every action.
- Sub-workflow YAML grammar — the `tracker:` block.
- The form components library that lets authors compose `form:` blocks from reusable building blocks.
- The resolver pipeline that consumes authored YAML at build time.

## Decision 1 — Action status enum (module-shipped)

The module ships **the status enum as a static YAML file**, not as a per-app resolver-generated config. The file lives at `enums/action_statuses.yaml` in the module package and is exposed as `global.action_statuses` (read by the WorkflowAPI plugin's `actionsEnum` parameter at runtime). Same for the workflow lifecycle stages at `enums/workflow_lifecycle_stages.yaml`, exposed as `global.workflow_lifecycle_stages`.

The action-status enum has eight statuses, each with `priority`, `title`, `color`, `borderColor`, `titleColor`, optional `icon`:

```yaml
# enums/action_statuses.yaml — module-shipped, not editable per app
not-required:
  priority: 0 # special: terminal "skipped"; lower than anything else
  title: Not Required
  color: "#d9d9d9"
  borderColor: "#8c8c8c"
  titleColor: "#434343"
error:
  priority: 1
  title: Alert
  # ...
changes-required:
  priority: 2
  title: Changes Required
  # ...
done:
  priority: 3
  title: Done
  icon: { _ref: public/icons/check-circle.svg }
  # ...
in-review:
  priority: 4
  title: In Review
  # ...
in-progress:
  priority: 5
  title: In Progress
  # ...
action-required:
  priority: 6
  title: Action Required
  icon: { _ref: public/icons/ticket-outline.svg }
  # ...
blocked:
  priority: 7
  title: Blocked
  # ...
```

The workflow lifecycle stages enum mirrors the shape with a smaller set: `active`, `completed`, `cancelled`.

**Why static, not app-configurable.** The enum is the engine's vocabulary; collapsing to one canonical set keeps every consuming app on the same semantics. Apps that want per-app status display variations (e.g. different colors per deployment) override at the layout-module level, not by extending the enum. Apps that need a genuinely different status name (e.g. `todo` vs `action-required`) translate at the display layer — the engine sees one set of names.

The runtime priority-transition semantics that consume these enums are owned by the [engine](../engine/design.md) sub-design.

## Decision 2 — Action kinds (form, task, sub-workflow)

Every action falls into one of three kinds, **inferred from the YAML's shape**:

| Kind             | Inference rule                                   | Primary content                                                             |
| ---------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| **Form action**  | YAML carries a `form:` block (and no `tracker:`) | A domain-specific form schema, rendered as the edit page's main content     |
| **Task action**  | YAML carries neither `form:` nor `tracker:`      | Generic status selector + comment field on a shared edit page               |
| **Sub-workflow** | YAML carries a `tracker:` block (Decision 4)     | None — display-only inline; status_map link points at the child entity view |

No explicit `kind:` declaration. Inference is unambiguous because `form:` and `tracker:` are mutually exclusive (an action can't both capture data and mirror a child workflow), and the absence of both means there's nothing domain-specific to render.

The kind drives three things downstream:

1. **Page generation.** Form actions emit per-action `edit` / `view` / `error` pages. Task actions don't get per-action pages — they use one shared module-level `task-edit` / `task-view` page, addressed by `?action_id=<id>`. Sub-workflow actions emit no pages. See [ui](../ui/design.md) for page-generation rules.
2. **Submit API surface.** Form actions submit via `submit-action` with form payload; task actions submit via `submit-action` with a `current_status` selected by the user (and an optional comment in `event.metadata.comment`); sub-workflow actions don't submit at all — the engine writes their status via the tracker subscription (engine sub-design).
3. **Resolver invocation.** `makeActionsForm` and `makeActionFormConfigs` run only for form actions; task and sub-workflow actions skip both. `makeActionPages` skips per-action emission for task and sub-workflow kinds.

## Decision 3 — Universal action fields

Every action doc — regardless of kind — carries three optional fields:

| Field         | Type       | Description                                                    |
| ------------- | ---------- | -------------------------------------------------------------- |
| `assignees`   | `String[]` | User IDs assigned to the action; multi-select on the edit page |
| `due_date`    | `Date?`    | When the action is due; date picker on the edit page           |
| `description` | `String?`  | Free-text description; rendered alongside form/task content    |

The fields are **uniformly user-editable** on the action's edit page, regardless of kind:

- On a **form action's** edit page they render in the page header alongside the form (a small assignees / due-date / description band above the form schema).
- On a **task action's** edit page they're the primary content, with a status selector and a comment field below.
- On a **sub-workflow action's** inline display in `actions-on-entity` they show as small badges next to the link.

Updates flow through `submit-action` like any other action change: the payload includes the new field values, the plugin writes them to the action doc, and an event is emitted. Comments live on the events module — the comment is part of the `event.metadata.comment` payload that `submit-action` forwards to `events.new-event`.

The fields are added to the actions schema and to the reserved-keys list (engine sub-design "References write contract") — apps' `references` payloads can't claim `assignees`, `due_date`, or `description`.

## Decision 4 — Sub-workflow action YAML

Sub-workflow actions are the design's mechanism for "this parent workflow has work happening on a related entity that we want reflected in the parent's progress." A sub-workflow action's status mirrors a specific child workflow's lifecycle stage; when the child transitions, the engine writes the parent action's status (engine sub-design "Tracker subscription mechanism" covers the runtime mechanism).

The shape is one YAML field and one runtime convention.

### YAML shape

A sub-workflow action declares a `tracker:` block with a single field — the child `workflow_type` it mirrors:

```yaml
type: track-installation
action_group: setup
sort_order: 40
description: Tracks the device-installation workflow on the linked installation ticket.
blocked_by: [schedule-followup]
access:
  my-team-app: [view] # display-only — no edit / submit page
tracker:
  workflow_type: device-installation
status_map: # optional — display copy per parent stage; mapping itself is hard-coded
  blocked: { my-team-app: { message: Awaiting follow-up scheduling. } }
  in-progress: { my-team-app: { message: Installation in progress. } }
  done: { my-team-app: { message: Installation completed. } }
```

No `relationship`, no registry reference, no per-action `status_map` mapping child stages to parent stages. The `tracker:` block carries one fact: which child `workflow_type` this action tracks.

### How parent and child get linked at runtime

The data link between parent sub-workflow action and child workflow is the action's existing **`key`** field. For a sub-workflow action, `key` stores the child workflow's `_id` — the direct workflow reference, not a child entity id, not anything that needs to be joined.

The link is established when the child workflow is started. App code that creates the child entity and calls `start-workflow` for the new child also calls `submit-action` on the parent action to write the child's `workflow_id` into the parent's `key`:

```yaml
# app's submit hook on a parent action that spawns the child:
- id: start_child
  type: CallApi
  endpointId: { _module.endpointId: { id: start-workflow, module: workflows } }
  payload:
    workflow_type: device-installation
    entity_type: ticket
    entity_id: { _state: new_ticket_id }
- id: link_to_parent
  type: CallApi
  endpointId: { _module.endpointId: { id: submit-action, module: workflows } }
  payload:
    action_id: { _state: parent_action_id }
    current_type: track-installation
    current_status: in-progress
    fields:
      key: { _step: start_child.workflow_id }
```

After this, the engine's tracker subscription (engine sub-design) finds this action whenever the child workflow transitions: `actions.find({ key: <child workflow_id>, "tracker.workflow_type": "device-installation" })`.

### Hard-coded child-stage map

The mapping from child workflow stage to parent action stage is **fixed by the module**. Apps don't supply a per-action `status_map` for it.

| Child workflow stage | Parent sub-workflow action stage |
| -------------------- | -------------------------------- |
| `active`             | `in-progress`                    |
| `completed`          | `done`                           |
| `cancelled`          | `not-required`                   |

Three reasons to hard-code:

- **The mapping is universal.** A running child should always show "in-progress" on the parent; a completed child should always show "done"; a cancelled child should always show "not-required" (the child was abandoned, parent doesn't wait on it any more).
- **Cuts every per-action `status_map` for sub-workflow actions** — they only need display copy now, not stage logic.
- **Prevents inconsistency.** With per-action mappings, two sub-workflow actions on the same parent could disagree about whether `cancelled` means "done" or "not-required." Hard-coding makes it deterministic.

Apps that genuinely need different semantics (e.g. cancelled child should flag the parent as `error`) use a regular form action and an app-side submit hook to mirror manually — "drop the engine machinery, push the rare case to app code."

### What this rules out

- **Cross-workflow gating** and **cross-entity gating** as separate primitives. If a parent action needs to wait on a child workflow, it adds a sub-workflow action that tracks the child, and the parent's other actions add `blocked_by: [sub-workflow-action]`. Same outcome, one mechanism (`blocked_by`).
- **Apps shouldn't need to declare cross-entity relationships in `modules.yaml`.** The engine knows nothing about how the lead and ticket entities are joined; the app's submit hook that creates the child is where that knowledge lives.
- **Per-action child-stage mapping.** Hard-coded as above. Apps that need bespoke mapping move to a form action + manual mirror hook.

### Constraint: 1:1 between sub-workflow action and child workflow

A parent sub-workflow action ↔ child workflow pair is **one-to-one**. The `(workflow_id, type, key)` unique index enforces "one action per (workflow, type, key)"; combined with `key = child workflow_id` it follows that one parent workflow can carry at most one sub-workflow action tracking a given child. Different parent workflows _can_ each track the same child; those are separate action docs in separate workflows.

What's ruled out by the constraint:

- One child workflow being mirrored by multiple parent actions _within the same parent workflow_.
- One parent action mirroring multiple sequential children.
- A parent action that's both a regular action and a sub-workflow action — `tracker:` and `form:` are mutually exclusive (Decision 2 inference rule).

### Two paired actions, not one

The recommended shape pairs **trigger** and **tracker** as two actions: a trigger action with a form that creates the child entity and starts the child workflow, plus a sub-workflow action that mirrors the child's lifecycle. The trigger action's submit hook does the `start-workflow` + `submit-action(action_id: <tracker>, fields: { key: <child_id> })` chain shown above; the sub-workflow action takes it from there.

The module doesn't enforce this split — apps can put `tracker:` on whatever action makes sense — but the README documents the paired-actions pattern as the recommended shape because it separates "workflow logic that creates the child" from "state mirroring."

## Decision 5 — Resolver pipeline

The module exports five JS resolvers that consume authored YAML at build time:

| Resolver                | Reads                                                   | Emits                                                                                                                                              | Used in                                                                              |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `makeActionPages`       | `workflows_config`, `app_name`                          | Array of page YAML (one per (workflow, action, verb))                                                                                              | `module.lowdefy.yaml` `pages:`                                                       |
| `makeWorkflowApis`      | `workflows_config`, `app_name`                          | Array of `Api` YAML — one entry per form action (wires `submit_hook` or a default `submit-action` call); skipped for task and sub-workflow actions | `module.lowdefy.yaml` `api:`                                                         |
| `makeWorkflowsConfig`   | `workflows_config`                                      | Runtime config object consumed by the WorkflowAPI connection                                                                                       | `module.lowdefy.yaml` `connections:` (the connection's `properties.workflowsConfig`) |
| `makeActionsForm`       | An action's `form` field + `components/fields/` library | Block tree for the form, with library components substituted by name (used inside the page templates)                                              | Inside templates, called recursively per action (form actions only)                  |
| `makeActionFormConfigs` | `workflows_config`                                      | Per-action form metadata map (validation, default values, field types)                                                                             | `global.action_form_configs` — read by templates and the `submit-action` API         |

Each resolver lives at `resolvers/{name}.js` in the module package and is invoked via `_ref: { resolver: ..., vars: { ... } }` from the appropriate location in `module.lowdefy.yaml`. Apps don't invoke any of them directly — the module's `module.lowdefy.yaml` does the wiring.

### `makeWorkflowApis` — the per-action endpoint generator

The resolver walks the workflows config and emits, per form action, one `Api` entry that wires the action's `submit_hook` (or a default thin call to `submit-action` if no hook is declared):

```yaml
# Generated request — one per form action.
# Bare passthrough when no submit_hook declared:
- id: "{workflow_type}-{action_type}-submit"
  type: Api
  routine:
    - id: submit
      type: CallApi
      properties:
        endpointId:
          _module.endpointId: { id: submit-action, module: workflows }
        payload:
          action_id: { _payload: action_id }
          current_type: { _build.var: action_type }
          # no unblocks / entity_update / event — author writes nothing,
          # the action just advances to `done`
    - :return:
        action_ids: { _step: submit.action_ids }

# Or, when the action declares submit_hook in its YAML, the generated
# endpoint runs that hook (which itself typically `CallApi`s submit-action
# with a richer payload):
- id: "{workflow_type}-{action_type}-submit"
  type: Api
  routine:
    _ref:
      path: "{action.submit_hook}"
```

An action YAML's submit-side surface is one optional field — `submit_hook` — that the resolver wires into the generated request:

```yaml
# An action YAML in workflow_config/lead-onboarding/qualify.yaml
type: qualify
action_group: discovery
status_map: { ... }
form: [...]
submit_hook: ../api/lead-onboarding-qualify-submit-hook.yaml # optional
```

**Scope: form actions only.** `makeWorkflowApis` runs only for form actions (Decision 2). Task actions don't get per-action endpoint generation — the shared `task-edit` page calls `submit-action` directly with the right payload. Sub-workflow actions don't have endpoints at all — the engine writes their status via the tracker subscription, never via a caller invocation.

For each form action the resolver emits exactly one `Api` entry, `id: '{workflow_type}-{action_type}-submit'`. When `submit_hook` is null the routine is a thin `CallApi` to `submit-action` with `current_status: done` and the action's type pre-filled. When `submit_hook` is set the routine `_ref`s the hook directly, and the hook itself calls `submit-action` with whatever richer payload it builds (unblocks, entity write, event log, etc.). See the module-surface sub-design for the full `submit-action` contract.

A single endpoint name per form action — no `endpoints: [...]` field, no per-verb iteration. Apps that want approve/request-changes UX surface them as separate review-stage form actions (e.g. a `qualify-review` action with `access.{app}: [view]` whose submit hook calls `submit-action` with `current_status: done`), or build the right payload from a single page button. The module doesn't enforce a multi-verb authoring pattern at the endpoint level.

### Resolver invocation in `module.lowdefy.yaml`

The module wires its own resolvers — apps don't write any of this. See [module-surface](../module-surface/design.md) "Decision 1" for the complete manifest sketch; the relevant resolver-invocation blocks are:

```yaml
pages:
  - _ref:
      resolver: resolvers/makeActionPages.js
      vars:
        workflows: { _module.var: workflows_config }
        app_name: { _module.var: app_name }

api:
  - _ref:
      resolver: resolvers/makeWorkflowApis.js
      vars:
        workflows: { _module.var: workflows_config }
        app_name: { _module.var: app_name }
  # plus the four static API _refs

global:
  workflows_config:
    _ref:
      resolver: resolvers/makeWorkflowsConfig.js
      vars: { workflows: { _module.var: workflows_config } }
  action_form_configs:
    _ref:
      resolver: resolvers/makeActionFormConfigs.js
      vars: { workflows: { _module.var: workflows_config } }
```

(`makeActionsForm` is the recursive form-builder; it's called inside the form-action page templates, not at the module's top level. It reads the form components library at `components/fields/` to substitute named components into the block tree — see Decision 6 below.)

## Decision 6 — Form components library

Form-author productivity comes from a small library of reusable field components — `controlled_list`, `label`, `label_value`, `date_range_selector`, plus the basic input wrappers — that authors compose into per-action `form:` blocks. The module ships this library at `components/fields/` in the module package. Apps reference components by **name** in their action YAML's `form:` array; the resolver substitutes the component's config (with author-supplied vars merged) into the page block tree at build time. **Apps never `_ref` these components directly** — there's nothing for the app to import or expose. The library is internal to the module's resolver pipeline.

Components shipped in v1:

| Component             | Purpose                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `text_input`          | Single-line text — wrapper over Lowdefy's `TextInput` with module-styled defaults    |
| `text_area`           | Multi-line text — wrapper over Lowdefy's `TextArea`                                  |
| `label`               | Read-only single-line label (used with `viewOnly: true` for derived/computed values) |
| `label_value`         | Read-only key-value pair display                                                     |
| `date_range_selector` | Two-date picker for start + end                                                      |
| `controlled_list`     | Dynamic list of sub-forms (used for fan-out scenarios — e.g. one row per device)     |

Each component is a YAML file with two top-level keys: `config` (the block-tree fragment to emit) and `vars` (the author-facing parameter list with types and required flags). Concrete example:

```yaml
# components/fields/controlled_list.yaml
vars:
  key: { type: string, required: true }
  title: { type: string, required: false }
  required: { type: boolean, default: false }
  hideAddButton: { type: boolean, default: false }
  hideRemoveButton: { type: boolean, default: false }
  form: { type: array, required: true } # the per-row sub-form blocks

config:
  id: { _module.var: key }
  type: ControlledList
  required: { _module.var: required }
  properties:
    title: { _module.var: title }
    hideAddButton: { _module.var: hideAddButton }
    hideRemoveButton: { _module.var: hideRemoveButton }
  blocks:
    _module.var: form
```

An author writes the following in their action YAML's `form:` block:

```yaml
form:
  - component: controlled_list
    key: form.devices
    title: Devices
    required: true
    hideAddButton: true
    form:
      - component: label_value
        key: form.devices.$._id
        title: Honeycomb Number
      - component: date_range_selector
        key: form.devices.$.warranty
        title: Warranty
        required: true
```

At build time, the form resolver (`makeActionsForm`) walks the array, looks up `controlled_list` and `label_value` and `date_range_selector` in `components/fields/`, merges the author's vars into each component's `config`, and emits one block tree the page template `_ref`s. Authors don't need to know what the rendered Lowdefy block tree looks like — they work in the component vocabulary.

**Why ship as a library, not as `exports.components`.** The components are not consumed via `_module.componentId` from app pages — they're internal building blocks the resolver dereferences. `exports.components` stays as the top-level UI blocks consuming apps drop onto entity pages: `actions-on-entity`, `workflow-header`, `action_role_check` (see [ui](../ui/design.md)). The form library is one layer below that; it never surfaces in app YAML except as a `component:` name string.

**Override + extension.** Apps that need a domain-specific component (e.g. a `device_selector` that hits an app-specific collection) ship it as a regular Lowdefy custom component in their plugin and reference it in `form:` blocks via `component: <plugin-name>:device_selector`. The resolver passes through any `component:` name it doesn't recognise as a library component, so app-side custom components compose alongside library components naturally.

Detailed library content is implementation-time material; the v1 list is the floor, and the module adds entries as patterns emerge during real-app adoption.

## Open Questions

1. **`makeActionsForm` recursion across module boundaries (early-implementation spike required).** The resolver recursively invokes itself to build nested form sections (e.g. ControlledList inside a form). The recursion uses a relative path. When the resolver lives in the module package, the recursive `_ref` path inside templates is resolved against the _template's source location_ at template-render time, which goes through the module-loader. No existing modules-mongodb module uses `_ref: { resolver }` from inside a template, so this is genuinely untested. Before relying on the recursion, run a minimal spike: a template inside a module that calls `_ref: { resolver: <relative-path> }` and confirms the resolver runs and the path resolves correctly. If it doesn't, the form builder becomes a flat (non-recursive) emitter — apps that need nested form sections supply a per-action template override.

## Next Step

Implementation of the resolvers, components library, and authoring conventions. Apps write YAML against this surface; the [engine](../engine/design.md) sub-design consumes it at runtime; the [ui](../ui/design.md) sub-design renders it.
