# Task 5: Extend `company-selector` and its request for cycle-check filtering

## Context

The cycle-prevention UI on the parent selector splits the work two ways:

- **Self** (the company being edited) is **filtered out entirely** — there's nothing useful to show by greying out a company as "(itself)".
- **Descendants** stay in the list as **disabled options with a "(child of this company)" suffix**, so users see the company exists and understand why it's unavailable as a parent.

The reusable `company-selector` component is extended to support both: a self-id payload drives a `$match` exclusion, and a descendants array drives a `$cond`-based `disabled` projection.

The component currently lives at `modules/companies/components/company-selector.yaml`. It accepts vars `field_id`, `mode`, and `label`, and fires its options request `get_companies_for_selector` on its own `onMount`. (The file historically carried an `optionConfig: { titleField: label, valueField: value }` block, but this is a no-op — it's not in the antd `Selector/schema.json`, no plugin in this repo consumes it, and the projection's field names already match the schema's expected `label` / `value`. Drop it as a vestigial cleanup while we're in this file.)

The request at `modules/companies/requests/get_companies_for_selector.yaml` projects each company as `{ label, value }` and sorts by label.

This task extends both files to handle two new payload values:

- `cycle_check_self_id` — single id; the `$match` filters out the doc with this `_id`. Default `null` → `$ne: null` is true for every doc → no filtering, backward compatible.
- `cycle_check_ids` — array of descendant ids; the `$project` marks any doc whose `_id` is in this array as `disabled: true` with the "(child of this company)" suffix. Default `[]` → `$in` is always false → no rows disabled, backward compatible.

The actual `parent_selector` wrapper that consumes this lives in task 6.

## Task

### A. Update `modules/companies/requests/get_companies_for_selector.yaml`

The current pipeline:

```yaml
properties:
  pipeline:
    - $match:
        removed:
          $ne: true
    - $project:
        label:
          $concat:
            - _build.string.concat:
                - "$"
                - _module.var: name_field
            - " ("
            - "$_id"
            - ")"
        value: "$_id"
    - $sort:
        label: 1
```

Add a `payload:` block accepting both new values, extend `$match` to exclude self, and update `$project` to compute `disabled` and conditionally suffix `label`:

```yaml
payload:
  cycle_check_self_id:
    _if_none:
      - _state: cycle_check_self_id
      - null
  cycle_check_ids:
    _if_none:
      - _state: cycle_check_ids
      - []
properties:
  pipeline:
    - $match:
        removed:
          $ne: true
        # Exclude self entirely. When cycle_check_self_id is null (every
        # consumer that doesn't set it), $ne: null passes every doc.
        _id:
          $ne:
            _payload: cycle_check_self_id
    - $project:
        label:
          $cond:
            if:
              $in:
                - "$_id"
                - _payload: cycle_check_ids
            then:
              $concat:
                - _build.string.concat: ["$", _module.var: name_field]
                - " ("
                - "$_id"
                - ") (child of this company)"
            else:
              $concat:
                - _build.string.concat: ["$", _module.var: name_field]
                - " ("
                - "$_id"
                - ")"
        value: "$_id"
        disabled:
          $cond:
            if:
              $in:
                - "$_id"
                - _payload: cycle_check_ids
            then: true
            else: false
    - $sort:
        label: 1
```

When `cycle_check_self_id` is `null` (every consumer that doesn't set it), the `$match`'s `$ne: null` is true for all docs and passes every row. When `cycle_check_ids` is `[]` (the default), the `$in` check returns `false` for every row, the `else` branches fire, and the projection matches today's output except for an extra `disabled: false` field on each row (harmless).

### B. Update `modules/companies/components/company-selector.yaml`

Drop the existing `optionConfig` block entirely. It's a no-op (not in the antd `Selector/schema.json`, not consumed by any plugin in `plugins/`, and the projection's `label` / `value` field names already match what the schema expects). The Selector block's schema natively reads each option's `disabled` field — no mapping config needed.

