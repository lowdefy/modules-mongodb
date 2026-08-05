# Task 1: Add the `atlas_search` var to the searchable module manifests

## Context

Four modules run text search on MongoDB Atlas `$search`, which only exists on Atlas: `contacts`, `companies`, `activities`, `deals`. A flag is being introduced so those requests can fall back to a case-insensitive regex `$match` on community/local MongoDB. This task declares the flag only — no request touches it yet, so the change is a build-safe no-op.

It also corrects the `request_stages.filter_match` var description in the three modules that declare it. Today that var is documented as _"Atlas Search compound clauses appended to the list-page `$search` query"_ and is spliced into the `$search.compound.must` array. Later tasks move the structural filters out of `$search` into a standard `$match`, at which point `filter_match` becomes plain Mongo query clauses. This is a **breaking change** to that var, and the description is the authoritative source for the generated `docs/{module}/reference/vars.md`.

`deals` declares no `filter_match` — its `request_stages.get_deals_list` is a stage splice, not a filter hook. Do not add one.

## Task

In each of `modules/contacts/module.lowdefy.yaml`, `modules/companies/module.lowdefy.yaml`, `modules/activities/module.lowdefy.yaml`, `modules/deals/module.lowdefy.yaml`, add a top-level var to the `vars:` block:

```yaml
atlas_search:
  type: boolean
  default: true
  description: >-
    Whether the deployment's MongoDB has Atlas Search available. When true,
    text search uses Atlas `$search` (indexed, relevance-ranked). When false,
    text search falls back to a case-insensitive regex `$match` that runs on
    any MongoDB (community/local) — substring matching, no relevance ranking,
    and an unindexed collection scan, so suitable for development or small
    collections. See docs/shared/search.md.
```

Place it near the other deployment-shaped vars rather than at the end of a long field-config block; match each manifest's existing ordering style.

Then update the `request_stages.filter_match` description in `contacts`, `companies`, and `activities` to describe plain `$match` clauses. Use wording of this shape, adapted to each module's existing phrasing:

```yaml
filter_match:
  type: array
  default: []
  description: >-
    Plain MongoDB `$match` clauses ANDed into the list-page and Excel-export
    filter. Each element is one query clause (e.g. `{ region: "x" }`,
    `{ score: { $gte: 10 } }`); they are composed via `$and`, so a clause using
    `$or` is safe. Applies in both Atlas and regex-fallback modes.
```

Add `type: array` where it is missing (`contacts` and `companies` currently declare only `default:` and `description:`) — the manifest is the source of truth for the generated var docs, and every var should carry `type:`.

Also update each module's `request_stages` parent `description:` if it repeats the Atlas-compound framing.

## Acceptance Criteria

- `atlas_search` is declared with `type: boolean`, `default: true`, and a description in all four manifests.
- `filter_match` in `contacts`, `companies`, `activities` describes plain `$match` clauses and declares `type: array`; `deals` gains no `filter_match`.
- No manifest still describes `filter_match` as Atlas Search compound clauses (`git grep -n "Atlas Search compound" modules/` returns nothing).
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- Behaviour is unchanged — no request reads the new var yet.

## Files

- `modules/contacts/module.lowdefy.yaml` — modify — add `atlas_search`; rewrite `filter_match` description, add `type: array`.
- `modules/companies/module.lowdefy.yaml` — modify — same.
- `modules/activities/module.lowdefy.yaml` — modify — same.
- `modules/deals/module.lowdefy.yaml` — modify — add `atlas_search` only.

## Notes

- Do **not** run `pnpm docs:gen` here — the generated `vars.md` files are regenerated once in task 10, after all manifest changes have landed. If CI's `pnpm docs:check` is run on this task's branch in isolation it will flag drift; that is expected and closed by task 10.
- `user-admin` is deliberately excluded. It reads the same `user-contacts` collection but no longer uses `$search`, and its `filter_match` is already declared as plain `$match` clauses. Leave it alone.
