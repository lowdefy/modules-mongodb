# Task 1: Copy and adapt preprocessing pipeline

## Context

The DataView block at `plugins/modules-mongodb-plugins/src/blocks/DataView/` has a preprocessing pipeline that takes `(data, formConfig)` and builds a structure tree: `root → sections → grids → fields`. The grid nodes are DataView-specific layout — they control CSS grid column counts.

The new DataDescriptions block needs the same field type detection, label generation, and section grouping, but should output **a tree of groups** `[{ title, fields, children }]` instead of a tree with grid wrappers. Nesting is preserved so the renderer can use Card inner for nested groups. Columns are controlled by antd's `<Descriptions column={N}>`, not by the preprocessing.

This task copies all shared code into a self-contained `DataDescriptions/` directory and adapts the preprocessing to skip grid wrapping.

## Task

Create the directory `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/` with the following subdirectories and files.

### Files to copy unchanged

Copy these files from `../DataView/` into the corresponding paths under `DataDescriptions/`:

- `fieldTypes/fieldTypeRegistry.js` — 20 field type configs with detect/render functions
- `fieldTypes/getFieldTypeConfig.js` — looks up a type config by name (imported by `renderFieldValue.js` and `detectFieldType.js`)
- `fieldTypes/getFieldTypeByComponentHint.js` — finds a type by component hint string (imported by `detectFieldType.js`)
- `fieldTypes/getFieldTypesByPriority.js` — returns registry entries sorted by priority (imported by `detectFieldType.js`)
- `core/renderFieldValue.js` — dispatches to registry renderers, handles arrays via renderArray
- `core/renderArray.js` — array value rendering (empty, typed, list)
- `utils/formatFieldName.js` — key → "Field Name" conversion
- `utils/formatValue.js` — value formatting

**Important:** After copying, update any relative import paths that reference sibling directories. For example, `renderFieldValue.js` imports from `../fieldTypes/getFieldTypeConfig.js` — verify this still resolves correctly in the new location (it should, since the directory structure is mirrored).

### Files to copy and adapt

Copy these files from `../DataView/preprocessing/` and modify them:

#### `preprocessing/preprocessData.js`

Copy from `../DataView/preprocessing/preprocessData.js`. The original routes to `buildStructureFromConfig` or `buildStructureFromData` and returns a root tree node.

**Adapt:** The function should return a **tree of groups** `[{ title, fields, children }, ...]` that preserves nesting hierarchy. After calling `buildStructureFromConfig` or `buildStructureFromData`, the result is a root node with section items. Recursively walk sections to build group trees — sections can contain both fields and nested sub-sections:

```js
function collectGroups(sections) {
  const groups = [];
  for (const section of sections) {
    const fields = section.items.filter((i) => i.type === "field");
    const nested = section.items.filter((i) => i.type === "section");
    const children = nested.length > 0 ? collectGroups(nested) : [];

    if (fields.length > 0 || children.length > 0) {
      groups.push({ title: section.title || null, fields, children });
    }
  }
  return groups;
}

function preprocessData(data, formConfig) {
  if (!data && !formConfig) return [];

  const root = formConfig
    ? buildStructureFromConfig(data, formConfig)
    : buildStructureFromData(data);

  if (!root?.items?.length) return [];

  return collectGroups(root.items);
}
```

Note: the `options` parameter is removed — no `maxColumns` needed. The output preserves nesting so the renderer can use `<Card type="inner">` for nested groups and bare `<Descriptions>` at the root level.

#### `preprocessing/helpers/processConfigItems.js`

Copy from `../DataView/preprocessing/helpers/processConfigItems.js`. This is the main recursive config processor.

**Adapt:** Remove the `createGridNode` import and usage. Instead of wrapping accumulated fields in a grid node, push them directly into the items array:

Original pattern (end of function):

```js
const gridNode = createGridNode(fields, options);
if (gridNode) items.push(gridNode);
items.push(...sections);
```

Adapted:

```js
items.push(...fields);
items.push(...sections);
```

Also adapt the **box component merge logic** (lines 26-36). The original checks `boxItem.type === "grid"` to extract fields from grid nodes — since grids no longer exist, change to check for field nodes:

Original:

```js
boxItems.forEach((boxItem) => {
  if (boxItem.type === "grid") {
    fields.push(...boxItem.items);
  } else if (boxItem.type === "section") {
    sections.push(boxItem);
  }
});
```

Adapted:

```js
boxItems.forEach((boxItem) => {
  if (boxItem.type === "field") {
    fields.push(boxItem);
  } else if (boxItem.type === "section") {
    sections.push(boxItem);
  }
});
```

Also remove the `options` parameter since `maxColumns` is no longer needed. Remove the `createGridNode` import.

#### `preprocessing/helpers/buildObjectStructure.js`

Copy from `../DataView/preprocessing/helpers/buildObjectStructure.js`. This handles auto-detection when no formConfig is provided.

**Adapt:** Same pattern — remove `createGridNode` import and usage. Instead of:

```js
const gridNode = createGridNode(leafFields, options);
if (gridNode) items.push(gridNode);
```

Do:

```js
items.push(...leafFields);
```

Remove `options` parameter and `createGridNode` import.

