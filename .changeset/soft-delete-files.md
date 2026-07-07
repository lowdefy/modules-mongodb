---
"@lowdefy/modules-mongodb-files": minor
---

Soft-delete now uses a `deleted` change stamp instead of a `removed` boolean (breaking).

The soft-delete marker on file docs is renamed `removed` → `deleted` and changed from a boolean to a [change stamp](https://github.com/lowdefy/modules-mongodb/blob/main/docs/shared/soft-delete.md) object, matching the convention used by `activities` and the rest of the repo. `delete-file` sets `deleted` to a change stamp (capturing who/when), `save-file` initialises `deleted: null`, and `get-entity-files` reads live files with `deleted.timestamp: { $exists: false }`.

Existing data needs a migration. Deleted docs already recorded who/when on their `updated` stamp, so promote it into `deleted`. Run it as a single per-document pipeline (a separate `{ removed: { $ne: true } }` pass would match already-migrated docs — `$ne` matches missing fields — and clobber the new stamps):

```js
db.files.updateMany({ removed: { $exists: true } }, [
  { $set: { deleted: { $cond: [{ $eq: ["$removed", true] }, "$updated", null] } } },
  { $unset: "removed" },
]);
```
