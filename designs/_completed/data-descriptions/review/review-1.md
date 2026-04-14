# Review 1 — Implementation Accuracy and Internal Consistency

## Internal Inconsistencies

### 1. CSS keys declared in meta.js but not wired in Task 2 component

> **Resolved.** Added `classNames = {}` and `styles = {}` destructuring plus passthrough to `<Descriptions>` in Task 2's component code to match design.md.

The design.md code example (lines 252-284) correctly destructures `classNames = {}` and `styles = {}` from props and passes them through to the `<Descriptions>` component:

```jsx
className: classNames.element,
classNames: { content: classNames.content, label: classNames.label },
style: styles.element,
styles: { content: styles.content, label: styles.label },
```

Task 2's component code (lines 35-89) omits this entirely — it doesn't destructure `classNames` or `styles`, and `descProps` only includes `bordered`, `colon`, `column`, `layout`, `size`. Yet Task 2's `meta.js` declares `cssKeys: { element, content, label }`.

This means CSS styling via `.element`, `.content`, `.label` in YAML would silently do nothing.

**Fix:** Task 2's component should destructure `classNames = {}` and `styles = {}` and pass them through to `<Descriptions>`, matching the design.md code.

### 2. Redundant renderArray import and isArray branching in design.md

> **Resolved.** Removed `renderArray` import and `isArray` ternary from design.md code example. Now just calls `renderFieldValue` for every field, matching Task 2.

The design.md code (line 249) imports `renderArray` and uses explicit `isArray` branching (lines 303-305):

```jsx
{
  field.isArray
    ? renderArray(field, Icon, methods, properties)
    : renderFieldValue(field, Icon, methods, properties);
}
```

But `renderFieldValue` (`DataView/core/renderFieldValue.js`) already checks `isArray` internally and delegates to `renderArray`. Task 2 correctly identifies this and only calls `renderFieldValue` — but the design.md "source of truth" code is wrong.

**Fix:** Remove the `renderArray` import and `isArray` ternary from design.md. Just call `renderFieldValue` for every field, as Task 2 does.

### 3. Inconsistent withTheme import path

> **Resolved.** Fixed design.md code example to use `@lowdefy/blocks-antd/blocks/withTheme.js` instead of the non-existent `../withTheme.js`.

The design.md shows two different import paths:

- Line 236: `import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";`
- Line 250 (code example): `import withTheme from "../withTheme.js";`

The relative path `../withTheme.js` would resolve to `plugins/modules-mongodb-plugins/src/blocks/withTheme.js`, which does not exist. The package path works via `@lowdefy/blocks-antd`'s wildcard export (`"./*": "./dist/*"`).

Task 2 uses the correct package path. The design.md code example should match.

**Fix:** Use `@lowdefy/blocks-antd/blocks/withTheme.js` consistently.

## Schema Issues

### 4. Nested `properties` schema structure

> **Resolved.** Fixed DataDescriptions schema to use correct JSON Schema (removed the extra `properties` nesting layer). DataView's schema has the same bug but is out of scope for this design.

Task 2's `schema.json` (lines 129-217) uses:

```json
{
  "type": "object",
  "properties": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "bordered": { ... },
      ...
    }
  }
}
```

This matches the existing DataView schema pattern exactly (`DataView/schema.json` lines 1-67), so Lowdefy's schema validator clearly handles it. But it's technically invalid JSON Schema — the outer `properties` keyword should be a map of property names to sub-schemas, not a schema itself. Not a blocker, but worth noting for anyone reading the schema expecting standard JSON Schema.

### 5. formConfig schema is too simple

> **Resolved.** Copied DataView's `formConfig` schema (with `component`, `title`, and `form` properties) into Task 2's schema.json.

The design's schema defines `formConfig` as `{ "type": "object" }` with no further structure. DataView's schema defines `formConfig` with `component`, `title`, and `form` properties including nested field configs with `key`, `title`, and `component`.

Since DataDescriptions accepts the exact same formConfig as DataView, the schema should match. Users looking at the schema for guidance on how to structure formConfig won't find it.

**Fix:** Copy the `formConfig` schema definition from DataView's `schema.json`.

## Architectural Concerns

### 6. Adding @lowdefy/blocks-antd as both peer and regular dependency

> **Resolved.** Removed instruction to add as regular dependency. Lowdefy's build system resolves plugin peers via the generated `.lowdefy/dev/package.json` — keeping peer-only avoids duplicate React contexts.

The design says to add `@lowdefy/blocks-antd` as a regular dependency because "when used as a plugin, peers aren't guaranteed to be installed" (design.md line 238, task 2 line 235).

This is already a peer dependency at version `0.0.0-experimental-20260401143739`. Adding it as a regular dependency too creates dual resolution — pnpm will install it as both the host's peer-provided version and the plugin's own copy. With `withTheme` specifically, this could cause React context mismatches if the `ConfigProvider` from the plugin's copy wraps components rendered by the host's antd instance.

**Recommendation:** Verify whether the Lowdefy plugin loader resolves peers for plugins. If it does, keep it as peer-only. If not, the regular dependency is needed but the risk of dual instances should be documented.

### 7. No consideration of DataView's `maxColumns` in preprocessing

> **Resolved.** Broader decision: copy preprocessing into DataDescriptions and tailor output to flat groups directly (no grid nodes, no `flattenToGroups` adapter). Preprocessing will output `[{ title, fields }]` instead of a tree with grid wrappers. This eliminates the mismatch — columns are configured only on `<Descriptions column={N}>`.

DataView passes `{ maxColumns }` to `preprocessData`:

```js
// DataView.js line 11
return preprocessData(data, formConfig, { maxColumns });
```

DataDescriptions passes an empty options object:

```js
// design.md line 264
return preprocessData(data, formConfig, {});
```

The `maxColumns` option affects how `buildStructureFromData` determines grid column counts. Without it, auto-detected grids may use more columns than the antd `column` prop expects, which shouldn't cause layout breakage (antd wraps) but means the grid node's `columns` property could be misleading in the structure tree.

This is probably fine since DataDescriptions ignores grid nodes (they're transparent in `flattenToGroups`), but worth noting explicitly in the design as a deliberate choice.

## Minor Issues

### 8. Empty data guard condition

> **Rejected.** Already addressed by #7 — design.md now checks `!groups?.length` after preprocessing, which catches empty data objects.

Both the design.md (line 267) and DataView (lines 14-16) check:

```js
if (!data && (!structure?.items?.length)) {
```

This means if `data` is provided but empty (`{}`), preprocessing runs and could return an empty structure — but the guard won't catch it because `data` is truthy. The user would see an empty `<Descriptions>` block with just borders. Consider checking `groups.length === 0` after `flattenToGroups` as the definitive empty-state check instead.

### 9. Task 2 meta.js declares icons but no cssKeys

> **Resolved.** Added `cssKeys: { element, content, label }` to Task 2's meta.js to match design.md.

Task 2's meta.js (lines 107-119) includes icons but omits `cssKeys`:

```js
export default {
  category: "display",
  icons: [...],
  slots: { extra: "Extra content in the header." },
};
```

The design.md meta.js (lines 323-334) includes `cssKeys`. Task 2 should include them for Lowdefy to wire up the CSS key system.
