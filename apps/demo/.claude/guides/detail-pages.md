# Detail & View Pages

How to build pages that display a single record — from simple detail views to complex multi-panel workspaces.

## Pattern

Every detail/view page follows a core sequence: **fetch → redirect if missing → display**. The page wraps in the standard layout, receives the record ID from `_url_query: _id`, fetches the record on mount, redirects to the list if not found, then renders content in a multi-column layout.

**onMount sequence** (order matters):

1. `SetState` — initialize sub-state (pagination for embedded lists, UI preferences)
2. `Request` — fetch the record (and related data)
3. `Link` with `skip` — redirect if record not found: `skip: _ne: [_request: get_{entity}.0, null]`
4. `SetState` — copy record into state for display or form binding

The redirect uses `skip` to only fire when the record is `null` — the `_ne: [result, null]` expression returns `true` (skip the redirect) when a record was found.

**Layout** uses a two-column Box with responsive breakpoints:

- **Module detail pages**: span 14 (main) + span 10 (sidebar), both collapse to span 24 on `sm`
- **App detail pages**: proportions vary by domain — span 12 + 12, span 6 + 18, or flex-based for 3-column workspaces

**The `doc` var** passes the record to the layout's title-block for "Last modified by X on DATE" display. Only used in module pages that use the layout `card` component.

**Module var injection** makes detail pages extensible:

- `fields.{group}` — consumer-provided field arrays rendered as SmartDescriptions rows (e.g. `fields.profile`, `fields.attributes`)
- `components.main_slots` — append extra blocks to the main column
- `components.sidebar_slots` — append extra blocks after the module's default sidebar tiles (events, files, etc.)

## Data Flow

```
URL contains ?_id=xxx
  → Page onMount
  → SetState initializes sub-state (embedded pagination, UI flags)
  → Request fetches record via get_{entity} (uses _url_query: _id)
  → Redirect fires if record is null (skip prevents redirect when found)
  → SetState copies record to state for binding
  → Layout renders: title-block (from doc), main column, sidebar column
  → Sidebar tiles each have their own Request + onMount for related data
```

## Variations

**Simple module detail** — fetch, display info card, sidebar tiles:

```yaml
_ref:
  module: layout
  component: page
  vars:
    id: {entity}-detail
    title:
      _if_none: [_request: get_{entity}.0.{name_field}, _module.var: label]
    doc:
      _request: get_{entity}.0
    events:
      onMount:
        - id: fetch
          type: Request
          params: [get_{entity}]
        - id: redirect_if_not_found
          type: Link
          skip:
            _ne: [_request: get_{entity}.0, null]
          params:
            pageId: { _module.pageId: all }
    blocks:
      - id: detail_layout
        type: Box
        layout: { gap: 16 }
        blocks:
          - id: main_column
            type: Box
            layout: { span: 14, sm: { span: 24 } }
            blocks: [info card + main_slots]
          - id: sidebar_column
            type: Box
            layout: { span: 10, sm: { span: 24 } }
            blocks: [sidebar_default_tiles + sidebar_slots]
```

**Detail with inline edit buttons** — multiple Cards, each with an Edit button linking to a specific edit page. Cards use `loading` + `skeleton` for progressive display:

```yaml
- id: info_card
  type: Card
  loading:
    _eq: [_request: get_{entity}, null]
  skeleton:
    type: Card
    blocks: [{ type: Skeleton, properties: { height: 300 } }]
  properties:
    title: Information
  areas:
    extra:
      blocks:
        - id: edit_button
          type: Button
          properties: { title: Edit, icon: AiOutlineEdit, type: default }
          events:
            onClick:
              - type: Link
                params: { pageId: {entity}-edit, urlQuery: { _id: { _url_query: _id } } }
  blocks:
    - _ref: components/view_{entity}.yaml
```

**Tabbed workspace** — complex domain pages with tabs, modals, and inline mutations. Uses `Tabs` block with slot-based content. After any mutation, re-fetch and update state:

```yaml
# Refetch pattern after mutation:
- id: refetch
  type: Request
  params: get-{entity}
- id: update-state
  type: SetState
  params:
    { entity }:
      _request: get-{entity}
```

**Three-column workspace** — left sidebar (navigation/actions), center (main content), right sidebar (properties/timeline). Uses `flex` layout instead of `span`:

```yaml
- id: sider_left
  type: Box
  layout: { flex: 0 1 300px }
- id: center
  type: Box
  layout: { flex: 1 0 400px }
- id: sider_right
  type: Box
  layout: { flex: 0 1 325px }
```

