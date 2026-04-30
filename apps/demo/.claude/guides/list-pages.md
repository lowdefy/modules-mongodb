# List Pages

How to build a standard list page with filters, table, and pagination.

## Pattern

Every list page wraps in `_ref: module: layout, component: page` and provides standard vars: `id`, `title`, `breadcrumbs`, `page_actions`, `events`, `requests`, `blocks`.

The page initializes state in `onInit` (sort) and `onMountAsync` (pagination defaults + first data fetch). Blocks are composed as flat siblings under the page component: filter component, then the table, then pagination. Do not wrap AgGrid tables in a Card — the table stands on its own.

Module var injection points allow consumers to add to the filter bar (`components.filters` — extra blocks rendered below the built-in search) and table columns (`components.table_columns` — appended to the default columns). The table itself is owned by the module.

## Reference Files

- `modules/contacts/pages/all.yaml` — canonical list page with all standard sections
- `modules/user-admin/pages/all.yaml` — list page with role-based filters

## Template

```yaml
_ref:
  module: layout
  component: page
  vars:
    id: all
    title:
      _module.var:
        key: label_plural
        default: {Entity Plural}
    breadcrumbs:
      - home: true
        icon: AiOutlineHome
      - label:
          _module.var:
            key: label_plural
            default: {Entity Plural}
    page_actions:
      - id: new_{entity}_button
        type: Button
        layout:
          flex: 0 1 auto
        properties:
          title:
            _string.concat:
              - "New "
              - _module.var: label
          icon: {AiOutlineIcon}
          type: primary
        events:
          onClick:
            - id: go_new
              type: Link
              params:
                pageId:
                  _module.pageId: new
    events:
      onInit:
        - id: set_sort
          type: SetState
          params:
            sort:
              by: updated.timestamp
              order: -1
      onMountAsync:
        - id: set_pagination
          type: SetState
          params:
            pagination:
              current: 1
              skip: 0
              pageSize: 500
        - id: get_all
          type: Request
          params:
            - get_all_{entities}
    requests:
      - _ref: requests/get_all_{entities}.yaml
    blocks:
      - _module.var:
          key: components.filters
          default:
            _ref: components/filter_{entities}.yaml
      - _module.var:
          key: components.table
          default:
            _ref: components/table_{entities}.yaml
      - _ref: components/pagination.yaml
```

## Checklist

- [ ] Sort state initialized in `onInit`
- [ ] Pagination state initialized in `onMountAsync` before the Request
- [ ] Breadcrumbs include `home: true` + current page label
- [ ] Page action button links to the `-new` page using `_module.pageId`
- [ ] Blocks use `_module.var` wrappers for filter, table, and column injection points
