# Filters

How to build search, filter, and sort controls on list pages and dashboards.

## Pattern

Filters are a **state → payload → pipeline** data flow. Every filter control writes to `state.filter.{field}`, a shared search action resets pagination and re-fetches data, and the aggregation pipeline reads filters from `_payload: filter.{field}`.

**Container**: a `Box` with `contentGutter: 8`. Set `maxWidth` for list pages. For complex filter sets, group related filters into nested Box rows.

**Filter controls** — all follow the same conventions:

- ID is always `filter.{field_name}` (e.g., `filter.search`, `filter.status`, `filter.dates`)
- Label is always `disabled: true` (hides the label, uses placeholder instead)
- Every `onChange` refs the shared `actions/search.yaml`

**Control types by use case:**

- `TextInput` — free-text search. Uses `onPressEnter` (immediate) + `onChange` with `try:` + `debounce: { ms: 500 }`
- `ButtonSelector` — mutually exclusive status/category with few options (2-4). No debounce needed.
- `MultipleSelector` — multi-select for enums, roles, companies, agents. Use `renderTags: true` for entity selectors.
- `DateRangeSelector` — date range filtering. Uses `placeholder: []` for empty default.
- `Selector` — single-select for sort-by or boolean toggles.

**Option sources** (from simplest to most dynamic):

- Inline `options:` array — for small fixed lists (status buttons, sort fields)
- `_module.var: roles` — module-injected options, lets consuming app customize
- `_ref: path: ../shared/enums/options_enum.yaml, vars: { enum: _global: enums.{type} }` — transforms an enum YAML map into `{ label, value, style, tag }` options (use for enum-backed selectors)
- `_request: selector_filter_options.0.{field}` — dynamic options from a dedicated aggregation (for fields like authors, companies, agents that come from data)
- `_state: {options_key}` — pre-computed options stored in state during onMount

**The search action** (`actions/search.yaml`) is the critical glue — every filter change refs it:

```yaml
- id: update_pagination
  type: SetState
  params:
    pagination:
      current: 1
      skip: 0
      pageSize:
        _state: pagination.pageSize
    selected: null
- id: get_data
  type: Request
  params: get_all_{entities}
```

