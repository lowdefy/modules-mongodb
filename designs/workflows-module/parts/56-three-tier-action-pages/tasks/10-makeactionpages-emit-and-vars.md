# Task 10: makeActionPages — pass new template vars and emit the per-workflow check page

## Context

`modules/workflows/resolvers/makeActionPages.js` reads the **raw** workflows
config (`_module.var: workflows_config`) and emits the action pages, splicing
template `_ref`s into the module's `pages`. Today it emits **form** pages only
(`emitForAction` returns `[]` for non-form actions) — one `{workflow_type}-{action_type}-{verb}`
page per emitted verb, `_ref`ing `templates/{verb}.yaml.njk` with vars
`action_config`, `workflow_type`, `entity_collection`, `page_ids`, `page_config`.
`humanizeSlug` is already imported.

Part 56 needs two changes here, feeding the templates from Tasks 8 and 9:

1. Pass **new vars** to the form templates: the baked `workflow_title`, the
   `reference_field` (from `workflow.entity.ref_key`), and the baked
   `entity_view.slot` block array.
2. **Emit one `{workflow_type}-check` page** per workflow that has ≥1 `check`
   action, `_ref`ing the new `templates/check.yaml.njk` (Task 8).

## Task

1. **Resolve `workflow_title` once per workflow:** `workflow.title ??
humanizeSlug(workflow.type, titleAcronyms)` — used for the `type` eyebrow and
   the breadcrumb Workflow segment (kept in lock-step with `makeWorkflowsConfig`'s
   own title resolution).

2. **Form templates — pass the new vars.** In `emitForAction` (form branch),
   add to the `_ref` vars for each verb page:
   - `workflow_title` (resolved above)
   - `reference_field`: `workflow.entity.ref_key`
   - `entity_view_slot`: `workflow.entity_view?.slot ?? []` (baked block array;
     empty when the workflow declares no `entity_view`)
     (Keep the `action_config`, `workflow_type`, `entity_collection`, `page_ids`,
     `page_config` vars. The `entity_collection` var already reads
     `workflow.entity.collection` — **Part 57 updated that `:86` read** as part of
     nesting the authored shape; this task does not re-touch it. See Notes.)

3. **Emit the check page.** Restructure `makeActionPages` so that, per workflow,
   in addition to the form pages, it emits a single page when the workflow has at
   least one `kind: check` action:
   - `id`: `${workflow.type}-check`
   - `_ref.path`: `templates/check.yaml.njk`
   - `_ref.vars`: `workflow_type`, `entity_collection` (`workflow.entity.collection`),
     `reference_field` (`workflow.entity.ref_key`), `workflow_title`, `entity_view_slot`
     (`workflow.entity_view?.slot ?? []`), and the baked action title/label the
     check page needs for its header (resolve the check action's title the same
     way form action titles are resolved — `action.title ??
humanizeSlug(action.type)`). If a workflow has multiple check actions, still
     emit exactly **one** check page (it derives per `?action_id` at runtime).

4. **Update tests** (`makeActionPages.test.js`): assert check-page emission
   (one `{workflow_type}-check` per workflow with ≥1 check action; none when a
   workflow has no check action), `entity_view.slot` baking into the emitted
   vars (form + check), and the new form-template vars. Form-page emission for
   existing fixtures stays otherwise unchanged.

## Acceptance Criteria

- A workflow with ≥1 check action emits exactly one `{workflow_type}-check` page
  `_ref`ing `templates/check.yaml.njk` with the documented vars.
- A workflow with no check action emits no check page.
- Form pages now carry `workflow_title`, `reference_field`, and `entity_view_slot`
  vars; `entity_view.slot` is baked through to both form and check pages (or `[]`
  when absent).
- `pnpm jest` passes for `makeActionPages.test.js`.
- `pnpm ldf:b` compiles: the emitted check page resolves to the real
  `check.yaml.njk` and the form pages receive populated vars.

## Files

- `modules/workflows/resolvers/makeActionPages.js` — modify — resolve `workflow_title`; pass `workflow_title`/`reference_field`/`entity_view_slot` to form templates; emit `{workflow_type}-check`.
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — cover check-page emission + var baking.

## Notes

- `makeActionPages` reads the **raw** `workflows_config` module var (not
  `makeWorkflowsConfig`'s materialized output), so the **Part 57 nested `entity:`
  block** is what's present: `workflow.entity.collection`, `workflow.entity.ref_key`,
  and `workflow.entity_view` are read directly (the file's existing comments note
  it re-derives titles for this same raw-read reason).
- **Part 57 dependency.** Part 57 lands first and moves entity wiring into the
  nested `entity:` block. **Part 57 owns updating the existing
  `entity_collection: workflow.entity_collection` read at `makeActionPages.js:86`**
  to `workflow.entity.collection` (it is in Part 57's Files-changed). This task
  therefore assumes the nested read is already in place and only adds the new
  `workflow.entity.ref_key` / `workflow.entity_view` reads — no flat-shape
  compatibility shim (the two parts ship together).
- Depends on Task 8 (the `check.yaml.njk` template must exist) and Task 9 (the
  form templates must consume the new vars). The page id `{workflow_type}-check`
  must match the engine-link target from Task 2 exactly.
- The check page reuses the same `entity_collection` source as the form pages —
  `workflow.entity.collection` (nested, Part 57).
