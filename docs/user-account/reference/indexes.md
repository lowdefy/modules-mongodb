---
title: Indexes
module: user-account
type: reference
concepts: [indexes, mongodb, contacts, users, uniqueness, two-factor, auth]
---

# User Account — Indexes

The module does not create indexes — index creation is a host-app concern. Host apps must add the following indexes to the collections backing the module's connections before running the create-or-link and profile flows.

## `user-contacts` collection

### Index: `{ lowercase_email: 1 }` — **partial-unique**

```
db["user-contacts"].createIndex(
  { lowercase_email: 1 },
  { unique: true, partialFilterExpression: { lowercase_email: { $exists: true } } }
)
```

Serves the `create-or-link-contact` shared fragment's reconcile-on-duplicate-key path — the guard that closes the race between this module's merge-on-signup hook and the user-admin invite flow, both of which create-or-link the same contact by the same key. Without a unique index here, two concurrent first-touches for one email would mint two contacts.

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

## `user-two-factors` collection

### Index: `{ userId: 1 }` — **unique**

```
db["user-two-factors"].createIndex({ userId: 1 }, { unique: true })
```

`/two-factor/enable` deletes the user's row and then creates a new one, with no lock between the two writes. Two concurrent calls to `/two-factor/enable` can interleave into **two rows for one user**. Sign-in reads with `findOne`, which carries no ordering, so it may return the unverified row and offer no methods — a user whose sign-in demands a second factor and presents none. That is a lockout, and it reproduces deterministically upstream: [#10561](https://github.com/better-auth/better-auth/issues/10561).

Every reader already assumes one row per user — `findOne` by `userId` with no ordering is the read the whole plugin uses — so this index encodes an invariant the schema always had and never enforced.

**Must be plain unique, not partial.** Unlike `lowercase_email` and `profile.contactId` above, every `user-two-factors` row has a `userId` — there is no missing-key case to carve out with a partial filter, so a plain unique index is the right shape here.

**Does not fix the race.** The window between the delete and the create still exists, and a concurrent pair of calls can still have one of them fail. What the index changes is what happens when they collide: instead of writing a second row and leaving the lockout to surface silently at the next sign-in, the second `create` fails with a duplicate-key error. The user sees an error and retries; they do not silently acquire an enrolment that sign-in may or may not find.

**Without this index, the lockout is silent.** An operator who does not apply it keeps the race exactly as described above — concurrent enable calls can leave a user locked out with no error at either the write or the read.

| Query site                               | Operation                                                          |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `/two-factor/enable` (BetterAuth plugin) | Delete by `userId`, then create — the unique index bounds the pair |
| Sign-in two-factor lookup                | `findOne` by `userId`, no ordering — relies on one row per user    |
