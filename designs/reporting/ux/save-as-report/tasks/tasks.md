# Implementation Tasks — Save as report

## Overview

Implements the tick-and-save report-creation route from
`designs/reporting/ux/save-as-report/design.md`: a shared insert-document fragment,
a page-callable `create-report` endpoint, and a confirm sheet on the chat page that
assembles ticked result cards into a report and saves it. Ships **filterless first** —
the filter picker is a separate sub-design that slots into a reserved region later.

## Available inputs (shipped by the completed chat sub-design)

Task 4 binds to the panel's **part identity**, which the [chat](../../chat/design.md)
sub-design already built and merged (PR #158). Verified in the current code — every panel
part carries these on both the live stream (`onDataPart`) and the reload read
(`get-conversation-results`), so nothing here waits on it:

- `charts.$.id`, `tables.$.id`, `downloads.$.id` — minted onto every part in
  `modules/reporting/api/emit-data-parts.yaml` (`_array.map` + `__uuid`). This is the stable
  key selection binds to, not the array index — the retention `$slice: -50` and a concurrent
  turn's `$push` would otherwise shift the array under an open selection.
- `charts.$.spec` = `{ chart, query, x, y }`; `tables.$.spec` = `{ query, columns }` (carried by
  `buildDataParts.js`); downloads keep `query` **flat** (no `spec` wrapper) plus `label`,
  `description`.
- `charts.$.title` / `tables.$.title` (card heading), `charts.$.created` (the turn timestamp).

## Global Constraints

- Reports are per-user: `create-report` rejects an unauthenticated caller
  (`_user: id` == null → `:reject`), exactly as `generate-report` does.
- Both creation endpoints persist the **validator's output**, never the payload: the stored
  `spec` holds `{ sections }` only; `title` and `description` are lifted to document fields
  off the validated object.
- **One stored document shape, one source.** The full insert document lives only in
  `modules/reporting/defaults/new_report.yaml`; both endpoints `_ref` it. No second inline copy.
- Insert defaults (in the fragment): `owner` = `_ref defaults/owner.yaml` (`{ user_id, name }`
  from `_user`), `visibility: private`, `favourite_of: []`, `deleted: null`, `spec_version: 1`,
  `created`/`updated` = `_ref defaults/change_stamp.yaml`.
- `conversation_id` is a fragment parameter: `create-report` supplies it from page state;
  `generate-report` passes `null` (a tool endpoint has no agent context). The UI treats a
  null `conversation_id` as "no continue-in-chat affordance", never a broken control.
- The sheet assembles **chart, table and download sections only** — no KPI, markdown, or
  filter authoring. It reserves a filters region for the filter-picker sub-design.
- Initial section order is **by kind**: all ticked charts, then tables, then downloads. The
  user reorders with ↑ / ↓ and removes rows — via `ControlledList`'s `moveItemUp(index)` /
  `moveItemDown(index)` / `removeItem(index)` methods. **No drag handle** — no block does drag
  reordering.
- The sheet is a `Modal`, deliberately wide and full-height; a confirm over existing results,
  never a builder.
- Selection is the panel's only _marking_ affordance (`CheckboxSwitch` per card). Any other
  per-card control acts on that one result; none competes with the tick.
- Snake_case request/block/action IDs; kebab-case API endpoint IDs and page IDs
  (`create-report`). Change stamp on every write (via the fragment).

## No route convergence (design-settled)

The design settled this (§"Two creation routes, one validator and one stored shape";
resolved question 3): the typed/agent route does **not** open the sheet. `generate_report`
authors a spec and replies with a link; the sheet is the tick-and-save confirm; a tool endpoint
runs server-side and cannot drive a client modal. The two routes share one validator and one
stored shape, not a UI. So these tasks build only the tick-and-save route — task 1 migrates
`generate-report` onto the shared fragment and otherwise leaves it exactly as it is. There is no
convergence work to build.

## Tasks

| #   | File                             | Summary                                                                             | Depends On |
| --- | -------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| 1   | `01-new-report-fragment.md`      | Extract `defaults/new_report.yaml`; migrate `generate-report` onto it (refactor)    | —          |
| 2   | `02-create-report-endpoint.md`   | New `api/create-report.yaml` on the fragment; register + export in the manifest     | 1          |
| 3   | `03-save-report-sheet.md`        | New confirm sheet component: name, reorderable section list, Save → `create-report` | 2          |
| 4   | `04-panel-selection-and-save.md` | Panel: per-card selection, Save-as-report button, section assembly, mount the sheet | 3          |
| 5   | `05-docs-how-to.md`              | `docs/reporting/` how-to for the save-as-report flow                                | 4          |
| 6   | `06-demo-and-exercise.md`        | Seed two reports (with/without `conversation_id`); `pnpm ldf:b` build-verify        | 4          |

## Ordering Rationale

A single dependency chain, backend → UI → docs/demo:

- **1 before everything.** The shared `new_report.yaml` fragment is the foundation both
  endpoints stand on, and migrating `generate-report` onto it is a behaviour-preserving
  refactor kept separate from the new endpoint (task 2) so it can be reviewed and
  build-verified on its own (generate-report still writes `conversation_id: null`).
- **2 before 3.** The sheet's Save calls `create-report`; `_module.endpointId: create-report`
  must resolve at build, so the endpoint and its manifest export land first.
- **3 before 4.** `chat.yaml` `_ref`s the sheet component and calls `setOpen` on its modal, so
  the sheet file must exist before the panel wiring builds. The sheet reads the state keys the
  panel seeds (`sheet_title`, `sheet_sections`) — see each task's Interfaces.
- **5 and 6 after 4, and independent of each other** — both need the finished flow (docs
  describe it; the demo exercises it), but neither depends on the other, so they can run in
  parallel.

Task 4 additionally binds to the **part fields** the completed chat sub-design already ships
(see "Available inputs" above) — an existing input, not a blocker.

## Scope

**Source:** `designs/reporting/ux/save-as-report/design.md`
**Context read:** `filter-picker/design.md` (sub-design, filterless-first split), and the code
the design names — `modules/reporting/api/generate-report.yaml`,
`modules/reporting/defaults/{owner,change_stamp}.yaml`, `modules/reporting/pages/chat.yaml`,
`modules/reporting/module.lowdefy.yaml`,
`plugins/modules-mongodb-plugins/src/analytics/{buildDataParts.js,validateReportSpec.js}`,
`modules/reporting/api/get-conversation-results.yaml`,
`apps/demo/scripts/seed-reporting-domain.mjs`, `docs/reporting/` tree; plus
`designs/reporting/ux/chat/design.md` + its `tasks/` (part-identity precondition).
**Review files skipped:** `review/review-1.md`, `review/review-2.md`.
