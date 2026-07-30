---
title: Members row contract
module: user-admin
type: reference
concepts:
  [row-contract, table-columns, download-columns, field-bags, request-stages]
---

# Members row contract

Every members read — the Members list, the user detail read, and the Excel export —
returns rows with the same set of keys. **This is the set a
[`components.table_columns`](vars.md) `field:` or a `components.download_columns`
`value:` may bind.** A path outside it renders an empty column, silently, with no
build error.

## The keys

| Key                     | Type                | Source                                                   |
| ----------------------- | ------------------- | -------------------------------------------------------- |
| `_id`                   | string              | member id                                                |
| `userId`                | string              | auth user id                                             |
| `organizationId`        | string              | the pinned org                                           |
| `role`                  | string              | raw CSV role ids                                         |
| `name`                  | string              | `contact.profile.name` ?? `user.name`                    |
| `email`                 | string              | `user.email`                                             |
| `picture`               | string \| null      | `contact.profile.picture`                                |
| `roles_arr`             | string[]            | split role ids                                           |
| `roles`                 | `{label, orphan}[]` | resolved against the app's role catalog                  |
| `status`                | string              | `Active` / `Suspended`                                   |
| `created` / `updated`   | date \| null        | contact change-stamp timestamps                          |
| `signed_up`             | date                | member `createdAt`                                       |
| `total_results`         | number              | list read only (pagination)                              |
| **`profile`**           | object              | `contact.profile` — the `fields.profile` bag             |
| **`user_attributes`**   | object              | `user.attributes` — the `fields.user_attributes` bag     |
| **`member_attributes`** | object              | `member.attributes` — the `fields.member_attributes` bag |

The bold three are the configurable field bags. They ride under **exactly the names
the `fields.*` vars use**, so a column path is the same string as the form block id
that collects the field:

| `fields.*` block id      | `table_columns` `field:` | `download_columns` `value:` |
| ------------------------ | ------------------------ | --------------------------- |
| `profile.department`     | `profile.department`     | `profile.department`        |
| `user_attributes.notes`  | `user_attributes.notes`  | `user_attributes.notes`     |
| `member_attributes.team` | `member_attributes.team` | `member_attributes.team`    |

One vocabulary across manifest var, form state path, row key, table column and
export column — nothing to opt into and nothing to remember. Dotted paths work in
both places: AgGrid resolves a `field:` path natively, and `DownloadXlsx` resolves
each `value:` through `get(row, value)`.

```yaml
components:
  table_columns:
    - headerName: Department
      field: profile.department
      width: 140
  download_columns:
    - column: department
      value: profile.department
      type: String
      width: 20
```

## A bag column renders the stored value

The row carries what the form wrote. An enum-backed field — a `Selector` over
`{label, value}` pairs — therefore renders its **slug**: `alpha`, not `Alpha`.
Prettifying is the column's job, via a `cellRenderer` on the table side (the Roles
column is the in-repo pattern). A spreadsheet cell has no renderer, so the export
emits the stored slug.

`apps/demo/modules/user-admin/vars.yaml` carries a worked example of both bag kinds,
including the slug→label renderer on the Team column.

## Export divergences

The export merges member and pending-invitation rows into one sheet, so three keys
differ from the table above:

- **`roles`** is the stored role ids joined by `", "`, not the `{label, orphan}[]`
  catalog objects — a spreadsheet cell can't hold the array.
- **`expires`** is added: the invitation expiry, `null` on member rows.
- **`picture`** is dropped. It holds an ~800-character `data:` URI SVG and the export
  fetches every row at once, so it is stripped rather than repeated per row.

**Invitation rows carry `member_attributes` but no `profile` and no
`user_attributes`.** There is no user and no contact yet, so a column bound to a
profile path is blank for invited rows — which is the honest answer rather than an
error. Invitation rows also carry their own keys (`inviter_name`, `expires_at`,
`role_ids`) and their `_id` is the invitation id, not a member id; none of those are
part of this contract.

## Binding something outside the contract

The row is deliberately closed: the raw `$lookup` payloads (`user`, `contact`,
`passkeys`, `inviter`) are stripped before the row reaches the browser, as are the
stored fields that already ship under a canonical alias (`attributes`, `createdAt`,
`expiresAt`, `profile.picture`).

For a column the three bags don't cover, use
[`request_stages.get_all_users`](vars.md) to lift the value to a top-level key. That
slot runs **before** the row is closed in both the list read and the export, so it
still sees the raw joins:

```yaml
request_stages:
  get_all_users:
    - $addFields:
        email_verified: "$user.emailVerified"
components:
  table_columns:
    - headerName: Verified
      field: email_verified
      width: 110
```

On the export the same stages run over member **and** invitation rows, so a stage
reading `$contact.*` yields nulls on the invitation half. `$project` or `$replaceRoot`
in that slot will break the export — use `$addFields`.

## Related

- [Vars](vars.md) — `components.table_columns`, `components.download_columns`,
  `request_stages.get_all_users`
- [Slots](../../shared/slots.md) — the `fields` / `components` / `request_stages`
  extension points across modules
- [Migrating from v0.x](../how-to/migration.md) — what changed when the row was closed
