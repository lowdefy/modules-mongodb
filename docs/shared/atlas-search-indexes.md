---
title: Atlas Search Indexes
module: shared
type: shared
concepts: [atlas-search, indexes, organizationId, tenant-wall, storedSource]
---

# Atlas Search Indexes

The `$search`-led list pipelines (contacts, companies, activities), the Excel
exports, and the ContactSelector all require **Atlas Search indexes the host
app must create** — the modules create no indexes ([org-scoping](org-scoping.md)).
Every requirement here is **fail-closed**: a missing index, a missing `token`
mapping, or a missing `storedSource` entry never leaks data — it silently
blanks the page. If a list page shows nothing while the collection has data,
start here.

Each index below is the complete definition derived from the module pipelines.
Create them in the Atlas UI (Search → Create Search Index → JSON editor) or
via the Atlas CLI. **Index name: `default`** (the pipelines do not pass an
`index` option, so Atlas uses the index named `default`).

The recipe is `dynamic: true` plus static overrides for the fields that need
them: dynamic mapping covers every `text`/`wildcard` string, boolean `equals`,
date `range`, and `exists` path automatically — but **never creates `token`
fields**, which string `equals` requires. Every walled collection filters
`organizationId` by string `equals` (the authored tenant clause), so every
index carries at least that one static mapping.

## `user-contacts`

Serves `get_all_contacts`, `search_contacts` (ContactSelector), and the
contacts Excel export. These use `returnStoredSource: true`, so post-`$search`
stages only see stored fields — the `storedSource` list is load-bearing:

```json
{
  "mappings": {
    "dynamic": true,
    "fields": {
      "organizationId": { "type": "token" }
    }
  },
  "storedSource": {
    "include": [
      "organizationId",
      "hidden",
      "disabled",
      "email",
      "lowercase_email",
      "profile.name",
      "profile.picture",
      "profile.department",
      "profile.job_title",
      "profile.work_phone",
      "profile.mobile_phone",
      "global_attributes.company_ids",
      "updated.timestamp",
      "created.timestamp"
    ]
  }
}
```

## `companies`

Serves `get_all_companies` and the companies Excel export
(`returnStoredSource: true` — `storedSource` is load-bearing):

```json
{
  "mappings": {
    "dynamic": true,
    "fields": {
      "organizationId": { "type": "token" }
    }
  },
  "storedSource": {
    "include": [
      "organizationId",
      "deleted.timestamp",
      "name",
      "short_name",
      "description",
      "lowercase_email",
      "updated.timestamp",
      "created.timestamp"
    ]
  }
}
```

## `activities`

Serves `get_activities`. No `returnStoredSource`, so no `storedSource` block —
but the filter dropdowns use string `equals` on several fields, which all need
`token` mappings (`status` and `contacts` are arrays of documents, mapped as
`document` with `token` children):

```json
{
  "mappings": {
    "dynamic": true,
    "fields": {
      "organizationId": { "type": "token" },
      "type": { "type": "token" },
      "company_ids": { "type": "token" },
      "status": {
        "type": "document",
        "fields": { "stage": { "type": "token" } }
      },
      "contacts": {
        "type": "document",
        "fields": { "contact_id": { "type": "token" } }
      }
    }
  }
}
```

## When an app's configuration changes the requirements

These definitions match the modules as shipped. Three vars extend the
pipelines, and extending them extends the index:

- **`request_stages.filter_match`** (contacts, companies, activities) splices
  app-authored clauses into the `$search` compound. Any path such a clause
  searches must be indexed — dynamic mapping covers most operators, but a
  string `equals` needs its own `token` mapping, and on
  `returnStoredSource` collections any path a spliced clause *reads
  post-search* must join `storedSource`.
- **`companies.name_field`** (default `name`): overriding it moves the
  searched string and the `storedSource` entry — replace `name` above with
  the configured field.
- **`components.table_columns` / `download_columns`** (contacts, companies):
  extra columns read extra document paths. On the `returnStoredSource`
  collections those paths must be added to `storedSource`, or the new column
  renders empty.

_Fail-closed symptom table_: blank list page with data present → missing
`token` mapping on `organizationId` or missing index; a single column empty →
missing `storedSource` entry; filter dropdown never matches → missing `token`
mapping for that filter's field.
