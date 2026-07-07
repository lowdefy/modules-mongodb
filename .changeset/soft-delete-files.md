---
"@lowdefy/modules-mongodb-files": minor
---

Soft-delete now uses a `deleted` change stamp instead of a `removed` boolean (breaking).

The soft-delete marker on file docs is renamed `removed` → `deleted` and changed from a boolean to a [change stamp](https://github.com/lowdefy/modules-mongodb/blob/main/docs/shared/soft-delete.md) object, matching the convention used by `activities` and the rest of the repo. `delete-file` sets `deleted` to a change stamp (capturing who/when), `save-file` initialises `deleted: null`, and `get-entity-files` reads live files with `deleted.timestamp: { $exists: false }`.

Existing data needs a migration. Deleted docs already recorded who/when on their `updated` stamp, so promote it into `deleted`:

```js
db.files.updateMany(
  { removed: true },
  [{ $set: { deleted: "$updated" } }, { $unset: "removed" }]
);
db.files.updateMany(
  { removed: { $ne: true } },
  { $set: { deleted: null }, $unset: { removed: "" } }
);
```
