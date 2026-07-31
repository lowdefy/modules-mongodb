# Atlas Search fallback (search portability)

Several modules build their list pages, Excel exports, and the rich contact-selector typeahead on MongoDB Atlas `$search`, which only exists on Atlas (it needs the `mongot` process). On a community or local MongoDB server every one of these pipelines hard-fails, so a self-hosted deployment can't list contacts, companies, activities, or deals — and neither can local development or an e2e run against a plain `mongod`, which is why `apps/workflows-test` cannot exercise the contacts module's selector today.

This design makes text search **portable**. A module-level flag selects Atlas `$search` (the default) or a plain-MongoDB regex fallback, and the structural filtering is restructured so the same pipeline works in both modes. It also documents the Atlas Search index definitions the modules have always silently depended on.

## Proposed change

1. Add a boolean `atlas_search` var (default `true`) to the four modules that do text search: `contacts`, `companies`, `activities`, `deals`. When `false`, requests use a regex fallback instead of `$search`.
2. Split text search from structural filtering. Structural filters — and the consumer filter hook — always run as a standard `$match`; only the free-text term toggles between an Atlas `$search` text stage and a case-insensitive `$regex` `$or`.
3. Centralise the text-stage and regex-clause construction in four shared files under `modules/shared/search/`, so all requests build them identically and the escaping has one home.
4. Emit `returnStoredSource: true` from the shared text stage by default, with a per-caller opt-out; `activities` and `deals` pass `false` so their post-write refetches read live documents (decision 3). Skip `$search` entirely when there is no search term.
5. Document the Atlas Search index requirement per module, following the repo's existing per-module index-reference convention, alongside the regular `mongod` indexes the browse and fallback paths need. Creation stays the consuming app's job, as it already is for regular indexes.
6. Convert the consumer filter hook (`request_stages.filter_match`) from Atlas-compound syntax to standard `$match` syntax so it works unchanged in both modes. This is a breaking change to that var; no app currently passes it.

## Background: how search works today

`$search` is the first stage of 7 requests across 4 modules, so all 7 fail on local MongoDB:

| Module     | Requests                                      | Collection      | Shape                |
| ---------- | --------------------------------------------- | --------------- | -------------------- |
| contacts   | `get_all_contacts`, `get_contact_excel_data`  | `user-contacts` | filters-in-`$search` |
| contacts   | `search_contacts` (selector typeahead)        | `user-contacts` | already split        |
| companies  | `get_all_companies`, `get_company_excel_data` | `companies`     | filters-in-`$search` |
| activities | `get_activities`                              | `activities`    | filters-in-`$search` |
| deals      | `get_deals_list`                              | `deals`         | already split        |

Two searchable-looking things are **out of scope**:

- `contacts/requests/get_contacts_for_selector.yaml` (the `basic-contact-selector`) is already `$match` + `$sort` with no `$search`, so it works on local today.
- `user-admin` has no `$search` at all. The BetterAuth rebuild removed it: `requests/stages/members_filter.yaml` is a plain `$match` with a case-insensitive regex over the post-`$lookup` name and email fields, and its `request_stages.filter_match` is already declared as plain `$match` clauses. It needs no `atlas_search` var — its search is _always_ the unindexed regex path, even on Atlas, which this design documents rather than changes. One change does land there: it adopts the `$and` composition idiom and the shared escaping (decision 2).

**Five of the seven** share one shape — a single `$search.compound` block mixing two unrelated concerns:

- **Free-text ranking** — a `should` of `text` + `wildcard *term*` over name/email-style fields (`profile.name` + `lowercase_email`; `title` + `description.text` for activities; `name_field` + `lowercase_email` for companies), with results ordered by `$meta: searchScore`.
- **Structural filters** — `equals`/`in`/`range`/`exists`/`mustNot` clauses (`hidden`, `disabled`, `deleted.timestamp`, `type`, `status.stage`, `contacts.contact_id`, date ranges) plus the consumer `request_stages.filter_match` var, currently documented as _"Atlas Search compound clauses"_.

The structural clauses all have exact plain-`$match` equivalents. Only the free-text part genuinely needs Atlas.

The other two are **already split**:

