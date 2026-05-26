# Custom action kind

Adds a fourth action `kind:` to the workflows module — `custom` — for workflows whose action has the same status-transition semantics as `task` but whose entire submit surface lives in app-supplied pages and APIs rather than the module. The module ships no pages, no submit endpoint, and no hook surface for `custom` actions; apps wire `status_map.link` to their own pages, and those pages call the `SubmitWorkflowAction` plugin handler directly inside an app-authored Lowdefy Api.

This unblocks workflows where the per-action UX is dictated by an existing app page (e.g. a domain document editor, a multi-screen wizard, an external system mirror) that doesn't fit the shared `task-edit` shape and shouldn't be forced into a `form:` block.

## Proposed change

1. Add `kind: custom` as the fourth value of the action-kind enum in [action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md) and [makeWorkflowsConfig.js](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js). It rejects `form:`, `tracker:`, `hooks:`, `interactions:`, and `event:` at build time; it accepts the universal-fields (`assignees`, `due_date`, `description`), `action_group`, `sort_order`, `required_after_close`, `blocked_by`, `access`, and `status_map`.
2. Skip per-action page emission in [makeActionPages.js](../../../../modules/workflows/resolvers/makeActionPages.js) for `kind: custom` (same posture it already takes for `task` and `tracker`). The module ships no shared pages for this kind either — apps own the UI entirely.
3. Skip per-action endpoint emission in [makeWorkflowApis.js](../../../../modules/workflows/resolvers/makeWorkflowApis.js) for `kind: custom`. No `update-action-{action_type}` Api is generated; no hook Apis are generated.
4. Reuse `SubmitWorkflowAction` as the engine entry point for custom-action writes. Apps invoke it from their own Lowdefy Api routine with `interaction: submit_edit` and a caller-supplied `current_status` (the same `current_status` channel the task kind already uses). Document the routine shape in the workflows module README under a new "Custom actions" section.
5. Document the `status_map.link.pageId` convention for custom actions — it points at an app-side page id; the module does not validate it. (No code change; spec-level documentation of an existing freedom.)

## Why a fourth kind

The existing three kinds each occupy a distinct slot on two axes — *who owns the UI* and *who calls the engine*:

| Kind      | UI owner         | Submit endpoint                                  | Status source                                       |
| --------- | ---------------- | ------------------------------------------------ | --------------------------------------------------- |
| `form`    | Module (per-action pages, via `form:`)  | Resolver-emitted `update-action-{action_type}` | Engine default / `interactions:` / pre-hook         |
| `task`    | Module (shared `task-edit/view/review`) | Resolver-emitted `update-action-{action_type}` | Caller-supplied (`current_status`) on `submit_edit` |
| `tracker` | Module (inline in `actions-on-entity`)  | None (engine writes via subscription)            | Hard-coded child-stage map                          |
| `custom`  | **App** (custom pages)                  | **None** (app-authored Lowdefy Api)              | Caller-supplied (`current_status`) on `submit_edit` |

`custom` is the slot where neither `task`'s shared page nor `form`'s per-action page is the right home for the UI, but the engine's status model and per-action lifecycle should still apply. The closest existing analogue is `task` — same status semantics, same `current_status` channel — but with the module's UI and submit-endpoint emission stripped away. The motivating shape is "the action represents a piece of work, the user does that work on a page the app already owns, and we want the workflow's status array, group rollup, blocked_by, and tracker fan-up to keep working."

The alternatives considered:

- **A `form` action with an empty `form:` block and `status_map.link` pointing at an app page.** Rejected: still emits four per-action pages (none of which the app uses), still emits `update-action-{action_type}` with a `form:` payload contract the app doesn't honour, and forces the action through `form`'s priority-rule status path (no caller-supplied `current_status`).
- **A `task` action with `status_map.link` pointing at the app page instead of `task-edit`.** Rejected: still ships the three shared task pages (which appear in the build's page-id index even when unreferenced), still emits `update-action-{action_type}` (which the app's custom page may or may not use depending on whether it routes through the shared task pages), and forces the action through the task page's status-selector UX semantics. Authors who pick `custom` are stating "the shared task page is not the surface" — encoding that choice in the kind is cleaner than encoding it in `status_map.link`.
- **An extension knob on `task` (e.g. `task.shared_pages: false`).** Rejected: same encoding-choice-as-a-flag problem; downstream resolvers all need a `task && !shared_pages` branch which is just `custom` spelled awkwardly. Kinds are the discriminator the resolvers already key on.

## What the kind means at each layer

