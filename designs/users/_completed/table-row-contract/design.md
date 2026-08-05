# Members table row contract

`user-admin` lets a deployment configure three bags of fields — profile fields, global
(cross-app) attributes, and this app's member attributes. Those fields can be collected in
forms and rendered on the user detail page, but **none of them can be shown as a column** on
the Members list or in the Excel export, because the rows those reads return don't carry them.
This design gives every members read one shared, documented row shape carrying all three bags
under the same names the `fields.*` vars already use, so a table column binds to the same path
string as the form block that collects the field.

## Proposed change

1. Promote the three-bag normalisation that `get_user_detail` already performs into the shared
   `members_base` stage, so the list, detail and export reads all carry `profile`,
   `user_attributes` and `member_attributes`.
2. Add a shared `close_row.yaml` stage that drops the raw `$lookup` payloads (`user`, `contact`,
   `passkeys`, `inviter`) and the stored fields that already ship under a canonical alias
   (`attributes`, `createdAt`, `expiresAt`, `profile.picture`) from the wire row, applied as the last
   stage of each read.
3. Drop the Excel export's two `$project` whitelists and close its row with `close_row` after the
   union instead, so every read closes the same way and `download_columns` can bind the same paths
   as `table_columns`.
4. Apply `request_stages.get_all_users` in the export pipeline — the manifest documents it as
   applying there, but the request never injects it, leaving `download_columns` with no escape
   hatch at all.
5. Update the demo worked example so a profile column and an attribute column resolve
   end-to-end, and delete the orphan `apps/demo/modules/user-admin/components/table_columns.yaml`.
6. Document the row contract in `docs/user-admin/` as the stable set of keys a consumer column
   may bind.

## Current state

### The three bags exist everywhere except the list

| Bag               | Configured by              | Stored at                 | Written by               |
| ----------------- | -------------------------- | ------------------------- | ------------------------ |
| profile           | `fields.profile`           | `user-contacts.profile`   | `write-profile` (shared) |
| user_attributes   | `fields.user_attributes`   | `users.attributes`        | `UpdateUserAttributes`   |
| member_attributes | `fields.member_attributes` | `user-members.attributes` | `UpdateMemberAttributes` |

`get_user_detail.yaml:39-50` already normalises all three onto its row, under exactly the names
the vars use:

```yaml
profile: { $ifNull: ["$contact.profile", {}] }
member_attributes: { $ifNull: ["$attributes", {}] }
user_attributes: { $ifNull: ["$user.attributes", {}] }
```

So the contract this design wants is not a new abstraction — it already exists, proven, in one
read. The work is promoting it to the shared stage and closing the gaps around it.

### The list row is an accidental shape

`requests/stages/members_base.yaml` `$lookup`s `users` and `user-contacts`, `$unwind`s both, and
`$addFields`es the display fields. It never projects, and neither does `get_all_members`. Verified
against a live rig (one member row), every row on the wire carries:

```
_id, organizationId, userId, role, createdAt          # the member doc
user.{_id, name, email, emailVerified, createdAt,     # the WHOLE auth user doc
      updatedAt, twoFactorEnabled, role, banned,
      profile.{…}}
contact.{_id, email, lowercase_email, disabled,       # the WHOLE contact doc
         hidden, created.{…}, updated.{…},
         profile.{…, department, job_title}}
name, email, roles_arr, status, created, updated,     # members_base $addFields
signed_up
roles, total_results                                  # added after the $facet
```

Three consequences:

- **A `table_columns` entry silently renders an empty column.** The demo injects
  `{ headerName: Department, field: department }` (`apps/demo/modules/user-admin/vars.yaml:20-23`)
  and gets a header with no data — there is no top-level `department`, and no top-level `profile`
  either. The orphan `components/table_columns.yaml` in the same folder uses a third shape
  (`field: profile.department`), unused and also non-resolving today.
- **Every row ships both whole source documents** — roughly three times the rendered payload,
  including `user.banned`, `user.role`, `user.emailVerified`, `user.twoFactorEnabled`, both
  contact change-stamps with their `version` blocks, and two copies of the profile bag. It grows
  with whatever an app hangs on `user` or `contact`, which is precisely what `user_attributes` and
  `member_attributes` are for.
- **`picture` is absent from the row entirely**, not null: `$addFields` against a missing source
  path omits the key. The Name column's `srcField: picture` therefore binds to nothing. Whether an
  avatar is ever produced is the separate F14 finding and out of scope here; D8 makes the key exist
  regardless, so its emptiness is a data problem rather than a shape problem.

### The export slot pair is inert

