---
title: Expected indexes
module: reporting
type: reference
concepts: [indexes, performance, blocking-sort, esr]
---

# Expected indexes

Reporting owns its two collections rather than querying yours, so it is the only party in a position to say what they need indexing on — and the reports list carries the [authorization boundary](../concepts/ownership.md#the-five-list-scopes), so every list open runs its scope match against the full collection.

**Nothing in this repo creates an index.** The module documents what the reads want; the host app creates them. This is the same split as `search_contacts` in the contacts module.

## What the reads want

Field order follows **equality, then sort, then range** — a non-point predicate ahead of the sort key means the index scan is not ordered by it.

| Collection      | Index                                                       | Serves                                  |
| --------------- | ----------------------------------------------------------- | --------------------------------------- |
| reports         | `owner.user_id`, `updated.timestamp`, `deleted.timestamp`    | Mine, and the deleted scope             |
| reports         | `visibility`, `updated.timestamp`, `deleted.timestamp`       | Shared and `all` — the unbounded scopes |
| reports         | `favourite_of`                                              | The Favourites scope                    |
| reports         | `conversation_id`                                           | The report ↔ chat link                  |
| conversations   | `owner.user_id`, `updated.timestamp`                        | The chat rail                           |

The collection names come from the [`reports_collection` and `conversations_collection`](vars.md) vars.

## The caveat that matters more than the table

**These serve the `$match`, not the default sort, and the default sort cannot be indexed at all.**

The list's default order is favourite-first, then most recently updated. `is_favourite` is not a stored field — it is computed per viewer from the `favourite_of` array in an `$addFields` stage — and a `$sort` on a field produced by `$addFields` can never use an index. Nor can `$skip` / `$limit` inside a `$facet`, which is how paging works. So **favourite-first ordering is a blocking in-memory sort in every scope.**

This is documented rather than fixed, because the cost depends entirely on the scope:

- On `mine`, `favourites` and `deleted` the `$match` narrows to one user's reports first, so sorting tens of documents in memory costs nothing.
- On `shared` and `all` it is unbounded — those scopes match on a property of the *report* rather than on the viewer. Hence their own index row above, and hence the warning: a blocking sort has a memory ceiling above which it **errors rather than slows**.

A **caller-supplied sort replaces the default outright** rather than nesting under favourites, and one of those *is* indexable. That is a second, smaller argument for the replacement rule — the first being that a starred report floating above a title sort makes the sort control look broken.

## Search is `$regex`, not Atlas Search

`search` matches `title` and `description` with a case-insensitive `$regex`, with the term escaped so a user typing `(` matches literally rather than forming a pattern.

Not Atlas Search: the set being searched is already scope-filtered and paged, so ranking buys little while an Atlas requirement would cost every consumer of the module. Not the spec either — a report's pipelines and field names are not text the user wrote, so matching them would return reports whose visible text has nothing to do with the term.

Atlas remains available on the contacts-module pattern if a real case appears. The fields searched do not change either way.
