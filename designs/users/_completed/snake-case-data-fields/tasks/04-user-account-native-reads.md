# Task 4: Flip `user-account` native reads to snake_case

## Context

`user-account` is a native reader of the auth collections. This task moves every native
pipeline reference and pass-through projection output key in `user-account/requests/**` to
snake_case, matching the upstream adapter rename. It also **audits `user-account/api/**` and
confirms no change\*\* (those files are API/config plane only).

Plane-aware edit — flip only refs that read physical storage. Leave `$lookup` `as:` aliases,
JSON bag keys, single-word columns, and better-auth action params camelCase.

Use the `lowdefy-docs` MCP for any request/operator contract you're unsure of.

## Interfaces

- **Produces (the `user-account` snake row contract that Task 5 consumes):**
  - `get_accounts` → projection output `provider_id`, `account_id`; matches on `user_id` and
    on `provider_id: credential`.
  - `get_account` → projects `email_verified`, `two_factor_enabled`.

## Task

**`requests/` — flip:**

- `get_accounts.yaml` — `$match userId → user_id`; `$project` output `providerId → provider_id`,
  `accountId → account_id`; `$match providerId: credential → provider_id: credential`;
  `$credential.updatedAt → $credential.updated_at`.
- `get_account.yaml` — `$emailVerified → $email_verified`, `$twoFactorEnabled →
$two_factor_enabled`.
- `get_sessions.yaml` — `userId → user_id`.
- `get_passkeys.yaml` — `userId → user_id`.
- `get_invitation.yaml` — `organizationId → organization_id`, `inviterId → inviter_id`,
  `expiresAt → expires_at`.

**`api/` — audit, confirm no change:**

- `link-contact-on-signup.yaml` — its `_payload: user.emailVerified` is a **hook payload**
  (better-auth's JS record, before `transformInput` maps to physical columns) — camelCase,
  pattern-matches a data read but must **not** flip. The shared fragments it calls
  (`create-or-link-contact.yaml`, `write-profile.yaml`) pass `UpdateUserProfile` action params
  (`userId`/`organizationId`) and the `profile.contactId` bag key — no change.
- `update-profile.yaml` — passes `UpdateUserProfile` action params only — no change.

Also confirm the sign-in `providerId` in `pages/login.yaml` and `pages/signup.yaml` is an
action param (sign-in call) — **no change**.

Update comment references to renamed columns in the flipped request files.

## Acceptance Criteria

- Every native pipeline ref and pass-through projection output key on a renamed column in the
  five request files is snake_case.
- `get_accounts` projects `provider_id`/`account_id` and matches `provider_id: credential`.
- `link-contact-on-signup.yaml` and `update-profile.yaml` are unchanged; the audit finding
  (hook payload / action params, not stored columns) is respected.
- `login.yaml`/`signup.yaml` sign-in `providerId` is unchanged.

## Files

- `modules/user-account/requests/get_accounts.yaml` — modify
- `modules/user-account/requests/get_account.yaml` — modify
- `modules/user-account/requests/get_sessions.yaml` — modify
- `modules/user-account/requests/get_passkeys.yaml` — modify
- `modules/user-account/requests/get_invitation.yaml` — modify
- `modules/user-account/api/link-contact-on-signup.yaml` — audit, no change
- `modules/user-account/api/update-profile.yaml` — audit, no change

## Notes

- The `provider_id: credential` `$match` is the subtle one — it reads a physical column (flip
  the **key**), and `credential` is a value, not a name (leave it).
