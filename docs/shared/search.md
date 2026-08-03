---
title: Text search and the Atlas fallback
module: shared
type: shared
concepts: [atlas-search, search-fallback, storedSource, indexes]
---

# Text search and the Atlas fallback

Four modules put a free-text search box over a MongoDB collection. Atlas `$search` is the indexed, relevance-ranked way to serve it, and it only exists on Atlas — the `mongot` process is not part of a community or local `mongod`. So each of those modules takes an **`atlas_search`** var: leave it `true` and text search runs through Atlas `$search`; set it `false` and the same search runs as a case-insensitive `$regex` `$or` that works on any MongoDB.

Everything other than the free-text term — the structural filters, the consumer filter hooks, the sort, the pagination — is a plain `$match`/`$sort` in both modes. Only an actual text query diverges.

## Which surfaces do text search

| Module       | Surface                                          | Text paths searched                                      |
| ------------ | ------------------------------------------------ | -------------------------------------------------------- |
| `contacts`   | Contacts list page search box                    | `profile.name`, `lowercase_email`                        |
| `contacts`   | Contacts Excel export                            | `profile.name`, `lowercase_email`                        |
| `contacts`   | `contact-selector` typeahead (the rich selector) | `profile.name`, `lowercase_email`                        |
| `companies`  | Companies list page search box                   | the `name_field` var (default `name`), `lowercase_email` |
| `companies`  | Companies Excel export                           | the `name_field` var (default `name`), `lowercase_email` |
| `activities` | Activities list page search box                  | `title`, `description.text`                              |
| `deals`      | Deals list page search box                       | `name`, and the deal code via `_id`                      |

Two nearby surfaces behave differently, and both are worth knowing about:

- **`user-admin`'s members list takes no `atlas_search` var.** Its search is a plain-`$match` case-insensitive regex over the `name` and `email` fields that only exist on the row _after_ the members pipeline's `$lookup`s have flattened them, so it is **always** the unindexed regex path — on Atlas as well as on a local `mongod`. That is not an oversight and not a mode to switch: the fields it searches do not exist on any single collection's documents, so there is nothing for a search index to map. It composes its clauses the same way the searchable modules do, and it escapes the search term through the same shared code, so a `(` or a `.*` typed into the box is matched literally.
- **The `basic-contact-selector` has never used `$search`.** `get_contacts_for_selector` is a plain `$match` + `$sort`, so it works on any MongoDB regardless of the flag.

One further asymmetry: the **activities Excel export runs no text search at all.** It applies the list's structural filters (type, stage, contact, company, date range) but not the search term, in either mode. The contacts and companies exports do apply the term.

## The `atlas_search` var

```yaml
atlas_search:
  type: boolean
  default: true
```

`atlas_search` describes the **deployment's database**, not the module — it is the same answer for every searchable module in an app. Rather than repeat the literal on four module entries, hold it once in a shared config file and `_ref` it from each entry, so the app has a single source of truth for which mode it is in and one edit switches modes:

```yaml
# app_config.yaml
# Deployment capability, read by every searchable module entry.
atlas_search: true
```

```yaml
# lowdefy.yaml (or modules.yaml) — every searchable entry reads the same value
modules:
  - id: contacts
    source: "github:lowdefy/modules-mongodb/modules/contacts@v1.0.0"
    vars:
      atlas_search:
        _ref:
          path: app_config.yaml
          key: atlas_search
      # …the rest of the entry's vars
```

This does not make drift impossible — a newly added searchable module entry can still forget the `_ref` and fall back to the default `true`. It fails loudly rather than quietly, though: that module's first list-page load errors on the missing `$search` stage, and nothing stored is affected.

Because the var is a module var, a `false` value is resolved at **build** time and the entire Atlas mechanism is dropped from the compiled pipeline — no `$search` and no `$meta` operator survives into a request that runs against a plain `mongod`.

## What each mode does

**`atlas_search: true` — Atlas `$search`.**

- An indexed `$search` stage leads the pipeline, with a `text` clause for whole-token matching plus a `wildcard: *term*` clause for substring matching over the same paths.
- Results are **ordered by relevance**: the pipeline adds `score: { $meta: searchScore }` and sorts on it ahead of the configured field sort.
- The term is lowercased before it is sent, which is what makes the wildcard clause match the lowercase-stored `lowercase_email` paths.

**`atlas_search: false` — regex fallback.**

