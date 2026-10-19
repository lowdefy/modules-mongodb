---
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-user-admin": minor
"@lowdefy/modules-mongodb-events": minor
"@lowdefy/modules-mongodb-plugins": minor
---

**A person's contact links to their auth user through `user-contacts.user_id`.** A contact belongs to one organization, while the auth `user` is global, so the link lives on the contact and a person holds one contact per organization.

- The caller's own contact is the one with `{ organization_id, user_id }`: the organization from the tenant wall and the user from the session. The shared `modules/shared/contact/resolve-own-contact.yaml` fragment resolves it. If the person has no linked contact there, it claims the unlinked contact for their verified address and stamps `user_id`. A contact already linked to someone else is never claimed. After the claim, identity is by id, so an email change does not break the link.
- `modules/shared/contact/ensure-contact.yaml` makes sure a contact exists and is safe to run on every sign-in. It sets `user_id` only when there is an auth user, so a contact minted for an invitee who has no login yet is unlinked until they first sign in.
- Joins from `users` to `user-contacts` match through `modules/shared/contact/contact-match-expr.yaml`: `user_id`, or the address while the contact is still unclaimed.
- The events timeline (`GetEventsTimeline`) finds an author's picture through the contact's `user_id`. Under `policy: tenant` only the caller's organization's contact is read. An author whose contact has no `user_id` yet shows initials.
- App config that needs the caller's contact should resolve it with `resolve-own-contact`, or match `{ organization_id, user_id }` in a join.

**New required index** on `user-contacts`: `{ organization_id: 1, user_id: 1 }`, unique, partial on `user_id: { $exists: true }`, alongside the partial-unique `{ organization_id: 1, lowercase_email: 1 }`. Under `pinned` the single-field `{ user_id: 1 }` and `{ lowercase_email: 1 }` work too. See `docs/user-account/reference/indexes.md`. No backfill is needed: an existing contact is claimed on its person's next sign-in.

Contacts are minted and claimed only for a verified email. Turn on `requireEmailVerification` so that an unverified signup holds no session.
