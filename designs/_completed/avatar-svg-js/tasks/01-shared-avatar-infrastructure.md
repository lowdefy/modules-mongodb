# Task 1: Shared Avatar Infrastructure

## Context

Avatar SVG generation is currently duplicated across 8 files in 3 modules using deeply nested `_nunjucks` templates. This task creates the shared foundation that all subsequent tasks depend on: a `.njk` text template producing `_js` code, a shared avatar color palette, module var declarations, and cleanup of the deprecated component.

The `modules/shared/profile/` directory already exists with `form_fields.yaml`, `set_fields.yaml`, and `view_config.yaml` — the new files follow the same shared pattern.

Currently `avatar_colors` is defined only in `modules/user-account/module.lowdefy.yaml` (line 28-31) referencing `defaults/avatar_colors.yaml`. The user-admin and contacts modules don't have this var, so they hardcode `#37474f/#546e7a`. After this task, all three modules will have `avatar_colors` as a var defaulting to the shared palette.

## Task

### 1. Create `modules/shared/profile/generate-avatar-svg.js.njk`

This is a Nunjucks **text** template that produces JavaScript code at build time. The `_ref` renders it with a `prefix` var, and `_js` executes the result at runtime.

```javascript
// Build-time template: _ref renders this .njk with vars (e.g. prefix),
// producing a plain JS string that _js executes at runtime.
const gn = (state("{{ prefix }}.given_name") || "").trim();
const fn = (state("{{ prefix }}.family_name") || "").trim();
let initials;
if (gn && fn) initials = (gn[0] + fn[0]).toUpperCase();
else if (gn.length > 1) initials = gn.substring(0, 2).toUpperCase();
else if (gn) initials = gn.toUpperCase();
else initials = "?";
const from = state("{{ prefix }}.avatar_color.from") || "#37474f";
const to = state("{{ prefix }}.avatar_color.to") || "#546e7a";
const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${from}'/><stop offset='100%' stop-color='${to}'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><text x='64' y='64' dominant-baseline='central' text-anchor='middle' fill='white' font-family='sans-serif' font-size='48' font-weight='bold'>${initials}</text></svg>`;
return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
```

Create this file exactly as shown. The `{{ prefix }}` placeholders are Nunjucks variables replaced at build time. The rest is literal JavaScript.

### 2. Move `avatar_colors.yaml` to shared location

Move `modules/user-account/defaults/avatar_colors.yaml` to `modules/shared/profile/avatar_colors.yaml`. The content is unchanged — 20 gradient pairs with `from`/`to` keys.

Keep the original file at `modules/user-account/defaults/avatar_colors.yaml` with the same content for now (it will be cleaned up when the user-account module var path is updated below). Actually, just move it — the module var update below will fix the reference.

### 3. Update `modules/user-account/module.lowdefy.yaml`

Change the `avatar_colors` var default from `_ref: defaults/avatar_colors.yaml` to `_ref: modules/shared/profile/avatar_colors.yaml`.

Current (lines 28-31):

```yaml
avatar_colors:
  default:
    _ref: defaults/avatar_colors.yaml
  description: "Gradient pairs for avatar backgrounds. Each entry: { from, to }."
```

New:

```yaml
avatar_colors:
  default:
    _ref: modules/shared/profile/avatar_colors.yaml
  description: "Gradient pairs for avatar backgrounds. Each entry: { from, to }."
```

### 4. Add `avatar_colors` var to `modules/user-admin/module.lowdefy.yaml`

Add the var in the `vars:` section (after `filter_requests`):

```yaml
avatar_colors:
  default:
    _ref: modules/shared/profile/avatar_colors.yaml
  description: "Gradient pairs for avatar backgrounds. Each entry: { from, to }."
```

### 5. Add `avatar_colors` var to `modules/contacts/module.lowdefy.yaml`

Add the var in the `vars:` section (after `filter_requests`):

```yaml
avatar_colors:
  default:
    _ref: modules/shared/profile/avatar_colors.yaml
  description: "Gradient pairs for avatar backgrounds. Each entry: { from, to }."
```

### 6. Delete `modules/user-account/components/avatar-svg-src.yaml`

This file is a reusable SVG component that accepted `_var` inputs (from, to, initials). It's replaced by the shared `.njk` template. Delete it.

### 7. Delete `modules/user-account/defaults/avatar_colors.yaml`

This file has been moved to the shared location. Delete the original.

## Acceptance Criteria

- `modules/shared/profile/generate-avatar-svg.js.njk` exists with the exact JS template content above
- `modules/shared/profile/avatar_colors.yaml` exists with the 20 gradient pairs (identical content to the old `defaults/avatar_colors.yaml`)
- `modules/user-account/defaults/avatar_colors.yaml` is deleted
- `modules/user-account/components/avatar-svg-src.yaml` is deleted
- All 3 module.lowdefy.yaml files have `avatar_colors` var referencing `modules/shared/profile/avatar_colors.yaml`
- Lowdefy build still succeeds (the new files exist but nothing references the .njk yet — that's fine)

## Files

- `modules/shared/profile/generate-avatar-svg.js.njk` — **create** — shared JS template for SVG data URI generation
- `modules/shared/profile/avatar_colors.yaml` — **create** (move from defaults) — 20-entry gradient palette
- `modules/user-account/defaults/avatar_colors.yaml` — **delete** — moved to shared location
- `modules/user-account/components/avatar-svg-src.yaml` — **delete** — replaced by shared .njk template
- `modules/user-account/module.lowdefy.yaml` — **modify** — update avatar_colors ref path
- `modules/user-admin/module.lowdefy.yaml` — **modify** — add avatar_colors var
- `modules/contacts/module.lowdefy.yaml` — **modify** — add avatar_colors var

## Notes

- The `_ref` path `modules/shared/profile/avatar_colors.yaml` resolves from the config root (`apps/demo/`), not from the file location. This matches other shared `_ref` paths in the project.
- The `.njk` file extension tells the Lowdefy build to process it as a Nunjucks text template. The output is a plain JavaScript string.
