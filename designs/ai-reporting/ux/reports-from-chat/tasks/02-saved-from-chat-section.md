# Task 2: The "Saved from this chat" panel section and its refetch

## Context

With the read in place (task 1), this task adds the UI: a section at the **top** of the results
panel that lists the open conversation's saved reports, and the client wiring that keeps
`saved_reports` in step — on conversation select (from `get-conversation-results`) and from the live
`data-report-saved` part the agent path streams (task 4). The save-sheet refresh is task 3; the
hook that emits the live part is task 4.

## Interfaces

- **Consumes:**
  - `get-conversation-results` (task 1) — its response now carries `saved_reports`; no new
    `CallAPI` is added here.
  - Page state `saved_reports`, written by the existing `set_results` `SetState` (and, task 3, the
    save-sheet refresh).
  - The `chat` block's `onDataPart` event — a `data-report-saved` part (emitted by task 4) is
    appended here for the live agent case.
  - The report page: `_module.pageId: report`, opened by a `Link` action with
    `urlQuery.report_id`.
- **Produces:**
  - Page state `saved_reports` — an array of `{ _id, title, visibility, created }`.
  - A component file `_ref`'d as the first block of `results_panel`.
  - An `onDataPart` branch appending `data-report-saved` parts to `saved_reports`.

## Task

### 2a. The section component

**Create `modules/ai-reporting/pages/chat/components/saved_from_chat.yaml`** — a single `Box` section
`_ref`'d into the panel (matching how `save_report_sheet.yaml` and the rail modals are `_ref`'d
under `pages/chat/`). It must:

1. **Render only when non-empty** — `visible:` a test on
   `_gt: [{ _array.length: { _if_none: [ {_state: saved_reports}, [] ] } }, 0]`. Guard the length
   with `_if_none` so an unset/cleared `saved_reports` (null) tests as empty rather than erroring —
   the same idiom `conversation_items.yaml` uses. Use `visible:` (unmount), not the panel's CSS
   `display` hide: this section holds no input blocks, so unmounting drops no state.
2. **Header** — a small heading "Saved from this chat" with a count
   (`_array.length: {_state: saved_reports}`), styled to sit above the scope tabs. Match the
   panel's existing section-heading treatment.
3. **A `List` over `saved_reports`** whose item is a card built from the panel's existing card
   chrome (bordered box; see `charts.$.card`, `chat.yaml:709`), showing per row:
   - the report **title** (`_state: saved_reports.$.title`);
   - a **visibility** tag — `private` / `shared` (`_state: saved_reports.$.visibility`);
   - the **saved-when** — format `saved_reports.$.created.timestamp` with `_dayjs` (the save time);
   - an **Open** `Button` whose `onClick` is a `Link` action:
     ```yaml
     - id: open_saved_report
       type: Link
       params:
         pageId:
           _module.pageId: report
         urlQuery:
           report_id:
             _state: saved_reports.$._id
     ```
     (Model the row/button on the reports-list row, `reports-list.yaml:64`.)

Give the file a header comment: it is the chat → report link surfaced in the panel; populated from
`get-conversation-results`' `saved_reports` on conversation select; absent when the conversation
produced no reports.

### 2b. `_ref` it as the first panel block

In `modules/ai-reporting/pages/chat.yaml`, add `- _ref: pages/chat/components/saved_from_chat.yaml`
to `results_panel.blocks` **immediately after `results_header`** (`chat.yaml:546`) and **before
`results_scope`** (`chat.yaml:578`), so it sits at the top above the scope tabs and live results.
The panel's `layout.gap: 16` spaces it from the header.

### 2c. Read `saved_reports` from the existing load

No new `CallAPI` — the read is folded into `get-conversation-results` (task 1). In the
`conversations.onSelect` handler (`chat.yaml:297`), the existing `set_results` `SetState` already
writes `messages/charts/tables/downloads` from `…get-conversation-results.response.*` under a
stale-response `skip`. Add one more key to that same `SetState`:

```yaml
saved_reports:
  _api:
    _build.string.concat:
      - _module.endpointId: get-conversation-results
      - .response.saved_reports
```

Because it joins the existing `set_results` step, it inherits that step's stale-response `skip`
(`_ne: [ {_event: key}, {_state: conversationId} ]`) — nothing new is wired into `onSelect`.

### 2d. Clear on switch

In the `select_conversation` `SetState` (`chat.yaml:306`) that already blanks
`charts/tables/downloads`, add `saved_reports: []` so the previous conversation's rows clear before
the new fetch resolves. Prefer `[]` over `null` so the `visible` length test and the `List` never
see a null.

### 2e. Append the live agent part on `onDataPart`

The `chat` block's `onDataPart` handler (`chat.yaml:450`) already has per-type branches appending
`data-report-chart` / `-table` / `-download` to their arrays. Add one more branch: when
`_event.type == data-report-saved`, `_array.concat` the part's `data` onto `saved_reports`. This is
how the agent path (task 4) surfaces a just-saved report instantly. Model it exactly on the existing
`append_chart` branch (`chat.yaml:458`), including its `skip`-on-type-mismatch shape.

Because the part carries the row shape `{ _id, title, visibility, created }`, it renders through the
same `List` as the read-sourced rows with no special-casing.

## Acceptance criteria

- Selecting a conversation with saved reports renders the section at the top of the panel with one
  row per report, each row showing title, a visibility tag and a saved-when, and Open navigating
  to `/{module.id}/report?report_id=…`.
- Selecting a conversation with no saved reports renders **no** section.
- Switching between conversations never shows the previous conversation's reports under the new one
  (blanking + stale-guard).
- A `data-report-saved` part delivered to `onDataPart` appends a row to `saved_reports` and the
  section shows it without a reload.
- `pnpm ldf:b` from `apps/demo` builds clean; the resolved `chat` page shows `saved_from_chat`
  as the first `results_panel` block, `set_results` writing `saved_reports`, and the
  `data-report-saved` `onDataPart` branch.

## Files

- `modules/ai-reporting/pages/chat/components/saved_from_chat.yaml` — create.
- `modules/ai-reporting/pages/chat.yaml` — modify — `_ref` the section; add `saved_reports` to the
  existing `set_results` `SetState`; add `saved_reports` to the switch-blanking `SetState`; add the
  `data-report-saved` `onDataPart` branch.

## Notes

- The save-time paths live elsewhere: the save-sheet refresh is task 3, the hook that emits the live
  part is task 4. This task builds the display and the client wiring they feed.
- Keep the row visually a **sibling** of the panel's result cards, but distinct enough to read as
  "kept" vs "current" — a subheading/divider is enough; do not restyle the whole panel.
- If the row card grows busy, a compact one-line row (title · tag · when · Open) is preferable to a
  full card — the reports-list card is the ceiling, not the target.
