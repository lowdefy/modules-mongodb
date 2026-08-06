# Task 5: Members table — drop dead branch, fix entry-shape comments

## Context

`modules/user-admin/components/all_members_table.yaml` renders the Members list.
Its Roles-column `cellRenderer` (Nunjucks) has three branches: orphan (`⚑`),
`{% elif r.primary %}` (purple pill), and ordinary. The `primary` field is never
produced by `roles_from_catalog` and nothing defines it — the branch is dead. The
column also carries entry-shape comments (around lines 40 and 81) still describing
rows as `{ label, orphan }`, now stale after task 1.

Task 1 must be complete so the corrected comments describe the shape it produces.

## Task

Edit `modules/user-admin/components/all_members_table.yaml`:

1. **Remove the `{% elif r.primary %}` branch** from the Roles-column
   `cellRenderer` Nunjucks template, leaving orphan (`{% if r.orphan %}`) and
   ordinary (`{% else %}`) branches. The purple-pill markup and its `var(--ant-purple-*)`
   styles go with it.
2. **Update the two entry-shape comments** (the Roles-column comment ~line 40 and
   the `rowData` comment ~line 81) from `{ label, orphan }` to the resolved shape
   this design produces: entries are `{ id, label, description, orphan }`, resolved
   against the catalog with orphans flagged. Describe the current shape; no journey
   framing.

Leave the orphan and ordinary chip markup, styles, and all other columns unchanged.

## Acceptance Criteria

- No `{% elif r.primary %}` branch (and no `primary`/`--ant-purple` reference) in
  the Roles column.
- Entry-shape comments read `{ id, label, description, orphan }`.
- `pnpm ldf:b` succeeds; the Members table still renders orphan and ordinary chips.

## Notes

The earlier `$split` / task-number comments review-2 flagged are already gone from
this file — do not re-add or reference them.
