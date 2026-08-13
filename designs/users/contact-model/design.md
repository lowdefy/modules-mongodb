# Contact model — naming, lifecycle flags, and the user↔contact link

A fresh-eyes pass over the person model the auth upgrade left behind. The `contact` / `user` /
`member` split itself is sound and matches industry norm (a CRM person who may or may not have a
login; roles on the membership, not the user). The problems are all at the edges — the record's
name, dead lifecycle flags, a soft-delete filter that never got wired, a foreign key living inside a
display bag, and a caller-scoping filter whose data source the split silently dropped. This design
cleans those up and promotes the contact link to a first-class field.

## Proposed change

1. **Rename the physical collection `user-contacts` → `contacts`.** It is the one app-owned
   collection in the cluster; the `user-` prefix falsely signals BetterAuth ownership. The name is a
   convention, not adapter-fixed, so this is the app's to change.
2. **Retire the dead `hidden` and `disabled` flags** on the contact — nothing ever sets them true —
   and **wire the live `deleted` soft-delete filter** into the contact list and selectors, which
   currently guard the two dead flags and miss the real one (soft-deleted contacts leak into lists).
3. **Promote the contact link to a first-class `user.contact_id` field**, out of the `user.profile`
   bag, so `_user.contact_id` is a clean typed key rather than `_user.profile.contactId` riding inside
   the display bag. This is an **upstream ask** on `lowdefy-design` (platform additionalField +
   `resolveAuthentication` projection + `UpdateUserProfile` write param).
4. **Keep `profile_created` in `profile`** and leave it on the existing denormalization path — it is
   genuinely profile-completeness data, not a relationship, so it belongs in the opaque bag and is
   _not_ promoted to a first-class field the way `contact_id` is.
5. **Restore the caller company-scoping filter in `search_contacts`**, which silently no-ops today.
   The `contact` / `user` split dropped the denormalization that fed it: the filter needs the caller's
   `company_ids`, but unlike `profile`, the contact's `global_attributes.company_ids` is never copied
   onto the `user`, so `_user` carries no `company_ids` at any path. The fix reads the scope **live
   from the caller's own contact** (via the caller's contact link — the `members_base` join pattern),
   not a stale `_user` path: one source of truth, nothing to keep in sync.

## Guiding principle: separate by _kind of thing_

The one idea the whole design turns on. Data attached to the auth `user` splits into two kinds, and
the smells all come from mixing them:

- **A structural relationship** (the contact foreign key) → a **first-class typed field**
  (`user.contact_id`), the way `email_verified` is a scalar and not a key in some bag.
- **Module data about the user** (denormalized display fields, the `profile_created` completeness
  flag) → the **opaque `profile` bag**, which is exactly what that bag is for.

This is why `contact_id` comes out and `profile_created` stays — not tidiness, but a real difference
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
set: `id, name, email, image, email_verified, roles, attributes, profile`. The `profile` bag is the
one opaque, module-writable slot that rides onto `_user`; anything a module wants visible on `_user`
must live inside it (which is why `contact_id` and `profile_created` ended up there).

### What's actually wrong

- **`hidden` is dead.** Nothing anywhere sets `hidden: true`. It is initialized to `false` on create
  (`contacts/api/create-contact.yaml`, `shared/contact/create-or-link-contact.yaml`) and filtered
  (`hidden: { $ne: true }`) in six contact requests, but no code path activates it. `disabled` is in
  the identical state — pre-BetterAuth legacy (it used to mean "per-app disable"; the new model
  expresses that as "no `member` row", and user-suspend is BetterAuth `ban`).
- **The live soft-delete filter is missing.** The real convention is the change-stamp `deleted`
  field ([soft-delete-convention](../../_completed/soft-delete-convention/design.md)). Contacts has
  **no in-module delete endpoint** — `user-admin/api/delete-user.yaml` hard-deletes the login
  identity and leaves the contact untouched ("the contact ALWAYS survives"), and
  soft-delete-convention is explicit that for `contacts` "a host app is expected to write the
  soft-delete." So no module code path produces a soft-deleted contact today — the leak is **latent**.
  But `get_all_contacts`, `search_contacts`, and `get_contacts_for_selector` filter `hidden`/`disabled`
  and **not** `deleted.timestamp`, so the moment a host app soft-deletes a contact it surfaces in the
  list and selectors. The reads should honor `deleted` regardless (absence of a caller is not absence
  of need).
