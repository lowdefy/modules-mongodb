---
"@lowdefy/modules-mongodb-contacts": patch
---

Standardise the soft-delete read on the `deleted` change-stamp shape.

`get_contact_companies` filtered the companies lookup with `deleted: { $ne: true }`, which would let soft-deleted companies through once `deleted` is a change-stamp object. It now uses `deleted.timestamp: { $exists: false }`, matching the [soft-delete convention](https://github.com/lowdefy/modules-mongodb/blob/main/docs/shared/soft-delete.md).