#### `preprocessing/helpers/buildStructureFromConfig.js`

Copy from `../DataView/preprocessing/helpers/buildStructureFromConfig.js`.

**Adapt:** Remove `options` parameter passthrough to `processConfigItems`. The function calls `processConfigItems(data, configArray, 0, options)` — change to `processConfigItems(data, configArray, 0)`.

#### `preprocessing/helpers/buildStructureFromData.js`

Copy from `../DataView/preprocessing/helpers/buildStructureFromData.js`.

**Adapt:** Remove `createGridNode` import and usage. Remove `options` parameter passthrough.

This file has two `createGridNode` calls:

1. **Array-of-objects at root** (line 13): `buildObjectStructure` is called per item — already handled by the buildObjectStructure adaptation (pushes `leafFields` directly).

2. **Simple value at root** (lines 33-43): Wraps a single field in a grid, then in a section. Replace with constructing the field directly:

   Original:

   ```js
   const gridNode = createGridNode(
     [{ type: "field", key: null, value: data, label: null }],
     options,
   );
   return { type: "root", items: [createSection(null, 0, [gridNode])] };
   ```

   Adapted:

   ```js
   const field = { type: "field", key: null, value: data, label: null };
   return { type: "root", items: [createSection(null, 0, [field])] };
   ```

#### `preprocessing/helpers/wrapItemsInSections.js`

Copy from `../DataView/preprocessing/helpers/wrapItemsInSections.js`.

**Adapt:** The original checks `if (item.type === "grid")` to wrap grids in sections. Since there are no grid nodes, change this to check `if (item.type === "field")` — field nodes at root level get wrapped in an untitled section.

#### `preprocessing/helpers/detectFieldType.js`

Copy unchanged. No grid-related logic.

#### `preprocessing/helpers/createSection.js`

Copy unchanged. No grid-related logic. (Remove the `showCard` property if desired — DataDescriptions doesn't use cards — but it's harmless to leave.)

### Files NOT copied

- `preprocessing/helpers/createGridNode.js` — not needed, grids are eliminated
- `preprocessing/helpers/determineGridColumns.js` — not needed (dependency of createGridNode)
- `core/StructureRenderer.js` — DataView's recursive React renderer, replaced by DataDescriptions component
- `core/renderField.js` — DataView's field → GridItem wrapper
- `components/` — all DataView UI components (Section, GridItem, Card)
- `style.module.css` — DataView's CSS grid styles

## Acceptance Criteria

- Directory `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/` exists with `preprocessing/`, `fieldTypes/`, `core/`, `utils/` subdirectories.
- `preprocessData(data, formConfig)` returns `[{ title: string|null, fields: [...], children: [...] }, ...]` — a tree of groups preserving nesting hierarchy.
- Field nodes in the output have `type`, `key`, `value`, `label`, `fieldType`, `isArray`, `fullWidth` properties (same shape as DataView's field nodes).
- Sections with titles produce separate groups. Untitled sections produce a group with `title: null`.
- Nested sections (from recursive formConfig, controlled_list arrays, auto-detected nested objects) are preserved as `children` arrays — each titled sub-section becomes a child group, not flattened.
- Empty groups (no fields and no children) are filtered out.
- `preprocessData(null, null)` returns `[]`.
- No imports reference `../DataView/` — all imports are local within `DataDescriptions/`.
- No references to `createGridNode` or `determineGridColumns` remain.

## Files

- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/preprocessData.js` — **create** — adapted entry point
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/helpers/buildStructureFromConfig.js` — **create** — adapted (no options)
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/helpers/buildStructureFromData.js` — **create** — adapted (no grid)
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/helpers/processConfigItems.js` — **create** — adapted (no grid)
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/helpers/buildObjectStructure.js` — **create** — adapted (no grid)
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/helpers/createSection.js` — **create** — copied unchanged
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/helpers/wrapItemsInSections.js` — **create** — adapted (field type check)
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/preprocessing/helpers/detectFieldType.js` — **create** — copied unchanged
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/fieldTypes/fieldTypeRegistry.js` — **create** — copied unchanged
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/fieldTypes/getFieldTypeConfig.js` — **create** — copied unchanged
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/fieldTypes/getFieldTypeByComponentHint.js` — **create** — copied unchanged
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/fieldTypes/getFieldTypesByPriority.js` — **create** — copied unchanged
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/core/renderFieldValue.js` — **create** — copied unchanged
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/core/renderArray.js` — **create** — copied unchanged
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/utils/formatFieldName.js` — **create** — copied unchanged
- `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/utils/formatValue.js` — **create** — copied unchanged

## Notes

- The source files to copy from are at `plugins/modules-mongodb-plugins/src/blocks/DataView/`. Read each file before copying to understand its imports and adapt accordingly.
- `fieldTypeRegistry.js` imports React components (`DangerousHtml`, `S3Download`) and helpers. These imports reference packages (`dompurify`, `@lowdefy/helpers`, `@lowdefy/plugin-aws`) that are already dependencies/peerDependencies of `modules-mongodb-plugins`.
- The `processConfigItems` function handles nested structures recursively (sections within sections, box containers, array expansion with `$` syntax). The grid removal is localized to the final step where accumulated fields are pushed — the recursive logic is unchanged.