- **`user-contacts` is the only app-owned collection in a cluster of BetterAuth `user-*` names**
  (`users`, `user-sessions`, `user-accounts`, `user-members`, …). The `user-` prefix reads as "the
  auth system manages this," which is false — it is app data on an app connection, and the module is
  already literally named `contacts` with its connection already called `contacts-collection`.
- **`contactId` is a foreign key inside a display bag.** `_user.profile.contactId` sits alongside
  `name` / `picture`, so a consumer treating `profile` as a display object must reason about a
  non-display key riding in it. The [table-row-contract](../_completed/table-row-contract/design.md)
  design shows the cost concretely: it had to explicitly classify `profile.contactId` as a
  "housekeeping key riding along" and consciously decide _not_ to guard it — a foreign key that every
  `profile` consumer has to notice and wave through is the tell it is in the wrong place.
- **The caller company-scoping filter lost its data source in the split.** `search_contacts` scopes
  the contact typeahead to the caller's companies: it matches a candidate `contact.global_attributes.company_ids`
  against the **caller's own** `company_ids`, read from `_user`. In the pre-split model this worked
  because `user` _was_ the contact, so the caller's record carried `global_attributes.company_ids`
  directly. The split kept `profile`'s contact→user denormalization but dropped this one — nothing
  copies the contact's `global_attributes` onto the `user`, so `_user` now carries no `company_ids` at
  any path: neither the pre-upgrade `global_attributes` (gone) nor `attributes` (never populated with
  it). So the filter has nothing to scope on and returns everything. A path rename alone cannot fix it;
  the scope has to be read from where it still lives — the caller's own contact. (Distinct from the
  contacts module's own `contact.global_attributes.*` field bag, which is the live source of truth
  here — a confusing but real name collision.)

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

**The connection ids are renamed too.** The prefix mis-signals ownership just as much on the
connection id as on the collection name, so scoping the rename to the physical `collection:` value
alone would leave a connection literally called `user-contacts-collection` pointing at a collection
called `contacts` — the same lie, relocated. `user-admin` and `user-account` name their connection
`user-contacts-collection`; both are renamed to `contacts-collection` (the `contacts` module already
uses that name). This is the connection **id** the module wires with `_module.connectionId`, internal
to each module and auto-scoped by the entry prefix at build — nothing in app config or another module
depends on it, so the rename is mechanical and zero-risk. It touches the two connection files, their
`id:` fields, both `module.lowdefy.yaml` `_ref` paths and connection-export entries, and all seven
`_module.connectionId: user-contacts-collection` call sites (see Changes).

**The canonical default `contacts` propagates to every consumer of the physical collection, including
a plugin version bump.** The contacts module is not the only reader of the person collection. `events`,
`workflows` and `activities` each resolve it through a module var (`contacts_collection` /
`lookup_collections.contacts`), and the `WorkflowAPI` and `EventsTimeline` plugin connections through a
`contactsCollection` schema field — **all of which currently default to the string `user-contacts`**, as
does the demo's `apps/demo/modules/events/vars.yaml`. These defaults drive the `$lookup from` that
resolves an event author's / workflow contact's avatar; left at `user-contacts` after the rename they
join against a collection that no longer exists, so the join returns empty, avatars silently fall back to
initials, and nothing errors. So `contacts` becomes the canonical default in **all** of them — not just
the contacts module's own connection — on the "one correct name / no default that points at a dead
collection" grounds that motivate the rename in the first place. The three module var defaults are config
edits; the two plugin defaults are hard-coded in published JS (`?? "user-contacts"` fallbacks + schema
`default` + doc strings), so this half is a **plugin version bump**, not a config edit — the one part of
Decision 1 that is neither mechanical nor confined to the people-model surface. All eight sites plus the
demo vars are enumerated in Changes.

**Trade-off accepted:** this is a suite-wide change. The physical collection is shared across every
app in a multi-app suite, so the rename is a coordinated DB migration plus connection/`$lookup`/doc
updates across apps and a plugin version bump (see Migration and Changes). It also **contradicts a
documented platform convention** — `lowdefy-design`'s mongodb Decision 2 recommends `user-contacts` — so
that design's recommendation should be updated to `contacts` to match (a doc change, since the name was
never adapter-enforced). Captured as upstream note 2.

### 2. Retire `hidden` / `disabled`; honor `deleted`

