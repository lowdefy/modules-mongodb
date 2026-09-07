# Task 8: Seed broken / withheld / two-filter-group demo reports and exercise the page end-to-end

## Context

Every new module capability ships with a real demo consumer that exercises it (repo rule), and
this is the exercise-the-feature step for the whole design. The reporting demo seeds reports via
`apps/demo/scripts/seed-reporting-domain.mjs` and the `apps/demo/api/reporting-seed-*.yaml`
fixtures; the demo catalog is `apps/demo/modules/ai-reporting/catalog.yaml`; the demo reporting
module vars are `apps/demo/modules/ai-reporting/vars.yaml`.

Existing seeded fixtures (from ownership + save-as-report, both shipped) already give a shared
report owned by a second user and reports with/without `conversation_id` — so the non-owner view
(provenance-with-publisher, export present, chat link absent) already has coverage. This task adds
the three cases this design introduces (design's "Demo consumers").

## Task

Add three seeded demo reports (extend the existing seed fixtures/script; follow their pattern —
do not invent a new seeding mechanism):

1. **A report with a deliberately broken section** — a section whose stored pipeline no longer
   validates (e.g. references a dropped field), so the broken Alert plus the two owner recoveries
   (Fix-in-chat, Drop) render for the owner, and the non-owner variant of the _same_ report shows
   the names-who-can-fix-it form. Give this report a `conversation_id` so Fix-in-chat is present.
2. **A shared report over a role-gated catalog collection**, opened by a demo user who does NOT
   hold the role, so the withheld variant renders (no recoveries) beside a broken variant it must
   not be confused with. This requires **one catalog entry carrying a `roles` list** in
   `apps/demo/modules/ai-reporting/catalog.yaml` — the first demo coverage catalog role-gating has
   had. Ensure a demo user/role setup exists where one user holds the role and one doesn't.
3. **A report carrying two independent filter groups** (each filter bound only to its own
   sections), so filter co-location (Task 6) is exercised — each control must render beside its
   own group. This is the case the demo currently works around by hand; remove that workaround if
   present.

Then **exercise the feature**:

4. `pnpm ldf:b` from `apps/demo` — clean. Inspect `.lowdefy/server/build/pages/**` for the report
   page and confirm: provenance block present; per-section CSV actions on chart/table; owner
   recoveries on the broken section; a distinct withheld Alert with no recoveries and no
   collection/role named; filters inline beside their groups with no `report_filters` top-row Box;
   `Link` declared in the report page's `types.actions`.
5. Run the reporting e2e suite (`pnpm e2e reporting/` — it self-provisions a MongoMemoryServer, no
   secrets needed) and confirm the report-rendering specs still pass through the new output.

## Acceptance Criteria

- Three new seeded reports (broken-section, role-gated withheld, two-filter-group) exist and build.
- The demo catalog has one role-gated collection entry, and a demo user without that role can open
  the withheld report and see the withheld variant.
- The compiled artefacts show each new affordance (per inspection in step 4).
- `pnpm ldf:b` clean; reporting e2e green.

## Files

- `apps/demo/scripts/seed-reporting-domain.mjs` and/or `apps/demo/api/reporting-seed-*.yaml` — modify/extend: seed the three reports.
- `apps/demo/modules/ai-reporting/catalog.yaml` — modify: add one `roles`-gated collection entry.
- `apps/demo/modules/ai-reporting/vars.yaml` and demo user/role config — modify as needed for the role-gated user setup.
- (Remove any by-hand filter-scope workaround in the existing demo report, if present.)

## Notes

- The demo is a reference and a build-verified example, not a census — seed exactly the three
  cases the design names; don't add speculative variants.
- Role-gating is opt-in: a catalog collection with an absent/empty `roles` list is readable by any
  authenticated user, so the withheld case genuinely needs a non-empty `roles` list on its
  collection plus a viewer who lacks it.
- If the seed script and the YAML fixtures split responsibilities (script orchestrates, YAML holds
  documents), match that split rather than moving data between them.