- The `$search` stage is gone. Text matching becomes an `$or` of `{ <path>: { $regex: <term>, $options: i } }` over the same paths, ANDed into the request's existing `$match`.
- **Substring semantics are identical** to the Atlas wildcard clause — `joh` still finds `John` — and the term is regex-escaped, so metacharacters typed into the search box (`(`, `.*`, `[`) are matched literally rather than compiled as a pattern.
- **There is no relevance ranking.** No `searchScore` exists, so results come back in the configured field sort — the same order the list uses when the search box is empty.
- **The regex is unanchored, so it is a collection scan.** A leading wildcard gives the query planner nothing to seek on, so the predicate is evaluated against every document the query's other `$and` clauses let through — and on these collections the unconditional clauses (a `hidden`/`disabled` exclusion, a soft-delete exclusion, a `removed: null`) let nearly everything through. On a large collection a keystroke-driven search therefore reads nearly every document in it.

Fallback mode is for **development, e2e runs, and small collections**. It is not a substitute for Atlas at scale, which is why the default is `true`.

## What is identical in both modes

- **With an empty search box no `$search` runs at all.** Every searchable request skips the text stage when the term is missing, `null`, or the empty string a cleared input leaves behind. So plain browse / filter / paginate is a `$match` + `$sort` against `mongod` on Atlas exactly as it is locally, and the only behaviour that differs between the two modes is what happens once someone has actually typed something.
- **Structural filters are plain `$match` clauses in both modes** — the unconditional exclusions, the list's own filter inputs, and the consumer hooks. That includes **`request_stages.filter_match`**, which is standard MongoDB query syntax and applies identically whichever mode the app is in.
- Sort, pagination, `$lookup`s and derived display fields are unchanged by the flag.

## Atlas Search index requirements

Wherever `atlas_search` is `true`, the search index is a **deployment prerequisite**: without it `$search` matches nothing and the search box silently returns no rows. The module documents the contract; **creating the index is the consuming app's job**, exactly as it is for regular `mongod` indexes. No index-definition files ship in the module tree.

The concrete field lists live on the per-module pages, which are the source of truth for what to map:

