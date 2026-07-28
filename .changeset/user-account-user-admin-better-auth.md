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
