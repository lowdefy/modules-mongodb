# Task 9: Children request, hierarchy sidebar tile, view-page wiring

## Context

The view page renders a single sidebar tile, `tile_hierarchy`, with two stacked sections — **Parents** (top) and **Children** (bottom). Each section has its own data source:

- **Parents** comes from the extended `get_company` request (task 8) — `_request: get_company.0.parents`.
- **Children** comes from a new request `get_company_children` — direct children only via reverse multikey query.

Each section has its own heading (`hierarchy.parent_label` / `hierarchy.children_label` with `_string.concat` fallbacks). When a section's array is empty, the section hides; when both are empty, the whole tile hides.

The tile is appended to `pages/view.yaml`'s sidebar column blocks, build-gated on `hierarchy.enabled`. `view_company.yaml` (the main-column view) is unchanged — parents do not render in the main view body.

The design notes that a future iteration could swap the inner flat lists for a TreeSelector-style nested view without changing the tile's surrounding placement or the request shapes.

## Task

### A. Create `modules/companies/requests/get_company_children.yaml`

Direct-children query (one indexed multikey `$match` against `parent_ids`, no `$graphLookup`):

```yaml
id: get_company_children
type: MongoDBAggregation
connectionId:
  _module.connectionId: companies-collection
payload:
  parent_id:
    _url_query: _id
properties:
  pipeline:
    - $match:
        parent_ids:
          _payload: parent_id
        removed:
          $ne: true
    - $addFields:
        display_name:
          $getField:
            field:
              _module.var: name_field
            input: "$$ROOT"
    - $project:
        _id: 1
        display_name: 1
    - $sort:
        display_name: 1
```

`payload.parent_id: _url_query: _id` matches the convention used by `get_company.yaml` and `get_company_contacts.yaml` — the view page reads the company `_id` from the URL query. The match `parent_ids: <id>` hits the multikey index on `parent_ids`.

### B. Create `modules/companies/components/tile_hierarchy.yaml`

The companies module's tile pattern (verified against `modules/companies/components/tile_contacts.yaml` and `modules/companies/components/contact_list_items.yaml`) is:

1. Tile-frame is `_ref: { module: layout, component: card }` with a `title:` and `blocks:` var.
2. The `blocks` is a Box that owns the requests (via `requests:` block) and the rendering.
3. The actual rendering is an `Html` block with an `_nunjucks` template — *not* `List` + `itemTemplate`. Loops, conditionals, and per-item access all happen in the Nunjucks template, which receives the request results via the `on:` map.

Mirror that pattern for `tile_hierarchy`. The `Html` template renders both Parents and Children sections inline, with section visibility handled by `{% if parents.length %}` / `{% if children.length %}` Nunjucks conditionals. The whole tile hides when both arrays are empty using a `visible:` expression on the outer card.

```yaml
_ref:
  module: layout
  component: card
  vars:
    title:
      _string.concat:
        - _module.var: label
        - " Hierarchy"
    blocks:
      - id: hierarchy_content
        type: Box
        visible:
          _or:
            - _gt:
                - _array.length:
                    _if_none:
                      - _request: get_company.0.parents
                      - []
                - 0
            - _gt:
                - _array.length:
                    _if_none:
                      - _request: get_company_children
                      - []
                - 0
        blocks:
          - id: hierarchy_html
            type: Html
            properties:
              html:
                _nunjucks:
                  template: |
                    {% if parents.length %}
                    <div style="padding-bottom:12px">
                      <div style="font-weight:600; padding-bottom:6px">{{ parent_heading }}</div>
                      {% for parent in parents %}
                      <div style="padding:4px 0">
                        <a href="/{{ view_page }}?_id={{ parent._id }}" style="color:inherit">
                          {{ parent[name_field] }}
                        </a>
                      </div>
                      {% endfor %}
                    </div>
                    {% endif %}

                    {% if children.length %}
                    <div>
                      <div style="font-weight:600; padding-bottom:6px">{{ children_heading }}</div>
                      {% for child in children %}
                      <div style="padding:4px 0">
                        <a href="/{{ view_page }}?_id={{ child._id }}" style="color:inherit">
                          {{ child.display_name }}
                        </a>
                      </div>
                      {% endfor %}
                    </div>
                    {% endif %}
                  on:
                    parents:
                      _if_none:
                        - _request: get_company.0.parents
                        - []
                    children:
                      _if_none:
                        - _request: get_company_children
                        - []
                    parent_heading:
                      _if_none:
                        - _module.var: hierarchy.parent_label
                        - _string.concat:
                            - "Parent "
                            - _module.var: label_plural
                    children_heading:
                      _if_none:
                        - _module.var: hierarchy.children_label
                        - _string.concat:
                            - "Child "
                            - _module.var: label_plural
                    name_field:
                      _module.var: name_field
                    view_page:
                      _module.pageId: view
```

Per-item rendering notes:

