# Soft-delete convention: `deleted` as a change stamp

Soft-delete was modelled three different ways across the modules for the same concept. This design fixes a single convention — the field is named **`deleted`**, is stored as a **change-stamp object** (not a boolean), and is read via its `timestamp` sub-field — and converges every module onto it.

## The convention

A soft-deletable document carries a single `deleted` field:

- **Live document:** `deleted` is `null` (set explicitly on insert) or absent.
- **Deleted document:** `deleted` is a [change stamp](../../docs/shared/change-stamps.md) — `{ timestamp, user: { name, id } }` — capturing **when** it was deleted and **who** deleted it.

**Write — delete** (`$set`):

```yaml
deleted:
  _ref:
    module: events
    component: change_stamp
```

**Write — create** (`$set` / `$setOnInsert`):

```yaml
deleted: null
```

**Read — live documents** (standard `$match`):

```yaml
deleted.timestamp:
  $exists: false
```

**Read — live documents** (Atlas Search `compound`):

```yaml
mustNot:
  - exists:
      path: deleted.timestamp
```

`deleted.timestamp: { $exists: false }` matches all three live shapes — `deleted` absent, `deleted: null`, or a partial object without a timestamp — and excludes any real deletion stamp. It is the same predicate the `activities` module has always used.

## Rationale

- **The marker carries its own audit.** A boolean tells you a doc is deleted but not when or by whom; the deleting request then has to stamp who/when somewhere else (as `files` did on a separate `updated` field). Making `deleted` itself the change stamp means the delete event is self-describing, exactly like `created`/`updated`.
- **One correct way.** Before this, the same concept had three incompatible shapes: `activities` used the object + `deleted.timestamp` query; `companies`/`contacts`/`files` used a boolean + `$ne: true`; `user-admin` used `: null`. A single object shape + a single read predicate removes the guesswork.
- **The boolean query was a latent bug.** `deleted: { $ne: true }` only excludes docs whose `deleted` is literally `true`. The moment `deleted` becomes an object, `{ $ne: true }` is true for every object, so **soft-deleted docs silently reappear** in lists and lookups. Standardising on `deleted.timestamp` closes that trap.

## Rejected alternatives

- **Keep the boolean, add sibling `deleted_by` / `deleted_at` fields.** Three fields to keep in sync instead of one, and it diverges from the `created`/`updated` change-stamp shape already used everywhere. Rejected.
- **Keep the name `removed` for `files`.** `files` chose `removed` "matching hydra" (see its CHANGELOG). But hydra is an external app, not part of this repo's convention, and the mismatch means a consumer reading files has to remember a different field name than every other collection. Converging on `deleted` is the whole point. Rejected.
- **Leave `user-admin`'s `deleted: null` query as-is.** It is behaviour-equivalent to `deleted.timestamp: { $exists: false }` today, so this is cosmetic. But leaving one module on a different read predicate re-introduces the "which shape does this module use?" question. Normalised for uniformity.

## Per-module changes

| Module | Field before | Read before | After |
| --- | --- | --- | --- |
| `activities` | `deleted` object | `deleted.timestamp $exists` | **reference — unchanged** |
| `files` | `removed` boolean | `removed: { $ne: true }` | `deleted` object; `deleted.timestamp $exists`; renamed field |
| `companies` | `deleted` (mixed) | `$ne: true` (regular) / `deleted.timestamp` (Atlas) | all reads → `deleted.timestamp $exists`; insert already `deleted: null` |
| `contacts` | queries companies' `deleted` | `$ne: true` | `deleted.timestamp $exists` |
| `user-admin` | `deleted` | `deleted: null` | `deleted.timestamp $exists` (cosmetic) |

`companies`, `contacts`, and `user-admin` have no in-module delete endpoint today — a host app is expected to write the soft-delete. Those modules only needed their **read** predicate normalised so that, when a host does write a `deleted` change stamp, the reads exclude it correctly. `files` is the only module with an in-module delete write, so it is the only substantive behaviour change.

## Migration

`files` is the only collection whose stored data changes. Its `removed: true` docs already recorded who/when on the sibling `updated` stamp at delete time, so the migration promotes that stamp into `deleted` rather than inventing one. It must run as a **single per-document pipeline** — splitting it into "migrate deleted" + "migrate live" statements is unsafe, because a `{ removed: { $ne: true } }` filter also matches documents that no longer have a `removed` field (Mongo's `$ne` matches missing fields), so a second pass would overwrite the `deleted` stamps the first pass just wrote. Keying on `{ removed: { $exists: true } }` also makes the migration idempotent:

```js
db.files.updateMany({ removed: { $exists: true } }, [
  { $set: { deleted: { $cond: [{ $eq: ["$removed", true] }, "$updated", null] } } },
  { $unset: "removed" },
]);
```

(Every file doc carries an `updated` stamp — `save-file` always sets it and `delete-file` set it alongside `removed` — so the `$updated` promotion is always populated for deleted docs.)

For `companies` / `contacts` / `user-admin`, a migration is only needed if a host app previously wrote a **boolean** `deleted: true`. Promote those to a stamp so the `deleted.timestamp` reads exclude them:

```js
db.companies.updateMany(
  { deleted: true },
  [{ $set: { deleted: { timestamp: "$updated.timestamp", user: "$updated.user" } } }]
);
```

(Substitute a fixed timestamp if `updated` is unavailable.) Collections that only ever held `deleted: null` / absent need no migration — the new predicate treats them as live.