**Embedded sub-lists** — detail page with a paginated list inside (e.g., company contacts). Initialize separate pagination state and fetch the sub-list alongside the main record:

```yaml
onMount:
  - id: init_pagination
    type: SetState
    params:
      contacts_pagination: { skip: 0, pageSize: 10 }
  - id: get_all
    type: Request
    params: [get_{entity}, get_all_{related}]
```

## Anti-patterns

- **Don't fetch on `onInit`** — use `onMount` or `onMountAsync`. `onInit` fires before the page renders, but requests need the page context (URL query params).
- **Don't forget the redirect** — without `skip: _ne: [result, null]`, users see a blank page when a record doesn't exist. The redirect should go to the list page.
- **Don't bind display directly to `_request` in complex pages** — for pages with mutations, copy the record to state (`SetState: { entity: _request: get_{entity}.0 }`) and bind to `_state: entity`. This way the UI updates immediately after refetch.
- **Don't put all sidebar tiles inline** — use `_build.array.concat` with `_module.var` injection so consuming apps can customize tiles without forking the entire page.
- **Don't load everything on mount** — use `onMountAsync` for secondary data (selectors, timeline, file lists) that doesn't block the initial render.

## Reference Files

- `modules/contacts/pages/view.yaml` — canonical module detail: two-column, doc var, sidebar tiles with module var injection
- `modules/contacts/components/tile_companies.yaml` — self-contained sidebar tile: card + request + onMount
- `modules/shared/layout/card.yaml` — card component with loading, skeleton, doc metadata, header buttons

## Template

```yaml
# pages/view.yaml
_ref:
  module: layout
  component: page
  vars:
    id: view
    title:
      _if_none:
        - _request: get_{entity}.0.{name_field}
        - _module.var: label
    breadcrumbs:
      - home: true
        icon: AiOutlineHome
      - label:
          _module.var:
            key: label_plural
            default: {Entity Plural}
        pageId:
          _module.pageId: all
      - label:
          _if_none:
            - _request: get_{entity}.0.{name_field}
            - ""
    page_actions:
      - id: edit_button
        type: Button
        layout:
          flex: 0 1 auto
        properties:
          title: Edit
          icon: AiOutlineEdit
          type: default
        events:
          onClick:
            - id: go_edit
              type: Link
              params:
                pageId:
                  _module.pageId: edit
                urlQuery:
                  _id:
                    _url_query: _id
    doc:
      _request: get_{entity}.0
    events:
      onMount:
        - id: fetch
          type: Request
          params:
            - get_{entity}
        - id: redirect_if_not_found
          type: Link
          skip:
            _ne:
              - _request: get_{entity}.0
              - null
          params:
            pageId:
              _module.pageId: all
    requests:
      - _ref: requests/get_{entity}.yaml
    blocks:
      - id: detail_layout
        type: Box
        layout:
          gap: 16
        blocks:
          - id: main_column
            type: Box
            layout:
              span: 14
              sm:
                span: 24
            blocks:
              _build.array.concat:
                - - _ref:
                      module: layout
                      component: card
                      vars:
                        title:
                          _string.concat:
                            - _module.var: label
                            - " Information"
                        doc:
                          _request: get_{entity}.0
                        blocks:
                          - _module.var:
                              key: components.detail_fields
                              default:
                                _ref: components/view_{entity}.yaml
                - _module.var:
                    key: components.main_slots
                    default: []
          - id: sidebar_column
            type: Box
            layout:
              span: 10
              sm:
                span: 24
            blocks:
              _build.array.concat:
                - _module.var:
                    key: components.sidebar_default_tiles
                    default: []
                - _module.var:
                    key: components.sidebar_slots
                    default: []
```

## Checklist

- [ ] `onMount` sequence: fetch → redirect if not found → SetState (in that order)
- [ ] Redirect uses `skip: _ne: [_request: get_{entity}.0, null]` — fires only when record is null
- [ ] `doc` var passed for change stamp metadata display in title-block/card
- [ ] Breadcrumbs: home → list page (with `pageId`) → current record name
- [ ] Two-column layout: main (span 14) + sidebar (span 10), responsive to span 24 on `sm`
- [ ] Sidebar uses `_build.array.concat` with `sidebar_default_tiles` + `sidebar_slots` module vars
- [ ] Edit button passes `_id` via `urlQuery` using `_url_query: _id`
- [ ] Complex pages copy record to state for mutation binding; use refetch pattern after mutations
- [ ] Secondary data loaded in `onMountAsync` to avoid blocking initial render