- **Parents** come from `get_company.0.parents` (task 8's `$lookup` projects each as `{ _id, <name_field>: <name> }` where `<name_field>` is configurable). The Nunjucks template reads `parent[name_field]` to get the resolved name.
- **Children** come from `get_company_children` which projects `display_name` via `$getField` on `name_field` (per A above), so the Nunjucks template just reads `child.display_name`. (No need for the `parent[name_field]` indirection here because the `$getField` projection is already done server-side.)
- **`view_page`** is `_module.pageId: view` — the scoped page id ("companies/view" or whatever the module-entry namespace produces). The href format mirrors `contact_list_items.yaml:30` where the contacts tile builds links like `/{{ contact_detail_page }}?_id={{ contact._id }}`.

### C. Modify `modules/companies/pages/view.yaml`

Two changes:

1. **Add `get_company_children` to the page's `requests:` list** so it's available:

   ```yaml
   requests:
     _build.array.concat:
       - - _ref: requests/get_company.yaml
       - _build.if:
           test:
             _module.var: hierarchy.enabled
           then:
             - _ref: requests/get_company_children.yaml
           else: []
   ```

2. **Add `get_company_children` to the page's `onMount` `fetch` action** (build-gated):

   ```yaml
   onMount:
     - id: fetch
       type: Request
       params:
         _build.array.concat:
           - - get_company
           - _build.if:
               test:
                 _module.var: hierarchy.enabled
               then:
                 - get_company_children
               else: []
     - id: redirect_if_not_found
       ...   # existing
   ```

3. **Append `tile_hierarchy` to the sidebar column's `blocks` array** (build-gated). The current sidebar block at `pages/view.yaml:97-107`:

   ```yaml
   - id: sidebar_column
     type: Box
     layout: ...
     blocks:
       _build.array.concat:
         - - _ref: components/tile_contacts.yaml
           - _ref: components/tile_events.yaml
         - _build.if:
             test:
               _module.var: hierarchy.enabled
             then:
               - _ref: components/tile_hierarchy.yaml
             else: []
         - _module.var: components.sidebar_slots
   ```

   Place `tile_hierarchy` between the existing static tiles and the consumer-supplied `sidebar_slots` so consumer slots come last (preserves consumer expectations about ordering).

## Acceptance Criteria

- `modules/companies/requests/get_company_children.yaml` exists per shape (A).
- `modules/companies/components/tile_hierarchy.yaml` exists with two visibility-gated sections.
- `modules/companies/pages/view.yaml` references the new request and tile, build-gated on `hierarchy.enabled`.
- When `hierarchy.enabled: false`: view page is identical to today (no extra request, no extra tile in sidebar).
- When `hierarchy.enabled: true`:
  - Companies with parents render the Parents section with names and clickable links to each parent's view page.
  - Companies with children render the Children section likewise.
  - Empty sections are hidden (heading + list collapse).
  - Empty tile (no parents and no children) is hidden entirely.
  - Soft-deleted parents are absent (filtered by task 8's `$lookup`).
  - Soft-deleted children are absent (filtered by `removed: { $ne: true }` in `get_company_children`).
- Clicking a parent or child name navigates to that company's view page.
- Manual verification: open a company with one parent and two children. Confirm both sections render and links navigate. Open a leaf-only company (no parents, no children). Confirm the tile hides.

## Files

- `modules/companies/requests/get_company_children.yaml` — create — direct-children request.
- `modules/companies/components/tile_hierarchy.yaml` — create — combined parents/children sidebar tile.
- `modules/companies/pages/view.yaml` — modify — append `tile_hierarchy` to sidebar; add `get_company_children` to `requests:` and `onMount.fetch.params` (build-gated).

## Notes

- **Tile frame convention verified.** The companies-module tiles use `_ref: { module: layout, component: card }` with `title:` and `blocks:` vars (see `modules/companies/components/tile_contacts.yaml:1-5`). Match that frame.
- **Nunjucks template, not `List` + `itemTemplate`.** The companies module renders array data in tiles via `Html` + `_nunjucks` template (see `modules/companies/components/contact_list_items.yaml:20-72`), not via Lowdefy's `List` block. The Nunjucks template handles loop, conditionals, and per-item access — all in one block. Following this convention for `tile_hierarchy` keeps the rendering pattern consistent across the module and avoids questions about how `List` + `itemTemplate` exposes iterated items.
- **`$ifNull` on `parent_ids` in task 8's `$lookup`.** Without it, `parents: undefined` shows up on docs without a `parent_ids` field; the tile's `_if_none` gracefully handles undefined. Both task 8 and this tile defensively coalesce.
- **TreeSelector future.** The design notes a TreeSelector-style nested view as a future iteration. Don't pre-build for it; the flat sections are right for v1.
- **Sidebar slot ordering.** The existing `_module.var: components.sidebar_slots` (consumer slot) currently comes after the static tiles. Place `tile_hierarchy` between the static tiles and the consumer slot — that way an app's custom sidebar tiles appear *below* the hierarchy tile, matching how the existing static tiles already work.
