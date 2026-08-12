---
title: CollapsibleList
module: plugins
type: reference
---

# CollapsibleList

A Lowdefy list block (`category: list`, `valueType: array`) that renders each array item's sub-form inside an Ant Design `Collapse` panel. Each row collapses to a one-line summary — the `itemTitle` template — with a chevron to expand it. Use it when list rows carry several fields and a fully expanded list would be hard to scan.

Collapse state lives in the block (React), so **nothing extra is written to form state** — the bound array persists exactly like any other input value. Rows use `forceRender`, so their inputs stay mounted while collapsed; because Lowdefy validation and state pruning are engine-level (not tied to the DOM), collapsed rows are still validated and never pruned.

In the workflows module this block backs the [`collapsible_list`](../workflows/reference/form-components.md) form component, which also wires the default validate-on-collapse behaviour (see [Validation](#validation)).

## Properties

| Property           | Type    | Default | Description                                                                                                                                                                                                    |
| ------------------ | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `itemTitle`        | string  | —       | Nunjucks template rendered per row as the collapsed panel header. Context is the row's fields plus `_index` (0-based). HTML allowed. Falls back to `Item N`.                                                   |
| `title`            | string  | —       | Heading rendered above the list. HTML allowed (DOMPurify-sanitised).                                                                                                                                           |
| `accordion`        | boolean | `false` | Only one panel open at a time.                                                                                                                                                                                 |
| `defaultExpandAll` | boolean | `false` | Expand every row on first render (otherwise rows start collapsed; newly added rows open automatically).                                                                                                        |
| `deferCollapse`    | boolean | `false` | Don't close a row on the user's click — fire `onCollapse` and leave it open, so config can validate first and close it via `collapseItem` only when valid. Enables validate-before-collapse without a flicker. |
| `hideAddButton`    | boolean | `false` | Hide the built-in add button.                                                                                                                                                                                  |
| `addItemButton`    | object  | —       | Ant Design Button props for the add button (e.g. `title`, `icon`, `type`).                                                                                                                                     |
| `hideRemoveButton` | boolean | `false` | Hide the per-row remove icon.                                                                                                                                                                                  |
| `removeItemIcon`   | object  | —       | Icon props for the per-row remove icon (defaults to `AiOutlineMinusCircle`).                                                                                                                                   |
| `minItems`         | number  | `0`     | Minimum rows; the list auto-seeds empty rows up to this count and hides remove below it.                                                                                                                       |
| `size`             | string  | —       | Collapse / add-button size (`small` \| `middle` \| `large`).                                                                                                                                                   |

Per-item blocks are authored under the block's `blocks:` (the `content` slot), the same way as the stock `ControlledList`.

## Methods

Callable with the `CallMethod` action:

| Method                                                                | Description                                     |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `pushItem`, `unshiftItem`, `removeItem`, `moveItemUp`, `moveItemDown` | Array mutations (as `ControlledList`).          |
| `expandItem(index)` / `collapseItem(index)`                           | Open / close one row.                           |
| `expandAll()` / `collapseAll()`                                       | Open / close every row.                         |
| `setActiveKeys(keys)`                                                 | Set the open rows to an array of index strings. |

## Events

| Event        | Payload           | Fires                     |
| ------------ | ----------------- | ------------------------- |
| `onAdd`      | `{ index, item }` | after a row is added.     |
| `onRemove`   | `{ index, item }` | after a row is removed.   |
| `onExpand`   | `{ index, item }` | after a row is expanded.  |
| `onCollapse` | `{ index, item }` | after a row is collapsed. |

## Validation

The block cannot read its children's validation status (Lowdefy keeps that on the engine, not on the parent block), so validation is wired in config with the events and methods above. The `collapsible_list` form component sets `deferCollapse: true` and wires a **validate-before-collapse** default: clicking to collapse a row leaves it open and fires `onCollapse`; the handler runs a `Validate` scoped by the row index, then `collapseItem(index)` — so a valid row closes and an invalid one stays open with its inline errors shown (the empty `catch` swallows the validation error). Because the row never actually collapses first, there is no collapse-then-reopen flicker.
