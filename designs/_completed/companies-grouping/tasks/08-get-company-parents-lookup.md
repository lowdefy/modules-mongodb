# Task 8: Extend `get_company` with parents `$lookup`

## Context

The view page's hierarchy tile (task 9) needs the resolved names of the current company's parents — not just the `parent_ids` array. `get_company` (`modules/companies/requests/get_company.yaml`) is the request the view page already runs to load the company doc; extending it with a multikey `$lookup` adds a `parents: [{ _id, <name_field>: <name> }, ...]` array to the result without a second request.

Multikey `$lookup` semantics: when `localField` is an array (`parent_ids`), MongoDB matches each element against `foreignField` (`_id`) and returns one foreign doc per match. The result is bound to a new array field (`parents`).

The `$lookup` must filter for **non-removed parents only** so soft-deleted parents don't appear. The lookup uses a `pipeline:` form (rather than `localField`/`foreignField` + a separate `$match`) to combine the join and the filter in one stage.

The lookup is build-gated on `_module.var: hierarchy.enabled` — when disabled, it's omitted entirely and the request output is identical to today.

## Task

Modify `modules/companies/requests/get_company.yaml`. The current pipeline:

```yaml
properties:
  pipeline:
    - $match:
        _id:
          _payload: _id
        removed:
          $ne: true
    - $addFields:
        display_name:
          $getField:
            field:
              _module.var: name_field
            input: "$$ROOT"
```

Add a build-gated `$lookup` stage between `$match` and `$addFields`, using `_build.array.concat` to merge in the new stage when enabled:

```yaml
properties:
  pipeline:
    _build.array.concat:
      - - $match:
            _id:
              _payload: _id
            removed:
              $ne: true
      - _build.if:
          test:
            _module.var: hierarchy.enabled
          then:
            - $lookup:
                from:
                  _ref:
                    path: connections/companies-collection.yaml
                    key: properties.collection
                localField: parent_ids
                foreignField: _id
                pipeline:
                  - $match:
                      removed:
                        $ne: true
                  - $project:
                      _id: 1
                      <name_field>:
                        _module.var: name_field # see Notes — projecting via _build.object.fromEntries
                as: parents
          else: []
      - - $addFields:
            display_name:
              $getField:
                field:
                  _module.var: name_field
                input: "$$ROOT"
```

`localField: parent_ids` + `foreignField: _id` natively handles multikey expansion — each element of the local doc's `parent_ids` array is matched against `_id` in the foreign collection. The sub-pipeline (MongoDB 5.0+) runs after that match and filters out soft-deleted parents via `removed: { $ne: true }` before the projection.

## Acceptance Criteria

- When `hierarchy.enabled: false`: the request's `properties.pipeline` resolves to the same two stages as today (`$match`, `$addFields`). Verify by building against an app with the var disabled and diffing the build output before/after.
- When `hierarchy.enabled: true`: the pipeline has three stages — `$match`, `$lookup` (parents), `$addFields`. The `parents` field on the result is an array of `{ _id, <name_field>: <name> }` objects, one per non-removed parent.
- Soft-deleted parents are absent from the `parents` array (filtered out by the sub-pipeline's `removed: { $ne: true }`).
- A company with no `parent_ids` (empty array or missing field) yields `parents: []`.
- `pnpm ldf:b:i` builds without errors.
- Manual verification (after task 9 lands): on a company's view page, the hierarchy tile shows parent names correctly resolved.

## Files

- `modules/companies/requests/get_company.yaml` — modify — insert build-gated `$lookup` stage between `$match` and `$addFields`.

## Notes

- **`$lookup.from` via `_ref` to the connection file.** Same as tasks 2 and 4 — read the collection name via `_ref: { path: connections/companies-collection.yaml, key: properties.collection }` rather than hardcoding `from: companies`. Verified working at build with the `$graphLookup` cases.
- **Projecting by configurable field name.** The `$project` stage inside the sub-pipeline needs to project both `_id` and the field named by `_module.var: name_field`. Since the field name is build-time configurable but the YAML key is static, the cleanest expression is `_build.object.fromEntries`:

  ```yaml
  - $project:
      _build.object.fromEntries:
        - - _id
          - 1
        - - _module.var: name_field
          - 1
  ```

  Or, if the existing pipelines use a different idiom for "project a configurable-name field", match that pattern. The view block in task 9 reads the resolved key via `_module.var: name_field`, so whatever the projection key is here must match.

- **`localField` + `foreignField` + `pipeline` (MongoDB 5.0+).** All three can be combined: the local/foreign match runs first (with native multikey expansion when `localField` is an array), then the sub-pipeline filters and projects the joined docs. An earlier version of this task used `let` + `$expr` + `$in` thinking the shorthand and sub-pipeline were mutually exclusive — they're not. The current form is simpler.
- **Cycle interaction.** `$lookup` doesn't recurse — it returns _direct parents only_. That's correct for the view-page tile, which shows direct parents and direct children separately. Ancestors aren't displayed.
- **Empty `parent_ids`.** When the field is `[]` or missing, `localField: parent_ids` produces no matches and `parents:` resolves to `[]` automatically. No `$ifNull` needed.
