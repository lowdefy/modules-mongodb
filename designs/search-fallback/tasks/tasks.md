# Implementation Tasks — Atlas Search fallback (search portability)

## Overview

These tasks implement `designs/search-fallback/design.md`: an `atlas_search` module var that selects Atlas `$search` (default) or a plain-MongoDB regex fallback, the restructure that pulls structural filters out of `$search` into a standard `$match`, a shared text-stage builder under `modules/shared/search/`, the committed Atlas Search index definitions, and the docs.

## Tasks

| #   | File                             | Summary                                                                                       | Depends On    |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| 1   | `01-add-atlas-search-var.md`     | Add the `atlas_search` var to 4 manifests; restate `filter_match` as `$match` syntax          | —             |
| 2   | `02-shared-search-builder.md`    | Create `modules/shared/search/*` and convert `contacts/get_all_contacts` as its first caller  | 1             |
| 3   | `03-contacts-excel-request.md`   | Convert `contacts/get_contact_excel_data` (build-concat pipeline root, sort outside a facet)  | 2             |
| 4   | `04-contacts-search-selector.md` | Add the toggle + regex clause to `contacts/search_contacts` (already split)                   | 2             |
| 5   | `05-companies-requests.md`       | Convert both companies requests, incl. the `name_field` path                                  | 2             |
| 6   | `06-activities-request.md`       | Convert `activities/get_activities`; adds `returnStoredSource` and fixes the date-range merge | 2             |
| 7   | `07-deals-request.md`            | Add the toggle + regex clause + score-sort gate to `deals/get_deals_list`                     | 2             |
| 8   | `08-search-index-definitions.md` | Commit `default.search.json` for the 4 searchable collections                                 | —             |
| 9   | `09-demo-wiring.md`              | Set `atlas_search: false` on the 4 demo module entries; build-verify both branches            | 3, 4, 5, 6, 7 |
| 10  | `10-docs-and-changeset.md`       | `docs/shared/search.md`, module index links, `pnpm docs:gen`, changeset                       | 1, 8, 9       |

## Ordering Rationale

**Manifests first (1).** Every request reads `_module.var: atlas_search`; a request referencing an undeclared var fails the build. Task 1 is manifest-only, so it lands as a no-op change that still builds.

**Builder ships with its first caller (2).** The shared files under `modules/shared/search/` are inert on their own — nothing would build-verify them. Task 2 therefore creates the five builder files _and_ converts `get_all_contacts`, the canonical filters-in-`$search` request, so the whole pattern (build gate → runtime gate → `$match` `$and` → score sort) is proven end-to-end before it is copied five more times. It is the largest and riskiest task by design; everything after it is a mechanical application.

**Tasks 3–7 are independent of each other** and can run in parallel once task 2 lands. They are split per module rather than lumped because each has a distinct wrinkle:

- 3 — pipeline root is a `_build.array.concat` and the `$sort` sits outside any `$facet`.
- 4 — already split; no facet, no score, and its consumer hook is the component-level `filter` var, not `filter_match`.
- 5 — one searched path is `{ _module.var: name_field }`, an operator rather than a literal.
- 6 — the only request missing `returnStoredSource`, and the one whose two `updated.timestamp` bounds motivated `$and` over shallow merge.
- 7 — `deals`, added to scope at task time; carries the Atlas-only `_id` keyword clause via `should_extra`, and an unconditional `score` sort to gate.

**Demo wiring after the requests (9).** Flipping the demo to `atlas_search: false` before the requests honour the flag would leave the demo's `$search` pipelines running against a flag nothing reads. Task 9 also owns build-verifying _both_ flag branches, since the demo pins `false` and the `true` path would otherwise go unbuilt.

**Index definitions (8) are independent** — pure new files, no config coupling — so they can run at any point; they are placed late only because task 10's docs reference them.

**Docs last (10).** `docs/{module}/reference/vars.md` is generated from the manifests, so it must run after task 1, and `pnpm docs:check` runs in CI — an out-of-date generated file fails the build.

## Scope

**Source:** `designs/search-fallback/design.md`
**Context files considered:** none — the design folder contains only `design.md` and `review/`. Cross-referenced `designs/app-operator/design.md` (cited by the design's decision 4), the four modules' manifests and request files, `apps/demo/modules/*/vars.yaml`, `docs/CONTRIBUTING.md` conventions, and the `r:index-dev` search-index file format.
**Review files skipped:** `designs/search-fallback/review/review-1.md`

### Scope changes made at task time (approved)

The design was written against an older tree. Both corrections are now recorded in `design.md` under "Scope correction":

- **`user-admin` dropped.** The BetterAuth rebuild removed `$search` from the module; `get_all_users` / `get_user_excel_data` no longer exist, `stages/members_filter.yaml` is already a plain-`$match` regex, and its `filter_match` is already documented as plain `$match`. No `atlas_search` var, no request changes — only a docs note that its search is always the unindexed regex path.
- **`deals` added.** `deals/requests/get_deals_list.yaml` leads with `$search`, so the demo's deal list hard-fails on local MongoDB and the design's stated goal is unmet without it.

The design's decision-4 open question ("how consumers set this app-wide") is also resolved in `design.md`: the boolean is repeated per module entry, with no shared config file — `atlas_search` drift fails loudly on first page load and touches nothing stored, unlike the silent stored-data drift that killed `app_config.yaml`.

### Coordination note — unmerged branch overlap

`origin/design/org-aware-modules` (not an ancestor of this branch) touches the same pipelines and adds `docs/shared/atlas-search-indexes.md`, whose index recipe is `dynamic: true` + `token` mappings for the filter fields + explicit `storedSource.include` lists. This design supersedes that recipe: filters move out of `$search`, so token mappings for filter fields are no longer needed, and `storedSource: true` replaces the include lists. That branch also splices a tenant `organizationId` clause into the `$search` compound. Whichever lands second must reconcile:

- the tenant clause moves from the `$search` compound into the `$match` `$and` array (where it also works in fallback mode);
- `docs/shared/atlas-search-indexes.md` and `docs/shared/search.md` must not both describe index requirements — fold the former into the latter;
- `organizationId` still needs its `token` mapping in each `default.search.json` if the tenant clause remains inside `$search`.