Stop writing `hidden: false` / `disabled: false` on create, and replace the read guards
`hidden: { $ne: true }, disabled: { $ne: true }` with the soft-delete convention's predicate
`deleted.timestamp: { $exists: false }` in the **five list-shaped reads** — `get_all_contacts`,
`search_contacts`, `get_contacts_for_selector`, `get_role_contacts_for_selector`, and
`get_contact_excel_data`. This deletes two dead fields and **fixes the leak** in one move — lists,
selectors and the export start excluding soft-deleted contacts, which they never did. Existing
documents keep the dead keys until a cleanup migration `$unset`s them (Migration; a data write,
proposed not run).

**`get_contact` is deliberately excluded.** It is the single-record fetch by `_id` behind the contact
view page, not a list, so a `deleted` guard there is a different decision: it would make a
soft-deleted contact's detail page resolve to nothing. The intended behaviour is the opposite — the
view page **should** open a soft-deleted contact and render it with a "deleted" badge — so `get_contact`
keeps fetching regardless of `deleted`, and only its `hidden` guard is dropped. That view-page
behaviour is a separate feature captured in its own stub design
([deleted-contact-view](../../deleted-contact-view/design.md)); this design only fixes the list leak
and leaves the by-id fetch able to reach a deleted contact.

No new restriction is added: `hidden`/`disabled` guarded nothing (never set true), and `deleted` is
the flag the rest of the repo already means by "soft-deleted."

While the insert is being edited, set `deleted: null` on create (`create-contact`,
`create-or-link-contact`) to put contacts on the soft-delete convention's stated live shape
("`deleted` is `null`, set explicitly on insert"). This is alignment, not correctness — the read
predicate `deleted.timestamp: { $exists: false }` matches an absent `deleted` field too — but it
removes the "which shape does this module use?" question the convention exists to close.

### 3. `contact_id` → first-class `user.contact_id` (upstream ask 1)

Promote the link out of `profile`. The current field is stored and indexed as `profile.contactId`
(camelCase); the promotion is therefore also a **camelCase → snake_case normalization** to
`contact_id`, matching the snake_case `_user` projection convention (`email_verified`), not a
straight relocation of an already-snake key. After this, `_user.contact_id` is a clean typed key; the
join/read sites read against it (`members_base`, `get_account`, `deals/get_selected_deal`,
`get_users_for_selector`, and the link reads in `invite` / `update-profile`), the sole write site
(`create-or-link-contact`) sets it, and the module-owned partial-unique index moves from
`users.{ 'profile.contactId': 1 }` to `users.{ contact_id: 1 }`.

**This is a platform change, not a module one.** `_user` carries only what `resolveAuthentication`
projects, and the platform deliberately exposes no app-facing user-field knob
([config-schema](../../../../lowdefy-design/designs/auth-upgrade/concepts/config-schema/design.md):
"There is deliberately no `auth.user` section … `additionalFields` is used internally"). So a
first-class `contact_id` requires the platform to add it. It also **re-opens
[user-profile](../../../../lowdefy-design/designs/auth-upgrade/_completed/user-profile/design.md)
Decision 2**, which moved `contact_id` _into_ `profile` specifically to avoid a new platform field.

Why re-open it: that decision optimized for "zero new platform fields" and accepted a muddled display
bag as the cost — a cost every `profile` consumer keeps paying (table-row-contract had to classify and
wave through `profile.contactId` as a non-display key). The correction is
small and consistent: one **optional, opaque, platform-ignored scalar**, in the same category as the
existing internal `attributes` field, `undefined` for apps with no contacts (inert, exactly as
`image` is absent for a strategy caller). It is not the app-facing `additionalFields` knob
config-schema rejected — that fear was about apps rebuilding the fused record, which one internal
scalar does not enable. See upstream ask 1 for the platform contract.

### 4. `profile_created` stays in `profile`, on the existing denormalization path

`profile_created` is **not** promoted — by the guiding principle, it is module data about the user
(profile completeness), not a relationship, so the opaque bag is its correct home. This is the real
contrast with `contact_id`: a structural foreign key earns a first-class field; a completeness flag
belongs in the bag. It also cannot be **eliminated**: onboarding is a deliberate first-run gate — the
invitee reviews the name an admin may have pre-filled and adds their own fields (job title, etc.) — so
it is not derivable from "required fields present" (an admin invite can pre-fill those, which would
skip onboarding entirely). It stays a key in `profile`, where it rides `_user.profile.profile_created`
for the app router for free, exactly as today.

