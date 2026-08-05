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
| `organizationId`        | string              | the organization named by `org_slug`                     |
| `name`                  | string              | `contact.profile.name` ?? `user.name`                    |
| `email`                 | string              | `user.email`                                             |
| `picture`               | string \| null      | `contact.profile.picture`                                |
| `roles`                 | `{ id, label, description, orphan }[]` | `appRoles` resolved against the app's role catalog |
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

## The app-role key, and the organization tier

The row publishes the member's **app roles** under a single key, `roles`, fed from
the stored `member.appRoles` array — a native `string[]` of catalog role ids —
resolved against the app's authored `auth.roles` catalog into
`{ id, label, description, orphan }` objects:

- **`id`** — the id as stored in `appRoles`.
- **`label`** — the catalog's display label for that id.
- **`description`** — the catalog's description for that id, or `null` if the
  catalog entry carries none.
- **`orphan`** — `true` when the id is held in data but no longer in the catalog.

`roles` is the one roles binding: there is no separate raw-id key. It exists on
every row (`$ifNull` to `[]`), so a blank Roles column is always a data question,
never a shape question.

`member.role` is a **different fact**: BetterAuth's `owner` / `admin` / `member`
organization-authority tier, which decides who may administer the organization. It is
not an app role and not a display column, so **it does not ship on the row** — the
last stage of every read `$unset`s both `role` and `appRoles`. The **user detail read
alone** publishes the tier under its own name, **`org_role`** (`member` when unset),
because the detail page's access modal binds it. `org_role` is not on the Members list
row, not on the Invitations row, and not in the export.

> **Breaking change.** A `table_columns` `field:` or `download_columns` `value:`
> bound to `role`, `roles_arr`, or `role_ids` all **blank** — silently, like any path
> outside the contract. `roles_arr` and `role_ids` are removed; the per-entry ids are
> available as `roles[].id`. Bind `roles` for both the ids and the resolved labels —
> it is the single roles binding on the row.

An earlier iteration of this module kept `roles_arr` (and the invitation-row
`role_ids`) as published contract fields, mirroring org-authority Decision 11 — the
premise there being that a consumer would bind `table_columns` / `download_columns`
directly to the raw ids. That premise does not hold for this module: consumers bind
their own custom attributes rather than the raw role ids, and roles display through
the resolved `roles` column on both the table and the export. Both raw-id aliases are
dropped; `roles` is the single roles surface.

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

- **`roles`** is the stored `appRoles` ids joined by `", "`, not the
  `{ id, label, description, orphan }[]` catalog objects — a spreadsheet cell can't
  hold the array or object shape.
- **`expires`** is added: the invitation expiry, `null` on member rows.
- **`picture`** is dropped. It holds an ~800-character `data:` URI SVG and the export
  fetches every row at once, so it is stripped rather than repeated per row.

**Invitation rows carry `member_attributes` but no `profile` and no
`user_attributes`.** There is no user and no contact yet, so a column bound to a
profile path is blank for invited rows — which is the honest answer rather than an
error. Invitation rows also carry their own keys (`inviter_name`, `expires_at`) and
their `_id` is the invitation id, not a member id; none of those are part of this
contract.

## Binding something outside the contract

The row is deliberately closed: the raw `$lookup` payloads (`user`, `contact`,
`passkeys`, `inviter`) are stripped before the row reaches the browser, as are the
stored fields that already ship under a canonical alias (`appRoles`, `attributes`,
`createdAt`, `expiresAt`, `profile.picture`) and the one the contract deliberately does
not publish (`role`, the organization tier).

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
