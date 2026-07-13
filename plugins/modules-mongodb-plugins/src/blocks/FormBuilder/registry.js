import * as antdBlocks from "@lowdefy/blocks-antd/blocks";
import * as antdMetas from "@lowdefy/blocks-antd/metas";
import * as basicBlocks from "@lowdefy/blocks-basic/blocks";
import * as basicMetas from "@lowdefy/blocks-basic/metas";

export const DEFAULT_PALETTE = [
  // inputs
  "TextInput",
  "TextArea",
  "NumberInput",
  "Selector",
  "MultipleSelector",
  "RadioSelector",
  "CheckboxSelector",
  "DateSelector",
  "DateTimeSelector",
  "Switch",
  "ParagraphInput",
  "PhoneNumberInput",
  "RatingSlider",
  "Slider",
  // containers
  "Box",
  "Card",
  "Collapse",
  "Tabs",
  "Label",
  "Alert",
  "Descriptions",
  // display
  "Title",
  "Paragraph",
  "Html",
  "Divider",
  "Button",
  "Statistic",
  "Icon",
  "Img",
];

// Minimal working properties seeded when a block is dropped from the palette,
// for block types that crash or render empty without them. Shapes verified
// against the antd block sources:
//   - Tabs (Tabs.js:52): `useState(properties.defaultActiveKey ?? tabs[0].key)`
//     dereferences tabs[0]; with slots:false there is no content fallback, so an
//     empty tabs array throws "Cannot read properties of undefined (reading 'key')".
//     Item shape { key, title } (key required) per Tabs meta.
//   - Collapse (Collapse.js:50): `properties.defaultActiveKey || panels[0].key`
//     dereferences panels[0] the same way. Item shape { key, title } per Collapse meta.
export const DEFAULT_PROPERTIES = {
  Tabs: {
    tabs: [
      { key: "tab_1", title: "Tab 1" },
      { key: "tab_2", title: "Tab 2" },
    ],
  },
  Collapse: {
    panels: [
      { key: "panel_1", title: "Panel 1" },
      { key: "panel_2", title: "Panel 2" },
    ],
  },
};

// Deep clone so seeded defaults never share references across block instances.
export function defaultPropertiesFor(type) {
  const defaults = DEFAULT_PROPERTIES[type];
  return defaults ? JSON.parse(JSON.stringify(defaults)) : undefined;
}

// Dynamic slots: Tabs and Collapse declare `slots: false` in their metas —
// their content areas are one per item key, derived from properties. Verified
// in the antd sources: Tabs.js:122 renders `content[tab.key] && content[tab.key]()`
// per tab, Collapse.js:84 renders `content[panel.key]()` per panel.
// Note: renaming or removing a tab/panel key orphans that key's
// `areas.<oldKey>` blocks in the stored config — acceptable for now; no
// cleanup is built.
export const DYNAMIC_SLOTS = {
  Tabs: (properties) =>
    (Array.isArray(properties.tabs) ? properties.tabs : []).map((t) => t?.key),
  Collapse: (properties) =>
    (Array.isArray(properties.panels) ? properties.panels : []).map(
      (p) => p?.key,
    ),
};

// Droppable slot keys for a dynamic-slot block type: string/number keys only
// (operator-valued or missing keys are skipped), stringified, deduped.
export function dynamicSlotKeys(type, properties) {
  const getKeys = DYNAMIC_SLOTS[type];
  if (!getKeys) return [];
  const seen = new Set();
  const keys = [];
  getKeys(properties ?? {}).forEach((key) => {
    if (typeof key !== "string" && typeof key !== "number") return;
    const k = String(key);
    if (seen.has(k)) return;
    seen.add(k);
    keys.push(k);
  });
  return keys;
}

const allBlocks = { ...antdBlocks, ...basicBlocks };
const allMetas = { ...antdMetas, ...basicMetas };

export function buildRegistry(paletteBlocks) {
  const types =
    Array.isArray(paletteBlocks) && paletteBlocks.length
      ? paletteBlocks
      : DEFAULT_PALETTE;
  const registry = {};
  types.forEach((type) => {
    const Component = allBlocks[type];
    const meta = allMetas[type];
    if (Component && meta) {
      registry[type] = { Component, meta };
    }
  });
  return registry;
}

const CATEGORY_GROUPS = {
  input: "Inputs",
  "input-container": "Inputs",
  container: "Containers",
  list: "Lists",
  display: "Display",
};

export function groupRegistry(registry) {
  const groups = {};
  Object.entries(registry).forEach(([type, { meta }]) => {
    const group = CATEGORY_GROUPS[meta.category] ?? "Other";
    if (!groups[group]) groups[group] = [];
    groups[group].push({ type, meta });
  });
  Object.values(groups).forEach((list) =>
    list.sort((a, b) => a.type.localeCompare(b.type)),
  );
  return groups;
}
