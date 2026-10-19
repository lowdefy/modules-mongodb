# Task 5: Flip `user-account` client reads and the `_user` caller field

## Context

Task 4 moved the `user-account` request pipelines to snake_case, changing the row contract.
This task updates the client code that reads those keys, plus the one **app-facing caller
field** these modules read: `_user: twoFactorEnrolled → _user: two_factor_enrolled`. Upstream,
`normalizeCaller` snakes `_user`, so the resolved caller record now exposes
`two_factor_enrolled`.

Flip only client reads of projected physical columns (per the contract below) and the `_user`
field. Do not touch action params, action responses (`.response.totpURI`,
`.response.backupCodes`), or JSON bag reads.

Use the `lowdefy-docs` MCP for block/operator contracts if unsure.

## Interfaces

- **Consumes (the `user-account` snake row contract from Task 4):**
  - `get_accounts` → `provider_id`, `account_id`.
  - `get_account` → `email_verified`, `two_factor_enabled`.
- **Consumes (upstream):** `_user.two_factor_enrolled` (was `_user.twoFactorEnrolled`).

## Task

- `components/view/tile_linked_accounts.yaml` — `item.providerId → item.provider_id`,
  `item.accountId → item.account_id` (reads of `get_accounts` output).
- `components/view/tile_security.yaml` — nunjucks/operator reads of projected `emailVerified →
email_verified`, `twoFactorEnabled → two_factor_enabled` (from `get_account`).
- `pages/two-factor-enrol.yaml` — flip **all** `_user: twoFactorEnrolled → _user:
two_factor_enrolled` (~21 occurrences; grep to confirm the count before and after).
- Audit `components/view/modal_enroltotp.yaml` — flip any read of a projected account column
  or `_user: twoFactorEnrolled`; leave action-response reads (`totpURI`, `backupCodes`)
  camelCase.

Do **not** change the sign-in `providerId` action param, `_url_query` labels, or JSON bag
reads in these files.

## Acceptance Criteria

- `tile_linked_accounts` reads `item.provider_id` / `item.account_id`.
- `tile_security` reads `email_verified` / `two_factor_enabled`.
- `grep -c 'twoFactorEnrolled' modules/user-account/pages/two-factor-enrol.yaml` returns `0`;
  the corresponding `two_factor_enrolled` count matches the prior `twoFactorEnrolled` count.
- No action response (`.response.totpURI`/`.response.backupCodes`) or action param was
  flipped.

## Files

- `modules/user-account/components/view/tile_linked_accounts.yaml` — modify
- `modules/user-account/components/view/tile_security.yaml` — modify
- `modules/user-account/pages/two-factor-enrol.yaml` — modify (~21× `_user`)
- `modules/user-account/components/view/modal_enroltotp.yaml` — audit / modify

## Notes

- `_user: two_factor_enrolled` is a **caller** field (the resolved-caller record), distinct
  from the projected `two_factor_enabled` column that `get_account` exposes — both are snake
  now, but they are different sources; don't conflate them.
