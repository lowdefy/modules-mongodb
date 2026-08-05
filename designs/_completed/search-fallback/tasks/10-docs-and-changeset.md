# Task 10: Documentation, generated var docs, and changeset

## Context

`docs/` is the source of truth for consumer-observable authoring behaviour, and this design changes three consumer-visible things:

1. A new `atlas_search` var on four modules, with real operational consequences (unindexed scan, no relevance ranking).
2. A **breaking change** to `request_stages.filter_match` in `contacts`, `companies`, and `activities` — Atlas-compound clauses become plain `$match` clauses.
3. A newly documented deployment requirement: the per-module Atlas Search index contract (with `storedSource: true` where the requests read the stored copy) and the regular `mongod` indexes the browse and fallback paths need. No definition files are committed — the module documents the contract, the app creates the indexes (design decision 5, task 8).

`docs/shared/` holds one file per cross-cutting consumer idiom (`change-stamps.md`, `event-display.md`, `slots.md`, `soft-delete.md`, `app-name.md`, `avatar-colors.md`, `secrets.md`), each opening with the front-matter block defined in `docs/CONTRIBUTING.md`. `docs/{module}/reference/vars.md` and `docs/llms.txt` are **generated** — `pnpm docs:gen` regenerates both from the manifests, and `pnpm docs:check` fails CI on drift.

## Task

### 1. New shared concept page — `docs/shared/search.md`

Front matter:

```yaml
---
title: Text search and the Atlas fallback
module: shared
type: shared
concepts: [atlas-search, search-fallback, storedSource, indexes]
---
```

Cover, in this order:

- **Which surfaces do text search** — the contacts / companies / activities / deals list pages, their Excel exports, and the rich contact-selector typeahead. Note that `user-admin`'s members list searches with a plain-`$match` regex over the post-`$lookup` name/email fields and is therefore always unindexed, on Atlas as well; and that the `basic-contact-selector` never used `$search`.
- **The `atlas_search` var** — boolean, default `true`, set on every searchable module entry. Show the recommended wiring: one value in the app's `app_config.yaml`, `_ref`'d from each entry, so the app has a single source of truth for which mode it is in. Include a worked snippet of both the config file and one entry.
- **What each mode does.** Atlas: indexed `$search`, substring via `wildcard *term*`, results ordered by relevance (`$meta: searchScore`). Fallback: a case-insensitive `$regex` `$or` over the same fields — identical substring semantics, **no relevance ranking** (results use the configured field sort), and an **unanchored regex, so a collection scan**. Suitable for development and small collections; not a substitute for Atlas at scale.
- **What is identical in both modes.** When the search box is empty no `$search` runs at all, so browse / filter / paginate is `$match` + `$sort` everywhere. Only an actual text query diverges. Structural filters, including `request_stages.filter_match`, are plain `$match` in both modes.
- **Atlas Search index requirements.** Point at the per-module index reference pages (task 8) for the concrete field lists rather than repeating them here; state the index name is `default` because no pipeline passes a non-default `index:` option; explain `returnStoredSource: true` + whole-document stored source and **why it is required** on `user-contacts` and `companies`. Document the footgun prominently: if `storedSource` omits a field a post-`$search` `$match` references, the returned documents silently lack it — `hidden: { $ne: true }` stops excluding hidden documents (missing ≠ `true`) and positive filters exclude everything. Storing the whole document removes the failure mode; a hand-trimmed `include` list reintroduces it every time a column, export field, or `filter_match` clause is added.
- **Why `activities` and `deals` opt out of stored source**, stated once here rather than in two module pages. `mongot` holds its own copy of each document and it lags writes, so with `returnStoredSource: true` a list refetched immediately after a write can show pre-edit values for rows a search term still matches. Both of those lists are refetched after every write, so their requests pass `returnStoredSource: false` and their documented index requirement carries no `storedSource` key. The cost, which readers should know: `mongod` then hydrates the whole text-matched set before the `$match` narrows it, so a term search pays a full-document lookup for rows it goes on to discard. Note the flag governs document _contents_ only — which rows `$search` returns always depends on the `mongot` index, so a newly created record is absent from a term-filtered list in either mode, and with an empty search box no `$search` runs so every mode reads live.
- **Regular `mongod` indexes**, per collection, needed for the no-term browse path on Atlas _and_ for the fallback's filter. They serve the **filter**, not the sort: every list sorts inside `$facet`, which keeps the sort out of the query plan and loses the `$limit` pushdown a top-level sort would get, so no index makes the sort cheaper in either mode (decision 3). Cover the unconditional filter fields (`hidden`, `disabled` on `user-contacts`; `deleted.timestamp` on `companies` and `activities`; `removed` on `deals`), the sort fields each list offers, and `updated.timestamp` / `created.timestamp`. State plainly that these are normal indexes left to the consuming app's index tooling, and that switching a deployment to `atlas_search: false` without them means acceptable-only-at-small-scale performance.
- **The `companies.name_field` coupling.** Overriding `name_field` means mapping that field in the `default` search index instead of `name`, and redeploying the index to Atlas. Otherwise Atlas `$search` silently returns no text matches on the overridden field while the regex fallback — which reads the var at query time — still works, so the two modes disagree.
- **Migrating `request_stages.filter_match`** — the breaking change, with the before/after example:

  ```yaml
  # before (Atlas-compound clauses)
  - equals: { path: region, value: "x" }
  - range: { path: score, gte: 10 }
  # after (plain $match clauses — still an array, ANDed via $and)
  - region: "x"
  - score: { $gte: 10 }
  ```

  Note the var stays an array, the clauses are composed with `$and` (so a clause using `$or` is safe and won't collide with the fallback's `$or`), the default `[]` is unaffected, and the same syntax now works in both modes.

