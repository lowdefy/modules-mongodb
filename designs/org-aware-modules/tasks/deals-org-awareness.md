# Task — finish the deals module's org-awareness

The deals module was never brought into the org-awareness work. The gap ran
through all three layers at once, which is why nothing caught it: the design's
[collection inventory](../design.md#collection-inventory) omitted the module,
`docs/shared/org-scoping.md`'s backfill list omitted the collection, and both
`modules/deals/connections/*.yaml` omitted `tenant: true`. The design's own
invariant — "every module-owned connection declares `tenant: true`" — held for
every module the inventory listed, and `deals` was simply not one of them.

Found during the tenancy QA pass as
[T11 / T12](../../auth-tenancy-verification/findings.md), where one workspace's
deal list and detail page rendered another workspace's record, company name and
user identity, in both directions.

## Done

- `tenant: true` on `deals-collection` and on the module's own `events-collection`
  (the latter reads `log-events` and was scoped by `deal_ids` alone, which is not
  an organization boundary — T12). Declaration count 14 → 16.
- Design inventory and `org-scoping.md`'s backfill list now name `deals`.
- Verified: deal list, deal detail, the ACTIVE DEALS sidebar and deal writes are
  all org-scoped; `apps/demo` (pinned) is unaffected — the declaration is inert
  under `pinned`, so this needs no pinned-side backfill or index work.

## Remaining

### 1. `get_deals_list`'s `$search` needs its authored clause

The request currently refuses at runtime, fail-closed and with instructions:

> Aggregation pipelines on a tenant connection can not contain `$search` unless
> the request declares `tenant: authored` … at `deals/deals-collection/get_deals_list`.

So deal **search** is broken under `tenant` while deal **listing** works. Not a
leak — the wall refuses rather than scoping wrongly.

The awkwardness is structural, and it is why this was not fixed inline. Unlike
every other `$search` pipeline in the repo, `get_deals_list` **conditionally
swaps its whole first stage**:

```yaml
- _if:
    test: { _eq: [ { _if_none: [ { _payload: filter.search }, null ] }, null ] }
    then: { $match: {} }        # no term  -> injectable, wall can prepend
    else: { $search: … }        # term     -> not injectable, needs authored
```

`tenant:` is a static per-request declaration, but which branch resolves is a
**runtime** decision (`_payload`), so no single declaration is correct for both.
It also explains why the build passed: the entry-stage check is best-effort and
cannot see a `$search` behind a runtime `_if`.

Two options, and this is the decision the task exists to make:

- **(a) Restructure to match the repo pattern.** `get_all_contacts` and
  `get_activities` use an **unconditional** `$search` with the text clauses
  conditional *inside* `compound.should`. Declare `tenant: authored`, add the
  shared fragment (`shape: search_filter`) as the first `compound.filter` entry,
  exactly as the Excel exports do. Uniform with the rest of the repo, and the
  wall's audit then covers both paths. **Requires a `deals` Atlas Search index to
  exist**, because every list load would then issue `$search` — see 2 below.
- **(b) Author both branches.** Keep the conditional shape, declare
  `tenant: authored`, and carry the fragment in both branches — `search_filter`
  in the `$search` branch and `match` in the `$match` branch (the fragment
  already dispatches both shapes). No new index needed for the no-term path.
  Needs confirmation that the runtime audit accepts a `$match`-shaped clause on a
  request declaring `authored`; the docs describe `authored` as the escape hatch
  for stages the wall *cannot* scope, so a `$match`-first pipeline declaring it is
  outside the documented case.

(a) is the better end state; (b) is the smaller change. (a) cannot ship before 2.

### 2. `deals` has no Atlas Search index — pre-existing, policy-independent

`get_deals_list` issues `$search` against `index: default` on `deals`, and no
search index exists on the collection at all (confirmed against the QA cluster,
alongside `workflows`, `actions`, `files`, `notifications`, `log-events` — none
have one). So **the deal search box has never worked**, under either policy: it
errors on a missing index rather than returning nothing.

This is independent of tenancy and would be worth its own fix regardless. It
becomes a blocker for option (a), and it means
`docs/shared/atlas-search-indexes.md` — which documents `user-contacts`,
`companies` and `activities` — needs a `deals` section: `organizationId` mapped
statically as `token`, plus a `storedSource` entry if the restructured pipeline
uses `returnStoredSource`.

### 3. Consumer note for the flip

Any deployment already holding `deals` rows must backfill `organizationId` before
flipping to `tenant`, or the preflight refuses to serve — verified live: it named
`deals` and the connection in one aggregated `ConfigError`. Deriving the value
from each deal's `company_id` (the linked company is already stamped) gives
documented provenance rather than a default, which is the rule
`org-scoping.md` sets for any explicit organization value.