It also **keeps riding the existing denormalization path** — set on the contact write and copied onto
the user by the shared `write-profile` fragment's whole-bag `UpdateUserProfile`, exactly as today. An
earlier draft scrubbed it from the contact and wrote it to the user's copy only, on a "user-scoped
flag has no business on a CRM contact" purity argument. That is not worth doing. The contact-side
`profile_created` is **inert**: no read keys on it (table-row-contract already lists it among the
housekeeping keys it waves through), so it costs nothing sitting there. Removing it, by contrast,
would force `write-profile` to grow a "user-only profile field" concept — breaking the one property
that makes that fragment safe, that `user.profile` is a faithful denormalized copy of
`contact.profile` and can never drift. That is real complexity bought to delete an inert key. So the
flag denormalizes onto both copies like every other profile key; it is simply only _meaningful_ on the
user.

### 5. Restore caller company-scoping by reading the caller's own contact

`search_contacts` scopes the contact-selector typeahead to the caller's companies, and that filter is
dead today (previous bullet): the split dropped the contact→user denormalization that put the caller's
`company_ids` on `_user`, and it was never rebuilt. Three ways to feed the scope back to the filter
were considered:

1. **Denormalize the caller's contact `company_ids` onto `user.attributes`** (rebuild the dropped
   copy). Rejected: a contact's `company_ids` changes through company management (`update-company`)
   and contact edits, not just profile saves, so the copy would have to be re-synced from every one of
   those write paths — a standing drift risk for a value that already has a canonical home on the
   contact.