### 2. Link it from the module landing pages

Add a bullet to the "Shared idioms" list in `docs/contacts/index.md`, `docs/companies/index.md`, `docs/activities/index.md`, and `docs/deals/index.md`:

```markdown
- [Text search and the Atlas fallback](../shared/search.md) — the `atlas_search` flag, index requirements, and what the fallback trades away
```

Also add it to `docs/user-admin/index.md`, with wording that says user-admin needs **no** flag because its members search is always a plain-`$match` regex — a reader comparing modules will otherwise assume an omission.

### 3. Regenerate the generated files

Run `pnpm docs:gen`, which rewrites `docs/{module}/reference/vars.md` from the manifests and `docs/llms.txt`. Do not hand-edit either. Confirm with `pnpm docs:check`.

### 4. Changeset

Add `.changeset/search-atlas-fallback.md` bumping the four module packages — `@lowdefy/modules-mongodb-contacts`, `-companies`, `-activities`, `-deals` — plus `-user-admin` for task 11. Lead with the breaking `filter_match` change (it is what a consumer must act on), then the new `atlas_search` var, then the search-index requirement — stating explicitly that **this version changes the Atlas Search index contract**, so a consumer upgrading must update their cluster's index to match the requirement documented in the version they move to (the mappings narrow to text fields only, and `storedSource` changes per collection). Give `user-admin` one non-breaking line: its members search now treats regex metacharacters in the search box as literals (previously a `(` errored and `.*` matched everything), and its filter stage composes clauses with `$and`. Follow the shape of `.changeset/app-operator-slug-migration.md`: a bolded one-line summary of the break, then a "Migration for consumers" list.

Cover in the migration list: rewrite any `request_stages.filter_match` clauses in Mongo query syntax; set `atlas_search: false` on each searchable module entry for a non-Atlas deployment; create the `default` search indexes per the module index references (whole-document stored source on `user-contacts` and `companies`, none on `activities` and `deals`), remapping the companies one if `name_field` is overridden; add the regular `mongod` indexes before running the fallback at any size.

## Acceptance Criteria

- `docs/shared/search.md` exists with valid front matter and covers every point above.
- The five module landing pages link it, with `user-admin`'s bullet explaining why it needs no flag.
- `pnpm docs:gen` has been run; `pnpm docs:check` passes; `docs/{contacts,companies,activities,deals}/reference/vars.md` each document `atlas_search`, and the three `filter_match` entries read as plain `$match` clauses.
- `pnpm docs:check` also confirms `docs/llms.txt` is current.
- A changeset exists bumping the four module packages plus `user-admin`, leading with the `filter_match` break.
- No source-side README gained prose — `modules/*/README.md` stay stubs pointing into `docs/`.

## Files

- `docs/shared/search.md` — create.
- `docs/contacts/index.md`, `docs/companies/index.md`, `docs/activities/index.md`, `docs/deals/index.md`, `docs/user-admin/index.md` — modify — add the shared-idiom link.
- `docs/{contacts,companies,activities,deals}/reference/vars.md` — regenerate via `pnpm docs:gen`.
- `docs/llms.txt` — regenerate via `pnpm docs:gen`.
- `.changeset/search-atlas-fallback.md` — create.

## Notes

- If `origin/design/org-aware-modules` has merged by the time this task runs, it will have added `docs/shared/atlas-search-indexes.md`, whose recipe (`dynamic: true` + `token` mappings for filter fields + `storedSource.include` lists) is superseded by this design: filters are no longer inside `$search`, so filter-field `token` mappings are unnecessary and whole-document stored source replaces the include lists. Fold that page into `docs/shared/search.md` plus the per-module index references rather than leaving two places describing index requirements differently, and keep whatever `organizationId` `token` mapping the tenant clause still needs.
- Keep the fallback's limits blunt. A reader deciding whether to run `atlas_search: false` in production needs "unindexed collection scan, no relevance ranking" stated plainly, not softened.
