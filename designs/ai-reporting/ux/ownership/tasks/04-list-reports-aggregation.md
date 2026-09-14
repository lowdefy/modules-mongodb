# Task 4: Rewrite `list-reports` as a scoped aggregation with search, sort and paging

## Context

`modules/ai-reporting/api/list-reports.yaml` is today a `MongoDBFind`: own-only (`owner.user_id` match), not-deleted, sorted `updated.timestamp: -1`, `limit: 200`, projecting `title/description/created/updated`. No scope, search, sort or paging.

**This endpoint carries the authorization boundary.** The list's scope match _is_ the authorization, which is exactly why scope has to be a server parameter rather than a client-side filter over an "everything" response — a single endpoint returning everything and letting the client pick would make Shared and Mine cosmetic. A bug in the scope match is a confidentiality bug, not a display bug.

**It must become a `MongoDBAggregation`, not stay a find.** Three of the new response fields force it: `is_favourite` is `$in` over `favourite_of`, and the section-type and filter counts are reductions over `spec.sections`. A find projection takes `$slice` / `$elemMatch` / `$meta` and no expressions, so none of them is expressible there.

**Paging is offsets, not the cursor the wireframes specify.** Plate 4's callout 7 (`wireframes.html:2325`) says "search, scope, sort and a cursor". The deviation is the mechanism only, driven by something the deck predates: sort became a user-selectable parameter, and a cursor must encode the key it pages over. Neither default key is unique — `is_favourite` is a boolean with two enormous ties and `updated.timestamp` can repeat — so a correct cursor needs an `_id` tiebreaker compounded into it for every sort the toolbar offers. An offset needs none of that and resets on a sort change exactly as a restarted cursor would. **What the plates draw is unchanged**: `Showing 6 of 8 · Load more` is an offset plus the `$facet` count.

## Interfaces

- **Consumes:** the document shape from task 3 (`visibility`, `favourite_of`, `spec_version`, `spec: { sections }`, `title` / `description` as document fields); `callEndpoint` and `reportDoc` from `apps/demo/e2e/ai-reporting/helpers.js`.
- **Produces:** `list-reports` taking `{ scope, search?, sort?, skip, page_size }` and returning rows plus a total. `reports-list` is the consumer.

## Task

### The five scopes, exactly

These are the authorization boundary, so they are transcribed rather than derived. `caller` is `_user: id`.

| Scope        | Match                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `mine`       | `owner.user_id: caller` + not deleted. **Any visibility** — publishing a report does not remove it from Mine. |
| `shared`     | `visibility: "shared"` + not deleted. **Includes the caller's own shared reports.**                           |
| `favourites` | `favourite_of: caller` + not deleted + (`owner.user_id: caller` **or** `visibility: "shared"`).               |
| `all`        | not deleted + (`owner.user_id: caller` **or** `visibility: "shared"`) — the readable predicate alone.         |
| `deleted`    | `owner.user_id: caller` + `deleted.timestamp` **present**. Owner-only; never anyone else's.                   |

Two things follow, and both are load-bearing. **The readable predicate is only load-bearing on `favourites`** — `mine` is readable because you own it and `shared` because it is shared, but a favourite marker can outlive the sharing that created it, so a bare `favourite_of` match is the one place a scope would leak. And **`deleted` is the only scope that inverts the stamp test**, and it is owner-matched: you never see anyone else's deleted reports, including ones that were published to you.

Build the `$match` with `_if` branches on the scope value — static per-scope branches with hardcoded predicates, not a dynamically assembled filter object. Reject an unrecognised scope rather than defaulting to one, and reject an unauthenticated caller as every other reporting endpoint does.

`all` is a scope, not a tab: it exists for the no-matches state's **Search all scopes** button, and it _is_ the readable predicate with nothing added, so it widens nothing the other scopes do not already allow.

### Payload defaults

`_payload` of an absent key resolves to **`null`**, not `undefined`, so every optional needs an explicit `_if_none` guard. `scope` has no default — an absent scope is a rejection, because silently choosing one for a caller that carries the authorization boundary is the wrong failure. `skip` defaults `0`, `page_size` a bounded default, `search` and `sort` absent.

### Search

`search` is `$regex` over **`title` and `description`** — case-insensitive, and the term escaped so a user typing `(` does not error or match differently. Not Atlas Search: the set being searched is already owner-scoped and paged, so ranking buys little while an Atlas requirement costs every consumer of the module. Not the spec either — a report's pipelines and field names are not text the user wrote, and matching them would return reports whose visible text has nothing to do with the term. These are the two fields the no-matches state names ("No report titles or descriptions contain that", `wireframes.html`).

