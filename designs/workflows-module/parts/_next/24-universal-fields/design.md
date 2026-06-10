# Part 24 — Universal-fields surface (`assignees`, `due_date`, `description`)

The three action-level fields every action carries — `assignees`, `due_date`, `description` — are **metadata about the action**, not part of what a form submission captures. This part pins their contract across the form and check kinds and ships one reusable Lowdefy component the page templates compose.

The headline change from the previous draft: on **form-kind** actions, universal fields are written by their **own operation**, fully decoupled from the form submit. They render as a right-hand **sidebar card** with its own Update button, and the form's `submit` / `progress` buttons no longer carry a `fields` payload at all. On **check-kind** actions the universal fields *are* the submission content, so they are **both** written on the `submit` / `progress` signals (primary content) **and** independently editable through the **same shared Update operation** form uses. The Update operation is offered for **every kind** (form and check — tracker excepted, it has no surface): there is **no check special-case**, so any action's fields can be updated without a transition — e.g. reassigning a `done` check action, the gap a submit-only write left open. This is the minimal, scoped landing of the "operations vs transitions" split from [critique-concepts.md §3](../../../../workflows-module-concept/review/critique-concepts.md) — the category the [state-machine](../../../../workflows-module-concept/state-machine/design.md) sub-design deliberately parked as a non-goal (`state-machine/design.md:323`), here implemented for exactly one operation (write the three fields) on exactly one kind (form).

Tracker actions are excluded — they have no view surface (no `-view` / `-edit`, only inline rendering in `actions-on-entity` via `status_map.message`), so there's nowhere to render the fields. The tracker doc still carries the three fields (the engine writes them at `StartWorkflow`, carried from the parent action), but no UI renders them in v1.

## Proposed change

1. **Form-kind universal fields become a state-orthogonal operation.** A new resolver-emitted endpoint `{workflow_type}-{action_type}-update-fields` writes the three fields with no `signal`, no `form`, and no FSM transition. The form-submit payload (`submit` / `progress`) drops its `fields` key.
2. **This part owns the full write path.** It ships the `UpdateActionFields` plugin handler + `planFieldsUpdate.js` planner, the `makeWorkflowApis` change to emit the fields endpoint, the connection registration, the `universal_fields` resolver passthrough, and the submit-planner guard that confines the universal-field write to `kind: check`. The handler reuses [Part 38](../../_completed/38-engine-rebuild/design.md)'s load→plan→commit + render helpers: set fields, merge metadata, **re-render the status-map cell**, emit an `action-fields-updated` log event, no workflow write. The form submit endpoint is unchanged (it stays kind-uniform); the guard's kind check keeps form submit from touching the fields. The consuming parts (16/17/39) are left with template/layout rendering only.
3. **Form-kind fields render as a right-hand sidebar card** with its own Update button, beside the form body (not a header band). Check-kind fields render as primary content on the submit surface and are written on `submit` / `progress` — **and** also carry the same Update affordance (the operation is emitted for every kind), so they can be updated independently of a transition.
4. **Universal fields are editable whenever the user has access** — the stage-based editable allowlist and the `required_after_close` carve-out are gone. You can reassign a `done` action or fix a due date on an `in-review` one.
5. **Presence is author-declared via `universal_fields`** (which of the three to show). Default: all three, shown and optional. `universal_fields: false` / `[]` hides the surface. `universal_fields_required` is **dropped** (no demonstrated need; re-addable later).
6. **One reusable component** (`components/universal-fields/universal-fields.yaml`) with `kind` × (`edit`/`display`) modes. **Every kind gets the same Update operation + button** (no check special-case); `kind` drives one remaining behavioural difference — whether the `submit` / `progress` signals **also** write the fields (check: yes, the fields are its submission content; form: no, submit carries no `fields`). Resolves Part 24 review-1 finding #8.

## Why decouple (and why it simplifies)

Bundling the universal fields into the form submit forced three kinds of friction, all of which this split removes:

- **You couldn't touch metadata without a transition.** Reassigning or re-dating an action meant re-submitting it — re-running form validation and (for actions with a `review` verb) bouncing it back through review. critique §3 named this exactly ("You can't update assignees on a `done` action"). As an independent operation, metadata edits are role-gated and stage-agnostic.
- **The editable-stage allowlist and `required_after_close` band-handling vanish.** The previous draft tied the band's editability to the form lifecycle (`action-required` / `in-progress` / `changes-required` editable; everything else read-only) and added a `required_after_close` exception so a surviving action stayed editable past `close-workflow`. None of that is needed now: the operation is editable iff the user has access, full stop. `required_after_close` reverts to its real meaning — whether *form submit* survives a closed workflow ([action-authoring spec](../../../../workflows-module-concept/action-authoring/spec.md)) — and stops touching this surface.
- **`kind` earns its keep.** Every kind shares the independent Update operation, but `kind` still selects whether the `submit` / `progress` signals **also** write the fields — check writes them (the fields are its submission content), form does not (submit carries no `fields`). So the component's `kind` var drives a real engine behaviour, not just cosmetics — closing Part 24 review-1 finding #8.

### Why it still goes through the engine (not a plain `MongoDBUpdateOne`)

Status-map cells can reference `assignees` / `due_date` (Part 38 D12's render context spreads them into the cell template), so a field change must **re-render the sticky cell** — otherwise the entity-page card keeps showing the old assignee until the next transition, the precise staleness class [Part 38](../../_completed/38-engine-rebuild/design.md) exists to eliminate. A plain plugin write would either skip the re-render (stale display) or duplicate the render helpers in YAML (violates "one correct way"). So the operation runs through a real engine handler that reuses Part 38's render path. It is **not** an FSM signal — keeping it out of the signal model is the deliberate operations/transitions boundary state-machine.md draws.

## In scope

### Component shipped

`modules/workflows/components/universal-fields/universal-fields.yaml` — one Lowdefy component, composed by the page templates (Part 16) and shared check pages (Part 17):

```yaml
- _ref:
    path: components/universal-fields/universal-fields.yaml
    vars:
      mode: edit              # 'edit' | 'display'
      kind: form              # 'form' | 'check' — tracker excluded
      state_path: fields      # state namespace for the edit-mode inputs (block IDs become {state_path}.{field})
      workflow_type: lead-qualification   # with action_type, builds the fields endpoint id (form + edit only)
      action_type: qualify    # builds {workflow_type}-{action_type}-update-fields (form + edit only)
      show:                   # which fields render; from action_config.universal_fields
        _var: action_config.universal_fields   # default [assignees, due_date, description]
      action_data:            # bindings the inputs/display read
        assignees:   { _state: fields.assignees }
        due_date:    { _state: fields.due_date }
        description: { _state: fields.description }
```

Block-id convention follows the CLAUDE.md "Input block IDs match data paths" rule, parameterised by the `state_path` var (default `fields`): `{state_path}.assignees`, `{state_path}.due_date`, `{state_path}.description`. The default keeps the form sidebars and shared pages at `fields.*`; [Part 40](../../40-simple-action-surfaces/design.md)'s `check-action-surface` passes `state_path: surface.fields` so its inputs land in the surface's state namespace and its scoped `Validate` (`^surface\.fields\.`) matches them (Part 40 review-2 #5). The namespace threads into the `user-multi-selector` id passthrough (Files changed).

**Behaviour by `kind` × `mode`:**

| `kind` | `mode` | Renders | Write path |
| ------ | ------ | ------- | ---------- |
| `form` | `edit` | Sidebar card: the declared inputs **plus its own Update button** | Button calls `{workflow_type}-{action_type}-update-fields` with `fields: { _state: fields }` + optional `comment`. **Independent of form submit.** |
| `form` | `display` | Sidebar card, read-only | — (reads `get_action.0.*` — the aggregation response is an array) |
| `check` | `edit` | Primary content: the declared inputs **plus its own Update button** | Update button calls `{workflow_type}-{action_type}-update-fields` (independent of any transition); **and** the page's `submit` / `progress` signals also carry `fields: { _state: fields }`. |
| `check` | `display` | Primary content, read-only | — |

**Binding by mode:**

- **`edit`** — `action_data` bound to `_state.fields.*`; primed by the page's `onMount` from the loaded action doc. For form kind the component's own Update button posts the `_state.fields` subtree; for check kind the page's submit button posts it.
- **`display`** — `action_data` bound to `_request: get_action.0.*`; reads straight from the loaded action doc (no `_state.fields` priming on `-view` / `-review`). The `.0.` index is load-bearing: `get_action` is a `MongoDBAggregation`, so the response is an **array** — an un-indexed `get_action.assignees` resolves `undefined`. (Pages that already prime `_state.action` from `get_action.0` in `onMount` — the form templates' pattern — bind `_state: action.*` instead; both shapes are correct, bare `get_action.*` is not.)

  ```yaml
  - _ref:
      path: components/universal-fields/universal-fields.yaml
      vars:
        mode: display
        kind: form
        show: { _var: action_config.universal_fields }
        action_data:
          assignees:      { _request: get_action.0.assignees }
          assignee_docs:  { _request: get_action.0.assignee_docs }   # display-mode avatars (the $lookup leaf)
          due_date:       { _request: get_action.0.due_date }
          description:    { _request: get_action.0.description }
  ```

### Where the component renders

| Surface                                       | Mode      | Placement / notes                                                                                  |
| --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| Form action `edit` (Part 16)                  | `edit`    | Right sidebar card with its own Update button. Form submit does **not** write these fields.        |
| Form action `view` (Part 16)                  | `display` | Right sidebar card, read-only.                                                                     |
| Form action `review` (Part 16)                | `display` | Right sidebar card, read-only. Reviewers who need to change metadata use the `edit` page sidebar.  |
| Form action `error` (Part 16)                 | `display` | Right sidebar card, read-only. Recovery flow doesn't edit metadata.                                |
| Check action `workflow-action-edit` (Part 17)         | `edit`    | Primary content (status buttons + comment below) **plus the Update button**. Written on `submit` / `progress`, and independently via Update. |
| Check action `workflow-action-view` / `workflow-action-review` | `display` | Primary content, read-only.                                                                        |

The template renders the form-kind sidebar column **iff `show` is non-empty**; when an action declares `universal_fields: false` / `[]` the column is omitted and the form body spans full width.

### The operation: `{workflow_type}-{action_type}-update-fields`

Resolver-emitted by **this part's** `makeWorkflowApis` change — **one per surface-bearing action (form and check; tracker excepted)**. Check actions get the endpoint **in addition to** writing fields on `submit` / `progress`, so their fields are independently updatable without a transition (same operation, same kind-agnostic handler — only the submit-time write branches on kind). The id carries the `{workflow_type}-` prefix (matching the submit endpoints' `{workflow_type}-{action_type}-submit` pattern) because action types are only unique per workflow — an unprefixed id would collide when two workflows declare the same action type.

```yaml
id: {workflow_type}-{action_type}-update-fields
type: Api
routine:
  - id: update_fields
    type: UpdateActionFields
    connectionId: { _module.connectionId: workflow-api }
    properties:
      action_id: { _payload: action_id }
      action_type: <action_type>       # build-time literal
      workflow_type: <workflow_type>   # build-time literal
      fields: { _payload: fields }     # { assignees, due_date, description }
      comment: { _payload: comment }   # optional; folds into display.{app_name}.description via planEventDispatch (Part 33)
  - :return:
      action_id: { _step: update_fields.action_id }
      event_id:  { _step: update_fields.event_id }
```

The component's Update button:

```yaml
- id: button_update_fields            # sidebar card footer
  type: Button
  properties: { title: Update, type: primary }
  visible: { _eq: [{ _state: action_allowed.edit }, true] }
  events:
    onClick:
      - id: validate
        type: Validate
        params: { regex: ['^fields\.'] }
      - id: update_fields
        type: CallApi
        params:
          endpointId:
            _module.endpointId:
              _build.string.concat:
                [{ _var: workflow_type }, '-', { _var: action_type }, '-update-fields']
          payload:
            action_id: { _state: action._id }
            fields:    { _state: fields }
            comment:   { _state: fields_comment }   # optional
```

**Engine handler `UpdateActionFields`** — a new plugin entry point in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/UpdateActionFields/`, **shipped by this part**, on the same `WorkflowAPI` connection as `SubmitWorkflowAction` / `StartWorkflow` / etc. It reuses **and minimally amends** [Part 38](../../_completed/38-engine-rebuild/design.md)'s helpers — `loadWorkflowState` / `commitPlan` (`shared/phases/`), `planEventDispatch` (`shared/phases/planners/`), and `renderStatusMap` (`shared/render/`, reused unchanged) — and adds one new planner `shared/phases/planners/planFieldsUpdate.js`. The amendments (one each): `planEventDispatch` gains the `UpdateActionFields` handler type; `loadWorkflowState` gains a third signal-less `{ actionId, verb }` mode; `commitPlan` (+ the `Plan` typedef in `types.js`) accepts a workflow-less plan. All four appear under "Files changed" below.

- **Load** — workflow + target action + configs via `loadWorkflowState`'s new third mode `{ actionId, verb: 'edit' }`: signal-less (no FSM signal to resolve), access-gated on the per-app **`edit`** verb (`access.{app_name}.edit` via `gateAllows` — Part 34's per-verb model; action-wide `access.roles` was removed by Part 34 D4), and **no stage check** (the submit mode's stage/`required_after_close` gate doesn't apply to this operation). The gate stays ahead of any side effects, preserving Part 38's load-gate invariant.
- **Plan** (pure) — compose planned action doc = loaded action with `assignees` / `due_date` / `description` `$set`, change-stamp refreshed, `metadata` merged; **re-render the status-map cell** (Part 38 D12 render path) against the planned doc; build the `action-fields-updated` log event **via `planEventDispatch`** — this part adds an `UpdateActionFields` handler type + `action-fields-updated` event type (and a `DEFAULT_TITLES` entry) to the planner's enum and passes `comment` through, so the event gets the planner's full pipeline (references, default title, display render) and the comment folds into `display.{app_name}.description` via [Part 33](../33-comment-rendering/design.md)'s `foldCommentIntoEvent` inside the planner — **no `metadata.comment`**, no hand-built event payload; build the change-log delta. **No workflow doc write** — summary/groups/form_data are unaffected by metadata, so the workflow is untouched.
- **Commit** — `bulkWriteActions` (one action update) + event via `new-event` + change-log, via `commitPlan` amended to accept an action-only plan (`workflow: null` — the claim step is skipped entirely; the `Plan` typedef in `types.js` makes `workflow` nullable). Because no workflow doc is written there is no CAS gate; concurrent fields-updates are last-write-wins on the action doc (acceptable for metadata, consistent with Part 38 D15's deferral of per-action CAS).

**Connection registration.** `WorkflowAPI/WorkflowAPI.js` (the connection's `requests` map — `src/types.js` derives the package's request-type list from it) registers `UpdateActionFields` alongside the existing handlers; `WorkflowAPI/schema.js` needs no new connection-level fields (the handler reads the same `databaseUri` / `app_name` / `entry_id` / `changeLog` config the other handlers use).

**Submit-planner guard (kind-based field write).** Today's monolithic `SubmitWorkflowAction` writes `payload.fields` to the action doc via a **generic spread** (`updateAction`'s `$set: { ...fields }`) — it doesn't name the three fields; the `fields` bag just happens to carry `{ assignees, due_date, description }`. Part 38's rebuild carries that **generic, kind-agnostic passthrough** into the shared `planActionTransition.js` unchanged (behavior-preserving — see "Contract to neighbours"); Part 38 itself never names the universal fields. This part is where the universal-fields concept enters: it amends the passthrough to a **kind-based rule: the planner writes `assignees` / `due_date` / `description` only for `kind: check`** — the kind whose submission content *is* those fields. For `kind: form` the planner never touches them; they are owned exclusively by the `{workflow_type}-{action_type}-update-fields` operation. The rule keys on the action's `kind` (already loaded in the plan context), **not** on the payload shape, so it cannot be defeated by a stray `fields` payload, and the form template dropping `fields` (Part 39) becomes hygiene — don't validate sidebar inputs on submit, don't post dead state — rather than a correctness precondition. Check submit is unaffected: its `fields` payload is written exactly as today.

**Role gating.** The handler's load phase gates on the per-app **`edit`** verb — `access.{app_name}.edit`, evaluated with the existing `gateAllows` semantics (Part 34's per-verb model; there is no action-wide `access.roles`). The `edit` verb is the one that owns the page surface where the Update button renders. Stated consequence: **metadata updates require the `edit` verb** — a review-only role cannot update universal fields from any surface (the review page renders the card read-only); that's the v1 stance. The component additionally reads `_state.action_allowed.edit` (from `action_role_check`, Part 18 — `action_allowed` is a per-verb map `{ view, edit, review, error }`, not a bare boolean) and switches inputs + Update button to read-only / hidden when `false` — defense in depth so users can't type changes that won't save.

**Lifecycle.** Editable in any stage the user has access to — including `done` / `not-required` / `error`. There is no stage allowlist and no `required_after_close` interaction; metadata is always editable for an accessible action. That extends to the parent workflow's lifecycle: a fields update on a `completed` / `cancelled` workflow's action is legal regardless of `required_after_close` — that flag gates form **submit** after close, not this operation (a deliberate divergence from how submit treats a closed workflow).

### Authoring: `universal_fields`

```yaml
type: qualify
kind: form
access: { roles: [sales] }
universal_fields: [assignees, due_date]   # which fields render; omit = all three; false / [] = none
```

`universal_fields` is an optional list drawn from `[assignees, due_date, description]`. **Default (field omitted): all three, shown and optional.** Set `false` or `[]` to hide the surface entirely (data-only forms). It is purely a UI presence declaration — the action doc always carries all three fields physically (the engine writes them at `StartWorkflow`); `universal_fields` only controls what the templates render.

Authoring-contract amendment: add `universal_fields` to the [action-authoring spec](../../../../workflows-module-concept/action-authoring/spec.md) reserved-field table. Resolver passthrough (the `makeWorkflowsConfig.js` / `makeActionPages.js` allowlists) carries it through to `action_config.universal_fields` — same pattern `required_after_close` follows.

`universal_fields_required` from the previous draft is **dropped**. There was no consumer requiring mandatory universal fields, and once fields are decoupled from submit, "required" can only gate the operation's own Update (it cannot block form submit without re-coupling the two writes). Per "build for what exists," it's removed; re-adding a per-field `required` flag (a 2-line `Validate` addition on the operation) is trivial when a real need surfaces.

### Display rules

- **Empty-state** — `null` / `[]` shows a dimmed placeholder in display mode (`Not assigned`, `No due date`, `No description`); edit mode shows the empty input.
- **Date formatting** — `due_date` via `_dayjs.format`; component accepts a `date_format` var (default `MMM D, YYYY`).
- **Assignees** — display renders one `_ref: { module: user-account, component: user-avatar }` per assignee (picture + name); edit uses `_ref: { module: user-account, component: user-selector }` (multi-select, filtered to `apps.{app_name}.is_user: true`) bound to `_state.fields.assignees`. Both ship from [Part 24a](../../_completed/24a-user-account-selector-avatar/design.md).
- **Description** — edit renders a `TiptapInput` (rich text); display renders an `Html` block reading `description.html`. Stored as `{ text: string, html: string } | null`, mirroring the `comment` field. The `text` shadow stays for plain-text search / length checks. No truncation in v1.

Engine spec amendment: [`engine/spec.md:132`](../../../../workflows-module-concept/engine/spec.md) lists `description` as `string | null` — update to `{ text: string, html: string } | null` to match shipped behaviour (the `comment` field already carries this shape). Carry this amendment under Part 24.

### Module-shipped requests: none added, one amended

The fields operation is a resolver-emitted Api, not a module-shipped request, and the selector and avatar reach user-account via cross-module component refs. But the display rule above (one `user-avatar` per assignee) is unimplementable from the action doc alone — `assignees` is an id array and `user-avatar` consumes a user doc. So two binding prerequisites ship here:

- **`modules/workflows/requests/get_action.yaml`** (amend) — an additive `$lookup` into `user-contacts` projecting `assignee_docs: [{ _id, profile: { name, picture } }]` (cross-module collection precedent: `modules/activities/requests/stages/lookup_contacts.yaml`). Purely additive — every existing `get_action.*` binding keeps resolving.
- **`modules/user-account/components/user-multi-selector.yaml`** (amend — cross-module) — gains a parameterizable `id` var (default `user-multi-selector`, so existing consumers are untouched) plus an optional `title` var, so the workflows sidebar can auto-bind it to `{state_path}.assignees` (default `fields.assignees`). Part 24a's design explicitly anticipated this ("Part 24 binds `_state.fields.assignees`").

Type-safety note (settled, not deferred): user-contacts `_id` is a **string** (`_uuid: true` on the invite upsert — `user-admin/api/invite-user.yaml`; `_user: id` on `user-account/api/create-profile.yaml`), so selector values round-trip the client as strings and the `$lookup` on `_id` matches without coercion.

### Manifest dependency

`modules/workflows/module.lowdefy.yaml` gains `user-account` under `dependencies:` (alongside `layout` and `events`), so `_ref: { module: user-account, component: ... }` resolves at build time.

## Files changed (owned by this part)

All API / plugin / resolver / schema edits for the universal-fields write path live here. The consuming template parts (below) only render.

### Plugin — `plugins/modules-mongodb-plugins/src/connections/`

(The shared phase helpers live at `src/connections/shared/`, beside `WorkflowAPI/` — not inside it.)

- **`WorkflowAPI/UpdateActionFields/UpdateActionFields.js`** (new) — the operation handler: load → role check → plan → commit. No pre/post hook in v1.
- **`WorkflowAPI/UpdateActionFields/UpdateActionFields.test.js`** (new) — handler unit tests (fields write, cell re-render, no workflow write, role reject).
- **`WorkflowAPI/WorkflowAPI.js`** (amend) — register `UpdateActionFields` in the connection's `requests` map.
- **`shared/phases/planners/planFieldsUpdate.js`** (new) — pure planner: planned action doc (`$set` fields + change-stamp + metadata merge), re-rendered status-map cell, event via `planEventDispatch` (`UpdateActionFields` handler type, `comment` passed through — Part 33), change-log delta.
- **`shared/phases/planners/planFieldsUpdate.test.js`** (new).
- **`shared/phases/planners/planEventDispatch.js`** (amend — Part 38's file) — add the `UpdateActionFields` handler type → `action-fields-updated` event type + a `DEFAULT_TITLES` entry, plus the optional `comment` param the fold consumes; Part 33's post-render `foldCommentIntoEvent` call handles the `comment` (if Part 33 hasn't landed yet, the param flows un-folded until it does — either order works, per Part 33's contract).
- **`shared/phases/planners/planActionTransition.js`** (amend — Part 38's file) — narrow Part 38's generic, kind-agnostic `fields` passthrough to a kind-based rule: write the universal fields only for `kind: check`; `kind: form` never writes them here. (Part 38 must first carry the existing generic `fields` passthrough into this planner — see "Contract to neighbours".)
- **`shared/phases/loadWorkflowState.js`** (amend — Part 38's file) — third load mode `{ actionId, verb }`: signal-less, access-gated on the given verb via `gateAllows`, no stage / `required_after_close` check; preserves the gate-ahead-of-side-effects invariant.
- **`shared/phases/commitPlan.js`** (amend — Part 38's file) — accept an action-only plan (`workflow: null`): skip the workflow claim step (no CAS), commit actions + event + change-log.
- **`shared/phases/types.js`** (amend — Part 38's file) — `Plan.workflow` becomes nullable.

`schema.js` is unchanged — the handler uses the existing connection config.

### Resolver — `modules/workflows/resolvers/`

- **`makeWorkflowApis.js`** (amend) — emit `{workflow_type}-{action_type}-update-fields` for every **surface-bearing action (`kind: form` and `kind: check`; tracker excepted)** (payload `action_id` / `fields` / `comment`; `action_type` + `workflow_type` build-time literals; returns `action_id` + `event_id`). The submit endpoint is left as-is (check submit still writes fields per the kind-based planner rule).
- **`makeWorkflowsConfig.js` / `makeActionPages.js`** (amend) — add `universal_fields` to the passthrough allowlist (`ACTION_FIELDS` / `ACTION_FIELDS_FOR_TEMPLATE`) so it reaches `action_config.universal_fields` (default `[assignees, due_date, description]`). Do **not** add `universal_fields_required`: it was proposed in review-1 but is dropped here and was never actually present in either allowlist, so there is nothing to remove.

### Module

- **`modules/workflows/components/universal-fields/universal-fields.yaml`** (new) — the reusable component (modes + the form-kind Update button calling the operation).
- **`modules/workflows/module.lowdefy.yaml`** (amend) — add `user-account` to `dependencies`.
- **`modules/workflows/requests/get_action.yaml`** (amend) — additive `assignee_docs` `$lookup` (see "Module-shipped requests" above).
- **`modules/user-account/components/user-multi-selector.yaml`** (amend — cross-module) — parameterizable `id` + optional `title` vars, defaults preserving current consumers (see "Module-shipped requests" above).

### Concept-spec amendments

- **[`action-authoring/spec.md`](../../../../workflows-module-concept/action-authoring/spec.md)** — add `universal_fields` to the reserved-field table; remove `universal_fields_required`.
- **[`engine/spec.md:132`](../../../../workflows-module-concept/engine/spec.md)** — `description`: `string | null` → `{ text: string, html: string } | null`.
- **[`engine/spec.md`](../../../../workflows-module-concept/engine/spec.md)** — document the `UpdateActionFields` request type on the `WorkflowAPI` connection alongside the other handlers.

## Consumed by (template/layout only — owned by other parts)

These parts hold no API/plugin/resolver work for this surface — they compose the component and lay it out:

- **[Part 16 (page-templates)](../../_completed/16-page-templates/design.md)** — form templates lay content out as a two-column row (form card + universal-fields sidebar card) instead of a header band, gated on `universal_fields` being non-empty.
- **[Part 39 (form-submit buttons)](../../_completed/39-form-submit-buttons/design.md)** — **should** drop the `fields` key from the `submit` / `progress` button payloads and narrow the submit `Validate` regex from `[^form\., ^fields\.]` to `[^form\.]`. This is hygiene, not a correctness precondition: the kind-based guard means `planActionTransition.js` never writes the universal fields for `kind: form`, so a stray `fields` payload is ignored either way. Dropping it just stops form submit validating sidebar inputs it no longer owns and posting dead `_state.fields`. The two parts are therefore independent and can land in any order.
- **[Part 17 (shared-pages)](../../_completed/17-shared-pages/design.md)** — check pages keep universal fields as primary content on `submit` (no behavioural change; the `kind: task` → `kind: simple` rename landed in [Part 35](../../_completed/35-rename-task-kind-to-simple/design.md)).

> Parts 16 and 17 live in `_completed/`. Their template edits are deviations from already-implemented designs — handle as a follow-on task, not by reopening those folders.

## Out of scope / deferred

- **Save-on-change per field** (assignee dropdown writes immediately, Linear/Asana-style). v1 uses one Update button per sidebar card (one write, matches existing patterns). Per-field auto-save is a later UX refinement.
- **`universal_fields_required` / mandatory metadata.** Dropped per above; re-add a per-field `required` flag when a consumer needs it.
- **Tracker universal-fields UI.** No edit/view surface in v1 (see opening). Tracker fields are seeded from the parent at `StartWorkflow` and otherwise immutable in v1.
- **Per-action display-chrome overrides** (custom date format per action). Apps style globally via the layout module.
- **Custom universal-field schemas per app.** v1 fixes the three fields; extra action metadata goes in the form schema.

## Depends on

- **[Part 38 (engine rebuild)](../../_completed/38-engine-rebuild/design.md)** — supplies the load-plan-commit + render helpers the `UpdateActionFields` handler reuses; this part adds the handler to it.
- **[Part 5 (start/cancel handlers)](../../_completed/05-start-cancel-handlers/design.md)** — the action doc shape these fields live on (seeded at `StartWorkflow`).
- **[Part 18 (entity-components)](../18-entity-components/design.md)** — `action_role_check` populates `_state.action_allowed` gating the component's edit affordances.
- **[Part 24a (user-account selector + avatar)](../../_completed/24a-user-account-selector-avatar/design.md)** — `user-selector` + `user-avatar`.
- **[Part 35 (rename `task` → `simple`)](../../_completed/35-rename-task-kind-to-simple/design.md)** + **[Part 43 (rename `simple` → `check`)](../../_completed/43-rename-simple-kind-to-check/design.md)** — the kind landed as `simple` (Part 35) and was then renamed to `check` (Part 43), so the resolver keys on `kind: check` and every `kind: check` reference in this design (the component table, the check-page consumption row) is coherent. The `form`-emission path is unaffected by either rename.

Consumers (Parts 16 / 17 / 39, template-only) are enumerated under "Consumed by" above.

## Verification

- Build-time / unit:
  - Component renders `kind: form, mode: edit` as a sidebar card with an Update button bound to `{workflow_type}-{action_type}-update-fields`; `kind: check, mode: edit` renders inputs with the **same** Update button (check `submit` / `progress` additionally carry `fields`).
  - `mode: display` renders read-only with placeholders for null/empty values.
  - `show: []` / `universal_fields: false` omits the surface (form body spans full width).
  - Enum/passthrough: `universal_fields` reaches `action_config.universal_fields` with the all-three default.
- Integration (demo app):
  - Form edit page: changing the assignee in the sidebar and clicking Update writes the action doc and **re-renders the status-map cell** (entity-page card shows the new assignee) without touching form data or the action's stage.
  - Form submit (`submit` / `progress`) does **not** alter `assignees` / `due_date` / `description`.
  - A `done` form action's universal fields are still editable via the sidebar.
  - Check edit page writes universal fields on `submit` as primary content, and independently via the standalone Update button (no transition).
  - `_state.action_allowed.edit === false` hides the Update button and renders inputs read-only.
- End-to-end coverage lands in [Part 22](../22-workflows-e2e-suite/design.md).

## Open questions

- **Comment binding on the fields operation.** The Update button optionally posts a `comment` (folded into the event's `display.{app_name}.description` by `planEventDispatch`, per Part 33). Whether the sidebar surfaces a comment field by default, or only when the action opts in, is a UI detail to settle when Part 16's sidebar layout is built. Default v1: no comment field on the sidebar; the operation accepts `comment` for callers that want it.
- **Last-write-wins on concurrent fields updates.** The operation writes no workflow doc, so there's no CAS gate (Part 38 D15 defers per-action CAS). Two near-simultaneous metadata edits to the same action are last-write-wins. Acceptable for v1; add an action-level CAS filter to the bulkWrite if contention proves real.
- **Should terminal-stage actions be reassignable?** The operation is stage-agnostic today — editable in any stage the user has `edit` access to, including `done` / `not-required` (and on a `completed` / `cancelled` workflow). That keeps reassign-without-transition uniform, but it also means a *completed* action's metadata stays mutable indefinitely. Whether terminal stages (notably `done`) should instead be **frozen** (read-only once complete) is unresolved. It's a policy call, not a mechanism one: restricting it adds a stage gate to the operation's load phase, and `allowed.edit` then reflects it on the surfaces ([Part 40](../../40-simple-action-surfaces/design.md) renders the fields read-only when `allowed.edit` is false, so no Part 40 change is needed either way). v1 leaves it open — currently reassignable; decide when a real workflow needs the freeze.

## Contract to neighbours

- **This part owns** the `UpdateActionFields` handler, its planner, the `makeWorkflowApis` endpoint emission, the connection registration, the `universal_fields` passthrough, the submit-planner no-clobber guard, and the component. Parts 16 / 17 / 39 only render against this contract.
- **Part 38** supplies the load-plan-commit + render helpers this part's handler reuses; this part adds the handler to Part 38's engine and amends its `planActionTransition.js` with the kind-based field write. **Part 38 must carry the existing generic `fields` passthrough (today inside the monolithic `SubmitWorkflowAction` — `updateAction`'s `$set: { ...fields }`) into `planActionTransition.js`**, kind-agnostic and without naming the universal fields — Part 38's planner spec now pins this explicitly. Part 24 then constrains that passthrough to `kind: check` (and names the three fields, since the universal-fields concept lives here); if Part 38 ships the planner without the passthrough, Part 24 owns adding it. Note: removing the passthrough from Part 38 entirely is **not** the right split — `kind: check` submits would persist no content between Part 38 and Part 24 landing (its submission content *is* the universal fields). Sequence after Part 38.
- **Parts 16 / 17** consume the component via `_ref`; they don't author universal-field inputs inline. Part 18 doesn't consume it in v1 — tracker rendering stays `status_map.message`-only.
- **Part 39** should stop sending `fields` in the `submit` / `progress` button payloads and narrow the submit `Validate` regex to `[^form\.]` (template-only) — hygiene, not correctness: the kind-based guard already keeps form submit from touching the universal fields, so the parts are independent (see "Consumed by").
