---
"@lowdefy/modules-mongodb-activities": minor
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-deals": minor
"@lowdefy/modules-mongodb-user-admin": minor
---

**Breaking: `request_stages.filter_match` takes plain MongoDB `$match` clauses instead of Atlas Search `compound` clauses.** In `contacts`, `companies` and `activities` the structural filters moved out of `$search` into a standard `$match`, so the consumer filter hook is now standard query syntax and applies in both search modes. The var stays an **array**; only each element's syntax changes, and the clauses are composed via `$and` rather than shallow-merged, so a clause using `$or` is safe.

These modules also gain a boolean **`atlas_search`** var (default `true`). Leave it `true` and text search runs through Atlas `$search` as before. Set it `false` — on `contacts`, `companies`, `activities` and `deals` — and text search falls back to a case-insensitive `$regex` `$or` over the same fields, which runs on any MongoDB: identical substring matching, but no relevance ranking and an unindexed collection scan, so it suits development and small collections rather than production at scale. With an empty search box no `$search` runs in either mode, so browse / filter / paginate is a plain `$match` + `$sort` everywhere.

**This version changes the Atlas Search index contract**, so a consumer upgrading must update their cluster's `default` index to match the requirement documented in the version they move to. The mappings narrow to text fields only — the structural filters are no longer evaluated by `mongot`, so its `token`/`date` mappings are unused — and `storedSource` now differs per collection: whole-document stored source is **required** on `user-contacts` and `companies`, and **not required** on `activities` and `deals`, whose requests read live documents so their post-write refetches do not show stale rows.

Migration for consumers:

- Rewrite any `request_stages.filter_match` clauses in MongoDB query syntax — `{ equals: { path: region, value: "x" } }` becomes `{ region: "x" }`, `{ range: { path: score, gte: 10 } }` becomes `{ score: { $gte: 10 } }`. The default `[]` is unaffected, so an app that never set the var has nothing to do.
- For a non-Atlas deployment, set `atlas_search: false` on each searchable module entry (`contacts`, `companies`, `activities`, `deals`). Hold the value once in a shared app config file and `_ref` it from each entry, so the app has one source of truth for which mode it is in.
- Create or update the `default` Atlas Search index per collection, following the module index references (`docs/{contacts,companies,activities}/reference/indexes.md` and `docs/deals/index.md`): whole-document `storedSource: true` on `user-contacts` and `companies`, no `storedSource` on `activities` and `deals`. If `companies.name_field` is overridden, map that field in the companies index instead of `name` — otherwise Atlas `$search` silently returns no text matches on it while the regex fallback still works.
- Before running the fallback at any size, add the regular `mongod` indexes the module index references list. They serve the filter, not the sort; without them a fallback deployment performs acceptably only at small scale.

`user-admin` is not affected by the `filter_match` change — its clauses were already plain `$match`. Two non-breaking improvements land there: the members search now treats regex metacharacters typed into the search box as literals (previously a `(` made MongoDB reject the regex and `.*` matched every member), and its filter stage composes its clauses with `$and` so no two can collide on a key.
