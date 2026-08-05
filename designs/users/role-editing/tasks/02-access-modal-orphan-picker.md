# Task 2: Access-modal orphan picker — options, seed, no `required`

## Context

This is the core correctness fix (D1, D2, D4-search, D6, D-alias-internal). Two
files:

- `modules/user-admin/requests/get_user_detail.yaml` — the detail read. It emits a
  `role_ids` alias (a raw id array) that seeds the access modal, plus `has_orphan`.
- `modules/user-admin/components/view/modal_access.yaml` — the "Edit attributes"
  modal. Its role `MultipleSelector` builds `options` from the catalog **alone**,
  but seeds its value from `get_user_detail.0.role_ids` (all held ids, orphans
  included).

The mismatch is the live bug: `MultipleSelector` matches values to options by
string index (`getSelectedIndex`), so a held orphan not present in `options`
reaches Ant Design as `undefined` — rendering a blank, closable chip, and on any
edit-and-save pushing a literal `null` into the written `appRoles` array. The
migration's comment claims the orphan "stays selected and can be removed but not
re-added without options"; that assertion is false.

The fix: offer `catalog ids ∪ held orphans` as ordinary enabled options, and seed
the picker from the resolved `roles` array (which now carries `id`, task 1) so the
seed and the orphan options come from one source.

Task 1 must be complete: this task reads `roles[].id` and depends on `orphan_ids`
being built from the resolved `roles`.

## Interfaces

- **Consumes:** `roles_from_catalog` entries now carry `id` + `description` (task 1).
- **Produces:** `get_user_detail.0.orphan_ids` — a `string[]` of held role ids the
  catalog no longer declares. Consumed only within this task (the orphan options).
  `role_ids` is removed from `get_user_detail` (finishes in task 7 across the base
  stages).

## Task

### `modules/user-admin/requests/get_user_detail.yaml`

1. **Drop the `role_ids` field** (the `$ifNull: ["$appRoles", []]` block, lines
   ~57–63 with its comment). It is a raw-id alias (D-alias) and its only reader is
   the access-modal seed, moved below.
2. **Add `orphan_ids`** in the same `$addFields`, built from the resolved `$roles`
   array `has_orphan` already reads — so the two cannot disagree:

```yaml
# The member's held role ids the catalog no longer declares. Seeds the access
# modal's orphan selector options.
orphan_ids:
  $map:
    input:
      $filter:
        input: "$roles"
        as: r
        cond: "$$r.orphan"
    as: r
    in: "$$r.id"
```

3. Keep `has_orphan`, `org_role`, and everything else unchanged. Fix the header
   comment's `roles_arr` mention (line ~4) — the detail read no longer carries a
   raw-id alias; describe the fields it actually produces (`roles`, `orphan_ids`,
   `has_orphan`, `org_role`) without journey framing.

### `modules/user-admin/components/view/modal_access.yaml`

1. **Re-seed the picker from `roles` → ids.** Replace the `onOpen` seed
   `roles: { _request: get_user_detail.0.role_ids }` with a map over the resolved
   `roles`:

```yaml
roles:
  _array.map:
    on:
      _request: get_user_detail.0.roles
    callback:
      _function:
        __args: 0.id
```

2. **Concatenate held-orphan options onto the catalog options.** Wrap the existing
   `options: { _build.array.map: … over _build.authConfig.roles }` in a
   `_build.array.concat`, appending an orphan-options map over
   `get_user_detail.0.orphan_ids`. Each orphan option has the **same entry shape**
   as a catalog option (so it renders through the existing chip + dropdown paths),
   with `value` = the real id and a `(no longer configured)` label:

```yaml
options:
  _build.array.concat:
    -  # existing _build.array.map over _build.authConfig.roles — unchanged (see filterString below)
    - _build.array.map:
        on:
          _request: get_user_detail.0.orphan_ids
        callback:
          _build.function:
            value:
              __build.args: 0
            filterString:
              __build.args: 0
            tag:
              title:
                __build.string.concat:
                  - __build.args: 0
                  - " (no longer configured)"
            label:
              __build.string.concat:
                - '<div style="line-height:1.3"><div>'
                - __build.args: 0
                - " (no longer configured)</div></div>"
```

The orphan option is an **ordinary enabled option**, not `disabled: true`:
rc-select computes a tag's closable flag as `closable = !disabled && !itemDisabled`
(`MultipleContent.js:109`), so a disabled option renders a **non-removable**
chip — it would label the orphan and trap it. An enabled option is removable and
is also less config. The orphan has no description subtitle (no catalog entry to
read one from).

3. **Add `description` to the catalog option's `filterString`** (D4 search). The
   catalog `_build.function` currently sets `filterString: { __build.args: 0.label }`.
   Change it to label + description so typing a description word matches:

```yaml
filterString:
  __build.string.concat:
    - __build.args: 0.label
    - " "
    - __build.if_none:
        - __build.args: 0.description
        - ""
```

4. **Delete `required: true`** from the `roles` `MultipleSelector` (D6). It
   compiles to `pass: { _not: { _type: 'none' } }`, which an array value (`[]` is
   not `none`) can never fail — inert as validation but it draws the red asterisk.
   A member with no roles is a supported state. Leave the existing
   `Validate` action (`regex: ['^roles$', '^member_attributes\.']`) untouched — it
   now matches a field with no rules, which is harmless and keeps the namespace
   covered.
5. **Leave the `org_role` single `Selector`'s `required: true`** in place — its
   value is a string, `_not none` can fire, and the field genuinely requires a
   value.
6. **Update the header / seed comments** to describe the current behaviour: the
   picker offers catalog roles plus the member's held orphans (removable, not
   re-addable once saved), seeded from the resolved `roles`. Remove the false
   "stays selected … but is not an option to re-add" assertion. The `has_orphan`
   `extra` hint copy already reads well; if reworded, state that the save works
   ("You can save as-is, or remove it — once removed it cannot be added back").

## Acceptance Criteria

- `get_user_detail` emits `orphan_ids` (held ids absent from the catalog) and no
  longer emits `role_ids`.
- The modal seeds `roles` by mapping `get_user_detail.0.roles` to its ids.
- `options` is catalog options concatenated with one enabled option per orphan id,
  labelled `<id> (no longer configured)`, with `value` = the real id.
- The catalog option `filterString` includes the description.
- No `required: true` on the `roles` `MultipleSelector`; `org_role`'s is untouched.
- `pnpm ldf:b` succeeds; `pages/user-admin/view.json` shows the concatenated
  options structure and no `required` on the roles field.

## Notes

The orphan cannot be re-added once removed and saved: the orphan options come from
`orphan_ids` (a detail-read field), so after saving, the refetch drops the removed
id from `appRoles` and it is no longer an option. Within one unsaved session it can
be re-selected — harmless, the member already holds it. This is the intended
behaviour, not a gap to guard.
