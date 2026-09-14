# Task 4: Agent-path population — backfill and emit in `emit-data-parts`

## Context

`generate_report` is a server-side tool: it creates the report `conversation_id: null` and never
sees the `conversationId`. So the agent path is completed in the turn-end **`emit-data-parts`**
`onFinish` hook, which does hold both the `conversationId` and the turn's `toolResults`. The hook
(a) backfills `conversation_id` onto each report the agent just created — so it shows on re-visit —
and (b) emits a live `data-report-saved` part so it shows **instantly** in the panel (task 2's
`onDataPart` branch appends it).

([Why the hook, not the tool.](../design.md#the-agent-route-populate-conversation_id-in-the-onfinish-hook-not-the-tool))

## Interfaces

- **Consumes:** the turn's `toolResults` (already a payload of `emit-data-parts`), `conversationId`,
  `_user.id`; `reports-store`.
- **Produces:** for each `generate_report` result — a backfilled `conversation_id` on the report,
  and a `data-report-saved` part `{ _id, title, visibility, created }` returned among the hook's
  `dataParts` (task 2's `onDataPart` branch consumes it).

## Task

Edit `modules/ai-reporting/api/emit-data-parts.yaml`:

1. **Extract the generated report ids.** Alongside the existing `chart_specs` / `table_specs` /
   `download_specs`, derive `report_ids` from `toolResults` — filter `$$this.toolName ==
generate_report`, map `$$this.output.report_id`. (Cap consistently with the other kinds, e.g. 8;
   in practice a turn saves at most one.)

2. **Backfill and fetch in one op, per id.** Loop the ids (mirror the chart/table `:for` loops)
   and run a `MongoDBFindOneAndUpdate` on `reports-store`:
   - `filter`: `{ _id: <report_id>, owner.user_id: { _user: id } }` — owner-guarded, so a caller
     can't tie a report they don't own to their conversation.
   - `update`: `{ $set: { conversation_id: { _payload: conversationId } } }`.
   - `options`: `{ returnDocument: after, projection: { title: 1, visibility: 1, created: 1 } }`.

   This both writes the link and returns the row fields the part needs — no extra read. A `null`
   result (report not found / not owned) is skipped, not thrown (the turn is over; a throw would
   lose the turn's other parts — the same discipline the chart/table `:try` loops follow).

3. **Build the saved-report parts.** From the non-null returned docs, build parts
   `{ type: data-report-saved, data: { _id, title, visibility, created } }`. The part's `data` is
   the report row itself — do **not** mint a fresh part id or `created` (unlike chart/table parts):
   the report's own `_id` keys it and its `created` dates it.

4. **Emit but do not persist.** Add the saved-report parts to the hook's **returned** `dataParts`
   (concatenate with the existing `data_parts`), but **not** to the `$push` that persists
   `data_parts` to the conversation document. Re-visit surfaces these reports through task 1's
   folded read (they now carry `conversation_id`), so persisting the part too would double them.
   The existing `persist_results` `$push` must keep pushing only the chart/table/download
   `data_parts`.

Update the hook's header comment to record that it now also ties `generate_report` reports back to
the conversation and streams a `data-report-saved` part (emitted, not persisted).

## Acceptance criteria

- After a turn in which the agent called `generate_report`, the created report carries
  `conversation_id` = the turn's conversation, set owner-guarded.
- The hook returns a `data-report-saved` part for it; that part is **not** written into the
  conversation's `data_parts` array.
- A turn with no `generate_report` call behaves exactly as before (no new writes, no new parts).
- `pnpm ldf:b` from `apps/demo` builds clean; the resolved `emit-data-parts` shows the
  `FindOneAndUpdate` backfill and the saved-report part in the return but not in the `$push`.

## Files

- `modules/ai-reporting/api/emit-data-parts.yaml` — modify — extract `report_ids`, `FindOneAndUpdate`
  backfill loop, build + emit (not persist) `data-report-saved` parts.

## Notes

- **Do not re-stamp `updated`** on the backfill. Setting `conversation_id` completes the create
  within the same turn (the tool couldn't set it); it is not a user edit, and re-stamping would
  bump the report's `updated` past its `created` for no user-visible action. The section's "saved"
  time reads `created` (finding 4).
- `generate-report.yaml` is **not** changed — it already returns `report_id`, and the
  `FindOneAndUpdate` supplies the row fields. Keeping the tool a thin validate-and-insert avoids a
  second place the stored shape is assembled.
- The backfill leaves a sub-second window where the report is `conversation_id: null`; harmless, as
  nothing reads it before turn end (see the design's agent-route decision).
