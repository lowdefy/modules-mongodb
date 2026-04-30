# Lowdefy Operators

Quick reference for which operators to use where — build-time vs runtime, data access, formatting, and functions.

## Pattern

Operators are the expression language of Lowdefy YAML. They fall into two categories that **must not be confused**:

**Build-time operators** (`_build.*`) resolve once when the app compiles. They conditionally include or exclude YAML config — blocks, columns, pipeline stages. The output is static config, not dynamic UI. Use for: feature flags, module var injection, conditional page structure.

**Runtime operators** (`_if`, `_eq`, `_state`, etc.) resolve every time the page renders or an action fires. They read live data and drive dynamic behavior. Use for: showing/hiding blocks, computing values, reading state.

**The underscore depth rule** for `_function` callbacks:

- `_operator` (single underscore) — resolves at page level, before the function runs
- `__operator` (double underscore) — resolves inside the function, with access to `__args`
- `___operator` (triple underscore) — resolves inside a nested function (rare, used in `valueFormatter` with nested `_function`)

## Build-Time Operators (`_build.*`)

Used in component/layout files to conditionally assemble config. **Never use these for runtime logic.**

```yaml
# Conditional inclusion
_build.if:
  test:
    _build.not:
      _var: hide_title
  then: [title-block]
  else: []

# Array composition (the most common pattern)
_build.array.concat:
  - [base items]
  - _module.var: extra_items
  - [trailing items]

# Object merging
_build.object.assign:
  - { base: fields }
  - _module.var: extra_fields

# Branching (multi-condition)
_build.switch:
  branches:
    - if: { _build.eq: [_var: mode, edit] }
      then: {edit config}
  default: {view config}

# Comparisons
_build.eq, _build.ne, _build.gt, _build.not
```

## Data Access Operators

Where data comes from at runtime:

```yaml
# Page state (form fields, filters, sort, pagination)
_state: filter.search
_state: contact.profile.name

# Request results
_request: get_all_contacts.0.total_results

# Request metadata
_request_details: get_all_tasks.0.loading

# URL query parameters
_url_query: _id

# Page input (passed via Link action's input param)
_input: company_id

# API routine payload (inside request/API properties)
_payload: contact.email
_payload: pagination.skip

# Previous action step result (in API routines)
_step: check-existing._id
_step: insert.upsertedId

# Action chain results (after CallAPI/Request in event handlers)
# CallAPI double-wraps the API return — use .response.response.<field>
# Request returns the result directly under .response
_actions: create_contact.response.response.contactId  # CallAPI
_actions: get_all_contacts.response.0._id             # Request

# Logged-in user
_user: id
_user: profile.name
_user: roles

# Event data (from block events like onClick, onRowClick)
_event: row._id
_event: data.name

# Global config (enums, app settings loaded in lowdefy.yaml)
_global: enums.ticket_statuses
_global: app_config.colors.primary

# _ref-level variables
_var: title
_var: { key: width, default: '100%' }

# Module-level variables
_module.var: label
_module.var: { key: components.table_columns, default: [] }

# Module ID scoping
_module.pageId: view
_module.connectionId: contacts-collection
_module.endpointId: create-contact
```

## Comparison & Logic Operators

Runtime conditional logic:

```yaml
# Conditionals
_if:
  test: { _eq: [_state: mode, edit] }
  then: Edit Mode
  else: View Mode

# Null coalescing (critical — use everywhere for safe defaults)
_if_none:
  - _request: get_contact.0.profile.name
  - ""

# Comparisons
_eq: [_state: status, active]
_ne: [_state: value, null]
_gt: [_array.length: { _state: items }, 0]
_not: { _state: loading }
_and: [condition1, condition2]
_or: [condition1, condition2]

# Switch (multi-branch)
_switch:
  branches:
    - if: { _eq: [_state: type, admin] }
      then: Administrator
  default: User
```

## String, Array, Object Operators

Data manipulation at runtime:

```yaml
# Strings
_string.concat: [Hello, " ", _state: name]
_string.toLowerCase: { _state: email }
_string.trim: { _state: input }

# Arrays
_array.concat: [_state: list_a, _state: list_b]
_array.length: { _state: items }
_array.includes:
  - _user: roles
  - admin
_array.map:
  - _request: get_data
  - _function:
      label: { __args: 0.name }
      value: { __args: 0._id }
_array.filter:
  - _state: items
  - _function:
      __ne: [{ __args: 0 }, null]

# Objects
_object.assign:
  - { base: value }
  - { override: value }
_object.keys: { _global: enums.ticket_statuses }
_object.defineProperty:
  on: {}
  key: { _payload: sort.by }
  descriptor:
    value: { _payload: sort.order }
_get:
  key: { _state: status }
  from: { _global: enums.ticket_statuses }
```

## Function Operator (`_function`)

