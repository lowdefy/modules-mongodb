# The `_js` Operator

When and how to use inline JavaScript in Lowdefy YAML — the escape hatch for logic that exceeds what declarative operators can express.

## Pattern

`_js` embeds a synchronous JavaScript function body directly in YAML. At build time Lowdefy hashes the code and stores it in a `jsMap`; at runtime the framework calls it as a function with context-specific helpers injected as arguments. The return value replaces the `_js` node in the config tree.

**When to reach for `_js`:** only when Lowdefy operators (`_if`, `_array.map`, `_function` + `__nunjucks`) become deeply nested or unreadable. Common legitimate cases: multi-field calculations, data deduplication, building dynamic MongoDB `$search` queries with many conditional clauses, role-based state-machine transitions, and date-range arithmetic. If the logic fits in 1-2 operators, use operators instead.

**Client-side helpers** (available in blocks, actions, component properties):

| Helper                 | Equivalent operator | Example                              |
| ---------------------- | ------------------- | ------------------------------------ |
| `state('key')`         | `_state: key`       | `state('filter.search')`             |
| `request('key')`       | `_request: key`     | `request('get_lot.0')`               |
| `lowdefyGlobal('key')` | `_global: key`      | `lowdefyGlobal('enums.disciplines')` |
| `event('key')`         | `_event: key`       | `event('data.value.0')`              |
| `user('key')`          | `_user: key`        | `user('roles')`                      |
| `input('key')`         | `_input: key`       | `input('company_id')`                |
| `urlQuery('key')`      | `_url_query: key`   | `urlQuery('tab')`                    |
| `actions('key')`       | `_actions: key`     | `actions('fetch.response')`          |
| `location('key')`      | `_location: key`    | `location('pathname')`               |

**Server-side helpers** (available in request pipelines and API routines):

| Helper           | Equivalent operator | Example                                  |
| ---------------- | ------------------- | ---------------------------------------- |
| `payload('key')` | `_payload: key`     | `payload('filter.search')`               |
| `user('key')`    | `_user: key`        | `user('id')`                             |
| `secret('key')`  | `_secret: key`      | `secret('api_key')`                      |
| `state('key')`   | `_state: key`       | `state('processed')` (API routine state) |
| `step('key')`    | `_step: key`        | `step('get_current_lot')`                |
| `item('key')`    | `_item: key`        | `item('row._id')` (inside `:for` loops)  |

**Important:** use `lowdefyGlobal('key')` to read global state — not `global('key')`. The helper name differs from the operator name (`_global`).

## Data Flow

```
YAML property has _js block
  → Build: Lowdefy hashes the JS string into jsMap
  → Runtime: framework calls jsMap[hash]({ state, request, ... })
  → Function returns a value (object, array, string, number, boolean, null)
  → Return value replaces the _js node wherever it appeared
```

`_js` blocks are **synchronous and re-evaluated on every render** (client-side) or **once per request execution** (server-side). Keep them fast — no async, no side effects, no DOM access.

## Variations

**Simple formatting** — append units, handle nulls:

```yaml
value:
  _js: |
    const v = state('lot')?.rom_man_hours;
    return v != null ? v + ' hrs' : '---';
```

**Calculation with conditional display** — percentage delta with sign:

```yaml
value:
  _js: |
    const rom = state('lot')?.rom_man_hours;
    const bid = state('lot')?.bid_manhours;
    if (rom == null || bid == null || rom === 0) return '---';
    const delta = ((bid - rom) / rom) * 100;
    return (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';
```

**Data enrichment** — compute derived fields on row data:

```yaml
rowData:
  _js: |
    const rows = request('get_staged.0.results') || [];
    const cols = state('tool_columns') || [];
    const idCol = state('tool_id_column');
    const fields = cols.map(c => c.field).filter(f => f !== idCol);
    return rows.map(r => {
      if (r.method !== 'update') return r;
      const n = r.new_doc || {};
      const t = r.target_doc || {};
      const changed = fields.filter(f => JSON.stringify(n[f]) !== JSON.stringify(t[f]));
      return { ...r, changed_fields: changed.join(', ') };
    });
```

**Enum filtering** — intersect global enums with runtime data:

```yaml
event_types:
  _js: |
    const notification_types = request('get_notification_types.0.event_types');
    const event_types = lowdefyGlobal('enums.event_types');
    if (!notification_types || !event_types) return [];
    return Object.keys(event_types)
      .filter(key => notification_types.includes(key))
      .map(key => ({
        value: key,
        label: event_types[key].title,
        tag: { color: event_types[key].color }
      }));
```

