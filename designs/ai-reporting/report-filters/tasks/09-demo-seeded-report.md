# Task 9: The seeded example report exercises all three filter controls

## Context

`apps/demo/api/reporting-seed-example-report.yaml` seeds a worked-example saved report for the signed-in user, so the report surface is reproducible without driving the chat agent. It is the demo consumer for every capability the presentation contract adds, and it is idempotent (a deterministic per-user `_id` is cleared then reinserted). It inserts the spec **raw** and deliberately does not run `validateReportSpec` — `resolve-report` revalidates each pipeline through `AnalyticsPipeline` at view time.

Today it carries one `select` filter on `demo_orders.region` (options from the catalog's enum `values`) bound to a KPI, a chart and a table, all over `demo_orders`, plus a markdown section and a CSV download.

The design's demo consumer needs **no new seed data** — the array case already exists in production shape. From `apps/demo/modules/ai-reporting/catalog.yaml`:

- `demo_activities.company_ids` — `type: array`, "Scalar array of demo_companies `_id`s this activity relates to", with `relationships: [{ field: company_ids, collection: demo_companies, foreignField: _id }]`.
- `demo_companies` — the join target; `_id` is the foreign key, `name` is the human-readable label.

## Task

Extend the seeded spec with all three controls:

1. **Region** — the existing `select` filter on `demo_orders.region` becomes `control: multiselect`. Options still come from the catalog's enum `values` (no `options`, no `optionsQuery`) — this is the scalar multi-select case. Keep it bound to the same three `demo_orders` sections.
2. **Created** — a new `daterange` filter on `demo_orders.createdAt`, bound to the same three sections, so the report shows a range and a multi-select side by side. The field is catalogued as `createdAt: { type: date, description: "When the order was placed (use for date-range filters)" }`, so no other date field is in play.
3. **Companies** — a `multiselect` on `demo_activities.company_ids` with `match: any` and an `optionsQuery` over `demo_companies`:

   ```yaml
   - type: filter
     label: Companies
     control: multiselect
     field: company_ids
     match: any
     optionsQuery:
       collection: demo_companies
       pipeline:
         - $project:
             company_id: $_id
             name: 1
         - $sort:
             name: 1
       valueKey: company_id
       labelKey: name
   ```

   This one control covers array matching **and** looked-up labels.

Because a filter must be bound by a section whose base collection carries the field, the Companies filter needs an **activities-grain section**: add a KPI or table over `demo_activities` counting activities per type (or per current stage). Counting documents rather than unwinding `company_ids` is the documented rule in practice — so the demo demonstrates the workaround, not just the capability.

**Use `demo_activities`, not `demo_activities_report`, for that section.** The view's catalog entry declares only `type`, `current_stage`, `source.channel` and `created.timestamp` — it carries no `company_ids`, so a filter bound to a section over the view would match nothing (the catalog gates collections and roles, not field names, so nothing would error).

Update the file's header comment to list what the report now exercises: three filter controls, any/all semantics, a query-sourced options list with labels, and the document-not-element rule made concrete by the activities section.

Also update `apps/demo`'s reporting demo page copy or README **only if** it enumerates what the seeded report contains — do not add new demo pages.

## Acceptance Criteria

- The seeded spec carries a `multiselect` on `region` (catalog values), a `daterange` on the catalogued `demo_orders` date field, and a `multiselect` on `demo_activities.company_ids` with `match: any` and the `optionsQuery` above.
- A `demo_activities` section exists and lists `company_ids` in its `filterBy`; every filter is bound by at least one section whose base collection carries its field.
- `pnpm ldf:b` from `apps/demo` succeeds.
- **Manual dev-server pass** (the only check of the live path, and a human step — not part of an autonomous gate): seed the reporting domain and the demo orders, seed the example report, open it, and confirm
  - the Companies dropdown lists company **names** and is searchable,
  - selecting two companies re-queries the activities section and narrows it,
  - clearing the selection widens it back (the empty-array drop),
  - the Region multi-select accepts several regions at once,
  - no section shows an unexpected Alert.

  Needs real secrets and a reachable MongoDB. The report-render e2e spec is `test.fixme` for an unrelated harness gap (`@lowdefy/server-e2e` drops `urlQuery`, so the resolver never finds the report), so this cannot be automated today.

## Files

- `apps/demo/api/reporting-seed-example-report.yaml` — modify — the three filters, the activities-grain section, and the header comment.

## Notes

`ldf:b` cannot verify the compiled report: `_analytics` is a **server** operator, so a report's blocks are compiled per request inside `resolve-report` and never appear in the build artifact. The build proves the config compiles and that `MultipleSelector` is a real block type (task 6 declared it on the report page's `Dynamic` block); everything about the emitted blocks, options and triples is covered by the unit tests in tasks 3-6.

Use `pnpm ldf:b` (not the `:i` Infisical variant) — the sandbox blocks `app.infisical.com`, and the build check needs no secrets.

The seed skips `validateReportSpec` by design, so a spec mistake here surfaces at view time as a section Alert or a filter Alert rather than a seed error. If the filter row shows an Alert you did not expect, check the spec against task 3's allowed-key list first — a misspelled `optionsQuery` is now an error at save time but the seed never runs that check.
