# Task 5: Extend `company-selector` and its request to support `cycle_check_ids`

## Context

The cycle-prevention UI renders self + descendants as **disabled options with a "(would create cycle)" suffix** rather than hiding them — users see the company exists and understand why it's unavailable. The reusable `company-selector` component is extended to support this.

The component currently lives at `modules/companies/components/company-selector.yaml`. It accepts vars `field_id`, `mode`, and `label`, fires its options request `get_companies_for_selector` on its own `onMount`, and binds projected options through `optionConfig: { titleField: label, valueField: value }`.

The request at `modules/companies/requests/get_companies_for_selector.yaml` projects each company as `{ label, value }` and sorts by label.

This task extends both files to handle a new `cycle_check_ids` payload. When the array is empty (default), behaviour is unchanged — every option is enabled, every label is plain. When non-empty, options whose `_id` is in the array are projected with `disabled: true` and a label suffixed with `" (would create cycle)"`.

The change is **backward compatible**: existing consumers don't pass `cycle_check_ids`, the default `[]` means no rows match the `$in` check, no `$cond` branch fires, output is identical to today.

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
                - '$'
                - _module.var: name_field
            - ' ('
            - '$_id'
            - ')'
        value: '$_id'
    - $sort:
        label: 1
```

Add a `payload:` block accepting `cycle_check_ids` and update the `$project` stage to compute `disabled` per row and modify the `label` for matching rows. Sketch:

```yaml
payload:
  cycle_check_ids:
    _if_none:
      - _payload: cycle_check_ids
      - []
properties:
  pipeline:
    - $match:
        removed:
          $ne: true
    - $project:
        label:
          $cond:
            if:
              $in:
                - "$_id"
                - _payload: cycle_check_ids
            then:
              $concat:
                - _build.string.concat: ['$', _module.var: name_field]
                - ' ('
                - '$_id'
                - ') (would create cycle)'
            else:
              $concat:
                - _build.string.concat: ['$', _module.var: name_field]
                - ' ('
                - '$_id'
                - ')'
        value: '$_id'
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

When `_payload: cycle_check_ids` is `[]` (the default), the `$in` check returns `false` for every row, the `else` branches fire, and the projection matches today's output exactly except for an extra `disabled: false` field on each row (harmless).

### B. Update `modules/companies/components/company-selector.yaml`

Currently:

```yaml
id:
  _var:
    key: field_id
    default: company
type:
  _var:
    key: mode
    default: Selector
requests:
  - _ref: requests/get_companies_for_selector.yaml
events:
  onMount:
    - id: fetch_companies
      type: Request
      params: get_companies_for_selector
properties:
  placeholder: ...
  options:
    _request: get_companies_for_selector
  label: ...
  optionConfig:
    titleField: label
    valueField: value
```

Two changes:

1. **Add the `cycle_check_ids` plumbing.** The wrapping page that uses this component as a parent-selector will pass `cycle_check_ids` as a `_var` (resolved at `_ref` time). To get this run-time array into the request payload, the consuming page should set state that the request reads via `_state` — or the `_ref`-time var should be wired through. The simplest expression: have the request read `_state: <state path>` for cycle_check_ids, and the consuming page sets that state from `_request: get_descendant_company_ids.0.ids` on mount (per task 7).

   Two viable wiring patterns. Pick the one that matches existing module conventions:

   - **(i) Var-keyed state path.** `company-selector.yaml` accepts a `cycle_check_state_path` var (default unused). The request reads `_state: <that path>`. The page sets the state. Allows multiple selectors on one page with different cycle-check sets.
   - **(ii) Fixed state path.** The request reads `_state: cycle_check_ids` always. The page sets `state.cycle_check_ids` from the descendants request. Simpler, but only one parent-selector per page.

   Given the design only has one parent-selector per page, **(ii) fixed state path is simpler and acceptable for v1**. Adopt that.

   Update the request's `payload:` to:

   ```yaml
   payload:
     cycle_check_ids:
       _if_none:
         - _state: cycle_check_ids
         - []
   ```

   (Replacing the earlier sketch's `_payload: cycle_check_ids` — pull from state, not from the wrapper's payload, to avoid an extra plumbing layer.)

2. **Add `disabledField: disabled` to `optionConfig`.** This tells the underlying `Selector` / `MultipleSelector` block to read the `disabled` field on each option and render those options as greyed-out / unselectable.

   ```yaml
   optionConfig:
     titleField: label
     valueField: value
     disabledField: disabled
   ```

3. **Leave `events.onMount` as-is.** The existing self-fetch stays — other consumers (e.g. the contacts module's company picker) rely on it. Task 7 adds a separate `parent_selector.yaml` wrapper that overrides `onMount` for the edit-form parent-picker use only.

## Acceptance Criteria

- `get_companies_for_selector.yaml` reads `_state: cycle_check_ids` (with `_if_none [..., []]` fallback) and projects a `disabled` boolean + a conditionally-suffixed `label`.
- `company-selector.yaml` passes `disabledField: disabled` in `optionConfig`. `events.onMount` is unchanged.
- The projection change is **behaviourally backward-compatible** (not byte-identical): every selector option now carries an extra `disabled` field, but when `state.cycle_check_ids` is unset (every consumer that doesn't deliberately set it), every row resolves to `disabled: false` and labels are unsuffixed. No existing consumer reads the new field. Verify by building the demo app and opening any page that uses `company-selector` — options should render and behave as before.
- Manual smoke test: in the demo app, on a page that doesn't set `state.cycle_check_ids`, the selector renders all options enabled with no `(would create cycle)` suffix.
- Manual verification (after task 7 lands): on the edit form, after the descendants resolve, the current company and any descendants render with the suffix and disabled.

## Files

- `modules/companies/requests/get_companies_for_selector.yaml` — modify — add `payload.cycle_check_ids` (from state), change `$project` stage to compute `disabled` and modify `label` per row.
- `modules/companies/components/company-selector.yaml` — modify — add `disabledField: disabled` to `optionConfig`. (No other changes — `onMount` stays for backward compatibility.)

## Notes

- **Why pull from state, not payload.** Lowdefy's `_var` is resolved at `_ref`-time, not run-time, so passing dynamic `cycle_check_ids` into a `_ref` doesn't update when the source data changes. State is run-time-reactive — the page sets `state.cycle_check_ids` after `get_descendant_company_ids` resolves, and the selector's request payload reads from there. (Task 7 wires this on the edit page.)
- **`$cond` vs `$switch`.** A single `$cond` per field is fine — there are only two branches. `$switch` would over-engineer it.
- **Performance.** The `$cond` adds negligible overhead — it's a per-doc projection, not an index lookup. The `$in` check against a small array (typically < 50 ids) is constant-time.
- **In-repo consumers of `company-selector`.** A grep of the repo (`grep -rln 'company-selector' --include="*.yaml" --include="*.yaml.njk"`) returns only `modules/companies/module.lowdefy.yaml` itself (the export declaration). No in-repo page or component currently `_ref`s `module: companies, component: company-selector` — apps consume it externally via their `lowdefy.yaml`. So the projection change has no in-repo blast radius today; the new wrapper component (`parent_selector.yaml` from task 6) becomes the second consumer. External consumer apps that import `company-selector` will see the extra `disabled` field on every option result, but their selectors don't read `disabledField` (which is now `disabled` only in `company-selector.yaml` — see step B.2 above), so the change is behaviourally backward-compatible. Spot-check with `pnpm ldf:b:i` against the demo app and any app the implementer is testing against.
