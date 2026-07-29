# Implementation Tasks — Atlas Search fallback (search portability)

## Overview

These tasks implement `designs/search-fallback/design.md`: an `atlas_search` module var that selects Atlas `$search` (default) or a plain-MongoDB regex fallback, the restructure that pulls structural filters out of `$search` into a standard `$match`, a shared text-stage builder under `modules/shared/search/`, the per-module Atlas Search index requirements documented in `docs/`, and the docs.

## Tasks

| #   | File                             | Summary                                                                                                | Depends On    |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| 1   | `01-add-atlas-search-var.md`     | Add the `atlas_search` var to 4 manifests; restate `filter_match` as `$match` syntax                   | —             |
| 2   | `02-shared-search-builder.md`    | Create `modules/shared/search/*` and convert `contacts/get_all_contacts` as its first caller           | 1             |
| 3   | `03-contacts-excel-request.md`   | Convert `contacts/get_contact_excel_data` (build-concat pipeline root, sort outside a facet)           | 2             |
| 4   | `04-contacts-search-selector.md` | Add the toggle + regex clause to `contacts/search_contacts` (already split)                            | 2             |
| 5   | `05-companies-requests.md`       | Convert both companies requests, incl. the `name_field` path                                           | 2             |
| 6   | `06-activities-request.md`       | Convert `activities/get_activities`; passes `returnStoredSource: false` and fixes the date-range merge | 2             |
| 7   | `07-deals-request.md`            | Add the toggle + regex clause + score-sort gate to `deals/get_deals_list`                              | 2             |
| 8   | `08-search-index-definitions.md` | Document the search + regular index requirements for the 4 searchable modules                          | —             |
| 9   | `09-demo-wiring.md`              | Wire demo `true` / `workflows-test` `false`; build both apps in CI                                     | 3, 4, 5, 6, 7 |
| 10  | `10-docs-and-changeset.md`       | `docs/shared/search.md`, module index links, `pnpm docs:gen`, changeset                                | 1, 8, 9, 11   |
| 11  | `11-user-admin-and-idiom.md`     | `user-admin`'s `members_filter` → `$and` idiom + shared regex escaping                                 | 2             |

## Ordering Rationale

**Manifests first (1).** Every request reads `_module.var: atlas_search`; a request referencing an undeclared var fails the build. Task 1 is manifest-only, so it lands as a no-op change that still builds.

**Builder ships with its first caller (2).** The shared files under `modules/shared/search/` are inert on their own — nothing would build-verify them. Task 2 therefore creates the five builder files _and_ converts `get_all_contacts`, the canonical filters-in-`$search` request, so the whole pattern (build gate → runtime gate → `$match` `$and` → score sort) is proven end-to-end before it is copied five more times. It is the largest and riskiest task by design; everything after it is a mechanical application.

**Tasks 3–7 are independent of each other** and can run in parallel once task 2 lands. They are split per module rather than lumped because each has a distinct wrinkle:

- 3 — pipeline root is a `_build.array.concat` and the `$sort` sits outside any `$facet`.
- 4 — already split; no facet, no score, and its consumer hook is the component-level `filter` var, not `filter_match`.
- 5 — one searched path is `{ _module.var: name_field }`, an operator rather than a literal.
- 6 — passes `returnStoredSource: false` to preserve PR #68's deliberate opt-out, and is the request whose two `updated.timestamp` bounds motivated `$and` over shallow merge.
- 7 — `deals`, added to scope at task time; carries the Atlas-only `_id` keyword clause via `should_extra`, and an unconditional `score` sort to gate.

**App wiring after the requests (9).** Setting the flag before the requests honour it would leave both apps' pipelines running against a flag nothing reads. Task 9 wires each app for the database it actually runs on — `apps/demo` on Atlas (`true`), `apps/workflows-test` on its plain e2e `mongod` (`false`) — which is also what leaves both branches of the shared builder compiled, without the demo carrying config that exists only to be tested. It adds both `ldf:b` runs to CI, which today builds no app at all.

**Index documentation (8) is independent** — docs only, no config coupling — so it can run at any point. It follows the repo's existing convention (`docs/user-account/reference/indexes.md`, `docs/deals/index.md`'s `## Required indexes`): the module documents the contract, the app creates the indexes. No index-definition files are committed — see design decision 5.

**Docs last (10).** `docs/{module}/reference/vars.md` is generated from the manifests, so it must run after task 1, and `pnpm docs:check` runs in CI — an out-of-date generated file fails the build. It also depends on **11**, because its changeset bumps `user-admin` and describes that task's escaping fix.

**`user-admin` (11) needs only task 2**, for `regex_value.yaml`. It is independent of 3-9 and can run any time after 2 (but before 10) — listed last because it is the one task outside the four searchable modules. It exists so the repo ends with a single `$match`-composition idiom rather than two contradicting ones (design decision 2), and it fixes that module's unescaped `$regex` on the way.

## Scope

**Source:** `designs/search-fallback/design.md`
**Context files considered:** none — the design folder contains only `design.md` and `review/`. Cross-referenced `designs/app-operator/design.md` (cited by the design's decision 4), the four modules' manifests and request files, `apps/demo/modules/*/vars.yaml`, `docs/CONTRIBUTING.md` conventions, and the `r:index-dev` search-index file format.
**Review files skipped:** `designs/search-fallback/review/review-1.md`

### Scope changes made at task time (approved)

The design was written against an older tree. Both corrections are now recorded in `design.md` under "Scope correction":

- **`user-admin` dropped from the fallback work.** The BetterAuth rebuild removed `$search` from the module; `get_all_users` / `get_user_excel_data` no longer exist, `stages/members_filter.yaml` is already a plain-`$match` regex, and its `filter_match` is already documented as plain `$match`. No `atlas_search` var, and a docs note that its search is always the unindexed regex path. It does keep **one** task (11), added at action-review time: `members_filter.yaml` adopts the `$and` composition idiom so the repo does not end with two contradicting ones, and picks up the shared regex escaping it currently lacks.
- **`deals` added.** `deals/requests/get_deals_list.yaml` leads with `$search`, so the demo's deal list hard-fails on local MongoDB and the design's stated goal is unmet without it.

The design's decision-4 open question ("how consumers set this app-wide") is also resolved in `design.md`: each app holds the boolean once in `app_config.yaml` and every searchable module entry `_ref`s it. That file is **reinstated** by task 9 — `designs/app-operator` deleted it because its only key (`app_name`) became obsolete when `_app: slug` replaced it, not because the shared-config pattern was rejected, and `atlas_search` is deployment capability rather than app identity, which no operator exposes.

### Coordination note — unmerged branch overlap

`origin/design/org-aware-modules` (not an ancestor of this branch) touches the same pipelines and adds `docs/shared/atlas-search-indexes.md`, whose index recipe is `dynamic: true` + `token` mappings for the filter fields + explicit `storedSource.include` lists. This design supersedes that recipe: filters move out of `$search`, so token mappings for filter fields are no longer needed, and `storedSource: true` replaces the include lists. That branch also splices a tenant `organizationId` clause into the `$search` compound. Whichever lands second must reconcile:

- the tenant clause moves from the `$search` compound into the `$match` `$and` array (where it also works in fallback mode);
- `docs/shared/atlas-search-indexes.md` must not compete with `docs/shared/search.md` plus the per-module index references — fold it into those;
- `organizationId` still needs its `token` mapping in each module's documented `default` index if the tenant clause remains inside `$search`.
