---
title: Expected indexes
module: ai-reporting
type: reference
concepts: [indexes, performance, blocking-sort, esr]
---

# Expected indexes

Reporting owns its two collections rather than querying yours, so it is the only party in a position to say what they need indexing on — and the reports list carries the [authorization boundary](../concepts/ownership.md#the-five-list-scopes), so every list open runs its scope match against the full collection.

**Nothing in this repo creates an index.** The module documents what the reads want; the host app creates them. This is the same split as `search_contacts` in the contacts module.

## What the reads want

Field order follows **equality, then sort, then range** — a non-point predicate ahead of the sort key means the index scan is not ordered by it.

| Collection    | Index                                                     | Serves                                  |
| ------------- | --------------------------------------------------------- | --------------------------------------- |
| reports       | `owner.user_id`, `updated.timestamp`, `deleted.timestamp` | Mine, and the deleted scope             |
| reports       | `visibility`, `updated.timestamp`, `deleted.timestamp`    | Shared and `all` — the unbounded scopes |
| reports       | `favourite_of`                                            | The Favourites scope                    |
| reports       | `conversation_id`                                         | The report ↔ chat link                  |
| conversations | `owner.user_id`, `updated.timestamp`, `deleted.timestamp` | The chat rail                           |

The collection names come from the [`reports_collection` and `conversations_collection`](vars.md) vars.

## Retention: TTL indexes

Conversations are kept for a fixed period from when they started, then removed by a TTL index. `expireAfterSeconds` is `retention_days` × 86400; 7776000 is the default 90 days.

| Collection    | TTL index                                                   | Removes                                     |
| ------------- | ----------------------------------------------------------- | ------------------------------------------- |
| conversations | `{ 'created.timestamp': 1 }`, `expireAfterSeconds: 7776000` | Each conversation, 90 days after it started |
| `ai_usage`    | `{ timestamp: 1 }`, `expireAfterSeconds: 7776000`           | Token usage rows, after the same period     |

```js
db.getCollection("<conversations collection>").createIndex(
  { "created.timestamp": 1 },
  { expireAfterSeconds: 7776000 },
);
```

**On `created.timestamp`, not `created`.** `created` is a change stamp object (`{ timestamp, user }`), and a TTL index on a field that is not a Date never removes anything. Every writer that can create a conversation (`save-conversation` and `set-conversation-title`) stamps `created.timestamp` as a Date.

**On creation, not last activity.** Every turn's save and every title write move `updated`, so a TTL on `updated.timestamp` would never remove a conversation still in use, and its oldest messages would outlive the period the notice states. A conversation still in use is removed when its period runs out, and the person starts a new one.

**Replace, don't add.** Replace any TTL index the collection already has rather than adding this one beside it. Each TTL index removes rows on its own, so an older one keeps deleting on its own schedule and the stated period stops being the real one. An existing index on the same key with another period is changed with `collMod`, or dropped and created again; creating it with a new `expireAfterSeconds` fails.

**Delete.** Deleting a conversation clears its `messages`, `data_parts` and `title` in the same write that stamps `deleted`, and leaves the empty row for the TTL. The writers (`save-conversation`, `set-conversation-title` and `emit-data-parts`) skip a deleted row, so a reply that finishes after the delete writes nothing back. Saved reports are not chats: they keep their soft delete and no TTL.

## The caveat that matters more than the table

**These serve the `$match`, not the default sort, and the default sort cannot be indexed at all.**

The list's default order is favourite-first, then most recently updated. `is_favourite` is not a stored field — it is computed per viewer from the `favourite_of` array in an `$addFields` stage — and a `$sort` on a field produced by `$addFields` can never use an index. So **favourite-first ordering is a blocking in-memory sort in every scope.** (`list-reports` returns the whole scope in one read — it does not `$skip` / `$limit`-page — so the sort runs over the entire matched set.)

This is documented rather than fixed, because the cost depends entirely on the scope:

- On `mine`, `favourites` and `deleted` the `$match` narrows to one user's reports first, so sorting tens of documents in memory costs nothing.
- On `shared` and `all` it is unbounded — those scopes match on a property of the _report_ rather than on the viewer. Hence their own index row above, and hence the warning: a blocking sort has a memory ceiling above which it **errors rather than slows**.

A **caller-supplied sort replaces the default outright** rather than nesting under favourites, and one of those _is_ indexable. That is a second, smaller argument for the replacement rule — the first being that a starred report floating above a title sort makes the sort control look broken.

## Search is `$regex`, not Atlas Search

`search` matches `title` and `description` with a case-insensitive `$regex`, with the term escaped so a user typing `(` matches literally rather than forming a pattern.

Not Atlas Search: the set being searched is already scope-filtered and paged, so ranking buys little while an Atlas requirement would cost every consumer of the module. Not the spec either — a report's pipelines and field names are not text the user wrote, so matching them would return reports whose visible text has nothing to do with the term.

Atlas remains available on the contacts-module pattern if a real case appears. The fields searched do not change either way.
