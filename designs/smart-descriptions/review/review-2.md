# Review 2 — Cross-Design Consistency and Dead Code

## Cross-Design Inconsistency

### 1. Worked example uses wrong module var paths

> **Resolved.** Updated worked example to use `_module.var: fields.show_title` and `_module.var: fields.profile`, matching the module-field-pattern design's consumer interface. Added inline comment clarifying the `_var` vs `_module.var` contract.

The "Data + fields (production)" worked example uses var paths that don't match the module-field-pattern design's consumer interface.

**SmartDescriptions design** (worked example, lines 444-450):

```yaml
fields:
  _build.array.concat:
    - _ref:
        path: ../shared/profile/form_core.yaml
        vars:
          show_title:
            _module.var: show_title # WRONG
    - _module.var: profile.fields # WRONG
```

**Module-field-pattern design** (canonical consumer interface + view page example):

```yaml
# Module vars structure (module-field-pattern design, lines 57-68):
fields:
  show_title: true
  profile:
    _ref: modules/shared/profile/fields.yaml

# Correct access paths:
_module.var: fields.show_title    # nested under fields
_module.var: fields.profile       # nested under fields
```

The module-field-pattern design's own view page example (lines 238-246) uses the correct paths. The SmartDescriptions worked example diverges.

`_module.var: show_title` would resolve to nothing (no top-level `show_title` var). `_module.var: profile.fields` would try to read `profile.fields` instead of `fields.profile` — different nesting entirely.

**Fix:** Update the SmartDescriptions worked example to use `_module.var: fields.show_title` and `_module.var: fields.profile`, matching the module-field-pattern design.

## Dead Code in File Structure

### 2. `getFieldTypeByComponentHint.js` has no caller in SmartDescriptions

> **Resolved.** Removed `getFieldTypeByComponentHint.js` from file structure listing and "kept unchanged" list. Its role is replaced by `blockTypeMap.js` (fields mode) and `getFieldTypesByPriority.js` (auto-discovery fallback).

The file structure lists `getFieldTypeByComponentHint.js` under "From DataDescriptions — kept unchanged" (line 373). This file maps snake_case componentHint strings (e.g., `"phone_number_input"`, `"selector"`) to field type names. It exists to support DataDescriptions' `formConfig` approach where `component: "phone_number_input"` hints at the field type.

SmartDescriptions has no code path that calls it:

- **Auto-discovery mode** (`processData.js`) detects field types from value shape only. No componentHints are available — there's no formConfig.
- **Fields mode** (`processFields.js`) uses the new `blockTypeMap.js` to map Lowdefy block types (PascalCase, e.g., `PhoneNumberInput`) to field types. This is a different mapping table with different input keys.

The equivalent functionality is split between:

- `blockTypeMap.js` (new, fields mode) — maps block types like `PhoneNumberInput` to `"phoneNumber"`
- `getFieldTypesByPriority.js` (kept) — provides priority-ordered detection for auto-discovery and unknown block type fallback

`getFieldTypeByComponentHint.js` served the formConfig bridge between these two concerns. With formConfig eliminated, the bridge is unnecessary.

**Fix:** Remove `getFieldTypeByComponentHint.js` from the file structure. If it was intended as a fallback for fields mode (e.g., normalizing `PhoneNumberInput` to `phone_number_input` then looking up via componentHint), that path should be documented explicitly. Otherwise, drop it.

## Underspecified Behavior

### 3. `isArray` determination in fields mode not documented

> **Resolved.** Added step 5 to Field Resolution: "isArray: Determined by `Array.isArray(value)`. Routes to the field type's array renderer when true."

The item shape includes `isArray: boolean` (line 335), but the design doesn't specify how `processFields.js` determines this value. The implied approach is `Array.isArray(value)`, which works correctly for:

- `DateRangeSelector` fields where the value is `[date1, date2]` — `isArray: true`, routes to `dateRange.renderArray`
- `MultipleSelector` / `CheckboxSelector` fields where the value is `["a", "b"]` — `isArray: true`, routes to `selector.renderArray` (tag list)
- Regular fields with scalar values — `isArray: false`, routes to `config.render`

This matters because `dateRange` has only `renderArray` (no `render`). If `isArray` were incorrectly `false` for a date range value, `renderValue.js` would fall through to the `String(value)` fallback (line 27 of the existing `renderFieldValue.js`) rather than crash, but the output would be ugly.

**Fix:** Add a one-liner to the processFields description: "isArray is determined by `Array.isArray(value)`."

### 4. `_ref` vars mapping in `form_core.yaml` uses `_var` but worked example uses `_module.var`

> **Resolved.** Fixed in conjunction with #1. The worked example now uses the correct var paths and includes an inline comment (`# _module.var resolves at call site, form_core.yaml reads via _var`) making the two-layer contract explicit.

The module-field-pattern design shows `form_core.yaml` using `_var: show_title` internally (line 182) — this is the `_ref`-level var, set from the `vars` property of the `_ref` call. The `_ref` call in both designs passes `show_title` as a var:

```yaml
_ref:
  path: ../shared/profile/form_core.yaml
  vars:
    show_title:
      _module.var: fields.show_title # resolved at ref-call site
```

This is correct — `_module.var` resolves at the call site, `_var` reads it inside the ref'd file. Not a bug, but the SmartDescriptions design's worked example doesn't show the `_var` vs `_module.var` distinction. Given finding #1 (wrong var paths), an implementer reading only the SmartDescriptions design would get this wrong.

This compounds finding #1 — the worked example is the primary implementation reference for SmartDescriptions consumers, and both the var paths and the implicit `_var`/`_module.var` contract are incorrect or unclear.
