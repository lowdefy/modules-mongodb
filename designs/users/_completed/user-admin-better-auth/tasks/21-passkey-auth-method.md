# Task 21: Passkey visibility in the auth-methods tile (fix)

## Context

Post-implementation design review found the Security tile's **Auth methods** block
omits passkeys. Decision 5 lists passkeys explicitly and the mockup
(`mockups/screens/view.html`) draws a "Passkey" tag, but the implemented tile shows
only email-verified + OAuth providers + MFA. The omission was solely because the
module's declared connection set had no `user-passkeys` read connection — a gap in
the module surface, not a deliberate scope cut. Passkeys are a **live capability**
(`@better-auth/passkey@1.6.23`; the sibling `user-account` module wraps
`PasskeyRegister` / `PasskeyDelete`), and this read-only badge directly serves the
tile's "why can't she log in?" purpose.

Passkeys live in their **own** collection (the passkey plugin's `passkey` model →
adapter-fixed `user-passkeys`), not on `user-accounts` — so a dedicated read
connection plus a count is required. MFA (`user.twoFactorEnabled`) and
email-verified (`user.emailVerified`) already come from the `user` row the detail
aggregation joins, so no extra reads are needed for those.

Design section: Decision 5 (Security tile) + module surface table. Use the
`lowdefy-docs` MCP for connection/request schemas.

## Task

**1. Declare the `user-passkeys` read connection.** Add
`modules/user-admin/connections/user-passkeys.yaml` mirroring the other read-only
auth connections (`type: MongoDBCollection`, `databaseUri: {_secret: MONGODB_URI}`,
`collection: user-passkeys`, `write: false`). Register it in the manifest
(`module.lowdefy.yaml`) connections list. Same-database co-location precondition
applies (Decision 1) — note it alongside the other read connections.

**2. Read passkey presence.** Extend `requests/get_user_detail.yaml` with a
`$lookup` from `user-passkeys` (`localField: userId`, `foreignField: userId`,
`as: passkeys`). The root is `user-members`, so the member's `userId` is present
throughout — the join key is correct. Insert the `$lookup` **before** the terminal
flat `$addFields` (the last stage before `$limit: 1`), and fold the count **into
that same `$addFields`** so it lands in the flat detail shape before the limit:
`passkey_count: {$size: {$ifNull: ["$passkeys", []]}}` (or a boolean
`has_passkey`). Do **not** append the stages after `$limit: 1` or add a second
competing `$addFields`.

**3. Render the badge.** In `components/view/tile_security.yaml`, add a "Passkey"
badge to the `auth_methods` Nunjucks template, shown when the count is > 0, styled
like the other neutral method tags. Add `passkey_count` (or `has_passkey`) to the
template's `on:` bindings from `get_user_detail.0.*`.

## Acceptance Criteria

- `user-passkeys` read connection exists and is declared in the manifest.
- `get_user_detail` returns a passkey count/flag for the target user via a
  `$lookup` over `user-passkeys`.
- The auth-methods block shows a "Passkey" badge when the user has ≥ 1 passkey and
  omits it otherwise, consistent with the mockup.
- `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/connections/user-passkeys.yaml` — create
- `modules/user-admin/module.lowdefy.yaml` — declare the connection
- `modules/user-admin/requests/get_user_detail.yaml` — `$lookup` + count
- `modules/user-admin/components/view/tile_security.yaml` — passkey badge

## Notes

- Read-only only. The module never enrols or deletes passkeys — that is
  `user-account` self-service (`PasskeyRegister` / `PasskeyDelete`).
- Confirm the adapter's collection name is `user-passkeys` against the running
  engine before finalising (naming is adapter-fixed, mongodb Decision 2; it follows
  the `user-` + pluralised-model convention like `user-sessions` / `user-accounts`).