**Dynamic MongoDB `$search` query** — conditional filter clauses with `.filter(Boolean)`:

```yaml
- $search:
    _js: |
      return {
        compound: {
          filter: [{
            compound: {
              must: [
                payload('filter.status').length && {
                  in: { path: 'status', value: payload('filter.status') }
                },
                payload('filter.companies').length && {
                  in: { path: 'company_id', value: payload('filter.companies') }
                },
              ].filter(Boolean)
            }
          }],
          should: [
            payload('filter.search') && {
              text: {
                query: payload('filter.search'),
                path: ['title', 'description']
              }
            },
          ].filter(Boolean),
          minimumShouldMatch: payload('filter.search') ? 1 : 0
        }
      };
```

**Role-based state transitions** — compute allowed transitions from user roles and current status:

```yaml
transitions:
  _js: |
    const userRoles = user('roles') || [];
    const currentStatus = state('current_status') || '';
    const config = lowdefyGlobal('enums.task_transitions') || {};
    const rolesConfig = config?.roles || {};
    const allowed = new Set();
    userRoles.forEach(role => {
      const transitions = rolesConfig[role]?.transitions?.[currentStatus];
      if (transitions?.selector) transitions.selector.forEach(s => allowed.add(s));
    });
    return Array.from(allowed);
```

## Anti-patterns

- **Don't use `_js` when operators suffice** — `_js: | return state('x') || 'default'` is just `_if_none: [_state: x, 'default']`. The operator version is shorter, declarative, and easier to audit. Reserve `_js` for multi-step logic.
- **Don't use `global('key')` inside `_js`** — the correct helper is `lowdefyGlobal('key')`. Using `global` will throw a ReferenceError at runtime.
- **Don't perform side effects** — `_js` functions must be pure. No `fetch()`, no `console.log()` in production, no writing to external variables. The function can be called multiple times per render.
- **Don't build huge functions** — if your `_js` block exceeds ~20 lines, consider whether it belongs in a custom plugin instead. Long inline JS is hard to test and debug.
- **Don't use `_js` in `_function` callbacks** — `_function` bodies already have `__args` and double-underscore operators. Use those. `_js` operates at a different evaluation layer and can't access `__args`.
- **Don't forget null guards** — helpers return `undefined` for missing keys, not `null`. Always guard with `|| []`, `|| {}`, `?? ''`, or optional chaining before calling methods like `.map()`, `.filter()`, `.length`.

## Reference Files

- `apps/example-app/pages/lot-view/components/overview_tab.yaml` — `_js` for value formatting (hours suffix, date display)
- `apps/example-app/pages/lot-view/components/estimates_tab.yaml` — `_js` for percentage calculation and scope gap flagging
- `apps/example-app/pages/lot-view/api/lots-advance-gate/lots-advance-gate.yaml` — server-side `_js` for gate checklist validation
- `modules/notifications/actions/set-types.yaml` — `_js` for filtering global enums by notification types

## Template

```yaml
# Client-side: compute a derived value from state/request data
{ property }:
  _js: |
    const data = request('{request_id}') || [];
    const config = lowdefyGlobal('enums.{enum_key}');
    if (!data || !config) return {fallback};
    return data
      .filter(item => {filter_condition})
      .map(item => ({
        value: item._id,
        label: config[item.type]?.title || item.type,
      }));
```

```yaml
# Server-side: build a dynamic MongoDB query from payload filters
- $match:
    _js: |
      const match = { status: 'active' };
      const ids = payload('{filter_field}') || [];
      if (ids.length > 0) {
        match.{field} = { $in: ids };
      }
      return match;
```

## Checklist

- [ ] Confirmed `_js` is necessary — operators can't express this logic cleanly
- [ ] Using `lowdefyGlobal()` (not `global()`) for global state access
- [ ] All helper calls have null guards (`|| []`, `|| {}`, `?.`, `?? fallback`)
- [ ] Function is pure — no side effects, no async, no external state mutation
- [ ] Block is under ~20 lines — longer logic belongs in a custom plugin
- [ ] Server-side `_js` uses `payload()`, `step()`, `state()` — not `request()` or `event()`
- [ ] Client-side `_js` uses `state()`, `request()`, `lowdefyGlobal()` — not `payload()` or `step()`
