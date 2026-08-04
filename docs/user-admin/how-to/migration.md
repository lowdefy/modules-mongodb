---
title: Migrating from the v0.x surface
module: user-admin
type: how-to
concepts: [migration, breaking-change, betterauth]
---

# Migrating from the v0.x surface

`user-admin` was **rebuilt** on the BetterAuth-based auth engine — this is a major
breaking change, not an in-place upgrade. The old module owned a person as raw
writes against the fused `user_contacts` collection (`apps.{app}` map, `is_user`,
`disabled`, `global_attributes`); the new model splits that record across
app-owned `contact` data and auth-owned `user` / `member` / `invitation` /
`session` records, written only through sanctioned admin steps.

Expect to re-do your module configuration rather than tweak it.

## Prerequisite

The app must run the BetterAuth-based auth engine with a **pinned** org policy
(`auth.organizations.policy: pinned`), an authored `auth.roles` catalog, and
`auth.userAdminRole` set. The adapter database, the `user-contacts` connection,
and the module's read connections must all resolve to **one MongoDB database** —
see [Same-database co-location](../concepts/co-location.md).

## Vars

| v0.x                       | Now                        | Notes                                                                                        |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| `app_name`                 | **removed**                | Per-app scoping by the `apps.{app}` field path is gone; one instance = one pinned org.       |
| `roles`                    | **removed**                | The assignable set comes from the app's authored `auth.roles` catalog (single source).       |
| `app_domain`               | **removed**                | No longer used.                                                                              |
| `fields.global_attributes` | `fields.user_attributes`   | Renamed to the model: global attributes live on the `user` row.                              |
| `fields.app_attributes`    | `fields.member_attributes` | Renamed to the model: this app's attributes live on the `member` row.                        |
| —                          | `admin_roles`              | Catalog role id(s) gating the routine endpoints; name the same role as `auth.userAdminRole`. |
| —                          | `suspension`               | Gates suspend/reinstate (default `true`).                                                    |
| —                          | `download`                 | Gates the Excel export (default `false`).                                                    |

`app_title`, `event_display`, `components.*`, `request_stages.*`, `filter_requests`,
and `avatar_colors` carry over in kind. `event_display` templates now receive
`user` (acting admin) and `target` (edited/invited user).

## Column paths

The rows every members read returns are now a
[documented, closed set of keys](../reference/row-contract.md). A
`components.table_columns` `field:` or `components.download_columns` `value:`
outside that set renders an empty column. Four kinds of path stop resolving:

1. **Raw join paths** — `user.emailVerified`, `contact.updated.by`, and anything
   else under `user.*` or `contact.*`. The reads used to ship both whole source
   documents on every row, so these resolved with no configuration at all.
2. **Alias duplicates** — `attributes.*` (bind `member_attributes.*`), `createdAt`
   (bind `signed_up`, or `created` on invitation rows), `expiresAt` (bind
   `expires_at` on the Invitations tab, `expires` in the export), and
   `profile.picture` (bind the top-level `picture`).
3. **`picture` in the export** — dropped there, kept on the list.
4. **Contact fields** are now reachable directly: bind `profile.<field>` rather
   than lifting it through a stage.

One migration covers 1–3 — lift the value to a top-level key in a
`request_stages.get_all_users` `$addFields`, which still runs before the row is
closed in every read:

```yaml
request_stages:
  get_all_users:
    - $addFields:
        email_verified: "$user.emailVerified"
```

Note that `get_all_users` now also runs on the **Excel export**, over member and
invitation rows alike — the manifest always documented this; the request never
applied it. A stage reading `$contact.*` yields nulls on the invitation half, and a
`$project` or `$replaceRoot` in that slot will break the export. Use `$addFields`.

`request_stages.filter_match` is unaffected: it still runs before the row is closed
and can keep matching raw `user.*` / `contact.*` paths.

## Pages

| v0.x                      | Now                                                         |
| ------------------------- | ----------------------------------------------------------- |
| `all`                     | `all` (Members + Invitations tabs)                          |
| `view` + `edit` + `check` | `view` (single detail page with section-scoped edit modals) |
| `new`                     | `invite` (email-first check-then-invite)                    |

The public **accept page is not this module's** — it belongs to the auth-page
modules (`user-account`).

## Dependencies

- `notifications` is **dropped**. The invite email now rides the deployment's
  `auth.email` (the same path as verification / password-reset / magic-link
  emails). An app that wants bespoke invite copy points
  `auth.email.templates.invitation` at one of its own `notifications:` entries —
  an app-level `auth:` override, not a module dependency.
- `layout` and `events` are unchanged.

## Behaviour changes

- **Search is plain `$match` regex/text** over the joined shape — the Atlas
  `$search` stage and its index requirement are gone. Sized for pinned orgs in the
  low thousands of members.
- **The role filter matches exact split-role elements** — a filter for `admin`
  does not also match `super-admin`.
- **Two revocations, honestly labelled**: **Suspend** (`BanUser`) is permanent,
  user-level, and reaches every app in the suite; **Remove from app**
  (`RemoveMember`) is app-scoped. **Delete login identity** (`DeleteUser`) is
  offered only when the user belongs to no other apps.
- **New engine capabilities**: session listing + sign-out-everywhere, and
  read-only auth-method visibility (email-verified, OAuth providers, MFA,
  passkeys).
- **All raw writes to auth-owned data are gone** — every auth write goes through
  a sanctioned admin step, role-gated and floored by `auth.userAdminRole`.
