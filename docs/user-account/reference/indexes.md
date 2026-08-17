---
title: Indexes
module: user-account
type: reference
concepts:
  [indexes, mongodb, contacts, users, uniqueness, two-factor, auth, roles]
---

# User Account — Indexes

The module does not create indexes — index creation is a host-app concern. Host apps must add both `user-contacts` indexes below to the collection backing the module's contact connections before running the contact and profile flows, the `user-members` index before using the members-list role filter, and the `user-two-factors` index before enabling two-factor auth.

**Policy note.** The two `user-contacts` definitions below are the `auth.organizations.policy: tenant` shape, with the `organization_id` prefix. Under `pinned` (the default) documents carry no `organization_id` at all ([Organization scoping](../../shared/org-scoping.md)), and the single-field equivalents are the baseline: `{ lowercase_email: 1 }` and `{ user_id: 1 }`, each unique with the same partial filter. The compound shape also works under `pinned` — a missing `organization_id` indexes as `null`, so the compound key degenerates to the single-field guarantee — so a deployment planning a later flip to `tenant` can create the compound shape from day one and skip the index rebuild at flip time. The `user-members` and `user-two-factors` indexes are the same under both policies.

## `user-contacts` collection

### Index: `{ organization_id: 1, lowercase_email: 1 }` — **partial-unique**

```
db["user-contacts"].createIndex(
  { organization_id: 1, lowercase_email: 1 },
  { unique: true, partialFilterExpression: { lowercase_email: { $exists: true } } }
)
```

The contact identity invariant is **one contact per email per organization** (see [Organization scoping](../../shared/org-scoping.md)): two organizations holding a contact for the same email are two facts about two relationships, not a collision, so the unique key is compound with the tenant field.

Beyond uniqueness, this tuple is the **claim key**: it is how a contact minted before its person had an auth user (an invite) is matched to that person the first time their own contact is resolved. After that the link is `user_id` (see below), and the address is never matched for identity again.

It also serves the `ensure-contact` fragment's reconcile-on-duplicate-key path — the guard that closes the race between this module's merge-on-signup hook and the invite flows, which all ensure the same contact by the same key. Without a unique index here, two concurrent first-touches for one email would mint two contacts.

Every write path keys on the same tuple: under `tenant` an invite's org is injected by the wall and the signup-hook mint (bound at `session.create.after`) passes the session's resolved organization explicitly; under `pinned` both write no organization and key on the address alone. Either way a concurrent mint and invite for one email collide on this index and reconcile to a single contact, exactly as intended.

**Must be partial, not plain unique.** `user-contacts` is the unified person record shared with the `contacts` module, whose CRM contacts legitimately have **no email**. A plain unique index would treat every email-less contact's missing key as `null` and reject the second one, so the model could not hold two email-less contacts. The partial filter (`{ lowercase_email: { $exists: true } }`) indexes only email-bearing contacts, so email-less contacts coexist.

**Constraint — omit `lowercase_email` when absent.** Email-less contacts must **omit** the `lowercase_email` field entirely, not store `null`: two explicit `null`s both satisfy `$exists: true` and would still collide under this filter. The write fragments (`write-profile`, `ensure-contact`) therefore set `lowercase_email` only when an email is present.

### Index: `{ organization_id: 1, user_id: 1 }` — **partial-unique**

```
db["user-contacts"].createIndex(
  { organization_id: 1, user_id: 1 },
  { unique: true, partialFilterExpression: { user_id: { $exists: true } } }
)
```

`user_id` is the contact's link to its auth user, and it lives on the **contact** because a contact is per-organization while the auth `user` is global: a person holds one contact per organization, so the link belongs on the side that is already per-organization. A single contact id on the `user` row could only ever be correct for one organization.

This index carries the read path. Every flow answering "which contact is this person, here" matches `user_id` — under `tenant` within the caller's organization (from the wall), under `pinned` globally — so the index is a **correctness requirement, not an optimization**. The unique half enforces **one contact per person per organization** and makes the claim idempotent: a second claim for a person who already holds a contact here cannot create a second link.

