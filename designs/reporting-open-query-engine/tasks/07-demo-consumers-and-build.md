# Task 7: Demo Consumers + Build Verification

## Context

Per CLAUDE.md, every new consumer-facing capability ships with at least one real example consumer in `apps/demo/` in the same change — the build-verified reference authors copy. Tasks 5 and 6 landed the new chat path and the chart/report/export path; this task exercises them end-to-end in the demo and is the first point where the full build must pass (tasks 3–6 individually leave the app unbuildable by design).

The demo already has a reporting surface (`fe3519a2 feat(demo): reporting module test surface`) wired through `apps/demo/modules/reporting/` and seeded by `apps/demo/scripts/seed-reporting-domain.mjs` + the seed-orders API. Prefer extending those existing pages/flows over throwaway pages.

## Task

Add or adapt demo consumers so each new capability has a worked example:

1. **Chat pipeline query** — the demo catalog (task 4) plus seeded collections must support the design's canonical shape: a `$lookup` + `$unwind` + `$group` query across two collections via a declared relationship. Verify the agent can be driven to it (dev-test), and ensure the catalog's relationship entries match the seeded data's actual join keys.
2. **Pipeline-backed chart** — a chart (via `render_chart` or a saved report section) with a declared `x`/`y` contract, including at least one column formatted via a catalog display hint (`demo_orders.total` currency).
3. **Saved report with bound filter** — a report containing KPI + chart + table sections and a select or daterange filter section bound via `filterBy`, exercising the server-built `$match` prepend re-query path.
4. **CSV export** — a download section or `export_data` flow on a pipeline (no contract).

Where these can be seeded/persisted config rather than agent-generated (e.g. a seeded saved report document), prefer that — it makes the surface reproducible.

**Build verification:**

- `pnpm ldf:b:i` from `apps/demo` (Infisical variant — run with sandbox off per the repo memory note). Fix any config errors it surfaces; build failures here are real.
- Inspect the generated `.lowdefy/server/build/pages/**` artifacts to confirm the report/chart config resolves (catalog injected into agent instructions, connection catalog property present, API payload schemas compiled).
- `pnpm docs:check` passes (catches vars.md drift from task 4).
- Full plugin unit-test suite passes.

## Acceptance Criteria

- Demo app builds clean with `pnpm ldf:b:i`.
- Each of the four capabilities above has a demo consumer an author can copy, and the built artifacts show the resolved config.
- Seed script(s) and catalog agree on collection names and join fields.
- `pnpm docs:check` and plugin tests pass.

## Files

- `apps/demo/modules/reporting/catalog.yaml` — modify — align relationships/hints with the consumers
- `apps/demo/modules/reporting/vars.yaml` — modify if needed
- `apps/demo/scripts/seed-reporting-domain.mjs` — modify if the join example needs seeding tweaks
- Demo reporting pages/config under `apps/demo/` — modify/create as needed for the four consumers

## Notes

Live end-to-end verification (running the dev server, driving the chat agent) needs real secrets and MongoDB — that's a human/`/r:dev-test` step, not part of the autonomous build gate. The autonomous gate is: build + artifacts + tests + docs:check.
