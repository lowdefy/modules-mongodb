# Atlas Search fallback (search portability)

Several modules build their list pages, Excel exports, and the rich contact-selector typeahead on MongoDB Atlas `$search`, which only exists on Atlas (it needs the `mongot` process). On a community/local MongoDB server every one of these pipelines hard-fails, so a self-hosted deployment can't list contacts, companies, activities, or deals — and neither can local development or an e2e run against a plain `mongod`, which is why `apps/workflows-test` cannot exercise the contacts module's selector today. This design makes text search **portable**: a module-level flag selects Atlas `$search` (the default) or a plain-MongoDB regex fallback, and the structural filtering is restructured so the same pipeline works in both modes. It also commits and documents the Atlas Search index definitions the modules have always silently depended on.

> **Scope correction (re-audited at task time).** The inventory below was written against an older tree. Two changes:
>
> - **`user-admin` is out of scope for the fallback itself.** The BetterAuth rebuild removed `$search` from the module entirely — `get_all_users` / `get_user_excel_data` no longer exist, and `requests/stages/members_filter.yaml` is already a plain-`$match` case-insensitive regex over the post-`$lookup` name/email fields, with `request_stages.filter_match` already declared as plain `$match` clauses. It needs no `atlas_search` var. Its search is _always_ the unindexed regex path, even on Atlas; that is documented, not changed. **One change does land there:** `members_filter.yaml` adopts the `$and` composition idiom and the shared escaping, so the repo has a single idiom and the members search stops interpolating raw user input into `$regex` — see decision 2.
> - **`deals` is in scope.** The module landed after this design was written and `requests/get_deals_list.yaml` leads with `$search`, so the demo's deal list hard-fails on local MongoDB — the design's own goal is not met without it. Like `search_contacts` it is **already split** (text-only `$search` followed by a `$match` with a `$and` array), so it needs only the stage-1 toggle, the regex clause, and the score-sort gate. It carries one Atlas-specific extra clause (a boosted keyword-analyzer wildcard on `_id`, the deal code) that the shared builder takes verbatim.
>
> Net: **7 requests across 4 modules** (`contacts`, `companies`, `activities`, `deals`) — 5 of them filters-in-`$search`, 2 already split.

## Proposed change

1. Add a boolean `atlas_search` var (default `true`) to every module that does text search (`contacts`, `companies`, `activities`, `deals`). When `false`, requests use a regex fallback instead of `$search`.
2. Split text search from structural filtering in all affected requests: structural filters (and the consumer filter hook) always run as a standard `$match`; only the free-text term toggles between an Atlas `$search` text stage and a case-insensitive `$regex` `$or`.
3. Centralise the text-stage / regex-clause construction in one shared `_ref` under `modules/shared/search/` so all requests build it identically ("one correct way").
4. Have the shared text stage emit `returnStoredSource: true` by default, with a per-caller opt-out: `activities` and `deals` pass `false` so their post-write refetches read live documents (decision 3). Skip `$search` entirely when there is no search term.
5. Document the Atlas Search index requirement per module — following the repo's existing per-module index-reference convention — alongside the regular `mongod` indexes the browse and fallback paths need. Creation stays the consuming app's job, as it already is for regular indexes.
6. Convert the consumer filter hook (`request_stages.filter_match`) from Atlas-compound syntax to standard `$match` syntax so it works unchanged in both modes (a breaking change to that var; the demo does not use it).

## Background: how search works today

`$search` is the **first stage** of 7 requests across 4 modules. `$search` is Atlas-only, so all 7 fail on local MongoDB:

| Module     | Requests                                      | Collection      | Shape                |
| ---------- | --------------------------------------------- | --------------- | -------------------- |
| contacts   | `get_all_contacts`, `get_contact_excel_data`  | `user-contacts` | filters-in-`$search` |
| contacts   | `search_contacts` (selector typeahead)        | `user-contacts` | already split        |
| companies  | `get_all_companies`, `get_company_excel_data` | `companies`     | filters-in-`$search` |
| activities | `get_activities`                              | `activities`    | filters-in-`$search` |
| deals      | `get_deals_list`                              | `deals`         | already split        |

`modules/contacts/requests/get_contacts_for_selector.yaml` (the `basic-contact-selector`) already uses `$match`+`$sort` with no `$search`, so it works on local today and is **out of scope**. So is `user-admin` — see the scope correction above.

**5 of the 7** requests have the same shape: a single `$search.compound` block mixing two unrelated concerns —