### Build-time validation (`makeWorkflowsConfig`)

Add `custom` to `ACTION_KINDS`. New rules in `validateAction`:

- `kind: custom` rejects `form:` ("custom actions cannot define form: — use kind: form for a form-driven action").
- `kind: custom` rejects `tracker:` ("custom actions cannot define tracker: — use kind: tracker for a tracker action").
- `kind: custom` rejects `hooks:` ("custom actions cannot declare hooks: — hooks are only meaningful when the module emits the submit endpoint; custom actions handle pre/post logic inside their app-supplied API routine").
- `kind: custom` rejects `interactions:` ("custom actions cannot declare interactions: — apps supply current_status directly when calling SubmitWorkflowAction").
- `kind: custom` rejects `event:` ("custom actions cannot declare event: — apps shape the log event payload inside their app-supplied API routine").
- `kind: custom` accepts `key:` (instanced custom actions are allowed; same identity rules as form/task — `(workflow_id, type, key)`).
- `kind: custom` rejects `required_after_close: true` is **not** restricted — the flag works the same as for task/form (action survives close-sweep unless blocked).
- Existing `key:`/`tracker:` mutual-exclusion stays — `custom` actions opt into `key:` the same way `form`/`task` do.

The kind passes through into the runtime `workflowsConfig` via the existing `ACTION_FIELDS` pick — no schema-shape change to the runtime config, only a new enum value.

**Absorb Part 30's link / validator contracts for `custom`.** Part 30 ships engine-driven `link` computation (D4) and shape-only cell validation (D7) for built-in kinds only — `custom` was deliberately deferred. When this part lands, do three things:

1. **`computeEngineLinks` short-circuits for `custom`** — Part 30 already special-cases this (returns `{}`); confirm the branch is hit and add the `kind: custom` test case to `computeEngineLinks.test.js`.
2. **Cell shape validator accepts `link:` for `custom`** — Part 30's `validateStatusMapCells` rejects `link:` for built-in kinds. Extend the validator's kind branch so `kind: custom` cells pass with the shape `{ message?: string, link?: { pageId: string, urlQuery?: object, input?: object } }`. The `{ action_id: true }` sentinel substitution path (`substituteActionIdSentinel.js`) is wired for custom in Part 30; nothing further needed here on the engine side.

### Page emission (`makeActionPages`)

Branch as today: `if (action.kind !== "form") return []`. The `!== "form"` check already excludes `task` and `tracker`; adding `custom` to the kind enum doesn't change this line. No work needed beyond the validation update.

### Endpoint emission (`makeWorkflowApis`)

The current resolver iterates actions and skips `kind: tracker` (no endpoint), emitting for both `form` and `task`. Change the skip condition from `if (action.kind === "tracker") continue;` to skipping anything that isn't `form` or `task` (i.e. also skip `custom`). Hook-API emission (`emitHooks`) is gated on `action.hooks` being present, which the build-time validator now forbids for `custom`, so no separate guard is needed.

### Engine handler (`SubmitWorkflowAction`)

