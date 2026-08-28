# Task 5: Compiler renders a third (withheld) Alert variant for role-denied sections

## Context

Continuing the `compileReport.js` chain, and consuming Task 1's collection enumeration.

A section that failed to resolve can be **broken** (spec drifted, pipeline no longer validates) or
**withheld** (valid, but the viewer's roles don't satisfy a role-gated collection it queries).
`AnalyticsPipeline` enforces the role gate against the viewing user on every resolve, so a
withheld section lands in the resolver's per-section `:catch` exactly like a broken one, and today
`compileReport` renders both as the same `failedSectionBlock` Alert (compileReport.js:370). The
`:catch` receives no error object, so the two can't be told apart _after_ the fact — but they can
_before_, and `compileReport` already receives `catalog` and the viewer's `roles`.

Per the design's "A section the viewer's roles deny is not a broken section": for a failed
section, compute the roles its pipeline requires and compare to the viewer's. If the viewer falls
short → **withheld** variant. Otherwise → **broken** (existing behaviour).

## Interfaces

- **Consumes (from Task 1):** the validator's non-gating collection enumeration —
  `touchedCollections({ collection, pipeline, catalog })` (or the equivalent Task 1 exported),
  returning the catalog collections a pipeline touches **without** throwing on the role gate.
- **Uses (already passed):** `catalog` and `roles` — no new `compileReport` inputs.

## Task

1. For each failed query-backed section (the `rows === null/undefined` path at compileReport.js:471,
   and only that path — a `verifySection` contract mismatch is broken, not withheld), classify:
   - Enumerate the section's touched collections via Task 1's export over `section.query`
     (`{ collection, pipeline }`) + `catalog`.
   - Compute required roles = the union of `catalog[c].roles ?? []` across those collections.
   - **Withheld** iff `requiredRoles.length > 0 && !requiredRoles.some((r) => roles.includes(r))`.
     Otherwise treat as broken (including the case where enumeration itself throws on a
     catalog-membership fault — that's genuinely broken).
2. Render a **third Alert variant** for withheld sections:
   - **No recoveries — for the owner either.** There is nothing to fix (the spec is valid), so no
     Fix-in-chat and no Drop. (An owner can be withheld too: `share_roles` and catalog roles are
     independent.)
   - **Names no collection and no role.** The section's own label (`section.label`) is all the
     viewer learns. Copy says the data is restricted and stops. Do NOT interpolate the collection
     name or the required role.
   - This **corrects the non-owner copy from Task 4**: a withheld section must not say "who can
     fix it" (nothing is broken and nobody can) — that "names who can fix it" copy is only for the
     genuinely broken case.
3. Broken sections keep Task 4's behaviour (owner recoveries; non-owner names-who-can-fix-it).

## Acceptance Criteria

- A failed section over a role-gated collection the viewer lacks → withheld Alert: no Fix/Drop
  (even for the owner), no collection/role named in the text.
- A failed section that is genuinely broken (drifted field / catalog-absent collection) → the
  broken Alert with Task 4's recoveries (owner) or names-who-can-fix-it (non-owner).
- An owner viewing their own withheld section gets the withheld variant (no recoveries), not the
  broken one.
- Classification uses Task 1's single-walk enumeration — no hand-rolled `$lookup.from` scan
  anywhere in `compileReport.js`.
- Plugin unit tests: withheld (viewer lacks role), broken (drifted), and owner-withheld cases,
  asserting the variant and the absence of recoveries + absence of collection/role in copy.
  `CI=true pnpm test` (sandbox off).

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify: classify failed sections; add the withheld Alert variant; correct the non-owner broken copy so it excludes withheld.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify: withheld/broken/owner-withheld classification tests.

## Notes

- The whole point of the single-walk reuse (Task 1): the classifier and the gate agree because
  they enumerate collections the same way. If you find yourself reading `stage.$lookup.from` in
  `compileReport.js`, stop — that's the drift the design forbids; go through Task 1's export.
- The catalog `compileReport` receives is the **same** `_module.var: catalog` the
  `AnalyticsPipeline` connection validates against (`connections/reporting-data.yaml`), so the
  role gates the classifier sees are the ones the gate enforced. No catalog-source mismatch to
  guard against.
