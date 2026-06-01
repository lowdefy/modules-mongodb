# Task 3: Create the `resolve_action_link.yaml` shared stage

## Context

Post-Part 38, an action doc no longer carries a single `<app_name>.link`. It
carries a **per-verb map** `action.<app_name>.links: { view, edit, review, error }`,
each cell a `{ pageId, urlQuery, title }` link object or `null` (null where the
slug doesn't declare the verb, or the stage has no page). Some read-side consumer
must collapse that map to the single link a surface renders. Part 42 D5 decides
this happens **server-side, once, for every surface** — in a shared aggregation
stage — so the timeline card, the entity widget, the workflow overview, and the
group overview all render an identical, access-correct link.

The selection rule accounts for **two** dimensions:
- **State** — a cell is `null` where the stage doesn't offer that verb (e.g. a
  `done` action has `edit`/`review`/`error` = `null`, so it resolves to `view`).
  Selection must skip `null` cells.
- **Access** — per-verb role gates are **not** in the map; they live in
  `visible_verbs` (computed by the sibling `visible_verbs.yaml` stage). A naive
  pick could surface an `edit` link to a view-only user, so selection must also
  require the verb to be true in `visible_verbs`.

Result: `link` = the highest-priority verb (`edit > review > error > view`) whose
cell is **both** non-`null` **and** true in `visible_verbs`, else `null`.

This stage **must run after** a `visible_verbs` compute stage (it reads
`$visible_verbs`). It is parameterized by `_var: app_name` (same convention as the
parameterized `visible_verbs.yaml` from Task 2), supplied by each consumer's `_ref`.

## Task

Create `modules/shared/workflow/resolve_action_link.yaml` — a single `$addFields`
stage. Sketch (adapted from design D5, using `_var: app_name`; the project style
prefers YAML block sequences over inline flow for logical operators):

```yaml
# Shared `resolve_action_link` stage (Part 42 D5).
#
# Collapses the per-verb `links` map (Part 38 / Part 34 D7) to the single
# access-aware `link` a surface renders. Highest-priority verb
# (edit > review > error > view) whose cell is BOTH non-null (state) AND true in
# `$visible_verbs` (access); else null.
#
# Parameter: `_var: app_name` — supplied by each consumer's `_ref` vars (the
# timeline fragment, and the three read APIs). MUST run AFTER a `visible_verbs`
# compute stage (it reads `$visible_verbs`). Single-stage object on purpose
# (Lowdefy `_ref` substitutes a node in place; bundling stages would nest).
$addFields:
  link:
    $let:
      vars:
        v:
          $getField:
            field: links
            input:
              $getField:
                field:
                  _var: app_name
                input: $$ROOT
        vv: $visible_verbs
      in:
        $switch:
          branches:
            - case:
                $and:
                  - $$vv.edit
                  - $ne:
                      - $$v.edit
                      - null
              then: $$v.edit
            - case:
                $and:
                  - $$vv.review
                  - $ne:
                      - $$v.review
                      - null
              then: $$v.review
            - case:
                $and:
                  - $$vv.error
                  - $ne:
                      - $$v.error
                      - null
              then: $$v.error
            - case:
                $and:
                  - $$vv.view
                  - $ne:
                      - $$v.view
                      - null
              then: $$v.view
          default: null
```

## Acceptance Criteria

- `modules/shared/workflow/resolve_action_link.yaml` exists as a single
  `$addFields` stage using `_var: app_name`.
- The priority order is `edit > review > error > view`; each branch requires both
  `visible_verbs.<verb>` truthy and the matching `links.<verb>` cell `!= null`;
  the default is `null`.
- The Lowdefy build parses the file without `_ref`/operator errors (it is consumed
  by Tasks 4 and 5; standalone it just needs to parse).

## Files

- `modules/shared/workflow/resolve_action_link.yaml` — **create**.

## Notes

- The map cells already carry render-ready `urlQuery` (`action_id` for
  simple/form, `workflow_id` for tracker — Part 38). This stage does no
  substitution; it only picks one cell.
- Keep it a single stage object (not a list). Lowdefy `_ref` substitutes a node in
  place; a multi-stage list `_ref`'d mid-pipeline nests instead of flattening
  (the same reason `visible_verbs` compute + drop are two separate refs).