No code change. The handler currently keys on `action.kind === "task"` in [handleSubmit.js:32](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js#L32) to enforce caller-supplied `current_status` on `submit_edit`. Custom actions need the same treatment — extend the condition to `if (actionConfig.kind === "task" || actionConfig.kind === "custom")` so a `submit_edit` interaction with `current_status` works for both kinds. Every other engine path (priority rule, group recompute, blocked_by fan-out, tracker fire, close sweep) already keys on `status[0].stage` rather than `kind`, so no other handler change is needed.

The five-interaction vocabulary (`submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`) is still available for custom actions — the app can call `SubmitWorkflowAction` with any of them. The status defaults table from [submit-pipeline/spec.md § Interaction → target status](../../../workflows-module-concept/submit-pipeline/spec.md) applies per interaction. For `custom`, the `submit_edit` default is "caller-supplied via current_status" (matching task). The other four interactions default to their fixed targets (`not-required`, `done`, `done`, `changes-required`) — apps that call with `interaction: approve` get the engine to push `done`, etc. Apps that want a non-default target on `submit_edit` supply `current_status` explicitly; on other interactions, they call with `interaction: submit_edit` + `current_status: <whatever>` instead.

### `status_map` and entity-page display

`actions-on-entity` (part 18) consumes `status_map.{stage}.{app_name}` the same way for every kind — no branch on `kind`. A custom action with a `status_map.action-required.{app_name}.link` cell renders as a clickable card whose `link.pageId` resolves through Lowdefy's normal page-id resolution. The id can be any page in the host app — the module doesn't introspect it.

Conventions documented in the workflows module README (no enforcement):

- `link.pageId` points at an app-side page id (not a `_module.pageId` reference).
- `link.urlQuery.action_id: true` substitutes the current action's `_id` into the query string, the same as task/form. Apps' custom pages typically read `?action_id=<id>` and render their UI keyed by it.
- For instanced custom actions, the action-instance message templating works the same as task/form — Nunjucks against the action-doc fields, with `urlQuery: { action_id: true }` selecting the instance.

## App-side shape

A custom action declared in workflow YAML, plus the app-side page and API the action depends on:

```yaml
# workflow_config/account-review/review-document.yaml
type: review-document
kind: custom
action_group: review
sort_order: 20
description: Review the proposed contract document and either approve or request revisions.
blocked_by: [collect-requirements]
access:
  my-team-app: [view, edit, review]
  roles: [account-manager]
status_map:
  blocked:
    my-team-app: { message: Awaiting requirements. }
  action-required:
    my-team-app:
      message: Review the contract document.
      link:
        pageId: contract-review                          # app-side page id
        urlQuery: { action_id: true }
  in-review:
    my-team-app: { message: In review. }
  done:
    my-team-app:
      message: Document approved.
      link:
        pageId: contract-view
        urlQuery: { action_id: true }
```

The app supplies a page (`pages/contract-review.yaml`) that loads the contract, lets the user edit it, and on save calls a thin app-authored API:

```yaml
# api/contract-review-submit.yaml
id: contract-review-submit
type: Api
auth:
  public: false
  roles: [account-manager]                                # matches action.access.roles
routine:
  - id: save_contract
    type: MongoDBUpdateOne
    connectionId: contracts-collection
    properties:
      filter: { _id: { _payload: contract_id } }
      update: { $set: { body: { _payload: body }, ...change_stamp } }

  - id: submit_action
    type: SubmitWorkflowAction
    connectionId:
      _module.connectionId: { id: workflow-api, module: workflows }
    properties:
      action_id: { _payload: action_id }
      action_type: review-document
      workflow_type: account-review
      interaction: submit_edit
      current_status: done                                # or in-review, changes-required, etc.
      fields:                                             # universal-fields update channel
        description: { _payload: review_summary }

  - :return:
      action_ids: { _step: submit_action.action_ids }
      completed_groups: { _step: submit_action.completed_groups }
```

The two writes (app-domain write and workflow-action write) are not atomic — same posture as form/task actions whose pre-hook does an entity write. If atomicity matters, the app moves the domain write into a pre-hook of a form-kind action instead, accepting the form-page UX.

The app's page composes its own buttons. Each button calls `contract-review-submit` with a different `interaction` + `current_status` combination — "Save Draft" might call `interaction: submit_edit, current_status: in-progress`; "Submit for Review" calls `interaction: submit_edit, current_status: in-review`; etc. The page is free to surface any UI the app needs — a multi-step wizard, an inline editor, a mirror of an external system — because the module isn't generating it.

## What's still wired up automatically

The custom kind is "no module-supplied UI / no module-supplied endpoint" — but every other engine feature still works:

- **Status array + priority rule.** Writes go through `SubmitWorkflowAction`'s normal path; the priority rule still gates transitions (so a `done` action can't be pushed back to `action-required` without `force: true`).
- **`blocked_by` fan-out.** Other actions can list a custom action in their `blocked_by`; when the custom action reaches a terminal status, those actions auto-unblock.
- **Group rollup.** Custom actions belong to `action_groups` and contribute to group-status computation like any other.
- **`required_after_close: true`.** Works the same as for form/task — the action survives a `CloseWorkflow` sweep unless it's `blocked`.
- **Tracker fan-up.** A custom action's terminal write triggers tracker subscription if the containing workflow's status changes. Custom actions cannot themselves *be* trackers (they carry no `tracker:` block) but a custom action terminating a workflow still propagates up to a parent tracker.
- **Log events and notifications.** `SubmitWorkflowAction` still dispatches the default log event and notifications. App-authored APIs that want to customise the event shape do so by populating `metadata` or by writing their own event in the app routine *before* calling `SubmitWorkflowAction` (the engine's default event is additive — apps don't suppress it).
- **`workflow-overview` page (part 17).** The shared workflow-overview page reads `get-entity-workflows` output and renders one card per action. Custom actions appear like any other — the card's link cell uses the action's `status_map.{current_stage}.{app_name}.link.pageId`, which for custom actions is the app-side page id.

