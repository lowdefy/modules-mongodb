---
type: shared
module: shared
title: Soft delete
concepts:
  - deleted
  - soft delete
  - change_stamp
---

# Soft delete

Modules that soft-delete documents never remove them from the collection — they mark them with a `deleted` field and filter them out of reads. The marker doubles as an audit record: it is a [change stamp](./change-stamps.md), so it captures **when** the document was deleted and **who** deleted it.

## The `deleted` field

Every soft-deletable document carries a single `deleted` field:

- **Live** — `deleted` is `null` (set on insert) or absent.
- **Deleted** — `deleted` is a change stamp: `{ timestamp, user: { name, id } }`.

This mirrors the `created` and `updated` change stamps: rather than a bare boolean flag plus separate "who/when" fields, the delete marker _is_ the who/when.

## Writing

On insert, initialise the field so live documents have a consistent shape:

```yaml
deleted: null
```

On delete, set it to a change stamp:

```yaml
deleted:
  _ref:
    module: events
    component: change_stamp
```

## Reading

To read only live documents, test that the stamp's `timestamp` is absent — **not** `deleted: { $ne: true }`. A change stamp is an object, so a boolean comparison would let deleted documents through.

Standard aggregation `$match`:

```yaml
- $match:
    deleted.timestamp:
      $exists: false
```

Atlas Search `compound`:

```yaml
mustNot:
  - exists:
      path: deleted.timestamp
```

`deleted.timestamp: { $exists: false }` treats a document as live whether `deleted` is absent, `null`, or an object without a timestamp — and excludes any real deletion stamp.

## Which modules use it

`activities` and `files` delete their own documents in-module. `companies` and `user-admin` filter on `deleted` in their reads but expect the host app to write the delete stamp. `contacts` applies the same predicate when it looks up companies, but does not currently filter its own contact reads on `deleted`. Wherever a module reads `deleted`, it uses the same field name, shape, and read predicate.
