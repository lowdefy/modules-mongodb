# Task 6: Demo consumers and build-verify

## Context

Every consumer-facing capability ships with a demo consumer that build-verifies it. This feature
adds the tick-and-save flow (tasks 1–4). Two demo obligations from the design:

1. **Seed two reports** — one carrying a `conversation_id` (so Continue-in-chat resolves on the
   report page) and one without (so the affordance's absence is exercised). The design places this
   seeding _here_ because save-as-report owns the `conversation_id` field's population; both
   reports are read by the [report-page](../../report-page/design.md).
2. **Exercise the sheet** — the save-as-report sheet is reachable from the demo chat page, so the
   selection → sheet → insert path is build-verified.

The demo seeds its reporting domain via `apps/demo/scripts/seed-reporting-domain.mjs` (a Node
script that clears + inserts source collections and recreates views). It does **not** currently
seed any `report_layouts` documents — that is the new work.

## Task

**1. Seed two report documents** in `apps/demo/scripts/seed-reporting-domain.mjs`. After the
existing domain-collection seeding, insert two documents into the reports collection
(`report_layouts` — the `reports_collection` default) matching the stored report shape that
`new_report.yaml` produces:

- Both: `_id`, `owner: { user_id, name }` for a demo user, `title`, `spec: { sections: [...] }`
  with at least one valid section (reuse a simple chart or table spec over a seeded view/
  collection so it resolves on the report page), `spec_version: 1`, `visibility` (pick `private`
  or `shared` as fits the demo), `favourite_of: []`, `deleted: null`, `created`/`updated` stamps.
- Report A: a real `conversation_id` (a stable demo string/uuid).
- Report B: `conversation_id: null`.
  Make the inserts idempotent with the script's existing approach (clear-then-insert), so re-seeding
  stays stable. Follow the script's deterministic, index-derived data convention (no randomness).

**2. Verify the sheet is reachable and the config compiles.** The demo already imports the
reporting module, so the chat page and its new sheet are present. Run `pnpm ldf:b` from
`apps/demo` (or `pnpm --filter @lowdefy/modules-demo ldf:b`) and confirm:

- The build is clean (sheet, `create-report`, `new_report.yaml`, manifest export all resolve).
- In `apps/demo/.lowdefy/server/build/pages/reporting/**`, the chat page carries the selection
  controls, the Save-as-report button and the mounted `save_report_modal`.
- In `apps/demo/.lowdefy/server/build/api/reporting/**`, `create-report` resolves with the
  fragment-backed insert.

## Acceptance Criteria

- `seed-reporting-domain.mjs` inserts two `report_layouts` documents — one with a
  `conversation_id`, one with `null` — in the stored report shape, idempotently.
- `pnpm ldf:b` from `apps/demo` builds clean.
- Build artifacts confirm the chat page has selection + Save-as-report + mounted sheet, and
  `create-report` resolves.

## Files

- `apps/demo/scripts/seed-reporting-domain.mjs` — modify — insert the two seeded reports.

## Notes

- A build check is **not** a live smoke test. Actually running the selection → sheet → insert
  path end to end needs a dev server with real Mongo + AI (a `/r:dev-test` step), because a
  selectable result requires a real conversation with parts. State in your report that end-to-end
  exercise is a dev-test follow-up, not part of this build gate.
- Running the seed script itself needs a Mongo URI (`LOWDEFY_SECRET_MONGODB_URI`); it is not part
  of the sandboxed build gate. Author and commit the seed additions; note that seeding runs where
  a Mongo URI is available.
- The seeded reports' section specs must validate against the demo catalog/views so the report
  page renders them — reuse specs shaped like those the demo's existing charts/tables produce.