Creates a callback for `_array.map`, `_array.filter`, `cellRenderer`, `valueFormatter`, and `tooltip.formatter`. Inside a function, use double-underscore operators to access arguments:

```yaml
# Cell renderer — access row data
cellRenderer:
  _function:
    __nunjucks:
      template: |
        <span style="color: {{ color }};">{{ title }}</span>
      on:
        __get:
          key: { __args: 0.data.status }
          from: { __global: enums.ticket_statuses }

# Array map — transform items
_array.map:
  - _request: get_users
  - _function:
      label: { __args: 0.profile.name }
      value: { __args: 0._id }

# Nested function (triple underscore — rare)
valueFormatter:
  _function:
    __array.map:
      - __args: 0.value
      - __function:
          ___string.concat:
            - " "
            - ___args: 0.name
```

## Template Operators

For HTML rendering in `Html` blocks and `cellRenderer`:

```yaml
# Nunjucks templates (preferred for HTML)
_nunjucks:
  template: |
    <h2>{{ title | safe }}</h2>
    {% if doc.updated.user.name %}
      Last modified by {{ doc.updated.user.name | safe }}
      on {{ doc.updated.timestamp | date('lll') }}
    {% endif %}
  on:
    title: { _var: title }
    doc: { _var: doc }

# Inside _function (double underscore)
__nunjucks:
  template: |
    <span style="color: {{ color }};">{{ title }}</span>
  on:
    __args: 0.data
```

Nunjucks filters available: `safe` (unescape HTML), `date('format')` (date formatting), `length`, `join`, `lower`, `upper`, `capitalize`.

## Special-Purpose Operators

```yaml
# Client-side MQL aggregation (for data reshaping, NOT heavy transforms)
_mql.aggregate:
  on: { _request: get_data }
  pipeline:
    - $group: { _id: $status }

# Dates
_date: now
_date: { _state: some_date }
_date.valueOf: { _date: now }

# UUID generation (for event IDs)
_uuid: true

# JavaScript (escape hatch — avoid when possible)
_js: |
  const data = request('get_data.0');
  return data ? data.field : null;

# Theme colors
_theme: colorTextDescription
_theme: colorPrimary

# Ref (file composition — build-time, resolves to file content)
_ref: components/filter_contacts.yaml
_ref:
  path: components/form_contact.yaml
  vars:
    email_disabled: true
_ref:
  module: layout
  component: page
  vars: { ... }
_ref:
  path: app_config.yaml
  key: app_name
```

## Anti-patterns

- **Don't use `_build.*` for runtime logic** — `_build.if` resolves at compile time. To conditionally show a block at runtime, use the `visible:` property with `_if`/`_eq`.
- **Don't use `_state` in request pipeline properties** — use `payload:` mapping on the request and `_payload:` in the pipeline. Inline `_state` breaks caching.
- **Don't use `_js` when operators can do the job** — `_js` is harder to read and debug. Use `_function` + `__nunjucks` / `__get` / `__array.map` first. Reserve `_js` for complex logic that genuinely needs JavaScript (deduplication, sorting with custom comparators, `lowdefyGlobal()` calls).
- **Don't forget `_if_none` for nullable access** — `_request: get_contact.0.name` is `null` before the request completes. Always wrap with `_if_none: [value, fallback]` when binding to display properties.
- **Don't confuse underscore depth** — `_get` resolves at page level (can't access `__args`). Inside a `_function`, use `__get`. Inside a nested function, use `___get`. Wrong depth = silent null.

## Reference Files

- `modules/contacts/components/table_contacts.yaml` — `_function` + `__nunjucks` cellRenderer, `_build.array.concat` column injection
- `modules/layout/components/page.yaml` — heavy `_build.*` usage: conditional blocks, `_build.switch`, `_build.object.assign`
- `modules/shared/layout/card.yaml` — `_build.switch`, `_build.array.concat`, `_var` with defaults
- `modules/contacts/requests/get_all_contacts.yaml` — `_payload`, `_array.concat`, `_if`, `_module.var` in pipeline
- `modules/contacts/api/create-contact.yaml` — `_step`, `_payload`, `_user`, `_object.assign`, `_build.if`

## Checklist

- [ ] Build-time (`_build.*`) used only for config assembly — never for runtime show/hide
- [ ] Runtime visibility uses `visible:` property with `_if`/`_eq`, not `_build.if`
- [ ] `_state` never appears inside request `properties.pipeline` — use `payload:` + `_payload:`
- [ ] `_if_none` wraps any nullable data access bound to display
- [ ] `_function` callbacks use `__` (double underscore) operators, not `_` (single)
- [ ] `_js` used only as escape hatch — `_function` + operators preferred
- [ ] `_module.var` always includes `default:` to prevent null propagation
- [ ] `_ref` with `vars:` used to pass context to sub-files, `_var` to read them
