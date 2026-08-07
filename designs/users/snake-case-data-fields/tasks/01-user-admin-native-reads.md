# Task 1: Flip `user-admin` native reads to snake_case

## Context

The upstream auth adapter now stores every auth-collection column in snake*case
(`userId → user_id`, `organizationId → organization_id`, `emailVerified → email_verified`,
etc.). `user-admin` is a native reader of those collections: its requests and shared stages
run MongoDB pipelines directly against them. This task moves every **native pipeline
reference** and **pass-through projection output key** in `user-admin/requests/**` (including
`stages/**`) from camelCase to snake_case. It also flips the deep-link query-key **readers**
(`_url_query`) in the `get_user*\*`requests to`user_id` (see Notes).

This is a **plane-aware** edit — flip only refs that read physical storage. Do **not** touch
`$lookup` `as:` aliases (author-chosen names), JSON bag inner keys (`user.profile.contactId`,
`user.attributes.*`, `member.attributes.*`), `member.role`, or single-word columns
(`token`, `email`, `role`, `status`, `slug`, `banned` — snakeCase is a no-op on them).

Look up any block/request/operator contract you're unsure of via the `lowdefy-docs` MCP
(`lowdefy_get_schema`, `lowdefy_get_examples`) — do not guess.

## Interfaces

- **Produces (the `user-admin` snake row contract that Task 3 consumes):**
  - `get_all_members` rows keyed on `user_id`, `app_roles`.
  - `get_user_detail` projects `email_verified`, `two_factor_enabled`; matches on `user_id`;
    exposes a `user_id` field.
  - `get_user_accounts` rows keyed on `user_id`, `provider_id`.
  - `get_all_invitations` / `get_users_excel_data` expose `app_roles`, `expires_at`.
  - All `get_user_*` requests read the deep-link query key as **`user_id`**.

## Task

Flip the following files. For each, change native `$match` fields, `$lookup`
`localField`/`foreignField`, and `$project`/`$addFields` **source** refs from camelCase to
snake_case, and flip any pass-through projection **output** key that equals a physical column
(`field: 1` projects the physical column — the old key would now project nothing).

**`requests/`:**

- `get_user_detail.yaml` — `$match userId → user_id`; passkeys `$lookup` on `userId → user_id`;
  `$user.emailVerified → $user.email_verified`, `$user.twoFactorEnabled → $user.two_factor_enabled`
  sources; `$userId → $user_id`. **The `$addFields: user_id: "$userId"` collapses to
  `user_id: "$user_id"`** — the aliasing becomes a plain source rename.
- `get_user_passkeys.yaml` — native passkey refs on `userId`.
- `get_user_accounts.yaml` — `$match userId`; `providerId` (as `$match` and/or projected
  output) → `provider_id`.
- `get_user_memberships.yaml` — `userId`, `organizationId`.
- `get_user_sessions.yaml` — `userId`.
- `get_all_members.yaml` — `appRoles → app_roles`, `organizationId → organization_id`.
- `get_all_invitations.yaml` — native invitation refs (`organizationId`, `expiresAt`,
  `inviterId` as they appear).
- `get_users_excel_data.yaml` — `appRoles → app_roles`, `expiresAt → expires_at`.

**`requests/stages/`:**

- `members_base.yaml` — `organizationId → organization_id`, the `userId` `$lookup`
  `localField`/`foreignField` → `user_id`, `$createdAt → $created_at` (feeds `signed_up`).
  **Leave `user.profile.contactId`** — it is the members `localField` but a JSON bag key,
  not a physical column; it must NOT flip.
- `members_filter.yaml` — native filter refs on renamed columns.
- `invitations_base.yaml` — `organizationId → organization_id`, `inviterId → inviter_id`,
  `expiresAt → expires_at`.
- `roles_from_catalog.yaml` — `appRoles → app_roles`.
- `close_row.yaml` — the `$unset` list: `appRoles → app_roles`, `createdAt → created_at`,
  `expiresAt → expires_at`.

Update **comment references** to any renamed column in these files (e.g. a comment naming
`appRoles`/`expiresAt`/`userId` beside a snake `$match`).

## Acceptance Criteria

- Every native `$match`/`$lookup`/`$project`/`$addFields` source ref and every pass-through
  projection output key on a renamed column in the files above is snake_case.
- `get_user_detail`'s `$addFields` reads `user_id: "$user_id"` (no stale `$userId`).
- No `$lookup` `as:` alias, JSON bag key (`user.profile.contactId`, `*.attributes.*`), or
  `member.role` was changed.
- All `get_user_*` requests read `_url_query: user_id` (not `userId`).
- `grep -rn -E '\$?(userId|organizationId|emailVerified|providerId|appRoles|createdAt|expiresAt|inviterId|twoFactorEnabled)\b' modules/user-admin/requests/`
  returns only intentional survivors (none expected in these files).
- Config still compiles in the final build task; no build check is required mid-sweep.

## Files

- `modules/user-admin/requests/get_user_detail.yaml` — modify
- `modules/user-admin/requests/get_user_passkeys.yaml` — modify
- `modules/user-admin/requests/get_user_accounts.yaml` — modify
- `modules/user-admin/requests/get_user_memberships.yaml` — modify
- `modules/user-admin/requests/get_user_sessions.yaml` — modify
- `modules/user-admin/requests/get_all_members.yaml` — modify
- `modules/user-admin/requests/get_all_invitations.yaml` — modify
- `modules/user-admin/requests/get_users_excel_data.yaml` — modify
- `modules/user-admin/requests/stages/members_base.yaml` — modify
- `modules/user-admin/requests/stages/members_filter.yaml` — modify
- `modules/user-admin/requests/stages/invitations_base.yaml` — modify
- `modules/user-admin/requests/stages/roles_from_catalog.yaml` — modify
- `modules/user-admin/requests/stages/close_row.yaml` — modify

## Notes

- **Deep-link readers:** the `?userId=`/`?user_id=` query key is an arbitrary label, not a
  column. It is standardised on **`user_id`** (also fixing a pre-existing mismatch — the
  events module's documented deep-link default is already `/user-admin/view?user_id={id}`).
  Flip `_url_query: userId → user_id` in `get_user_detail`, `get_user_accounts`,
  `get_user_memberships`, `get_user_sessions`, `get_user_passkeys`. The matching **writer**
  (`all_members_table` urlQuery key) is flipped in Task 3 — both must use `user_id`.
- `get_user_detail.yaml:46` carries a comment referencing `userId`; update it.
- `get_accounts.yaml` / `get_user_detail.yaml` file headers name renamed columns — update
  the header comments too.