It resets pagination to page 1 (so users don't land on an empty page after filtering) while preserving their chosen page size, then re-fetches.

**Clear button** — resets all filter state and re-fetches:

```yaml
events:
  onClick:
    _build.array.concat:
      - - id: reset
          type: Reset
      - _ref: actions/search.yaml
```

**Sort controls** — a separate component (typically `sort_filters.yaml`) with a `Selector` for sort field and a toggle `Button` for ascending/descending. Sort is disabled when text search is active (results sort by relevance instead). The sort toggle uses `_build.array.concat` to combine `SetState` (flip order) + search action.

## Data Flow

```
User changes filter control
  → onChange fires (debounced for TextInput/MultipleSelector, immediate for ButtonSelector)
  → actions/search.yaml runs
  → SetState resets pagination to page 1, preserves pageSize
  → Request fires with payload: { filter: _state: filter, sort: _state: sort, pagination: _state: pagination }
  → Aggregation pipeline reads _payload: filter.search, _payload: filter.status, etc.
  → Results render in table, pagination total updates
```

## Variations

**Simple — search + clear only:**

```yaml
blocks:
  - id: filter.search
    type: TextInput
    # ...onPressEnter + debounced onChange
  - id: filter.clear
    type: Button
    # ...Reset + search action
```

**Medium — search + enum selectors + status buttons:**
Add `MultipleSelector` for roles and `ButtonSelector` for status between search and clear.

**Complex — grouped rows with dates, multiple selectors, dynamic options:**
Nest filters into Box rows. First row: search + DateRangeSelector. Second row: entity selectors (authors, companies, agents) populated from `selector_filter_options` request. Third row: enum selectors (status, priority, category) populated from `options_enum.yaml` + `_global: enums`. End with clear button.

**With URL persistence:**
Add `filter_url_query` and `set_url_with_filter` actions to the search action to sync filter state with URL query params. This lets users share filtered views via URL.

**Dependent filters:**
Disable a child filter until parent has exactly 1 selection:

```yaml
disabled:
  _ne:
    - _state: filter.companies.length
    - 1
```

On parent change, clear child state before searching:

```yaml
onChange:
  try:
    _build.array.concat:
      - - id: clear_child
          type: SetState
          params:
            filter.org_units: []
      - _ref: actions/search.yaml
  debounce:
    ms: 500
```

## Anti-patterns

- **Don't forget pagination reset** — if you don't reset to page 1 on filter change, the user lands on an empty page when filtered results have fewer pages.
- **Don't skip debounce on TextInput onChange** — fires on every keystroke without it, hammering the server. Always use `try:` + `debounce: { ms: 500 }` together.
- **Don't use `_state` in pipeline properties** — pass filter state through `payload:` on the request, then read via `_payload:` in the pipeline. This keeps the request self-contained and cacheable.
- **Don't forget `label: disabled: true`** — without it, an empty label takes up vertical space above each control.
- **Don't put the Clear button logic inline** — always use `_build.array.concat` to compose Reset + search action ref. This ensures pagination reset happens too.

## Reference Files

- `modules/contacts/components/filter_contacts.yaml` — minimal search + clear
- `modules/user-admin/components/users_filter.yaml` — search + MultipleSelector + ButtonSelector
- `modules/user-admin/components/sort_filters.yaml` — sort field selector + order toggle
- `modules/contacts/actions/search.yaml` — canonical search action (reset pagination + request)
- `modules/notifications/components/form-filter.yaml` — DateRangeSelector + type selector

## Template

```yaml
# components/filter_{entities}.yaml
id: filters
type: Box
layout:
  contentGutter: 8
blocks:
  - id: filter.search
    type: TextInput
    layout:
      flex: 1 1 auto
    properties:
      placeholder: Search by {searchable fields description}
      label:
        disabled: true
    events:
      onPressEnter:
        _ref: actions/search.yaml
      onChange:
        try:
          _ref: actions/search.yaml
        debounce:
          ms: 500
  - id: filter.{enum_field}
    type: MultipleSelector
    layout:
      flex: 1 1 auto
    properties:
      placeholder: { Field Label }
      label:
        disabled: true
      options:
        _module.var:
          key: filter_options.{enum_field}
          default:
            - label: { Option 1 }
              value: { value_1 }
            - label: { Option 2 }
              value: { value_2 }
    events:
      onChange:
        _ref: actions/search.yaml
  - id: filter.status
    type: ButtonSelector
    layout:
      flex: 0 1 auto
    properties:
      label:
        disabled: true
      options:
        - label: Active
          value: active
        - label: Disabled
          value: disabled
    events:
      onChange:
        _ref: actions/search.yaml
  - id: filter.clear
    type: Button
    layout:
      flex: 0 1 auto
    properties:
      title: Clear
      icon: AiOutlineClear
    events:
      onClick:
        _build.array.concat:
          - - id: reset
              type: Reset
          - _ref: actions/search.yaml
```

```yaml
# actions/search.yaml
- id: update_pagination
  type: SetState
  params:
    pagination:
      current: 1
      skip: 0
      pageSize:
        _state: pagination.pageSize
    selected: null
- id: get_data
  type: Request
  params: get_all_{entities}
```

## Checklist

- [ ] Every filter ID follows `filter.{field}` naming convention
- [ ] Every filter has `label: disabled: true`
- [ ] TextInput has both `onPressEnter` (immediate) and `onChange` (`try:` + `debounce: { ms: 500 }`)
- [ ] All filter `onChange` events ref the same `actions/search.yaml`
- [ ] Search action resets pagination to page 1 while preserving `pageSize`
- [ ] Clear button uses `_build.array.concat` with `Reset` + search action ref
- [ ] Request `payload:` maps `filter: _state: filter` — pipeline reads `_payload: filter.{field}`
- [ ] Sort controls disabled when text search is active (results sort by relevance)
- [ ] Dynamic option selectors use `_request: selector_filter_options.0.{field}` or `_module.var`
- [ ] Enum-backed selectors use `options_enum.yaml` transform or inline options array
