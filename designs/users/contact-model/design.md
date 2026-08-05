# Contact model — naming, lifecycle flags, and the user↔contact link

A fresh-eyes pass over the person model the auth upgrade left behind. The `contact` / `user` /
`member` split itself is sound and matches industry norm (a CRM person who may or may not have a
login; roles on the membership, not the user). The problems are all at the edges — the record's
name, dead lifecycle flags, a soft-delete filter that never got wired, and a foreign key living
inside a display bag. This design cleans those up and promotes the contact link to a first-class
field.

## Proposed change

1. **Rename the physical collection `user-contacts` → `contacts`.** It is the one app-owned
   collection in the cluster; the `user-` prefix falsely signals BetterAuth ownership. The name is a
   convention, not adapter-fixed, so this is the app's to change.
2. **Retire the dead `hidden` and `disabled` flags** on the contact — nothing ever sets them true —
   and **wire the live `deleted` soft-delete filter** into the contact list and selectors, which
   currently guard the two dead flags and miss the real one (soft-deleted contacts leak into lists).
3. **Promote the contact link to a first-class `user.contactId` field**, out of the `user.profile`
   bag, so `_user.contactId` is a clean typed key rather than `_user.profile.contactId` riding inside
   the display bag. This is an **upstream ask** on `lowdefy-design` (platform additionalField +
   `resolveAuthentication` projection + `UpdateUserProfile` write param).
4. **Keep `profile_created` in `profile`** (it is genuinely profile-completeness data, not a
   relationship), but **stop writing it onto `contact.profile`** — it is user-scoped lifecycle and
   belongs only on the user's copy.
5. **Sweep the stale `_user: global_attributes.*` reads** in `search_contacts` to `_user.attributes`
   (the auth upgrade renamed the caller's authorization bag; this data-scoping filter silently
   no-ops today).

## Guiding principle: separate by _kind of thing_

The one idea the whole design turns on. Data attached to the auth `user` splits into two kinds, and
the smells all come from mixing them:

- **A structural relationship** (the contact foreign key) → a **first-class typed field**
  (`user.contactId`), the way `emailVerified` is a scalar and not a key in some bag.
- **Module data about the user** (denormalized display fields, the `profile_created` completeness
  flag) → the **opaque `profile` bag**, which is exactly what that bag is for.

This is why `contactId` comes out and `profile_created` stays — not tidiness, but a real difference
in what each thing is. It also settles the "should we add a `meta` bag?" question: no. A foreign key
does not want a bag, it wants a column; adding a fourth JSON grab-bag
(`user.profile`, `user.attributes`, `member.attributes`, + `meta`) would be excess surface for a
single scalar.

## Current model

One person is three records (auth-upgrade [user-model](../../../../lowdefy-design/designs/auth-upgrade/concepts/user-model/design.md) Decision 4):

| Record                                           | Owner             | Holds                                                                                      | Link                                    |
| ------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- |
| `user-contacts` (physical) / `contact` (logical) | **App / Lowdefy** | The person: `email`, `profile` bag (display fields), CRM data, `deleted` soft-delete stamp | parent                                  |
| `users`                                          | BetterAuth        | Login identity + `attributes`; denormalized `name` / `image` / `profile` copies            | `users.profile.contactId → contact._id` |
| `user-members`                                   | org plugin        | Per-(user, org) `appRoles` + `attributes`                                                  | `member.userId → user._id`              |

`resolveAuthentication` builds `_user` from the `users` row alone (it never joins the contact — the
platform is deliberately contact-agnostic, since not every app has contacts). It projects a fixed
set: `id, name, email, image, emailVerified, roles, attributes, profile`. The `profile` bag is the
one opaque, module-writable slot that rides onto `_user`; anything a module wants visible on `_user`
must live inside it (which is why `contactId` and `profile_created` ended up there).

### What's actually wrong

- **`hidden` is dead.** Nothing anywhere sets `hidden: true`. It is initialized to `false` on create
  (`contacts/api/create-contact.yaml`, `shared/contact/create-or-link-contact.yaml`) and filtered
  (`hidden: { $ne: true }`) in six contact requests, but no code path activates it. `disabled` is in
  the identical state — pre-BetterAuth legacy (it used to mean "per-app disable"; the new model
  expresses that as "no `member` row", and user-suspend is BetterAuth `ban`).
