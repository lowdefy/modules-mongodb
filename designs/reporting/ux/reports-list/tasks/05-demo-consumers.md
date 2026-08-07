# Task 5: Exercise the rebuilt pages against the seeded fixtures

## Context

The demo already wires the `reporting` module (`apps/demo/modules/reporting`) and seeds ownership
fixtures (`apps/demo/api/reporting-seed-ownership.yaml` + `reporting_ownership_fixture.yaml`): six
reports covering `My private`, `My published`, `Someone else's published`, `Someone else's private`,
`Someone else's favourited`, and `My deleted`. Every fixture report shares one spec —
`kpi + table + filter` — so the rebuilt list's new surfaces are **already** exercised by seed data:

- **Contents pills** render more than one pill (a KPI pill and a table pill, plus the distinct
  filter pill) — the "spec spans two section types" case is met without new data.
- **Author column** has a non-viewer name to show on Shared, because the second user owns
  `Someone else's published report`.
- **Recovery page** has `My deleted report` to render with its delete stamp.

So this is the exercise task, not a new-seed task: confirm the rebuilt list (Task 3), its actions
(Task 4) and the recovery page (Task 2) render and behave correctly over the existing fixtures, and
add seed variety **only** if a check below is starved.

## Task

1. **Build and exercise.** `pnpm ldf:b` from `apps/demo`, then run the reporting demo (or the
   reporting e2e suite) and confirm, for the signed-in user:
   - **Mine** shows `My private` and `My published`; **Shared** shows the published reports incl.
     the second user's, with the **Author** column visible and naming the second user; **Favourites**
     shows the favourited one. Switching scope refetches.
   - The **Contents** cell shows a KPI pill and a table pill plus the filter pill on the fixture spec.
   - **Search** quick-filters the loaded rows by title/description; a zero-result term shows the
     clear/search-wider empty state, and search-wider reaches `all`.
   - The **row menu** shows the right items per row (owner vs the second user's reports; Publish only
     on your private ones with the role; Unpublish on shared per the two-input rule), **delete**
     confirms and drops the row, **★** toggles and re-tiers/refetches.
   - The **recovery** footer link opens `reports-deleted`, which shows `My deleted report` with its
     delete stamp; **restore** removes it there and surfaces a link to the now-private report.
2. **Augment only if starved.** If six reports make search or sort feel untestable, add a couple
   more fixture rows (vary titles so sort has an order to prove) in the ownership seed — do **not**
   invent a parallel seed file, and keep all data generic (no client names). If the checks above all
   have something to bite on, add nothing.

## Acceptance Criteria

- The build is clean and the pages render the seeded fixtures as described above.
- Every empty state, the Author column visibility, the Contents pills, and the recovery flow are
  observed against real seeded data — not just present in the config.
- Any seed additions are generic and live in the existing ownership seed.

## Files

- `apps/demo/api/reporting-seed-ownership.yaml` / `reporting_ownership_fixture.yaml` — modify — only if a check is starved.

## Notes

- This task needs the seeded data present. The reporting e2e globalSetup seeds a `MongoMemoryServer`,
  so `pnpm e2e` runs unattended; a live dev server would instead need real secrets + Mongo.
- Absence of a need is not proven by the demo — do not delete fixture rows to "tidy up"; other
  reporting sub-designs and e2e specs depend on them.
