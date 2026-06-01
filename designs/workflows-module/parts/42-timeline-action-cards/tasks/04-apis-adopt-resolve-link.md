# Task 4: Adopt `resolve_action_link.yaml` in the three read APIs

## Context

Three workflow read APIs project a single action `link`. Today each builds it
with `link: { _string.concat: ['$', { _module.var: app_name }, '.link'] }` —
referencing `<app_name>.link`, the **singular** field that Part 38 **deletes**
(replaced by the per-verb `<app_name>.links` map). Part 42 D5 replaces that
projection with the shared, access-aware `resolve_action_link.yaml` stage (Task 3),
so all three surfaces render the identical server-resolved link.

By the time this task runs:
- Task 2 has parameterized `visible_verbs.yaml` to `_var: app_name`, and each API
  already `_ref`s it (with `vars: { app_name: { _module.var: app_name } }`)
  followed by `_ref: api/stages/visible_verbs_filter.yaml`.
- Task 3 has created `resolve_action_link.yaml` (a `$addFields link:` reading
  `$visible_verbs`), parameterized by `_var: app_name`.

The stage must run **after** `visible_verbs_filter` (so `visible_verbs` exists on
the doc) and **before** the `$group`/`$project` that emits the action, so the
resolved `link` flows into the output.

The three APIs differ in shape — read each before editing:

- **`get-entity-workflows.yaml`** — inside the `$lookup.pipeline`: `visible_verbs`
  compute + filter, then `$addFields required_sort/sort`, `$sort`, then a `$group`
  whose `actions: { $push: { ..., link: <_string.concat> } }`.
- **`get-workflow-overview.yaml`** — projects `link` in an early `$addFields`
  (alongside `message`, `status`, `groupIndex`) *before* `visible_verbs`, then
  filter, `$sort`, `$project { groupIndex: 0 }`.
- **`get-action-group-overview.yaml`** — `visible_verbs` compute + filter,
  `$addFields required_sort/sort`, `$sort`, then a whitelist `$project` that emits
  `link: <_string.concat>`.

## Task

In each API:

1. **Insert** the link stage immediately after the `visible_verbs_filter.yaml`
   ref, passing the app name:

   ```yaml
   - _ref:
       path: ../shared/workflow/resolve_action_link.yaml
       vars:
         app_name:
           _module.var: app_name
   ```

2. **Remove the old singular `link` projection** and emit the resolved `$link`
   field instead:
   - `get-entity-workflows.yaml`: in the `$group … $push`, change
     `link: { _string.concat: ['$', { _module.var: app_name }, '.link'] }` to
     `link: $link`.
   - `get-workflow-overview.yaml`: delete the `link: { _string.concat: ... }` line
     from the early `$addFields` (it must not reference the deleted `.link`
     field). After the inserted `resolve_action_link` ref, `link` is already on
     the doc and survives the `$project { groupIndex: 0 }` (which only drops
     `groupIndex`), so nothing further is needed to carry it.
   - `get-action-group-overview.yaml`: in the whitelist `$project`, change
     `link: { _string.concat: ... }` to `link: 1` (carry the resolved field).

Leave `message`, `status`, `type`, `visible_verbs`, and all sort logic unchanged.

## Acceptance Criteria

- No API references `<app_name>.link` (the deleted singular field) anywhere;
  `grep -rn "'.link'\|\.link\b" modules/workflows/api` shows only `links`-map or
  resolved-`link` usage.
- Each API `_ref`s `resolve_action_link.yaml` (with `app_name` var) after
  `visible_verbs_filter.yaml` and before its action-emitting `$group`/`$project`.
- The resolved `link` field reaches the API response for all three
  (`get-entity-workflows` → `workflows.$.actions.$.link`; `get-workflow-overview`
  → `actions.$.link`; `get-action-group-overview` → `actions.$.link`).
- The Lowdefy build succeeds.
- The consuming pages (`actions-on-entity`, `workflow-overview`, `group-overview`)
  are **not** edited — they already render `actions_list.$.link` from the response.

## Files

- `modules/workflows/api/get-entity-workflows.yaml` — modify — insert link stage; `link: $link` in `$push`.
- `modules/workflows/api/get-workflow-overview.yaml` — modify — insert link stage; drop inline `link` from early `$addFields`.
- `modules/workflows/api/get-action-group-overview.yaml` — modify — insert link stage; `link: 1` in `$project`.

## Notes

- Order matters: `resolve_action_link` reads `$visible_verbs`, so it must follow
  the `visible_verbs` compute + `visible_verbs_filter` drop.
- This is the read-side half of D5's "supersedes Part 38's UI-selection rule" —
  the engine still *writes* the `links` map; the display layer now *resolves* it.
  The corresponding Part 38 prose cleanup is Task 8.
