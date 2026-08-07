---
title: Save a conversation's results as a report
module: reporting
type: how-to
concepts:
  [
    save-as-report,
    result-selection,
    confirm-sheet,
    conversation-link,
    generate-report,
    filters,
    filter-picker,
  ]
---

# Save a conversation's results as a report

A conversation produces charts, tables and downloads as it answers questions. This guide covers turning the ones that mattered into a saved, navigable report: tick the result cards you want, press **Save as report**, and confirm a pre-filled sheet. No magic phrase, no rebuilding — you keep the discrete results already on screen.

This is the module's secondary creation route. The primary route is the agent's own `generate_report` tool — the guided path the empty-state tracks steer new users to, which also composes KPI and markdown sections. Reach for tick-and-save when the answer is already in front of you and you just want to keep it; reach for `generate_report` when you want the agent to compose a report for you, including sections no result card can produce (see [scope](#what-the-sheet-can-and-cannot-assemble)).

## Save some results

1. In the chat panel, **tick the result cards** you want in the report. Every chart, table and download card carries a checkbox; ticking is the panel's only marking affordance.
2. Press **Save as report**. A confirm sheet opens, pre-filled from your selection.
3. **Edit the name.** It defaults to the conversation title; change it if you want.
4. **Reorder or remove sections.** Each ticked result is a row. Move rows with the **↑ / ↓** buttons and drop ones you changed your mind about with **remove**. Sections start grouped by kind — charts first, then tables, then downloads — and you arrange them from there.
5. **Add filters (optional).** In the **Filters** section, press **add** to author a filter from a field the report can be filtered on: pick the **field**, give it a **label**, pick a **label field** for a looked-up field, and choose **Any / All** for a list field. Add as many as you need, or none. See [Authoring filters](#authoring-filters) for which fields are offered and why.
6. **Save.** The report is created and opens directly. From it you can [continue in chat](#the-conversation-link) back to the conversation it came from.

The sheet is a confirm over what the conversation already produced, not a report builder — you tidy the selection, you don't compose sections from scratch.

## What the sheet can and cannot assemble

The sheet can only assemble what the conversation rendered as a tickable card, and the chat surface renders exactly three kinds:

| Section  | Available from the sheet? | Source                                              |
| -------- | ------------------------- | --------------------------------------------------- |
| Chart    | Yes                       | A ticked chart card                                 |
| Table    | Yes                       | A ticked table card                                 |
| Download | Yes                       | A ticked download (CSV export) card                 |
| Filter   | Yes                       | Authored in the sheet's Filters section (see below) |
| KPI      | No                        | The `generate_report` route only                    |
| Markdown | No                        | The `generate_report` route only                    |

**KPI and markdown sections are out of route.** The chat surface renders no KPI or markdown card, so there is nothing to tick — these come from `generate_report`, which composes them natively. If you want a report that mixes the charts you just made with a KPI at the top, ask the agent to build it in one `generate_report` call rather than saving from the sheet.

### Authoring filters

The **Filters** section adds a filter from a field in the report's data — a control that renders at the top of the saved report and scopes every section built on a collection that has that field. You author only the filter's _definition_; its selectable values resolve live when the report opens and are never previewed in the sheet.

Only fields the picker can complete are offered, drawn from the collections your chosen sections query:

- an **enum field** (a fixed set of values, e.g. a status) — options come straight from the catalog;
- a **looked-up field** (one that references another collection, e.g. a company id) — you pick a **label field** so the options read as names, not ids;
- a **date field** — rendered as a date-range control, no value list needed.

Free-text fields, ids without a relationship, and object fields are not offered: there is nothing the report could resolve into a selectable list. For a **list field** (one holding several values per record), an **Any / All** toggle chooses whether a record matches when it has _any_ of the selected values or _all_ of them.

You never choose which sections a filter scopes. The report binds each filter to every section whose data actually has that field — so a filter binds all sections in a single-collection report, and only the matching sections in one that mixes collections.

**Numeric fields can't be filtered yet.** There is no number-range control, so a "greater than X" filter over a numeric field (a total, a quantity) isn't offered, and numeric fields are omitted from the field list. If you need one, author the report through the agent's `generate_report` route; a numeric-range control is an engine follow-up.

Filters are optional. Add none and the report saves exactly as before — filterless-first, and valid: every section is live-queried each time the report opens, whether or not it carries filters.

## The conversation link

Reports saved this way **link back to their source chat** — the report records the `conversation_id` of the conversation it was assembled from, and the report page offers a continue-in-chat affordance that returns you there.

Reports created by the agent's `generate_report` tool **do not** carry this link. That is a limitation of the tool path, not a bug: a tool endpoint runs server-side with only the tool input in hand and never receives the conversation context, so it cannot populate the field. On a report with no `conversation_id` the continue-in-chat affordance is simply absent — not broken. If linking back to the conversation matters, save from the sheet.