`get_users_excel_data.yaml` shares `members_base`, then `$project`s a whitelist on the members
branch (`:45`) and the same whitelist on the invitations branch inside the `$unionWith` (`:89`).
Neither branch keeps anything a consumer could bind to, and the request injects **no
`request_stages` slot at all** — despite `module.lowdefy.yaml:152` documenting `get_all_users` as
"appended after filtering on the `all` list **and the Excel export aggregations**."

So `download_columns` (wired into the `DownloadXlsx` schema at `pages/all.yaml:130`) is strictly
worse off than `table_columns`: a consumer column there is empty _and_ unfixable.

`DownloadXlsx` resolves `value:` through `@lowdefy/helpers` `get()`, so dot paths work in the
export exactly as they do in an AgGrid `field:` — no flattening is needed once the row carries the
bags.

## The row contract

Every members read returns rows with these keys. This is the set a consumer column may bind.

| Key                     | Type                | Source                                                   |
| ----------------------- | ------------------- | -------------------------------------------------------- |
| `_id`                   | string              | member id                                                |
| `userId`                | string              | auth user id                                             |
| `organizationId`        | string              | pinned org                                               |
| `role`                  | string              | raw CSV role ids                                         |
| `name`                  | string              | `contact.profile.name` ?? `user.name`                    |
| `email`                 | string              | `user.email`                                             |
| `picture`               | string \| null      | `contact.profile.picture` (absent in the export)         |
| `roles_arr`             | string[]            | split role ids                                           |
| `roles`                 | `{label, orphan}[]` | resolved against the role catalog (see export note)      |
| `status`                | string              | `Active` / `Suspended`                                   |
| `created` / `updated`   | date                | contact change-stamp timestamps                          |
| `signed_up`             | date                | member `createdAt`                                       |
| `total_results`         | number              | list read only (pagination)                              |
| **`profile`**           | object              | `contact.profile` — the `fields.profile` bag             |
| **`user_attributes`**   | object              | `user.attributes` — the `fields.user_attributes` bag     |
| **`member_attributes`** | object              | `member.attributes` — the `fields.member_attributes` bag |

Export-only notes for the docs page: the export builds `roles` as the stored role ids joined by `", "`
rather than the catalog objects (a spreadsheet cell can't hold the array), it adds an `expires` key —
the invitation expiry, `null` on member rows — and it drops `picture` (D4).

The three bags make the column path identical to the form block id that collects the field:

| `fields.*` block id      | `table_columns` `field:` | `download_columns` `value:` |
| ------------------------ | ------------------------ | --------------------------- |
| `profile.department`     | `profile.department`     | `profile.department`        |
| `user_attributes.notes`  | `user_attributes.notes`  | `user_attributes.notes`     |
| `member_attributes.team` | `member_attributes.team` | `member_attributes.team`    |

One vocabulary across manifest var, form state path, row key, table column and export column.
Nothing to opt into and nothing to remember — which is the point: the previous contract required
a consumer to add a `table_columns` entry _and_ remember to project the field through
`request_stages.get_all_users`, and the module's own demo is the proof that the second half gets
forgotten.

A consumer example:

```yaml
components:
  table_columns:
    - headerName: Department
      field: profile.department
      width: 140
    - headerName: Team
      field: member_attributes.team
      width: 120
  download_columns:
    - column: department
      value: profile.department
      type: String
      width: 20
```

**A bag column renders the stored value.** The row carries what the form wrote, so an enum-backed
field (a `Selector` over `{label, value}` pairs) renders its slug — `alpha`, not `Alpha`. Prettifying
is the column's job, via a `cellRenderer` (the Roles column in
`components/all_invitations_table.yaml:41` is the in-repo pattern) and a `valueFormatter`-equivalent
on the export side. The docs page states this next to the contract table; the demo's Team column
carries the renderer so the worked example shows the complete treatment.

## Key decisions

### D1 — Carry the whole bags, not a projection derived from `fields.*`

The module knows the configured field ids at build time (`fields.profile` is an array of block
defs with ids like `profile.department`), so it could derive a projection listing exactly those
leaves. Rejected: it needs build-time string surgery to strip the `profile.` prefix off each block
id, it couples the table's row shape to the _form_ config, and it makes any field an app writes
through its own `request_stages.write` invisible to columns for no benefit. Carrying the bag is
simpler and doesn't restrict a use case nobody anticipated.

The cost is a few housekeeping keys riding along (`profile.contactId`, `profile.profile_created`,
`profile.name`). They are already visible to the detail page through the same bag, and the
audience for this table is administrators, so this is not a disclosure the module needs to guard.

