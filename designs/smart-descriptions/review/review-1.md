# Review 1 — Accuracy and Completeness

## Missing Properties

### 1. `contactDetailPageId` and `companyDetailPageId` not documented

> **Resolved.** Added both properties to the properties table with defaults. Added YAML example showing `_module.pageId` resolution for non-default entry IDs. See also #6.

The field type registry renders contact and company fields as hyperlinks using `properties.contactDetailPageId` and `properties.companyDetailPageId` to build URLs:

- `fieldTypeRegistry.js:88-89` — changeStamp renderer: `properties?.contactDetailPageId ?? "contacts/contact-detail"`
- `fieldTypeRegistry.js:124-127` — contact renderer: `properties?.contactDetailPageId`
- `fieldTypeRegistry.js:156-159` — company renderer: `properties?.companyDetailPageId`

The design's properties table and schema omit both. Without them, the links default to `contacts/contact-detail` and `companies/company-detail` — which won't resolve correctly in modules where page IDs are scoped with entry ID prefixes.

**Fix:** Add both properties to the table and schema. Consider whether these should use `_module.pageId` resolution to handle scoped page IDs automatically, or whether the renderers should accept a function/operator value rather than a plain string.

## Contradictory Claims

### 2. Registry "kept unchanged" vs. selector renderer enhancement

> **Resolved.** Moved `fieldTypeRegistry.js` from "kept unchanged" to a new "modified" category noting the selector enhancement and location fix.

The File Structure section states:

> **From DataDescriptions — kept unchanged:** `fieldTypes/fieldTypeRegistry.js`

But the "Selector Renderer Enhancement" section directly modifies the selector render function to accept an `options` parameter. These two statements contradict each other.

**Fix:** Move `fieldTypeRegistry.js` from "kept unchanged" to a new "modified" category, or describe the selector change as a non-breaking extension (adding an ignored parameter to the existing signature).

## Underspecified Behavior

### 3. `dateRange` auto-detection is ambiguous

> **Resolved.** Kept current behavior: `dateRange` is hint-only in auto-discovery (array branch detects `[date, date]` as a date array). Updated detection table to mark dateRange as "Never auto-detected (hint-only)", matching `selector`. Works via `DateRangeSelector` in fields mode.

The detection table lists `dateRange` (priority 95) with detection "Array of exactly 2 dates". However, the existing `detectFieldType.js` (lines 8-37) enters a separate array branch BEFORE running priority-ordered detection. In that branch, each element is tested individually: `value.every((item) => config.detect(item))`. A `[date1, date2]` array would match `date.detect` on each element and be detected as `{ type: "date", isArray: true }` — a date array, not a date range.

The design removes `preprocessing/` (which contains `detectFieldType.js`) and introduces `processData.js`. It's unclear whether the new implementation:

- (a) Keeps the array-first branching (dateRange never auto-detects — only works via component hint), or
- (b) Runs a simple priority loop on the raw value (dateRange auto-detects at priority 95)

The detection table implies (b), but the "Arrays" section describes array-specific handling that implies (a).

**Fix:** Clarify which path applies. If (b), document that `[date1, date2]` renders as "start - end" but `[date1, date2, date3]` renders as date tags. If (a), update the detection table to mark dateRange as "hint-only" (like selector).

### 4. Options passthrough mechanism not specified

> **Resolved.** Added explicit `renderValue` call site showing `options: item.options` passthrough to registry render functions.

The render function signature throughout the registry is `({ value, Icon, methods, properties, fieldType })`. The enhanced selector renderer uses `({ value, options })`. The design shows the item shape includes `options` but doesn't describe how `renderValue.js` bridges the item's `options` field into the render call.

The implementation is straightforward — add `options: item.options` to the parameter object passed to `config.render()`, since existing render functions ignore unknown destructured properties. But since `renderValue.js` is listed as a new/simplified file, its contract should be explicit.

**Fix:** Show the `renderValue` call site passing `options` from the item to the render function, e.g., `config.render({ value, Icon, methods, properties, fieldType, options: item.options })`.

## Inherited Bugs

### 5. Location renderer crashes when only `formatted_address` is present

> **Resolved.** Noted in "modified" file list. Location renderer will guard geometry access and render address as text-only when coordinates are missing. Detection table updated to reflect text-only fallback.

`fieldTypeRegistry.js:250-254` — The location renderer unconditionally accesses `value.geometry.location.lat` and `value.geometry.location.lng`:

```javascript
const address =
  value.formatted_address ??
  `${value.geometry.location.lat}, ${value.geometry.location.lng}`;
const { lat, lng } = value.geometry.location; // Crashes if no geometry
```

But `location.detect` accepts objects with `formatted_address` OR `geometry.location`. If only `formatted_address` is present, line 253 throws `Cannot read properties of undefined (reading 'location')`.

**Fix:** Guard the geometry access: `const { lat, lng } = value.geometry?.location ?? {}`. If coordinates are missing, render address text without a Google Maps link.

## Design Gaps

### 6. No mention of `contactDetailPageId` scoping with modules

> **Resolved.** Documented `_module.pageId` resolution pattern for module contexts where entry IDs differ from defaults. Resolution happens at the YAML layer. See #1.

The contact, company, and changeStamp renderers hardcode default page paths like `"contacts/contact-detail"`. In the module system, page IDs are auto-scoped with the module entry ID prefix (e.g., `contacts/contact-detail` becomes `{entryId}/contacts/contact-detail`). The design doesn't address how SmartDescriptions resolves these cross-module page references.

The module-field-pattern design shows SmartDescriptions being used inside modules that depend on the contacts module. The renderer's hardcoded defaults won't work — the actual page path depends on the contacts module's entry ID.

**Fix:** Either accept `contactDetailPageId` / `companyDetailPageId` as properties resolved at the YAML level (via `_module.pageId: { id: contact-detail, module: contacts }`), or document that consumers in module contexts must provide these explicitly.

### 7. `span` behavior for arrays not specified

> **Resolved.** Added documentation in Rendering section: `span: "filled"` applies to the Descriptions.Item container; array items render vertically in a flex container within it.

The design specifies that `longText`, `richText`, and `location` use `span: "filled"` via the `fullWidth` flag. But it doesn't specify what happens when an array of longText or richText values is rendered. The item-level `fullWidth` is set from the field type config, but array rendering might produce multiple items that each need full width, or a single wrapped container.

The existing `renderArray.js` wraps multiple items in a flex container — this container would get `span: "filled"` from the parent item. This likely works, but should be documented.
