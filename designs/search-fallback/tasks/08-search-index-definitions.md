# Task 8: Document the index requirements for the four searchable modules

## Context

The modules have always depended on Atlas Search indexes that **no module documents**. Seven requests run `$search`, five of them with `returnStoredSource: true`, and nothing tells a fresh Atlas project what to create. That matters most for stored source, which fails _silently_ when the index does not store a field a post-`$search` `$match` references: the returned documents lack it, so `hidden: { $ne: true }` stops excluding hidden documents (missing ≠ `true`) and positive filters exclude everything. `search_contacts` has this exposure today.

**Use the repo's existing convention — do not commit index-definition files.** The convention is to document the contract and leave creation to the app:

- `docs/user-account/reference/indexes.md` and `docs/workflows/reference/indexes.md` — per-module index reference pages. They open with the module-creates-nothing statement, then give each index its `createIndex` snippet, the query sites that need it, and why it is shaped the way it is.
- `docs/deals/index.md`'s `## Required indexes` section states the division of labour: "The module documents the contract; the app owns creating them (e.g. under its own `actions/indexes/indexes/{app}/deals/` via `splice-actions`)." It already documents the `deals` search index in prose — that paragraph predates this design's restructure and this task **corrects** it.

Design decision 5 covers why files are the wrong shape here: a second mechanism for one job, inconsistent with the regular-`mongod`-index half of the same decision, and `splice-actions`' tree is `indexes/{project}/{collection}/{name}.json` where `{project}` is per-app — so a file from this repo could never be copied verbatim anyway. Documenting also avoids asserting anything about that tool's accepted schema: its reference documents `{ name, mappings }` only, and whether its writer forwards `storedSource` is not verifiable from this repo. `storedSource` is documented as a **requirement of the index**, which the app satisfies with whatever tooling it has.

## Task

Add or extend a per-module index reference for each of the four searchable modules, matching the structure and tone of `docs/user-account/reference/indexes.md`. Where a module already has a `## Required indexes` section in its `index.md` (`deals`), extend and correct that rather than starting a competing page; where it has neither, add `docs/{module}/reference/indexes.md` and link it from the module's `index.md`.

Each module's search-index entry states: the index name (**`default`**), the collection it applies to, the mapped fields, whether whole-document stored source is required, and which requests depend on it.

**Common to all four:** `dynamic: false`, and **only the text fields** mapped as `string`. Because tasks 2–7 move every structural filter out of `$search` into a plain `$match`, none of the `token` mappings a filters-in-`$search` index would need are required. Name the index `default` — no `$search` stage specifies a non-default `index:` (most omit the option; `get_deals_list` passes `index: default` explicitly, which task 7 drops as redundant).

**`contacts`** — the mapped `user-contacts` collection; `profile.name` and `lowercase_email`. Serves `get_all_contacts`, `get_contact_excel_data`, and the `search_contacts` typeahead. **Whole-document stored source required**, because all three query with `returnStoredSource: true` and then `$match` on fields the mappings do not include. Include the illustrative block:

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

State that this index is **not** needed by `user-admin`, which reads the same collection but no longer uses `$search`.

**`companies`** — `companies`; `name` (the `name_field` default) and `lowercase_email`; whole-document stored source required. Document the **`name_field` coupling**: `get_all_companies` searches `_module.var: name_field`, so a consumer who overrides it must map their field instead, or Atlas `$search` silently returns no text matches on it while the regex fallback — which reads the var at query time — still works, giving a mode-dependent discrepancy.

**`activities`** — `activities`; `title` and `description` as a document with a `text` string child (the Tiptap plain-text subpath). **No stored source**: `get_activities` passes `returnStoredSource: false` (decision 3), so nothing reads `mongot`'s copy and storing documents would cost index storage for a path no query takes. Say why, so the asymmetry with contacts/companies does not read as an oversight.

**`deals`** — `deals`; `name`, plus `_id` with a `keywordAnalyzer` multi, because `get_deals_list` searches the deal code through `path: { value: _id, multi: keywordAnalyzer }`:

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
  }
}
```

No stored source, same reason as `activities`. The existing paragraph in `docs/deals/index.md` describes the pre-restructure requirement — rewrite it to the above; do not leave both.

**Regular `mongod` indexes** go on the same pages, in the same style, since the browse path (no term → no `$search`, decision 2) and the fallback's filter/sort both need them: the unconditional filter fields (`hidden`, `disabled` on `user-contacts`; `deleted.timestamp` on `companies` and `activities`; `removed` on `deals`), each list's configured sort fields, and `updated.timestamp` / `created.timestamp`. State that switching a deployment to `atlas_search: false` without them means performance acceptable only at small scale.

**Versioning.** Each page states that the requirement is versioned with the module — the narrowed mappings are correct only from the version where filters move into `$match` — and that the CHANGELOG records this version changing it, so a consumer upgrading knows to update their cluster's index and someone on an older version reads that version's docs.

## Acceptance Criteria

- Each of `contacts`, `companies`, `activities`, `deals` documents its `default` search index: name, collection, mapped fields, stored-source requirement, and dependent requests.
- Every field any `$search` stage searches after tasks 2–7 is covered: `profile.name` + `lowercase_email` (contacts), `name` + `lowercase_email` (companies), `title` + `description.text` (activities), `name` + `_id` with the `keywordAnalyzer` multi (deals).
- Stored source is documented as required for `contacts`/`companies` and explicitly **not** required for `activities`/`deals`, with the reason.
- No `token` mappings for filter fields appear anywhere — the filters are `$match` clauses now.
- `docs/deals/index.md`'s existing search-index paragraph is corrected, not duplicated.
- Regular `mongod` indexes are documented per module, with the small-scale-only caveat for fallback mode.
- No `.search.json` files are added anywhere in `modules/`.
- Front-matter is valid and `pnpm docs:gen` leaves no drift (`pnpm docs:check` passes).

## Files

- `docs/contacts/reference/indexes.md` — create (or extend an existing index section if one is added first).
- `docs/companies/reference/indexes.md` — create.
- `docs/activities/reference/indexes.md` — create.
- `docs/deals/index.md` — modify — correct and extend `## Required indexes`, including the search-index paragraph.
- `docs/{contacts,companies,activities}/index.md` — modify — link the new reference page.

## Notes

- Creating the indexes on a cluster stays the consuming app's job; this repo documents the contract. That is already how the regular indexes work — do not introduce a different arrangement for search indexes.
- `docs/shared/search.md` (task 10) is the shared concept page for the flag and the fallback. It should point at these per-module pages for the concrete field lists rather than repeating them, so there is one place per module to update.
- Do not add source-side READMEs under `modules/*/` for this. Repo convention is that source-side READMEs are stubs pointing into `docs/`.
