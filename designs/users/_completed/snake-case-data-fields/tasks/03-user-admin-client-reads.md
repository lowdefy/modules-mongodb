# Task 3: Flip `user-admin` client reads to the snake row contract

## Context

Task 1 moved the `user-admin` request/stage pipelines to snake_case, changing the **row
contract** — the keys the request results now expose. This task updates the client code
(components and pages) that reads those keys so it follows the renamed contract, and flips the
deep-link query-key **writer** to `user_id` to match the readers Task 1 already flipped.

Only flip client reads of keys that are **projected physical columns** (per the row contract
below). Do not touch action params passed to APIs, JSON bag reads, or the `?userId=` label
except where called out.

Use the `lowdefy-docs` MCP for block/operator contracts (`AgGridBalham` `idField`, `_event`,
`_url_query`, `_nunjucks`) if unsure — do not guess prop names.

## Interfaces

- **Consumes (the `user-admin` snake row contract from Task 1):**
  - `get_all_members` → rows keyed `user_id`, `app_roles`.
  - `get_user_detail` → `email_verified`, `two_factor_enabled`, `user_id`.
  - `get_user_accounts` → `provider_id`.
  - `get_all_invitations` → `app_roles`, `expires_at`.
  - `get_user_*` requests read `_url_query: user_id`.

## Task

- `components/all_members_table.yaml` — `AgGridBalham` `idField: userId → user_id`; the
  `_event: row.userId → row.user_id`; the `userId` param; and the deep-link **writer** —
  urlQuery key `userId: → user_id:` with its value `_event: row.userId → row.user_id`. This is
  the writer half of the `user_id` deep-link standardisation (readers done in Task 1).
- `pages/invite.yaml` — `resolved_member.userId → resolved_member.user_id`,
  `resolved_invitation.appRoles → resolved_invitation.app_roles`.
- `pages/view.yaml` — the `userId` comment/ref at `view.yaml:46`; `_url_query: userId` if
  present.
- `components/view/tile_security.yaml` — nunjucks reads of projected `emailVerified →
email_verified` (and any projected `providerId → provider_id`).
- `components/view/tile_activity.yaml` — nunjucks reads of projected `providerId →
provider_id`; `_url_query: userId → user_id` navigation.
- `components/all_members_filters.yaml` — comment references to `appRoles` at lines 7 and 52
  (per CLAUDE.md, comments describe current code).
- `components/view/tile_attributes.yaml` — comment reference to `appRoles` at line 50.
- `components/all_invitations_table.yaml` — comment reference to `expiresAt` at line 2.

Do **not** change `member.attributes.*` / `user.attributes.*` bag reads, `member.role`, or
better-auth action params in these files.

## Acceptance Criteria

- Every client read of a projected physical column in the files above uses the snake key from
  the row contract.
- `all_members_table` writes the deep-link with key `user_id` (value `row.user_id`), matching
  the `_url_query: user_id` readers from Task 1 — the deep link resolves end-to-end.
- The comment references (`all_members_filters.yaml:7,52`, `tile_attributes.yaml:50`,
  `all_invitations_table.yaml:2`, `view.yaml:46`) name the current snake columns.
- No action param or JSON bag read was flipped.

## Files

- `modules/user-admin/components/all_members_table.yaml` — modify
- `modules/user-admin/pages/invite.yaml` — modify
- `modules/user-admin/pages/view.yaml` — modify
- `modules/user-admin/components/view/tile_security.yaml` — modify
- `modules/user-admin/components/view/tile_activity.yaml` — modify
- `modules/user-admin/components/all_members_filters.yaml` — modify (comments)
- `modules/user-admin/components/view/tile_attributes.yaml` — modify (comment)
- `modules/user-admin/components/all_invitations_table.yaml` — modify (comment)

## Notes

- Input/AgGrid block IDs that double as state paths must stay consistent with the row keys —
  when you flip an `idField` or a `_event: row.*` read, audit sibling refs to the same path on
  the page (per the "audit state refs when changing input blocks" rule).
- The `user_id` deep-link value is only correct once both this task's writer and Task 1's
  readers use `user_id`; that's why this task depends on Task 1.