### D2 — `$unset` the join payloads rather than whitelist the row

The obvious way to close the row is a terminal `$project` whitelist. Rejected in favour of an
`$unset`, because ordering makes the whitelist actively harmful:

- A whitelist placed **before** `request_stages.get_all_users` strips `user` and `contact` out from
  under the consumer stage, destroying the escape hatch for anything the bags don't cover
  (`user.emailVerified` as a column, say).
- A whitelist placed **after** the consumer stage strips whatever the consumer stage just added,
  which is worse.

`$unset` has neither problem: it runs last, the consumer stage still sees the raw joins, and
consumer-added fields survive. `$unset` on an absent field is a no-op, so one shared stage naming
every join key is safe in every read — `passkeys` only exists on the detail read, and `inviter` only
on the export's invitations branch.

Because it is safe everywhere, the export uses it too rather than keeping its own `$project`
whitelists (D4). That is what makes the slot a single contract: `request_stages.get_all_users` sees
the raw joins in every read, and the close runs after it in every read.

**What the exclusion list names.** Two categories, and the rule matters more than the current list
because a future join or alias has to extend it:

1. Every raw `$lookup` payload — `user`, `contact`, `passkeys`, `inviter`.
2. Every stored field that already ships under a canonical alias, so the row never offers two paths
   to one value — `attributes` (aliased `member_attributes`), `createdAt` (`signed_up` on members,
   `created` on invitations), `expiresAt` (`expires_at` on the Invitations tab, `expires` in the
   export), and `profile.picture` (aliased top-level `picture`).

`profile.picture` matters beyond tidiness: it holds a `data:image/svg+xml` gradient-and-initials
avatar of roughly 800 characters (`modules/shared/profile/generate-avatar-svg.js.njk`), so leaving
both paths in place ships the blob twice on every row. Stripping it from the bag is safe for the write
path — `modal_profile` seeds `state.profile` from the detail read and posts the whole subtree back, but
`write-profile` merges with `$mergeObjects` against the stored bag, so a payload without `picture`
leaves the stored value intact.

The list is derived from the collection schemas, not from an observed row: the wire-row listing above
omits `attributes` only because the demo member has no attributes stored.

One built-in binds a stripped path: `pages/view.yaml:18` reads
`get_user_detail.0.profile.picture` for the detail page's title-block avatar, shipped by the sibling
`profile-identity` work after this design's first review. It is rebound to the top-level `picture`
alias that `members_base` already emits on that read — the cheaper half of the trade, since the
alternative is dropping `profile.picture` from the exclusion list and carrying the data-URI blob
twice per row. Nothing else binds a raw form: the resend action reads `member_attributes`, the
Invitations table reads `expires_at`.

`request_stages.filter_match` is unaffected: it runs before the close and can keep matching on
`user.*` / `contact.*`. Consumer _columns_ bound to those paths are not — see Breaking changes.

The trade-off accepted: the row is closed by exclusion, so a future `$lookup` must remember to add
its key to `close_row.yaml` or it leaks. That is a one-line obligation in the same file that
defines the joins, and it is the cheaper of the two failure modes.

### D3 — Normalise the bags in `members_base`, not per-read

`members_base` is already the shared "flatten the display shape" stage. Adding the three bags there
means the list, detail and export agree by construction rather than by three authors remembering
the same thing. `get_user_detail` loses its own copies of the three `$addFields` (`:39-50`) and
keeps only the fields genuinely specific to the detail page (`user_id`, `member_id`, `contact_id`,
`status_slug`, the Security-tile booleans, `role_ids`, `has_orphan`).

### D4 — The export closes like every other read, and applies the consumer stage once

`request_stages.get_all_users` is injected **after** the `$unionWith` and `$sort`
(`get_users_excel_data.yaml:99`), where it applies uniformly to member and invitation rows, followed
by `close_row` as the final stage. This matches how `activities` orders the same slot in its export
(`get_activities_excel_data.yaml:31`).

The two `$project` whitelists (`:45`, `:89`) are deleted rather than extended with the bags. Keeping
them would put a whitelist upstream of the slot — exactly the ordering D2 rejects — so an export-side
consumer stage would see a nine-key row with no `user` and no `contact` while the same slot in
`get_all_members` sees the full joins. One slot cannot document two input shapes, and the export would
keep no escape hatch for anything the three bags don't cover, which is half the problem this design
opens with.

The whitelists were never controlling the spreadsheet's columns — `DownloadXlsx` emits only what its
own schema declares, so extra row keys are ignored. What they bought was payload: export rows now
carry the full flattened shape (~20 keys) instead of nine, on an unpaginated fetch of every member
and pending invitation. Accepted — the bags have to ride along regardless, the joins are still
stripped before the wire, and the remaining delta is a handful of scalars per row.

