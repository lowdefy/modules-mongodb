# Review 2

Scope: `designs/search-fallback/design.md` plus the ten task files under
`designs/search-fallback/tasks/` (untracked at review time). Verified against the seven
affected request files, the four module manifests, `modules/user-admin/requests/stages/members_filter.yaml`,
the module CHANGELOGs, `@lowdefy/operators-js`' `_string` implementation, the `r:index-dev`
search-index format, and the `../shared/*` `_ref` precedent.

All five findings in `review-1.md` carry resolutions and are not revisited. The mechanics
review-1 flagged are now correct: the runtime-vs-`_build` split, the `$and` merge, the
`filter_match` array shape, and the `name_field` coupling all check out against the source.
Two mechanisms the design asserts are also confirmed:

- `_ref: ../shared/search/*.yaml` from a module request file resolves module-root-relative —
  `modules/user-admin/requests/get_user_sessions.yaml:23` already does exactly this.
- `_string.replace` takes named args `on` / `regex` / `newSubstr` / `regexFlags` and builds
  `new RegExp(regex, regexFlags)` (`@lowdefy/operators-js/src/operators/shared/string.js:68-72`),
  so the escape expression in `regex_value.yaml` is correct as written, `g` flag included.

## Behaviour regressions

### 1. `returnStoredSource: true` was deliberately removed from `get_activities`; the design reinstates it as a bug fix

> **Resolved.** Took the proposed fix: `returnStoredSource` becomes a `_ref` var on `text_lead.yaml` (default `true`), and `activities` + `deals` pass `false`. PR #68 is preserved rather than reversed by argument, and the CHANGELOG is now cited in decision 3 and task 6 so it isn't re-litigated. The "inconsistency" framing is gone from proposed change #4, decision 3, and task 6.
>
> Decision 3 now also states what each mode costs given filters run after `$search` — stored source means `mongod` never touches the collection; without it `mongod` hydrates the whole text-matched set before the filters narrow it, paying a lookup for rows it discards, and `activities` is plausibly the largest of the four collections. The flag governs document _contents_ only: which rows `$search` returns always depends on the lagging `mongot` index, so a newly created record is absent from a term-filtered list either way. Residual staleness for the five requests that keep stored source ("term active, user edits a visible row, list refetches") is accepted and stated.
>
> Consequence carried through: the `activities` and `deals` index definitions omit `storedSource` entirely (decision 5, task 8) — no query there reads `mongot`'s stored copy, so storing whole documents would buy nothing. `docs/shared/search.md` (task 10) documents the opt-out and its cost once, rather than in two module pages.

Proposed change #4 says the design will "standardise `returnStoredSource: true` across all
`$search` stages (adds it to `activities`, which is currently missing it)", decision 3 calls
this fixing "the `activities` and `deals` inconsistencies", and task 6 (line 20) states "this
is the only request missing `returnStoredSource: true` … so this conversion fixes the
inconsistency."

