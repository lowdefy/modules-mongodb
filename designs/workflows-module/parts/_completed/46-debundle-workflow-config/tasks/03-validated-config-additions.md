# Task 3: Add `title`, `form_meta`, and `allow_not_required` to the validated config

## Context

The connection's validated config (`workflowsConfig`) is produced by
`modules/workflows/resolvers/makeWorkflowsConfig.js`, which `pick()`s
`WORKFLOW_FIELDS` per workflow and `ACTION_FIELDS` per action. It is server-side
only and already pruned (no forms/hooks/events). The read methods (tasks 4–5)
need three additions on this config (D5, "Validated config additions"):

1. **`title`** — workflow-level display string. Today it is read client-side via
   `components/workflows_config.yaml` (a `{ type: { title } }` map). Add `title`
   to `WORKFLOW_FIELDS` so it rides the validated config.

2. **`form_meta`** — per-form-action form-field metadata. Today computed by
   `modules/workflows/resolvers/makeActionFormConfigs.js` (keyed by `action.type`,
   cross-workflow collision-prone) and read by the overview pages via
   `components/action_form_configs.yaml`. Move that projection **into**
   `makeWorkflowsConfig` so it lands on each validated action as `form_meta`.
   Because `pick(action, ACTION_FIELDS)` already runs per-workflow per-action,
   `form_meta` lands on the right action with no global keying — this dissolves
   the cross-workflow `action.type` collision.

3. **`allow_not_required`** — an action-root boolean, **every kind (form +
   check)**, **default `false`** (opt-in; preserves Part 39 D3's safety
   rationale). Validate it here (moved from Part 40). It is read by
   `GetWorkflowAction` (task 5) as the layer-1 `not_required` button term and
   enforced as a server-side load-gate (task 5).

`makeActionFormConfigs.js`'s projection walks the form arrays emitting
`{ component, key, required, title, validate }` per node, recursing into
structural components (`controlled_list`, `section`, `box`, `label`,
`file_upload`), over `form` / `form_review` / `form_error`. Reproduce this
exactly — it feeds the overview pages' inline submitted-data rendering.

## Task

In `modules/workflows/resolvers/makeWorkflowsConfig.js`:

**1. `title`** — add `'title'` to `WORKFLOW_FIELDS`. (No validation needed; it
flows through `pick`.)

**2. `form_meta`** — port the `makeActionFormConfigs` projection into this
resolver. Add the `STRUCTURAL_COMPONENTS` / `METADATA_FIELDS` constants and the
`pickMetadata` / `toMetadataNode` / `describeForm` helpers (copy from
`makeActionFormConfigs.js`). For each `form`-kind action, compute
`{ form, form_review?, form_error? }` from the **raw** action (the resolver has
the raw `workflow.actions[]` before pruning) and attach it as `form_meta` on the
picked action object. Non-form actions get no `form_meta`.

Concretely, in `makeWorkflowsConfig`'s action map, after `pick(action,
ACTION_FIELDS)`, add `form_meta` when `action.kind === 'form'`:

```js
const picked = pick(action, ACTION_FIELDS);
if (action.kind === "form") {
  picked.form_meta = {
    form: describeForm(action.form),
    ...(action.form_review
      ? { form_review: describeForm(action.form_review) }
      : {}),
    ...(action.form_error
      ? { form_error: describeForm(action.form_error) }
      : {}),
  };
}
return picked;
```

**3. `allow_not_required`** — add `'allow_not_required'` to `ACTION_FIELDS` so it
rides the config, defaulting to `false` when absent (set it explicitly on the
picked action: `picked.allow_not_required = action.allow_not_required === true;`).
Add a validation in `validateAction`: if present it must be a boolean
(`fail(...)` otherwise). It is valid for **every** kind.

## Acceptance Criteria

- `WORKFLOW_FIELDS` includes `title`; validated workflows carry `title`.
- Each `form`-kind validated action carries `form_meta` matching what
  `makeActionFormConfigs.js` produced for that action (verify against a fixture
  identical to a `makeActionFormConfigs.test.js` case).
- Every validated action carries `allow_not_required` (boolean, default `false`);
  a non-boolean `allow_not_required` in source YAML hard-errors with a
  `makeWorkflowsConfig:` message.
- `makeWorkflowsConfig.test.js` updated and green; add cases for `title`,
  `form_meta`, and `allow_not_required` validation/defaulting.
- `pnpm --filter @lowdefy/workflows test` (or the repo's resolver test runner)
  passes.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — add `title`, port `form_meta`, validate + default `allow_not_required`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — cover the three additions.

## Notes

- No `schema.js` change is needed for these — `workflowsConfig.items` is
  `additionalProperties: true` at both workflow and action level
  (`schema.js:87,:100`), so `title` / `form_meta` / `allow_not_required` validate
  as-is. (The `user` / `entities` schema work is task 1.)
- Do **not** delete `makeActionFormConfigs.js` or `action_form_configs.yaml`
  here — the overview pages still consume them until task 8. They are deleted
  in task 8.
- The Part 40 doc-persist-of-`allow_not_required`-for-display is dropped as
  redundant — `GetWorkflowAction` reads the flag from live config (task 5). Do
  not add any doc-write of this flag.