The one exception is `picture`. A spreadsheet has no use for an ~800-character data-URI SVG, and this
is the read that fetches every row at once, so the export appends a `$unset: picture` after
`close_row`. The Members list keeps it — the Name column's avatar binds it. (`profile.picture` is gone
from every read via the shared close, D2.)

### D5 — Invitation rows have no `profile` and no `user_attributes`

`invitations_base.yaml:47-51` already derives `member_attributes` from the invitation's stored
`attributes` (invite-time attributes applied at accept), so that bag is genuinely populated for
pending invitations. There is no user and no contact yet, so the other two bags simply don't exist on
that branch — a `download_columns` column bound to a profile path renders blank for invited rows,
which is the honest answer rather than an error. Documented, not fixed.

Nothing needs adding to the invitations branch to make that work. `$unionWith` concatenates
documents without requiring matching shapes (the branches already diverge — `expires` is `null` on
members and `$expiresAt` on invitations), and `DownloadXlsx` resolves each column through
`get(row, column.value)`, so a missing key and an empty bag both yield an empty cell.

### D6 — `table_columns` stays members-only

The Invitations table (`components/all_invitations_table.yaml`) has no `table_columns` slot today
and doesn't gain one here. Adding it is a separate question about whether the two tabs should share
a column vocabulary at all, and no concrete need has surfaced. The export is where the two row
types genuinely merge, and D5 covers that.

### D7 — The Invitations list read is closed too, even without a column slot

`get_all_invitations` has the same defect this design opens with: `invitations_base.yaml:15-22`
`$lookup`s and `$unwind`s the inviter's whole auth user document, flattens the two fields the table
needs into `inviter_name` / `inviter_id`, and nothing projects — so the full document ships on every
invitation row. `close_row` already names `inviter` for the export's union branch, so closing this
read is one more application of a stage the design is adding anyway.

Closing the row is a different question from D6: that decision is about whether the two tabs share a
column vocabulary. Nothing here binds a raw `inviter.*` path — the table reads only the flattened
keys, and with no `table_columns` slot on that tab there is no consumer surface that could have — so
this is the one part of the change with no breaking edge at all. `filter_match` still runs before the
close, as in every other read.

Because the stage is now the shared close for four pipelines (members list, detail, export,
invitations list), it is named `close_row.yaml` rather than after any one of them.

### D8 — The conditional keys are declared, not left to the data

A row closed by exclusion declares nothing by itself, so three contract keys exist only when their
source data does. `$addFields` omits a field whose source path is missing, so `picture` is **absent**
rather than null on a member with no avatar, and `created` / `updated` both vanish when the contact
join finds no match (reachable — the join uses `preserveNullAndEmptyArrays`). `members_base` wraps all
three in `$ifNull` fallbacks to `null`.

Nothing renders differently — AgGrid and `DownloadXlsx` both show a blank cell either way. What this
buys is diagnosis, which is the whole of F26: a blank column because the data is missing looks
identical to a blank column because the path is wrong. With the keys always present, an inspector can
tell those apart, and the by-hand row-shape check reads against a stable key set rather than whatever
the rig happens to hold.

`name` already has a fallback chain and needs nothing. The invitations branch's own keys are left
alone — the contract table doesn't cover them.

## Breaking changes

Closing the row is breaking for consumers, not only for `filter_match` (which is safe — it runs before
the close and can keep matching `user.*` / `contact.*`). Four things change:

1. **A column bound to a raw join path goes blank.** Because `members_base` never projects today, a
   consumer can bind `field: user.emailVerified` or `field: contact.updated.by` with no
   `request_stages` entry at all, and it resolves. After `close_row` it renders empty, silently, with
   no build error.
2. **A column bound to a stripped alias duplicate goes blank** — `attributes.*`, `createdAt`,
   `expiresAt`, `profile.picture` (D2).
3. **An existing `get_all_users` stage now also runs in the export** (D4), over member and invitation
   rows. A stage doing `$addFields` off `$contact.*` emits nulls on the invitation half; one doing
   `$project` or `$replaceRoot` can break the export.
4. **Export rows no longer carry `picture`** (D4).

One migration covers 1, 2 and 4: lift the value to a top-level key in a `get_all_users` `$addFields`,
which still runs before the close in every read. Goes in
[`docs/user-admin/how-to/migration.md`](../../../../docs/user-admin/how-to/migration.md), and the
changeset is a minor (the module is pre-1.0 at 0.17.0) carrying the same note. Keep the note short —
that page already tells a v0.x consumer to expect re-authoring their module config rather than tweaking
it, so these paths land on config that is being rewritten anyway.

