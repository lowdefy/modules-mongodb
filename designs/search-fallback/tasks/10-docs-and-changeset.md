# Task 10: Documentation, generated var docs, and changeset

## Context

`docs/` is the source of truth for consumer-observable authoring behaviour, and this design changes three consumer-visible things:

1. A new `atlas_search` var on four modules, with real operational consequences (unindexed scan, no relevance ranking).
2. A **breaking change** to `request_stages.filter_match` in `contacts`, `companies`, and `activities` — Atlas-compound clauses become plain `$match` clauses.
3. A newly documented deployment requirement: the committed Atlas Search index definitions (with `storedSource: true`) and the regular `mongod` indexes the browse and fallback paths need.

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
- **The `atlas_search` var** — boolean, default `true`, set per module entry (four entries in a full deployment; there is deliberately no shared config file). Show a worked `modules.yaml` snippet.
- **What each mode does.** Atlas: indexed `$search`, substring via `wildcard *term*`, results ordered by relevance (`$meta: searchScore`). Fallback: a case-insensitive `$regex` `$or` over the same fields — identical substring semantics, **no relevance ranking** (results use the configured field sort), and an **unanchored regex, so a collection scan**. Suitable for development and small collections; not a substitute for Atlas at scale.
- **What is identical in both modes.** When the search box is empty no `$search` runs at all, so browse / filter / paginate is `$match` + `$sort` everywhere. Only an actual text query diverges. Structural filters, including `request_stages.filter_match`, are plain `$match` in both modes.
- **Atlas Search index requirements.** Point at the committed `modules/{contacts,companies,activities,deals}/search-indexes/default.search.json`; state the index name is `default` because the pipelines pass no `index:` option; explain `returnStoredSource: true` + `storedSource: true` and **why the whole document is stored**. Document the footgun prominently: if `storedSource` omits a field a post-`$search` `$match` references, the returned documents silently lack it — `hidden: { $ne: true }` stops excluding hidden documents (missing ≠ `true`) and positive filters exclude everything. Storing the whole document removes the failure mode; a hand-trimmed `include` list reintroduces it every time a column, export field, or `filter_match` clause is added.
- **Regular `mongod` indexes**, per collection, needed for the no-term browse path on Atlas _and_ for the fallback's filter/sort: the unconditional filter fields (`hidden`, `disabled` on `user-contacts`; `deleted.timestamp` on `companies` and `activities`; `removed` on `deals`), the sort fields each list offers, and `updated.timestamp` / `created.timestamp`. State plainly that these are normal indexes left to the consuming app's index tooling, and that switching a deployment to `atlas_search: false` without them means acceptable-only-at-small-scale performance.
- **The `companies.name_field` coupling.** Overriding `name_field` means regenerating `modules/companies/search-indexes/default.search.json` to map that field and redeploying it to Atlas. Otherwise Atlas `$search` silently returns no text matches on the overridden field while the regex fallback — which reads the var at query time — still works, so the two modes disagree.
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

Add `.changeset/search-atlas-fallback.md` bumping the four module packages — `@lowdefy/modules-mongodb-contacts`, `-companies`, `-activities`, `-deals`. Lead with the breaking `filter_match` change (it is what a consumer must act on), then the new `atlas_search` var, then the committed search indexes. Follow the shape of `.changeset/app-operator-slug-migration.md`: a bolded one-line summary of the break, then a "Migration for consumers" list.

Cover in the migration list: rewrite any `request_stages.filter_match` clauses in Mongo query syntax; set `atlas_search: false` on each searchable module entry for a non-Atlas deployment; create the `default` search indexes from the committed JSON with `storedSource: true`, and regenerate the companies one if `name_field` is overridden; add the regular `mongod` indexes before running the fallback at any size.

## Acceptance Criteria

- `docs/shared/search.md` exists with valid front matter and covers every point above.
- The five module landing pages link it, with `user-admin`'s bullet explaining why it needs no flag.
- `pnpm docs:gen` has been run; `pnpm docs:check` passes; `docs/{contacts,companies,activities,deals}/reference/vars.md` each document `atlas_search`, and the three `filter_match` entries read as plain `$match` clauses.
- `pnpm docs:check` also confirms `docs/llms.txt` is current.
- A changeset exists bumping the four module packages, leading with the `filter_match` break.
- No source-side README gained prose — `modules/*/README.md` stay stubs pointing into `docs/`.

## Files

- `docs/shared/search.md` — create.
- `docs/contacts/index.md`, `docs/companies/index.md`, `docs/activities/index.md`, `docs/deals/index.md`, `docs/user-admin/index.md` — modify — add the shared-idiom link.
- `docs/{contacts,companies,activities,deals}/reference/vars.md` — regenerate via `pnpm docs:gen`.
- `docs/llms.txt` — regenerate via `pnpm docs:gen`.
- `.changeset/search-atlas-fallback.md` — create.

## Notes

- If `origin/design/org-aware-modules` has merged by the time this task runs, it will have added `docs/shared/atlas-search-indexes.md`, whose recipe (`dynamic: true` + `token` mappings for filter fields + `storedSource.include` lists) is superseded by this design: filters are no longer inside `$search`, so filter-field `token` mappings are unnecessary and `storedSource: true` replaces the include lists. Fold that page into `docs/shared/search.md` rather than leaving two pages describing index requirements differently, and keep whatever `organizationId` `token` mapping the tenant clause still needs.
- Keep the fallback's limits blunt. A reader deciding whether to run `atlas_search: false` in production needs "unindexed collection scan, no relevance ranking" stated plainly, not softened.
