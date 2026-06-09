# Task 10: Rewrite the action detail surfaces to consume server-resolved access + buttons

## Context

The action detail surfaces compute access + button visibility client-side today:

- **Static detail pages** (`pages/workflow-action-view.yaml`,
  `workflow-action-edit.yaml`, `workflow-action-review.yaml`) run
  `_ref: components/action_role_check.yaml` in `onMount` to write
  `_state.action_allowed`, then read `_state: action_allowed.{verb}` to gate
  buttons / nav links.
- **Form templates** (`templates/edit.yaml.njk`, `view.yaml.njk`,
  `review.yaml.njk`, `error.yaml.njk`) bake a three-term AND on each signal
  button:
  1. `page_config.buttons.{signal}.visible` (author runtime operator — D5 layer 2),
  2. `_array.includes` of `enums/button_signal_sources.yaml` `_ref` for the
     signal vs `action.status.0.stage` (FSM source-stage — layer 1),
  3. `_eq: [_state: action_allowed.{verb}, true]` (verb gate — layer 1).

After tasks 5 + 7, the detail request is renamed `get_action` →
`get_workflow_action` and routes to `GetWorkflowAction`, returning a **single
envelope** with resolved `allowed` (per-verb bag), `buttons` (per-signal
booleans = layer-1 AND of FSM stage × verb gate × `allow_not_required`), **and
the submitted form-field values** (read from the parent workflow's `form_data`
slice — task 5). The surfaces must collapse layers 1+2: render
`action.buttons.{signal}` (server) ANDed with the retained author operators
`page_config.buttons.{signal}.{visible, disabled}` (D5). They also read the
submitted **values** off this one response, retiring the separate
`get_workflow` request the templates fire today.

## Task

**1. Request rename + shape (array → object).** The request is renamed
`get_action` → `get_workflow_action` (task 7) and `GetWorkflowAction` returns one
object, not an array. Audit every `_request: get_action.0` / `_request:
get_action.N` and `set_action` read and change to `_request: get_workflow_action`
(object form, no `.0`). The view page already reads `_request: get_action.title`
(object-style) — rename it too and confirm consistency across view/edit/review
templates and pages.

