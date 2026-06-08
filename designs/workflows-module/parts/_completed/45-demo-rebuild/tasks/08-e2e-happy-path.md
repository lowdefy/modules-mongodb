# Task 8: Replace the stale e2e spec with `onboarding-happy-path.spec.js`

## Context

`apps/demo/e2e/workflows/tracker-only-onboarding.spec.js` tests the deleted config (Start-onboarding button, three trackers, installation child, admin close button) — it is stale the moment task 3 lands. It is replaced by a single happy-path spec walking the design's worked example end to end. The other two specs in the folder (`error-push-and-resolve.spec.js`, `transient-throw-retry.spec.js`) are `test.skip` pending Part 22's harness — **leave them untouched**; exhaustive coverage is Part 22's job.

Test infrastructure (from the existing spec and `apps/demo/e2e/`):

- Fixtures: `import { test, expect } from '../fixtures.js'` — merges `ldf` (Lowdefy harness: `ldf.goto`, `ldf.block(...)`, `ldf.user({...})` to set the mock session user incl. `roles`) and `mdb` (MongoDB fixture: `mdb.collection(...)`).
- Engine writes are asynchronous — use `expect.poll(async () => ..., { timeout: 10_000 })` against `mdb` for state assertions, as the old spec did.
- Run via `pnpm e2e` in `apps/demo` (see `apps/demo/e2e/README.md`; `pnpm e2e:server` for iteration).
- The session user's roles drive the one role-gated verb: `send-quote`'s `review: [admin]`. Use `ldf.user({ ..., roles: ['admin'] })` (or set roles up front — the same user can hold `admin` throughout; the demo gates only the review verb).

The happy path (design § Worked example):

1. Create a lead → `leads-create` inserts the doc, logs `create-lead`, starts `onboarding`. `lead-view` renders four groups and five rows — `qualify` actionable, the rest blocked with their `status_map.blocked` messages.
2. Qualify with "Site visit needed?" = yes → pre-hook spawns `site-visit` at `action-required`; the unblock pass fires `send-quote` and `schedule-followup` to `action-required`. The Quote group shows three rows.
3. Check off `site-visit` and `schedule-followup` (shared `workflow-action-edit` page); fill and submit `send-quote` → `in-review`. As admin, approve on `workflow-action-review` → `done`; the wired notification fires.
4. The approve completes the Quote group → `upload-po` unblocks (group-target `blocked_by: [quoting]`); upload the PO and submit → `done`; `track-company-setup` unblocks and renders "Convert the lead to a customer" as a live edit link with `action_id` + `entity_id` substituted.
5. Click through to `companies/new`, fill the form, save → `create-company` inserts the company, the injected `on_create_routine` calls `start-workflow` (linking the child, tracker → `in-progress`) and logs `convert-lead` referencing lead + company. Land on `companies/view`; the slotted panel shows `company-setup` full-scope.
6. Complete `billing-details` and `assign-account-manager`; `kickoff-call` unblocks; check it off → `company-setup` auto-completes → tracker mirrors `done` → `conversion` group done → `onboarding` completes.

## Task

1. **Delete** `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js`.
2. **Create** `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — one sequential test (state is cumulative; same rationale as the old spec's header comment) walking steps 1–6 above.

Implementation guidance:

- **Step 1**: create the lead through the UI (`lead-new`) so `leads-create` runs, or seed via `page.evaluate` POST to the `leads-create` endpoint — UI preferred (it's the demo path). Assert via `mdb`: one `onboarding` workflow on the lead; **five** action docs (not six — `site-visit` doesn't exist yet); `qualify` at `action-required`, the other four at `blocked`. Assert `lead-view` renders the four group titles.
- **Step 2**: drive `qualify` through its rendered edit link (navigate by clicking the row link rather than hard-coding generated page URLs — survives page-id naming). Set `site_visit_required` = yes, submit. Poll: `site-visit` doc exists at `action-required`; `send-quote` + `schedule-followup` at `action-required`.
- **Step 3**: check off `site-visit` and `schedule-followup` via the shared `workflow-action-edit` page (click through their rows). Fill `send-quote` (`quote_total`, `notes`), submit → poll `in-review`. Approve via `workflow-action-review` → poll `done`. **Notification assertion**: poll `mdb.collection('notifications')` for one doc with `event_type`/source `action-approve` for the session user's contact id (see task 6's recipient).
- **Step 4**: poll `upload-po` → `action-required` (the group-target gate: requires `site-visit` done too — this is the D2 pattern under test). Fill `po_number`; the `po_document` file upload may be exercised or left empty if the field is optional — required is only `po_number`. Submit → `done`; poll `track-company-setup` → `action-required` and its rendered row is a link whose href carries `action_id=<tracker_id>&entity_id=<lead_id>`.
- **Step 5**: follow the start link to `companies/new` (URL params intact), fill the company form (name at minimum), save. Poll: `company-setup` workflow exists on the new company with `parent_action_id` linkage; tracker doc `in-progress` with `child_workflow_id` set; one `convert-lead` event referencing both ids. Assert `companies/view` shows the workflows panel with the three setup rows.
- **Step 6**: complete `billing-details` (form) and `assign-account-manager` (check); poll `kickoff-call` → `action-required`; check it off. Poll: `company-setup` workflow completed; tracker `done`; `onboarding` workflow completed.
- **Cleanup** (`finally`): delete the seeded lead, the created company, and all `workflows` / `actions` / `events` / `notifications` docs created for them (filter by the entity ids), mirroring the old spec's pattern.

## Acceptance Criteria

- `tracker-only-onboarding.spec.js` is gone; `onboarding-happy-path.spec.js` passes under `pnpm e2e` against a clean demo build.
- The spec asserts, at minimum: full-scope render at start (5 docs, statuses as authored); the conditional spawn; the review cycle (`in-review` → admin approve → `done`); the group-target unblock of `upload-po`; the start link's substituted sentinels; child start + tracker `in-progress` + `convert-lead` event; tracker mirror to `done` and parent completion. The one wired notification is asserted after the approve.
- No use of admin escape hatches, raw inserts, or direct engine API calls to advance state — every transition goes through the UI surfaces (the design: "No admin-only escape hatches anywhere in the path").
- The two `test.skip` specs are untouched.

## Files

- `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js` — delete
- `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — create

## Notes

- Prefer navigating via rendered links/rows over hard-coded generated page ids (`onboarding-qualify-edit`-style URLs) — Part 38 task 18 / Part 43 renamed page surfaces, and click-through is what a user does; the worked example is written that way.
- If the `file_upload` field proves awkward under Playwright, exercising it is not load-bearing for this spec — `po_number` (required) drives the submit; note the choice in the spec.
- Keep it one spec, one happy path. Resist adding cancel/error/keyed coverage here — Part 22 owns that, with its own fixtures and test workflow.
