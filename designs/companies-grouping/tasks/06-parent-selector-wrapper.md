# Task 6: Create `parent_selector` wrapper component

## Context

The edit form needs a parent-companies multi-select that:

1. Uses `MultipleSelector` mode (multi-pick).
2. Reads `state.cycle_check_self_id` (the company being edited — filtered out of the options entirely so self never appears) and `state.cycle_check_ids` (descendants — rendered as disabled options with a "(child of this company)" suffix).
3. **Does not self-fetch on `onMount`** — instead, the edit page (task 7) sequences the options fetch as a second step after the descendants request completes, avoiding a first-render flash where self appears as a valid parent.

The existing `company-selector.yaml` (`modules/companies/components/company-selector.yaml`) keeps its self-fetch `onMount` for backward compatibility with other consumers. This new `parent_selector.yaml` is a separate component that defines the same selector shape but **without** the `onMount` block.

The label is composed at the usage site as `_string.concat: ["Parent ", _module.var: label_plural]`, with `_if_none` falling back to that when the consumer doesn't override via `hierarchy.parent_label`.

## Task

Create `modules/companies/components/parent_selector.yaml`.

The simplest implementation duplicates the structure of `company-selector.yaml` minus the `events.onMount` block, hardcoded for `MultipleSelector` mode and the `parent_ids` field id:

```yaml
id: parent_ids
type: MultipleSelector
requests:
  - _ref: requests/get_companies_for_selector.yaml
properties:
  placeholder:
    _string.concat:
      - "Select "
      - _if_none:
          - _module.var: hierarchy.parent_label
          - _string.concat:
              - "Parent "
              - _module.var: label_plural
  options:
    _request: get_companies_for_selector
  label:
    _if_none:
      - _module.var: hierarchy.parent_label
      - _string.concat:
          - "Parent "
          - _module.var: label_plural
  optionConfig:
    titleField: label
    valueField: value
    disabledField: disabled
```

Notes on each field:

- `id: parent_ids` — the input block id matches the data path. Per the project rule "Input block IDs match data paths", this auto-binds the selected value array to `state.parent_ids`, which is what the form payload reads on submit.
- `type: MultipleSelector` — multi-select mode.
- No `events.onMount`. Options are fetched by the **page**, not the component.
- `placeholder` and `label` use the `hierarchy.parent_label` override with the `_string.concat` fallback per the design.
- `optionConfig.disabledField: disabled` is essential — without it the selector won't read the projection's `disabled` field. (Same field added to `company-selector.yaml` in task 5; repeated here for clarity since this component is self-contained.)

## Acceptance Criteria

- `modules/companies/components/parent_selector.yaml` exists with the structure above.
- The component has **no** `events.onMount` block.
- `optionConfig.disabledField: disabled` is set.
- `id` is exactly `parent_ids` (matches the form payload field).
- `pnpm ldf:b:i` builds without errors. The component is referenced by task 7's `form_company.yaml` change; it's not used yet on its own.

## Files

- `modules/companies/components/parent_selector.yaml` — create — new wrapper component.

## Notes

- **Why a separate file rather than modifying `company-selector.yaml`.** `company-selector.yaml` is used by the contacts module (and possibly the demo) as a generic single/multi-select. Adding `onMount`-conditional logic there would entangle two concerns. A separate file with its own onMount-less semantics is the clean split.
- **Label fallback.** The `_if_none` + `_string.concat` pattern matches existing precedents (`button_new_company.yaml`, `excel_download.yaml`). When the consuming app sets `hierarchy.parent_label: "Holding Company"`, that string wins; otherwise the auto-pluralised default applies.
- **Block id requirement.** Per project rules ("Input block IDs match data paths"), `id: parent_ids` is required so the form's auto-bound state writes to `state.parent_ids`. Renaming would break the form payload mapping in task 7.
- **No `_var` overrides.** Unlike `company-selector.yaml`, this component doesn't accept `_var: field_id` / `_var: mode` / `_var: label`. It's hardcoded for the parent-picker use only — simpler, less plumbing.
