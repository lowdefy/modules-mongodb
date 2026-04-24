# Lists

How to render, edit, and manage dynamic arrays using the `List` and `ControlledList` blocks.

## Pattern

Lists render a template of child blocks once per item in a state array. The list block's `id` is the state key holding the array (e.g., `id: notes` binds to `_state: notes`). Child block IDs use `.$` as a placeholder for the current array index — at runtime Lowdefy substitutes `$` with `0`, `1`, `2`, etc., giving each item its own scoped state path.

**Two block types:**

- **`List`** (blocks-basic) — a bare flexbox container. You wire your own add/remove buttons via `CallMethod`. Use for: display lists, custom layouts, read-only item rendering, horizontal tag rows.
- **`ControlledList`** (blocks-antd) — Ant Design `<List>` with built-in add/remove buttons, empty state, and `minItems` enforcement. Use for: form data entry where users add/remove items.

**Methods** available on both (invoked via `CallMethod` action):

| Method | Args | Description |
|---|---|---|
| `pushItem` | `(initialValue?)` | Add item to end |
| `unshiftItem` | `(initialValue?)` | Add item to front |
| `removeItem` | `(index)` | Remove item at index |
| `moveItemUp` | `(index)` | Swap with previous item |
| `moveItemDown` | `(index)` | Swap with next item |

**The `_index` operator** returns the current item's index inside a list. Use it as the `args` value for `removeItem`, `moveItemUp`, and `moveItemDown`:

```yaml
args:
  - _index: 0
```

**Validation** across all list items uses a regex matching the list ID prefix:

```yaml
- id: validate_items
  type: Validate
  params:
    regex: ^{list_id}
```

## Data Flow

```
State array (e.g. notes: [{text: 'A'}, {text: 'B'}])
  → List block iterates array, renders child template per item
  → Child IDs: notes.0.text, notes.1.text ($ replaced with index)
  → Input blocks auto-bind: user edits write back to state array
  → CallMethod pushItem/removeItem mutates the state array
  → On save: _state: notes sends entire array to API payload
```

For read-only lists populated from requests, initialize state in `onMount`:

```
Request fires → SetState: items: _request: get_items
  → List renders each item → _state: items.$.name displays data
```

## Variations

**Read-only display list** — render items from a request, no add/remove:

```yaml
- id: files
  type: List
  blocks:
    - id: files.$.name
      type: Paragraph
      properties:
        content:
          _state: files.$.name
    - id: files.$.date
      type: Paragraph
      properties:
        content:
          _state: files.$.uploaded_at
```

**Editable list with manual add/remove** — `List` with custom buttons:

```yaml
- id: add_btn
  type: Button
  events:
    onClick:
      - id: add_item
        type: CallMethod
        params:
          blockId: items
          method: pushItem

- id: items
  type: List
  blocks:
    - id: items.$.value
      type: TextInput
      properties:
        label:
          disabled: true
    - id: items.$.remove
      type: Button
      properties:
        icon: AiOutlineClose
        variant: text
        shape: circle
      events:
        onClick:
          - id: remove
            type: CallMethod
            params:
              blockId: items
              method: removeItem
              args:
                - _index: 0
```

**ControlledList for form entry** — built-in add/remove UI:

```yaml
- id: sections
  type: ControlledList
  properties:
    title: Sections
    addItemButton:
      title: Add Section
      icon: AiOutlinePlus
      variant: dashed
    minItems: 1
  blocks:
    - id: sections.$.title
      type: TextInput
      required: true
    - id: sections.$.description
      type: TextArea
```

**Conditional fields per item** — show/hide based on item state:

```yaml
- id: attendees.$.email
  type: TextInput
  visible:
    _eq:
      - _state: attendees.$.type
      - Adult
```

**Pre-populated ControlledList** — lock add/remove, populate from request:

```yaml
# In onMount action:
devices:
  _array.map:
    - _request: get_devices
    - _function:
        _id: { __args: 0._id }
        name: { __args: 0.name }

# In component:
- id: devices
  type: ControlledList
  properties:
    hideAddButton: true
    hideRemoveButton: true
  blocks:
    - id: devices.$.name
      type: Paragraph
    - id: devices.$.status
      type: ButtonSelector
```

