# Part 24 — Universal-fields surface (`assignees`, `due_date`, `description`)

The three action-level fields every action carries — `assignees`, `due_date`, `description` — are **metadata about the action**, not part of what a form submission captures. This part pins their contract across the form and simple kinds and ships one reusable Lowdefy component the page templates compose.

The headline change from the previous draft: on **form-kind** actions, universal fields are written by their **own operation**, fully decoupled from the form submit. They render as a right-hand **sidebar card** with its own Update button, and the form's `submit` / `progress` buttons no longer carry a `fields` payload at all. On **simple-kind** actions the universal fields *are* the submission content, so they stay as primary content written on the `submit` signal. This is the minimal, scoped landing of the "operations vs transitions" split from [critique-concepts.md §3](../../../workflows-module-concept/review/critique-concepts.md) — the category the [state-machine](../../../workflows-module-concept/state-machine/design.md) sub-design deliberately parked as a non-goal (`state-machine/design.md:323`), here implemented for exactly one operation (write the three fields) on exactly one kind (form).

Tracker actions are excluded — they have no view surface (no `-view` / `-edit`, only inline rendering in `actions-on-entity` via `status_map.message`), so there's nowhere to render the fields. The tracker doc still carries the three fields (the engine writes them at `StartWorkflow`, carried from the parent action), but no UI renders them in v1.

## Proposed change

1. **Form-kind universal fields become a state-orthogonal operation.** A new resolver-emitted endpoint `update-action-fields-{action_type}` writes the three fields with no `signal`, no `form`, and no FSM transition. The form-submit payload (`submit` / `progress`) drops its `fields` key.
2. **This part owns the full write path.** It ships the `UpdateActionFields` plugin handler + `planFieldsUpdate.js` planner, the `makeWorkflowApis` change to emit the fields endpoint, the connection registration, the `universal_fields` resolver passthrough, and the submit-planner guard that confines the universal-field write to `kind: simple`. The handler reuses [Part 38](../38-engine-rebuild/design.md)'s load→plan→commit + render helpers: set fields, merge metadata, **re-render the status-map cell**, emit an `action-fields-updated` log event, no workflow write. The form submit endpoint is unchanged (it stays kind-uniform); the guard's kind check keeps form submit from touching the fields. The consuming parts (16/17/39) are left with template/layout rendering only.
3. **Form-kind fields render as a right-hand sidebar card** with its own Update button, beside the form body (not a header band). Simple-kind fields stay as primary content on the submit surface.
4. **Universal fields are editable whenever the user has access** — the stage-based editable allowlist and the `required_after_close` carve-out are gone. You can reassign a `done` action or fix a due date on an `in-review` one.
5. **Presence is author-declared via `universal_fields`** (which of the three to show). Default: all three, shown and optional. `universal_fields: false` / `[]` hides the surface. `universal_fields_required` is **dropped** (no demonstrated need; re-addable later).
6. **One reusable component** (`components/universal-fields/universal-fields.yaml`) with `kind` × (`edit`/`display`) modes; `kind` now drives a real behavioural difference (form = own operation + Update button; simple = rides submit). Resolves Part 24 review-1 finding #8.

## Why decouple (and why it simplifies)

Bundling the universal fields into the form submit forced three kinds of friction, all of which this split removes:

- **You couldn't touch metadata without a transition.** Reassigning or re-dating an action meant re-submitting it — re-running form validation and (for actions with a `review` verb) bouncing it back through review. critique §3 named this exactly ("You can't update assignees on a `done` action"). As an independent operation, metadata edits are role-gated and stage-agnostic.
- **The editable-stage allowlist and `required_after_close` band-handling vanish.** The previous draft tied the band's editability to the form lifecycle (`action-required` / `in-progress` / `changes-required` editable; everything else read-only) and added a `required_after_close` exception so a surviving action stayed editable past `close-workflow`. None of that is needed now: the operation is editable iff the user has access, full stop. `required_after_close` reverts to its real meaning — whether *form submit* survives a closed workflow ([action-authoring spec](../../../workflows-module-concept/action-authoring/spec.md)) — and stops touching this surface.
- **`kind` earns its keep.** Form vs simple now selects which write path the submit-adjacent affordances target (independent operation vs the submit payload), so the component's `kind` var drives behaviour rather than just cosmetics — closing Part 24 review-1 finding #8.