**1b. Drop the `get_workflow` second read; read form values off
`get_workflow_action` (D8 / review-4).** All four templates render submitted form
data from a separate request `get_workflow` today — `get_workflow.form_data.{type}`
(`edit.yaml.njk:36,83–100`, `view.yaml.njk:38,69–89`, `review.yaml.njk:36,76–98`,
`error.yaml.njk:37,76–93`). `GetWorkflowAction` now returns this action's
form-field values in its envelope (task 5's parent-workflow read), so:

- Remove the `get_workflow` request step / `onMount` call from all four templates.
- Repoint every `get_workflow.form_data.{type}(.key)` read at the
  `get_workflow_action` response's form-field-values slice (object form).
- **Delete `modules/workflows/requests/get_workflow.yaml`** — its only consumers
  are these templates, and it is itself an ungated raw `$match` on the workflows
  collection (removing it closes a second open read on the detail path).

**2. Drop the client mirror.** Remove the `onMount` step
`_ref: components/action_role_check.yaml` from all three static detail pages and
all four templates. Anywhere a surface reads `_state: action_allowed.{verb}`,
read the response field instead: `_state: action.allowed.{verb}` (after
`set_action`) or `_request: get_workflow_action.allowed.{verb}`.

**3. Rewrite the form-template button bars** (`edit`/`view`/`review`/`error`
`.njk`). For each signal button, replace the FSM-`_array.includes` term **and**
the `action_allowed` term with the single server boolean
`_state: action.buttons.{signal}`, ANDed with the retained author
`page_config.buttons.{signal}.visible` (layer 2). Keep the `disabled` operator
reading `page_config.buttons.{signal}.disabled` unchanged. So e.g. the Submit
button `visible` becomes:

```yaml
visible:
  _and:
    - _var:
        key: page_config.buttons.submit.visible
        default: true
    - _state: action.buttons.submit
```

Apply to every signal button across the four templates:
`submit`, `progress`, `not_required` (edit), `approve`, `request_changes`
(review), `resolve_error` (error). Remove the
`_ref: enums/button_signal_sources.yaml` blocks from these button bars.

**4. `not_required` opt-in flip (D5 / Part 40 D3 alignment).** Change the
`page_config.buttons.not_required.visible` default from `false` to `true`
(opt-out) in the edit template — the single opt-in for showing/submitting
`not_required` is now the layer-1 root `allow_not_required` (resolved into
`action.buttons.not_required` by the engine). Any form action that today shows
the button via `page_config.buttons.not_required.visible: true` must get
`allow_not_required: true` added to its config (none exist in this repo's demo;
the rule covers consumer apps — document it, see task 12 README note).

**5. Nav links (Edit-link, etc.).** Where templates/pages gate a navigation
`Link` on `action_allowed.{verb}`, switch to `action.allowed.{verb}`. (Some Edit
nav links are _not_ gated on access today — comments in `view.yaml.njk:145` /
`review.yaml.njk:192` — leave those ungated.)

**6. Delete the client mirror artifacts:**

- `modules/workflows/components/action_role_check.yaml`
- `modules/workflows/components/evaluateVerbGate.js` (+ `evaluateVerbGate.test.js`)
- the `action_role_check` component export in `module.lowdefy.yaml`.

(`enums/button_signal_sources.yaml` itself: the build-time `_ref` is removed from
the templates here; whether the enum **file** survives — it does if the engine
reads it server-side per task 2 — is decided in task 2 / cleaned in task 12.)

## Acceptance Criteria

- No surface runs `action_role_check.yaml` or reads `_state: action_allowed.*`.
- No form-template button bar references `enums/button_signal_sources.yaml` or
  re-computes the FSM-stage / verb-gate AND — each signal button is
  `page_config.buttons.{signal}.visible AND action.buttons.{signal}`.
- The detail request is read as `_request: get_workflow_action` (single object,
  no `.0`) everywhere; no `_request: get_action` reads remain.
- No template fires the `get_workflow` request; submitted form values render from
  the `get_workflow_action` envelope; `requests/get_workflow.yaml` is deleted and
  unreferenced.
- `not_required` button defaults to visible (opt-out), gated by the engine's
  `action.buttons.not_required` (which honors `allow_not_required`).
- `action_role_check.yaml` + `evaluateVerbGate.js` (+ test) are deleted and
  unreferenced; manifest export removed.
- `pnpm ldf:b` builds; an action detail page renders the correct buttons for a
  user with/without the gating role and for the action's stage.

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — button-bar AND rewrite; `not_required` default flip; drop mirror + FSM `_ref`; drop `get_workflow` step + read form values off `get_workflow_action`; rename + object-shape reads.
- `modules/workflows/templates/view.yaml.njk` — modify — same.
- `modules/workflows/templates/review.yaml.njk` — modify — same.
- `modules/workflows/templates/error.yaml.njk` — modify — same.
- `modules/workflows/requests/get_workflow.yaml` — delete — subsumed by `GetWorkflowAction`'s parent-workflow read.
- `modules/workflows/pages/workflow-action-view.yaml` — modify — drop `action_role_check`; read `allowed` from response; object-shape reads.
- `modules/workflows/pages/workflow-action-edit.yaml` — modify — same.
- `modules/workflows/pages/workflow-action-review.yaml` — modify — same.
- `modules/workflows/components/action_role_check.yaml` — delete.
- `modules/workflows/components/evaluateVerbGate.js` — delete.
- `modules/workflows/components/evaluateVerbGate.test.js` — delete.
- `modules/workflows/module.lowdefy.yaml` — modify — remove `action_role_check` component export.

## Notes

- The form `.visible`/`.disabled` author operators **stay baked** — they may be
  runtime operators the server can't evaluate (e.g. _disable Submit until the
  form validates_). Do not fold them into the server boolean (D5 explicitly
  corrects an earlier draft that did this — it would flatten a runtime operator
  to a dead boolean).
- `gates.fixtures.js` is still used by task 2's tests — do not delete it when
  removing `evaluateVerbGate.test.js`.
- The static check pages now get their signal buttons from `action.buttons`
  (layer 1 only) — but the **check surface button bars** themselves are Part 40
  work (paused, depends on this part). Here just ensure the detail pages read
  `allowed`/`buttons` off the response and drop the mirror; do not build new
  check button bars.