## What's deliberately not provided

- **No shared "custom-edit" page.** The whole point of the kind is "app owns the UI"; shipping a shared scaffold would invite drift and partial overrides that don't compose. Apps that find themselves wanting a shared shape across many custom actions should consider declaring those as `task` actions instead and customising the shared task page via the existing app-side override patterns.
- **No hook surface.** `hooks:` is rejected at build time. The motivation: hooks are a coordination mechanism between the action-author's YAML and the engine's submit endpoint; when the app owns the submit-endpoint surface, the app's API routine *is* the hook. Apps that want pre-write validation inline the check before the `SubmitWorkflowAction` step; apps that want post-write effects inline them after. The app routine has full read/write access to Mongo and full `CallApi` access to other modules.
- **No `interactions:` block.** Same reasoning — `interactions:` is the build-time-baked override of engine status defaults for a submit-endpoint the module emits. When the app owns the endpoint, the app supplies `current_status` directly.
- **No build-time validation of `status_map.link.pageId` against the host app's page ids.** Module resolvers don't have a view into the host-app page tree; the existing form/task links to `_module.pageId` are validated by Lowdefy's normal page-id resolution at build time, but free-form app page ids are not. A typo in `link.pageId` for a custom action surfaces at click time as a 404, the same as a typo anywhere else in Lowdefy.

## Files changed

| File                                                                                                                                                | Change                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [modules/workflows/resolvers/makeWorkflowsConfig.js](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)                                      | Add `custom` to `ACTION_KINDS`; add rejection rules for `form:`, `tracker:`, `hooks:`, `interactions:`, `event:` on `kind: custom`; add the matching test cases.                       |
| [modules/workflows/resolvers/makeWorkflowApis.js](../../../../modules/workflows/resolvers/makeWorkflowApis.js)                                            | Change the loop skip from `if (action.kind === "tracker") continue;` to `if (action.kind !== "form" && action.kind !== "task") continue;`. Add test coverage for `kind: custom` skip.  |
| [modules/workflows/resolvers/makeActionPages.js](../../../../modules/workflows/resolvers/makeActionPages.js)                                              | No code change (the `if (action.kind !== "form") return []` guard already excludes `custom`); add a test asserting `custom` emits no pages.                                            |
| [plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) | Extend the `submit_edit` branch's `kind === "task"` check to also match `kind === "custom"`, routing both to caller-supplied `current_status`. Update the matching handleSubmit test. |
| [designs/workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md)                                   | Add `custom` to the kind table; add a "Custom action" section mirroring "Task action" / "Tracker action"; update validation list.                                                     |
| [designs/workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md)                                     | Add a "Custom kind" row to the "Per-action `update-action-{action_type}` Api" Scope block stating it's not emitted; add `custom` to the per-interaction status-default table.          |
| [designs/workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md)                                                               | Add `custom` to the per-action page generation table ("None — app supplies pages"); add a short subsection under "Page-level rendering of universal fields" noting that custom actions render entirely on app pages. |
| [modules/workflows/README.md](../../../../modules/workflows/README.md)                                                                                    | Add a "Custom actions" section under Notes (or wherever the kind taxonomy is documented) with the app-side page + API shape and the link-cell convention.                              |

## Open questions

1. **Does the universal-fields update channel (`fields:` payload block) carry through cleanly for custom actions?** The engine path for `fields:` doesn't branch on `kind` — it just `$set`s `assignees`/`due_date`/`description` on the action doc. So yes, custom actions can use `fields:` the same way task actions do. Worth a worked-example test in the README to make this explicit.
2. **Should we add a Playwright spec covering an end-to-end custom action?** Part 22 owns the e2e suite; if so, this design would add a `custom-action.spec.js` to its set, with an app-side page in `apps/demo/` exercising the kind. Open: defer to whoever picks this up to scope alongside.

## Related

- Source kinds and resolver behavior: [workflows-module-concept/action-authoring/spec.md § Action kinds](../../../workflows-module-concept/action-authoring/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md).
- Shipped engine handler: [plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js).
- Shipped resolvers touched: [makeWorkflowsConfig.js](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js), [makeWorkflowApis.js](../../../../modules/workflows/resolvers/makeWorkflowApis.js).
- Workflows module implementation tracker: [designs/workflows-module/design.md](../../design.md). This design lands as a follow-on (in the spirit of parts 21 / 22 / 23) — small enough to amend shipped resolvers and the shipped `handleSubmit.js` directly rather than gating on an unimplemented sibling.