2. **Make company-scope an admin-set `user_attribute`** decoupled from the contact. Rejected: it
   changes the semantics (scope would no longer follow the caller's own company memberships), needs
   admins to re-enter data that already exists on contacts, and folds an authorization input into a bag
   that is otherwise free-form module data.
3. **Read the scope live from the caller's own contact — chosen.** The caller's contact id is already
   on `_user` (`profile.contactId` today, `contact_id` after Decision 3), and joining a user's contact
   by that id is the established `members_base` pattern. `search_contacts` fetches the caller's own
   contact at query time and reads its `global_attributes.company_ids` directly — the contact stays the
   single source of truth and nothing is copied or synced.

**Mechanics.** Prepend a `$lookup` to `search_contacts`' pipeline that fetches the caller's own contact
by the `_user` contact link (injected as a build-time literal, exactly as the dead `_user:` reads were)
and projects its `global_attributes.company_ids`; then match a candidate contact whose
`global_attributes.company_ids` intersects that scope. The existing **empty-scope ⇒ unfiltered**
behaviour is preserved — a caller with no contact or no company tags (e.g. an internal admin) is
unscoped and sees everything — expressed with `$expr` / `$setIntersection` since the scope is now a
pipeline value rather than a build-time array. The candidate field being matched
(`contact.global_attributes.company_ids`, the request's line 57) is unchanged; only the caller-side
value and the match operator change. **No data migration** — the fix reads the live contact, so there
is nothing to backfill.

**Dependency.** It uses the caller's contact link on `_user`, so it rides the same link Decision 3
promotes: `_user.profile.contactId` today, `_user.contact_id` once ask 1 lands. It does **not** require
ask 1 — only the link's current path — so it ships module-side with Decisions 1, 2, 4.

## Upstream asks (feedback into the auth-upgrade / `lowdefy-design` designs)

1. **First-class `user.contact_id`** (hard dependency for Decision 3) — **outstanding**. Re-opens
   [user-profile](../../../../lowdefy-design/designs/auth-upgrade/_completed/user-profile/design.md)
   Decision 2 (and supersedes user-account-better-auth's delivered ask 3, "`contact_id` on the session
   user", whose superseded shape was `_user.profile.contactId`). The platform provides:
   - a new **internal additionalField** `contact_id` on `user` (`{ type: 'string', required: false,
input: false }`), opaque and platform-ignored — never validated, indexed, or read-into by the
     platform, same contract as `profile`;
   - `resolveAuthentication` carries it onto the resolved caller so `_user.contact_id` resolves
     server- and client-side (riding the existing user-row read, zero added lookup — the same
     argument that carried `profile`);
   - `UpdateUserProfile` gains a `contact_id` write param (reviving the write path user-profile folded
     into the `profile` write), so the merge/invite/link flows set it as a first-class field.

   The module-owned partial-unique index moves to `users.{ contact_id: 1 }`. Fallback if the ask is
   not delivered: keep `_user.profile.contactId` (status quo) — the module-side cleanups (Decisions 1,
   2, 4) do not depend on it.

2. **Update the `user-contacts` naming convention to `contacts`** (Decision 1) — **outstanding, doc
   only**. `lowdefy-design`'s mongodb Decision 2 recommends `user-contacts`; since the name was never
   adapter-enforced ("the app's choice"), this is a recommendation to update in that design so the two
   repos agree. No engine work.

## Changes (module side)

| File(s)                                                                                                                                                                                                                                                                                                                                                                                                           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `modules/{contacts,user-admin,user-account}/connections/*contacts-collection.yaml`                                                                                                                                                                                                                                                                                                                                | `collection: user-contacts` → `contacts` (3 connections). **Also rename the connection id** `user-contacts-collection` → `contacts-collection` in `user-admin` + `user-account`: rename `connections/user-contacts-collection.yaml` → `contacts-collection.yaml`, its `id:` field, and each `module.lowdefy.yaml` `_ref` path + `connections:` export id. (`contacts` already uses `contacts-collection`.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `_module.connectionId: user-contacts-collection` call sites (7): `user-account/api/{link-contact-on-signup,update-profile}.yaml`, `user-account/requests/get_users_for_selector.yaml`, `user-admin/api/{check-invite-email,invite (×2),update-profile}.yaml`                                                                                                                                                      | Retarget to `contacts-collection` (part of the connection-id rename above)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `modules/user-admin/requests/stages/members_base.yaml`, `modules/user-account/requests/get_account.yaml`, `modules/deals/requests/get_selected_deal.yaml`                                                                                                                                                                                                                                                         | `$lookup { from: user-contacts }` → `contacts`; and the `localField` for the contact join → `user.contact_id` / `contact_id` once ask 1 lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `modules/events/module.lowdefy.yaml:83`, `modules/workflows/module.lowdefy.yaml:152`, `modules/activities/module.lowdefy.yaml:193`                                                                                                                                                                                                                                                                                | Change the person-collection var **default** `user-contacts` → `contacts` (`events.contacts_collection`, `workflows.contacts_collection`, `activities.lookup_collections.contacts`) and the surrounding doc-string mentions; regenerate `vars.md`. These defaults drive the avatar `$lookup from`, so a stale default silently joins a dead collection (empty join → initials fallback, no error).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js:177,181`, `WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js:40`, `WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js:130`, `EventsTimeline/schema.js` (doc string only), and the two request tests `WorkflowAPI/GetEventsTimeline/GetEventsTimeline.test.js:37,117` + `WorkflowAPI/GetWorkflowAction/GetWorkflowAction.test.js:215,1138` | **Plugin version bump** (not a config edit — hard-coded in published JS). Change WorkflowAPI's `contactsCollection` schema `default: "user-contacts"` → `"contacts"`, the `?? "user-contacts"` runtime fallbacks in `GetEventsTimeline.js`/`GetWorkflowAction.js` → `?? "contacts"`, and every doc string. **`EventsTimeline/schema.js` has no `default` key** — its `contactsCollection` is doc-string-only, and the field is **live, not vestigial**: `EventsTimeline` reuses `GetEventsTimeline` as its request, so `GetEventsTimeline.js:40`'s `?? "user-contacts"` is its effective default. **Update the test seeds in the same change** — both `*.test.js` construct the connection without setting `contactsCollection` and seed the fixture into `collection("user-contacts")`, so once the default flips they must seed `collection("contacts")` or the avatar-join assertions go red. Bump + publish the plugin package and update the app's pinned plugin version. |
| `apps/demo/modules/events/vars.yaml:3`                                                                                                                                                                                                                                                                                                                                                                            | `contacts_collection: user-contacts` → `contacts` (the demo sets it explicitly; verify the avatar join with `pnpm ldf:b` + generated-artifact inspection)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `modules/contacts/requests/{get_all_contacts,search_contacts,get_contacts_for_selector,get_role_contacts_for_selector,get_contact_excel_data}.yaml`                                                                                                                                                                                                                                                               | Replace `hidden`/`disabled` guards with `deleted.timestamp: { $exists: false }` (five list-shaped reads); `get_contact` is excluded — drop its `hidden` guard only, keep it able to fetch soft-deleted contacts (see [deleted-contact-view](../../deleted-contact-view/design.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `modules/contacts/api/create-contact.yaml`, `modules/shared/contact/create-or-link-contact.yaml`                                                                                                                                                                                                                                                                                                                  | Drop `hidden: false` / `disabled: false` from the insert; add `deleted: null` (on-convention live shape)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `modules/contacts/requests/search_contacts.yaml`                                                                                                                                                                                                                                                                                                                                                                  | Restore the caller company-scope (Decision 5). Remove the two dead `_user: global_attributes.company_ids` caller reads (lines 53, 59); prepend a `$lookup` fetching the caller's own contact by the `_user` link (`profile.contactId` now, `contact_id` after ask 1) and project its `global_attributes.company_ids`; rewrite the scope clause to match a candidate whose `global_attributes.company_ids` intersects it (`$expr` / `$setIntersection`), keeping the empty-scope ⇒ unfiltered guard. **The matched candidate field (line 57) stays** — it is the contact's own `global_attributes.company_ids`, still the source of truth here (name-collision note under "What's actually wrong").                                                                                                                                                                                                                                                                             |
| `modules/shared/contact/create-or-link-contact.yaml`                                                                                                                                                                                                                                                                                                                                                              | Set `user.contact_id` (top-level) at link, inline `:return` and `UpdateUserProfile` branches (ask 1). **Sole link-write site.** (`write-profile.yaml` is _not_ touched: its `contact_id` var is the target contact's own `_id`, and its `UpdateUserProfile` re-denorm passes only `profile`/`name`/`image`; the link was never in the contact's profile bag, so `write-profile` neither writes nor needs to write it — the link does not change on a profile edit.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `modules/user-account/api/update-profile.yaml`, `modules/user-admin/api/invite.yaml`, `check-invite-email.yaml`, `get_users_for_selector.yaml`                                                                                                                                                                                                                                                                    | Read/write the contact link as `_user.contact_id` / `user.contact_id` (ask 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/**`                                                                                                                                                                                                                                                                                                                                                                                                         | Update `user-contacts` → `contacts` across consumer docs (`contacts/index.md`, `user-{admin,account}/index.md`, `*/reference/indexes.md`, `co-location.md`, `write-pathways.md`, `search.md`, both `migration.md`); regenerate `llms.txt` and `vars.md` via `pnpm docs:gen`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `apps/demo/**`                                                                                                                                                                                                                                                                                                                                                                                                    | Rebuild/point demo connections at `contacts`; verify with `pnpm ldf:b`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Decisions 1, 2, 4, and 5 (company-scoping) are module-side and ship independently of ask 1 — Decision 5
reads the caller's contact link at its current path (`_user.profile.contactId`) until ask 1 promotes it.
Decision 3's code changes land only once ask 1 is delivered (fallback: unchanged `_user.profile.contactId`).

## Migration (data writes — proposed, not run here)

Per repo policy these are proposed as a reviewed migration, not executed:

1. **Rename the collection** `user-contacts` → `contacts` in each suite database. The mechanically
   simplest form is `db.user-contacts.renameCollection('contacts')` with the connection updates
   deployed in lockstep — but the **Atlas Search `default` index does not survive a rename**: it is a
   `mongot` index tied to the namespace, so it is dropped rather than carried over and must be **rebuilt
   from scratch on `contacts`**, which is not instant on a populated collection. While it rebuilds,
   every Atlas-search read (the list search box, the Excel export, the contact-selector typeahead)
   matches **nothing** — with `atlas_search: true` a missing index does not fall back to regex, it
   returns empty (`docs/contacts/reference/indexes.md`). The regular `mongod` indexes, by contrast,
   recreate instantly. So "in lockstep" hides a real search-availability gap; sequence around it:
   - **Preferred — copy-and-cutover (zero search-downtime).** Create `contacts` as a new collection,
     copy the documents, build the regular indexes **and** the Atlas Search `default` index on it while
     `user-contacts` keeps serving, wait for the search index to reach steady state, then cut the
     connections over to `contacts` (drop `user-contacts` once verified). Search is never dark.
   - **Acceptable — rename + rebuild, inside a window.** `renameCollection`, cut the connections over in
     lockstep, immediately rebuild the Atlas Search index, and accept that Atlas searches return empty
     until it is ready — only under a maintenance window, or after temporarily setting
     `atlas_search: false` so searches degrade to the regex fallback rather than returning empty.

   Recreate all indexes per `docs/contacts/reference/indexes.md` in either case.

2. **`$unset` the dead flags** `hidden` and `disabled` from all contact documents (optional; the read
   filters no longer reference them, so this is hygiene, not correctness).
3. **Move `contact_id` to top-level** on `users` (once ask 1 lands): copy `profile.contactId` →
   `contact_id` (a camelCase → snake_case normalization, not a same-name relocation), drop
   `profile.contactId`, and rebuild the partial-unique index as `{ contact_id: 1 }`.

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
