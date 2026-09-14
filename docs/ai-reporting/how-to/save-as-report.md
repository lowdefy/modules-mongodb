---
title: Save a conversation's results as a report
module: ai-reporting
type: how-to
concepts:
  [
    save-as-report,
    result-selection,
    confirm-sheet,
    conversation-link,
    saved-from-chat,
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
6. **Save.** The report is created and appears immediately in the **[Reports from this chat](#reports-from-this-chat)** section at the top of the results panel — you stay on the conversation rather than being taken away to the report. Open it from that section's row when you want it.

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

## Reports from this chat

The results panel shows a **Reports from this chat** section at the top, listing the reports the open conversation has produced — each row a title, a private/shared tag, when it was saved, and an **Open** button to its report page. It appears **the moment a report is saved** — whether you saved it from the sheet or the assistant built it with `generate_report` — and again whenever you **reopen the conversation** later. A conversation that has produced no reports shows no section (never an empty "0 reports").

This is the chat side of the conversation link below: the section is how a conversation surfaces what it durably produced, so a report you cut from a chat a week ago is one click away when you return to it, instead of something you have to remember and hunt down on the reports list.

## The conversation link

Reports **link back to their source chat** — the report records the `conversation_id` of the conversation it was assembled from, and the report page offers a continue-in-chat affordance that returns you there.

Both creation routes now carry this link. A report saved from the sheet records the conversation directly. A report the agent builds with `generate_report` is tied back at the end of the turn: the tool itself runs server-side with only its input in hand and never sees the conversation, so it creates the report unlinked, and the turn-end hook — which does hold the conversation — populates `conversation_id` a moment later. Either way the report ends up linked, shows up in **Reports from this chat**, and offers continue-in-chat.
