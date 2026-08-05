# Task 4: Descriptions on the roles filter and the view chips

## Context

Two display surfaces still show no role descriptions (D4). Both depend on task 1
(resolved entries now carry `description`); the filter additionally reads the
catalog directly at build time.

- `modules/user-admin/components/all_members_filters.yaml` — the Members list Role
  multi-select. Its options map the catalog to a plain `{ value, label }`, and it
  carries a stale `NOTE (running-engine gap)`.
- `modules/user-admin/components/view/tile_attributes.yaml` — the detail page
  Attributes tile. Its ordinary role chip renders `r.label` only (the orphan chip
  already has a `title=` tooltip).

## Task

### `modules/user-admin/components/all_members_filters.yaml` (`filter.roles`)

1. **Give it the same rich two-line label the pickers use** — the catalog `label`
   as the primary line and, when `description` is non-null, a subtitle line
   (`font-size:11px; color:var(--ant-color-text-tertiary)`), built with
   `__build.string.concat` + `__build.if`/`__build.ne` over `0.description`,
   matching `modal_access.yaml`'s option label.
2. **Add `tag: { title: <label> }`** to each option. This is load-bearing, not
   decoration: `MultipleSelector` installs its custom `tagRender` only when
   `properties.renderTags || hasTagStyling`, where `hasTagStyling = opt.color ||
opt.tag`. With neither, antd's default tag renders the `Option`'s children — the
   whole two-line `<div>` — inside a control capped at `maxWidth: 260px`. Adding
   `tag` flips `hasTagStyling` on and routes the chip through `tagRender`'s `title`
   (the compact label), exactly as the two pickers do.
3. **Add the description to `filterString`** so search matches either line:

```yaml
filterString:
  __build.string.concat:
    - __build.args: 0.label
    - " "
    - __build.if_none:
        - __build.args: 0.description
        - ""
```

Do **not** drop `filterString` to reach `filterOption`'s HTML fallback — that
string includes the inline styles, so `line-height` / `font-size` / `color`
would become matchable terms. 4. **Delete the `NOTE (running-engine gap)` comment block** (lines ~53–57). Keep
the "options from the app's authored catalog" description comment.

The option `value` stays the role id; the filter still matches exact `appRoles`
elements via `$in` in `get_all_members.yaml`.

### `modules/user-admin/components/view/tile_attributes.yaml` (`attributes_roles`)

1. On the **ordinary** chip's `<span>` (the `{% else %}` branch of the roles
   loop), add `title="{{ r.description }}"`, matching the tooltip the orphan chip
   already carries. No `{% if %}` guard is needed — a `null` description renders as
   an empty `title` attribute, which is the same as omitting it.
2. **Fix the stale `on:` comment** ("Roles split from member.role + catalog-resolved
   to `{ label, orphan }`"). Roles come from `appRoles`, catalog-resolved to
   `{ id, label, description, orphan }`. State the current shape without journey
   framing.

## Acceptance Criteria

- The Role filter options carry the two-line label, `tag: { title: label }`, and a
  description-inclusive `filterString`; no `NOTE (running-engine gap)` remains.
- The ordinary role chip on the Attributes tile has a `title="{{ r.description }}"`
  tooltip; the `on:` comment reflects the `{ id, label, description, orphan }` shape.
- `pnpm ldf:b` succeeds; `pages/user-admin/all.json` shows the filter's rich
  options with `tag`.

## Notes

A role with no `description` renders label-only everywhere (empty tooltip, empty
subtitle) — unchanged behaviour for those roles. The selected chip stays label-only
by design (the `tag.title`); descriptions belong in the dropdown, not the pill.
