---
title: Save a conversation's results as a report
module: reporting
type: how-to
concepts: [save-as-report, result-selection, confirm-sheet, conversation-link, generate-report]
---

# Save a conversation's results as a report

A conversation produces charts, tables and downloads as it answers questions. This guide covers turning the ones that mattered into a saved, navigable report: tick the result cards you want, press **Save as report**, and confirm a pre-filled sheet. No magic phrase, no rebuilding — you keep the discrete results already on screen.

This is the module's secondary creation route. The primary route is the agent's own `generate_report` tool — the guided path the empty-state tracks steer new users to, which also composes KPI and markdown sections. Reach for tick-and-save when the answer is already in front of you and you just want to keep it; reach for `generate_report` when you want the agent to compose a report for you, including sections no result card can produce (see [scope](#what-the-sheet-can-and-cannot-assemble)).

## Save some results

1. In the chat panel, **tick the result cards** you want in the report. Every chart, table and download card carries a checkbox; ticking is the panel's only marking affordance.
2. Press **Save as report**. A confirm sheet opens, pre-filled from your selection.
3. **Edit the name.** It defaults to the conversation title; change it if you want.
4. **Reorder or remove sections.** Each ticked result is a row. Move rows with the **↑ / ↓** buttons and drop ones you changed your mind about with **remove**. Sections start grouped by kind — charts first, then tables, then downloads — and you arrange them from there.
5. **Save.** The report is created and opens directly. From it you can [continue in chat](#the-conversation-link) back to the conversation it came from.

The sheet is a confirm over what the conversation already produced, not a report builder — you tidy the selection, you don't compose sections from scratch.

## What the sheet can and cannot assemble

The sheet can only assemble what the conversation rendered as a tickable card, and the chat surface renders exactly three kinds:

| Section  | Available from the sheet? | Source                                             |
| -------- | ------------------------- | -------------------------------------------------- |
| Chart    | Yes                       | A ticked chart card                                |
| Table    | Yes                       | A ticked table card                                |
| Download | Yes                       | A ticked download (CSV export) card                |
| KPI      | No                        | The `generate_report` route only                   |
| Markdown | No                        | The `generate_report` route only                   |

**KPI and markdown sections are out of route.** The chat surface renders no KPI or markdown card, so there is nothing to tick — these come from `generate_report`, which composes them natively. If you want a report that mixes the charts you just made with a KPI at the top, ask the agent to build it in one `generate_report` call rather than saving from the sheet.

**Filters are not authorable from the sheet today.** The sheet reserves a filters region, but the filter picker is forthcoming — for now, tick-and-save creates reports with no user-authored filters. This is filterless-first, and it is valid: every section is live-queried each time the report opens regardless of whether it carries filters.

## The conversation link

Reports saved this way **link back to their source chat** — the report records the `conversation_id` of the conversation it was assembled from, and the report page offers a continue-in-chat affordance that returns you there.

Reports created by the agent's `generate_report` tool **do not** carry this link. That is a limitation of the tool path, not a bug: a tool endpoint runs server-side with only the tool input in hand and never receives the conversation context, so it cannot populate the field. On a report with no `conversation_id` the continue-in-chat affordance is simply absent — not broken. If linking back to the conversation matters, save from the sheet.