- **The live soft-delete filter is missing.** The real convention is the change-stamp `deleted`
  field ([soft-delete-convention](../../_completed/soft-delete-convention/design.md)), written by
  `user-admin/api/delete-user.yaml`. But `get_all_contacts`, `search_contacts`, and
  `get_contacts_for_selector` filter `hidden`/`disabled` and **not** `deleted.timestamp` — so a
  soft-deleted contact can still surface in the list and selectors. That is a latent bug, not just
  cruft.
- **`user-contacts` is the only app-owned collection in a cluster of BetterAuth `user-*` names**
  (`users`, `user-sessions`, `user-accounts`, `user-members`, …). The `user-` prefix reads as "the
  auth system manages this," which is false — it is app data on an app connection, and the module is
  already literally named `contacts` with its connection already called `contacts-collection`.
- **`contactId` is a foreign key inside a display bag.** `_user.profile.contactId` sits alongside
  `name` / `picture`, so a consumer treating `profile` as a display object trips over it — the
  [table-row-contract](../_completed/table-row-contract/design.md) design already had to `$unset` it
  from read projections. A recurring strip is the tell it is in the wrong place.
- **A stale authorization-scope read.** `search_contacts` filters contacts by
  `_user: global_attributes.company_ids` — the pre-upgrade name for the caller's authorization bag,
  now `_user.attributes`. The path no longer exists on `_user`, so the data-scoping filter silently
  no-ops. (Unrelated to the contacts module's own `contact.global_attributes.*` field bag, which is
  live — a confusing but real name collision.)

## Decisions

### 1. Rename `user-contacts` → `contacts`

The name is **a convention, not adapter-fixed**: the auth collections (`users`, `user-sessions`, …)
are fixed by the BetterAuth adapter, but the contact collection is app-owned and set through each
connection's `collection:` property
([mongodb](../../../../lowdefy-design/designs/auth-upgrade/_completed/mongodb/design.md) Decision 2
is explicit: "this name is the app's choice, not adapter-fixed"). The original rationale was
cosmetic — it sorts next to the auth block in a database listing, "honestly part of the same
people-model." The counter, which wins: it is the **only app-owned** collection there, so the
prefix mis-signals ownership, and the module/connection are already named `contacts`.

**Trade-off accepted:** this is a suite-wide change. The physical collection is shared across every
app in a multi-app suite, so the rename is a coordinated DB migration plus connection/`$lookup`/doc
updates across apps (see Migration and Changes). It also **contradicts a documented platform
convention** — `lowdefy-design`'s mongodb Decision 2 recommends `user-contacts` — so that design's
recommendation should be updated to `contacts` to match (a doc change, since the name was never
adapter-enforced). Captured as upstream note 2.

### 2. Retire `hidden` / `disabled`; honor `deleted`

Stop writing `hidden: false` / `disabled: false` on create, and replace the read guards
`hidden: { $ne: true }, disabled: { $ne: true }` with the soft-delete convention's predicate
`deleted.timestamp: { $exists: false }` in the six contact requests. This deletes two dead fields
and **fixes the leak** in one move — the list and selectors start excluding soft-deleted contacts,
which they never did. Existing documents keep the dead keys until a cleanup migration `$unset`s them
(Migration; a data write, proposed not run).

No new restriction is added: `hidden`/`disabled` guarded nothing (never set true), and `deleted` is
the flag the rest of the repo already means by "soft-deleted."

### 3. `contactId` → first-class `user.contactId` (upstream ask 1)

Promote the link out of `profile`. After this, `_user.contactId` is a clean typed key; the join and
write sites read against it (`members_base`, `get_account`, `deals/get_selected_deal`,
`create-or-link-contact`, `write-profile`); and the module-owned partial-unique index moves from
`users.{ 'profile.contactId': 1 }` to `users.{ contactId: 1 }`.

**This is a platform change, not a module one.** `_user` carries only what `resolveAuthentication`
projects, and the platform deliberately exposes no app-facing user-field knob
([config-schema](../../../../lowdefy-design/designs/auth-upgrade/concepts/config-schema/design.md):
"There is deliberately no `auth.user` section … `additionalFields` is used internally"). So a
first-class `contactId` requires the platform to add it. It also **re-opens
[user-profile](../../../../lowdefy-design/designs/auth-upgrade/_completed/user-profile/design.md)
Decision 2**, which moved `contactId` _into_ `profile` specifically to avoid a new platform field.

