---
title: Indexes
module: user-account
type: reference
concepts: [indexes, mongodb, contacts, users, uniqueness]
---

# User Account — Indexes

The module does not create indexes — index creation is a host-app concern. Host apps must add the following indexes to the collections backing the module's connections before running the create-or-link and profile flows.

## `user-contacts` collection

### Index: `{ organizationId: 1, lowercase_email: 1 }` — **partial-unique**

```
db["user-contacts"].createIndex(
  { organizationId: 1, lowercase_email: 1 },
  { unique: true, partialFilterExpression: { lowercase_email: { $exists: true } } }
)
```

The contact identity invariant is **one contact per email per organization** (see [Organization scoping](../../shared/org-scoping.md)): two organizations holding a contact for the same email are two facts about two relationships, not a collision, so the unique key is compound with the tenant field. Under a single-organization (pinned) deployment every row carries the same `organizationId`, and the compound index enforces exactly what a global email index would.

Serves the `create-or-link-contact` shared fragment's reconcile-on-duplicate-key path — the guard that closes the race between this module's merge-on-signup hook and the user-admin invite flow, both of which create-or-link the same contact by the same key. Without a unique index here, two concurrent first-touches for one email would mint two contacts.

**Known gap until the merge-on-signup mint is relocated** (org-aware-modules upstream ask 4): the signup-hook mint runs in system context and cannot know its organization yet, so it writes contacts **without** `organizationId` (they index under a missing key). Two concurrent org-less mints for one email still collide and reconcile correctly — but an org-less mint and an org-stamped invite row have different key tuples and do **not** collide, so the cross-path race guard only fully applies once the mint is org-aware.

| Query site                                   | Operation                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `create-or-link-contact` (signup hook)       | Match by `lowercase_email`; insert when absent; **reconcile to the existing row on dup-key**  |
| `create-or-link-contact` (user-admin invite) | Same match-and-write against the same key — the unique index is what makes the reconcile safe |

**Must be partial, not plain unique.** `user-contacts` is the unified person record shared with the `contacts` module, whose CRM contacts legitimately have **no email**. A plain unique index would treat every email-less contact's missing key as `null` and reject the second one, so the model could not hold two email-less contacts. The partial filter (`{ lowercase_email: { $exists: true } }`) indexes only email-bearing contacts, so email-less contacts coexist.

**Constraint — omit `lowercase_email` when absent.** Email-less contacts must **omit** the `lowercase_email` field entirely, not store `null`: two explicit `null`s both satisfy `$exists: true` and would still collide under this filter. The write fragments (`write-profile`, `create-or-link-contact`) therefore set `lowercase_email` only when an email is present.

This index enforces **one contact per email** — it does **not** enforce one user per contact (see below).

## `users` collection

### Index: `{ "profile.contactId": 1 }` — **partial-unique**

```
db.users.createIndex(
  { "profile.contactId": 1 },
  { unique: true, partialFilterExpression: { "profile.contactId": { $exists: true } } }
)
```

Enforces **one `user` per `contact`** — the invariant that a single contact record is not linked to two auth users. It is partial-unique on `$exists` for the same reason as above: a `user` row may exist before its `profile.contactId` is written (the `user.create.before` / `email.verified` link-back sets it), and multiple such unlinked rows must coexist without colliding on a missing key.

This is a **different invariant** from the `lowercase_email` index and does **not** prevent duplicate contacts for one email — that guard lives on `user-contacts.lowercase_email`. The two indexes are complementary: `lowercase_email` bounds contacts by email, `profile.contactId` bounds users by contact.
