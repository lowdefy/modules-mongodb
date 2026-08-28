# Consistency Review 1

## Summary

Checked the full `reports-from-chat` design tree against the review-1 decisions (four findings, all
Resolved) after the action-review reshaped the design into instant-on-save on both routes. Found
**four** inconsistencies, all **auto-resolved** — the design prose had drifted from the mechanisms
settled in the review annotations and task files; no user decision was needed.

## Files Reviewed

- **Design:** `design.md`
- **Wireframe:** `wireframes.html` (referenced by the design; present, links valid)
- **Reviews:** `review/review-1.md` (findings 1–4, all Resolved)
- **Tasks:** `tasks/tasks.md`, `tasks/01-fold-read-into-get-conversation-results.md`,
  `tasks/02-saved-from-chat-section.md`, `tasks/03-save-sheet-instant.md`,
  `tasks/04-agent-path-backfill.md`, `tasks/05-demo-docs-parent.md`
- **Plans:** none

## Inconsistencies Found

### 1. Backfill operator: `UpdateOne` vs `FindOneAndUpdate`

**Type:** Design-vs-Task / Review-vs-Design drift
**Source of truth:** review-1 finding 3 annotation ("owner-guarded `FindOneAndUpdate`") and task 04,
which uses `FindOneAndUpdate` (returnDocument: after) to backfill **and** fetch the live part's row
in one op.
**Files affected:** `design.md` (agent-route decision bullet 1, endpoints table, risks),
`tasks/tasks.md`.
**Resolution:** changed all three `design.md` mentions and the `tasks.md` constraint from `UpdateOne`
to `FindOneAndUpdate`, and reworded the backfill bullet to note it returns `{ title, visibility,
created }` for the live part.

### 2. Live-part row fields: "tool input's title" vs the fetched row

**Type:** Internal Contradiction (Design-vs-Task)
**Source of truth:** task 04 — the `FindOneAndUpdate` returns the row, so the live part's
`title/visibility/created` come from the report document, not the `generate_report` tool input.
**Files affected:** `design.md` endpoints table (`generate-report` row parenthetical).
**Resolution:** replaced "(Only the tool input's title is reused for the live part …)" with "the
`FindOneAndUpdate` supplies the live part's row fields."

### 3. Stale "separate endpoint / snake `conversation_id` payload" note

**Type:** Stale Reference (drift from the fold, review-1 finding 1)
**Source of truth:** the fold decision + task 01 / `tasks.md` ("no new payload key; the folded find
reuses the existing camelCase `conversationId`").
**Files affected:** `design.md` Current-state bullet for `get-conversation-results`.
**Resolution:** rewrote the parenthetical to say the folded read adds no new payload key and matches
the report field `conversation_id` against the existing `conversationId` — removing the leftover
reference to "this design's endpoint uses snake `conversation_id`" from the pre-fold plan.

### 4. Stale inference "every report this section can surface is one the caller saved themselves"

**Type:** Internal Contradiction (superseded by expanded scope, review-1 finding 3)
**Source of truth:** the owner-scoped decision and resolved-question 2 — the section now also
surfaces agent-created reports (populated by the `emit-data-parts` backfill).
**Files affected:** `design.md` Current-state bullet for `create-report`; `tasks/01`'s context line.
**Resolution:** reframed the Current-state bullet to note create-report is the populator **today**
and this design adds the agent-path populator (both for the conversation's owner, hence owner scope);
aligned task 01's "only ever set by the owner saving" phrasing to cover both routes.

## No Issues

- **Task ↔ file coverage.** The design's "Files changed" list matches the five tasks
  (get-conversation-results → 01; saved_from_chat + chat.yaml → 02; save_report_sheet → 03;
  emit-data-parts → 04; demo/docs/parent/save-as-report → 05).
- **Timestamp field.** `created` (display + sort `created.timestamp: -1`) is consistent across the
  design, task 01, task 02, and the live-part shape (finding 4).
- **`data-report-saved` part shape** `{ _id, title, visibility, created }` matches between the
  design, task 02's `onDataPart` branch, and task 04's emit.
- **Cross-references / anchors.** The wireframe link and the intra-design anchors
  (`#why-the-panel-section-…`, `#the-agent-route-…`, `#a-single-conversation-list-…`) resolve;
  the renamed task file `01-fold-read-into-get-conversation-results.md` is linked correctly from
  `tasks.md`.
- **Review annotations ↔ artifacts.** Findings 1–4's resolutions all match the current design/tasks
  (fold, subsumed, instant-on-save both routes, `created`).
