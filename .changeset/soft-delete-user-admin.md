---
"@lowdefy/modules-mongodb-user-admin": patch
---

Standardise the soft-delete read on the `deleted` change-stamp shape.

`get_all_users` and `get_user_excel_data` matched live users with `deleted: null`. They now use `deleted.timestamp: { $exists: false }` so every module reads soft-delete identically (see the [soft-delete convention](https://github.com/lowdefy/modules-mongodb/blob/main/docs/shared/soft-delete.md)). Behaviour is unchanged — both predicates treat `null`/absent as live and exclude a real delete stamp.