### Why it still goes through the engine (not a plain `MongoDBUpdateOne`)

Status-map cells can reference `assignees` / `due_date` (Part 38 D12's render context spreads them into the cell template), so a field change must **re-render the sticky cell** — otherwise the entity-page card keeps showing the old assignee until the next transition, the precise staleness class [Part 38](../38-engine-rebuild/design.md) exists to eliminate. A plain plugin write would either skip the re-render (stale display) or duplicate the render helpers in YAML (violates "one correct way"). So the operation runs through a real engine handler that reuses Part 38's render path. It is **not** an FSM signal — keeping it out of the signal model is the deliberate operations/transitions boundary state-machine.md draws.

## In scope

### Component shipped

`modules/workflows/components/universal-fields/universal-fields.yaml` — one Lowdefy component, composed by the page templates (Part 16) and shared simple pages (Part 17):

```yaml
- _ref:
    path: components/universal-fields/universal-fields.yaml
    vars:
      mode: edit              # 'edit' | 'display'
      kind: form              # 'form' | 'simple' — tracker excluded
      action_type: qualify    # builds update-action-fields-{action_type} (form + edit only)
      show:                   # which fields render; from action_config.universal_fields
        _var: action_config.universal_fields   # default [assignees, due_date, description]
      action_data:            # bindings the inputs/display read
        assignees:   { _state: fields.assignees }
        due_date:    { _state: fields.due_date }
        description: { _state: fields.description }
```

Block-id convention follows the CLAUDE.md "Input block IDs match data paths" rule: `fields.assignees`, `fields.due_date`, `fields.description`.

**Behaviour by `kind` × `mode`:**

| `kind` | `mode` | Renders | Write path |
| ------ | ------ | ------- | ---------- |
| `form` | `edit` | Sidebar card: the declared inputs **plus its own Update button** | Button calls `update-action-fields-{action_type}` with `fields: { _state: fields }` + optional `comment`. **Independent of form submit.** |
| `form` | `display` | Sidebar card, read-only | — (reads `get_action.*`) |
| `simple` | `edit` | Primary content: the declared inputs, **no own button** | The page's `submit` button carries `fields: { _state: fields }` (unchanged). |
| `simple` | `display` | Primary content, read-only | — |

**Binding by mode:**

- **`edit`** — `action_data` bound to `_state.fields.*`; primed by the page's `onMount` from the loaded action doc. For form kind the component's own Update button posts the `_state.fields` subtree; for simple kind the page's submit button posts it.
- **`display`** — `action_data` bound to `_request: get_action.*`; reads straight from the loaded action doc (no `_state.fields` priming on `-view` / `-review`).

  ```yaml
  - _ref:
      path: components/universal-fields/universal-fields.yaml
      vars:
        mode: display
        kind: form
        show: { _var: action_config.universal_fields }
        action_data:
          assignees:   { _request: get_action.assignees }
          due_date:    { _request: get_action.due_date }
          description: { _request: get_action.description }
  ```

### Where the component renders

| Surface                                       | Mode      | Placement / notes                                                                                  |
| --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| Form action `edit` (Part 16)                  | `edit`    | Right sidebar card with its own Update button. Form submit does **not** write these fields.        |
| Form action `view` (Part 16)                  | `display` | Right sidebar card, read-only.                                                                     |
| Form action `review` (Part 16)                | `display` | Right sidebar card, read-only. Reviewers who need to change metadata use the `edit` page sidebar.  |
| Form action `error` (Part 16)                 | `display` | Right sidebar card, read-only. Recovery flow doesn't edit metadata.                                |
| Simple action `simple-edit` (Part 17)         | `edit`    | Primary content (status buttons + comment below). Written on `submit`.                             |
| Simple action `simple-view` / `simple-review` | `display` | Primary content, read-only.                                                                        |

The template renders the form-kind sidebar column **iff `show` is non-empty**; when an action declares `universal_fields: false` / `[]` the column is omitted and the form body spans full width.

### The operation: `update-action-fields-{action_type}`

Resolver-emitted by **this part's** `makeWorkflowApis` change (one per **form** action). Simple actions get no fields endpoint in v1 — they write fields on `submit`.

```yaml
id: update-action-fields-{action_type}
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
      comment: { _payload: comment }   # optional; handler maps to event.metadata.comment
  - :return:
      action_id: { _step: update_fields.action_id }
      event_id:  { _step: update_fields.event_id }
```

The component's Update button:

```yaml
- id: button_update_fields            # sidebar card footer
  type: Button
  properties: { title: Update, type: primary }
  visible: { _eq: [{ _state: action_allowed }, true] }
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
              _build.string.concat: [update-action-fields-, { _var: action_type }]
          payload:
            action_id: { _state: action._id }
            fields:    { _state: fields }
            comment:   { _state: fields_comment }   # optional
```

**Engine handler `UpdateActionFields`** — a new plugin entry point in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/UpdateActionFields/`, **shipped by this part**, on the same `WorkflowAPI` connection as `SubmitWorkflowAction` / `StartWorkflow` / etc. It reuses [Part 38](../38-engine-rebuild/design.md)'s helpers — `loadWorkflowState` / `commitPlan` (`shared/phases/`), `planEventDispatch` (`shared/phases/planners/`), and `renderStatusMap` (`shared/render/`) — and adds one new planner `shared/phases/planners/planFieldsUpdate.js`:

- **Load** — workflow + target action + configs; role check (`access.roles` ⊇ user roles), identical to `SubmitWorkflowAction`.
- **Plan** (pure) — compose planned action doc = loaded action with `assignees` / `due_date` / `description` `$set`, change-stamp refreshed, `metadata` merged; **re-render the status-map cell** (Part 38 D12 render path) against the planned doc; build an `action-fields-updated` log event (references + entity-ref key as in submit-pipeline's default event, `metadata.comment` from payload); build the change-log delta. **No workflow doc write** — summary/groups/form_data are unaffected by metadata, so the workflow is untouched.
- **Commit** — `bulkWriteActions` (one action update) + event via `new-event` + change-log. Because no workflow doc is written there is no CAS gate; concurrent fields-updates are last-write-wins on the action doc (acceptable for metadata, consistent with Part 38 D15's deferral of per-action CAS).

**Connection registration.** `WorkflowAPI/index.js` (or the connection's request-type map) registers `UpdateActionFields` alongside the existing handlers; `WorkflowAPI/schema.js` needs no new connection-level fields (the handler reads the same `databaseUri` / `app_name` / `entry_id` / `changeLog` config the other handlers use).

**Submit-planner guard (kind-based field write).** Today's monolithic `SubmitWorkflowAction` writes `payload.fields` to the action doc via a **generic spread** (`updateAction`'s `$set: { ...fields }`) — it doesn't name the three fields; the `fields` bag just happens to carry `{ assignees, due_date, description }`. Part 38's rebuild carries that **generic, kind-agnostic passthrough** into the shared `planActionTransition.js` unchanged (behavior-preserving — see "Contract to neighbours"); Part 38 itself never names the universal fields. This part is where the universal-fields concept enters: it amends the passthrough to a **kind-based rule: the planner writes `assignees` / `due_date` / `description` only for `kind: simple`** — the kind whose submission content *is* those fields. For `kind: form` the planner never touches them; they are owned exclusively by the `update-action-fields-{action_type}` operation. The rule keys on the action's `kind` (already loaded in the plan context), **not** on the payload shape, so it cannot be defeated by a stray `fields` payload, and the form template dropping `fields` (Part 39) becomes hygiene — don't validate sidebar inputs on submit, don't post dead state — rather than a correctness precondition. Simple submit is unaffected: its `fields` payload is written exactly as today.

**Role gating.** Same `access.roles` as the action, enforced in the handler's load phase. The component additionally reads `_state.action_allowed` (from `action_role_check`, Part 18) and switches inputs + Update button to read-only / hidden when `false` — defense in depth so users can't type changes that won't save.

**Lifecycle.** Editable in any stage the user has access to — including `done` / `not-required` / `error`. There is no stage allowlist and no `required_after_close` interaction; metadata is always editable for an accessible action.

### Authoring: `universal_fields`

```yaml
type: qualify
kind: form
access: { roles: [sales] }
universal_fields: [assignees, due_date]   # which fields render; omit = all three; false / [] = none
```

`universal_fields` is an optional list drawn from `[assignees, due_date, description]`. **Default (field omitted): all three, shown and optional.** Set `false` or `[]` to hide the surface entirely (data-only forms). It is purely a UI presence declaration — the action doc always carries all three fields physically (the engine writes them at `StartWorkflow`); `universal_fields` only controls what the templates render.

Authoring-contract amendment: add `universal_fields` to the [action-authoring spec](../../../workflows-module-concept/action-authoring/spec.md) reserved-field table. Resolver passthrough (the `makeWorkflowsConfig.js` / `makeActionPages.js` allowlists) carries it through to `action_config.universal_fields` — same pattern `required_after_close` follows.

`universal_fields_required` from the previous draft is **dropped**. There was no consumer requiring mandatory universal fields, and once fields are decoupled from submit, "required" can only gate the operation's own Update (it cannot block form submit without re-coupling the two writes). Per "build for what exists," it's removed; re-adding a per-field `required` flag (a 2-line `Validate` addition on the operation) is trivial when a real need surfaces.

### Display rules

- **Empty-state** — `null` / `[]` shows a dimmed placeholder in display mode (`Not assigned`, `No due date`, `No description`); edit mode shows the empty input.
- **Date formatting** — `due_date` via `_dayjs.format`; component accepts a `date_format` var (default `MMM D, YYYY`).
- **Assignees** — display renders one `_ref: { module: user-account, component: user-avatar }` per assignee (picture + name); edit uses `_ref: { module: user-account, component: user-selector }` (multi-select, filtered to `apps.{app_name}.is_user: true`) bound to `_state.fields.assignees`. Both ship from [Part 24a](../_completed/24a-user-account-selector-avatar/design.md).
- **Description** — edit renders a `TiptapInput` (rich text); display renders an `Html` block reading `description.html`. Stored as `{ text: string, html: string } | null`, mirroring the `comment` field. The `text` shadow stays for plain-text search / length checks. No truncation in v1.

Engine spec amendment: [`engine/spec.md:132`](../../../workflows-module-concept/engine/spec.md) lists `description` as `string | null` — update to `{ text: string, html: string } | null` to match shipped behaviour (the `comment` field already carries this shape). Carry this amendment under Part 24.

### Module-shipped requests added

None. The selector and avatar reach user-account via cross-module component refs; the fields operation is a resolver-emitted Api, not a module-shipped request.

### Manifest dependency

`modules/workflows/module.lowdefy.yaml` gains `user-account` under `dependencies:` (alongside `layout` and `events`), so `_ref: { module: user-account, component: ... }` resolves at build time.

## Files changed (owned by this part)

All API / plugin / resolver / schema edits for the universal-fields write path live here. The consuming template parts (below) only render.

### Plugin — `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`

- **`UpdateActionFields/UpdateActionFields.js`** (new) — the operation handler: load → role check → plan → commit. No pre/post hook in v1.
- **`UpdateActionFields/UpdateActionFields.test.js`** (new) — handler unit tests (fields write, cell re-render, no workflow write, role reject).
- **`shared/phases/planners/planFieldsUpdate.js`** (new) — pure planner: planned action doc (`$set` fields + change-stamp + metadata merge), re-rendered status-map cell, `action-fields-updated` event payload, change-log delta.
- **`shared/phases/planners/planFieldsUpdate.test.js`** (new).
- **`shared/phases/planners/planActionTransition.js`** (amend — Part 38's file) — narrow Part 38's generic, kind-agnostic `fields` passthrough to a kind-based rule: write the universal fields only for `kind: simple`; `kind: form` never writes them here. (Part 38 must first carry the existing generic `fields` passthrough into this planner — see "Contract to neighbours".)
- **`WorkflowAPI/index.js`** (amend) — register `UpdateActionFields` in the connection's request-type map.

`schema.js` is unchanged — the handler uses the existing connection config.

### Resolver — `modules/workflows/resolvers/`

- **`makeWorkflowApis.js`** (amend) — emit `update-action-fields-{action_type}` for every `kind: form` action (payload `action_id` / `fields` / `comment`; `action_type` + `workflow_type` build-time literals; returns `action_id` + `event_id`). The submit endpoint is left as-is.
- **`makeWorkflowsConfig.js` / `makeActionPages.js`** (amend) — add `universal_fields` to the passthrough allowlist (`ACTION_FIELDS` / `ACTION_FIELDS_FOR_TEMPLATE`) so it reaches `action_config.universal_fields` (default `[assignees, due_date, description]`). Do **not** add `universal_fields_required`: it was proposed in review-1 but is dropped here and was never actually present in either allowlist, so there is nothing to remove.

### Module

- **`modules/workflows/components/universal-fields/universal-fields.yaml`** (new) — the reusable component (modes + the form-kind Update button calling the operation).
- **`modules/workflows/module.lowdefy.yaml`** (amend) — add `user-account` to `dependencies`.

### Concept-spec amendments

- **[`action-authoring/spec.md`](../../../workflows-module-concept/action-authoring/spec.md)** — add `universal_fields` to the reserved-field table; remove `universal_fields_required`.
- **[`engine/spec.md:132`](../../../workflows-module-concept/engine/spec.md)** — `description`: `string | null` → `{ text: string, html: string } | null`.
- **[`engine/spec.md`](../../../workflows-module-concept/engine/spec.md)** — document the `UpdateActionFields` request type on the `WorkflowAPI` connection alongside the other handlers.

## Consumed by (template/layout only — owned by other parts)

These parts hold no API/plugin/resolver work for this surface — they compose the component and lay it out:

- **[Part 16 (page-templates)](../_completed/16-page-templates/design.md)** — form templates lay content out as a two-column row (form card + universal-fields sidebar card) instead of a header band, gated on `universal_fields` being non-empty.
- **[Part 39 (form-submit buttons)](../39-form-submit-buttons/design.md)** — **should** drop the `fields` key from the `submit` / `progress` button payloads and narrow the submit `Validate` regex from `[^form\., ^fields\.]` to `[^form\.]`. This is hygiene, not a correctness precondition: the kind-based guard means `planActionTransition.js` never writes the universal fields for `kind: form`, so a stray `fields` payload is ignored either way. Dropping it just stops form submit validating sidebar inputs it no longer owns and posting dead `_state.fields`. The two parts are therefore independent and can land in any order.
- **[Part 17 (shared-pages)](../_completed/17-shared-pages/design.md)** — simple pages keep universal fields as primary content on `submit` (no behavioural change; the `kind: task` → `kind: simple` rename landed in [Part 35](../_completed/35-rename-task-kind-to-simple/design.md)).

> Parts 16 and 17 live in `_completed/`. Their template edits are deviations from already-implemented designs — handle as a follow-on task, not by reopening those folders.

## Out of scope / deferred

- **A fields operation for simple actions** (e.g. reassigning a `done` simple action without a transition). Simple kind writes fields on `submit` in v1. Emitting `update-action-fields-{action_type}` for simple actions too — for consistency — is additive when a real need surfaces.
- **Save-on-change per field** (assignee dropdown writes immediately, Linear/Asana-style). v1 uses one Update button per sidebar card (one write, matches existing patterns). Per-field auto-save is a later UX refinement.
- **`universal_fields_required` / mandatory metadata.** Dropped per above; re-add a per-field `required` flag when a consumer needs it.
- **Tracker universal-fields UI.** No edit/view surface in v1 (see opening). Tracker fields are seeded from the parent at `StartWorkflow` and otherwise immutable in v1.
- **Per-action display-chrome overrides** (custom date format per action). Apps style globally via the layout module.
- **Custom universal-field schemas per app.** v1 fixes the three fields; extra action metadata goes in the form schema.

## Depends on

- **[Part 38 (engine rebuild)](../38-engine-rebuild/design.md)** — supplies the load-plan-commit + render helpers the `UpdateActionFields` handler reuses; this part adds the handler to it.
- **[Part 5 (start/cancel handlers)](../_completed/05-start-cancel-handlers/design.md)** — the action doc shape these fields live on (seeded at `StartWorkflow`).
- **[Part 18 (entity-components)](../18-entity-components/design.md)** — `action_role_check` populates `_state.action_allowed` gating the component's edit affordances.
- **[Part 24a (user-account selector + avatar)](../_completed/24a-user-account-selector-avatar/design.md)** — `user-selector` + `user-avatar`.
- **[Part 35 (rename `task` → `simple`)](../_completed/35-rename-task-kind-to-simple/design.md)** — the `kind: task` → `kind: simple` rename has landed, so the resolver keys on `kind: simple` and every `kind: simple` reference in this design (the component table, the simple-page consumption row) is coherent. The `form`-emission path is unaffected by the rename.

Consumers (Parts 16 / 17 / 39, template-only) are enumerated under "Consumed by" above.

## Verification

- Build-time / unit:
  - Component renders `kind: form, mode: edit` as a sidebar card with an Update button bound to `update-action-fields-{action_type}`; `kind: simple, mode: edit` renders inputs with no own button.
  - `mode: display` renders read-only with placeholders for null/empty values.
  - `show: []` / `universal_fields: false` omits the surface (form body spans full width).
  - Enum/passthrough: `universal_fields` reaches `action_config.universal_fields` with the all-three default.
- Integration (demo app):
  - Form edit page: changing the assignee in the sidebar and clicking Update writes the action doc and **re-renders the status-map cell** (entity-page card shows the new assignee) without touching form data or the action's stage.
  - Form submit (`submit` / `progress`) does **not** alter `assignees` / `due_date` / `description`.
  - A `done` form action's universal fields are still editable via the sidebar.
  - Simple edit page writes universal fields on `submit` as primary content.
  - `_state.action_allowed === false` hides the Update button and renders inputs read-only.
- End-to-end coverage lands in [Part 22](../_next/22-workflows-e2e-suite/design.md).

## Open questions

- **Comment binding on the fields operation.** The Update button optionally posts a `comment` (mapped to `event.metadata.comment`). Whether the sidebar surfaces a comment field by default, or only when the action opts in, is a UI detail to settle when Part 16's sidebar layout is built. Default v1: no comment field on the sidebar; the operation accepts `comment` for callers that want it.
- **Last-write-wins on concurrent fields updates.** The operation writes no workflow doc, so there's no CAS gate (Part 38 D15 defers per-action CAS). Two near-simultaneous metadata edits to the same action are last-write-wins. Acceptable for v1; add an action-level CAS filter to the bulkWrite if contention proves real.

## Contract to neighbours

- **This part owns** the `UpdateActionFields` handler, its planner, the `makeWorkflowApis` endpoint emission, the connection registration, the `universal_fields` passthrough, the submit-planner no-clobber guard, and the component. Parts 16 / 17 / 39 only render against this contract.
- **Part 38** supplies the load-plan-commit + render helpers this part's handler reuses; this part adds the handler to Part 38's engine and amends its `planActionTransition.js` with the kind-based field write. **Part 38 must carry the existing generic `fields` passthrough (today inside the monolithic `SubmitWorkflowAction` — `updateAction`'s `$set: { ...fields }`) into `planActionTransition.js`**, kind-agnostic and without naming the universal fields — Part 38's planner spec now pins this explicitly. Part 24 then constrains that passthrough to `kind: simple` (and names the three fields, since the universal-fields concept lives here); if Part 38 ships the planner without the passthrough, Part 24 owns adding it. Note: removing the passthrough from Part 38 entirely is **not** the right split — `kind: simple` submits would persist no content between Part 38 and Part 24 landing (its submission content *is* the universal fields). Sequence after Part 38.
- **Parts 16 / 17** consume the component via `_ref`; they don't author universal-field inputs inline. Part 18 doesn't consume it in v1 — tracker rendering stays `status_map.message`-only.
- **Part 39** should stop sending `fields` in the `submit` / `progress` button payloads and narrow the submit `Validate` regex to `[^form\.]` (template-only) — hygiene, not correctness: the kind-based guard already keeps form submit from touching the universal fields, so the parts are independent (see "Consumed by").