It is not an inconsistency. `modules/activities/CHANGELOG.md:126` (PR #68) records:

> `get_activities.yaml` now runs `lookup_contacts` + `lookup_companies` stages so the list
> table's Contacts/Companies columns populate. **Dropped `returnStoredSource: true` so
> post-write refetches return the live doc immediately instead of waiting on Atlas Search
> index replication.**

So the flag was removed on purpose, to fix a user-visible staleness bug: create or edit an
activity, the list refetches, and with stored source the row comes from `mongot`'s copy —
which lags. The design reverses that decision without acknowledging it exists, and because
`text_lead.yaml` hardcodes `returnStoredSource: true` there is no way for a caller to opt out.
The same exposure lands on `deals/get_deals_list`, which has never set it and whose list is
refetched after every deal write.

Note the design's own emergent property narrows the blast radius considerably: with no search
term, `$search` is skipped entirely, so a post-write refetch on an unfiltered list now reads
live from `mongod` — better than today. The residual case is "user has a search term active,
writes a record, list refetches" — which is exactly the flow the activities quick-capture
modal produces.

Proposed fix: make `returnStoredSource` a var on `text_lead.yaml` (default `true`), and have
`activities`/`deals` pass `false`, with the reason stated once in `docs/shared/search.md`
alongside the `storedSource` footgun. Alternatively decide explicitly that the emergent
property mitigates the original bug well enough to reverse PR #68 — but that has to be an
argued decision in the design, not framed as tidying an inconsistency. Either way, task 6's
line 20 and the design's "inconsistency" framing must go, and the CHANGELOG entry must be
cited so the next reader doesn't re-litigate it.

### 2. `text_lead`'s term gate is null-only, but `search_contacts` gates on the empty string — the typeahead regresses on a cleared search box

> **Resolved.** Took the proposed fix verbatim: all four gated builder files now test `_ne: [ { _if_none: [ { _var: term }, "" ] }, "" ]`. `_if_none` collapses absent and `null` into `""`, so one test covers all three "no term" states. Recorded in the design's shared-builder section (a new "What counts as no term" paragraph), in task 2's gate blocks and its notes, and in task 4, which previously listed lowercasing as the only behaviour change and did not mention the gate at all.
>
> Confirmed against source while resolving: the typeahead's term is `_state: <id>_input` from the search box (`contact-selector.yaml.njk:90-91`), and `get_all_contacts.yaml:30-32` does gate on `null` only — so the tightening genuinely improves the five list/Excel requests too, where `""` currently reaches `$search`. Also noted that in fallback mode an empty term is wrong differently: `{ $regex: "", $options: i }` matches every document rather than erroring.

`text_lead.yaml` (task 2, lines 44-49) gates on:

```yaml
_ne:
  - _if_none: [{ _var: term }, null]
  - null
```

`search_contacts.yaml:30-37` gates on the **empty string**:

```yaml
_eq:
  - _if_none: [{ _payload: input }, ""]
  - ""
then: []
```

That difference is not cosmetic. The typeahead's term is `_state: <id>_input`, set by the
`ContactSelector` search box (`contact-selector.yaml.njk:90-91`). A user who types and then
clears the box leaves `""`, not `null` — the existing gate handles `""` explicitly, which is
strong evidence the author hit it. Under `text_lead`'s null-only gate, `""` passes the gate and
the request emits `$search` with `text: { query: "" }` and `wildcard: { query: "**" }`. Atlas
rejects an empty `text` query, so the typeahead errors instead of returning the unranked
top-10 it returns today.

Task 4 lists the lowercasing change as the one deliberate behaviour change to this request and
does not mention the gate at all.

Proposed fix: make the shared gate treat `""` as absent — `_ne: [{ _if_none: [{ _var: term }, ""] }, ""]`
in `text_lead.yaml`, `regex_clause.yaml`, `score_addfields.yaml`, and `use_score.yaml`. That
also strictly improves the five list/Excel requests, whose current `_ne: [filter.search, null]`
tests already let `""` through into a `$search` with an empty `text` query. Fixing it once in
the builder is the point of having a builder.

### 3. Decision 3's perf argument covers hydration but not result-set volume

> **Resolved.** Decision 3 is retitled (the "no perf regression" claim is gone) and now states the volume trade: after the restructure `mongot`'s result set is scoped by the text term alone, and the regular `mongod` indexes don't help because `$match` runs on the `$search` output stream.
>
> Two corrections to the finding, both verified. It is concentrated in **`get_activities` alone** — `get_all_contacts` (`hidden`/`disabled`) and `get_all_companies` (`deleted.timestamp`) carry only non-selective soft-delete predicates, so their volume barely moves. And `get_deals_list` is unaffected: `get_deals_list.yaml:57` already has `removed: null` in a `$match` after `$search`, and already swaps in `$match: {}` when there is no term. Activities compounds with #1 (it also opts out of stored source, so it hydrates that whole pre-filter set) and is now named as the sharp case in both decision 3 and task 6's notes.
>
> Decision 3 also gains the counterweight the finding omits, which is what makes the trade defensible rather than merely honest: today `$search` runs on _every_ list load, so a plain browse pays a `mongot` round-trip and can't use `mongod` indexes for filter or sort; under this design a no-term load skips `$search` entirely. The cost moves off every list load and onto the subset where a term is typed. Shapes ranked explicitly for both cases.

Decision 3 argues that `returnStoredSource: true` makes filters-in-`$match` "comparably fast"
because it "skips the hydration round-trip — so a `$match` over those returned docs costs no
extra round trip." That is true about _per-document hydration_ and false about _how many
documents cross the wire_. Today `mongot` applies the structural filters and returns only
survivors; afterwards it returns every document matching the free-text clause and `mongod`
narrows.

`get_activities` is the sharp case: it carries six selective filters (`type`, `status.stage`,
`contacts.contact_id`, `company_ids`, and two `updated.timestamp` bounds,
`get_activities.yaml:53-127`). "All activities whose title or description contains `*a*`"
versus "…that are also meetings, in stage `done`, for one contact, in a date window" can differ
by orders of magnitude, and the whole unfiltered set is now materialised from stored source
before `$match` runs. `get_deals_list` loses its `removed: null` prefilter the same way.

This does not overturn the decision — the restructure is what makes the pipeline portable, and
the cost only applies when a term is present — but the design should state the trade honestly
rather than claiming no regression. Add to decision 3: post-`$search` filtering means the
mongot→mongod result set is scoped by the text term alone, so a broad `*term*` on a large
collection transfers more documents than the current compound filter does; the `mongod`-side
indexes documented in decision 5 do not help, because `$match` runs on the `$search` output
stream. Then say why that is acceptable (CRM-scale collections, filters mostly used to narrow
an already-narrow term match) rather than leaving it unsaid.

## Deployment and rollout

### 4. The committed `default.search.json` is version-coupled to the restructured requests, but task 8 is declared orderable "at any point"

> **Resolved**, but not as a deploy-ordering rule. The version coupling the finding identifies is real and the mechanism that handles it already exists: the definition ships **inside** the module, so the file at a given module version describes what that version's pipelines require, and a deployment reads the definition from the version it actually runs. Applying a newer version's index to an older deployment is using the wrong version's file, not a migration-ordering trap.
>
> Recorded as a versioning statement in decision 5 and task 8, plus an explicit changeset line (task 10): this version **changes** the index requirement, so a consumer must update their cluster's index when upgrading, and the per-module CHANGELOG carries the version-to-version history for anyone on an older version. The ordering/rollback framing and the proposed "never deploy ahead of the module" warning are deliberately not adopted.
>
> Superseded in part by #6's resolution: the requirement is now documented per module rather than committed as definition files, so what is versioned with the module is its index reference page. The versioning point is unchanged; only the artifact it applies to is.

Decision 5 narrows the index to `dynamic: false` with only the text fields mapped, on the
grounds that "because filters moved to `$match`, the index mappings only need the text fields."
That is correct _after_ tasks 2-7. Before them, the same `default` index is what the current
pipelines query with `equals` and `exists` clauses on `hidden`, `disabled`, `deleted.timestamp`,
`type`, `status.stage`, `contacts.contact_id`, `company_ids`, and `updated.timestamp` — none of
which the new mappings declare. Atlas returns no matches for an unmapped path rather than an
error, so:

- `mustNot: [equals hidden true]` (`get_all_contacts.yaml:19-25`) stops excluding anything —
  hidden and disabled contacts appear in the list and the export.
- `mustNot: [exists deleted.timestamp]` (`get_activities.yaml:18-20`, `get_all_companies.yaml:19-21`)
  stops excluding soft-deleted rows.
- `search_contacts.yaml:26-28`'s baseline `filter: [exists: { path: _id }]` matches nothing, so
  the contact typeahead returns **zero rows**.

All of it silent. Yet `tasks.md:38` says "**Index definitions (8) are independent** — pure new
files, no config coupling — so they can run at any point", and task 8's notes say only that
running them against a cluster "stays the app's job."

Proposed fix: state the deploy-ordering constraint in decision 5 and in task 8's notes, and
carry it into `docs/shared/search.md` (task 10) and the changeset migration list: **deploy the
narrowed `default` index only together with or after the module version that moves filters into
`$match`** — never ahead of it, and never against a cluster still serving the old module. The
same note should cover the rollback direction. This is the migration step most likely to be
run early by someone reading the committed JSON as "the index these modules need."

### 5. Nothing in the committed tree builds the `atlas_search: true` branch

> **Resolved**, with two corrections to the finding's premises.
>
> First, **CI builds no app at all** — `.github/workflows/ci.yaml` runs `pnpm install` and `pnpm docs:check` and nothing else. So this was never "the `true` branch lacks the coverage `false` has"; neither branch was gated, and the finding's "would pass `pnpm ldf:b`" assumes a gate that does not exist. Task 9 now adds the app builds to CI, which is what makes any of this a gate.
>
> Second, the demo is not the right place for either branch to be proven, and the assignment was backwards. `apps/demo` runs against a real MongoDB with Atlas Search and is the general deployment target, so it sets `atlas_search: true` — the production wiring a consumer should see. `apps/workflows-test` runs its e2e stack on a plain `mongod` and its `field-render-sweep` spec renders the contacts module's `contact-selector` (`e2e/workflows/field-render-sweep.spec.js:60-62`), whose typeahead leads with `$search` — so `false` is correct there on its own merits, not as a coverage device. Building the two apps therefore compiles the two branches, and the demo stays a consumer reference rather than a test matrix.
>
> Task 9 is rewritten accordingly and gains `deals` + `activities` entries in `workflows-test` (wiring `deals` pulls `activities` in) so all four modules' fallback branches compile. The proposed flip-and-revert script is dropped, as is the manual temporary flip. Two module entries of the same module in the demo was considered and rejected: it would add list pages that hard-fail plus duplicate menu entries to the consumer-facing app.
>
> Related change made at the same time (not from this review): each app now holds the flag once in a reinstated `app_config.yaml` rather than repeating the literal on four entries — decision 4 is rewritten. The previous text treated `designs/app-operator` as having rejected shared-config files; it had actually deleted a one-key file whose key (`app_name`) became obsolete when `_app: slug` replaced it.

Task 9 sets `atlas_search: false` on all four demo module entries, and the manifest default is
`true`, so after this lands no config in the repo exercises the Atlas branch. Because the gate
is `_build.if`, the `then` branch is never evaluated when the flag is `false` — the entire
`$search` construction in `text_lead.yaml` (including `should_extra`, `returnStoredSource`, and
the `$meta: searchScore` projection in `score_addfields.yaml`) becomes config that CI never
compiles. A typo or a wrong operator name in the Atlas half of the single shared builder would
pass `pnpm ldf:b` and `pnpm docs:check` and ship.

Task 9 step 3 covers this with a one-time manual flip that is explicitly reverted before
commit, so the coverage does not persist. This also sits awkwardly against the repo rule that
every new capability ships with a build-verified demo consumer — here the _default_ mode, the
one production uses, is the one with no consumer.

Proposed fix: keep the flag committed as `false` (the demo needs a working local runtime) and
add a second build to CI with the flag forced `true`. The cheapest hook is a build-only env
override on the four demo entries — e.g. `atlas_search: { _build.ne: [{ _secret: DEMO_ATLAS_SEARCH }, "false"] }`
is not viable (`_secret` is runtime), so prefer a tiny script that flips the four `vars.yaml`
lines, runs `ldf:b`, and reverts, wired into `.github/workflows/ci.yaml`. Whatever the
mechanism, the design should name it, because "the shared builder is the one correct way" only
holds if both of its branches compile in CI.

### 6. The index-definition file layout drops the collection binding, and `storedSource` is not part of the documented tool format

> **Resolved by removing the mechanism both halves criticise.** Both observations are correct — the collection binding is the tool's directory, not a field in the object, and the documented format is `{ name, mappings }` with no `storedSource`. But the deeper problem is that committing definition files was reinventing something the repo already has a convention for: `docs/user-account/reference/indexes.md` and `docs/workflows/reference/indexes.md` document per-module index contracts, and `docs/deals/index.md`'s `## Required indexes` states the division of labour outright ("The module documents the contract; the app owns creating them … via `splice-actions`") and already documents the `deals` search index in prose.
>
> Decision 5 and task 8 are rewritten onto that convention: the search-index requirement is documented per module alongside the regular `mongod` indexes, with an illustrative mappings block, and no `.search.json` files are added. Decision 5 was also internally inconsistent before this — it documented regular indexes and committed search indexes for the same audience.
>
> That dissolves both halves. The collection is a sentence rather than something a path must encode (`deals` already writes "an index named `default` on `deals`"), and the design no longer asserts anything about `splice-actions`' accepted schema: `storedSource` is documented as a **requirement of the index**, satisfied by whatever tooling the app uses. Worth recording that the unverified claim stayed unverified — the writer is not vendored in this repo and GitHub search for it returned nothing from this account — which is itself a reason not to depend on it. Committing files could never have delivered what it appeared to, either: the tool's tree is `indexes/{project}/{collection}/{name}.json` and `{project}` is per-app, so a file from this repo was never copyable verbatim.

Decision 5 and task 8 place the definitions at `modules/{module}/search-indexes/default.search.json`
and describe the format as "the ensure-index CI tool format (`{ name, mappings, storedSource }`)".
Two problems, both verifiable now:

- **The collection is encoded in the path, not the file.** The tool's layout is
  `actions/indexes/indexes/{project}/{collection}/{name}.json` — the directory _is_ the
  collection binding, and the object has no field for it. Every file here is named
  `default.search.json`, so a consumer copying `modules/contacts/search-indexes/default.search.json`
  into their index tree must know from prose that it targets `user-contacts`. That matters more
  than usual because these modules' collection names are an app concern: the demo maps
  `contacts-collection` onto `user-contacts` in `apps/demo/lowdefy.yaml:162-167`, and activities
  even exposes a `lookup_collections` var for the same reason. Task 8 half-notices this and
  resolves it as "leave the collection binding to the docs", which is the weaker option.
  Prefer encoding it in the path — `modules/contacts/search-indexes/user-contacts/default.search.json` —
  so the file can be copied into the tool's tree without a lookup.
- **`storedSource` is absent from the documented format.** The `r:index-dev` reference shows
  `{ name, mappings }` only. `storedSource` is a legitimate Atlas index-definition field, so a
  tool that PUTs the object wholesale will carry it, but that is an assumption, not a checked
  fact — and the entire design leans on it (decision 3's perf argument, decision 5's footgun
  mitigation, and task 8's "load-bearing" note). Per the repo's "resolve the open question"
  rule this should be settled before implementation: confirm the ensure-index writer passes
  `storedSource` through, and if it does not, say what the consuming app must do instead.

## Consistency

### 7. The `$and` idiom now conflicts with `user-admin`'s documented rejection of it

> **Resolved** — by converting `user-admin` rather than documenting the divergence. Decision 2 gains a paragraph making `$and` the repo-wide idiom, and **new task 11** converts `members_filter.yaml` to the `$and` shape and routes its `$regex` through the shared `regex_value.yaml`.
>
> The review's observation that the stated obstacle is soft is confirmed and stronger than it reads: `members_filter.yaml:17` already seeds its concat with `{}`, so the `$and` form is `$and: [{}]` with no filter set, which the #8 probe shows MongoDB accepts. Only the empty array is rejected, so the header's reasoning was true in its premise and wrong in its conclusion.
>
> What tipped this from a documentation fix to a conversion: `members_filter.yaml:28-34` interpolates `filter.search` into `$regex` **unescaped**, so a `(` in the members search box errors and `.*` matches every member. Adopting the shared builder's escaping closes that, which makes the task a bug fix rather than pure consistency work. Verified that `../shared/...` resolves module-root-relative from a `requests/stages/` file — `user-admin/components/view/tile_security.yaml:168` and `user-account/components/view/modal_profile.yaml:28` are depth-2 precedents.
>
> Scope is bounded to that one file: `user-admin` still gets no `atlas_search` var and no `$search`, and the scope correction, non-goals, files-changed list, `tasks.md`, and task 10's changeset are all updated to say so.

Decision 2 chose a top-level `$and` array over `_object.assign`, arguing it is "collision-proof
by construction rather than by authoring discipline" and noting `$and: []` cannot arise because
every affected request has an unconditional clause. Both points hold for these seven requests.

But `modules/user-admin/requests/stages/members_filter.yaml` — the sibling filter builder,
solving the identical problem — documents the opposite choice in its header:

> the set clauses are merged into a single object (implicit AND) rather than wrapped in `$and`
> — with no filter set that leaves the canonical match-all `$match: {}`, where `$and: []` would
> be rejected by MongoDB. So every clause must own a distinct top-level key

So after this design lands the repo has two competing idioms for composing optional `$match`
clauses in adjacent modules, each with a written rationale for not being the other. That is
precisely the drift the design's own "one correct way" banner argues against, and the design
currently says nothing about it — `user-admin` appears in the scope correction and non-goals
only as "already portable."

Worth noting the stated obstacle is soft: seeding the `$and` array with a single unconditional
`{}` entry (which `members_filter.yaml` already does for its `_object.assign` —
`_array.concat: [ - - {}, … ]`) yields `$and: [{}]`, not `$and: []`. If that is valid (see #8),
`user-admin` could adopt the same `$and` shape and the divergence disappears. Add a short
paragraph to decision 2 either adopting `$and` repo-wide as a follow-up, or stating why
`user-admin` keeps `_object.assign` — but don't leave the two idioms unreconciled and
unmentioned.

### 8. Task 4 puts `{}` entries inside `$and`, contradicting the design's own array rule and resting on an unverified claim

> **Resolved.** The unverified-claim half is settled in task 4's favour by probe (mongod 8.3.4): `$and: [{a:1}, {}]`, `$and: [{}]`, `$and: [{}, {}]`, and `$match: { $and: [{hidden:{$ne:true}}, {}, {}] }` all parse; only `$and: []` is rejected (`BadValue: $and argument must be a non-empty array`). The result is now cited in both the design and task 4 instead of asserted.
>
> The consistency half is actioned, but only for the piece the invariant is aimed at. The `company_only_contacts` scoping **is** a gate, so it moves out of the literal group into its own `_array.concat` entry returning `[clause]` / `[]`, per the review's YAML. The consumer `filter` var stays a direct `$and` entry: it always contributes exactly one clause slot, and wrapping it in a one-element array literal would yield `$and: [ …, {} ]` when unset — relocating the empty object, not removing it. Removing it outright would need a runtime emptiness `_if` (more YAML than the `{}` it replaces) or changing the var from object to array, which decision 4 deliberately rejects and which would break a component var with consumers outside this repo.
>
> The design's invariant is reworded from "every piece" to "every **gated** piece" so it states the rule actually being followed, with the `filter` exception and its justification named.

The design's shared-builder section states the invariant plainly: "Every piece that lands in a
pipeline or `$and` position returns an **array** (`[]` or `[clause]`), so gated-off pieces vanish
through `_array.concat` rather than leaving an empty object behind."

Task 4's `search_contacts` `$match` (lines 43-70) breaks it. The company-scoping `_build.if`
keeps its current `else: {}` / inner `else: {}` branches and the consumer `filter` var keeps its
`default: {}`, all sitting directly as `$and` entries, and the task asserts "`{}` entries are
harmless inside `$and`" with no verification. `$and: [{ … }, {}, {}]` is very likely accepted by
MongoDB — an empty predicate document matches everything — but there is no precedent for it
anywhere in this repo, and `members_filter.yaml`'s header shows the author of the sibling module
was wary enough about `$and` arity to avoid the construct altogether.

Proposed fix: apply the design's own rule. Convert both gated pieces to array form so they
splice through the `_array.concat` like everything else:

```yaml
- _build.if:
    test: { _var: company_only_contacts }
    then:
      _if:
        test:
          {
            _gt:
              [
                {
                  _array.length:
                    {
                      _if_none: [{ _user: global_attributes.company_ids }, []],
                    },
                },
                0,
              ],
          }
        then:
          - global_attributes.company_ids:
              { $in: { _user: global_attributes.company_ids } }
        else: []
    else: []
```

and give the consumer hook `_var: { key: filter, default: {} }` the same treatment (or default
it to `[]` and document it as an array, matching `filter_match` — though decision 4 deliberately
keeps the two hooks distinct, so an object default wrapped into a one-element array is the
smaller change). That removes the `$and: [{}]` question entirely instead of resting on it, and
keeps one rule for every entry in every `$and` in the design.

## Minor accuracy

### 9. Task 6 claims activities is the only request missing `returnStoredSource`

> **Resolved.** The claim was removed by #1's rewrite of the same line. Task 6 now names both `activities` and `deals` as deliberate `returnStoredSource: false` opt-outs and cites `modules/activities/CHANGELOG.md:126`.

Task 6 line 20: "This is the **only** request missing `returnStoredSource: true`."
`deals/get_deals_list.yaml` is also missing it — the design has this right (line 49, "5 of the 7
requests already set `returnStoredSource: true`; `activities/get_activities.yaml` and
`deals/get_deals_list.yaml` are the exceptions") and task 7 line 55 says so too. Fix task 6.

### 10. Decision 5's justification for the index name is wrong for `deals`

> **Resolved (auto).** Verified: `get_deals_list.yaml:27` sets `index: default`; no other `$search` stage sets the option. Decision 5's parenthetical now reads "no `$search` stage specifies a non-default `index:`" and names the `deals` case.

Decision 5: "named **`default`** (our `$search` stages specify no `index:`, so Atlas uses
`default`)". `get_deals_list.yaml:27` sets `index: default` explicitly. The conclusion is
unaffected — `default` is still the right name — but the parenthetical is not true of all seven
stages today. Task 7 line 55 handles the file correctly (drops the redundant option); just
soften the design's claim to "none specify a non-default `index:`".

### 11. The cited precedent for `_module.var` inside a `_build.if` test is the wrong one

> **Resolved (auto).** Verified both proposed citations against source. The shared-builder section now cites `contact-selector.yaml.njk:207-209` and `reinstate.yaml:11-13` instead of `search_contacts.yaml`, whose test is a plain `_var`.

The shared-builder section says `atlas_search` is "passed in as `{ _module.var: atlas_search }`,
which resolves before `_build.*` — the same shape `search_contacts.yaml` already uses for
`_build.if` + `_var`." The claim is true, but `search_contacts.yaml:61-63`'s test is
`_var: company_only_contacts`, which the `contact-selector` caller substitutes with a literal
boolean — it does not demonstrate a `_module.var` operator surviving into a `_build.if` test.
The real precedent is `modules/contacts/components/contact-selector.yaml.njk:208-209`
(`_build.if: { test: { _module.var: use_verified } }`), plus
`modules/user-admin/api/reinstate.yaml:13-14` (`_build.not: { _module.var: suspension }`). Cite
those instead, since this ordering is what the whole build-time collapse depends on.

## Summary

The design is in good shape — review-1's mechanical objections are properly resolved, and the
two mechanisms it claims to have verified (`_string.replace` semantics, `../shared/*` refs from
request files) do check out against source. The blocking items are #1 and #2, both of which
would ship a regression:

- **#1** — `returnStoredSource: true` on `activities` was deliberately removed to fix stale
  post-write refetches (`modules/activities/CHANGELOG.md:126`); the shared builder hardcodes it
  back with no opt-out.
- **#2** — the shared term gate tests only for `null`, while `search_contacts` gates on `""`;
  clearing the typeahead's search box would emit `$search` with an empty `text` query.

#4 and #5 are rollout gaps to close in the design and tasks rather than code changes: the
narrowed `default` index silently breaks the pre-restructure pipelines if deployed early, and
after task 9 nothing in the repo compiles the `atlas_search: true` half of the shared builder.
#3, #6, #7 and #8 are arguments and idioms to tighten; #9-#11 are wording.
