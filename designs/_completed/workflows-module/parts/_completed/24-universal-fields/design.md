# Part 24 — Universal-fields surface (`assignees`, `due_date`, `description`)

> **Superseded in part by [Part 64](designs/workflows-module/parts/_completed/64-action-description/design.md).** The `description` universal field described here was a mistake — a per-instance, end-user-editable rich-text field redundant with action comments. Part 64 **deletes** it (universal fields become `assignees` + `due_date` only) and revives `description` as an author-authored config field (the originally-intended one). The `assignees` / `due_date` write path below — the `{workflow_type}-update-fields` operation, the chips/modal, the role gating — is unchanged. Read this document for that machinery; ignore every `description` reference in it.

> **Revision 2 (current-state reconciliation).** This design and its three reviews were written across the `kind: simple` era. Since then Parts 38/39/40/43 (and 46/48/49) shipped and **restructured the surfaces this part binds to**. This revision re-grounds the design on the in-tree code. The substantive changes from Revision 1, each justified inline below:
>
> 1. **Endpoint is `{workflow_type}-update-fields`, one per workflow type** (action*id-dispatched), mirroring the shipped `{workflow_type}-submit` — \_not* the per-action-type `{workflow_type}-{action_type}-update-fields` of Rev 1. The build-time `action_type` component var is dropped. (Supersedes the "user-approved" per-action-type id in tasks.md; the workflow prefix still avoids the cross-workflow collision that approval was about.)
> 2. **The read path is `get_workflow_action`** (the `GetWorkflowAction` plugin handler, Part 46), which returns a **single curated object**, not the old `get_action.yaml` aggregation array. Every `get_action.0.*` binding in Rev 1 is wrong twice (name + index). Display binds `_state: action.*` (form) / `_state: current_action.*` (check) — both already shipped — with no `.0.`. This **inverts review-3 finding #5**.
> 3. **Assignee display docs come from amending the `GetWorkflowAction` handler envelope** (`assignee_docs`), _not_ a `$lookup` in `requests/get_action.yaml` — that file no longer exists. This is a plugin change, not a YAML one.
> 4. **Check-kind renders via Part 40's shared `check-action-surface.yaml`** (one body for the modal + the `workflow-action-{edit,view,review}` pages), state namespace `current_action.fields`, `mode` derived from `allowed.edit` — _not_ separate check pages with `surface.fields`.
> 5. **Part 38's helpers have drifted** (Parts 48/49 landed on top). The amendments still apply; the load-mode discriminator note is updated.
> 6. **Part 39's `fields`-drop + regex-narrow already landed** (submit `Validate` is `^form\.` today), and Parts 16/17/39/40 are all in `_completed/`. Part 33 is active (not `_next/`).

The three action-level fields every action carries — `assignees`, `due_date`, `description` — are **metadata about the action**, not part of what a form submission captures. This part pins their contract across the form and check kinds and ships one reusable Lowdefy component the page templates compose.

The headline change: on **form-kind** actions, universal fields are written by their **own operation**, fully decoupled from the form submit. They render as a right-hand **sidebar card** with its own Update button, and the form's `submit` / `progress` buttons carry no `fields` payload. On **check-kind** actions the universal fields _are_ the submission content, so they are **both** written on the `submit` / `progress` signals (primary content) **and** independently editable through the **same shared Update operation** form uses. The Update operation is offered for **every surface-bearing kind** (form and check — tracker excepted): there is **no check special-case**, so any action's fields can be updated without a transition — e.g. reassigning a `done` check action, the gap a submit-only write left open. This is the minimal, scoped landing of the "operations vs transitions" split from [critique-concepts.md §3](../../../../workflows-module-concept/review/critique-concepts.md) — the category the [state-machine](../../../../workflows-module-concept/state-machine/design.md) sub-design deliberately parked as a non-goal (`state-machine/design.md:323`), here implemented for exactly one operation (write the three fields).

Tracker actions are excluded — they have no view surface (no `-view` / `-edit`, only inline rendering in `actions-on-entity` via `status_map.message`), so there's nowhere to render the fields. The tracker doc still carries the three fields (the engine writes them at `StartWorkflow`, carried from the parent action), but no UI renders them in v1.

## Proposed change

