# Task 4: Compiler emits owner-only Continue-in-chat, fix-in-chat, and drop-section; declares `Link`

## Context

Continuing the `compileReport.js` chain. This task adds the **owner-only, interactive**
affordances — the first place the compiler branches on the viewer — and declares the one new
action type they need.

Three affordances, all owner-only and (for the two chat ones) conditional on `conversation_id`:

- **Continue in chat** (report header) — reopens the source conversation with the report as
  context. Owner-only (it exposes the author's transcript); absent entirely when
  `conversation_id` is absent (not disabled — absent).
- **Fix in chat** (on a _broken_ section's Alert) — opens the source conversation with the failing
  section named. Same gate and same `conversation_id` condition as Continue-in-chat. Writes
  nothing; the assistant produces a _new_ report.
- **Drop it** (on a _broken_ section's Alert) — the module's only spec write, via ownership's
  shipped `remove-report-section` endpoint. The page sends a report id + section id (never the
  spec). Section ids are durable, so a repeated click is a plain not-found. The endpoint cascades
  filter bindings and **refuses** when the report's only content is one section plus its filter
  (says: this is the only section, delete the report instead).

A non-owner's broken section **names who can fix it and stops** — no notify, no request-a-fix
button. (Task 5 will further correct this copy for the _withheld_ case.)

Broken sections today render via `failedSectionBlock(section, description)` (compileReport.js:370)
— a bare `Alert`. This task attaches the owner recoveries to that Alert (or emits a wrapping Box
with the Alert + the actions) when `is_owner` is true.

Continue-in-chat and fix-in-chat navigate to the chat page — that's a **`Link` action**, which is
NOT yet in `report.yaml`'s `types.actions`. Per the same-commit rule, this task adds it.

## Interfaces

- **Consumes (from Task 2):** `is_owner` (boolean) and `conversation_id` (string|null) as
  `compileReport` params. Add them to the destructure.
- **Uses (shipped):** `remove-report-section` endpoint (ownership) — resolve its scoped id via the
  reporting module's endpoint operator the same way `resolve-report`/`query-data` ids are
  referenced. Confirm the payload shape (`report_id`, `section_id`) against
  `modules/reporting/api/remove-report-section.yaml`.

## Task

1. Add `is_owner` and `conversation_id` to `compileReport`'s destructured params.
2. **Continue-in-chat** (header): when `is_owner && conversation_id`, emit a control in the header
   region with a `Link` action navigating to the chat page for that `conversation_id`. Emit
   nothing when either is falsy.
3. **Broken-section recoveries:** when a section is broken (`failedSectionBlock` path) and
   `is_owner`:
   - **Fix in chat** — `Link` to the chat page, conversation named + failing section named, only
     when `conversation_id` is present.
   - **Drop it** — `CallAPI` to `remove-report-section` with `{ report_id, section_id: section.id }`,
     then refresh (a `SetState`/re-resolve consistent with how the module refetches). `CallAPI` and
     `SetState` are already declared.
     When `!is_owner`, keep the existing Alert but ensure its copy **names who can fix it** (the
     owner) and offers no action.
4. **Declare `Link`:** add `Link` to `report.yaml` `properties.types.actions` (currently
   `CallAPI` / `SetState` / `DownloadCsv`, lines 45-48). Same commit as the compiler change that
   emits it.
5. Do **not** add `Modal` — per-section expand is not in this design's scope.

## Acceptance Criteria

- Owner + linked report: header shows Continue-in-chat; a broken section shows Fix-in-chat + Drop.
- Owner + report with no `conversation_id`: no Continue-in-chat, no Fix-in-chat; Drop still shows.
- Non-owner: no chat affordances anywhere; a broken section names who can fix it and offers no
  action. (Verify per branch — a non-owner must never see an owner action, even though the
  endpoint would reject it server-side.)
- `report.yaml` `types.actions` includes `Link`; `pnpm ldf:b` clean; the compiled report for a
  seeded broken report (Task 8) shows the `Link`/`CallAPI` actions in
  `.lowdefy/server/build/pages/**`.
- Plugin unit tests: owner vs non-owner branch, and present-vs-absent `conversation_id`, each
  assert the expected affordances.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify: `is_owner`/`conversation_id` params; Continue-in-chat; broken-section owner recoveries; non-owner copy.
- `modules/reporting/pages/report.yaml` — modify: add `Link` to `types.actions`.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify: owner/non-owner and conversation-id-present/absent branch tests.

## Notes

- The `is_owner` branch is a **display** gate; the real authorization is server-side
  (`remove-report-section` owner-matches in its update filter; chat/conversation access is gated
  on its own page/endpoint). Don't rely on hiding alone — but do hide, so a non-owner never sees a
  dead button.
- `remove-report-section`'s refusal-when-last-section is the endpoint's behaviour; the page just
  surfaces its message (this is the one place Remove leads to "delete the report instead"). You do
  not re-implement that logic in the compiler.
