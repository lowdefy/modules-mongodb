# Review 6 — Missing Files and Styling Gap

## Build-Breaking Omission

### 1. Three fieldTypes helper files missing from design and Task 1 file list

> **Resolved.** Added `getFieldTypeConfig.js`, `getFieldTypeByComponentHint.js`, and `getFieldTypesByPriority.js` to the design file structure and Task 1's "Files to copy unchanged" section and file list. Also fixed the import path note (`renderFieldValue.js` imports from `getFieldTypeConfig.js`, not `fieldTypeRegistry.js`).

The design's file structure (design.md line 247) and Task 1's "Files to copy unchanged" section both list only `fieldTypes/fieldTypeRegistry.js`. The actual `DataView/fieldTypes/` directory contains 4 files:

```
fieldTypes/
├── fieldTypeRegistry.js           # listed
├── getFieldTypeConfig.js          # MISSING from design and task
├── getFieldTypeByComponentHint.js # MISSING from design and task
└── getFieldTypesByPriority.js     # MISSING from design and task
```

Both copied files import from the missing helpers:

- `renderFieldValue.js` line 2: `import { getFieldTypeConfig } from "../fieldTypes/getFieldTypeConfig.js"`
- `detectFieldType.js` line 2: `import { getFieldTypesByPriority } from "../../fieldTypes/getFieldTypesByPriority.js"`
- `detectFieldType.js` line 3: `import { getFieldTypeByComponentHint } from "../../fieldTypes/getFieldTypeByComponentHint.js"`
- `detectFieldType.js` line 4: `import { getFieldTypeConfig } from "../../fieldTypes/getFieldTypeConfig.js"`

Without these files, `pnpm build` fails with module-not-found errors. The three files are small lookup wrappers over `fieldTypeRegistry`:

- `getFieldTypeConfig.js` (5 lines) — looks up a type by name
- `getFieldTypeByComponentHint.js` (11 lines) — finds a type by component hint string
- `getFieldTypesByPriority.js` (7 lines) — returns registry entries sorted by priority

**Fix:** Add all three to the design file structure and Task 1's "Files to copy unchanged" section:

```
- fieldTypes/getFieldTypeConfig.js      — copied unchanged
- fieldTypes/getFieldTypeByComponentHint.js — copied unchanged
- fieldTypes/getFieldTypesByPriority.js — copied unchanged
```

Also update design.md line 247 file structure to show all 4 fieldTypes files.

## Styling Gap

### 2. Copied field type renderers depend on DataView's CSS classes with no styling source

> **Resolved.** Added `style.css` to design file structure, design.md component code, Task 2 (new step 2 with extraction instructions, file list, acceptance criteria, key points), and updated design.md's "Not used" / "Partially used" note for `style.module.css`.

The field type renderers in `fieldTypeRegistry.js` use 14 CSS class names defined in DataView's `style.module.css` as `:global()` rules:

| Class                          | Purpose                                                       | Used by                                             |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------- |
| `dataview-value`               | Base value text styling (font, color, line-height, word-wrap) | Most renderers                                      |
| `dataview-value-null`          | Italic dimmed "Not set" / "-"                                 | null, undefined, phoneNumber                        |
| `dataview-value-boolean-true`  | Green "Yes"                                                   | boolean                                             |
| `dataview-value-boolean-false` | Dimmed "No"                                                   | boolean                                             |
| `dataview-link`                | Link color + hover underline                                  | contact, company, location, email, url, phoneNumber |
| `dataview-tag`                 | Pill-shaped tag background                                    | selector, string arrays                             |
| `dataview-tags`                | Flex-wrap container for tags                                  | selector, string arrays                             |
| `dataview-richtext`            | Bordered background for rich text                             | richText                                            |
| `dataview-value-longtext`      | Same bordered style for long text                             | longText                                            |
| `dataview-special-array`       | Vertical stack for typed arrays                               | renderArray                                         |
| `dataview-special-array-item`  | Item with bottom border                                       | renderArray                                         |

DataView loads these styles via `import "./style.module.css"` (DataView.js line 5), which injects the `:global()` rules into the document. DataDescriptions has no CSS import — the design explicitly says `style.module.css` is "Not used by DataDescriptions" (design.md line 73).

**Impact:** When a page uses DataDescriptions without DataView, field values render with plain unstyled HTML. Booleans aren't color-coded, links aren't styled, tags have no backgrounds, rich text has no borders, null values aren't dimmed. The functional rendering works but the visual presentation is broken.

**Fix:** Create `DataDescriptions/style.css` (not a CSS module — just a plain CSS file) containing the value-type styles extracted from DataView's `style.module.css` (lines 66-227). Import it in `DataDescriptions.js`. This includes all `dataview-value*`, `dataview-link*`, `dataview-tag*`, `dataview-richtext`, `dataview-special-array*` rules. Exclude DataView-specific layout classes (grid, section, card, container, responsive).

Add to Task 2's file list and component code:

```js
import "./style.css";
```
