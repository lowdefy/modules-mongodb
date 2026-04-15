# Review 2 — Preprocessing Flattening and Task Accuracy

## Preprocessing Logic

### 1. Nested sections silently dropped by preprocessData adapter

> **Resolved.** Replaced flat `.filter()` with recursive `collectGroups` in Task 1's `preprocessData.js` adapter. Updated design.md preprocessing description and Task 1 acceptance criteria to require nested section support.

Task 1's `preprocessData.js` adapter walks `root.items` (top-level sections) and extracts only direct field children:

```js
return root.items
  .map((section) => ({
    title: section.title || null,
    fields: section.items.filter((item) => item.type === "field"),
  }))
  .filter((group) => group.fields.length > 0);
```

After the Task 1 adaptations, `processConfigItems` returns `[...fields, ...sections]` — fields are direct (no grid wrapping), and nested `component: section` items or controlled_list arrays create sub-sections. These get mixed into a section's `items` array.

The `.filter((item) => item.type === "field")` only collects direct field children. Any nested section (from recursive formConfig, controlled_list `$` expansion, or deeply nested auto-detected objects) is silently dropped.

**Example that breaks:**

```yaml
formConfig:
  component: section
  title: Contact
  form:
    - key: name
    - component: section
      title: Address
      form:
        - key: street
        - key: city
```

After adapted preprocessing, the "Contact" section's items would be `[field_name, section_Address]`. The adapter extracts `[field_name]` and drops `section_Address` with its fields entirely.

**Current profile views are unaffected** — both `view_profile.yaml` and `view_contact.yaml` use flat field lists (no nested sections). But the design claims "the same `data` and `formConfig` props as DataView" (design.md line 126), implying full compatibility.

**Fix:** Recursively flatten sections into groups:

```js
function collectGroups(sections) {
  const groups = [];
  for (const section of sections) {
    const fields = section.items.filter((i) => i.type === "field");
    if (fields.length > 0) {
      groups.push({ title: section.title || null, fields });
    }
    const nested = section.items.filter((i) => i.type === "section");
    if (nested.length > 0) {
      groups.push(...collectGroups(nested));
    }
  }
  return groups;
}
```

Or explicitly document that nested formConfig sections are not supported in v1.

### 2. Box component handling not adapted in Task 1

> **Resolved.** Added box merge adaptation to Task 1's `processConfigItems.js` instructions — changed `boxItem.type === "grid"` check to `boxItem.type === "field"`.

`processConfigItems.js` (lines 26-36) handles `component: "box"` by merging box contents back into the parent level:

```js
boxItems.forEach((boxItem) => {
  if (boxItem.type === "grid") {
    fields.push(...boxItem.items);
  } else if (boxItem.type === "section") {
    sections.push(boxItem);
  }
});
```

After the Task 1 adaptation (removing grid nodes), the recursive `processConfigItems` call for box contents returns field nodes directly (`type === "field"`) instead of grid nodes. But the merge logic still checks `boxItem.type === "grid"` — field nodes would be silently skipped.

Task 1's adaptation instructions mention removing `createGridNode` from `processConfigItems` at lines 104-110 (the final grid wrapping step), but do not mention adapting the box merge logic at lines 26-36.

**Fix:** Change the box merge to check for field nodes:

```js
boxItems.forEach((boxItem) => {
  if (boxItem.type === "field") {
    fields.push(boxItem);
  } else if (boxItem.type === "section") {
    sections.push(boxItem);
  }
});
```

### 3. buildObjectStructure has same grid-to-field adaptation gap

> **Resolved.** Expanded Task 1's `buildStructureFromData.js` adaptation instructions to show both `createGridNode` call sites explicitly, with concrete adapted code for the simple-value-at-root case.

`buildObjectStructure.js` (lines 34-42) is listed in Task 1 for adaptation — remove `createGridNode` and push `leafFields` directly. This is correct.

However, `buildStructureFromData.js` (line 33-43) also has a `createGridNode` call for the simple-value-at-root case. Task 1 lists this file for adaptation but the description only says "same pattern — remove `createGridNode` import and usage." The simple-value case wraps a single field in a grid, then in a section:

```js
const gridNode = createGridNode(
  [{ type: "field", key: null, value: data, label: null }],
  options,
);
return { type: "root", items: [createSection(null, 0, [gridNode])] };
```

After adaptation this should become:

```js
const field = { type: "field", key: null, value: data, label: null };
return { type: "root", items: [createSection(null, 0, [field])] };
```

Task 1's instructions are vague here — they say "remove `createGridNode` import and usage" but don't show the adapted code for this specific case. The implementer needs to handle this correctly to avoid pushing `undefined` into the section items (since `createGridNode` returns the node but the adapted version would need to construct the field directly).

## Task Accuracy

### 4. Field type count overstated in design.md

> **Resolved.** Updated "30+" to "20" in design.md (3 occurrences) and tasks.md (1 occurrence).

Design.md (lines 9, 71) claims "30+ field types." Task 1 (line 17) says "20+ field type configs." The actual `fieldTypeRegistry.js` has **20 field types**: null, undefined, richText, changeStamp, contact, company, fileList, file, location, phoneNumber, longText, selector, email, url, string, boolean, number, date, datetime, dateRange.

Not a blocker — the count is descriptive, not functional. But "20+" is more accurate than "30+".

### 5. Task 3 claims "exactly two DataView usages" — correct but fragile

> **Resolved.** Claim is accurate. The nested formConfig concern is addressed by #1 — recursive flattening now handles module-defined configs with nested sections.

Task 3 states there are exactly two `type: DataView` usages. Verified: only `modules/user-account/components/view_profile.yaml:26` and `modules/contacts/components/view_contact.yaml:15` match. The claim is currently accurate.

However, both profile views use `formConfig` via `_module.var: components.profile_view_config`, which means additional modules could define their own profile view configs with nested sections or controlled_list arrays. If any module uses nested formConfig, finding #1 (nested section loss) would surface there.
