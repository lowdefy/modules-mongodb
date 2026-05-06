# Companies Grouping

## Problem

The `companies` module today treats every company as a flat, standalone record. Real-world structures aren't flat: holding companies have subsidiaries, subsidiaries have branches, and the same company can sit under more than one parent at once — joint ventures, multi-program memberships, partial ownership where two holding companies each list the same operating company as a subsidiary.

Apps that manage portfolios of companies need to navigate, filter, and report along that structure.

Concretely, consumers want to:

- Record that one company is a parent of another, and allow more than one parent per company.
- See parent(s) on the detail page and a list of direct children.
- Filter the list page to "everything under company X (including descendants)".
- Pick parents on the edit form without being able to create cycles.

None of this exists in the module today. There is no parent linkage on the document, no aggregation that walks the structure, no UI for it. Apps that need it would have to fork the module.

## Solution at a glance

1. **Schema**: add a single top-level `parent_ids` field (`string[]`, default `[]`) on the company document. A directed acyclic graph (DAG) over companies — any company can have zero or more parents, and any company can have zero or more children. No denormalised `child_ids` or ancestor cache; children and descendants are resolved by reverse query / `$graphLookup`.
2. **Opt-in**: a single new module var `hierarchy.enabled` (default `false`) gates the parent-picker block, the parents/children display on the view page, the hierarchy filter on the list, and the API-side cycle check. When `false`, the module behaves exactly as today and the `parent_ids` field is omitted from new documents entirely.
3. **Edit form**: a new "Parent {label_plural}" multi-select block is appended (conditionally) to the form — the label is composed at the usage site as `_string.concat: ["Parent ", _module.var: label_plural]` (or the consumer's `hierarchy.parent_label` override), giving "Parent Companies" by default. Reuses the existing `company-selector` component in `MultipleSelector` mode, extended with a `cycle_check_ids` var so self + descendants render as **disabled options with a "(would create cycle)" suffix** rather than being hidden — users see the company exists and understand why it's unavailable.
4. **View page**: a single new `tile_hierarchy` sidebar tile with two sections — **Parents** (the resolved names from `parent_ids`, each linked to its view page) and **Children** (direct descendants from a reverse query, each linked). Empty sections collapse. Combining both into one tile keeps hierarchy navigation as a single coherent panel; if deeply nested portfolios start to feel cramped in a flat list, a future iteration can replace the inner block with a TreeSelector-style nested display without changing the surrounding contract.
5. **List page**: a new "Under {label}" filter (single-select company picker). When set, the list aggregation walks the graph via `$graphLookup` from the picked company down through `parent_ids` and matches the picked id + its descendants.
6. **Cycle prevention**: a `$graphLookup`-based pre-check on the API rejects updates whose new parent set would form a cycle; the UI selector additionally renders self + descendants as disabled options with a "(would create cycle)" suffix so the user can see why each one is unavailable rather than wondering why a company is missing.

## Key decisions and rationale

### DAG (`parent_ids[]`), not tree (single `parent_id`)

The use cases the user prioritised — **org structure / holding co.** and **filter/scope on list pages** — both work fine on a tree, but real-world org structures regularly include cases a tree can't model:

- A subsidiary jointly owned by two holding companies (each holding co. wants to see it on its subsidiaries list).
- An operating company that sits inside both a regional grouping and a service-line grouping.
- M&A transitions where one company is being moved between parents and, briefly, sits under both.

Forcing a tree means apps either pick one parent and lose the others, or pick one and shoehorn the rest into `attributes`. Both are fragile.

DAG costs little extra:

- `$graphLookup` walks array-valued connect fields natively (`connectFromField: "parent_ids"` works with no extra `$unwind`).
- Children are still a single indexed match (`{ parent_ids: <id> }` matches multikey arrays).
- Cycle prevention is the same shape — just framed as "self must not be a descendant of any candidate parent" instead of "self must not be in the ancestor chain of the candidate parent".

The price is a multi-select parent picker instead of single-select, and a parent line on the view page that may render multiple links instead of one. Both are acceptable for the flexibility gained.

### `parent_ids` as top-level field, not nested

Looking at the existing schema:

- `name`, `description` — top-level user fields
- `contact`, `address`, `registration`, `attributes` — sub-objects, configurable via `fields.*` slots
- `removed`, `lowercase_email`, `created`, `updated` — top-level structural / system fields

`parent_ids` is structural, not a user attribute. It belongs alongside `removed` at the top level, not inside `attributes`. This keeps `$graphLookup`'s `connectFromField` short and makes the multikey index (which the index design step will add) trivially named.

**Not** putting it under `attributes.parent_ids` because (a) `attributes` is the user-defined extras bucket and shouldn't have module-defined semantics inside it, and (b) it would make every `$graphLookup` and selector query wear the longer path.

### Opt-in via a single `hierarchy.enabled` flag, not slots

Hierarchy isn't just a field — it's a coordinated set of behaviours:

- A field on the schema and the form
- A tile on the view page
- A filter on the list page
- A descendants-resolution request feeding the list filter
- A cycle-check stage in `update-company`
- A disable-with-label projection on the parent selector

Slot extension (`fields.*`, `components.*`, `request_stages.*`) handles each piece in isolation, but the cycle check + selector exclusions + filter aggregation have to be coherent across surfaces. Asking a consuming app to wire all six together via slots is fragile — they will get one piece wrong and silently break cycle prevention. A single master flag is the right shape.

The flag is namespaced (`hierarchy.enabled`) so future hierarchy-specific options (`hierarchy.parent_label`, `hierarchy.children_label`, …) can join it without polluting the top-level var space.

When `hierarchy.enabled: false` (the default), every hierarchy-related block, request, and stage is build-time-skipped via `_build.if`. Apps that don't want hierarchy pay zero runtime cost and see no UI changes from today. The `parent_ids` field is also omitted from the insert template, so non-hierarchy documents don't even have an empty array on disk.

### Cycle prevention: API + UI, both required

User chose both. Why each is needed:

- **API (server-side)** is the authoritative guard. Without it, a direct `update-company` call from a tool, a bad migration, or any path that bypasses the form can corrupt the graph into a cycle. `$graphLookup` then truncates silently at `maxDepth` (default 20), which surfaces as data the operator can investigate rather than runaway requests — but the API guard is what stops the corruption from being written in the first place.
- **UI (client-side)** is the user-experience layer. Rendering self + descendants as **disabled options with a "(would create cycle)" suffix** tells the user *up front* which companies aren't valid parents and *why*. Hiding them entirely was the alternative considered, but it would leave users searching for a company that genuinely exists and getting nothing back — a worse experience than seeing it greyed out with an explanation.

The two checks read the same source of truth (`$graphLookup` from `_state._id` down through `parent_ids` to enumerate descendants on the edit page; `$graphLookup` from each candidate parent down through `parent_ids` to check whether self appears in the descendants on the API). Both rely on the same multikey index on `parent_ids`.

#### Cycle check formalisation

A new `parent_ids` set creates a cycle iff self is reachable as a descendant of any element of the new `parent_ids`. Equivalently, in graph terms: adding edges from each `p ∈ parent_ids` to self would close a loop iff there is already a path from self to `p`.

The check is one `$match` followed by one `$graphLookup` per update:

- `$match`: `{ _id: { $in: <candidate parent_ids from payload> } }` — pulls the candidate parent docs into the pipeline as starting points.
- `$graphLookup`:
  - `from`: companies-collection
  - `startWith`: `"$_id"` (the matched candidate parent's own `_id`)
  - `connectFromField`: `parent_ids`
  - `connectToField`: `_id`
  - `as`: `__ancestors`

If `<self._id>` appears in the `_id` field of any matched candidate parent or any document in `__ancestors`, the update is rejected. Equivalent to: "is self in the ancestor closure of the candidate parent set?". The concrete projection at the end (see "Cycle-check step layout" below) folds these two cases into one boolean by `$concatArrays: [["$_id"], "$__ancestors._id"]`.

(Direction note: `parent_ids` points from a child to its parents, so walking *from* `parent_ids` *to* `_id` walks *upward* — toward roots. The cycle check confirms self is not above its own would-be parents.)

### Children are reverse-queried, not denormalised

Two ways to know a company's children:

- **Reverse query** — `$match: { parent_ids: <id> }` (multikey index hit), plus `$graphLookup` from `<id>` for descendants.
- **Denormalised** — store `child_ids[]` on the parent doc, maintained on every parent change.

Denormalisation makes reads slightly faster but introduces a maintenance burden:

- Every `update-company` that changes `parent_ids` has to compute the diff (added parents, removed parents) and update each affected parent's `child_ids` (`$addToSet` / `$pull`). For a multi-parent change that's up to N+M `MongoDBUpdateOne` calls.
- Same for `create-company` when parents are set on creation.
- Bulk migrations or external writes that bypass the API silently desync.

The reverse query takes one indexed lookup per child query, plus one `$graphLookup` per descendants query. These run on the view page (one parent, expected ≤ ~20 children) and on the list page (one filter, expected depth ≤ 5). Both are cheap. The denormalisation cost is not justified here.

A multikey index on `parent_ids` (added in the index design step, not in this design) keeps both queries fast.

### Descendants computed on demand, not stored as ancestor cache

Same trade-off, different field. Storing `hierarchy.ancestors: [...]` on every doc would make the list filter a single `$match` instead of a `$graphLookup`. But it requires cascading rewrites: changing one company's parents means rewriting the ancestor cache on that company *and all of its descendants* — a recursive update that's awkward to express in a single MongoDB pipeline, and especially awkward in a DAG where one descendant has multiple ancestor paths to merge.

For typical depths (< 6 levels) and typical company counts (< 10K), `$graphLookup` on an indexed multikey `parent_ids` is well under 100ms. Keep on-demand traversal, revisit if a real perf issue surfaces.

### Naming: `parent_ids`, not `parent_company_ids`

The field lives on a `companies` collection document; "company" is implied by the namespace. `parent_ids` matches the existing convention where structural references inside the same collection drop the collection name (e.g., `_id`). Cross-collection references like `global_attributes.company_ids` (on the contacts side) keep the collection name because the type isn't otherwise clear.

### `parent_ids` is a set, not an ordered list

Order is not preserved or interpreted. There is no "primary parent". The selector on the form may render in selection order, but the saved array carries no semantic ordering, and the view page is free to sort by parent name. If a future use case requires "primary parent" semantics (e.g., for a single breadcrumb on the header), it would justify either a separate `primary_parent_id` field or promoting `parent_ids` to a structured `parents: [{ id, role }]` shape — out of v1.

### `$graphLookup` capped at `hierarchy.max_depth` (default 20)

Every `$graphLookup` in this design — descendants, ancestors, cycle check — passes `maxDepth: { _module.var: hierarchy.max_depth }`. The default is 20, which comfortably exceeds typical org-structure depths (<10) while preventing any cycle that slipped past the API guard from running unbounded.

This is a defensive backstop, not the primary safety. The cycle check (see "Cycle prevention") is what *prevents* cycles from being written. `maxDepth` only matters if a cycle somehow exists in the data — at which point an uncapped `$graphLookup` could run unboundedly, while a capped one truncates silently. Truncation is preferable to runaway in that scenario; the cycle would still surface as a data corruption that operators can investigate, but it wouldn't hang requests.

Apps with unusually deep hierarchies can override via `hierarchy.max_depth: 50` in their entry vars. The var is exposed alongside `enabled`, `parent_label`, and `children_label`.

(Earlier draft of this design left `$graphLookup` uncapped on the principle that the cycle check should be the only safety boundary. Revised to belt-and-braces — the runtime cost of `maxDepth` is negligible, and the operational cost of a cycle leaking past the guard is high.)

### Removed parents leave dangling references in `parent_ids`

The repo-wide soft-delete idiom is a boolean: documents are inserted with `removed: null` and soft-deleted by setting `removed: true` (see `modules/files/api/delete-file.yaml:14`, `modules/files/api/save-file.yaml:37`, `modules/companies/api/create-company.yaml:41`). Plain-aggregation queries filter via `removed: { $ne: true }` (see `modules/companies/requests/get_company.yaml:13`, `get_companies_for_selector.yaml:8`, `modules/contacts/requests/get_contact_companies.yaml:18`, `modules/files/requests/get-entity-files.yaml:12`). All new requests added by this design use the same shape.

When a parent company is soft-deleted, nothing rewrites the `parent_ids` arrays on its children. The view page's parent-name `$lookup` filters for `removed: { $ne: true }` and simply returns no row for the dangling id; the children-tile's reverse query continues to find the soft-deleted parent's children fine. The `parent_ids` array remains accurate as an audit record of "what this company was a child of at the time".

Alternatives considered:

- **Auto-orphan** (`$pull` deleted ids from every child's `parent_ids` on soft-delete) — destroys the audit trail and silently re-roots children. If the soft-delete is reverted (`removed: null`), the parent links are gone and have to be reconstructed manually.
- **Block deletion until reassigned** — forces the user to think about each child, but creates friction for the common case (deleting a stub or duplicate company that has no important descendants). Not worth the UX cost in v1.

The view page should render dangling parents either as plain text "(removed)" or simply not at all — decide at implementation time when the lookup result shape is concrete.

### `$graphLookup` traversal does not skip soft-deleted nodes

`$graphLookup` runs without a `restrictSearchWithMatch` clause. Both the cycle check and the descendants/ancestors traversals walk through soft-deleted intermediate nodes as if they were live.

Consequence for the list filter "show all under company X (incl. descendants)": if an intermediate parent is soft-deleted, its subtree still appears under X. The user-visible parent chain in the UI may not match the filter result — a child whose only path to X is through a removed company will still show up.

Consequence for the cycle check: cycles that pass through a soft-deleted node are still caught, blocking updates that would re-form a cycle if the deleted node were restored. This is the conservative integrity choice.

The alternative — passing `restrictSearchWithMatch: { removed: { $ne: true } }` — gives a list filter that matches user-visible structure but lets latent cycles slip through deleted nodes, surfacing as corruption only on un-delete. Rejected because cycle prevention is the load-bearing invariant for this feature; the filter mismatch is cosmetic and rare.

## Schema

Top-level field added to the company document:

```yaml
parent_ids: string[]    # _ids of zero or more other companies (DAG edges from child up to parents)
```

Default on insert (when hierarchy enabled): `[]`. When `hierarchy.enabled: false`, the field is omitted from the insert template entirely — non-hierarchy documents stay byte-identical to today's documents.

Nothing else changes — no new sub-objects, no derived fields, no ancestor cache, no denormalised `child_ids`.

## Module config

New var on `module.lowdefy.yaml`:

```yaml
vars:
  hierarchy:
    type: object
    description: Configuration for parent-child relationships between companies.
    properties:
      enabled:
        type: boolean
        default: false
        description: >-
          When true, adds a parent-companies multi-select to the edit form,
          shows parents + children in a sidebar tile on the view page, adds
          a "Under {label}" filter to the list page, and enforces cycle
          prevention in the create/update APIs. Companies form a DAG (each
          company can have multiple parents). When false, no hierarchy UI
          or logic is emitted and the parent_ids field is omitted from new
          documents.
      parent_label:
        type: string
        description: >-
          Optional override for the parent multi-select label on the edit form
          and the parents line on the view page. When unset, the label falls
          back at the usage site to `_string.concat: ["Parent ", _module.var:
          label_plural]`, giving "Parent Companies" by default.
      children_label:
        type: string
        description: >-
          Optional override for the children tile heading on the view page.
          When unset, the label falls back at the usage site to
          `_string.concat: ["Child ", _module.var: label_plural]`, giving
          "Child Companies" by default.
      max_depth:
        type: number
        default: 20
        description: >-
          Defensive cap on every $graphLookup in this module's hierarchy
          pipelines (descendants resolution + cycle check). 20 comfortably
          exceeds typical org depths (<10). The cycle check is the primary
          guard against runaway traversals; max_depth backstops the rare
          case where a cycle leaks past the API check, by truncating
          silently rather than running unboundedly.
```

Apps enable hierarchy in their entry config:

```yaml
modules:
  - id: companies
    source: "github:lowdefy/modules-mongodb/modules/companies@v0.3.0"
    vars:
      hierarchy:
        enabled: true
```

## Architecture / data flow

### Edit form (when `hierarchy.enabled`)

The edit page's `onMount` becomes a **three-step sequence** so the parent-selector's options request fires *after* both the descendants resolve and the resulting id list is written to state. This avoids a first-render flash where self briefly appears as a valid parent.

```yaml
onMount:
  - id: fetch_doc_data
    type: Request
    params:
      - get_company
      - get_company_contact_ids
      - get_descendant_company_ids   # parallel with the others; shared request
  - id: set_state
    type: SetState
    params:
      # ...existing scalar copies from get_company.0...
      parent_ids:
        _if_none: [_request: get_company.0.parent_ids, []]
      cycle_check_ids:
        _if_none: [_request: get_descendant_company_ids.0.ids, []]
  - id: fetch_selector_options       # runs after set_state — Lowdefy actions sequential by default
    type: Request
    params: get_companies_for_selector
```

The selector's underlying request reads `_state: cycle_check_ids` (not `_payload`), because Lowdefy's `_var` is build-time and we need run-time data to flow in. `set_state` between steps 1 and 3 writes that path so step 3's request payload sees the resolved descendants on its first invocation.

The `parent_selector` wrapper component does **not** define its own `onMount` — the existing `company-selector.yaml:11-15` self-fetch is replaced by the page-driven sequence above. (For other pages that use `company-selector` outside the edit form, the existing self-fetch behaviour is preserved by leaving `company-selector.yaml` alone and putting the override on `parent_selector.yaml`.)

Step-by-step:

1. **Step 1** runs three requests in parallel: `get_company` (the doc itself, existing), `get_company_contact_ids` (existing), and `get_descendant_company_ids` (new shared request — returns `{ ids: [self, ...descendants] }`).
2. **Step 2** copies the loaded values into state — including `cycle_check_ids: [self, ...descendants]` from the descendants request, and the form's input fields from the doc.
3. **Step 3** fires `get_companies_for_selector`. By the time it runs, `state.cycle_check_ids` is populated, so the selector's projection's `$cond: { $in: ["$_id", cycle_check_ids] }` evaluates correctly on the first render.
4. The parent_selector reuses `company-selector` in `MultipleSelector` mode and reads `_state: cycle_check_ids` via the underlying request's payload. The selector's request projects an extra `disabled` field per row using `$cond: { if: { $in: ["$_id", cycle_check_ids] }, then: true, else: false }` and rewrites `label` for matching rows to suffix `" (would create cycle)"`. The selector block's `optionConfig` gains `disabledField: disabled`. Self + descendants therefore appear in the dropdown as greyed-out options the user can see but cannot pick.
5. On submit, `parent_ids` (an array, possibly empty) is included in the form payload.

(On the `new` page there are no descendants and no self. The descendants request can be skipped — payload `root_id: undefined` returns no rows, `cycle_check_ids` resolves to `[]`, every option is enabled, no `$cond` branches fire, the selector behaves as a plain company picker. The three-step `onMount` still applies but the descendants request returns immediately.)

### View page (when `hierarchy.enabled`)

A single sidebar tile, `tile_hierarchy`, renders both parents and children. It runs two requests and stitches the results into two visual sections inside one tile:

1. **Parents** — the existing `get_company` request is extended with a `$lookup` on `parent_ids` (multikey lookup returns one row per parent) that returns each parent's `_id` plus the field named by `_module.var: name_field`, **filtered to non-removed parents only** (`pipeline: [{ $match: { removed: { $ne: true } } }]` inside the `$lookup`). The projected shape on the request result is `parents: [{ _id, <name_field>: <name> }, ...]`. The view block reads names via `_module.var: name_field` since the field key is configurable rather than literal. Soft-deleted parents are simply absent from the array. (Lookup stage is `_build.if`-gated on `hierarchy.enabled`.)
2. **Children** — a new request `get_company_children` issues `$match: { parent_ids: <self._id>, removed: { $ne: true } }`, projecting `_id` + `name_field`. Returns the array of direct children.
3. **Tile rendering** — `tile_hierarchy` is a single sidebar tile with two stacked sections, each with its own heading (`hierarchy.parent_label` / `hierarchy.children_label`, falling back to `_string.concat: ["Parent ", _module.var: label_plural]` and `_string.concat: ["Child ", _module.var: label_plural]`). Each section renders an empty state when its array is empty (or the section's heading + empty state hides entirely). When both arrays are empty, the whole tile hides.

A future iteration can swap the inner flat lists for a TreeSelector-style nested view without changing the request shape or the tile's surrounding placement — the requests already return enough structure (`_id` + name) to build deeper drill-downs from.

### List page (when `hierarchy.enabled`)

The list filter is the **lowest-priority** piece of this design — schedule it after the edit form, view page, and API cycle check. Apps without it still get hierarchy editing and display; the filter is convenience, not core.

1. A new filter block (single-select `company-selector` in plain selector mode — no `cycle_check_ids` plumbing, since cycles are a write-time concern) is appended to `filter_companies`. State key: `filter.parent_scope`. The picked company's `_id` is what the user wants to scope the list under.
2. The hierarchy filter is implemented by **pre-resolving descendants in a separate request**, then feeding the resulting id list into the existing Atlas Search `compound.must` array. `$graphLookup` cannot run inside a `$search` stage (Atlas Search must be the first pipeline stage), so the alternative — placing `$graphLookup` after `$search` but before `$facet` — was rejected because it bypasses the search index for hierarchy filtering and walks `$graphLookup` per result row.
3. Concrete wiring:

   The list page reuses the **same `get_descendant_company_ids` request** the edit form uses. Lowdefy resolves a request's payload from the request file (not from the invocation site), so the request file uses an `_if_none` fallback chain that picks the right state path per consumer:

   ```yaml
   id: get_descendant_company_ids
   type: MongoDBAggregation
   connectionId:
     _module.connectionId: companies-collection
   payload:
     # List page sets state.filter.parent_scope → wins.
     # Edit page leaves filter.parent_scope undefined and sets state._id → falls through.
     root_id:
       _if_none:
         - _state: filter.parent_scope
         - _state: _id
   properties:
     pipeline:
       - $match:
           _id:
             _payload: root_id
           removed:
             $ne: true
       - $graphLookup:
           from: companies
           startWith: "$_id"
           connectFromField: _id
           connectToField: parent_ids
           maxDepth:
             _module.var: hierarchy.max_depth
           as: __descendants
       - $project:
           ids:
             $concatArrays:
               - ["$_id"]
               - "$__descendants._id"
   ```

   When `filter.parent_scope` is unset *and* `_id` is unset (e.g. on a brand-new page with no doc context), the `$match` returns no rows, the request result is `[]`, and downstream consumers see no ids.

   **`filter_companies.yaml`** appends the new selector with a chained `onChange` that resolves descendants then re-fetches the list:

   ```yaml
   onChange:
     - id: resolve_descendants
       type: Request
       params: get_descendant_company_ids
     - _ref: actions/search.yaml      # re-fires get_all_companies
   ```

   **`get_all_companies.yaml`** gains a payload field pulling from the descendants request, and a conditional `must` clause inside the existing Atlas Search compound filter:

   ```yaml
   payload:
     # ...existing fields...
     parent_scope_ids:
       _request: get_descendant_company_ids.0.ids
   ```

   ```yaml
   # Inside the existing compound.must _array.concat:
   - _if:
       test:
         _gt:
           - _array.length:
               _if_none:
                 - _payload: parent_scope_ids
                 - []
           - 0
       then:
         - in:
             path: _id
             value:
               _payload: parent_scope_ids
       else: []
   ```

4. No parents column is added to the default table. Apps that want one add it via the existing `components.table_columns` slot. (Rationale: the column is clutter in flat-portfolio apps, which are the majority; the slot is already the right extension point.)

Notes:

- Atlas Search `in` over `_id` requires the search index to map `_id` as a `string` (which it already does — Atlas auto-indexes `_id`). Worth confirming on the deployed search index when wiring this up.
- The Reset/Clear button on the existing filter row already invokes `actions/search.yaml`; clearing `filter.parent_scope` re-runs the descendants request with `root_id: undefined`, returns `ids: []`, and the conditional `must` clause skips — no special teardown needed.

### API (when `hierarchy.enabled`)

Both `create-company` and `update-company` accept `parent_ids` in the payload (an array, defaulting to `[]`) and write it through. `update-company` runs a cycle pre-check stage:

1. `$match` the candidate parent docs (`_id: { $in: <payload.parent_ids> }`) into the pipeline, then `$graphLookup` upward through `parent_ids` from each (`connectFromField: "parent_ids"`, `connectToField: "_id"`).
2. If `<payload._id>` (self) appears in either the candidate parent set or the resulting ancestor closure, the API returns an error and the update is aborted before the `$set` stage.

For `create-company`, the cycle check is unnecessary — a brand-new doc has no descendants, so no parent set can form a cycle.

When `hierarchy.enabled: false`, the cycle-check step, the `parent_ids` payload acceptance, and the `parent_ids` field itself are all build-time-omitted via `_build.if` on `hierarchy.enabled`. Documents in non-hierarchy apps stay free of the field.

#### Cycle-check step layout (`update-company`)

Lowdefy API routines have no `throw` step. The established primitives are `:return:` (sets the API response and ends the routine) and `skip:` (conditionally bypasses a step), seen at `modules/companies/api/create-company.yaml:135-137` and `modules/files/api/delete-file.yaml:22-24`. The cycle check uses both:

```yaml
# All four steps below are _build.if-injected when hierarchy.enabled is true.
- id: cycle_check
  type: MongoDBAggregation
  connectionId:
    _module.connectionId: companies-collection
  properties:
    pipeline:
      - $match:
          _id: { $in: { _payload: parent_ids } }
      - $graphLookup:
          from: companies
          startWith: "$_id"
          connectFromField: parent_ids
          connectToField: _id
          maxDepth:
            _module.var: hierarchy.max_depth
          as: __ancestors
      - $project:
          has_cycle:
            $in:
              - { _payload: _id }
              - $concatArrays:
                  - [ "$_id" ]
                  - "$__ancestors._id"
      # OR-reduce across all matched candidate parents into a single doc.
      # Without this stage, the projection produces one doc per matched
      # candidate parent — and downstream `_step.cycle_check.0.has_cycle`
      # would only inspect the first doc, missing cycles via candidate
      # parent #2 or later.
      - $group:
          _id: null
          has_cycle:
            $max: "$has_cycle"

- :return:
    error: would_create_cycle
  skip:
    _ne:
      - _step: cycle_check.0.has_cycle
      - true

# Existing steps below — `update`, `unlink-old-contacts`, `link-new-contacts`,
# `new-event`, `:return: success` — each gain a defensive skip so they don't run
# if the cycle was detected. (Belt-and-braces: the early :return: above should
# already short-circuit, but explicit skips make the routine robust against any
# difference in :return: semantics.)
  skip:
    _eq:
      - _step: cycle_check.0.has_cycle
      - true
```

Three notes on this layout:

- **`cycle_check` projects a single boolean per matched candidate parent, then OR-reduces to a single doc.** The `$project` stage runs once per matched candidate parent doc (one per `_id` in `payload.parent_ids`), each producing its own `has_cycle` flag. The `$group` stage then OR-reduces (`$max` on booleans gives `true || false → true`) into a single output doc. Without the `$group`, downstream `_step.cycle_check.0.has_cycle` would only inspect the first matched candidate's flag and miss cycles formed via the second-or-later candidate. With `$group`, the result is always a one-element array whose `has_cycle` is the OR across all candidates.
- **Why a `$match` before `$graphLookup`.** `$graphLookup` needs a starting document set; the simplest is to start at *the candidate parents themselves*, treat each as the root of an upward walk, and check whether self appears at any node visited (the candidate parents themselves count, hence the `$concatArrays` with `["$_id"]`).
- **The defensive `skip` on every existing step is build-injected at the same time as the cycle-check step.** When `hierarchy.enabled: false`, none of the cycle-check infrastructure is emitted and the existing steps run unconditionally as today. When `hierarchy.enabled: true`, every existing step's YAML gains the `skip:` block via the same `_build.if` that injects the new steps.

For `create-company`, no `cycle_check` / early `:return:` are needed — a fresh doc has no descendants, so the cycle invariant cannot be broken on insert. The only build-gated change there is accepting `parent_ids` in the `MongoDBInsertConsecutiveId.doc` block.

## Files changed

**New:**

- `modules/companies/components/tile_hierarchy.yaml` — single sidebar tile rendering parents (top section) and children (bottom section), each driven by its own request; empty sections collapse, fully-empty tile hides.
- `modules/companies/components/parent_selector.yaml` — wraps `company-selector` (in `MultipleSelector` mode) with the cycle-check disable-with-label projection. Has no own `onMount`; the edit page sequences its options fetch after descendants are available (see Architecture / Edit form).
- `modules/companies/requests/get_descendant_company_ids.yaml` — single shared request: takes `root_id` in payload, runs `$graphLookup` downward through `parent_ids`, returns `{ ids: [root, ...descendants] }`. Used on the edit form (payload `root_id: _state._id`) to populate `cycle_check_ids` for the parent selector, and on the list page (payload `root_id: _state.filter.parent_scope`) to feed the Atlas Search `must` clause on `get_all_companies`. Same request file, two consumers, two payloads.
- `modules/companies/requests/get_company_children.yaml` — direct children only (`$match` on `parent_ids` multikey).
- A cycle-check pipeline fragment, either as a stage embedded in `update-company.yaml` or extracted to `requests/stages/check_parent_cycle.yaml` (decide at task-breakdown).

**Modified:**

- `modules/companies/module.lowdefy.yaml` — add `hierarchy` var, bump version.
- `modules/companies/api/create-company.yaml` — accept and write `parent_ids` (build-gated).
- `modules/companies/api/update-company.yaml` — accept `parent_ids`, run cycle check, write field (build-gated).
- `modules/companies/components/form_company.yaml` — append parent multi-select block (build-gated).
- `modules/companies/pages/view.yaml` — append `_ref: components/tile_hierarchy.yaml` to the sidebar column's `blocks` array (build-gated). `view_company.yaml` itself is unchanged — parents render in the sidebar tile, not inside the main view body.
- `modules/companies/components/filter_companies.yaml` — add parent-scope filter (build-gated).
- `modules/companies/requests/get_all_companies.yaml` — accept `parent_scope_ids` payload (sourced from `_request: get_descendant_company_ids.0.ids`) and append a conditional Atlas Search `in: { path: "_id", value: parent_scope_ids }` clause to the existing `compound.must` array. No `$graphLookup` inside this pipeline — descendants are pre-resolved by `get_descendant_company_ids` and fed in via payload.
- `modules/companies/requests/get_company.yaml` — `$lookup` parent names (multikey).
- `modules/companies/components/company-selector.yaml` — add `cycle_check_ids` var (passed through to the underlying request as payload), and pass `disabledField: disabled` in `optionConfig` so disabled rows render greyed out.
- `modules/companies/README.md` — Vars section, How to Use snippet for enabling hierarchy.
- `apps/demo/modules/companies/vars.yaml` — set `hierarchy.enabled: true` to demo the feature. No seed data; users exercise the feature manually against existing demo records.

## Interaction with other planned features

- **Company fields design (`designs/company-fields/`).** Companies-grouping doesn't touch the configurable `fields.*` slots. `parent_ids` sits at the top level alongside `name` and `description`, separate from `fields.contact / address / registration / attributes`. The two designs compose cleanly: an app can enable hierarchy and supply its own field presets independently.
- **Contacts module.** Out of scope for v1 (cross-module reporting wasn't selected). The `companies ↔ contacts` link continues to work unchanged. A future enhancement could let `get_contacts` filter by "all contacts at any descendant of company X" — that's an additive request, not a schema change.
- **Indexes.** This design assumes a multikey index on `parent_ids` (ascending). The actual index definition belongs in the project's index step (e.g., `index-dev`), not here.

## Related cleanup (out of this design's scope)

The soft-delete audit done while writing this design surfaced two pre-existing issues unrelated to companies-grouping. Calling them out so the implementer doesn't trip over them when adding new soft-delete-aware requests:

- **Companies' Atlas Search filter is a no-op.** `modules/companies/requests/get_all_companies.yaml:18-22` and `modules/companies/requests/get_company_excel_data.yaml:23` both use Atlas Search `mustNot: [{ exists: { path: 'removed.timestamp' } }]`. Since `removed` is a boolean (`null` or `true`) — not an object with a `timestamp` subfield — the `removed.timestamp` path never exists, so the `mustNot` clause is always satisfied and the filter never excludes soft-deleted documents. Today this is harmless because no `delete-company` API exists yet; the moment one is added (or a doc is soft-deleted by hand), soft-deleted companies will start leaking into the list and Excel export. The fix is an Atlas Search `equals`-with-`mustNot` clause: `mustNot: [{ equals: { path: 'removed', value: true } }]`. Out of scope for this design but worth filing as a bug.
- **`user-admin` queries use literal `removed: null` instead of `{ $ne: true }`.** `modules/user-admin/requests/get_all_users.yaml:95` and `modules/user-admin/requests/get_user_excel_data.yaml:97` match `removed: null` literally. This works today because the user-admin insert path always sets `removed: null` explicitly — but it's narrower than the `$ne: true` form used in companies, contacts, and files, and would silently exclude documents where `removed` is missing. Stylistic inconsistency, not a bug. Worth normalising in a follow-up.

## Non-goals

- Cross-module hierarchy roll-ups (e.g., "all contacts under any descendant of X"). Out of v1.
- Hierarchical permissions (e.g., "user can only see their assigned subsidiary subgraph"). Out of scope; permissions live elsewhere.
- Denormalised ancestor cache or `child_ids` on documents. On-demand `$graphLookup` is the v1 approach.
- Edge-level metadata (e.g., "what kind of relationship is this — ownership, partnership, franchise?"). The DAG carries unweighted, untyped edges in v1; if a use case for typed edges appears, it would justify promoting `parent_ids: [string]` to `parents: [{ id, type, ... }]` in a follow-up.
- A general-purpose "hierarchy" plugin pattern reusable across modules. Companies is the first concrete instance; if a second module needs the same shape, the abstraction can be extracted then.
- Bulk re-parent operations (move-with-subgraph, drag-and-drop graph editor). v1 supports re-parenting one company at a time via the edit form; descendants follow automatically since they reference the changed company by `_id`, not by path.

