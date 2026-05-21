# Part 16 — Form-action page templates

**Source rationale:** [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** UI delivery. **Size:** M. **Repo:** `modules/workflows/templates/`.

## Goal

Ship the four Nunjucks page templates that [part 12 (`makeActionPages`)](../12-resolver-pages/design.md) references. Each template provides page chrome (via the `layout` module), the universal-fields band (via [part 24](../24-universal-fields/design.md)'s component), the form body (via [part 15](../15-resolver-form-builder/design.md)'s `makeActionsForm` resolver), and the button vocabulary wired to call the per-action endpoint from [part 13](../13-resolver-apis/design.md) with the matching `interaction` value.

## In scope

### Four templates

- **`templates/edit.yaml.njk`** — edit form.
  - Universal-fields band (`assignees`, `due_date`, `description`) via the component shipped by [part 24](../24-universal-fields/design.md), rendered in `mode: edit`.
  - Form body via `_ref: { resolver: makeActionsForm.js, vars: { form: <action_config.form> } }` (per [part 15](../15-resolver-form-builder/design.md)'s "Two emission paths" decision — option B). `global.action_form_configs` is metadata-only and not used for the form body.
  - Optional comment field.
  - Template-shipped `submit_edit` button.
  - Template-shipped `not_required` button, opt-in via `page_config.buttons.not_required.visible: true` on the action YAML. See "`not_required` opt-in" below.

- **`templates/view.yaml.njk`** — read-only view.
  - Universal-fields band via part 24's component in `mode: display`.
  - Form body rendered read-only via `DataView` with `formConfig: action_config.form` — same mechanism as `review.yaml.njk`'s main form, for the same reason (part 15's resolver doesn't emit a read-only render).
  - No write buttons. `not_required` does **not** render here — it lives on `edit.yaml.njk` only (see "`not_required` opt-in" below).

- **`templates/review.yaml.njk`** — review surface.
  - Read-only main form display via `DataView` with `formConfig: action_config.form` — v0 parity. `makeActionsForm` is **not** used for the read-only main form: per [part 15](../15-resolver-form-builder/design.md), the resolver's `mode` var only controls the `viewOnly` filter, not switching components to a read-only render — so calling it would produce editable inputs. `DataView` is the correct read-only renderer.
  - Writable `form_review` block via `_ref: { resolver: makeActionsForm.js, vars: { form: <action_config.form_review>, mode: 'review' } }` — same option-B path as `edit`, on the `form_review` slice from part 12's shell, with `mode: 'review'` so the resolver drops any `viewOnly: true` entries authors want hidden on the writable review surface.
  - Template-shipped `approve` and `request_changes` interaction buttons.
  - Template-shipped `Edit` navigation button (renders when the edit verb is in this app's access list) — lets reviewers round-trip back to the edit page for small fixes. See "Button vocabulary" below.
  - Optional comment field. Page sends a top-level `comment` field in the submit payload; the resolver-emitted API (part 13) maps it to `event.metadata.comment` on the engine-emitted event. See "Button payload" below for the full payload shape.

- **`templates/error.yaml.njk`** — recovery surface.
  - Stale-URL guard on `onMount`: redirect to `-view` when `status[0].stage !== 'error'`.
  - Failure-context banner reading `status[0].error_message` and `status[0].error_metadata` from the action doc.
  - Recovery form via `_ref: { resolver: makeActionsForm.js, vars: { form: <action_config.form_error>, mode: 'error' } }`. Per [part 15](../15-resolver-form-builder/design.md), the resolver does **not** synthesize `form_error` from `form` when absent — the template defaults to `[]` (empty form body) and the failure-context banner stands alone.
  - Template-shipped `resolve_error` button.

### Module-shipped requests

Part 12's page shell carries no `requests:` block — templates own request wiring. Part 16 ships three reusable request YAML files under `modules/workflows/requests/`. Templates `_ref` them from inside their Nunjucks bodies and inject them into the page's `requests:` list:

- **`requests/get_action.yaml`** — MongoDB find on the workflows module's `actions-collection`, matching by `_id: { _url_query: action_id }`. Returns the action doc, including `workflow_id`, `entity_id`, `entity_collection`, `status[]`, `key`, the universal fields (`assignees`, `due_date`, `description`), and any author-defined per-action scalars.
- **`requests/get_workflow.yaml`** — MongoDB find on `workflows-collection` by `_id: { _request: get_action.workflow_id }`. Returns the workflow doc. **Why this exists:** form-field state lives on the workflow doc at `form_data.{action_type}.{key}.{field}` (per engine spec); the action doc carries the action's own metadata but not its form values.
- **`requests/get_entity.yaml`** — MongoDB find on the entity's own collection. The template substitutes `{{ entity_collection }}` (the build-time var passed by part 12) into the `connectionId` literal at Nunjucks render time, so each emitted page bakes its entity-collection connection id directly into the request. Match clause: `_id: { _request: get_action.entity_id }`. Returns the entity doc — used for back-link display, entity-context fields, and any cross-reference the form needs.

All three requests are kept simple (single `$match`, no projections) — apps that need different shapes author their own `page_config.requests:`.

### Template `onMount` sequence (all four templates)

Each template's `onMount` runs in this fixed order, with author-supplied `page_config.events.onMount` appended at the end:

1. **`action_id` presence guard** — `Link back: true` if `_url_query.action_id` is null. Prevents the page from running queries with missing input.
2. **`Request: get_action`** — populates `_request: get_action.*` for downstream steps.
3. **Stale-URL redirect guard** (per the previous section) — redirects to `-view` if the action's current stage isn't in the template's allowlist.
4. **`Request: get_workflow`** — needed for form-state defaults that read off `form_data`.
5. **`Request: get_entity`** — needed for back-link chrome and any entity-context fields.
6. **`action_role_check`** — sets `_state.action_allowed` based on the current user's roles vs. `access.{app_name}` (see [part 18](../18-entity-components/design.md) for the shared primitive). Templates gate buttons on `_state.action_allowed === true`.
7. **`SetState`** — primes form state from `get_workflow.form_data.{action_type}` (and the keyed-action variant `form_data.{action_type}.{key}`).
8. **Author-supplied `page_config.events.onMount`** — anything the author adds runs last, after the action doc, workflow doc, entity doc, and access flag are all in state.

Templates emit this sequence at Nunjucks render time; nothing about it is dynamic per-action. The author's hook is exclusively the tail step (8).

### Stale-URL redirect guards (all templates)

Every template runs a status-stage guard in `onMount` after `get_action` resolves. If the action's current stage isn't in the template's allowlist, the template redirects to `-view`. This prevents users opening edit/review/error pages after status has moved on (a stale tab, a stale link in an email).

The allowlists are template-specific knowledge — they don't reduce cleanly to status priority or to a per-stage flag — so they're hardcoded at the top of each template as a single constant array:

| Template          | Allowed stages                                       | Notes                                                                                                                  |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `edit.yaml.njk`   | `[action-required, in-progress, changes-required]`   | Pre-review writable states. Escape hatch: `_input: skip_status_redirect` (set by the review-page Edit-button link).    |
| `view.yaml.njk`   | (no guard)                                           | View is always reachable; renders read-only at any stage.                                                              |
| `review.yaml.njk` | `[in-review, error]`                                 | `error` is included so reviewers can see the action while it's mid-recovery; the engine-side recovery flow handles it. |
| `error.yaml.njk`  | `[error]`                                            | Only renders during recovery; everything else redirects to `-view`.                                                    |

If a new status is added to `global.action_statuses`, the template author decides whether it belongs in any of these allowlists. There's no automatic propagation. The intent is that adding a status is rare and deserves a deliberate review of the template surfaces it touches.

### Button vocabulary

Buttons have two layers — **identity** (which buttons render, which `interaction` they fire) is immutable. **Chrome and visibility** (`title`, `disabled`, `visible`, optional confirm `modal`) are overridable per the table at the end of this section. These are different concerns: `_state.action_allowed` from `action_role_check` answers "can this user write at all," while `page_config.buttons.{name}.*` answers "should this button render given page state."

Five **interaction buttons** — each one fires an author event handler and posts to `update-action-{action_type}` with a fixed `interaction` value. This set is immutable:

| Button            | Template          | Author event handler fired | `interaction` payload | Default render rule                                                            |
| ----------------- | ----------------- | -------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `submit_edit`     | `edit.yaml.njk`   | `onSubmit`                 | `submit_edit`         | Always renders.                                                                |
| `not_required`    | `edit.yaml.njk`   | `onSubmit`                 | `not_required`        | Opt-in via `page_config.buttons.not_required.visible: true` (default `false`). |
| `resolve_error`   | `error.yaml.njk`  | `onSubmit`                 | `resolve_error`       | Always renders.                                                                |
| `approve`         | `review.yaml.njk` | `onApprove`                | `approve`             | Always renders.                                                                |
| `request_changes` | `review.yaml.njk` | `onRequestChanges`         | `request_changes`     | Always renders.                                                                |

Every interaction button: (1) fires the matching `pages.{verb}.events.{handler}` author-supplied event for page-state work, then (2) calls `update-action-{action_type}` with the right `interaction` + `form` / `form_review` / `fields` / `current_key` payload.

All interaction buttons are additionally gated on `_state.action_allowed === true` from `action_role_check` (step 6 of the `onMount` sequence). Users without the action's required role see no write buttons, which matches the engine's server-side gate at submit time.

**Navigation buttons** are a separate category — they don't fire interaction events. One navigation button ships:

| Button | Template          | Action            | Default render rule                                                                                                            |
| ------ | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Edit` | `review.yaml.njk` | `Link` to `-edit` | Renders iff `page_ids.edit` is defined (i.e. edit verb in this app's access list). Lets reviewers round-trip back to the edit page for small fixes without bouncing the action back to the assignee via `request_changes`. |

The `Edit` button targets `page_ids.edit` with `input: { skip_status_redirect: true }` so the edit page's stale-URL guard (allowlist `[action-required, in-progress, changes-required]`) doesn't immediately redirect away when the action is sitting in `in-review`.

#### Chrome and visibility overrides

Authors override per-button chrome via `pages.{verb}.buttons.{name}.*` on the action YAML. Part 12's resolver lifts the whole `pages.{verb}` slice into `page_config`, so templates read `_var: page_config.buttons.{name}.{knob}`. Defaults apply when the author hasn't set the knob.

| Knob       | Type          | Default     | Buttons it applies to                                                                | Effect                                                                                                                                                                                                |
| ---------- | ------------- | ----------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visible`  | boolean       | see render rule above | every interaction button + `Edit`                                          | Hides the button when `false`. Composed with `_state.action_allowed === true` on interaction buttons. For `not_required` the default is `false` (opt-in); for everything else `true`.                  |
| `disabled` | boolean       | `false`     | every interaction button + `Edit`                                                    | Greys the button out without removing it from the layout — for "show but block until precondition" UX (contrast with `visible: false` which removes it entirely).                                       |
| `title`    | string        | per-button  | `resolve_error` (error-page `submit`) — the one button whose copy varies per app    | Overrides the button label. v0 parity: only the error page exposes this; the other interaction buttons have fixed labels (Submit, Mark Not Required, Approve, Request Changes, Edit) for consistency. |
| `modal`    | object / null | `null`      | `submit_edit`, `not_required`, `resolve_error`                                       | When present, opens a confirm modal before firing. Shape: `{ title?: string, content?: string }`. v0 parity for `edit.buttons.submit.modal` + `edit.buttons.not_required.modal` + `error.buttons.submit.modal`. Approve and request_changes have their own dedicated modals; `Edit` is a pure link with no confirm step. |

### `not_required` opt-in

`not_required` is the one button in the vocabulary that's per-action opt-in. It lives only on `edit.yaml.njk` — view is a read-only surface, and adding a write button there contradicts that contract. Authors who want it on their edit page declare:

```yaml
pages:
  edit:
    buttons:
      not_required:
        visible: true
```

The template reads `_var: page_config.buttons.not_required.visible` (default `false`). When `true`, the button renders alongside `submit_edit` and is additionally gated on `_state.action_allowed === true` and on the action's current stage being non-terminal (priority > 0 in `global.action_statuses` — `not-required` itself has priority 0, so the button hides once the action is already in that stage).

### Button payload

Every interaction button posts the same payload shape to `update-action-{action_type}`. The button block builds it from page state; nothing about the assembly is per-action.

```yaml
payload:
  action_id:    { _request: get_action._id }
  interaction:  <fixed string per button — see vocabulary table>
  current_key:  { _request: get_action.key }
  form:         { _state: form }
  form_review:  { _state: form_review }
  fields:       { _state: fields }
  comment:      { _state: comment }
```

State-path conventions (per the CLAUDE.md rule "Input block IDs match data paths"):

- **Universal fields**: input block IDs are `fields.assignees`, `fields.due_date`, `fields.description`. Inputs auto-bind to `_state.fields.*`; the button reads `_state: fields` as a single subtree.
- **Form fields** (from `makeActionsForm` substitution): the resolver emits input blocks under the `form.*` namespace, so the button reads `_state: form`.
- **Form-review fields**: same pattern under `_state.form_review`.
- **Comment**: optional. The comment input's ID is `comment` (a top-level scalar in state — not nested under `event.metadata.*`). The button sends it as a top-level `comment` field; mapping into the engine-emitted event's `metadata.comment` is the API's job, not the template's. See part 13's "Comment mapping" for the resolver-side wiring.

Task action `submit_edit` adds one extra field — `current_status: { _state: status }` — because the task-edit page surfaces a status selector. Form actions never send `current_status`; the engine resolves the target stage from `action.interactions[interaction].status` or the engine default per [submit-pipeline spec § Interaction → target status](../../../workflows-module-concept/submit-pipeline/spec.md#interaction--target-status).

### Page-event vocabulary

The button-fired handlers (`onSubmit`, `onApprove`, `onRequestChanges`) appear in the button-vocabulary table above under "Author event handler fired" — they're wired to the buttons, fire once per click before the engine call.

The one handler not tied to a button is **`onMount`** — runs on every template after the fixed onMount sequence (action-id guard → get_action → stale-URL guard → get_workflow → get_entity → action_role_check → SetState) completes. This is the author's hook for any page-state work that depends on the loaded action/workflow/entity context. See "Template `onMount` sequence" above for the full ordering — the author's `page_config.events.onMount` is step 8 (the tail).

Authors declare handlers via `pages.{verb}.events.{handler}` on the action YAML; the resolver in [part 4](../04-workflow-config-schema/design.md) accepts the field and the template wires it in.

### Layout-module composition

- **Top-level block of each `.yaml.njk` template is a single `_ref: { module: layout, component: page }`** — not a `PageHeaderMenu` or any other hard-coded page-block type. The host app picks the page-block variant (`PageHeaderMenu` / `PageSiderMenu` / `PageSidebarLayout`) by setting the layout module's `page_type` var; module-shipped pages adopt whichever variant the host configured. Don't hard-code a page-block type inside the template.
- Content (universal-fields band + form body + form-review body + comment + author-supplied `formHeader` / `formFooter`) wrapped in `_ref: { module: layout, component: card }` (the form card).
- Buttons composed via `_ref: { module: layout, component: floating-actions }` (sticky bottom bar).
- Hard dependency on `layout` declared in module manifest by [part 20](../20-module-manifest/design.md).

### Block ordering inside `layout.card`

Fixed top-to-bottom order inside each template's main content area:

1. `page_config.title` (if set).
2. `page_config.formHeader` (author-supplied blocks above the form).
3. **Universal-fields band** (part 24's component, `mode: edit` on `edit.yaml.njk` / `display` elsewhere).
4. Form body (`makeActionsForm` substitution against `action_config.form`).
5. Form-review body (`review.yaml.njk` only — `makeActionsForm` against `action_config.form_review`).
6. Optional comment input (`edit`, `review`, `error`).
7. `page_config.formFooter` (author-supplied blocks below the form).
8. Floating-actions button bar (`layout.floating-actions`).

The button bar is outside `layout.card` — it composes via `layout.floating-actions` as a sticky bottom region. The order above covers the card-interior content only.

#### Outer-card suppression (v0 parity)

`edit.yaml.njk` and `error.yaml.njk` wrap the card-interior content in `_ref: { module: layout, component: card }` by default. When the form's first entry owns its own outer visual chrome, the outer `layout.card` is suppressed to avoid the double-card nesting v0 also guards against.

**Rule (v0 parity):** at Nunjucks render time, inspect `action_config.form[0]?.form`. If truthy (the first entry declares a sub-form via the `form:` slot — i.e. it's a structural component like `section`, `controlled_list`, `label`, or `file_upload` that owns its own outer chrome), drop the outer `layout.card` and let the form body render directly inside `layout.page`. If falsy, wrap normally.

This is the same heuristic v0 used (`!vars.form[0]?.form` in [`dist/.../makeActionsForm.js:12`](../../../../dist/workflows-module/ui/current_workflow_utils/resolvers/makeActionsForm.js)). The heuristic is imperfect — `box` declares `form:` (per part 15's sub-form-var allowlist) but emits a transparent `Box`, so a `box`-first form will incorrectly suppress the outer card. v1 accepts this v0 behavior verbatim to keep app migrations clean. Authors who hit it work around by leading their form with a non-`box` entry. A property-based replacement (per-component `owns_outer_chrome` flag) is a later improvement.

This applies to `edit.yaml.njk` and `error.yaml.njk` only — `view.yaml.njk` and `review.yaml.njk` use `DataView` / read-only rendering with their own composition (see finding #12 resolution).

### Per-action page chrome overrides

Authors customize per-verb page chrome via `pages.{verb}.*` on the action YAML. Part 12 lifts the matching slice to a top-level `page_config` template var (see [part 12 design.md](../12-resolver-pages/design.md) — the per-verb chrome is **not** duplicated under `action_config.pages`). Templates read off `page_config.*`:

- `page_config.title`, `page_config.requests`, `page_config.events`, `page_config.formHeader`, `page_config.formFooter`, `page_config.modals.{name}`, `page_config.maxWidth` pass through into the rendered page YAML.
- `page_config.buttons.{name}.*` controls per-button chrome and visibility — see "Chrome and visibility overrides" in the button-vocabulary section above for the full table.

## Out of scope / deferred

- **Per-action template overrides (custom `.yaml.njk`)** — v1 doesn't support. Deferred; revisit if real apps need it.
- **Shared task pages and `workflow-overview`** → [part 17](../17-shared-pages/design.md).
- **Entity-page components** → [part 18](../18-entity-components/design.md).

## Depends on

[Part 12](../12-resolver-pages/design.md), [part 13](../13-resolver-apis/design.md), [part 15](../15-resolver-form-builder/design.md), [part 18](../18-entity-components/design.md) (`action_role_check` primitive), [part 24](../24-universal-fields/design.md) (universal-fields component). Functionally also needs the engine path ([parts 6–10](../06-submit-action-writes/design.md)) live for end-to-end testing, but templates can ship before with stub responses.

## Verification

- Render the worked-example onboarding workflow in the demo app:
  - `workflows/onboarding-qualify-edit` renders form + submit button; clicking it fires the page event, calls the endpoint, re-renders.
  - `workflows/onboarding-send-quote-review` renders read-only form + writable review fields + approve/request-changes buttons.
  - For a fixture that opts into the `-error` page, the stale-URL guard fires correctly.
- **Outer-card suppression rule (v0 parity).** `edit.yaml.njk` and `error.yaml.njk` render `_ref: { module: layout, component: card }` around the card-interior content by default, and suppress the outer card when `action_config.form[0]?.form` is truthy (matches v0's `!vars.form[0]?.form` at [`dist/.../makeActionsForm.js:12`](../../../../dist/workflows-module/ui/current_workflow_utils/resolvers/makeActionsForm.js)). Verify with two fixtures: (a) a form starting with `text_input` (no `form:` slot) — outer card renders. (b) a form starting with `section` (has `form:`) — outer card suppressed; the section's own inner Card provides the visual framing. Card chrome itself (shadow, gutter, padding) comes from the host app's layout-module composition — no v0 token parity here; that's the layout module's concern, not part 16's.
- **Manual a11y pass.** Most of the a11y baseline is inherited from Lowdefy's Ant Design–backed blocks: inputs render `<label>` + `aria-required` / `aria-invalid` from Lowdefy's `required` / `validate` props, buttons render real `<button>` with `disabled` / `aria-disabled`, modals trap focus and restore on close (`role="dialog"`, `aria-modal="true"`), keyboard tab order follows DOM. Don't re-litigate any of that here. The template-level checks worth running by hand:
  - Required-field visible indicator (asterisk) renders for required inputs — verifies Lowdefy's `required: true` is mapped to Ant Design's `Form.Item required`.
  - The submit button conveys *why* it's disabled when blocked (e.g. tooltip, hint text, or a state-based error message). A `disabled` button alone leaves the user guessing; the form needs to surface the precondition.
  - End-to-end keyboard flow: tab from form → universal fields → form body → comment → buttons; pressing Enter on submit opens the confirm modal (if configured); focus lands inside the modal; closing the modal returns focus to the submit button. Modal-trap is Ant Design's job, but the round-trip across `layout.floating-actions` + modal + form is composition this part owns.
  - Sticky button-bar (`layout.floating-actions`, an `Affix` block) doesn't reorder the tab sequence relative to the form below it.

  No automated a11y assertions here — that belongs in part 22's e2e suite if it lands. Part 16's verification is unit-tests + this manual sweep.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is the demo-app render checks + outer-card suppression fixtures + manual a11y sweep above — no unit-tests (templates are YAML, not JS) and no handler-level integration (the engine path is exercised end-to-end via part 22).

## Open questions

_(None — both prior open questions resolved inline in the design body: `form_review` ordering committed to the review-template description above; `not_required` removed from view template entirely and gated by stage priority on edit per "`not_required` opt-in".)_

## Contract to neighbours

- **Part 13** emits the endpoints these templates call.
- **Part 18** uses the same button-vocabulary contract for entity-page rendering.
