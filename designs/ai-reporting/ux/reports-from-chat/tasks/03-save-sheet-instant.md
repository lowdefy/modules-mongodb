# Task 3: Save-sheet instant-on-save

## Context

Today the save sheet's `onOk` saves via `create-report`, optionally publishes, closes, and then
**navigates to the report page** (`save_report_sheet.yaml:100`, a `Link` action). For the "Saved
from this chat" section to fill the moment you save, the sheet must instead stay on the chat and
refresh the section. This task drops the navigation and adds the refresh.

This is a deliberate change to [save-as-report](../../save-as-report/design.md)'s settled
navigate-away behaviour — recorded as a deviation and mirrored by a note in that design (task 5).

## Interfaces

- **Consumes:** `get-conversation-results` (task 1, now returning `saved_reports`); page state
  `conversationId`; the `saved_reports` state key (task 2).
- **Modifies:** `modules/ai-reporting/pages/chat/components/save_report_sheet.yaml` `onOk`.

## Task

In `save_report_sheet.yaml`'s `onOk`, after the successful `save_report` (and `publish_report`)
steps and the modal close:

1. **Remove** the `open_saved_report` `Link` step (`save_report_sheet.yaml:100`) — the sheet no
   longer navigates to the report page.
2. **Add a refresh** so the new report appears in the section in place. Reuse the folded read:
   - `CallAPI` (`id: refresh_saved_reports`) to `get-conversation-results`, payload
     `conversationId: { _state: conversationId }`.
   - `SetState` (`id: set_saved_reports_after_save`) writing `saved_reports` from
     `…get-conversation-results.response.saved_reports`.

   Order it after `save_report` (which carries the `Report saved.` success toast and throws-and-stops
   on rejection, so the refresh only runs on success) and after the modal close, so the section
   updates behind the closing sheet.

Keep the existing `Report saved.` success message — the toast plus the row appearing in the section
is the confirmation that replaces the navigation.

## Acceptance criteria

- Saving from the sheet leaves the user **on the chat page** (no navigation to `report`), with the
  new report now shown in the "Saved from this chat" section.
- The `create-report` → optional `set-report-visibility` → close sequence is otherwise unchanged;
  the success toast still fires.
- `pnpm ldf:b` from `apps/demo` builds clean; the resolved sheet `onOk` has no `Link` step and
  carries the `get-conversation-results` refresh.

## Files

- `modules/ai-reporting/pages/chat/components/save_report_sheet.yaml` — modify — drop the `Link`;
  add the `get-conversation-results` refresh + `SetState`.

## Notes

- Refreshing through `get-conversation-results` (rather than optimistically appending from
  `create-report`'s `{ report_id }`) keeps one source of truth for a row's shape — the same read the
  section uses everywhere — and correctly reflects the stored `visibility` after an optional publish.
- Do **not** also keep a "view report" affordance in the flow beyond the section row's Open button;
  the row is the way to the report now. (If a "saved — view it" nicety is later wanted, that is a
  save-as-report change, not this task.)