- `contacts/requests/search_contacts.yaml` — text-only `$search`, then a `$match` carrying the structural filters, with its own consumer hook: the component-level `filter` var (already plain `$match`, see decision 4), not `request_stages.filter_match`. It has no `$facet`, score sort, or pagination, so the score pieces are inapplicable — but its `$match` still needs the `$and` conversion, for the reason in decision 2.
- `deals/requests/get_deals_list.yaml` — text-only `$search`, then a `$match` whose body is already a `$and` array, then `$lookup` + `$facet`. Its `$search` searches `name` by text and wildcard **plus a boosted keyword-analyzer wildcard on `_id`** (the deal code), and it does not lowercase the term (see `should_extra` under [§Shared builder](#shared-builder)). Its facet `$sort` reads `score: -1` unconditionally, relying on the missing field sorting as null when there is no term, so it needs the score-sort gate.

Five of the seven already set `returnStoredSource: true`. `activities/get_activities.yaml` and `deals/get_deals_list.yaml` are the exceptions — `activities` deliberately so (`modules/activities/CHANGELOG.md`, PR #68), which decision 3 preserves.

**No module documents its search-index requirement.** The `storedSource` config these requests depend on is stated nowhere, so a fresh Atlas project has no reference for what to create. `docs/deals/index.md` is the sole partial exception: it names the `deals` search index and its fields, but predates this restructure.

## Key decisions

### 1. Regex substring fallback, not `$text`

The current UX is **substring typeahead** (`joh` → `John`), implemented with `wildcard *term*`. MongoDB's native `$text` index only does whole-word stemmed matching, allows one text index per collection, and can't be combined per-field the way this needs — it would silently change behaviour.

The fallback is therefore a case-insensitive `$or` of `$regex` over the same fields the Atlas text clause searches:

```yaml
$or:
  - profile.name: { $regex: <escaped-term>, $options: i }
  - lowercase_email: { $regex: <escaped-term>, $options: i }
```

This preserves substring matching exactly. What's lost is **relevance ranking** — there is no `searchScore` — so fallback results use the existing field sort, the same sort the Atlas path uses when there is no search term.

User input is **regex-escaped** before interpolation. This is not cosmetic: verified in node, the unescaped term `jo.h*n (a)+b[c]\d/e^$|{2}?` **throws** when compiled as a regex, and a term of `.*` matches every document. The escaping is single-source in `regex_clause.yaml`.

Trade-off, and why Atlas stays the default: an unanchored regex can't use a btree index, so it's a collection scan. Fine for local, dev, and CRM-scale collections; not a substitute for Atlas at large scale. The flag defaults to `true` precisely so production keeps the indexed path.

### 2. Split text from filters, so only the text stage toggles

Branching the _whole_ pipeline per request would mean ~8 parallel pipeline copies guaranteed to drift, and a `filter_match` that silently does nothing in fallback mode. Instead the structural filters move **out of `$search`** into a normal `$match` that runs in **both** modes. The flag then toggles only the text mechanism and the sort tie-break:

|         | Atlas + term            | Atlas, no term     | Fallback (any)                             |
| ------- | ----------------------- | ------------------ | ------------------------------------------ |
| Stage 1 | `$search` (text only)   | no-op              | absent                                     |
| Filter  | `$match` (filters)      | `$match` (filters) | `$match` (filters + `$or` regex when term) |
| Sort    | `score`, then tie-break | field sort         | field sort                                 |

**Two gating dimensions, resolving at different times.** This is the part most easily got wrong, so it is worth stating precisely:

- **`atlas_search`** is a `_module.var` — a build-time literal. When it is `false` the entire Atlas text mechanism is dropped **at compile** with `_build.*`, so no `$search` or `$meta` operator survives into the runtime pipeline at all.
- **`term`** (`_payload: filter.search`) is runtime-only. "Skip `$search` when there is no term" and the `score` toggle are therefore **runtime** decisions.

**Pipeline assembly.** Each request's pipeline root stays a **`_build.array.concat`** — the idiom four of these requests already use (`get_contact_excel_data.yaml:15`, `get_contacts_for_selector.yaml:7`). Each gated piece is a `_build.if` on `atlas_search` returning either `[]` or a one-element array holding a **runtime `_if`** that resolves to a real stage or a no-op stage:

```yaml
pipeline:
  _build.array.concat:
    - _build.if: # atlas_search — build time
        test:
          _module.var: atlas_search
        then:
          - _if: # term — runtime
              test: <term present>
              then: { $search: <text only, via text_lead.yaml> }
              else: { $match: {} } # no-op
        else: []
    - - $match:
          $and: # runtime _array.concat — see merge semantics below
            _array.concat:
              - - <structural filters> # standard Mongo query, written once
              - <regex_clause> # [ { $or: [...] } ] when !atlas && term, else []
              - <request_stages.filter_match> # consumer $match clauses, nulls dropped
    - <score piece — same build/runtime shape as stage 1, no-op is `$addFields: {}`>
    - # ...existing $facet / $sort / $skip / $limit / derived stages...
```

**Why this shape rather than a runtime `_array.concat` root.** A runtime-gated stage that must be _flattened_ (returning `[]` or `[stage]`) genuinely cannot be spliced by an outer `_build.array.concat`, because the build pass would have to flatten a value it cannot resolve. But a runtime `_if` sitting as a single **element** inside a build-time array is fine, and the repo already proves it: `get_contact_excel_data.yaml:74` has exactly that — a runtime `_if` returning a `$sort` stage object inside a `_build.array.concat` root. Pairing that with a no-op stage for the "no term" branch avoids runtime flattening entirely, so the build-time root is preserved and four of the five roots keep their current shape.

The no-op stages are valid, not a hope: verified on mongod 7.0.39 that `$match: {}` and `$addFields: {}` both parse and run. `deals/get_deals_list.yaml:16-25` already ships this exact `_if` → `$search` / `$match: {}` pattern today, so the design adopts a shape the repo has in production rather than introducing a new one.

The `$and` array inside `$match` **is** a runtime `_array.concat`, because the regex clause and the `filter_match` entries appear and disappear at runtime. That is a runtime concat in a runtime position — nothing build-time has to flatten it.

**Merge semantics: `$and`, not shallow assign.** The `$match` body combines three sources that can collide on a key — the structural filters, the regex clause (`{ $or: [...] }`), and the consumer `filter_match`. A shallow `_object.assign` is last-writer-wins keyed by top-level field, so collisions vanish silently. This is not hypothetical: `get_activities.yaml:100-127` filters `updated.timestamp` **twice** (`filter.date_from` → `$gte`, `filter.date_to` → `$lte`), and merged as two assign entries the second clobbers the first and one bound is lost. Likewise a consumer `filter_match` using `$or` would clobber the regex clause's `$or`.

So the `$match` body wraps its clauses in a top-level **`$and`** array with empty entries dropped, which composes any clauses without key collisions — collision-proof by construction rather than by authoring discipline. The array is never empty: every one of these requests carries at least one unconditional structural clause (`hidden`/`disabled`, `deleted.timestamp`, `removed`), so the `$and: []` MongoDB rejects cannot arise.

Verified on mongod 7.0.39: `$and: []` is rejected (`BadValue: $and/$or/$nor must be a nonempty array`), while `$and: [{}]` and `$and: [{a:1},{}]` both parse. So `$and` tolerates the empty-object entries that a defaulted var can contribute.

**`search_contacts` needs this conversion too.** Its `$match` (`search_contacts.yaml:55-81`) is an `_object.assign` of the hidden/disabled clause, a build-gated `global_attributes.company_ids` clause, and the consumer `filter` var. Adding a `{ $or: [...] }` regex clause to a shallow merge is precisely the failure this decision exists to prevent: a consumer `filter` containing `$or` would silently clobber the regex fallback, and one containing `global_attributes.company_ids` would clobber the company scope. So it converts to `$and` as well, even though the score pieces don't apply to it.

**`user-admin` adopts `$and` too, so the repo has one idiom.** `modules/user-admin/requests/stages/members_filter.yaml` solves the identical problem — compose four optional `$match` clauses — and its header documents the opposite choice: merge into one object via `_object.assign` rather than wrap in `$and`, so that with no filter set the stage is the canonical match-all `$match: {}`, since `$and: []` is rejected. Leaving that would put two documented, mutually contradicting idioms for one job in neighbouring modules.

The stated obstacle doesn't hold: `members_filter.yaml` already seeds its `_array.concat` with `{}`, so the `$and` form yields `$and: [{}]` with no filter set, which MongoDB accepts (verified above). Only the empty array is rejected. So it converts, and while that stage is open it routes its `$regex` through the shared escaping — closing a live defect, since it currently interpolates `filter.search` into `$regex` **unescaped**, so a `(` in the members search box throws and `.*` matches everything.

That is the module's only change. It still gets no `atlas_search` var and no `$search`.

**Emergent property.** With no search term, `$search` is skipped, so the browse / filter / paginate path becomes `$match` + `$sort` on **both** Atlas and local — identical behaviour. Only an actual text query diverges between modes, which shrinks the surface needing Atlas-specific testing to "did someone type in the search box".

### 3. What filters-in-`$match` costs, and why the trade is worth taking

The classic reason to keep filters inside `$search.compound` is to filter on the search index before the `_id`→document hydration round-trip from `mongot` back to `mongod`. That rationale only holds **without** stored source. With `returnStoredSource: true` and a `storedSource`-configured index, `$search` returns documents straight from `mongot`, so a `$match` over those documents costs no extra round trip. Moving filters to `$match` is therefore comparably fast per document, readable, and works unchanged in fallback mode.

**Per-document cost is not the whole story: volume changes too.** Filters inside `$search` let `mongot` narrow on both dimensions at once and return only survivors. After the restructure `mongot`'s result set is scoped by the **text term alone**, and `mongod` discards the rest. The regular `mongod` indexes of decision 5 don't help — `$match` runs on the `$search` output stream, not the collection — so this is a genuine cost, not one an index closes.

It is concentrated in one request. `get_all_contacts` filters only on `hidden`/`disabled` and `get_all_companies` only on `deleted.timestamp` — non-selective predicates excluding a small minority, so their volume barely moves. **`get_activities` is the sharp case**: six selective filters (`type`, `status.stage`, `contacts.contact_id`, `company_ids`, and two `updated.timestamp` bounds), so "activities whose title or description contains the term" versus "…that are also meetings, in stage `done`, for one contact, in a date window" can differ by orders of magnitude — and it is also the request that opts out of stored source, so it pays hydration for that whole pre-filter set. (`get_deals_list` is unaffected: its `removed: null` clause already sits in a `$match` after `$search`, and it already swaps in `$match: {}` when there is no term.)

**The counterweight.** Today `$search` runs on _every_ list load, because the structural filters live inside it — so even a plain browse with an empty search box pays a `mongot` round-trip and cannot use regular `mongod` indexes for the filter. Under this design a no-term load skips `$search` entirely and runs as a plain `$match` + `$sort` against `mongod`, where the `$match` is index-servable. The `$sort` is not, in any mode: every list request sorts inside `$facet`, which keeps the sort out of the query plan altogether — probed on mongod 7.0.24, a top-level `$match` + `$sort` + `$limit` plans as `LIMIT <- FETCH <- IXSCAN`, and moving that same `$sort` inside `$facet` leaves it as an aggregation-layer blocking sort and loses the `$limit` pushdown with it. So the gain is on the filter and the round trip, not the sort. Ranking the shapes:

- **Term present:** filters-in-`$search` (today) > filters-in-`$match` with stored source > filters-in-`$match` without it.
- **No term:** this design (no `$search` at all) > today.

So the restructure doesn't give up performance wholesale; it moves cost off every list load and onto the subset where a user has actually typed something. Accepted at CRM-scale collections, where the text-matched set is bounded by the term and hydration is an `_id`-keyed batch fetch. Filters-in-`$search` is not free either: its compound syntax diverges from the plain-`$match` path used everywhere else, which is what produced the silently-never-matching `status.0.stage` clause recorded in `modules/activities/CHANGELOG.md`.

Filters-in-`$match` with stored source is already the de-facto pattern (5 of the 7 requests), so the shared text stage emits `returnStoredSource: true` by default.

**Two callers opt out, and that is a preserved decision, not an inconsistency.** `activities/get_activities.yaml` omits the flag deliberately: `modules/activities/CHANGELOG.md` (PR #68) records dropping it "so post-write refetches return the live doc immediately instead of waiting on Atlas Search index replication." Stored source returns `mongot`'s copy, which lags writes, so editing an activity and refetching the list showed pre-edit values. `text_lead.yaml` therefore takes `returnStoredSource` as a `_ref` var (default `true`), and `activities` and `deals` pass `false` — the deals list is refetched after every deal write and carries the same exposure. These are builder-internal `_ref` vars, not module vars: no manifest entry, no consumer-facing surface.

Because filters now run _after_ `$search`, the two modes cost differently:

- `returnStoredSource: true` — `mongot` returns text-matched documents with their bodies; `mongod` filters them and never touches the collection.
- `returnStoredSource: false` — `mongot` returns `_id`s and `mongod` hydrates the **whole text-matched set** before the filters narrow it, paying a full-document lookup for documents it then discards. That is the price of freshness, and it lands only when a term is present. `activities` is plausibly the largest of the four collections, so the cost is real rather than nominal; it is stated in `docs/shared/search.md` rather than left to be rediscovered.

Decision 2's emergent property narrows the exposure for every request, opted out or not: with no search term there is no `$search` stage, so a post-write refetch on an unfiltered list reads live from `mongod` — better than today. The residual case for the five that keep stored source is "a search term is active, the user edits a visible row, the list refetches", where those rows come from `mongot`'s copy and can show pre-edit values. Accepted for those five; the two whose write flows make it routine opt out. The flag governs only document _contents_ — which rows `$search` returns always depends on the `mongot` index, so a newly created record does not appear in a term-filtered list in either mode.

**The footgun, documented prominently:** if `storedSource` omits a field that a post-`$search` `$match` references, `returnStoredSource` documents silently lack it. A `hidden: { $ne: true }` filter then stops excluding hidden docs (missing ≠ `true`), and positive `equals`-style filters exclude everything. Mitigation: configure **`storedSource: true`** to store the whole document (decision 5). The two callers that opt out are immune by construction — their `$match` always runs on live documents from `mongod`.

**This footgun is already live.** `search_contacts` today runs `returnStoredSource: true` and then `$match`es on `hidden`, `disabled`, and `global_attributes.company_ids`. With no search index documented anywhere, if the deployed `default` index doesn't store those fields the filter is _already silently wrong on Atlas_. So `storedSource: true` isn't only fallback-enabling — it closes a pre-existing latent correctness gap, which strengthens the case for storing the whole document by default.

### 4. Flag shape: boolean `atlas_search`, default `true`

Each searchable module gets:

```yaml
atlas_search:
  type: boolean
  default: true
  description: >-
    Whether the deployment's MongoDB has Atlas Search available. When true,
    text search uses Atlas `$search` (indexed, relevance-ranked). When false,
    text search falls back to a case-insensitive regex `$match` that runs on
    any MongoDB (community/local) — substring matching, no relevance ranking,
    and an unindexed scan, so suitable for development or small collections.
```

Boolean rather than an enum because regex is the only fallback there is a concrete need for; an enum would be speculative surface. It reads naturally as "default Atlas".

**Each app is wired for the database it actually runs on, which is also what keeps both branches compiled.** `apps/demo` sets `true`: it is the consumer-facing reference and the general deployment target, running against a real MongoDB with Atlas Search, so it should show the production wiring. `apps/workflows-test` sets `false`: it exercises module config against a plain e2e `mongod`, and its field-render sweep renders the contacts module's `contact-selector`, whose typeahead leads with `$search`. Building each app compiles a different branch of the shared builder, so neither half can rot — without the demo carrying configuration that exists only to be tested. (`apps/passwordless-demo` has no searchable module entries, so it needs no wiring.)

**How consumers set this app-wide: one value in `app_config.yaml`, `_ref`'d per module entry.** `atlas_search` describes a property of the deployment's database, so it is identical for every searchable module in an app. Repeating the literal on four entries makes one app-level fact live in four places. Instead each app holds it once:

```yaml
# apps/demo/app_config.yaml
atlas_search: true
```

and each searchable module entry reads it:

```yaml
atlas_search:
  _ref:
    path: app_config.yaml
    key: atlas_search
```

**This reintroduces a file [`designs/app-operator`](../app-operator/design.md) deleted, deliberately and without conflict.** That design did not reject the shared-config pattern; `app_config.yaml` held exactly one key (`app_name`), `_app: slug` replaced it, and the file was removed because nothing read it any more (its task 07). A one-key file whose key becomes obsolete gets deleted; that says nothing about the next app-level key. `atlas_search` is a better fit than `app_name` ever was — `app_name` was app _identity_, which the platform can now supply via `_app`, whereas this is deployment _capability_, which no operator exposes. It holds this one key; do not populate it speculatively.

There is no operator route. `_app` reads a fixed metadata set — `slug`, `name`, `version`, `description`, `license`, `lowdefyVersion`, `gitSha` — and cannot carry an arbitrary app-level flag. `_secret` is server-runtime-only, which would forfeit decision 2's build-time collapse.

To be clear about what the shared file does and does not buy: it does **not** eliminate drift, because a newly added module entry can still forget the `_ref`. What it gives is a single source of truth for which mode the app is in, and one edit to switch it. The residual drift is the benign kind — unlike `app_name`, where missing one entry silently keyed stored documents under the wrong app forever, a missed `atlas_search` fails loudly on that module's first list-page load and touches nothing stored.

**The consumer hook changes syntax.** Because the structural filters are now standard `$match`, `request_stages.filter_match` must be standard `$match` syntax too, not Atlas compound. This is a **breaking change** to that var, but it then works identically in both modes — one syntax instead of two. No app in this repo passes `filter_match`, so blast radius is low; the change is called out in the module CHANGELOGs and the migration note below.

**Two consumer hooks, deliberately separate.** There are two filter-extension points, at different layers, and they stay distinct:

- `request_stages.filter_match` — a **module var** set by the app consumer on the module entry, feeding the heavy list and Excel requests. An **array of clauses**; converted from Atlas-compound to plain `$match` here.
- `filter` — a **component/`_ref` var** on the `search_contacts` selector pipeline, one layer down: the `contact-selector` block exposes it and passes it to the typeahead request. A **single `$match` object**, default `{}`, and **already plain `$match`** today.

They differ on every axis — who sets it, which request it feeds, shape, and starting syntax — so unifying them would mean reworking the already-correct selector for no functional gain. Post-redesign both are plain `$match`, so they are consistent in _syntax_; they remain distinct in _name and layer_ by design.

### 5. Index requirements: documented per module, following the existing convention

The gap this closes is that **nothing tells a consumer what search index to create** — the `storedSource` config the requests depend on is stated nowhere. The repo already has a convention for exactly that gap, and this design uses it rather than inventing a second mechanism:

- `docs/user-account/reference/indexes.md` and `docs/workflows/reference/indexes.md` — per-module index reference pages, opening with the module-creates-nothing statement and giving each index its `createIndex` snippet, the query sites that need it, and why it is shaped that way.
- `docs/deals/index.md`'s `## Required indexes` section states the division of labour outright: "The module documents the contract; the app owns creating them." It already documents this module's Atlas Search index in prose.

So the search-index contract is documented per module and creation is left to the app, the same way regular `mongod` indexes are handled. **No index-definition JSON is committed into the module tree.** That would be a second mechanism for one job, inconsistent with the regular-index half of this decision, and it cannot deliver what committing files appears to buy: `splice-actions`' tree is `indexes/{project}/{collection}/{name}.json`, and `{project}` is per-app, so a file from this repo is never copied verbatim regardless.

Documenting rather than shipping files also removes two problems the file approach creates. The collection binding is a sentence (`deals` already writes "an index named `default` on `deals`") instead of something a path has to encode. And the design makes no claim about any external tool's accepted schema — `storedSource` is documented as a **requirement of the index**, which the app satisfies with whatever tooling it uses, rather than asserted to be a field `splice-actions` forwards. That claim was unverifiable from this repo: the tool's reference documents `{ name, mappings }` only, and its writer is not vendored here.

Per module the documented contract is an index named **`default`** (no `$search` stage specifies a non-default `index:` — most omit the option and `deals/get_deals_list.yaml` sets `index: default` explicitly), with `dynamic: false` and **only the text fields** mapped as `string`. Because filters moved to `$match`, none of the `token`/filter-field mappings a filters-in-`$search` index would carry are needed:

- **`contacts`** → the mapped `user-contacts` collection: `profile.name`, `lowercase_email`. Serves `get_all_contacts`, `get_contact_excel_data`, and the `search_contacts` typeahead. **Requires stored source covering the whole document**, because all three query with `returnStoredSource: true` and then `$match` on fields the mappings do not include — see the footgun in decision 3. Not required by `user-admin`, which reads the same collection but uses no `$search`.
- **`companies`** → `companies`: `name` + `lowercase_email`, also with whole-document stored source. **Coupling to the `name_field` var:** `get_all_companies` searches `_module.var: name_field`, which a consumer can override; the documented contract maps the default `name`. A consumer who overrides it must map their field instead, or Atlas `$search` silently returns no text matches on it while the regex fallback — which reads the var at query time — still works, producing a mode-dependent discrepancy.
- **`activities`** → `activities`: `title`, `description.text`. **No stored source needed** — `get_activities` passes `returnStoredSource: false`, so nothing reads `mongot`'s copy and storing documents would cost index storage for a path no query takes.
- **`deals`** → `deals`: `name`, plus `_id` with a `keywordAnalyzer` multi, since `get_deals_list` searches the deal code through `path: { value: _id, multi: keywordAnalyzer }` and that requires the index to declare the analyzer. Also no stored source, for the same reason as `activities`. This corrects the existing paragraph in `docs/deals/index.md`, which describes the pre-restructure requirement.

Each page carries an illustrative mappings block — the equivalent of `user-account`'s `createIndex` snippets — so a consumer has something concrete to adapt:

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

**The contract is versioned with the module.** The documentation ships with the module, so the requirement described at a given version is what that version's pipelines need — these narrowed mappings are correct only from the version where filters move into `$match`. The module CHANGELOG records that this version changes the requirement, so a consumer upgrading knows to update their cluster's index, and someone on an older version reads that version's docs.

Regular `mongod` indexes matter too — for the no-term browse path on Atlas _and_ for the fallback regex mode's filter and sort. They go on the same four pages, in the same style (fields such as `hidden`, `disabled`, `deleted.timestamp`, `removed`, `updated.timestamp`, and each list's configured sort fields). `user-admin` has **no search-index requirement at all** — its members search is always a regex `$match` — so it gets no index reference page here; its indexes are outside this design's scope.

### 6. Documentation

- `docs/shared/search.md` — new shared concept page: the `atlas_search` flag, what the fallback does and its limits (substring, no ranking, unindexed scan), the `returnStoredSource` + `storedSource: true` requirement, the missing-field footgun, and the freshness-vs-lookup trade behind `activities`/`deals` opting out of stored source. Linked from each searchable module's `index.md`.
- Per-module index reference: the `default` search index requirement (mapped fields, and whether stored source is needed) plus the required regular `mongod` indexes, in the style of `docs/user-account/reference/indexes.md`. The companies page also documents the `name_field`-override coupling.
- `docs/user-admin/index.md` links the same shared page, stating that the module needs **no** `atlas_search` var because its members search is always a plain-`$match` regex. Without that note a reader comparing modules reads the missing var as an oversight.
- Manifest `description:` for the new `atlas_search` var, which drives the generated `docs/{module}/reference/vars.md` via `pnpm docs:gen`.

## Shared builder

`modules/shared/search/` holds the single source of truth for text-stage and regex-clause construction, referenced with `_ref` + `vars` (the relative-path idiom already used for `../shared/profile/*`, `../shared/layout/*`, `../shared/sessions/*`). It is **one file per splice point**, each ref'd independently, so no `_ref` needs to combine `path` + `key` + `vars` — a combination with no precedent in this repo (`path` + `key` and `path` + `vars` each have many).

| File                | Vars                                                                  | Returns                                                                                                             |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `text_lead.yaml`    | `atlas_search`, `term`, `paths`, `should_extra`, `returnStoredSource` | `[ <runtime _if → { $search: … } \| { $match: {} }> ]` when `atlas_search`, else `[]`                               |
| `regex_clause.yaml` | `atlas_search` (default `false`), `term`, `paths`                     | `[ { $or: [ { <path>: { $regex: <escaped>, $options: i } }, … ] } ]` when `!atlas_search` && term, else `[]`        |
| `score_stage.yaml`  | `atlas_search`, `term`                                                | `[ <runtime _if → { $addFields: { score: { $meta: searchScore } } } \| { $addFields: {} }> ]` when atlas, else `[]` |
| `use_score.yaml`    | `atlas_search`, `term`                                                | the `$sort` `_if` test — build-collapses to `false` when `!atlas_search`, else a runtime predicate on `term`        |

`regex_clause.yaml` defaults `atlas_search` to `false` so `user-admin` — which has no such var and no Atlas path — can call it with just `term` and `paths` and get the term-gated `$or`. That is the honest reading of the flag for that module, not a special case.

**Every gated piece returns an array.** A piece that appears or disappears returns `[]` or a one-element array, so a gated-off piece vanishes through the surrounding `_array.concat` rather than leaving an empty object behind. The rule is specifically about things that appear and disappear: a var that always contributes exactly one clause slot — the selector's `filter`, default `{}` — sits directly as a `$and` entry, because wrapping it in a one-element array would relocate its empty default rather than remove it. That is safe, since `$and` accepts `{}` entries (verified above); removing it outright would need a runtime emptiness `_if` costing more YAML than the `{}` it replaces, or changing the var from object to array, which decision 4 deliberately rejects.

**Composing the two dimensions.** Each file wraps a runtime `_if` on `term` inside a build-time `_build.if` on `atlas_search`, passed in as `{ _module.var: atlas_search }`. `_module.var` resolves before `_build.*`, with precedent in the repo: `modules/user-admin/api/reinstate.yaml:10-14` uses `_build.not: { _module.var: suspension }` inside a `_build.if` test, and `modules/contacts/components/contact-selector.yaml.njk:213` uses `_build.if` on `{ _module.var: use_verified }`.

**What counts as "no term".** All gated pieces test the term against the **empty string**, not `null`: `_ne: [ { _if_none: [ { _var: term }, "" ] }, "" ]`. Three states must read as absent — the key missing (a list request before its filter block is touched), `null`, and the `""` a cleared input leaves behind — and `_if_none` collapses the first two into the third so one test covers all three. `search_contacts` already gates on `""` for precisely this reason: its term is the `ContactSelector` search box, and clearing the box yields `""`. Centralising the test also tightens the five list and Excel requests, whose current `_ne: [filter.search, null]` lets `""` through into a `$search` with an empty `text` query — which Atlas rejects, and which in fallback mode would become `{ $regex: "", $options: i }`, matching every document.

**The regex fan-out is built from `paths`, not hand-authored per request.** `regex_clause.yaml` maps over `paths` to build `$or: [ { <path>: <regex> }, … ]`, so the escaping and the clause shape have exactly one home:

```yaml
_array.map:
  on:
    _var: paths
  callback:
    _function:
      __object.defineProperty:
        on: {}
        key:
          __args: 0
        descriptor:
          value:
            $regex:
              _string.replace:
                on:
                  _var: term
                regex: '[.*+?^${}()|[\]\\/]'
                newSubstr: '\$&'
                regexFlags: g
            $options: i
```

Three things make this work, and each is already exercised server-side in the very requests being changed:

- **`_function` prefix scoping is a documented contract, not a guess.** A single-underscore operator in a `_function` body is evaluated when the function is _created_; a double-underscore one when it is _executed_. So `_string.replace` on `_var: term` resolves once for the whole map — which is what we want — while `__args: 0` varies per path. `_array.filter` + `_function` with `__ne`/`__args` already splices `filter_match` in four of these requests, so `_function` bodies demonstrably evaluate server-side here.
- **Dynamic keys via `_object.defineProperty` already run server-side in these requests** — it is how every one of their `$sort` stages is built (e.g. `get_all_contacts.yaml:80-87`).
- **`companies`' operator-valued path is not an obstacle.** `paths` contains `{ _module.var: name_field }`, which resolves at build, so by runtime `paths` is a list of literal strings. (That objection _is_ fatal to a `.yaml.njk` loop, which cannot interpolate an operator — which is why this uses `_array.map` instead.)

The composition of the two — a dynamic key inside a `_function` body — is the one part with no exact precedent, so task 2 confirms it on its first real request run before the pattern is applied to the remaining six.

**Escaping** uses `_string.replace`, which is `String.prototype.replace` and available server-side where request properties evaluate. Single-quoted YAML keeps both strings literal; `$&` re-inserts the matched metacharacter after the added backslash. Verified in node: `jo.h*n (a)+b[c]\d/e^$|{2}?` → `jo\.h\*n \(a\)\+b\[c\]\\d\/e\^\$\|\{2\}\?`, which matches the input literally and no longer matches `joXhnn`, where the unescaped form throws on compile.

**`should_extra`** (default `[]`) exists for `deals`, whose Atlas clause set includes a boosted `keywordAnalyzer` wildcard on `_id` that must **not** be lowercased and must not join the `text` clause. The caller passes that clause verbatim and the builder splices it into the `should` array inside its gate, so a caller-specific Atlas quirk stays with its caller while the gating stays shared. The generic clauses lowercase the term (`_string.toLowerCase`), as 5 of the 7 requests already do — `search_contacts` and `deals`' generic `name` clause gain that lowercasing, which is what makes the `wildcard` clause match the lowercase-stored `lowercase_email`. The regex fallback needs no lowercasing; `$options: i` covers it.

Adding an eighth searchable request, or changing how the fallback escapes input, stays a one-file change.

## Files changed

**Modules (manifests + requests):**

- `modules/{contacts,companies,activities,deals}/module.lowdefy.yaml` — add `atlas_search` var; restate `request_stages.filter_match` description as `$match` syntax in the three modules that declare it (`deals` has none).
- **5 requests restructured** (filters → `$match` `$and`, text via shared builder): `contacts/requests/{get_all_contacts,get_contact_excel_data}.yaml`, `companies/requests/{get_all_companies,get_company_excel_data}.yaml`, `activities/requests/get_activities.yaml`.
- **2 requests adjusted** (already split — toggle, regex clause, `$match` → `$and`, plus the score-sort gate for `deals`): `contacts/requests/search_contacts.yaml`, `deals/requests/get_deals_list.yaml`.
- `modules/user-admin/requests/stages/members_filter.yaml` — `_object.assign` → `$and`, and its `$regex` routed through the shared `regex_clause.yaml`. No `atlas_search` var, no `$search`.

**New shared files:**

- `modules/shared/search/{text_lead,regex_clause,score_stage,use_score}.yaml`.

No index-definition files are added; the index requirements are documented per module (decision 5).

**Demo + docs:**

- `apps/demo/app_config.yaml` (reinstated, `atlas_search: true`) and `apps/workflows-test/app_config.yaml` (`atlas_search: false`).
- `apps/demo/modules/{contacts,companies,activities,deals}/vars.yaml` — `_ref` the app's `atlas_search` value.
- `apps/workflows-test/modules.yaml` — `_ref` the same on its `contacts`/`companies` entries, plus new `deals` + `activities` entries so all four modules' fallback branches compile against its plain e2e `mongod`.
- `.github/workflows/ci.yaml` — build both apps, so each flag branch is gated rather than merely available (CI currently runs only `pnpm install` and `pnpm docs:check`, and builds no app).
- `docs/shared/search.md` (new); module `index.md` links; regenerated `docs/{module}/reference/vars.md`; a changeset for the four module packages.

## Non-goals

- The `basic-contact-selector` (`get_contacts_for_selector`) — already non-Atlas, unchanged.
- Giving `user-admin` an `atlas_search` var, or moving it onto `$search` when the flag is `true`. Its members search is a plain-`$match` regex over post-`$lookup` fields, so it is already portable; reintroducing Atlas surface the module deliberately dropped would mean indexing fields that only coexist after the joins. Its unindexed-on-Atlas cost is documented, not fixed here. (It is not untouched, though — `members_filter.yaml` adopts the `$and` idiom and the shared escaping.)
- Replicating relevance ranking in fallback mode — fallback intentionally uses field sort.
- Index-management tooling, and shipping index-definition files — the search and regular index requirements are documented per module; creating them on a cluster stays the consuming app's job, exactly as it already is for regular indexes.
- Atlas Search features beyond `text`/`wildcard` (synonyms, fuzzy, faceting) — none are used today.

## Migration note

`request_stages.filter_match` changes from Atlas-compound clauses to standard `$match` clauses in the three modules that declare it — `contacts`, `companies`, `activities`. (`user-admin` declares the var too, but its clauses are **already** plain `$match`, so consumers of that module have nothing to change; `deals` declares no such var.) The var **stays an array** — each element is now one Mongo query clause instead of an Atlas-compound clause, and the array is composed into the `$match` via `$and`. Consumers passing custom `filter_match` rewrite each clause in Mongo query syntax:

```yaml
# before (Atlas-compound clauses)
- equals: { path: region, value: "x" }
- range: { path: score, gte: 10 }
# after (plain $match clauses — still an array, ANDed via $and)
- region: "x"
- score: { $gte: 10 }
```

Because the clauses are ANDed rather than shallow-merged, a clause using `$or` is safe and won't collide with the regex fallback's `$or`. The default (`[]`) is unaffected. Switching a deployment to `atlas_search: false` additionally requires the regular `mongod` indexes (documented) for acceptable performance.