**Nested lists** — ControlledList inside ControlledList (use sparingly):

```yaml
- id: projects.$.tasks
  type: ControlledList
  properties:
    size: small
  blocks:
    - id: projects.$.tasks.$.task
      type: TextInput
    - id: projects.$.tasks.$.done
      type: Switch
```

## Anti-patterns

- **Don't use `_state` with hardcoded indices in templates** — use `.$` notation. Writing `_state: items.0.name` reads only the first item; `_state: items.$.name` reads the current item.
- **Don't forget `_index: 0` in removeItem args** — without it, `removeItem` has no index and silently fails. The `0` in `_index: 0` refers to the nesting depth (0 = innermost list), not the item index.
- **Don't use `addItem` as an action type** — there is no `addItem` action. Use `CallMethod` with `method: pushItem` on the list's `blockId`.
- **Don't mutate list state with SetState for single-item changes** — use the list's built-in methods. `SetState` replaces the entire array and can cause re-render issues. Use `SetState` only for bulk initialization from request data.
- **Don't nest lists more than 2 levels deep** — `projects.$.tasks.$.subtasks.$` is technically possible but creates deeply nested state paths that are hard to debug and submit.

## Reference Files

- `modules/files/components/file-list.yaml` — read-only List rendering file items with download links
- `modules/notifications/components/list-notifications.yaml` — List with click handlers, empty state, and status rendering
- `modules/data-upload/components/upload-history.yaml` — List displaying upload history entries
- `apps/example-app/pages/lot-view/components/overview_tab.yaml` — List rendering predecessor/successor lots with links

## Template

```yaml
# components/{list_name}.yaml — Editable list with add/remove
id: {list_id}_section
type: Box
layout:
  gap: 8
blocks:
  - id: {list_id}_header
    type: Box
    layout:
      justify: space-between
      align: center
    blocks:
      - id: {list_id}_title
        type: Title
        layout:
          flex: 0 0 auto
        properties:
          content: {List Title}
          level: 5
      - id: {list_id}_add
        type: Button
        layout:
          flex: 0 0 auto
        properties:
          title: Add {Item}
          icon: AiOutlinePlus
          size: small
          variant: dashed
        events:
          onClick:
            - id: add_{item}
              type: CallMethod
              params:
                blockId: {list_id}
                method: pushItem
  - id: {list_id}
    type: List
    blocks:
      - id: {list_id}.$.{field_1}
        type: TextInput
        required: true
        layout:
          flex: 1 1 0
        properties:
          label:
            disabled: true
          placeholder: {Field 1}
      - id: {list_id}.$.{field_2}
        type: Selector
        layout:
          flex: 0 0 160px
        properties:
          label:
            disabled: true
          placeholder: {Field 2}
          options:
            - {Option 1}
            - {Option 2}
      - id: {list_id}.$.remove_btn
        type: Button
        layout:
          flex: 0 0 auto
        properties:
          icon: AiOutlineDelete
          variant: text
          color: danger
          shape: circle
          size: small
        events:
          onClick:
            - id: remove_{item}
              type: CallMethod
              params:
                blockId: {list_id}
                method: removeItem
                args:
                  - _index: 0
```

## Checklist

- [ ] List block `id` matches the state key holding the array
- [ ] All child block IDs use `.$` notation (e.g., `items.$.name`), never hardcoded indices
- [ ] `removeItem` and `moveItem*` actions pass `args: [_index: 0]`
- [ ] Add/remove uses `CallMethod` with `blockId` pointing to the list, not a custom action type
- [ ] Validation uses `regex: ^{list_id}` to cover all items
- [ ] Read-only lists initialize state from request in `onMount` via `SetState`
- [ ] ControlledList form data sent via `_state: {list_id}` in API payload
- [ ] Empty state handled with `visible:` check on `_array.length` or ControlledList's `noDataTitle`
