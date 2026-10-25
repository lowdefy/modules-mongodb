---
"@lowdefy/modules-mongodb-user-admin": minor
"@lowdefy/modules-mongodb-companies": minor
---

The Members and Invitations tables (user-admin) and the Companies list table (companies) now use Lowdefy's `Table` block instead of AgGrid, so an app that drops the AgGrid plugin keeps these pages. Columns, row click, cell content and the empty state are unchanged. Needs a Lowdefy version that ships `@lowdefy/blocks-table`.

Apps must change `components.table_columns` on both modules: it now takes `Table` columns, not AgGrid column definitions. Rename `headerName` to `title`, give each column a `key` (`field` stays, and defaults to the key), move `cell.type` to the column's `type`, and replace `cellRenderer` with an `html` column's `cell.template` or a `tag` column's `options`. For example `{ headerName: Department, field: profile.department }` becomes `{ key: department, field: profile.department, title: Department }`.

Rows on the Members and Invitations tables still sort on the server (the sort menu), so header sorting is off there; the invitation actions are one buttons column that fires `onResend`, `onCancel` and `onReinvite`.
