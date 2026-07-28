# Task 8: Commit the Atlas Search index definitions

## Context

The modules have always depended on Atlas Search indexes that **no file in this repo describes**. Seven requests run `$search`, five of them with `returnStoredSource: true` (all seven after tasks 2–7), and nothing tells a fresh Atlas project what to create. Worse, `returnStoredSource` combined with an incomplete `storedSource` config fails _silently_: post-`$search` `$match` stages see documents missing fields, so a `hidden: { $ne: true }` filter stops excluding hidden documents (missing ≠ `true`) and positive filters exclude everything. `search_contacts` already has this exposure today.

This task commits one index definition per searchable collection, in the `@mrmtech/splice-actions` ensure-index search-index format — a single JSON object `{ name, mappings, storedSource }`, filename `default.search.json`. The index is named **`default`** because none of the `$search` stages specify an `index:` option, so Atlas resolves the index named `default`.

Two decisions shape the content:

- **`storedSource: true`** (store the whole document), not an `include` list. It is the simplest correct default and eliminates the missing-field footgun outright, at the cost of extra index storage. An `include` list would have to be re-audited every time a consumer adds a table column, an export column, or a `filter_match` clause.
- **Mappings only need the text fields**, as `string`. Because tasks 2–7 move every structural filter out of `$search` into a plain `$match`, none of the `token` mappings a filters-in-`$search` index would need are required.

## Task

Create four files:

**`modules/contacts/search-indexes/default.search.json`** — collection `user-contacts`, serving `get_all_contacts`, `get_contact_excel_data`, and the `search_contacts` typeahead:

```json
{
  "name": "default",
  "mappings": {
    "dynamic": false,
    "fields": {
      "profile": {
        "type": "document",
        "fields": { "name": { "type": "string" } }
      },
      "lowercase_email": { "type": "string" }
    }
  },
  "storedSource": true
}
```

**`modules/companies/search-indexes/default.search.json`** — collection `companies`, mapping `name` (the `name_field` default) and `lowercase_email`, same `dynamic: false` + `storedSource: true` shape.

**`modules/activities/search-indexes/default.search.json`** — collection `activities`, mapping `title` and `description` as a document with a `text` string child (the Tiptap plain-text subpath), same shape.

**`modules/deals/search-indexes/default.search.json`** — collection `deals`, mapping `name` **and `_id` with a `keywordAnalyzer` multi**, because `get_deals_list` searches the deal code via `path: { value: _id, multi: keywordAnalyzer }`:

```json
{
  "name": "default",
  "mappings": {
    "dynamic": false,
    "fields": {
      "name": { "type": "string" },
      "_id": {
        "type": "string",
        "multi": {
          "keywordAnalyzer": { "type": "string", "analyzer": "lucene.keyword" }
        }
      }
    }
  },
  "storedSource": true
}
```

Each file gets a short sibling `README.md` **only if** the module has no other place to say which collection the index belongs to; otherwise leave the collection binding to the docs (task 10). Prefer documentation over per-directory READMEs — repo convention is that source-side READMEs are stubs pointing into `docs/`.

## Acceptance Criteria

- Four `search-indexes/default.search.json` files exist, one per searchable module, each valid JSON with `name: "default"` and `storedSource: true`.
- Every field any `$search` stage searches after tasks 2–7 is mapped: `profile.name` + `lowercase_email` (contacts), `name` + `lowercase_email` (companies), `title` + `description.text` (activities), `name` + `_id` with the `keywordAnalyzer` multi (deals).
- No `token` mappings for filter fields — the filters are `$match` clauses now.
- `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b` succeeds (these files are not read by the Lowdefy build; the check confirms nothing was broken).
- `python3 -c "import json,glob; [json.load(open(f)) for f in glob.glob('modules/*/search-indexes/*.json')]"` runs clean.

## Files

- `modules/contacts/search-indexes/default.search.json` — create.
- `modules/companies/search-indexes/default.search.json` — create.
- `modules/activities/search-indexes/default.search.json` — create.
- `modules/deals/search-indexes/default.search.json` — create.

## Notes

- These files are **not** consumed by the Lowdefy build — they are input to the consuming app's index tooling. Running them against a cluster stays the app's job; this repo only commits the definitions.
- The companies definition is static and maps `name`. A consumer who overrides `name_field` must regenerate it to map their field; otherwise Atlas `$search` silently returns no text matches on the overridden field while the regex fallback still works, producing a mode-dependent discrepancy. The index JSON is deliberately not templated on the var — it is consumed by external tooling, not the Lowdefy build, so there is no clean templating hook. Task 10 documents the obligation.
- Regular `mongod` indexes are **not** committed here — they are normal indexes left to the consuming app's tooling, and are documented in task 10 (the fields the no-term browse path and the fallback filter/sort need: `hidden`, `disabled`, `deleted.timestamp`, `removed`, `updated.timestamp`, `created.timestamp`, and each module's configured sort fields).