1. **Form-kind universal fields become a state-orthogonal operation.** A new resolver-emitted endpoint `{workflow_type}-update-fields` (one per workflow type, dispatched by `action_id` — exactly like `{workflow_type}-submit`) writes the three fields with no `signal`, no `form`, and no FSM transition. The form-submit payload (`submit` / `progress`) carries no `fields` key (already true in-tree — Part 39 landed).
2. **This part owns the full write path.** It ships the `UpdateActionFields` plugin handler + `planFieldsUpdate.js` planner, the `makeWorkflowApis` change to emit the endpoint, the connection registration, the `universal_fields` resolver passthrough, the `GetWorkflowAction` `assignee_docs` envelope amendment, and the submit-planner guard that confines the universal-field write to `kind: check`. The handler reuses [Part 38](designs/workflows-module/parts/_completed/38-engine-rebuild/design.md)'s load→plan→commit + render helpers: set fields, merge metadata, **re-render the status-map cell**, emit an `action-fields-updated` log event, no workflow write.
3. **Form-kind fields render as a right-hand sidebar card** with its own Update button, beside the form body. Check-kind fields render as primary content on the check surface and are written on `submit` / `progress` — **and** also carry the same Update affordance, so they can be updated independently of a transition.
4. **Universal fields are editable whenever the user has the `edit` verb** — the stage-based editable allowlist and the `required_after_close` carve-out are gone. You can reassign a `done` action or fix a due date on an `in-review` one.
5. **Presence is author-declared via `universal_fields`** (which of the three to show). Default: all three, shown and optional. `universal_fields: false` / `[]` hides the surface. `universal_fields_required` is **dropped** (no demonstrated need; re-addable later).
6. **One reusable component** (`components/universal-fields/universal-fields.yaml`) with `kind` × (`edit`/`display`) modes. **Every kind gets the same Update operation + button** (no check special-case); `kind` drives one remaining behavioural difference — whether the `submit` / `progress` signals **also** write the fields (check: yes; form: no). Resolves Part 24 review-1 finding #8.

## Why decouple (and why it simplifies)

Bundling the universal fields into the form submit forced three kinds of friction, all of which this split removes:

- **You couldn't touch metadata without a transition.** Reassigning or re-dating an action meant re-submitting it — re-running form validation and (for actions with a `review` verb) bouncing it back through review. critique §3 named this exactly. As an independent operation, metadata edits are role-gated and stage-agnostic.
- **The editable-stage allowlist and `required_after_close` band-handling vanish.** None of that is needed now: the operation is editable iff the user has the `edit` verb, full stop. `required_after_close` reverts to its real meaning — whether _form submit_ survives a closed workflow ([action-authoring spec](../../../../workflows-module-concept/action-authoring/spec.md)) — and stops touching this surface.
- **`kind` earns its keep.** Every kind shares the independent Update operation, but `kind` still selects whether the `submit` / `progress` signals **also** write the fields — check writes them, form does not. So the component's `kind` var drives a real engine behaviour, not just cosmetics — closing Part 24 review-1 finding #8.

### Why it still goes through the engine (not a plain `MongoDBUpdateOne`)