Partial on `$exists` because a CRM contact is a real person record with no auth user at all, and many such contacts must coexist.

| Query site                                | Operation                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `resolve-own-contact`                     | Match the caller's own contact by `{ organization_id, user_id }`; on a miss, claim the unlinked row for their address |
| `ensure-contact`                          | Stamp `user_id` on insert when the caller already knows the auth user (the login hook always does)                    |
| `get_account`, members and selector reads | Join `users` → `user-contacts` on `user_id`, tolerating the address while a contact is still unclaimed                |

## `user-members` collection

### Index: `{ organization_id: 1, app_roles: 1 }` — **multikey compound**, not unique

```
db["user-members"].createIndex({ organization_id: 1, app_roles: 1 })
```

Serves the `user-admin` members list's role filter. `member.app_roles` is a native array of app-role ids, so an index on it is **multikey** — MongoDB indexes one key per element, and a member holding three roles has three entries.

**Not unique.** A member holds many app roles, and many members of one organization hold the same role. Uniqueness would reject the second member granted any role.

**Key order matters.** The members-list read matches `organization_id` (the organization the module instance administers) and `app_roles` (the selected filter ids) together, and both clauses sit on the member root ahead of the read's `$lookup`s. Leading on `app_roles` instead would leave the organization scope unindexed.

| Query site                     | Operation                                                                   |
| ------------------------------ | --------------------------------------------------------------------------- |
| `user-admin` members list read | `$match` on `organization_id`, then `$match` on `app_roles: { $in: [...] }` |

**Module-owned, host-app-created** — the same footing as the `user-contacts` indexes above. Nothing in this repo provisions it. The platform's own per-request read is the membership-wall lookup on `{ user_id, organization_id }`, which this index neither serves nor needs to: without this index the members list still returns correct rows, it just scans the organization's whole membership on every role filter.

## `user-two-factors` collection

### Index: `{ user_id: 1 }` — **unique**

```
db["user-two-factors"].createIndex({ user_id: 1 }, { unique: true })
```

`/two-factor/enable` deletes the user's row and then creates a new one, with no lock between the two writes. Two concurrent calls to `/two-factor/enable` can interleave into **two rows for one user**. Sign-in reads with `findOne`, which carries no ordering, so it may return the unverified row and offer no methods — a user whose sign-in demands a second factor and presents none. That is a lockout, and it reproduces deterministically upstream: [#10561](https://github.com/better-auth/better-auth/issues/10561).

Every reader already assumes one row per user — `findOne` by `user_id` with no ordering is the read the whole plugin uses — so this index encodes an invariant the schema always had and never enforced.

**Must be plain unique, not partial.** Unlike the two `user-contacts` indexes above, every `user-two-factors` row has a `user_id` — there is no missing-key case to carve out with a partial filter, so a plain unique index is the right shape here.

**Not organization-scoped, under either policy.** The collection is written only by the auth engine's two-factor plugin — it backs no module connection — and its rows key to the global auth `user`, like `user-accounts` and `user-passkeys` (both declared `tenant: shared`). An enrolment is a property of the person, not of one of their organizations, so there is no `organization_id` to prefix and the index above is the definition under both `pinned` and `tenant`.

**Does not fix the race.** The window between the delete and the create still exists, and a concurrent pair of calls can still have one of them fail. What the index changes is what happens when they collide: instead of writing a second row and leaving the lockout to surface silently at the next sign-in, the second `create` fails with a duplicate-key error. The user sees an error and retries; they do not silently acquire an enrolment that sign-in may or may not find.

**Without this index, the lockout is silent.** An operator who does not apply it keeps the race exactly as described above — concurrent enable calls can leave a user locked out with no error at either the write or the read.

| Query site                               | Operation                                                           |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `/two-factor/enable` (BetterAuth plugin) | Delete by `user_id`, then create — the unique index bounds the pair |
| Sign-in two-factor lookup                | `findOne` by `user_id`, no ordering — relies on one row per user    |

## `users` collection

No index is required. Nothing queries `users` by a contact id — the auth user carries no contact pointer.