### Computed fields and the sort

```yaml
- $addFields:
    is_favourite:
      $in:
        - _user: id
        - $ifNull: [$favourite_of, []]
    is_owner:
      $eq: [$owner.user_id, { _user: id }]
```

**Default sort** is `is_favourite` descending, then `updated.timestamp` descending — on `mine`, `shared` and `favourites`. **`deleted` defaults to `deleted.timestamp` descending instead**: the recovery page's whole content is when a report was deleted and by whom, and `updated` on a deleted report is when its spec last changed, which is unrelated — one edited heavily in March and deleted in July would sort above one created and deleted yesterday. Favourite-first ordering is meaningless there too.

A caller-supplied `sort` **replaces** the default outright rather than nesting under `is_favourite`. Favourites lead only when the user has not asked for an order; a starred report floating above a title sort would make the sort control look broken.

### Response fields

Display fields plus: section-type counts and filter count (reductions over `$spec.sections`), `visibility`, the publisher (`owner.name` — a snapshot; reporting knows no users collection and cannot resolve a `user_id` to a current name), `is_favourite`, `is_owner`, and the total for the pager. Project `favourite_of` **out** — a caller must never learn who else favourited a report.

### Paging

`$skip` / `$limit` inside a `$facet` alongside a count branch — the repo idiom (`apps/demo/.claude/guides/pagination.md`), and the source of the total the list's footer shows. Convention B (separate arrays) is the simpler of the two the guide documents and puts `$skip`/`$limit` at the end of the results branch.

## Acceptance Criteria

- `apps/demo/e2e/ai-reporting/report-scopes.spec.js`: **one spec per scope, all five, each asserting both what it returns and what it withholds.** The negatives are the point:
  - `mine` — includes the caller's own shared report; excludes another user's shared report and the caller's deleted one.
  - `shared` — includes another user's shared report and the caller's own shared report; excludes any private report and any deleted one.
  - `favourites` — includes a shared report the caller favourited and does not own; **excludes a report the caller favourited whose sharing was since withdrawn** (this is the case a bare `favourite_of` match leaks); excludes a favourited deleted report.
  - `all` — includes the caller's private, the caller's shared and another user's shared; **must not include another user's private report** — `all` needs this negative most.
  - `deleted` — returns only the caller's deleted reports; **excludes another user's deleted report, including one that had been published to the caller**.
- One spec asserting the total from the `$facet` count branch is the unpaged match count while the rows honour `skip` / `page_size`.
- One spec asserting a caller-supplied `sort` replaces the favourite-first default (a non-favourited report can sort above a favourited one under a title sort).
- One spec asserting `favourite_of` is absent from every row.
- An unrecognised or absent `scope` is rejected, not defaulted.
- `pnpm ldf:b` from `apps/demo` succeeds.
- Specs are written and reviewable; running them is task 11's step.

## Files

- `modules/ai-reporting/api/list-reports.yaml` — modify — rewritten as `MongoDBAggregation` with the scope `$match`, `$regex` search, `$addFields`, the sort branch and `$facet` paging
- `apps/demo/e2e/ai-reporting/report-scopes.spec.js` — create — five scope specs plus paging, sort-replacement and the `favourite_of` projection

## Notes

- **The default sort cannot be indexed, and that is documented rather than fixed.** `is_favourite` is not a stored field — it is `$in` over `favourite_of`, computed in `$addFields` — and a `$sort` on a field produced by `$addFields` can never use an index; `$skip` / `$limit` inside `$facet` cannot use one either. On `mine`, `favourites` and `deleted` the `$match` narrows to one user's reports first, so a blocking in-memory sort over tens of documents costs nothing. The unbounded scopes are `shared` and `all`, which match on a property of the report rather than on the viewer — they get their own documented index, and a blocking sort has a memory ceiling above which it errors rather than slows. A caller-supplied sort replaces the default outright and _is_ indexable, which is a second small argument for that replacement rule. Task 10 documents the index list; do not create indexes here — nothing in this repo creates an index.
- **The manifest needs no change.** `list-reports` is already registered under `api:`; this is a rewrite of an existing endpoint, which is why this task sits off the tasks 5–8 chain and can run alongside task 5.
- **`limit: 200` disappears.** Paging replaces it; do not keep a belt-and-braces cap alongside `page_size`.
