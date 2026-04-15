# List Pages

How to build a standard list page with filters, table, and pagination.

## Pattern

Every list page wraps in `_ref: module: layout, component: page` and provides standard vars: `id`, `title`, `breadcrumbs`, `page_actions`, `events`, `requests`, `blocks`.

The page initializes state in `onInit` (sort) and `onMountAsync` (pagination defaults + first data fetch). Blocks are composed as: filter component, then a Card containing the table and pagination.

Module var injection points allow consumers to override filters (`components.filters`), table (`components.table`), and table columns (`components.table_columns`).

## Reference Files

- `modules/contacts/pages/contacts.yaml` — canonical list page with all standard sections
- `modules/user-admin/pages/users.yaml` — list page with role-based filters

## Template

```yaml
_ref:
  module: layout
  component: page
  vars:
    id: {entity-plural}
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
                  _module.pageId: {entity}-new
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
      - id: content
        type: Card
        blocks:
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
