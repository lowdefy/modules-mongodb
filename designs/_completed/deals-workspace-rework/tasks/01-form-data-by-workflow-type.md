# Task 1: Key `get_selected_deal`'s workflow form data by workflow type

## Context

`modules/deals/requests/get_selected_deal.yaml` loads the selected deal for the deals workspace
page. Near the end of its pipeline it joins the `workflows` collection and aliases that workflow's
`form_data` onto a field named `workflows`, so host-injected tiles and host `request_stages` can
read values captured in workflow forms — e.g. `workflows.volumes.annual_volume_ton`.

Today that join is scoped to exactly one workflow:

```yaml
- $lookup:
    from: workflows
    let:
      deal_id: $_id
    as: workflow
    pipeline:
      - $match:
          $expr:
            $and:
              - $eq: [$entity.connection_id, { _module.var: entity_connection_id }]
              - $eq: [$entity.id, $$deal_id]
              - $eq: [$workflow_type, { _module.var: workflow_type }]   # ← scoping
      - $limit: 1                                                       # ← scoping
      - $project:
          form_data: 1
- $addFields:
    workflows:
      $first: $workflow.form_data
- $unset: workflow
```

That is fine while a deal carries one workflow. A host is splitting its pipeline into two chained
workflows, after which anything reading the second workflow's form data resolves to null and falls
back **without erroring** — a silent wrong value, not a crash.

The fix is to join all of the deal's workflows and key the result by workflow type. A flat merge
keyed by action type was considered and rejected: the workflow engine enforces action-type
uniqueness only *within* a workflow (`modules/workflows/resolvers/makeWorkflowsConfig.js:930` hard-errors
on a duplicate) and namespaces by workflow type everywhere across them, so cross-workflow reuse is
legal config that a flat merge would silently truncate.

## Interfaces

- **Produces:** the read shape `workflows.{workflow_type}.{action_type}.{field}` on
  `get_selected_deal`'s result — replacing `workflows.{action_type}.{field}`. Task 8's changeset
  documents this for consumers; no other task in this repo consumes it.

## Task

**1. Restructure the `$lookup` in `modules/deals/requests/get_selected_deal.yaml`.**

- Remove the `$eq: [$workflow_type, …]` clause from the `$match`. Keep both `entity` clauses —
  matching `entity.connection_id` *and* `entity.id` is what keeps the
  `{entity.connection_id, entity.id}` index in play, as the existing comment above the stage notes.
- Remove the `$limit: 1`.
- Add `workflow_type: 1` to the `$project` alongside `form_data: 1`.

**2. Replace the `$addFields` that builds `workflows`** with an `$arrayToObject` over the joined
array, keyed by each workflow's type:

```yaml
- $addFields:
    workflows:
      $arrayToObject:
        $map:
          input: $workflow
          as: w
          in:
            k: $$w.workflow_type
            v: $$w.form_data
```

Keep the `$unset: workflow` that follows.

**3. Update the explanatory comment above the stage.** It currently says form data is looked up for
"the deal's workflow (module `workflow_type` var)". It should say all of the deal's workflows are
joined and keyed by workflow type, and that the `entity` match is retained for the index.

**4. Leave the `workflow_type` module var alone.** It is still used by other surfaces (the outcome
modal's `get-entity-workflows` payloads, other requests). This task removes only *this* request's
dependence on it.

**5. Document the shape in `docs/deals/index.md`.** That file is hand-maintained (no GENERATED
marker) and currently doesn't describe the workflow form-data alias at all. Add a short subsection
stating that `get_selected_deal` exposes `workflows.{workflow_type}.{action_type}.{field}`, that all
of the deal's workflows are included, and that host `request_stages` and injected tiles read through
this shape. Do **not** touch `docs/deals/reference/vars.md` — it is generated.

## Acceptance Criteria

- `get_selected_deal.yaml` no longer references `_module.var: workflow_type` and has no `$limit: 1`
  in the workflows `$lookup`.
- Both `entity.connection_id` and `entity.id` are still matched.
- `pnpm ldf:b` from `apps/demo` compiles cleanly.
- A deal carrying two workflows yields both under their own keys; a deal carrying one yields a
  single key. Verify by inspecting the built pipeline in
  `apps/demo/.lowdefy/server/build/pages/**` for the deals view page — confirm the `$arrayToObject`
  stage is present and no `workflow_type` equality remains in that `$lookup`.
- `docs/deals/index.md` describes the new shape.

## Files

- `modules/deals/requests/get_selected_deal.yaml` — modify — unscope the workflows `$lookup`, key form data by workflow type, update the comment.
- `docs/deals/index.md` — modify — document the `workflows.{workflow_type}.{action}.{field}` read shape.

## Notes

- **This is a breaking change for consumers.** Any host reading `workflows.{action}.{field}` must add
  the workflow-type key. Task 8's changeset must carry an explicit `**Breaking (config):**` note.
- `$arrayToObject` requires string keys that contain no `.` and don't start with `$`. Workflow types
  are kebab-case slugs, so they are safe; no guard is needed.
- A workflow whose `form_data` is absent yields a null value under its key. That is acceptable — a
  read through it resolves to null exactly as a missing action would today.
- Do not also change the related-deals `$limit` in this file; that is task 2, which depends on this
  one precisely because it edits the same file.