Why re-open it: that decision optimized for "zero new platform fields" and accepted a muddled display
bag as the cost — a cost that keeps recurring (the strip in table-row-contract). The correction is
small and consistent: one **optional, opaque, platform-ignored scalar**, in the same category as the
existing internal `attributes` field, `undefined` for apps with no contacts (inert, exactly as
`image` is absent for a strategy caller). It is not the app-facing `additionalFields` knob
config-schema rejected — that fear was about apps rebuilding the fused record, which one internal
scalar does not enable. See upstream ask 1 for the platform contract.

### 4. `profile_created` stays in `profile`; symmetric profiles

`profile_created` is **not** promoted — by the guiding principle, it is module data about the user
(profile completeness), not a relationship, so the opaque bag is its correct home. It also cannot be
**eliminated**: onboarding is a deliberate first-run gate — the invitee reviews the name an admin may
have pre-filled and adds their own fields (job title, etc.) — so it is not derivable from
"required fields present" (an admin invite can pre-fill those, which would skip onboarding entirely).
It stays a key in `profile`, where it rides `_user.profile.profile_created` for the app router for
free, exactly as today.

But it should live on **only the user's copy**. Today the write fragment sets
`profile.profile_created` on the `contact` and then denormalizes it — yet a pure CRM contact never
onboards, so an onboarding flag has no business on the contact record. Dropping it from the contact
write **tightens** the "similar-looking profiles" invariant this design wants:

- `contact.profile` — display fields only (name, given_name, family_name, honorific, picture,
  avatar_color). Source of truth. No `contactId`, no `profile_created`.
- `user.profile` — the same display fields (denormalized copy) **plus** `profile_created`
  (user-scoped completeness). No `contactId`.

A contact and a user read as the same "person profile"; the user simply carries one extra
user-scoped fact plus a top-level link. That symmetry is the model the current grab-bag obscured.

## Upstream asks (feedback into the auth-upgrade / `lowdefy-design` designs)

