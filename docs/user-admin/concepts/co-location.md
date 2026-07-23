---
title: Same-database co-location
module: user-admin
type: concept
concepts: [co-location, lookup, connections]
---

# Same-database co-location (hard precondition)

`user-admin` reads are native aggregations: each one roots on an auth collection
(`user-members`, `user-invitations`, `user-sessions`, …) and `$lookup`-joins the
others plus the app-owned `user-contacts` record. MongoDB's `$lookup` **cannot
cross databases** (let alone clusters).

So three things must resolve to **one MongoDB database**:

1. the **BetterAuth adapter database** (the app's `auth` config), which owns
   `users`, `user-members`, `user-invitations`, `user-sessions`, `user-accounts`,
   `user-organizations`, `user-passkeys`;
2. the **`user-contacts` connection** (the app collection holding contact/profile
   data);
3. the module's **read-only connections** (`users`, `user-members`,
   `user-invitations`, `user-sessions`, `user-accounts`, `user-organizations`,
   `user-passkeys`).

The natural shape is a **single shared `_secret`** (e.g. `MONGODB_URI`) used by
all of them. This is also the auth engine's intended layout: the `user-`
collection naming exists so `user-contacts` lands inside the auth-collection block
in one database listing.

## The failure mode is silent

A cross-database `$lookup` does **not** error — it treats the missing collection
as empty. A deployment whose connections point at different databases therefore
shows **blank contact data everywhere** (no names on the members list, empty
profile tiles) rather than failing loudly.

There is no build- or startup-time check for this (the platform is not told which
connection needs co-location, and modules have no startup hook), so the
precondition is **documented, not enforced**. The blank-data symptom surfaces
immediately in dev/test.

**If you see blank contact data anywhere in `user-admin`, check co-location
first** — it is far more likely a divergent-database configuration than a wiring
bug.

A deployment that genuinely cannot co-locate these collections cannot use this
module's native single-aggregation reads.