## Files changed

**Module — reads**

- `modules/user-admin/requests/stages/members_base.yaml` — add the three bag `$addFields`; wrap
  `picture`, `created` and `updated` in `$ifNull` fallbacks to `null` so the keys always exist (D8).
- `modules/user-admin/requests/stages/close_row.yaml` — **new**;
  `$unset: [user, contact, passkeys, inviter, attributes, createdAt, expiresAt, profile.picture]`.
- `modules/user-admin/requests/get_all_members.yaml` — apply `close_row` as the last stage of the
  `$facet` `results` sub-pipeline, after `request_stages.get_all_users`.
- `modules/user-admin/requests/get_user_detail.yaml` — drop the three duplicated `$addFields`; apply
  `close_row` before the `$limit`.
- `modules/user-admin/requests/get_users_excel_data.yaml` — delete both `$project` whitelists (`:45`,
  `:89`); inject `request_stages.get_all_users` after the `$sort` at `:99`, then `close_row` and a
  final `$unset: picture` (D4).
- `modules/user-admin/requests/get_all_invitations.yaml` — apply `close_row` as the last stage of the
  `$facet` `results` sub-pipeline, so the Invitations tab stops shipping the whole `inviter` document
  (D7).
- `modules/user-admin/pages/view.yaml` — rebind the title-block `avatar_src` from
  `get_user_detail.0.profile.picture` to `get_user_detail.0.picture` (D2).

**Module — manifest and docs**

- `modules/user-admin/module.lowdefy.yaml` — `table_columns` / `download_columns` descriptions state
  the bindable row keys; `get_all_users` description becomes accurate now that the export applies it.
  `filter_match`'s description is corrected too — it claims the "members/invitations list filter" but
  is only injected in the members read, and D6 leaves the Invitations tab without the slot.
- `docs/user-admin/reference/row-contract.md` — **new**; the row contract (the table above), linked
  from `docs/user-admin/index.md`; regenerate `reference/vars.md` via `pnpm docs:gen`.
- `docs/user-admin/how-to/migration.md` — the Breaking changes migration note.
- `docs/shared/slots.md` — `get_all_*` is documented as "stages appended to the list-page read
  pipeline" (`:45`); widen it now that `get_all_users` also applies to the Excel export, and point
  the worked example at the new row-contract reference page.
- Changeset for `user-admin`.

**Demo**

- `apps/demo/modules/user-admin/vars.yaml` — `table_columns` binds `profile.department`; add a
  `member_attributes.team` column (the demo already configures that field) so both bag kinds have a
  worked example; add matching `download_columns`. `member_attributes.team` is a `Selector` over
  `{label, value}` pairs, so the Team column carries a slug→label `cellRenderer` following
  `components/all_invitations_table.yaml:41` — otherwise the module's canonical example would
  demonstrate a raw `alpha` in a UI column.
- `apps/demo/modules/user-admin/components/table_columns.yaml` — delete (orphan, third field shape).

**Verification**

`pnpm ldf:b` proves the config compiles but cannot prove a column resolves. The demo rig's single
contact currently has `profile.department: null` and no `attributes` on either the user or member
row, so the example columns render blank until values exist. Seeding a department and a team on the
demo user is required for the worked example to be genuinely end-to-end, and is a data change for the
developer to make — not part of the build gate.

## Non-goals

- **`picture` / avatar generation.** The row keeps `picture` as a declared key; nothing in this design
  makes one exist. Tracked separately as F14.
- **Auditing the same slot pair in other modules.** `contacts`, `activities`, `companies` and `deals`
  all expose `table_columns` + `request_stages.*`. Their list rows are single-collection, so their
  column paths most likely already resolve, and no finding says otherwise. Worth a follow-up check;
  not folded in here on a guess.
- **Reworking the `request_stages` slot family.** This design makes the common case work without the
  slot and makes the export's slot exist as documented. It does not revisit the slot design itself.

## Related

- F26 in [`../04-planning/findings.md`](../04-planning/findings.md) — the originating finding.
- [`designs/user-account-better-auth/design.md`](../../../users/_completed/user-account-better-auth/design.md) — parent
  rebuild; Decisions 1/2/3 define the members reads this design reshapes.
- [`docs/user-admin/concepts/co-location.md`](../../../../docs/user-admin/concepts/co-location.md) — the
  same-database precondition the `$lookup`s depend on.