1. **First-class `user.contactId`** (hard dependency for Decision 3) — **outstanding**. Re-opens
   [user-profile](../../../../lowdefy-design/designs/auth-upgrade/_completed/user-profile/design.md)
   Decision 2 (and supersedes user-account-better-auth's delivered ask 3, "`contactId` on the session
   user", whose superseded shape was `_user.profile.contactId`). The platform provides:
   - a new **internal additionalField** `contactId` on `user` (`{ type: 'string', required: false,
input: false }`), opaque and platform-ignored — never validated, indexed, or read-into by the
     platform, same contract as `profile`;
   - `resolveAuthentication` carries it onto the resolved caller so `_user.contactId` resolves
     server- and client-side (riding the existing user-row read, zero added lookup — the same
     argument that carried `profile`);
   - `UpdateUserProfile` gains a `contactId` write param (reviving the write path user-profile folded
     into the `profile` write), so the merge/invite/link flows set it as a first-class field.

   The module-owned partial-unique index moves to `users.{ contactId: 1 }`. Fallback if the ask is
   not delivered: keep `_user.profile.contactId` (status quo) — the module-side cleanups (Decisions 1,
   2, 4) do not depend on it.

2. **Update the `user-contacts` naming convention to `contacts`** (Decision 1) — **outstanding, doc
   only**. `lowdefy-design`'s mongodb Decision 2 recommends `user-contacts`; since the name was never
   adapter-enforced ("the app's choice"), this is a recommendation to update in that design so the two
   repos agree. No engine work.

## Changes (module side)

| File(s)                                                                                                                                                         | Change                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/{contacts,user-admin,user-account}/connections/*contacts-collection.yaml`                                                                              | `collection: user-contacts` → `contacts` (3 connections)                                                                                                                                                                                                                    |
| `modules/user-admin/requests/stages/members_base.yaml`, `modules/user-account/requests/get_account.yaml`, `modules/deals/requests/get_selected_deal.yaml`       | `$lookup { from: user-contacts }` → `contacts`; and the `localField` for the contact join → `user.contactId` / `contactId` once ask 1 lands                                                                                                                                 |
| `modules/contacts/requests/{get_contact,get_all_contacts,search_contacts,get_contacts_for_selector,get_role_contacts_for_selector,get_contact_excel_data}.yaml` | Replace `hidden`/`disabled` guards with `deleted.timestamp: { $exists: false }`                                                                                                                                                                                             |
| `modules/contacts/api/create-contact.yaml`, `modules/shared/contact/create-or-link-contact.yaml`                                                                | Drop `hidden: false` / `disabled: false` from the insert                                                                                                                                                                                                                    |
| `modules/contacts/requests/search_contacts.yaml`                                                                                                                | `_user: global_attributes.company_ids` → `_user: attributes.company_ids` (lines 53, 57, 59)                                                                                                                                                                                 |
| `modules/shared/contact/write-profile.yaml`                                                                                                                     | Stop writing `profile.profile_created` onto the contact; write `contactId` as a first-class field via `UpdateUserProfile` (ask 1)                                                                                                                                           |
| `modules/shared/contact/create-or-link-contact.yaml`                                                                                                            | Set `user.contactId` (top-level) at link, inline `:return` and `UpdateUserProfile` branches (ask 1)                                                                                                                                                                         |
| `modules/user-account/api/update-profile.yaml`, `modules/user-admin/api/invite.yaml`, `check-invite-email.yaml`, `get_users_for_selector.yaml`                  | Read/write the contact link as `_user.contactId` / `user.contactId` (ask 1)                                                                                                                                                                                                 |
| `docs/**`                                                                                                                                                       | Update `user-contacts` → `contacts` across consumer docs (`contacts/index.md`, `user-{admin,account}/index.md`, `*/reference/indexes.md`, `co-location.md`, `write-pathways.md`, `search.md`, both `migration.md`); regenerate `llms.txt` and `vars.md` via `pnpm docs:gen` |
| `apps/demo/**`                                                                                                                                                  | Rebuild/point demo connections at `contacts`; verify with `pnpm ldf:b`                                                                                                                                                                                                      |

Decisions 1, 2, 4, and the `global_attributes` sweep are module-side and ship independently of ask 1.
Decision 3's code changes land only once ask 1 is delivered (fallback: unchanged `_user.profile.contactId`).

## Migration (data writes — proposed, not run here)

Per repo policy these are proposed as a reviewed migration, not executed:

1. **Rename the collection** `user-contacts` → `contacts` in each suite database
   (`db.user-contacts.renameCollection('contacts')`), with the connection updates deployed in lockstep.
   Recreate indexes (the Atlas Search `default` index and the regular indexes) on the new name — see
   `docs/contacts/reference/indexes.md`.
2. **`$unset` the dead flags** `hidden` and `disabled` from all contact documents (optional; the read
   filters no longer reference them, so this is hygiene, not correctness).
3. **Move `contactId` to top-level** on `users` (once ask 1 lands): copy `profile.contactId` →
   `contactId`, drop `profile.contactId`, and rebuild the partial-unique index as `{ contactId: 1 }`.
4. **Drop `profile_created` from contacts:** `$unset` `profile.profile_created` on `user-contacts`
   documents (it stays on the `users` copy).

## Non-goals

- **The `contact` / `user` / `member` split itself.** Sound and out of scope — this design polishes
  its edges, it does not revisit the three-record model, the denormalization (forced by the
  contact-agnostic platform), or roles-on-membership.
- **A `meta` grab-bag.** Rejected — a fourth JSON bag for one scalar is excess surface (see Guiding
  principle).
- **Eliminating `profile_created` by derivation.** Rejected — onboarding is a deliberate review gate,
  not a function of field presence (Decision 4).
- **Sharing one `_id` across `user` and `contact`.** Infeasible: BetterAuth mints the user id at
  runtime, the contact pre-exists it (CRM-first / invite-first) and may have no user at all, and the
  email/password link happens post-write at `email.verified`. Forcing it would mean overriding id
  generation and rewriting contact ids, breaking every `contact_id` reference in
  deals/activities/companies. The foreign-key pointer is the correct, standard choice.
- **Renaming other `user-*` collections.** Those are adapter-fixed; only the app-owned contact
  collection is the app's to name.
