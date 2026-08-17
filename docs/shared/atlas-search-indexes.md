---
title: Atlas Search Indexes
module: shared
type: shared
concepts: [atlas-search, indexes, organization_id, tenant-wall, storedSource]
---

# Atlas Search Indexes

The `$search`-led list pipelines, the Excel exports, and the ContactSelector all
require **Atlas Search indexes the host app must create** — the modules create
no indexes ([org-scoping](org-scoping.md)). Every requirement is
**fail-closed**: a missing index, a missing `token` mapping, or a missing
`storedSource` entry never leaks data — it silently blanks the page. If a list
page shows nothing while the collection has data, start here.

**Index name: `default`** everywhere — no `$search` stage names an index, so
Atlas resolves them all to `default`. Create them in the Atlas UI (Search →
Create Search Index → JSON editor) or via the Atlas CLI.

## The definitions live with each module

Each module owns the complete definition for its own collection, derived from
its own pipelines and versioned with it:

| Collection      | Definition                                                     |
| --------------- | -------------------------------------------------------------- |
| `user-contacts` | [contacts → Indexes](../contacts/reference/indexes.md)         |
| `companies`     | [companies → Indexes](../companies/reference/indexes.md)       |
| `activities`    | [activities → Indexes](../activities/reference/indexes.md)     |
| `deals`         | [deals → Required indexes](../deals/index.md#required-indexes) |

Those pages are the source of truth for the mappings, the `storedSource`
contract, and the regular `mongod` indexes. This page covers only what is
common to all of them: why the organization mapping is there and what happens
without it.

## Why every index carries an organization mapping

The `$search` stage is **unconditional** wherever `atlas_search` is `true` — it
runs on every list load, term or no term. [Search](search.md) explains why: the
`tenant: authored` declaration is static per request while the search term is
runtime, so a conditionally-emitted `$search` would be refused on the browse
path.

Because the stage always runs, its `compound.filter` always carries exactly one
organization clause, and that clause needs an index mapping:

- Under `auth.organizations.policy: tenant` it is a string `equals` on
  `organization_id` — the authored tenant clause the wall audits against the
  caller's organization on every run. String `equals` requires a **`token`**
  mapping specifically; neither `dynamic: true` nor `dynamic: false` creates
  one, so every definition lists `organization_id` explicitly.
- Under `pinned` it is `exists` on `_id` — a match-all that narrows nothing,
  present only because **Atlas refuses a compound whose clause lists are all
  empty**. Being a `filter` rather than a `should`, it cannot affect relevance
  scoring. It needs `_id` to be indexed, which the per-module definitions
  cover.

**Map `organization_id` regardless of the policy the app runs today.** It is
inert under `pinned`, and an index missing it blanks every list page the moment
a deployment flips to `tenant` — silently, with nothing in the logs.

On the `returnStoredSource` collections (`user-contacts`, `companies`)
`organization_id` must also be _stored_, which whole-document
`"storedSource": true` covers. `activities` and `deals` pass
`returnStoredSource: false`, so they store nothing.

## When an app's configuration changes the requirements

The per-module definitions match the modules as shipped. Three vars extend the
pipelines, and extending them extends the index:

- **`request_stages.filter_match`** (contacts, companies, activities) splices
  app-authored clauses into the post-`$search` `$match`. Because those clauses
  are plain MongoDB query syntax evaluated by `mongod`, they need no search
  mapping — but on a `returnStoredSource` collection any path such a clause
  _reads_ must be stored, which whole-document stored source covers.
- **`companies.name_field`** (default `name`): overriding it moves the searched
  string, so the mapping and the `Name` sort index follow it.
- **`components.table_columns` / `download_columns`** (contacts, companies):
  extra columns read extra document paths. On the `returnStoredSource`
  collections those paths must be stored, or the new column renders empty.

_Fail-closed symptom table_: blank list page with data present → missing index,
or a missing `token` mapping on `organization_id` under `tenant`; a single column
empty → missing `storedSource` entry; text search finds nothing while filters
work → the searched path is unmapped; `"compound" must have at least one
clause` → the organization clause is missing from `compound.filter`.
