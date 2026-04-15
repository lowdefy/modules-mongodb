# Review 3 — Implementation Feasibility

Focuses on whether the design's YAML sketches will actually work at implementation time. Prior reviews covered data access and component location; this review targets build-time operator usage, data format assumptions, and wireframe/YAML contradictions.

## Access Tile Roles Tags

### 1. Roles module var is plain strings, not `{label, value}` objects

> **Resolved.** Kept roles as plain strings. Updated access tile template to use `__value` directly for both visibility check and tag content — roles render as their raw values.

The access tile template (design line 641-657) assumes `_module.var: roles` provides `[{label, value}]` objects:

```yaml
visible:
  _array.includes:
    - _state: user.roles
    - __value.value
properties:
  content: __value.label
```

Actual `apps/demo/roles.yaml`:

```yaml
- mrm
- user-admin-demo
- demo
```

Plain strings. `__value.value` and `__value.label` resolve to undefined. The existing `form_access_edit.yaml:20-21` uses these same strings directly as MultipleSelector options (where plain strings work because the component handles both formats).

**Fix:** Either upgrade `roles.yaml` to `[{label: "MRM", value: "mrm"}, ...]` (better UX — human-readable labels for tags) and update `form_access_edit.yaml` accordingly, or rewrite the template to use `__value` directly for both visibility check and display. Note that plain strings would render as raw role keys ("mrm", "user-admin-demo") which is poor for display.

### 2. `_build.array.map` callback uses undocumented `__value`/`__key`/`__tag` syntax

> **Resolved.** Rewrote callback using `_build.function` + `__build.args` pattern. `__build.args: 0` for the role value, `__build.args: 1` for the index.

The roles template (design line 641-657) uses `__value`, `__key`, and `__tag` as callback tokens. Searching the codebase: `__value` and `__key` appear only in the design files. All existing `_build.array.map` callbacks in the codebase use `_build.function` + `__build.args`:

```yaml
# modules/user-admin/api/update-user.yaml:140-143
callback:
  _build.function:
    key:
      __build.args: 0.0
    value: ...
```

The `__tag` wrapper at line 645 is also novel — the block object is nested under `__tag:` instead of being the callback value directly. Unless `_build.array.map` has been extended to support a different callback format for UI block generation, this syntax won't work.

**Fix:** Rewrite using `_build.function` + `__build.args` pattern, or verify that `_build.array.map` supports the `__value`/`__key` callback format (it's possible this was added and just hasn't been used in YAML yet — check `operators-js` source). Alternatively, since the roles list is small and known at build time, consider generating the Tag blocks directly without `_build.array.map`.

## Wireframe vs YAML Contradictions

### 3. View page identity header has `extra` blocks that the wireframe omits

> **Resolved.** Removed `extra` from the view page identity header. Signed-up date and invite link live only in the access sidebar tile on the view page. Edit page keeps `extra` (no sidebar). Updated decision 8.

Section 1 (design line 252-300) shows the view page identity header with `extra` containing signed-up date and invite link:

```yaml
# user-admin/components/view_user.yaml (view page)
extra:
  - id: signed_up
    ...
  - id: invite_link
    ...
```

But the section 5 wireframe (line 550-574) shows the identity header with only name + email — no extra content:

```
│  [Avatar]  Jordan Bell      │  │  Access        │
│            jb@apelectric.com│  │  ...            │
│                             │  │  │ Signed Up│  │
```

The access tile sidebar (line 658-699) ALSO has signed_up and invite_link blocks. So these blocks would render in both places — identity header AND access tile.

On the edit page (section 8, single column, no sidebar), putting signed-up/invite in `extra` makes sense. On the view page (two columns with access tile), the wireframe correctly places them only in the sidebar.

**Fix:** Remove the `extra` var from the view page identity header usage (line 252-300). Keep it for the edit page (line 778-794). Update the view page example to pass no `extra` (or just `extra: []`), matching the wireframe.

## DataDescriptions Rendering

### 4. Short `internal_details` text won't trigger `longText` rendering

> **Accepted.** Added `component: text_area` to the `internal_details` entry in `attributes_view_config.yaml`. This forces `longText` rendering via component hint, preserving full-width display for short notes. Auto-detection alone is insufficient for this field.

The design says (decision 4, line 860): "Long text auto-detects as `longText` and renders with `span: "filled"` in DataDescriptions."

The `fieldTypeRegistry.js:299-300` detection:

```js
detect: (value) =>
  type.isString(value) && (value.length > 200 || value.includes("\n")),
```

Short notes like "Follow up next week" (22 chars, no newlines) render as regular `string` type — no full-width span. The `attributes_view_config.yaml` example (design line 750-751):

```yaml
- key: internal_details
  title: Notes
```

No `component` hint. With a `component: text_area` hint, the formConfig processing would match the `longText` componentHint and force full-width rendering regardless of content length.

This matters because `internal_details` replaces a dedicated Descriptions block that always rendered full-width. After migration, short notes shrink to a single-column cell.

**Fix:** Add `component: text_area` to the `internal_details` entry in `attributes_view_config.yaml`:

```yaml
- key: internal_details
  title: Notes
  component: text_area
```

Or document that short notes intentionally render inline and only long notes get full-width treatment.

### 5. Contacts view column count change from 2 to 1 not mentioned

> **Resolved.** Added "change `column` from 2 to 1" to the contacts `view_contact.yaml` file changes row.

Current `view_contact.yaml:19` uses `column: 2` for the profile DataDescriptions. The design specifies `column: 1` for all views (section 7, decision 7, line 866). The user-account view was already updated to `column: 1` (commit `aee7ea7`), but the contacts view still has `column: 2`.

This changes the contact detail layout from a compact two-column grid to a single-column bordered table. With the contact detail main column at `span: 14` (~58% width), this halves the information density.

Not a bug — `column: 1` is the design intent and consistent with the other views. But it's a visible layout change on the contacts detail page that the file changes table (line 817) doesn't explicitly call out alongside the other changes.

**Fix:** Add "Change DataDescriptions column from 2 to 1" to the contacts `view_contact.yaml` file changes row, so implementers know this is intentional.
