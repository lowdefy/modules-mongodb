# Implementation Tasks — Saved from this chat

## Overview

Implements [`designs/reporting/ux/reports-from-chat/design.md`](../design.md) — **Option B**: a
"Saved from this chat" section at the top of the chat results panel, listing the reports the open
conversation produced, each linking to its report page. The read **folds into
`get-conversation-results`** (no new endpoint), and the section fills **the moment a report is
saved** on both routes — the save sheet refreshes it instead of navigating away, and the agent's
`generate_report` is tied back and streamed in via the turn-end hook — as well as on **re-visit**.

## Available inputs (already shipped)

- **The field.** `conversation_id` is on every report document (`defaults/new_report.yaml`),
  populated by `create-report` from the save sheet and `null` on the agent-tool path today. This
  design reads it, and (task 4) adds a second populator for the agent path.
- **The panel and its load pattern.** `pages/chat.yaml` `results_panel` (`chat.yaml:511`), the
  `conversations.onSelect` load-then-`SetState` chain (`chat.yaml:297`), and the `chat` block's
  `onDataPart` handler (`chat.yaml:450`) are built and merged; tasks here extend them.
- **The turn-end hook.** `emit-data-parts` (`onFinish` hook) already receives `conversationId` and
  `toolResults`, builds the panel's live parts, emits them as `dataParts`, and persists them.
- **The report page + navigation idiom.** Page `report` (`_module.pageId: report`), opened by a
  `Link` action with `urlQuery.report_id` — see `reports-list.yaml:64`.

## Global Constraints

- **One state key, three sources.** `saved_reports` (plain state, snake_case) is written by the
  `set_results` `SetState` (on select and on the save-sheet refresh) and appended by an `onDataPart`
  branch (the live agent part). All three carry the row shape `{ _id, title, visibility, created }`.
- **Owner-scoped read, folded in.** The saved-reports find lives inside `get-conversation-results`,
  filtering `owner.user_id: {_user: id}` and `deleted.timestamp: { $exists: false }`. The endpoint
  already returns `[]`s on its unauthenticated guard; the fold adds `saved_reports: []` there.
- **No new payload key.** The folded find reuses `get-conversation-results`' existing camelCase
  `conversationId` payload, matching it against the report field `conversation_id`.
- **Instant-on-save, sheet.** `save_report_sheet.yaml` drops its post-save `Link` navigation; on a
  successful `create-report` it refreshes `saved_reports` (via `get-conversation-results`) and
  closes, staying on the chat.
- **Instant-on-save, agent.** `generate_report` can't see the `conversationId`; `emit-data-parts`
  backfills `conversation_id` onto each `generate_report` result (owner-guarded `FindOneAndUpdate`)
  and emits a `data-report-saved` part — **streamed, not persisted** to `data_parts` (re-visit
  surfaces it through the folded read, so persisting would double it).
- **`created`, not `updated`, is the saved-when.** Rows sort and display `created.timestamp` so a
  later rename or republish never restates when the report was saved.
- **Absent when empty.** The section renders only when `saved_reports` is non-empty; it hides with
  `visible:` (unmount is safe — no input blocks), **not** the panel's CSS `display` hide.
- **Navigate with a `Link` action** (`pageId: {_module.pageId: report}`, `urlQuery.report_id`),
  never the raw `url` string `create-report` returns.
- **Naming.** Snake_case block/action/state ids; component files snake_case under
  `pages/chat/components/`.
- **Build gate.** `pnpm ldf:b` from `apps/demo`; inspect resolved artifacts under
  `.lowdefy/server/build/api/reporting/**` and `.../pages/**`. A live save or agent turn is a
  `/r:dev-test` step, not a build gate.

## Tasks

| #   | File                                            | Summary                                                                                                                          | Depends On |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-fold-read-into-get-conversation-results.md` | Extend `get-conversation-results` with a `reports-store` find and a `saved_reports` return field.                                | —          |
| 2   | `02-saved-from-chat-section.md`                 | `saved_from_chat.yaml` section as the first panel block; `saved_reports` into `set_results` + switch-blank; `onDataPart` branch. | 1          |
| 3   | `03-save-sheet-instant.md`                      | Drop the sheet's post-save navigation; refresh `saved_reports` via `get-conversation-results` on success.                        | 1          |
| 4   | `04-agent-path-backfill.md`                     | `emit-data-parts` backfills `conversation_id` onto `generate_report` results and emits the `data-report-saved` part.             | 1, 2       |
| 5   | `05-demo-docs-parent.md`                        | Seeded conversation matching a seeded report's `conversation_id`; docs note; parent + save-as-report inventory notes.            | 1, 2, 3, 4 |

## Ordering Rationale

The read is the foundation: **task 1** extends `get-conversation-results` and defines the
`saved_reports` shape every other task carries, so it has no dependencies and everything else builds
on it.

**Task 2** renders the section and wires the three client-side sources of `saved_reports` (the
`set_results` write, the switch-blank, and the `onDataPart` branch); it depends on 1 for the shape
the endpoint returns, and it lands the `onDataPart` branch that task 4's live part needs.

**Tasks 3 and 4 are the two instant-on-save routes and are independent of each other** — 3 is the
client-side sheet change, 4 is the server-side turn-end hook. Both depend on **task 1** (each surfaces
its report through the folded read on re-visit). **Task 4 additionally depends on task 2**, because
its live `data-report-saved` part is rendered by the `onDataPart` branch task 2 adds — without that
branch the emitted part has nowhere to land. Task 3 needs only task 1.

**Task 5** is last: the demo seed verifies end-to-end against 1–4, so it wants them in place. Its
docs/parent/save-as-report notes carry no code dependency and could land any time, but grouping them
with the demo keeps the sub-design's paperwork in one closing change.

Git history confirms the 2/3 boundary: `chat.yaml` and the save-sheet wiring have shipped as
separate commits before ("Wire panel selection and save-as-report", "Present results as selectable
cards"), so splitting the panel section from the sheet change matches how this surface is actually
committed.

## Scope

**Source:** `designs/reporting/ux/reports-from-chat/design.md`
**Context read:** `design.md`, `wireframes.html` (referenced), `docs/reporting/` layout,
sibling designs (`ux/design.md`, `chat/design.md`, `save-as-report/design.md`) for the
`conversation_id` inventory and panel architecture, and git history for the chat/panel surface.
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (decisions already folded
into `design.md`).
