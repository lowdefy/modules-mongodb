---
"@lowdefy/modules-mongodb-companies": patch
---

Standardise soft-delete reads on the `deleted` change-stamp shape.

The regular-MongoDB requests (`get_company`, `get_company_children`, `get_descendant_company_ids`, `get_companies_for_selector`) matched live companies with `deleted: { $ne: true }`, which only excludes a boolean `deleted: true` and would let soft-deleted docs through once `deleted` is a change-stamp object. They now use `deleted.timestamp: { $exists: false }`, matching the Atlas Search reads and the rest of the repo. See the [soft-delete convention](https://github.com/lowdefy/modules-mongodb/blob/main/docs/shared/soft-delete.md).

Migration is only needed if a host app previously wrote a boolean `deleted: true`; promote those to a change stamp:

```js
db.companies.updateMany(
  { deleted: true },
  [{ $set: { deleted: { timestamp: "$updated.timestamp", user: "$updated.user" } } }]
);
```
