---
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-user-admin": minor
---

PLACEHOLDER — do not add another changeset for the Better Auth migration.

This entry covers **all** user-account and user-admin work in the Better Auth
migration (`designs/user-account-better-auth/`, `designs/user-admin-better-auth/`,
and the `designs/users-fixes/` finding batches), including the layout and
`modules/shared/` changes made in service of it.

The migration is still in progress, so the release note is deliberately not
written yet — describing it commit by commit would produce a changelog of
intermediate states that never shipped. Rewrite this file as one coherent
consumer-facing note when the migration lands, and revisit the bump level then.

Until then: do not create per-commit changesets for this work. Add anything a
consumer will need to know here instead.

## Notes for the eventual release note

**`user-admin` members rows are now a documented, closed contract.** Every members
read (list, detail, Excel export) carries the three configurable field bags —
`profile`, `user_attributes`, `member_attributes` — under the same names as the
`fields.*` vars, so a `components.table_columns` `field:` and a
`components.download_columns` `value:` are the same path string as the form block id
that collects the field. `components.download_columns` works at all for the first
time, and `request_stages.get_all_users` now applies to the Excel export as the
manifest has always documented.

In exchange the rows no longer ship the raw `$lookup` payloads. Column paths that
resolve today and will go blank: anything under `user.*` / `contact.*`,
`attributes.*`, `createdAt`, `expiresAt`, `profile.picture`, and `picture` in the
export. The migration is one `request_stages.get_all_users` `$addFields` lifting the
value to a top-level key — it still runs before the row is closed. Full detail in
`docs/user-admin/reference/row-contract.md` and the Column paths section of
`docs/user-admin/how-to/migration.md`.
