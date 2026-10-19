# snake_case Data Fields — module alignment

The platform's [snake-case-data-fields](../../../../lowdefy-design/designs/auth-upgrade/features/snake-case-data-fields/design.md)
design standardises the auth **data plane** on snake_case: better-auth's vendored
adapter now stores every auth-collection column in snake_case (`userId → user_id`,
`organizationId → organization_id`, `emailVerified → email_verified`, …), and the
resolved caller `_user` mirrors those records. This repo's `user-admin`,
`user-account` and `shared` modules are the **native readers** of those
collections — the seam the upstream design describes. This design aligns them: it
moves every native read (and the one app-facing `_user` auth field these modules
read) to snake_case, and regenerates the docs and demo that ride along.

Nothing here has shipped — this lands only on a new experimental platform version,
in lockstep with the upstream adapter change. There is no consumer to migrate and
no breaking-change surface: the demo is the only consumer, and it moves in the
same change.

## Proposed change

- Flip every **native MongoDB pipeline reference** to a renamed auth column —
  `$match`, `$lookup` `localField`/`foreignField`, and `$project`/`$addFields`
  source refs — from camelCase to snake_case, across `user-admin/requests/**`,
  `user-account/requests/**`, the shared `stages/`, and the native read-halves
  inside `user-admin/api/**`.
- Flip pass-through **projection output keys** that equal a physical column
  (e.g. `get_accounts` `providerId: 1 → provider_id: 1`) and the client reads
  that consume them (table `idField`, `_event: row.*`, nunjucks, page state).
- Flip the one app-facing caller field these modules read:
  `_user: twoFactorEnrolled → _user: two_factor_enrolled`.
- Leave the **API/config plane** untouched: better-auth action params, action
  responses, and JSON bag contents stay camelCase (see "What does not flip").
- Regenerate the docs (`indexes.md`, `row-contract.md`, `vars.md`, `migration.md`)
  and update the `apps/demo` consumers; build-verify with `ldf:b` + `docs:check`.

## Scope boundary — this repo vs the platform

The upstream design owns the mechanism (the adapter's `fieldName` derive that
snakes the columns, and `normalizeCaller` that snakes `_user`) and everything that
runs in the auth engine (`resolveAuthentication`, `callPluginEndpoint`), plus the
app-config migration codemod and index **provisioning**. This repo owns only the
**consumer surface**: the module config that natively reads those collections, the
one `_user` read, and the module docs/demo. This design's correctness therefore
**depends on** the upstream change being present — the two ship together on the
experimental version.

## The governing distinction — which plane a name lives on

The upstream design draws one line: **data is snake_case, the API/config surface
is camelCase.** Every rename decision here answers to it. The trap is that both
planes appear side by side — often in the same file (`invite.yaml` has a native
`$match` _and_ an `InviteMember` action call) — so this is a plane-aware edit, not
a global find-replace.

### What flips (data plane → snake_case)

| Site                                    | Example                                                                                                                                          | Reason                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Native `$match` on a physical column    | `$match: { userId } → { user_id }`                                                                                                               | reads storage directly                                                    |
| `$lookup` `localField`/`foreignField`   | `localField: userId → user_id`                                                                                                                   | joins on physical columns                                                 |
| `$project`/`$addFields` **source** refs | `"$user.emailVerified" → "$user.email_verified"`, `"$expiresAt" → "$expires_at"`                                                                 | reads storage                                                             |
| Pass-through **projection output** keys | `providerId: 1 → provider_id: 1` (`get_accounts`)                                                                                                | `field: 1` projects the physical column; the old key now projects nothing |
| `close_row.yaml` `$unset` list          | `appRoles → app_roles`, `createdAt → created_at` (the expiry leaves the list — see below)                                                        | strips physical columns                                                   |
| Client reads of flipped outputs         | `all_members_table` `idField: userId → user_id`, `_event: row.userId → row.user_id`; `tile_linked_accounts` `item.providerId → item.provider_id` | follow the row-contract keys                                              |
| The one app-facing caller field         | `_user: twoFactorEnrolled → two_factor_enrolled`                                                                                                 | `normalizeCaller` snakes `_user` upstream                                 |

### What does not flip (API/config plane, and non-schema names)

