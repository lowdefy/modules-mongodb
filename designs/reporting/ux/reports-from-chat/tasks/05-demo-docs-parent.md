# Task 5: Demo consumer, docs, and the parent + save-as-report notes

## Context

Ties off the sub-design: a build-verified demo path that exercises the section, a docs note so the
behaviour is discoverable, the two-axis update to the parent design's `conversation_id` inventory,
and a flow note in save-as-report (whose navigation this design changed).

## Task

### 5a. Demo consumer

The [save-as-report demo](../../save-as-report/design.md#demo-consumers) already seeds one report
with a real `conversation_id`. For the section to render on re-visit, **a conversation document must
exist whose `_id` equals that report's `conversation_id`**, owned by the same demo user.

- Locate the save-as-report seed (the report carrying a real `conversation_id`) in the demo module
  under `apps/demo/modules/reporting/`.
- Ensure a seeded conversation exists with `_id` = that `conversation_id` (seed one, or point an
  existing seeded conversation's `_id` at it — whichever keeps the demo seeds coherent).
- Result: opening that conversation from the rail on the demo chat page shows "Saved from this
  chat" with at least one navigating row.

Do **not** invent a second unrelated seed — reuse the report save-as-report already seeds, so the
two sub-designs share one coherent fixture. The **instant-on-save** paths (sheet refresh, agent
backfill/emit) are build-verified structurally; a live save or agent turn is a `/r:dev-test` step,
not a build gate.

### 5b. Docs

Add a short note under `docs/reporting/` (the chat/results-panel page, or a how-to) that the
results panel surfaces the reports saved from the open conversation, with a link to each — appearing
**as soon as a report is saved** (from the sheet or the assistant) and again on re-visiting a
conversation. Front-matter per `docs/CONTRIBUTING.md`. No `vars` changed, so no `pnpm docs:gen` var
regeneration is required — but run `pnpm docs:check` to lint front-matter.

### 5c. Parent inventory — readers and populators

In `designs/reporting/ux/design.md`, the data-model section states:

> [save-as-report] is the only populator of `conversation_id`; [reports-list] and [report-page]
> are readers.

and

> `conversation_id` (already on the document, always `null` on the agent-tool path — [save-as-report]
> is what finally populates it).

Update **both** on **both axes**:

- **Readers:** add this sub-design — "… [report-page] and
  [reports-from-chat](reports-from-chat/design.md) are readers."
- **Populators:** it is no longer only save-as-report, and no longer always-null on the agent path —
  the `emit-data-parts` turn-end hook now backfills `conversation_id` on the agent route (specified
  here in [reports-from-chat](reports-from-chat/design.md)).

Keep it minimal and accurate; do not restate the model (the sub-design links to the parent).

### 5d. Save-as-report flow note

In `designs/reporting/ux/save-as-report/design.md`, add a short note where it describes the sheet's
`onOk` navigating to the report page: the sheet **no longer navigates** — it refreshes the chat's
"Saved from this chat" section and stays put — pointing to
[reports-from-chat](../reports-from-chat/design.md). This keeps the two designs in step rather than
leaving save-as-report describing a flow this design changed.

## Acceptance criteria

- On the demo chat page, selecting the seeded conversation renders the section with ≥1 row that
  opens the seeded report; a conversation with no reports renders no section.
- `pnpm ldf:b` from `apps/demo` builds clean.
- `pnpm docs:check` passes (front-matter valid; no generated-file drift).
- The parent design names this sub-design as a reader **and** records the second populator; the
  save-as-report design notes the dropped navigation.

## Files

- `apps/demo/modules/reporting/**` — modify/seed — a conversation whose `_id` matches the seeded
  report's `conversation_id`.
- `docs/reporting/**` — add the note.
- `designs/reporting/ux/design.md` — modify — reader + populator inventory.
- `designs/reporting/ux/save-as-report/design.md` — modify — sheet-navigation note.

## Notes

- This is the demo half of the "always add a demo consumer" rule — the section gets a
  build-verified reference and a worked fixture in the same change.
- No changeset yet — the reporting module is still being built out (per the module's standing
  no-changesets-until-final note); do not add one or flag it as owed.