- **Free-text ranking** — a `should` of `text` + `wildcard *term*` over name/email-style fields (`profile.name`, `lowercase_email`; `title` + `description.text` for activities; `name_field` + `lowercase_email` for companies), with results ordered by `$meta: searchScore`.
- **Structural filters** — `equals`/`in`/`range`/`exists`/`mustNot` clauses (e.g. `hidden`, `disabled`, `deleted.timestamp`, `type`, `status.stage`, `roles`, date ranges) plus the consumer `request_stages.filter_match` var (documented as _"Atlas Search compound clauses"_).

The structural clauses all have exact plain-`$match` equivalents. Only the free-text part genuinely needs Atlas.

The other two are **already split**:

- `contacts/requests/search_contacts.yaml` (the rich-selector typeahead) — text-only `$search` followed by a standard `$match` carrying the structural filters, with its own consumer hook: the component-level `filter` var (already plain `$match`, see decision 4), not `request_stages.filter_match`. It has no `$facet`/score sort/pagination, so `score_addfields`/`use_score` are inapplicable — only the stage-1 `text_lead` toggle and the regex clause apply.
- `deals/requests/get_deals_list.yaml` — text-only `$search` followed by a `$match` whose body is already a `$and` array, then `$lookup` + `$facet`. It needs the toggle, the regex clause, and the score-sort gate (its facet `$sort` currently reads `score: -1` unconditionally, which relies on the missing field sorting as null when there is no term). Its `$search` searches `name` by text+wildcard **plus a boosted keyword-analyzer wildcard on `_id`** (the deal code), and it does not lowercase the term — see decision 2's note on `should_extra`.

Decision 2's filters→`$match` restructure therefore lands on the **5** filters-in-`$search` requests; the other two are brought into the same fallback story by the toggle + regex clause alone.