| Site                          | Example                                                                                                                                              | Reason                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| better-auth **action params** | `UpdateMemberRoles` `{ memberId, organizationId, appRoles }`; `UpdateUserProfile` `{ userId, organizationId }`; `InviteMember`; sign-in `providerId` | logical names the adapter maps; camelCase is the action's I/O contract                                                                                               |
| better-auth **hook payloads** | `_payload: user.emailVerified` in `link-contact-on-signup.yaml` (`user.create.before` / `email.verified` hooks)                                      | the hook's `user` is better-auth's own JS record, before `transformInput` maps to physical columns — camelCase, and it pattern-matches a data read but must not flip |
| **Action responses**          | `.response.totpURI`, `.response.backupCodes`                                                                                                         | transient API surface, never stored                                                                                                                                  |
| **JSON bag inner keys**       | `user.profile.contactId` (the `members_base` `localField`!), `user.attributes.*`, `member.attributes.*`, `contact.profile.*`                         | bag contents are app/module data, not schema fields — upstream leaves them whole; `profile.contactId` is the contactId design's, out of scope                        |
| `$lookup` `as:` aliases       | `as: user` / `contact` / `passkeys` / `inviter`                                                                                                      | author-chosen result names, not columns                                                                                                                              |
| Repo change-stamp fields      | `contact.created.timestamp`, `updated.timestamp`                                                                                                     | app-owned stamps, not better-auth `createdAt`                                                                                                                        |

The subtle members: `member.role` (the org-authority tier) and single-word columns
(`token`, `email`, `role`, `status`, `slug`, `banned`) are unchanged — snakeCase is
a no-op on them. `user.profile.contactId` reads like a physical ref but is a bag
key: **it must not flip.**

## Files changed

The sweep also updates **comment references** to any renamed physical column, not
just data bindings — a comment naming `appRoles`/`expiresAt`/`userId` beside a
`$match` on the snake column names a field that no longer exists (per CLAUDE.md,
comments describe the current code). Known sites: `all_members_filters.yaml:7,52`
(`appRoles`), `all_invitations_table.yaml:2` (`expiresAt`), `tile_attributes.yaml:50`
(`appRoles`), `view.yaml:46` (`userId`), and the `get_accounts.yaml` /
`get_user_detail.yaml` file headers — including files otherwise listed as no-change.

### Native reads — `user-admin/requests/`

`get_user_detail.yaml` (`$match userId`, passkeys `$lookup` on `userId`,
`$user.emailVerified`/`$user.twoFactorEnabled` sources, `$userId`),
`get_user_passkeys.yaml`, `get_user_accounts.yaml` (`userId`, `providerId`),
`get_user_memberships.yaml` (`userId`, `organizationId`),
`get_user_sessions.yaml`, `get_all_members.yaml` (`appRoles`, `organizationId`),
`get_all_invitations.yaml`, `get_users_excel_data.yaml` (`appRoles`, `expiresAt`),
and the shared stages: `members_base.yaml` (`organizationId`, `userId` lookup,
`$createdAt` for `signed_up` — **not** `user.profile.contactId`),
`members_filter.yaml`, `invitations_base.yaml` (`organizationId`, `inviterId`,
`expiresAt`), `roles_from_catalog.yaml` (`appRoles`), `close_row.yaml` (unset list —
`expiresAt` **drops out of it** rather than being renamed: once the physical column
is `expires_at` it is the same key as the alias the Invitations tab binds
(`all_invitations_table.yaml` `field: expires_at`), so unsetting it blanks the
Expires column).

The `$addFields: user_id: "$userId"` in `get_user_detail` becomes
`"$user_id"` — the aliasing collapses to a rename of the source only.

### Native reads — `user-account/requests/`

`get_accounts.yaml` (`$match userId`, `$project` output `providerId`/`accountId`,
`$match providerId: credential`, `$credential.updatedAt`),
`get_account.yaml` (`$emailVerified`, `$twoFactorEnabled`),
`get_sessions.yaml` (`userId`), `get_passkeys.yaml` (`userId`),
`get_invitation.yaml` (`organizationId`, `inviterId`, `expiresAt`).

### Shared reads

`shared/sessions/session_fields.yaml` (`$userAgent`, `$ipAddress`, `$expiresAt`).
`shared/contact/*` do **not** change — they call `UpdateUserProfile` with
camelCase action params.

### API endpoints — `user-admin/api/`

Audit each: flip **native pipeline halves**, keep **action params**. Native halves
exist in `invite.yaml` (find pending rows: `$match organizationId`/`expiresAt`),
`check-invite-email.yaml` (native aggregation: `organizationId`, `userId`,
`appRoles`, `expiresAt`, `inviterId`), and `resend-invitation.yaml` (`find_invitation`
`$match organizationId`, and reading `find_invitation.appRoles`). The remaining
endpoints (`update-access`, `suspend`, `reinstate`, `revoke-sessions`,
`revoke-passkeys`, `reset-two-factor`, `delete-user`, `remove-member`,
`update-org-role`, `cancel-invitation`, `update-user-attributes`) pass camelCase
params to better-auth actions — **no change** unless an audit finds a native
`$match`/`$set` on a physical column.