- [Contacts — Indexes](../contacts/reference/indexes.md)
- [Companies — Indexes](../companies/reference/indexes.md)
- [Activities — Indexes](../activities/reference/indexes.md)
- [Deals — Required indexes](../deals/index.md#required-indexes)

Two things hold across all four:

**The index is named `default`.** No `$search` stage in any module passes a non-default `index:` option — most omit the option entirely and `deals` names `default` explicitly — so Atlas resolves every one of them to the `default` index on that collection.

**Only the text fields are mapped, as `string`, under `dynamic: false`.** Because the structural filters run in a `$match` after `$search`, `mongot` never evaluates them and the index needs none of the `token`/`date`/`objectId` mappings a filters-inside-`$search` index would carry.

### Whole-document stored source on `user-contacts` and `companies`

The `contacts` and `companies` requests pass **`returnStoredSource: true`**, so `mongot` returns the matched documents from its own copy of them and `mongod` never re-reads the collection. Their index requirement is therefore `"storedSource": true` — **the whole document**, not a field list.

That is a correctness requirement, not a tuning choice. Every stage after `$search` reads the documents `mongot` returned, so **a field the index does not store is simply absent from them** — and the failure is silent, not an error:

- `hidden: { $ne: true }` stops excluding hidden documents, because a **missing field is not `true`**. Same for `disabled: { $ne: true }` and for `deleted.timestamp: { $exists: false }`, which becomes true of every returned document. Hidden, disabled and soft-deleted rows reappear in the list, the export, and the selector.
- Any **positive** filter — a `$in` scope, an equality, a consumer `request_stages.filter_match` clause — matches nothing, so the list comes back empty.
- The `$sort` inside `$facet` orders on an absent field, and the `$dateToString` that derives the display date columns blanks them.

`storedSource` also accepts an `{ "include": [...] }` / `{ "exclude": [...] }` form, and a hand-trimmed `include` list **reintroduces this failure every time** a column, an export field, a sort option, or a `filter_match` clause is added — and consumer-supplied clauses are ones the module cannot enumerate in advance. Storing the whole document removes the failure mode outright, which is why the documented contract is `true` rather than a list.

### Why `activities` and `deals` opt out of stored source

`get_activities` and `get_deals_list` pass **`returnStoredSource: false`**, and their documented index requirement carries no `storedSource` key at all.

The reason is **freshness**. `mongot` holds its own copy of each document and that copy lags writes. With `returnStoredSource: true`, a list refetched immediately after a write can show pre-edit values for any row the search term still matches. Both of these lists are refetched after **every** write — edit an activity or a deal and the list behind it reloads at once — so a stored-source read would routinely show the row as it was before the edit. Turning the flag off makes `mongot` return matched `_id`s and `mongod` hydrate the live documents from the collection.

**The cost, which is real.** Because the filters run after `$search`, `mongod` hydrates the **whole text-matched set** before the `$match` narrows it — so a term search pays a full-document lookup for every row it then discards. On `activities`, where the list's type / stage / contact / company / date-range filters can be far more selective than the term, that is a meaningful amount of wasted hydration. It is the price of freshness, and it is only paid when a term is present.

**The flag governs document _contents_, not which rows come back.** Which rows `$search` returns always depends on the `mongot` index, so a record created a moment ago is absent from a **term-filtered** list in either mode until the index catches up. With an empty search box there is no `$search` stage at all, so every list reads live from `mongod` regardless of the flag — which is the common case.

## Regular `mongod` indexes

Ordinary `mongod` indexes matter for two paths, both of which bypass `$search` entirely: the **no-term browse** on Atlas, and the **fallback's filter** in either search mode. They are normal indexes, left to the consuming app's index tooling in the same way the search index is; each module's index page lists them with `createIndex` snippets.

Roughly, per collection they cover:

| Collection      | Unconditional filter field(s)          | Sort fields the list offers                                       |
| --------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `user-contacts` | `hidden`, `disabled` (`$ne: true`)     | `updated.timestamp`, `created.timestamp`, `profile.name`, `email` |
| `companies`     | `deleted.timestamp` (`$exists: false`) | `updated.timestamp`, `created.timestamp`, the `name_field` path   |
| `activities`    | `deleted.timestamp` (`$exists: false`) | `updated.timestamp`, `created.timestamp`, `title`                 |
| `deals`         | `removed: null`                        | `updated.timestamp` (behind the relevance `score`)                |

`updated.timestamp` and `created.timestamp` recur because they are the default and secondary list orderings everywhere, and because `updated.timestamp` also carries the activities list's date-range filter — the one built-in predicate on these collections that bounds an indexed leading field.

**They serve the filter, not the sort.** Every list sorts **inside `$facet`**, which keeps the sort out of the query plan altogether: it runs in the aggregation layer as a blocking sort over the whole filtered set, and it loses the `$limit` pushdown a top-level sort would get. So **no index makes the sort cheaper, in either mode** — that cost is fixed by the pipelines' shape. What an index earns is the `$match`: where a query bounds an index's leading field the plan is `FETCH <- IXSCAN` rather than a collection scan.

**Be clear about what that buys.** An unfiltered browse — no term, no filter set — leaves only the unconditional exclusion in the `$match`, and that clause bounds none of these indexes' leading fields, so it is a collection scan feeding an in-memory sort whatever indexes exist. These indexes pay off for the reads that _do_ bound a sort field: the activities date-range browse, a consumer `request_stages.filter_match` clause, the contact selector's `filter` var, or a host app's own date- or name-ordered query over the collection. See the per-module pages for why leading a compound index with the unconditional exclusion is the wrong shape.

**Switching a deployment to `atlas_search: false` without these indexes gives performance acceptable only at small scale.** And note they do not make fallback _text_ search fast — nothing does; an unanchored regex has no index to use. What they narrow is the filtered read the regex then runs against.

## The `companies.name_field` coupling

`companies` searches **`_module.var: name_field`**, not a literal `name`. The documented index maps the default, `name`. **A consumer who overrides `name_field` must map their field in the `default` search index instead, and redeploy that index to Atlas.**

Skipping it fails in a way that is easy to misread, because it is mode-dependent. With `dynamic: false`, an unmapped path is simply not searchable and Atlas raises no error — `$search` silently returns no text matches on the overridden field. The regex fallback reads the var at query time and needs no index, so the identical search still works with `atlas_search: false`. The symptom is "search by company name works locally and returns nothing in production", with nothing in either deployment's logs to explain it.

The same override moves the `Name` sort option's field, so the regular `mongod` index on that path follows `name_field` too.

## `request_stages.filter_match`

`contacts`, `companies` and `activities` expose `request_stages.filter_match` — an **array** of clauses ANDed into the list-page and Excel-export filter. (`user-admin` exposes one too, over its post-`$lookup` member rows.) Each element is a **plain MongoDB query clause**:

```yaml
request_stages:
  filter_match:
    - region: "x"
    - score: { $gte: 10 }
```

Clauses are composed into the `$match` as a top-level **`$and`** array rather than merged into one object, so no two of them can collide on a key — a clause using `$or` is safe and will not collide with the fallback's own `$or`. The same clauses apply in **both** search modes.

**Migrating from Atlas-compound syntax.** Earlier versions of `contacts`, `companies` and `activities` documented this var as Atlas Search `compound` clauses, spliced inside `$search`. Rewrite each clause in MongoDB query syntax:

```yaml
# before (Atlas-compound clauses)
- equals: { path: region, value: "x" }
- range: { path: score, gte: 10 }
# after (plain $match clauses — still an array, ANDed via $and)
- region: "x"
- score: { $gte: 10 }
```

The var **stays an array** — only each element's syntax changes — and the default `[]` is unaffected, so an app that never set it has nothing to do.
