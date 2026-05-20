# Part 16 — Form-action page templates

**Source rationale:** [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md), [workflows-module-concept/submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md). **Layer:** UI delivery. **Size:** M. **Repo:** `modules/workflows/templates/`.

## Goal

Ship the four Nunjucks page templates that [part 12 (`makeActionPages`)](../12-resolver-pages/design.md) references. Each template provides page chrome (via the `layout` module), the universal-fields block, the form body (via [part 15](../15-resolver-form-builder/design.md)), and the button vocabulary wired to call the per-action endpoint from [part 13](../13-resolver-apis/design.md) with the matching `interaction` value.

## In scope

### Four templates

- **`templates/edit.yaml.njk`** — edit form.
  - Universal-fields block (`assignees`, `due_date`, `description` inputs).
  - Form body via `_ref: { resolver: makeActionsForm.js, vars: { form: <action_config.form> } }` (per [part 15](../15-resolver-form-builder/design.md)'s "Two emission paths" decision — option B). `global.action_form_configs` is metadata-only and not used for the form body.
  - Optional comment field.
  - Template-shipped `submit_edit` button (and optionally `not_required` if `view` is also in the access list).

- **`templates/view.yaml.njk`** — read-only view.
  - Universal-fields display.
  - Form body rendered read-only.
  - Optional `not_required` button when access allows.

- **`templates/review.yaml.njk`** — review surface.
  - Read-only main form display.
  - Writable `form_review` block via `_ref: { resolver: makeActionsForm.js, vars: { form: <action_config.form_review> } }` — same option-B path as `edit`, just on the `form_review` slice from part 12's shell.
  - Template-shipped `approve` and `request_changes` buttons.
  - Optional comment field that flows through `event.metadata.comment`.

- **`templates/error.yaml.njk`** — recovery surface.
  - Stale-URL guard on `onMount`: redirect to `-view` when `status[0].stage !== 'error'`.
  - Failure-context banner reading `status[0].error_message` and `status[0].error_metadata` from the action doc.
  - Recovery form defaulting to `form:` or `form_error:` if declared.
  - Template-shipped `resolve_error` button.

### Button vocabulary (immutable, fixed across templates)

| Button            | Template          | Author event handler fired | `interaction` payload |
| ----------------- | ----------------- | -------------------------- | --------------------- |
| `submit_edit`     | `edit.yaml.njk`   | `onSubmit`                 | `submit_edit`         |
| `not_required`    | `view`/`edit`     | `onSubmit` (if on `edit`)  | `not_required`        |
| `resolve_error`   | `error.yaml.njk`  | `onSubmit`                 | `resolve_error`       |
| `approve`         | `review.yaml.njk` | `onApprove`                | `approve`             |
| `request_changes` | `review.yaml.njk` | `onRequestChanges`         | `request_changes`     |

Every button: (1) fires the matching `pages.{verb}.events.{handler}` author-supplied event for page-state work, then (2) calls `update-action-{action_type}` with the right `interaction` + `form` / `form_review` / `fields` / `current_key` payload.

### Page-event vocabulary

- `onMount` — every template.
- `onSubmit` — `edit.yaml.njk` + `error.yaml.njk`.
- `onApprove`, `onRequestChanges` — `review.yaml.njk`.

Authors declare handlers via `pages.{verb}.events.{handler}` on the action YAML; the resolver in [part 4](../04-workflow-config-schema/design.md) accepts the field and the template wires it in.

### Layout-module composition

- Page wrapped in `layout.page` (chrome from the layout module).
- Content wrapped in `layout.card` (form card).
- Buttons in `layout.floating-actions` (sticky bar).
- Hard dependency on `layout` declared in module manifest by [part 20](../20-module-manifest/design.md).

### Per-action template chrome overrides

- `pages.{verb}.title`, `pages.{verb}.requests`, `pages.{verb}.formHeader`, `pages.{verb}.formFooter`, `pages.{verb}.modals.{name}` pass through into the rendered page YAML.
- `pages.error.buttons.submit.{title, modal}` overrides the error-page resolve button.

## Out of scope / deferred

- **Per-action template overrides (custom `.yaml.njk`)** — v1 doesn't support. Concept marks as purely additive in v1.x.
- **Shared task pages and `workflow-overview`** → [part 17](../17-shared-pages/design.md).
- **Entity-page components** → [part 18](../18-entity-components/design.md).

## Depends on

[Part 12](../12-resolver-pages/design.md), [part 13](../13-resolver-apis/design.md), [part 15](../15-resolver-form-builder/design.md). Functionally also needs the engine path ([parts 6–10](../06-submit-action-writes/design.md)) live for end-to-end testing, but templates can ship before with stub responses.

## Verification

- Render the worked-example onboarding workflow in the demo app:
  - `workflows/onboarding-qualify-edit` renders form + submit button; clicking it fires the page event, calls the endpoint, re-renders.
  - `workflows/onboarding-send-quote-review` renders read-only form + writable review fields + approve/request-changes buttons.
  - For a fixture that opts into the `-error` page, the stale-URL guard fires correctly.
- **Form-card chrome parity with v0.** `edit.yaml.njk` and `error.yaml.njk` wrap the form body in `layout.card`. Verify visual parity against v0's inline-`Card` wrap (shadow `0px 5px 8px -3px rgba(0,0,0,0.1)`, `contentGutter: 12`, `contentJustify: start` — see [`dist/.../makeActionsForm.js:1-9`](../../../../dist/workflows-module/ui/current_workflow_utils/resolvers/makeActionsForm.js)) — either the layout-module card already matches, or document the divergence here. Also confirm the "suppress card when the first form entry owns its own outer chrome" rule (v0 condition: `!vars.form[0]?.form`) is either preserved or explicitly dropped with rationale.
- Manual a11y pass: keyboard nav reaches every button; form labels read.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **`form_review` merge order with `form`.** Read-only main form above, editable review fields below. Document the rendering order in the template.
- **`not_required` button visibility on view pages after terminal status.** Hide once terminal. Confirm against the `required_after_close` field semantics.

## Contract to neighbours

- **Part 13** emits the endpoints these templates call.
- **Part 18** uses the same button-vocabulary contract for entity-page rendering.
