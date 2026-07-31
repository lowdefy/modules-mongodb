---
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-user-admin": minor
"@lowdefy/modules-mongodb-organizations": minor
---

**Breaking: `user.profile.contactId` is replaced by `user-contacts.userId`. The contact carries the link to its auth user, not the reverse.**

A `user-contacts` row belongs to one organization, while the auth `user` is global — so a contact id stored on the user row is only ever correct for one organization. Under the `tenant` policy that broke outright: a member whose active organization was not the one that wrote the pointer had every walled contact write miss (`No matching record to update.`), and the members table and user selector read another organization's row for the same person. An invited signup got no pointer at all.

The link now lives on the contact, which is the row these modules own and can write at any moment. That matters because **no module code runs when a membership is created** — the engine's bindable hook points cover user, session, account, verification and phone writes only, and its `afterAcceptInvitation` binding is engine-tier — so a pointer on the `user` or `member` row could never be written at the moment an invitee actually needs it.

- Contacts gain `userId`. Resolution is `{ organizationId, userId }` — the organization from the tenant wall, the user from the session — through the new shared fragment `modules/shared/contact/resolve-own-contact.yaml`. On a miss it **claims** the unlinked contact for the caller's address and stamps `userId`; a contact already linked to someone else can never be taken. `update-profile` rejects with a stated reason when the caller has no contact in the active organization at all.
- The address is the claim key, used once. After claiming, identity is by id, so an email change cannot break the link.
- `create-or-link-contact.yaml` is now `ensure-contact.yaml`: it guarantees the contact exists, takes an optional `user_id` stamped on insert (so a hook-minted contact is born linked), and no longer writes back to the auth user — its `binding_point` var is gone and its `user` var is now a scalar `email`. It is idempotent, so callers may run it on every login.
- `link-contact-on-signup` is now `ensure-contact-on-signup`, still bound at `session.create.after`. It runs whenever the email is verified and the session carries an active organization; the run-once guard is gone because a matched upsert writes nothing.
- `user-admin`'s invite resolves the target user before minting the contact, so an invited address that is already a user gets a linked contact immediately. It no longer passes `profile: { contactId }` to `InviteMember`, and its email check matches the address rather than a resolved contact id.
- The `users` → `user-contacts` joins in `get_account`, `members_base` and `get_users_for_selector` match through one shared expression, `modules/shared/contact/contact-match-expr.yaml`: `userId`, or the address while a contact is still unclaimed. That tolerance covers an invitee's first visit, so their invite-captured profile still prefills. Each join states its own organization — a `$lookup` is never scoped by the tenant wall.
- `get_users_for_selector` now treats an "app user" as someone holding a **member row in the active organization**, and labels an option on the address alone when the person has not completed a profile yet. The previous pointer-based join silently omitted legitimate app users.

Consumers:

- Any app config reading `_user: profile.contactId` must resolve the contact instead: `_ref` the `resolve-own-contact` fragment for the caller's own contact, or match `{ organizationId, userId }` in a join.
- **New required index** on `user-contacts`: `{ organizationId: 1, userId: 1 }`, unique, partial on `userId: { $exists: true }`. It carries resolution on the request path and makes the claim idempotent. The existing `{ organizationId, lowercase_email }` index stays as the uniqueness guard and the claim key. The partial-unique index on `users.profile.contactId` is no longer used and can be dropped. See `docs/user-account/reference/indexes.md`.
- No backfill is required: existing contacts have no `userId` and are claimed on their person's next own-contact resolution. Existing `profile.contactId` values are never read again.
- Contact minting and claiming both require a **verified** email, since a contact is claimable by address. What carries the account-takeover guarantee is the deployment's `requireEmailVerification` — with it set, an unverified signup holds no session and can reach no walled read or claim. A deployment that allows sessions before verification must gate at the point of resolution.