In `user-account/api/`, `link-contact-on-signup.yaml` is **audited — no change**:
its `_payload: user.emailVerified` is a hook payload (better-auth's JS record, not a
stored column — see the "does not flip" table), and the shared fragments it calls
(`create-or-link-contact.yaml`, `write-profile.yaml`) only pass `UpdateUserProfile`
action params (`userId`/`organizationId`) and the `profile.contactId` bag key.

### Components / pages — client reads

`user-admin/components/all_members_table.yaml` (`idField`, `_event: row.userId`,
the `userId` param), `pages/invite.yaml` (`resolved_member.userId`,
`resolved_invitation.appRoles`), `components/view/tile_security.yaml` and
`tile_activity.yaml` (nunjucks reads of projected `emailVerified`/`providerId`,
`_url_query: userId` navigation), `user-account/components/view/tile_linked_accounts.yaml`
(`item.providerId`/`item.accountId`), and `user-account/pages/two-factor-enrol.yaml`
(~18× `_user: twoFactorEnrolled`).

The deep-link query key (`?userId=` vs `?user_id=`) is an arbitrary label, **not a
column** — the snake_case rename does not touch it on its own; it only needs the
writer and every reader to agree. It is standardised on **`user_id`**, which also
fixes a pre-existing mismatch: the events module's documented deep-link default is
already `/user-admin/view?user_id={id}` (`module.lowdefy.yaml:69`) while the view
requests read `_url_query: userId`, so an app wiring `contact_page_url` from that
example deep-links to a page that reads a missing key today. Flip in one pass:

- **Writer** — `all_members_table.yaml` urlQuery key `userId: → user_id:` (the value
  `_event: row.userId → row.user_id` flips too, as a row-contract rename).
- **Readers** — `_url_query: userId → user_id` in `get_user_detail.yaml`,
  `get_user_accounts.yaml`, `get_user_memberships.yaml`, `get_user_sessions.yaml`,
  `get_user_passkeys.yaml`, and `tile_activity.yaml`.
- The events example (`?user_id={id}`) is already snake — no change, now consistent.

## Docs (generated — `pnpm docs:gen` / gated by `docs:check`)

- `docs/user-admin/reference/indexes.md` and `docs/user-account/reference/indexes.md`
  — flip index field names to snake*case (`{ organization_id: 1, app_roles: 1 }`, and
  `user-account`'s `{ userId: 1 }` on `user-two-factors → user_id`) in **both** files.
  Only `user-admin` carries the "the rename has not landed" caveat paragraph the repo
  pre-staged for this moment — **drop it there**; `user-account` has no such paragraph.
  Index \_provisioning* stays a host-app concern; only the documented requirement changes.
- `docs/user-admin/reference/row-contract.md` — the `userId`/`organizationId` row
  keys become `user_id`/`organization_id`, and the "stored fields shipped under an
  alias" list updates to the snake source names (`app_roles`, `created_at`); the
  expiry leaves the list, because `close_row.yaml` no longer unsets it.
- `docs/{user-admin,user-account}/reference/vars.md` — regenerated from the
  manifests; the `user-admin` `org_slug` var description references the physical
  `organizationId` match and is reworded to `organization_id`.
- `docs/{user-admin,user-account}/how-to/migration.md` — these describe migrating
  between module versions; add the field-name change where they enumerate the
  physical column names, without breaking-change framing (nothing shipped).

## Demo

Update the `apps/demo` `user-admin` / `user-account` consumers that bind the
renamed contract keys or `_user` field (table columns, page config), then confirm
`pnpm ldf:b` compiles and inspect the generated
`.lowdefy/server/build/pages/**` for the affected pages. The demo DB is dev and
resettable, so no data step is implied by this design.

## Non-goals

- **The adapter `fieldName` derive, `normalizeCaller`, and the engine** — upstream,
  in `lowdefy-design`.
- **Index provisioning** and the **app-config migration codemod** — host-app /
  upstream; this repo only documents the index requirement.
- **`profile.contactId` and other JSON bag contents** — untouched; the contactId
  design ships after this.
- **The API/config plane** — action params, action responses, and `auth:` config
  keys stay camelCase by upstream Decision 3.
  </content>
  </invoke>