Status-map cells can reference `assignees` / `due_date` (Part 38 D12's render context spreads them into the cell template), so a field change must **re-render the sticky cell** — otherwise the entity-page card keeps showing the old assignee until the next transition, the precise staleness class [Part 38](designs/workflows-module/parts/_completed/38-engine-rebuild/design.md) exists to eliminate. The rendered cell is stored on the action doc (`action[app_name].message`) and the entity card reads it from there via the Part-46 handler (`GetEntityWorkflows.js:91` — `const message = action[app_name]?.message ?? null`), so re-rendering the cell on the action doc is sufficient — no workflow write needed. A plain plugin write would either skip the re-render (stale display) or duplicate the render helpers in YAML (violates "one correct way"). So the operation runs through a real engine handler that reuses Part 38's render path. It is **not** an FSM signal — keeping it out of the signal model is the deliberate operations/transitions boundary state-machine.md draws.

## In scope

### Component shipped

`modules/workflows/components/universal-fields/universal-fields.yaml` — one Lowdefy component (replacing the current stub at that path), composed by the form templates (Part 16) and the shared check surface (Part 40 — `check-action-surface.yaml`):

```yaml
- _ref:
    path: components/universal-fields/universal-fields.yaml
    vars:
      mode: edit # 'edit' | 'display'
      kind: form # 'form' | 'check' — tracker excluded
      state_path: fields # state namespace for the edit-mode inputs (block IDs become {state_path}.{field})
      workflow_type: lead-qualification # literal (form, njk) OR an operator (check); builds the endpoint id
      show: # which fields render; from action_config.universal_fields
        _var: action_config.universal_fields # default [assignees, due_date, description]
      action_data: # bindings the inputs/display read
        assignees: { _state: fields.assignees }
        due_date: { _state: fields.due_date }
        description: { _state: fields.description }
```

There is **no `action_type` var** — the endpoint is per-workflow (see "The operation" below), so the component only needs `workflow_type` to build it.

Block-id convention follows the CLAUDE.md "Input block IDs match data paths" rule, parameterised by the `state_path` var (default `fields`): `{state_path}.assignees`, `{state_path}.due_date`, `{state_path}.description`. The default keeps the form sidebars at `fields.*`; Part 40's `check-action-surface` passes `state_path: current_action.fields` so its inputs land in the surface's state namespace and its scoped `Validate` (`^current_action\.fields\.`) matches them. The namespace threads into the `user-multi-selector` id passthrough (Files changed).

**Behaviour by `kind` × `mode`:**

| `kind`  | `mode`    | Renders                                                             | Write path                                                                                                                                                                                       |
| ------- | --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `form`  | `edit`    | Sidebar card: the declared inputs **plus its own Update button**    | Button calls `{workflow_type}-update-fields` with `action_id` + `fields: { _state: {state_path} }` + optional `comment`. **Independent of form submit.**                                         |
| `form`  | `display` | Sidebar card, read-only                                             | reads `_state: action.*` (the form templates prime `action ← get_workflow_action` in onMount)                                                                                                    |
| `check` | `edit`    | Primary content: the declared inputs **plus its own Update button** | Update button calls `{workflow_type}-update-fields` (independent of any transition); **and** the surface's `submit` / `progress` signals also carry `fields: { _state: current_action.fields }`. |
| `check` | `display` | Primary content, read-only                                          | reads `_state: current_action.*`                                                                                                                                                                 |

**Binding by mode:**

- **`edit`** — `action_data` bound to `_state.{state_path}.*`; primed by the container's `onMount` / open handler from the loaded action envelope. For form kind the component's own Update button posts the `_state.fields` subtree; for check kind both the Update button and the surface's submit button post `_state.current_action.fields`.
- **`display`** — `action_data` bound to the primed action doc in state: `_state: action.*` (form templates) or `_state: current_action.*` (check surface). **Not** `_request: get_workflow_action.*` with an index — `get_workflow_action` is the `GetWorkflowAction` handler (Part 46), which returns a **single object** (the old `get_action.yaml` aggregation array is gone), so a bare `_request: get_workflow_action.assignees` already resolves correctly (no `.0.`); the shipped templates prime it into state and bind `_state.*`, which is the canonical form here.

  ```yaml
  - _ref:
      path: components/universal-fields/universal-fields.yaml
      vars:
        mode: display
        kind: form
        show: { _var: action_config.universal_fields }
        action_data:
          assignees: { _state: action.assignees }
          assignee_docs: { _state: action.assignee_docs } # display-mode avatars (from the GetWorkflowAction envelope)
          due_date: { _state: action.due_date }
          description: { _state: action.description }
  ```

### Where the component renders

| Surface                                      | Container                                                            | Mode                                                | Placement / notes                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Form action `edit` (Part 16 `edit.yaml.njk`) | form page                                                            | `edit`                                              | Right sidebar card with its own Update button. Form submit does **not** write these fields.                                                  |
| Form action `view` (`view.yaml.njk`)         | form page                                                            | `display`                                           | Right sidebar card, read-only.                                                                                                               |
| Form action `review` (`review.yaml.njk`)     | form page                                                            | `display`                                           | Right sidebar card, read-only. Reviewers who need to change metadata use the `edit` page sidebar.                                            |
| Form action `error` (`error.yaml.njk`)       | form page                                                            | `display`                                           | Right sidebar card, read-only.                                                                                                               |
| Check action (`check-action-surface.yaml`)   | shared body (modal + the `workflow-action-{edit,view,review}` pages) | derived: `edit` when `allowed.edit`, else `display` | Primary content (status buttons + comment below) **plus the Update button**. Written on `submit` / `progress`, and independently via Update. |

The form template renders the sidebar column **iff `show` is non-empty**; when an action declares `universal_fields: false` / `[]` the column is omitted and the form body spans full width. (The form templates currently render the stub **inline in the form body**; Part 16's follow-on edit moves it to a two-column row — see "Consumed by".)

### The operation: `{workflow_type}-update-fields`

Resolver-emitted by **this part's** `makeWorkflowApis` change — **one endpoint per workflow type** that declares any surface-bearing (`form` / `check`) action, dispatched by `action_id`, exactly mirroring the shipped `{workflow_type}-submit` / `{workflow_type}-start` endpoints (`makeWorkflowApis.js:135,174` — these are per-workflow, not per-action-type). The handler loads the action by id and reads its `type` / `workflow_type` / `kind` from the doc, so it needs no per-action-type endpoint granularity. The `{workflow_type}-` prefix avoids the cross-workflow collision the Rev-1 per-action-type id was guarding against, while staying consistent with every other engine operation.

```yaml
id: {workflow_type}-update-fields
type: Api
routine:
  - id: update_fields
    type: UpdateActionFields
    connectionId: { _module.connectionId: workflow-api }
    properties:
      action_id: { _payload: action_id }
      workflow_type: <workflow_type>   # build-time literal (the only per-workflow constant)
      fields: { _payload: fields }     # { assignees, due_date, description }
      comment: { _payload: comment }   # optional; folds into display.{app_name}.description via planEventDispatch (Part 33)
  - :return:
      action_id: { _step: update_fields.action_id }
      event_id:  { _step: update_fields.event_id }
```

The component's Update button builds the endpoint id at **runtime**, the same `_string.concat: [{_module.id}, '/', <workflow_type>, '-suffix']` pattern the check surface already uses for `-submit` (`check-action-surface.yaml:338-342`). `workflow_type` is passed as a var that is a literal string from the form njk templates (`{{ workflow_type }}`) or a state operator from the check surface (`{ _state: current_action.workflow_type }`) — both resolve at runtime through the same concat:

```yaml
- id: button_update_fields            # rendered by the component, both kinds, edit mode
  type: Button
  properties: { title: Update, type: primary }
  visible: { _eq: [{ _state: action_root.allowed.edit }, true] }   # action.allowed.edit / current_action.allowed.edit — see Role gating
  events:
    onClick:
      - id: validate
        type: Validate
        params: { regex: ['^{state_path}\.'] }   # state_path-scoped, e.g. ^fields\. or ^current_action\.fields\.
      - id: update_fields
        type: CallAPI
        params:
          endpointId:
            _string.concat:
              - { _module.id: true }
              - /
              - { _var: workflow_type }
              - -update-fields
          payload:
            action_id: { _state: {action_root}._id }    # action._id (form) / current_action._id (check)
            fields:    { _state: {state_path} }
            comment:   { _state: {comment_path} }        # optional
```

**Engine handler `UpdateActionFields`** — a new plugin entry point in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/UpdateActionFields/`, **shipped by this part**, on the same `WorkflowAPI` connection as `SubmitWorkflowAction` / `StartWorkflow` / etc. It reuses **and minimally amends** [Part 38](designs/workflows-module/parts/_completed/38-engine-rebuild/design.md)'s helpers — `loadWorkflowState` / `commitPlan` (`shared/phases/`), `planEventDispatch` (`shared/phases/planners/`), and `renderStatusMap` (`shared/render/`, reused unchanged) — and adds one new planner `shared/phases/planners/planFieldsUpdate.js`. **Note (Rev 2): Parts 48 and 49 have since landed on top of Part 38** — `planEventDispatch`'s `event_overrides` path was generalized (Part 48) and `loadWorkflowState`'s `SIGNAL_VERBS` are now arrays (Part 49). The amendments below still apply, but the implementer must re-anchor against the current file shapes. The amendments (one each): `planEventDispatch` gains the `UpdateActionFields` handler type; `loadWorkflowState` gains a third signal-less `{ actionId, verb }` mode; `commitPlan` (+ the `Plan` typedef in `types.js`) accepts a workflow-less plan. All four appear under "Files changed".

- **Load** — workflow + target action + configs via `loadWorkflowState`'s new third mode `{ actionId, verb: 'edit' }`. **Discriminator (Rev 2):** the shipped helper keys "submit mode" on `actionId !== null` (`loadWorkflowState.js:110`); the fields mode also carries `actionId`, so the discriminator must split on **signal presence** — `actionId && signal` → submit; `actionId && !signal` (verb passed) → fields mode. The fields mode is signal-less (no FSM signal to resolve), access-gated on the per-app **`edit`** verb (`access.{app_name}.edit` via `gateAllows` — Part 34's per-verb model; action-wide `access.roles` was removed by Part 34 D4), and **no stage check** (the submit mode's stage/`required_after_close` gate doesn't apply). The gate stays ahead of any side effects, preserving Part 38's load-gate invariant (the access gate that throws before any read result is returned — `loadWorkflowState.js:216-219`; `:43-46` is now the `gateAllows` helper body, not the gate site).
- **Plan** (pure) — compose planned action doc = loaded action with `assignees` / `due_date` / `description` `$set`, change-stamp refreshed, `metadata` merged; **re-render the status-map cell** (Part 38 D12 render path) against the planned doc; build the `action-fields-updated` log event **via `planEventDispatch`** — this part adds an `UpdateActionFields` branch to the `titleTemplate` if/else chain that stamps `type: action-fields-updated` directly (no signal to derive it from) and sets a default title — reuse the existing `ACTION_FALLBACK_TITLE` (`'{{ user.profile.name }} updated {{ action.title }}'`), which already matches the convention — and passes `comment` through; the comment folds into `display.{app_name}.description` via [Part 33](designs/workflows-module/parts/_completed/33-comment-rendering/design.md)'s `foldCommentIntoEvent` inside the planner — **no `metadata.comment`**, no hand-built event payload; build the change-log delta. **No workflow doc write** — summary/groups/form_data are unaffected by metadata, so the workflow is untouched.
- **Commit** — `bulkWriteActions` (one action update) + event via `new-event` + change-log, via `commitPlan` amended to accept an action-only plan (`workflow: null`). The shipped `commitPlan` destructures `plan.workflow` unconditionally (`commitPlan.js:63`) and `buildCommitResult` reads `plan.workflow.doc._id`, so a `workflow: null` plan throws today — the amendment skips the workflow claim step entirely (no CAS) and the `Plan` typedef in `types.js` makes `workflow` nullable (`planChangeLog.js:86` already tolerates a null workflow entry — verified review-3). Because no workflow doc is written there is no CAS gate; concurrent fields-updates are last-write-wins on the action doc (acceptable for metadata, consistent with Part 38 D15's deferral of per-action CAS).

**Connection registration.** `WorkflowAPI/WorkflowAPI.js` (the connection's `requests` map — `src/types.js` derives the package's request-type list from it) registers `UpdateActionFields` alongside the existing handlers; `WorkflowAPI/schema.js` needs no new connection-level fields.

**Submit-planner guard (kind-based field write).** Part 38 carried today's generic, kind-agnostic `fields` passthrough into `planActionTransition.js` — the planner spreads `...payload.fields` on both the create and update paths (`planActionTransition.js:162,170`), and its JSDoc explicitly forward-references this part: _"`fields` is a kind-agnostic verbatim passthrough … Part 24 layers a kind-based rule later"_ (`planActionTransition.js:53-56`). This part is where the universal-fields concept enters: it amends the **update-path** spread (`:170` — an existing action transitioned by a user submit) to a **kind-based rule**. The rule strips the three universal keys (`assignees` / `due_date` / `description`) out of the `payload.fields` bag before spreading **unless `kind: check`**; all other keys still pass through verbatim, so it gates the existing spread rather than enumerating three named `$set`s (a `check` submit therefore writes its full `fields` bag exactly as today). For `kind: form` the universal keys are dropped here; they are owned exclusively by the `{workflow_type}-update-fields` operation. The rule keys on the action's `kind` (already in the plan context), **not** on the payload shape, so it cannot be defeated by a stray `fields` payload.

The **create/upsert path** (`:162`) stays **unconditional** — it is _not_ part of the guard. That spread seeds field values onto newly-spawned actions via cascade/auxiliary composition (a pre-hook can spawn an action carrying `fields`, e.g. a `kind: form` `kickoff` action seeded with `fields.description`), and that is initialization, not the form-submit clobber the decoupling targets. Narrowing it would break the existing `SubmitWorkflowAction.test.js` `kickoff` upsert (`kind: form`, asserts `description: 'spawned'`); that test is the regression guard for this distinction.

**Role gating.** The handler's load phase gates on the per-app **`edit`** verb — `access.{app_name}.edit`, evaluated with `gateAllows` (Part 34's per-verb model; there is no action-wide `access.roles`). The `edit` verb owns the page surface where the Update button renders. Stated consequence: **metadata updates require the `edit` verb** — a review-only role cannot update universal fields from any surface (the review page renders the card read-only); that's the v1 stance. The component additionally reads `allowed.edit` off the primed action root (the `GetWorkflowAction` envelope ships `allowed` as a per-verb map `{ view, edit, review, error }`; the check surface already binds `current_action.allowed.edit`, the form templates bind `action.allowed.edit`) and switches inputs + Update button to read-only / hidden when `false` — defense in depth so users can't type changes that won't save.

**Lifecycle.** Editable in any stage the user has `edit` access to — including `done` / `not-required` / `error`. There is no stage allowlist and no `required_after_close` interaction; metadata is always editable for an accessible action. That extends to the parent workflow's lifecycle: a fields update on a `completed` / `cancelled` workflow's action is legal regardless of `required_after_close` — that flag gates form **submit** after close, not this operation (a deliberate divergence from how submit treats a closed workflow). On the check surface, a terminal action opens in `view` mode (read-only); the surface's `button_edit` (`check-action-surface.yaml:287`) flips it to `edit` mode, where the Update button — but no signal button — is available, which is exactly the reassign-without-transition path.

### Authoring: `universal_fields`

```yaml
type: qualify
kind: form
access: { ... } # per-app per-verb (Part 34)
universal_fields: [assignees, due_date] # which fields render; omit = all three; false / [] = none
```

`universal_fields` is an optional list drawn from `[assignees, due_date, description]`. **Default (field omitted): all three, shown and optional.** Set `false` or `[]` to hide the surface entirely (data-only forms). It is purely a UI presence declaration — the action doc always carries all three fields physically (the engine writes them at `StartWorkflow`); `universal_fields` only controls what the templates render.

Authoring-contract amendment: add `universal_fields` to the [action-authoring spec](../../../../workflows-module-concept/action-authoring/spec.md) reserved-field table. Resolver passthrough (the `ACTION_FIELDS` allowlist in `makeWorkflowsConfig.js` and `ACTION_FIELDS_FOR_TEMPLATE` in `makeActionPages.js`) carries it through to `action_config.universal_fields` — same pattern `required_after_close` follows. (Verified: neither allowlist contains `universal_fields` today, so this is a pure add; and neither ever contained `universal_fields_required`, so there is nothing to remove.)

`universal_fields_required` from Rev 1 is **dropped**. There was no consumer requiring mandatory universal fields, and once fields are decoupled from submit, "required" can only gate the operation's own Update. Per "build for what exists," it's removed; re-adding a per-field `required` flag (a 2-line `Validate` addition) is trivial when a real need surfaces.

### Display rules

- **Empty-state** — `null` / `[]` shows a dimmed placeholder in display mode (`Not assigned`, `No due date`, `No description`); edit mode shows the empty input.
- **Date formatting** — `due_date` via `_dayjs.format`; component accepts a `date_format` var (default `MMM D, YYYY`).
- **Assignees** — display renders one `_ref: { module: user-account, component: user-avatar }` per assignee (picture + name) over `action_data.assignee_docs`; edit uses `_ref: { module: user-account, component: user-multi-selector }` (multi-select, filtered to `apps.{app_name}.is_user: true`) bound to `_state.{state_path}.assignees`. Both ship from [Part 24a](designs/workflows-module/parts/_completed/24a-user-account-selector-avatar/design.md).
- **Description** — edit renders a `TiptapInput` (rich text); display renders an `Html` block reading `description.html`. Stored as `{ text: string, html: string } | null`, mirroring the `comment` field. No truncation in v1.

Engine spec amendment: [`engine/spec.md:132`](../../../../workflows-module-concept/engine/spec.md) lists `description` as `string | null` — update to `{ text: string, html: string } | null` to match shipped behaviour. Carry this amendment under Part 24.

### Binding prerequisite: assignee display docs (`assignee_docs`)

The display rule above (one `user-avatar` per assignee) is unimplementable from the action doc alone — `assignees` is an id array and `user-avatar` consumes a user doc. **Rev 2: the old plan to add a `$lookup` to `requests/get_action.yaml` no longer applies — that file was replaced by the `GetWorkflowAction` plugin handler (Part 46), which builds a curated server-side envelope.** So the assignee docs are added **in the handler**:

- **`WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`** (amend) — after reading the action doc, look up `user-contacts` for `action.assignees` and add `assignee_docs: [{ _id, profile: { name, picture } }]` to the returned envelope. The handler already reads multiple collections via `findDocs` and explicit-allowlists its output (`GetWorkflowAction.js:127-239`), so this is the conforming extension point, consistent with Part 46's "no client-side computation" design. The user-contacts collection name comes from the connection config, same as the workflow/actions collections.

Type-safety note (settled, not deferred): user-contacts `_id` is a **string** (`_uuid: true` on the invite upsert — `user-admin/api/invite-user.yaml`; `_user: id` on `user-account/api/create-profile.yaml`), so assignee ids round-trip as strings and the lookup on `_id` matches without coercion.

The **edit-mode selector** reaches user-account via a cross-module component ref and needs one cross-module amendment:

- **`modules/user-account/components/user-multi-selector.yaml`** (amend — cross-module) — gains a parameterizable `id` var (default `user-multi-selector`, so existing consumers are untouched) plus an optional `title` var, so the workflows sidebar can auto-bind it to `{state_path}.assignees`. Part 24a's design explicitly anticipated this ("Part 24 binds `_state.fields.assignees`").

### Manifest dependency

`modules/workflows/module.lowdefy.yaml` gains `user-account` under `dependencies:` (alongside `layout` and `events`), so `_ref: { module: user-account, component: ... }` resolves at build time.

## Files changed (owned by this part)

All API / plugin / resolver / schema edits for the universal-fields write path live here. The consuming template parts (below) only render.

### Plugin — `plugins/modules-mongodb-plugins/src/connections/`

(The shared phase helpers live at `src/connections/shared/`, beside `WorkflowAPI/` — not inside it.)

- **`WorkflowAPI/UpdateActionFields/UpdateActionFields.js`** (new) — the operation handler: load → role check → plan → commit. No pre/post hook in v1.
- **`WorkflowAPI/UpdateActionFields/UpdateActionFields.test.js`** (new) — handler unit tests (fields write, cell re-render, no workflow write, role reject).
- **`WorkflowAPI/WorkflowAPI.js`** (amend) — register `UpdateActionFields` in the connection's `requests` map.
- **`WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`** (amend) — add `assignee_docs` (user-contacts lookup over `action.assignees`) to the curated envelope, for display-mode avatars.
- **`shared/phases/planners/planFieldsUpdate.js`** (new) — pure planner: planned action doc (`$set` fields + change-stamp + metadata merge), re-rendered status-map cell, event via `planEventDispatch` (`UpdateActionFields` handler type, `comment` passed through — Part 33), change-log delta.
- **`shared/phases/planners/planFieldsUpdate.test.js`** (new).
- **`shared/phases/planners/planEventDispatch.js`** (amend — Part 38's file, since modified by Part 48) — add an `UpdateActionFields` branch to the `titleTemplate` if/else chain → stamps `action-fields-updated` directly + a default title (reuse `ACTION_FALLBACK_TITLE`, already `'{{ user.profile.name }} updated {{ action.title }}'`), plus the optional `comment` param the fold consumes; Part 33's `foldCommentIntoEvent` call handles the `comment` (if Part 33 hasn't landed, the param flows un-folded — either order works, per Part 33's contract). _(In-tree, `planEventDispatch` does not yet accept a `comment` param — only JSDoc references it; confirm/add it here.)_
- **`shared/phases/planners/planActionTransition.js`** (amend — Part 38's file) — narrow the **update-path** `...payload.fields` spread (`:170`) to a kind-based rule: strip the three universal keys (`assignees` / `due_date` / `description`) from the payload bag unless `kind: check`; all other keys still pass through verbatim. Leave the **create/upsert path** (`:162`) unconditional — cascade/auxiliary seeding (e.g. a spawned `kind: form` `kickoff` action carrying `fields.description`) keeps writing fields of any kind. Regression guard: `SubmitWorkflowAction.test.js`'s `kickoff` upsert (`kind: form`, `description: 'spawned'`) must stay green.
- **`shared/phases/loadWorkflowState.js`** (amend — Part 38's file, since modified by Part 49) — third load mode `{ actionId, verb }`: signal-less (discriminate on signal absence — see Load above), access-gated on the given verb via `gateAllows`, no stage / `required_after_close` check; preserves the gate-ahead-of-side-effects invariant.
- **`shared/phases/commitPlan.js`** (amend — Part 38's file) — accept an action-only plan (`workflow: null`): skip the workflow claim step (no CAS), commit actions + event + change-log.
- **`shared/phases/types.js`** (amend — Part 38's file) — `Plan.workflow` becomes nullable.

`schema.js` is unchanged — the handler uses the existing connection config.

### Resolver — `modules/workflows/resolvers/`

- **`makeWorkflowApis.js`** (amend) — emit **one `{workflow_type}-update-fields` endpoint per workflow type** that declares any surface-bearing (`form` / `check`) action (payload `action_id` / `fields` / `comment`; `workflow_type` build-time literal; returns `action_id` + `event_id`). Mirror the existing `{workflow_type}-submit` / `{workflow_type}-start` emission (per-workflow, `:135` / `:174`), not the per-action-type hook emission (`:18`). The submit endpoint is left as-is (check submit still writes fields per the kind-based planner rule).
- **`makeWorkflowsConfig.js` / `makeActionPages.js`** (amend) — add `universal_fields` to the passthrough allowlists (`ACTION_FIELDS` / `ACTION_FIELDS_FOR_TEMPLATE`) so it reaches `action_config.universal_fields` (default `[assignees, due_date, description]`). Do **not** add `universal_fields_required`.

### Module

- **`modules/workflows/components/universal-fields/universal-fields.yaml`** (new — replaces the stub) — the reusable component (modes + the Update button calling the operation; `kind`/`mode`/`state_path`/`workflow_type`/`show`/`action_data` vars).
- **`modules/workflows/module.lowdefy.yaml`** (amend) — add `user-account` to `dependencies`.
- **`modules/user-account/components/user-multi-selector.yaml`** (amend — cross-module) — parameterizable `id` + optional `title` vars, defaults preserving current consumers.

### Concept-spec amendments

- **[`action-authoring/spec.md`](../../../../workflows-module-concept/action-authoring/spec.md)** — add `universal_fields` to the reserved-field table; do not add `universal_fields_required`.
- **[`engine/spec.md:132`](../../../../workflows-module-concept/engine/spec.md)** — `description`: `string | null` → `{ text: string, html: string } | null`.
- **[`engine/spec.md`](../../../../workflows-module-concept/engine/spec.md)** — document the `UpdateActionFields` request type on the `WorkflowAPI` connection.

## Consumed by (template/layout only — owned by other parts)

These parts hold no API/plugin/resolver work for this surface — they compose the component and lay it out. **All are now in `_completed/`; their edits here are follow-on deviations from already-implemented designs (handle as a follow-on task, not by reopening those folders).**

- **[Part 16 (page-templates)](designs/workflows-module/parts/_completed/16-page-templates/design.md)** — the form templates (`edit/view/review/error.yaml.njk`) currently `_ref` the universal-fields stub **inline in the form body**, passing only `mode` / `kind` / `action_data`. Follow-on: (a) move it to a right-hand sidebar card (two-column row), gated on `universal_fields` non-empty; (b) pass the new vars — `state_path: fields`, `workflow_type: {{ workflow_type }}` (njk literal), `show: { _var: action_config.universal_fields }`; (c) bind display `action_data` to `_state: action.*` (already the shipped binding — no `.0.` change needed). The form-submit `Validate` is already `^form\.` and the submit payload already carries no `fields` (Part 39 landed).
- **[Part 40 (check-action surfaces)](designs/workflows-module/parts/_completed/40-simple-action-surfaces/design.md)** — `check-action-surface.yaml` already `_ref`s the component with `kind: check`, `state_path: current_action.fields`, derived `mode`, and `action_data` from `current_action.fields.*`. Follow-on: pass `show: { _var: action_config.universal_fields }` and `workflow_type: { _state: current_action.workflow_type }` so the component can render presence and build the Update endpoint. The surface's `submit` / `progress` payloads already carry `fields: { _state: current_action.fields }` (check writes fields on transition — matches the kind guard).
- **[Part 39 (form-submit buttons)](designs/workflows-module/parts/_completed/39-form-submit-buttons/design.md)** — already shipped: submit `Validate` is `^form\.` and `submit` / `progress` carry no `fields`. No further change; the kind-based guard means a stray `fields` payload would be ignored anyway.

## Out of scope / deferred

- **Save-on-change per field** (assignee dropdown writes immediately, Linear/Asana-style). v1 uses one Update button per card.
- **`universal_fields_required` / mandatory metadata.** Dropped; re-add a per-field `required` flag when a consumer needs it.
- **Tracker universal-fields UI.** No edit/view surface in v1. Tracker fields are seeded from the parent at `StartWorkflow` and otherwise immutable in v1.
- **Per-action display-chrome overrides** (custom date format per action). Apps style globally via the layout module.
- **Custom universal-field schemas per app.** v1 fixes the three fields.

## Depends on

- **[Part 38 (engine rebuild)](designs/workflows-module/parts/_completed/38-engine-rebuild/design.md)** — supplies the load-plan-commit + render helpers the handler reuses; this part adds the handler and amends `planActionTransition.js` / `loadWorkflowState.js` / `commitPlan.js` / `planEventDispatch.js` / `types.js`. (Parts 48/49 have since modified `planEventDispatch.js` / `loadWorkflowState.js` — re-anchor against current shapes.)
- **Part 46 (server-side action read — `GetWorkflowAction` handler)** — supplies the `get_workflow_action` read path the display bindings use and the `assignee_docs` extension point. The handler is in-tree at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/`.
- **[Part 40 (check-action surfaces)](designs/workflows-module/parts/_completed/40-simple-action-surfaces/design.md)** — the `check-action-surface.yaml` body that hosts the check-kind component (`current_action.fields` namespace).
- **[Part 5 (start/cancel handlers)](designs/workflows-module/parts/_completed/05-start-cancel-handlers/design.md)** — the action doc shape these fields live on (seeded at `StartWorkflow`).
- **[Part 24a (user-account selector + avatar)](designs/workflows-module/parts/_completed/24a-user-account-selector-avatar/design.md)** — `user-multi-selector` + `user-avatar`.
- **[Part 34 (action access model)](designs/workflows-module/parts/_completed/34-action-access-model/design.md)** — the per-app per-verb `access` model the `edit` gate uses.
- **[Part 35 (rename `task` → `simple`)](designs/workflows-module/parts/_completed/35-rename-task-kind-to-simple/design.md)** + **[Part 43 (rename `simple` → `check`)](designs/workflows-module/parts/_completed/43-rename-simple-kind-to-check/design.md)** — the kind landed as `check` (`ACTION_KINDS = ['form','check','tracker']`), so every `kind: check` reference is coherent.
- **[Part 33 (comment rendering)](designs/workflows-module/parts/_completed/33-comment-rendering/design.md)** — _active, not yet landed._ Supplies `foldCommentIntoEvent`; the `comment` param flows un-folded until it lands (either order works per Part 33's contract).

## Verification

- Build-time / unit:
  - Component renders `kind: form, mode: edit` as a sidebar card with an Update button bound to `{workflow_type}-update-fields`; `kind: check, mode: edit` renders inputs with the **same** Update button (check `submit` / `progress` additionally carry `fields`).
  - `mode: display` renders read-only with placeholders for null/empty values.
  - `show: []` / `universal_fields: false` omits the surface (form body spans full width).
  - Enum/passthrough: `universal_fields` reaches `action_config.universal_fields` with the all-three default.
- Integration (demo app):
  - Form edit page: changing the assignee in the sidebar and clicking Update writes the action doc and **re-renders the status-map cell** (entity-page card shows the new assignee) without touching form data or the action's stage.
  - Form submit (`submit` / `progress`) does **not** alter `assignees` / `due_date` / `description`.
  - A `done` form action's universal fields are still editable via the sidebar.
  - Check surface writes universal fields on `submit` as primary content, and independently via the standalone Update button (no transition).
  - `allowed.edit === false` hides the Update button and renders inputs read-only.
- End-to-end coverage lands in [Part 22](designs/workflows-module/parts/_completed/22-workflows-e2e-suite/design.md).

## Open questions

- **Comment binding on the fields operation.** The Update button optionally posts a `comment` (folded into the event's `display.{app_name}.description` by `planEventDispatch`, per Part 33). Whether the sidebar surfaces a comment field by default, or only when the action opts in, is a UI detail to settle when Part 16's sidebar layout is built. Default v1: no comment field on the form sidebar (the check surface already has its own comment input); the operation accepts `comment` for callers that want it.
- **Last-write-wins on concurrent fields updates.** The operation writes no workflow doc, so there's no CAS gate (Part 38 D15 defers per-action CAS). Two near-simultaneous metadata edits to the same action are last-write-wins. Acceptable for v1.
- **Should terminal-stage actions be reassignable?** The operation is stage-agnostic today — editable in any stage the user has `edit` access to, including `done` / `not-required` (and on a `completed` / `cancelled` workflow). Whether terminal stages should instead be **frozen** is unresolved — a policy call, not a mechanism one (restricting it adds a stage gate to the load phase, and `allowed.edit` reflects it on the surfaces). v1 leaves it open — currently reassignable.

## Contract to neighbours

- **This part owns** the `UpdateActionFields` handler, its planner, the `makeWorkflowApis` endpoint emission, the connection registration, the `universal_fields` passthrough, the kind-based submit-planner guard, the `GetWorkflowAction` `assignee_docs` amendment, and the component.
- **Part 38** supplies the load-plan-commit + render helpers; this part adds the handler and amends `planActionTransition.js` (kind-based field write), `loadWorkflowState.js` (third load mode), `commitPlan.js` + `types.js` (workflow-less plan), `planEventDispatch.js` (new handler type). The generic `fields` passthrough already exists in `planActionTransition.js` with a JSDoc forward-reference to this part — Part 24 constrains it to `kind: check`.
- **Parts 16 / 40** consume the component via `_ref` (form templates inline→sidebar; check surface already wired) and pass the new `show` / `workflow_type` vars. They author no universal-field inputs inline. Part 18 doesn't consume it in v1 — tracker rendering stays `status_map.message`-only.
- **Part 39** is already in the decoupled posture (no `fields` on submit, `^form\.` regex) — no further change.