Leave `events.onMount` unchanged — the existing self-fetch on mount stays for backward compatibility with consumers that don't set the cycle-check state. The `parent_selector` wrapper (task 6) is a separate component that overrides `onMount` for the edit-form parent-picker use only.

State-path convention is fixed: the request reads `_state: cycle_check_self_id` and `_state: cycle_check_ids`. The wrapping page (task 7) sets both. There can only be one parent-selector per page; the design doesn't need multiple at once.

## Acceptance Criteria

- `get_companies_for_selector.yaml` reads `_state: cycle_check_self_id` (default `null`) and `_state: cycle_check_ids` (default `[]`), filters out self via `$match: { _id: { $ne: cycle_check_self_id } }`, and projects a per-row `disabled` boolean + a conditionally-suffixed `label`.
- `company-selector.yaml` no longer carries the vestigial `optionConfig` block. `events.onMount` is unchanged.
- The change is **behaviourally backward-compatible** for all existing consumers: when neither state value is set, the `$match` passes every doc (`$ne: null` is always true) and every `disabled` resolves to `false`. The new `disabled` field is added to every option result regardless of the flag — the antd Selector schema natively reads `options[].disabled`, so for options where the value is `false` the rendering is unchanged. Verify by building the demo app and opening any page that uses `company-selector` — options should render and behave as before.
- Manual verification (after task 7 lands): on the edit form, after the descendants resolve, self is absent from the dropdown and descendants render with the "(child of this company)" suffix and disabled.

## Files

- `modules/companies/requests/get_companies_for_selector.yaml` — modify — add `payload.cycle_check_self_id` and `payload.cycle_check_ids` (both from state), extend `$match` to exclude self, change `$project` to compute `disabled` and modify `label` per row.
- `modules/companies/components/company-selector.yaml` — modify — drop the vestigial `optionConfig` block. (No other changes — `onMount` stays for backward compatibility.)

## Notes

- **Why pull from state, not payload.** Lowdefy's `_var` is resolved at `_ref`-time, not run-time, so passing dynamic values into a `_ref` doesn't update when the source data changes. State is run-time-reactive — the page sets `state.cycle_check_self_id` and `state.cycle_check_ids` after `get_descendant_company_ids` resolves, and the selector's request payload reads from there. (Task 7 wires this on the edit page.)
- **Why two state values, not one.** Self gets `$match`-excluded; descendants get `$cond`-disabled. They have different MongoDB roles. The descendants request returns `[self, ...descendants]` as one array; the page's `set_state` step splits this into the two state fields — `cycle_check_self_id` from the page's own `_state._id` (already known on the edit page), `cycle_check_ids` from the request's `ids` array (self being in there is fine since self is filtered out before the projection).
- **Why "(child of this company)" not "(would create cycle)".** Plain English describes the relationship; "cycle" is jargon. A user picking a parent and seeing one of their existing subsidiaries greyed-out wants to understand "this company is below me, so I can't make it my parent" — "(child of this company)" says exactly that.
- **`$cond` performance.** Per-row constant-time projection; `$in` against a small array (typically < 50 ids) is also constant-time. Negligible overhead.
- **`get_companies_for_selector` is shared.** Other consumers (e.g. the contacts module's parent-picker for `global_attributes.company_ids`) will pick up the new `disabled` field in their option results. Per the antd `Selector/schema.json`, each option natively accepts `{ label, value, disabled, ... }` — when the projection's `disabled` resolves to `false` (every consumer that doesn't set cycle-check state), the option renders enabled exactly as before. A grep across the repo confirms no in-repo file `_ref`s `module: companies, component: company-selector` today — apps consume it externally via their `lowdefy.yaml`. So the projection change has no in-repo blast radius today; the new `parent_selector.yaml` (task 6) becomes the second consumer.
- **`optionConfig` was a no-op.** `optionConfig` is not in the antd `Selector/schema.json` (which has `additionalProperties: false`) and no plugin in `plugins/` consumes it. The build was silently passing it through. The schema's option shape (`{ label, value, disabled, filterString, style }`) is exactly what the projection produces, so no mapping/translation config is necessary.