5 of the 7 requests already set `returnStoredSource: true`; `activities/get_activities.yaml` and `deals/get_deals_list.yaml` are the exceptions — `activities` deliberately so (`modules/activities/CHANGELOG.md:126`, PR #68), which decision 3 preserves. **No module documents its search-index requirement** — the `storedSource` config these requests depend on is stated nowhere, so a fresh Atlas project has no reference for what to create. (`docs/deals/index.md` is the sole partial exception: it names the `deals` search index and its fields, but predates this restructure.)

## Key decisions

### 1. Regex substring fallback, not `$text`

The current UX is **substring typeahead** (`joh` → `John`), implemented with `wildcard *term*`. MongoDB's native `$text` index only does whole-word stemmed matching (no substring), allows just one text index per collection, and can't be combined per-field the way this needs — it would silently change behaviour.

The fallback is therefore a case-insensitive `$or` of `$regex` over the same fields the Atlas text clause searches:

```yaml
$or:
  - profile.name: { $regex: <escaped-term>, $options: i }
  - lowercase_email: { $regex: <escaped-term>, $options: i }
```

This preserves substring matching exactly. What's lost is **relevance ranking** — there is no `searchScore` — so fallback results use the existing field sort (the same sort the Atlas path uses when there's no search term). User input is **regex-escaped** before interpolation (escape `.[]{}()*+?^$|\` and `/`) so metacharacters can't break the query or be injected.

Trade-off, and why Atlas stays the default: an unanchored regex (`*term*`) can't use a btree index, so it's a collection scan. Fine for local/dev and CRM-scale collections; not a substitute for Atlas at large scale. The flag defaults to `atlas_search: true` precisely so production keeps the indexed path.

### 2. Split text from filters (so only the text stage toggles)

Rather than branch the _whole_ pipeline per request — which would mean ~8 parallel pipeline copies guaranteed to drift, and a `filter_match` that silently does nothing in fallback mode — we pull the structural filters **out of `$search`** into a normal `$match` that runs in **both** modes. The flag then toggles only the text mechanism and the sort tie-break:

|         | Atlas + term            | Atlas, no term     | Fallback (any)                             |
| ------- | ----------------------- | ------------------ | ------------------------------------------ |
| Stage 1 | `$search` (text only)   | _(skipped)_        | _(skipped)_                                |
| Filter  | `$match` (filters)      | `$match` (filters) | `$match` (filters + `$or` regex when term) |
| Sort    | `score`, then tie-break | field sort         | field sort                                 |

**Two independent gating dimensions — keep them on the right operator.** The skeleton toggles on two things, and they resolve at different times:

- **`atlas_search`** is a `_module.var` — a build-time literal. When it's `false` the entire Atlas text mechanism can be dropped **at compile** with `_build.*`.
- **`term` (`_payload: filter.search`)** is runtime-only. "Skip `$search` when there's no search term" and the `score` toggle are **runtime** decisions, so the stages they gate must appear/disappear via a runtime `_array.concat` + `_if` returning `[]`/`[stage]` — exactly the pattern the current requests already use inside their `must` array. A runtime-gated stage cannot be spliced by an outer `_build.array.concat` (the build pass would try to flatten an unresolved operator).

So the **outer pipeline assembly is a runtime `_array.concat`**; `_build.*` is reserved for the `atlas_search` dimension alone (dropping the text mechanism when the flag is `false`). Resulting pipeline skeleton (per request):

```yaml
pipeline:
  _array.concat: # runtime concat — `text_lead`/`score_addfields` appear/disappear on the runtime term
    - <text_lead> # [ $search text-only ] when atlas_search (build) && term (runtime), else []
    - - $match:
          $and: # every entry is spliced in as an array, so gated-off pieces leave nothing behind
            _array.concat:
              - - <structural filters> # standard Mongo query, written once
              - <regex_clause> # [ { $or: [...] } ] when !atlas && term, else []
              - <request_stages.filter_match> # consumer $match clauses, nulls dropped (decision 4)
    - <score_addfields> # [ { $addFields: { score: { $meta: searchScore } } } ] when atlas && term, else []
    -  # ...existing $facet / $sort / $skip / $limit / derived stages...
```

Each gated piece is a runtime `_if` (on `term`) wrapped by a build-time `_build.if` (on `atlas_search`): when `atlas_search` is `false` the builder emits a literal `[]` at compile, so no `$search`/`score` operator survives into the runtime pipeline at all; when it's `true` the builder emits the runtime `_if` that gates on `term`.

The `$sort` inside the facet uses `score` only when `atlas_search && term`; otherwise the existing field sort (`sort.by`/`sort.order` + `_id`). This is a small tweak to the runtime `_if` test each request already has — the `$facet` continues to use `_build.array.concat` to splice the build-time-known `request_stages.*` stages, which is correct because those splice points are build-time literals.

**Merge semantics — `$and`, not shallow assign.** The `$match` body combines three sources that can collide on a key: the structural filters, the `regex_clause` (`{ $or: [...] }`), and the consumer `request_stages.filter_match`. A shallow `_object.assign` is last-writer-wins keyed by top-level field, so collisions vanish silently — concretely, `get_activities` filters `updated.timestamp` twice (`filter.date_from` → `$gte`, `filter.date_to` → `$lte`); merged as two assign entries the second clobbers the first and one bound is lost. Likewise a consumer `filter_match` using `$or` would clobber the regex clause's `$or`. So the `$match` body wraps the clauses in a top-level **`$and`** array (empty entries dropped), which composes any clauses without key collisions and is collision-proof by construction rather than by authoring discipline. The `$and` array is never empty — every one of these requests carries at least one unconditional structural clause (`hidden`/`disabled`, `deleted.timestamp`, `removed`) — so the `$and: []` MongoDB rejects cannot arise. (The doubled `updated.timestamp` bounds may still be authored as one nested object for tidiness, but `$and` no longer _requires_ it.)

**`$and` is the repo-wide idiom, so `user-admin` adopts it too.** `modules/user-admin/requests/stages/members_filter.yaml` solves the identical problem — compose four optional `$match` clauses — and its header documents the opposite choice: merge into one object via `_object.assign` rather than wrap in `$and`, so that with no filter set the stage is the canonical match-all `$match: {}`, since `$and: []` is rejected by MongoDB. Leaving that stand would put two documented, mutually-contradicting idioms for one job in neighbouring modules — the drift "one correct way" exists to prevent.

The stated obstacle does not survive scrutiny: `members_filter.yaml` already seeds its `_array.concat` with `{}`, so the `$and` form yields `$and: [{}]` with no filter set, which MongoDB accepts (verified — see [§Shared builder](#shared-builder)). Only the empty array is rejected. So `user-admin` converts to the `$and` shape, and while that stage is open it also routes its `$regex` through the shared `regex_value.yaml`, which closes a live defect: it currently interpolates `filter.search` into `$regex` **unescaped**, so a `(` in the members search box errors and `.*` matches everything.

This is the module's **only** change. `user-admin` still gets no `atlas_search` var and no `$search` — see the scope correction and non-goals.

**Emergent property:** when there's no search term, `$search` is skipped entirely, so the browse / filter / paginate path becomes `$match`+`$sort` on **both** Atlas and local — identical behaviour. Only an actual text query diverges between modes. This shrinks the surface that needs Atlas-specific testing to "did someone type in the search box."

### 3. What filters-in-`$match` costs, and why the trade is worth taking

The classic reason to keep filters inside the `$search.compound` is to filter on the search index before the `_id`→full-document hydration round-trip from `mongot` back to `mongod`. That rationale only holds **without** stored source. With `returnStoredSource: true` and a `storedSource`-configured index, `$search` returns documents straight from `mongot`, skipping the hydration round-trip — so a `$match` over those returned docs costs no extra round trip. Moving filters to `$match` is therefore comparably fast per document _and_ readable _and_ works unchanged in fallback mode.

**Per-document cost is not the whole story: volume changes too.** Filters inside `$search` let `mongot` narrow on both dimensions at once and return only survivors. After the restructure `mongot`'s result set is scoped by the **text term alone**, and `mongod` discards the rest. The regular `mongod` indexes of decision 5 do not help here — `$match` runs on the `$search` output stream, not the collection — so this is a genuine cost, not one an index closes.

It is concentrated in one request. `get_all_contacts` filters only on `hidden`/`disabled` and `get_all_companies` only on `deleted.timestamp` — non-selective predicates excluding a small minority, so their volume barely moves. **`get_activities` is the sharp case**: six selective filters (`type`, `status.stage`, `contacts.contact_id`, `company_ids`, and two `updated.timestamp` bounds), so "activities whose title or description contains `*a**`" versus "…that are also meetings, in stage `done`, for one contact, in a date window" can differ by orders of magnitude — and it is also the request that opts out of stored source, so it pays the hydration for that whole pre-filter set. (`get_deals_list` is unaffected: its `removed: null` clause already sits in a `$match` after `$search` today, and it already swaps in `$match: {}` when there is no term.)

**The counterweight, which is why the trade is worth taking.** Today `$search` runs on _every_ list load, because the structural filters live inside it — so even a plain browse with an empty search box pays a `mongot` round-trip and cannot use regular `mongod` indexes for the filter or the sort. Under this design a no-term load skips `$search` entirely and is a plain indexed `$match` + `$sort`. Ranking the shapes:

- **Term present:** filters-in-`$search` (today) > filters-in-`$match` with stored source > filters-in-`$match` without it.
- **No term:** this design (no `$search` at all) > today.

So the restructure does not give up performance wholesale; it moves cost off every list load and onto the subset where a user has actually typed something. Accepted at CRM-scale collections, where the text-matched set is bounded by the term and hydration is an `_id`-keyed batch fetch. Filters-in-`$search` is not free either: its compound syntax diverges from the plain-`$match` path everywhere else, which is what produced the silently-never-matching `status.0.stage` clause (`modules/activities/CHANGELOG.md`).

This is already the de-facto pattern (5 of the 7 requests), so the shared text-stage builder emits `returnStoredSource: true` by default.

**Two callers opt out — and that is a preserved decision, not an inconsistency to fix.** `activities/get_activities.yaml` omits the flag _deliberately_: `modules/activities/CHANGELOG.md:126` (PR #68) records dropping it "so post-write refetches return the live doc immediately instead of waiting on Atlas Search index replication." Stored source returns `mongot`'s copy of the document, which lags writes, so editing an activity and refetching the list showed the pre-edit values. `text_lead.yaml` therefore takes `returnStoredSource` as a `_ref` var (default `true`), and `activities` and `deals` pass `false` — `deals`' list is refetched after every deal write and carries the same exposure. These are builder-internal `_ref` vars, not module vars: no manifest entry, no consumer-facing surface.

Because the filters now run _after_ `$search`, the two modes cost differently:

- `returnStoredSource: true` — `mongot` returns the text-matched documents with their bodies; `mongod` filters them and never touches the collection.
- `returnStoredSource: false` — `mongot` returns `_id`s and `mongod` hydrates the **whole text-matched set** before the filters narrow it, paying a full-document lookup for documents it then discards. That is the price of freshness, and it lands only when a term is present. `activities` is plausibly the largest of the four collections, so the cost is real rather than nominal; it is stated in `docs/shared/search.md` instead of left to be rediscovered.

Decision 2's emergent property narrows the exposure for every request, opted out or not: with no search term there is no `$search` stage at all, so a post-write refetch on an unfiltered list reads live from `mongod` — better than today. The residual case for the five that keep stored source is "a search term is active, the user edits a visible row, the list refetches", where those rows come from `mongot`'s copy and can show pre-edit values. Accepted for those five; the two whose write flows make that routine opt out. (Note the flag governs only document _contents_: which rows `$search` returns always depends on the `mongot` index, so a newly created record does not appear in a term-filtered list in either mode.)

**The footgun (documented prominently):** if `storedSource` omits a field that a post-`$search` `$match` references, `returnStoredSource` docs silently lack it. A `hidden: { $ne: true }` filter then stops excluding hidden docs (missing ≠ `true`), and positive `equals`-style filters exclude everything. Mitigation: configure **`storedSource: true`** (store the whole document) — see decision 5. The two callers that opt out of `returnStoredSource` are immune by construction: their `$match` always runs on live documents from `mongod`.

**This footgun is already live, not hypothetical.** `search_contacts` today runs `returnStoredSource: true` and then `$match`es on `hidden`, `disabled`, and `global_attributes.company_ids`. With no search index documented anywhere, if the deployed `default` index doesn't store those fields the filter is _already silently wrong on Atlas_. So `storedSource: true` (decision 5) isn't only fallback-enabling — it closes a pre-existing latent correctness gap, which strengthens the case for storing the whole document by default.

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

Boolean (not an enum) because regex is the only fallback we have a concrete need for; an enum would be speculative surface. It reads naturally as "default Atlas."

**Each app is wired for the database it actually runs on, which is also what keeps both branches compiled.** `apps/demo` sets `true`: it is the consumer-facing reference and the general deployment target, running against a real MongoDB with Atlas Search, so it should show the production wiring. `apps/workflows-test` sets `false`: it exercises module config against a plain e2e `mongod`, and its field-render sweep renders the contacts module's `contact-selector`, whose typeahead leads with `$search`. Building each app therefore compiles a different branch of the shared builder, so neither half can rot — without the demo carrying configuration that exists only to be tested. The demo is a reference for consumers, not a test matrix.

**How consumers set this app-wide: one value in `app_config.yaml`, `_ref`'d per module entry.** `atlas_search` describes a property of the deployment's database — whether Atlas Search exists — so it is identical for every searchable module in an app. Repeating the literal on four entries makes one app-level fact live in four places. Instead each app holds it once:

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

**This reintroduces a file [`designs/app-operator`](../app-operator/design.md) deleted, deliberately and without conflict.** That design did not reject the shared-config pattern; `app_config.yaml` held exactly one key (`app_name`), `_app: slug` replaced it, and the file was removed because nothing read it any more (its tasks 7 and 8). A one-key file whose key becomes obsolete gets deleted; that says nothing about the next app-level key. `atlas_search` is a better fit for the file than `app_name` ever was — `app_name` was app _identity_, which the platform can now supply via `_app`, whereas this is deployment _capability_, which no operator exposes. It holds this one key; do not populate it speculatively.

There is no operator route: `_app` reads only app metadata (`slug`, `name`, `version`, `description`) and cannot carry an arbitrary app-level flag, and `_secret` is server-runtime-only, which would forfeit decision 2's build-time collapse.

To be clear about what the shared file does and does not buy: it does **not** eliminate drift, because a newly added module entry can still forget the `_ref`. What it gives is a single source of truth for which mode the app is in, and one edit to switch it. The residual drift is also the benign kind — unlike `app_name`, where missing one entry silently keyed stored documents under the wrong app forever, a missed `atlas_search` fails loudly on that module's first list-page load and touches nothing stored.

Because the structural filters are now standard `$match`, the consumer hook `request_stages.filter_match` must also be standard `$match` syntax (not Atlas compound). This is a **breaking change** to that var, but it then works identically in both modes — one syntax instead of two. The demo does not pass `filter_match` (only `request_stages.write`), so blast radius is low; the change is called out in the module CHANGELOGs and the migration note below.

**Two consumer hooks, deliberately separate.** There are two filter-extension points, at different layers, and they stay distinct:

- `request_stages.filter_match` — a **module var** set by the app consumer on the module entry, feeding the heavy list/Excel requests. An **array of clauses**; converted from Atlas-compound to plain `$match` here.
- `filter` — a **component/`_ref` var** on the `search_contacts` selector pipeline, one layer down: the `contact-selector` block exposes it and passes it through to the typeahead request. A **single `$match` object**, default `{}`, and **already plain `$match`** today.

They differ on every axis — who sets it (app config vs. a page composing the selector block), which request it feeds (faceted list vs. capped typeahead), shape (array vs. object), and starting syntax — so unifying them would mean reworking the already-correct selector for no functional gain. Post-redesign both are plain `$match`, so they are consistent in _syntax_; they remain distinct in _name and layer_ by design.

### 5. Index requirements: documented per module, following the existing convention

The gap this design closes is that **nothing tells a consumer what search index to create** — the `storedSource` config the requests depend on is stated nowhere. The repo already has a convention for closing exactly that gap, and this design uses it rather than inventing a second mechanism:

- `docs/user-account/reference/indexes.md` and `docs/workflows/reference/indexes.md` — per-module index reference pages, opening with the module-creates-nothing statement and giving each index its `createIndex` snippet, the query sites that need it, and why it is shaped that way.
- `docs/deals/index.md`'s `## Required indexes` section states the division of labour outright: "The module documents the contract; the app owns creating them (e.g. under its own `actions/indexes/indexes/{app}/deals/` via `splice-actions`)." It **already documents this module's Atlas Search index** in prose.

So we document the search-index contract per module and leave creation to the app, the same way the regular `mongod` indexes are handled. **We do not commit index-definition JSON into the module tree.** That would be a second mechanism for one job, inconsistent with the regular-index half of this very decision, and it cannot deliver what committing files appears to buy: `splice-actions`' tree is `indexes/{project}/{collection}/{name}.json`, and `{project}` is per-app, so a file from this repo is never copied verbatim regardless.

Documenting rather than shipping files also removes two problems the file approach creates. The collection binding is simply a sentence (`deals` already writes "an index named `default` on `deals`") instead of something a path has to encode. And the design makes no claim about any external tool's accepted schema — `storedSource` is documented as a **requirement of the index**, which the app satisfies with whatever tooling it uses, rather than asserted to be a field `splice-actions` forwards. That claim was unverifiable from this repo: the tool's reference documents `{ name, mappings }` only, and its writer is not vendored here.

Per module, the documented contract is an index named **`default`** (no `$search` stage specifies a non-default `index:` — most omit the option entirely and `deals/get_deals_list.yaml` sets `index: default` explicitly), with `dynamic: false` and **only the text fields** mapped as `string`. Because filters moved to `$match`, none of the `token`/filter-field mappings a filters-in-`$search` index would carry are needed:

- **`contacts`** → the mapped `user-contacts` collection: `profile.name`, `lowercase_email`. Serves `get_all_contacts`, `get_contact_excel_data`, and the `search_contacts` typeahead. **Requires stored source covering the whole document**, because all three query with `returnStoredSource: true` and then `$match` on fields the mappings do not include — see the footgun in decision 3. Not required by `user-admin`, which reads the same collection but no longer uses `$search` at all.
- **`companies`** → `companies`: **`name`** + `lowercase_email`, also with whole-document stored source. **Coupling to the `name_field` var:** `get_all_companies` searches `_module.var: name_field`, which a consumer can override; the documented contract maps the default `name`. A consumer who overrides it must map their field instead, or Atlas `$search` silently returns no text matches on it while the regex fallback — which reads the var at query time — still works, producing a mode-dependent discrepancy.
- **`activities`** → `activities`: `title`, `description.text`. **No stored source needed** — `get_activities` passes `returnStoredSource: false` (decision 3), so nothing reads `mongot`'s copy and storing documents would cost index storage for a path no query takes.
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

Regular `mongod` indexes matter too — for the no-term browse path (decision 2) on Atlas _and_ for the fallback regex mode's filter/sort. They go on the same four pages, in the same style (fields such as `hidden`, `disabled`, `deleted.timestamp`, `removed`, `updated.timestamp`, and each list's configured sort fields). `user-admin` has **no search-index requirement at all** — its members search is always a regex `$match` — so it gets no index reference page here; its indexes are outside this design's scope, and the only note it needs is the one in decision 6.

### 6. Documentation

- `docs/shared/search.md` — new shared concept page: the `atlas_search` flag, what the fallback does and its limits (substring, no ranking, unindexed scan), the `returnStoredSource` + `storedSource: true` requirement, the missing-field footgun, and the freshness-vs-lookup trade behind `activities`/`deals` opting out of stored source (decision 3). Linked from each searchable module's `index.md`.
- Per-module index reference: the `default` search index requirement (mapped fields, and whether stored source is needed) plus the required regular `mongod` indexes, in the style of `docs/user-account/reference/indexes.md`. The companies page also documents the `name_field`-override → remap-the-search-index coupling (decision 5).
- `docs/user-admin/index.md` links the same shared page, stating that the module needs **no** `atlas_search` var because its members search is always a plain-`$match` regex. Without that note a reader comparing modules reads the missing var as an oversight.
- Manifest `description:` for the new `atlas_search` var (drives generated `docs/{module}/reference/vars.md` via `pnpm docs:gen`).

## Shared builder

`modules/shared/search/` holds the single source of truth for text-stage construction, referenced by all 7 requests with `_ref` + `vars` (the relative-path `_ref` idiom already used for `../shared/profile/*`, `../shared/layout/*`, `../shared/sessions/*`). It is **one file per splice point** — each is ref'd independently, so no `_ref` needs to combine `path` + `key` + `vars`, a combination with no precedent in this repo.

**What counts as "no term".** All four gated pieces test the term against the **empty string**, not `null`: `_ne: [ { _if_none: [ { _var: term }, "" ] }, "" ]`. Three states must read as absent — the key missing (a list request before its filter block is touched), `null`, and the `""` a cleared input leaves behind — and `_if_none` collapses the first two into the third so one test covers all three. `search_contacts` already gates on `""` for precisely this reason: its term is the `ContactSelector` search box, and clearing the box yields `""`. Centralising the test also tightens the five list/Excel requests, whose current `_ne: [filter.search, null]` lets `""` through into a `$search` with an empty `text` query — which Atlas rejects, and which in fallback mode would become `{ $regex: "", $options: i }`, matching every document.

Every piece composes the two gating dimensions from decision 2: a build-time `_build.if` on `atlas_search` (passed in as `{ _module.var: atlas_search }`, which resolves before `_build.*` — precedent: `modules/contacts/components/contact-selector.yaml.njk:207-209` uses `_build.if: { test: { _module.var: use_verified } }`, and `modules/user-admin/api/reinstate.yaml:11-13` uses `_build.not: { _module.var: suspension }` inside a `_build.if` test) wrapping a runtime `_if` on `term`. Every **gated** piece that lands in a pipeline or `$and` position returns an **array** (`[]` or `[clause]`), so a gated-off piece vanishes through `_array.concat` rather than leaving an empty object behind. The rule is about things that appear or disappear; a var that always contributes exactly one clause slot (the selector's `filter`, default `{}`) sits directly as an `$and` entry, because wrapping it in a one-element array would relocate its empty default rather than remove it. That is safe: `$and` accepts `{}` entries — verified on mongod 8.3.4, where `$and: [{a:1}, {}]`, `$and: [{}]`, and `$match: { $and: [{hidden:{$ne:true}}, {}, {}] }` all parse, and only `$and: []` is rejected (`BadValue: $and argument must be a non-empty array`).

| File                   | Vars                                                                                   | Returns                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `text_lead.yaml`       | `atlas_search`, `term`, `paths`, `should_extra`, `returnStoredSource` (default `true`) | `[ { $search: { returnStoredSource: <var>, compound: { should: [...] } } } ]` when atlas (build) && term (runtime), else `[]` |
| `regex_value.yaml`     | `term`                                                                                 | `{ $regex: <escaped term>, $options: i }` — owns escaping, nothing else                                                       |
| `regex_clause.yaml`    | `atlas_search`, `term`, `or`                                                           | `[ { $or: <or> } ]` when !atlas (build) && term (runtime), else `[]`                                                          |
| `score_addfields.yaml` | `atlas_search`, `term`                                                                 | `[ { $addFields: { score: { $meta: searchScore } } } ]` when atlas && term, else `[]`                                         |
| `use_score.yaml`       | `atlas_search`, `term`                                                                 | the `$sort` `_if` test — build-collapses to `false` when !atlas, else a runtime predicate on `term`                           |

**Why the regex fan-out is split across two files.** Building `$or: [ { <path>: <regex> }, … ]` from a `paths` list needs iteration with a dynamic key, and every available mechanism is either unproven here or breaks a caller: `_array.map` + `_function` would put the term's runtime operator inside a `_function` body (no precedent in this repo, and the `__`-prefix scoping rules make it a guess), a `_build.array.map` callback has no precedent either, and a `.yaml.njk` loop cannot interpolate `companies`' `paths` because one of them is `{ _module.var: name_field }` — an operator, not a literal string. So the fan-out is authored per request (2 clauses each; 3 for `deals`), each clause getting its regex value from `regex_value.yaml`. The security-relevant part — escaping — stays single-source, which is the point.

**Escaping** (verified, `_string.replace` is `String.prototype.replace` and is available server-side, where request properties evaluate):

```yaml
_string.replace:
  on:
    _var: term
  regex: '[.*+?^${}()|[\]\\/]'
  newSubstr: '\$&'
  regexFlags: g
```

Single-quoted YAML keeps both strings literal; `$&` re-inserts the matched metacharacter after the added backslash. Verified against `jo.h*n (a)+b[c]\d/e^$|{2}?` → `jo\.h\*n \(a\)\+b\[c\]\\d\/e\^\$\|\{2\}\?`, which matches the input literally and no longer matches `joXhnn`.

**`should_extra`** (default `[]`) exists for `deals`, whose Atlas clause set includes a boosted `keywordAnalyzer` wildcard on `_id` that must **not** be lowercased and must not join the `text` clause. The caller passes that clause verbatim and the builder splices it into the `should` array inside its gate, so a caller-specific Atlas quirk stays with its caller while the gating stays shared. The generic clauses lowercase the term (`_string.toLowerCase`), as 5 of the 7 requests already do — `search_contacts` and `deals`' generic `name` clause gain that lowercasing, which is what makes the `wildcard` clause match the lowercase-stored `lowercase_email`. The regex fallback needs no lowercasing; `$options: i` covers it.

Because `term` is runtime, the splice points that consume `text_lead`/`score_addfields` (the outer pipeline `_array.concat`) must themselves be **runtime** `_array.concat`, never `_build.array.concat` — see decision 2. Adding an eighth searchable request, or changing how the fallback escapes input, stays a one-file change.

## Files changed

**Modules (manifests + requests):**

- `modules/{contacts,companies,activities,deals}/module.lowdefy.yaml` — add `atlas_search` var; restate `request_stages.filter_match` description as `$match` syntax in the three modules that declare it (`deals` has no such var).
- **5 request files restructured** (filters → `$match`, text via shared builder): `contacts/requests/{get_all_contacts,get_contact_excel_data}.yaml`, `companies/requests/{get_all_companies,get_company_excel_data}.yaml`, `activities/requests/get_activities.yaml`.
- **2 requests adjusted** (already split — toggle + regex clause, plus the score-sort gate for `deals`): `contacts/requests/search_contacts.yaml`, `deals/requests/get_deals_list.yaml`.
- `modules/user-admin/requests/stages/members_filter.yaml` — `_object.assign` → `$and`, and its `$regex` routed through the shared `regex_value.yaml` (decision 2). No `atlas_search` var, no `$search`.

**New shared files:**

- `modules/shared/search/*.yaml` — the text-stage builder (five files, see [§Shared builder](#shared-builder)).

No index-definition files are added; the index requirements are documented per module (decision 5).

**Demo + docs:**

- `apps/demo/app_config.yaml` (reinstated, `atlas_search: true`) and `apps/workflows-test/app_config.yaml` (`atlas_search: false`) — see decision 4.
- `apps/demo/modules/{contacts,companies,activities,deals}/vars.yaml` — `_ref` the app's `atlas_search` value.
- `apps/workflows-test/modules.yaml` — `_ref` the same on its `contacts`/`companies` entries, plus new `deals` + `activities` entries so all four modules' fallback branches compile against its plain e2e `mongod`.
- `.github/workflows/ci.yaml` — build both apps, so each flag branch is gated rather than merely available (CI currently builds no app).
- `docs/shared/search.md` (new); module `index.md` links; regenerated `docs/{module}/reference/vars.md`; a changeset for the four module packages.

## Non-goals

- The `basic-contact-selector` (`get_contacts_for_selector`) — already non-Atlas, unchanged.
- Giving `user-admin` an `atlas_search` var, or moving it onto `$search` when the flag is `true`. Its members search is a plain-`$match` regex over post-`$lookup` fields, so it is already portable; reintroducing Atlas surface the module deliberately dropped would mean indexing fields that only coexist after the joins. Its unindexed-on-Atlas cost is documented, not fixed here. (The module is not untouched, though — `members_filter.yaml` adopts the `$and` idiom and the shared escaping, decision 2.)
- Replicating relevance ranking in fallback mode — fallback intentionally uses field sort.
- Index-management tooling, and shipping index-definition files — we document the search and regular index requirements per module; creating them on a cluster stays the consuming app's job, exactly as it already is for regular indexes.
- Atlas Search features beyond `text`/`wildcard` (synonyms, fuzzy, faceting) — none are used today.

## Migration note

`request_stages.filter_match` changes from Atlas-compound clauses to standard `$match` clauses (decision 4) in the three modules that declare it — `contacts`, `companies`, `activities`. (`user-admin` declares the var too, but its clauses are **already** plain `$match`, so consumers of that module have nothing to change; `deals` declares no such var.) The var **stays an array** — each element is now one Mongo query clause instead of an Atlas-compound clause, and the array is composed into the `$match` via `$and` (decision 2). Consumers passing custom `filter_match` rewrite each clause in Mongo query syntax. A multi-clause example:

```yaml
# before (Atlas-compound clauses)
- equals: { path: region, value: "x" }
- range: { path: score, gte: 10 }
# after (plain $match clauses — still an array, ANDed via $and)
- region: "x"
- score: { $gte: 10 }
```

Because the clauses are ANDed via `$and` (not shallow-merged), a clause using `$or` is safe and won't collide with the regex fallback's `$or`. The default (`[]`) is unaffected. Switching a deployment to `atlas_search: false` additionally requires the regular `mongod` indexes (documented) for acceptable performance.
