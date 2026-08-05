---
title: Indexes
module: user-admin
type: reference
concepts: [indexes, mongodb, roles, org-slug]
---

# User Admin — Indexes

The module does not create indexes — index creation is a host-app concern. Host apps must add the following index to the collection backing the `user-members` connection, before the members list carries production traffic.

## `user-members` collection

### Index: `{ organizationId: 1, appRoles: 1 }` — **multikey compound**, not unique

```
db["user-members"].createIndex({ organizationId: 1, appRoles: 1 })
```

Serves the members list's role filter (`get_all_members`). The roles clause is spliced into the read's pre-join `$match` — `{ appRoles: { $in: [...] } }` on the member root, ahead of the `$lookup`s to `users` and `user-contacts` — and sits immediately after the base pipeline's own `$match: { organizationId }`. MongoDB coalesces the two adjacent `$match` stages into one, so the compound index serves the pair as a single leading-key scan.

`member.appRoles` is a native array of app-role ids, so an index on it is **multikey** — MongoDB indexes one key per element, and a member holding three roles has three entries. **Not unique.** A member holds many app roles, and many members of one organization hold the same role; uniqueness would reject the second member granted any role.

**Key order matters.** `organizationId` leads because every read scopes to the one organization this module instance administers; `appRoles` trails as the selected filter. Leading on `appRoles` instead would leave the organization scope unindexed.

| Query site                     | Operation                                                                 |
| ------------------------------ | -------------------------------------------------------------------------|
| `user-admin` members list read | `$match` on `organizationId`, then `$match` on `appRoles: { $in: [...] }` |

**Performance, not correctness.** The role filter works without this index — it just falls back to a full scan of the organization's whole membership on every filtered read. This is the members list's most expensive read, so the index is what keeps it off that full scan; nothing breaks in its absence, but it silently degrades under production traffic.

**The field names are the physical, adapter-derived columns.** `organizationId` and `appRoles` are the current camelCase names BetterAuth's adapter stores today. The upstream snake-case-data-fields rename has **not** landed; when it does, this page is regenerated with the snake-case names (`organization_id` / `app_roles`). An index built on the camelCase keys against snake_case columns is never matched by the query planner — the same silent full scan as having no index at all.

**Module-owned, host-app-created** — the same footing as the indexes documented in [`user-account`](../../user-account/reference/indexes.md#user-members-collection). Nothing in this repo provisions it.
