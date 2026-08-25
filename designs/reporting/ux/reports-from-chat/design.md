# Saved from this chat: the reports a conversation produced, in the results panel

A sub-design of [`reporting/ux`](../design.md). It reads back the `conversation_id` that
[save-as-report](../save-as-report/design.md) writes, closing the **chat → report** direction of
the report ↔ chat link. It is **Option B** of the [reports-from-chat wireframe deck](wireframes.html) (three
placements were sketched — a rail badge, this panel section, and inline transcript markers;
[why B](#why-the-panel-section-and-not-the-rail-badge)).

**The problem.** A saved report already remembers the chat it came from — the report document
carries `conversation_id`, populated on the save-as-report path. But nothing reads it from the
chat side, so a conversation gives no sign it ever produced anything durable. Reopen a chat a week
later and the reports you cut from it are invisible from here; you have to remember they exist and
find them on the reports list.

**The change.** A **"Saved from this chat"** section at the top of the results panel lists the
reports saved from the open conversation — title, visibility, when — each a row that opens the
report page. The read **folds into the existing conversation-load endpoint**
(`get-conversation-results`), so the section rides the call the panel already makes on conversation
select. And it fills **the moment a report is saved**, on both routes: the save sheet refreshes the
section instead of navigating away, and an agent `generate_report` is tied back to its conversation
by the turn-end hook and streamed straight into the section. No new field and no schema change — but
it reaches into the save flow and the agent's `onFinish` hook so both save paths land here live.

> **Implemented.** This sub-design shipped in the `reporting` module (PR #170) —
> the "Reports from this chat" panel section, the folded `get-conversation-results`
> read, and the both-routes live refresh (save sheet + agent `emit-data-parts`
> backfill) are all live. The visible label is **"Reports from this chat"** (this
> doc's older prose says "Saved from this chat"). `docs/reporting/` is the source
> of truth for consumer-observable behaviour; this file records the rationale.

## Proposed change

1. **Extend `get-conversation-results`** — the endpoint the panel already calls on conversation
   select — to also return the caller's non-deleted reports for that conversation as
   `saved_reports` (`{ _id, title, visibility, created }`), most recent first. No new endpoint.
2. Add a **"Saved from this chat"** section as the first block of the results panel, above the
   scope tabs and live results. It renders **only when the list is non-empty** — a chat that
   produced nothing shows no section.
3. **Refetch it on conversation select**, reusing the panel's existing load-then-`SetState`
   pattern; clear it when switching chats so a previous conversation's reports never flash under a
   new one.
4. **Instant-on-save from the sheet.** The save sheet stops navigating to the report page; on a
   successful save it refreshes `saved_reports` (through the same `get-conversation-results` read)
   so the new report appears in the section in place.
5. **Instant-on-save from the agent.** `generate_report` can't see the conversation (a tool
   endpoint), so the turn-end `emit-data-parts` hook — which does hold the `conversationId` —
   backfills `conversation_id` onto the just-created report and emits a live `data-report-saved`
   part the panel appends to `saved_reports`.

## Current state

- `modules/reporting/pages/chat.yaml` — the results panel (`id: results_panel`, `chat.yaml:511`)
  is a fixed right column whose `blocks:` are, in order: `results_header`, `results_scope`
  (the All/Charts/Tables/Exports tabs), `save_as_report_button`, `results_explainer`, and the
  three result `List`s (`charts` / `tables` / `downloads`). It is hidden by CSS `display`, never
  `visible:`, because its cards hold `CheckboxSwitch` selection state that unmounting would drop.
- **Results load on select, not on mount.** `list-conversations` loads on `onMountAsync`; the
  three result arrays are populated two ways — streamed during a turn (`chat` block `onDataPart`,
  `chat.yaml:450`) and, on picking a conversation in the rail, by the `conversations` block's
  `onSelect` (`chat.yaml:297`): a `SetState` that sets `conversationId` and blanks
  `charts/tables/downloads`, then a `CallAPI` to `get-conversation-results`, then a `SetState`
  from `_api ....response.*` guarded by a stale-response `skip`. On a fresh page mount `onInit`
  mints a **new** `conversationId`, so mount is always a new, empty chat — never a restored one.
- `modules/reporting/api/get-conversation-results.yaml` — the model for a conversation-scoped
  read: `MongoDBFindOne` on `conversations-store`, `query: { _id: {_payload: conversationId},
owner.user_id: {_user: id} }`. (Payload key is camelCase `conversationId` there — a framework
  boundary. The folded read below adds no new payload key; it matches the report field
  `conversation_id` against that existing `conversationId`.)
- `modules/reporting/api/create-report.yaml` — **today** the only populator of the report's
  `conversation_id` (from `_state: conversationId` in the save sheet); the agent-tool path
  (`generate-report`) writes `null`. This design adds the agent-path populator (below), so the
  section surfaces reports from both routes — all owned by the conversation's owner, which is why
  the read is owner-scoped.
- `modules/reporting/pages/chat/components/save_report_sheet.yaml` — its `onOk` saves via
  `create-report`, optionally publishes, closes, and **navigates to the report page** via a `Link`
  action (`save_report_sheet.yaml:100`). It refreshes nothing on the chat page.

## Key decisions and rationale

### Instant-on-save on both routes, and on re-visit

A report saved from a chat appears in this section **the moment it is saved**, without leaving the
page — the wireframe's promise, made real on both save routes — and again on **re-visit** when the
conversation is reopened. Three moments, one section.

**The save sheet** (`save_report_sheet.yaml`) today ends its `onOk` by navigating to the new
report's page. That navigation is dropped: on a successful `create-report` the sheet instead
refreshes `saved_reports` — re-reading `get-conversation-results` for the current `conversationId`
— and closes, leaving the user on the chat with the new report now in the section (its row is one
click from the report itself). This is a deliberate change to [save-as-report](../save-as-report/design.md)'s
settled navigate-away behaviour; that sub-design's flow note is updated to point here.

**The agent route** is the harder half and gets its own decision below: `generate_report` is a
server-side tool that never receives the `conversationId`, so the tie-back and the live emit are
done in the turn-end `emit-data-parts` hook instead.

**Re-visit** needs no new trigger: reopening a conversation calls `get-conversation-results`, whose
folded read now returns `saved_reports` for it (a fresh page mount is still a new empty
`conversationId` with nothing to show, correctly). Together these make the section the single live
home for "what this chat produced," whether the report came from ticking cards or from the
assistant.

### The agent route: populate `conversation_id` in the onFinish hook, not the tool

`generate_report` cannot set `conversation_id`: a tool endpoint runs server-side with only the
LLM's tool arguments in scope, and the `conversationId` — a client-minted `_uuid` the model never
sees — does not reach it (its report is created `conversation_id: null`, as `generate-report.yaml`
comments). Fixing that at the tool would mean changing the external agent framework so tool
endpoints receive conversation context — upstream plugin work, out of scope, and the same class of
blocker as the rail block.

The turn-end hook is the seam that avoids it. `emit-data-parts` (an `onFinish` hook) already
receives the `conversationId` **and** the turn's `toolResults`, and already emits the panel's live
parts (`dataParts` → `onDataPart`) and persists them. It gains two things:

1. **Backfill and fetch.** Extract the `report_id`s of the turn's `generate_report` results and,
   owner-guarded (`{ _id: { $in: ids }, owner.user_id: _user.id }`), `$set` `conversation_id` =
   the payload's `conversationId` on them, then read back their `{ _id, title, visibility, created }`
   rows for the live part. This ties each agent report to the conversation — so it surfaces on
   re-visit through the folded read like any other — and yields the rows the live parts need.

   > **Two ops, not one.** The design first specified a single `FindOneAndUpdate` per id (backfill
   > and fetch atomically). The MongoDB **connection plugin ships no find-and-modify request**
   > (`MongoDBFind/FindOne`, `Insert*`, `Update*`, `Delete*`, `Aggregation`, `BulkWrite`,
   > `ChangeStream` only — no `FindOneAndUpdate`), so this is a `MongoDBUpdateMany` (`$set` over
   > `{ _id: { $in: ids } }`) followed by a projected `MongoDBFind` over the same owner-guarded
   > filter. It handles N reports in **two ops total** rather than 2N in a per-id loop, and the
   > owner-guarded read is itself the skip-not-found: an unmatched id (not owned / not found) simply
   > does not come back, so no null needs filtering and nothing throws. The two ops are not atomic,
   > but nothing else touches a just-created report in the sub-second window and the read takes only
   > fields the `$set` never wrote — so the result is identical to a find-and-modify here.

2. **Live emit.** Build a `data-report-saved` part (`{ _id, title, visibility, created }`) from each
   returned row and return them among the hook's `dataParts`; a new `onDataPart` branch appends each
   to `saved_reports` for the instant case.

The backfill leaves a brief window where the report exists with `conversation_id: null` (created by
the tool, set by the hook milliseconds later at turn end) — harmless: nothing reads that report in
the gap, and the section reads either the live part or, on re-visit, the now-populated field.

Unlike the chart/table/download parts, the `data-report-saved` part is **emitted but not persisted**
to the conversation's `data_parts`: re-visit already surfaces the report through the folded read on
`conversation_id`, so persisting the part too would double it. The hook keeps the saved-report part
out of its `$push`, streaming it only.

### Why the panel section, and not the rail badge

The [rail badge (Option A)](wireframes.html) was the other candidate — a count on each conversation row,
visible across all chats at once. It is **blocked by the block**: the rail is the external
`AgentConversations` block (a wrapper over Ant Design X's `Conversations`), whose row schema is
`key / label / group` only — no slot for a badge. A real pill would mean forking that upstream
block; the only zero-block-change form is folding a count into the row's _label text_, which
can't be clicked on its own. The panel, by contrast, is drawn with our own Lowdefy blocks, so a
section with real titles and working links carries **no external dependency** — and it answers the
richer question ("which reports, take me there"), which a bare count cannot. Option A is deferred;
if it lands later it needs its **own** read anyway ([below](#a-single-conversation-list-not-the-grouped-count-option-a-would-need)).

### A single-conversation list, not the grouped count Option A would need

This read returns the reports for **one** conversation. A future rail badge needs a **count per
conversation across all the caller's chats** — a `$group` over the reports store, a different query
with a different shape, and one that does _not_ belong folded into a single conversation's load.
The two share only the owner + not-deleted filter idiom, not the query. Building this one to also
serve a hypothetical badge would be speculative surface; it is scoped to the job in front of it,
and Option A gets its own read when it earns one.

### Owner-scoped, matching the populator

The read filters `owner.user_id = _user.id` and `deleted.timestamp` absent — the reports-store
scope [`list-reports`](../../reports-list/design.md) uses for "mine". This is correct rather than
merely convenient: `conversation_id` is only ever set for the conversation's own owner — the save
sheet writes it as the caller, and the agent-path backfill runs in the owner's turn-end hook against
the owner's report — so "reports from this conversation" and "the caller's reports from this
conversation" are the same set. A report someone else published is not surfaced here even if it
shares a conversation id (it can't — ids are per-chat), and the section never leaks one owner's
reports to another. Same owner boundary the report page already enforces on `conversation_id`.

### Absent when empty — and `visible:`, not the panel's `display` hide

A chat that produced no reports shows **no section** — never an empty "0 reports" — matching the
zero-state rule the wireframe deck states for all three options. The section is gated on
`_array.length` of its state array being non-zero.

It hides with `visible:` (unmount), **unlike** the panel container itself, which hides with CSS
`display:none`. The distinction is load-bearing and worth stating: the panel uses `display`
because its result cards hold `CheckboxSwitch` selection state that unmounting would delete; this
section holds **no input blocks** — only display and navigation — so unmounting it drops no state,
and `visible:` is the simpler correct choice.

### Fold the read into `get-conversation-results`, not a second endpoint

The reports for a conversation load **through the same endpoint as its charts, tables and
downloads**. `get-conversation-results` is already the panel's per-conversation load — owner-scoped,
called once from `onSelect` (`chat.yaml:297`), returning `messages` + `charts` + `tables` +
`downloads`. It gains one more step (a `MongoDBFind` on `reports-store`) and one more return field,
`saved_reports`. The page's existing `set_results` `SetState` — which already writes those four
arrays from the response under the stale-response `skip` — writes `saved_reports` too; nothing new
is wired into `onSelect` itself.

This is deliberate, over a separate `list-conversation-reports` endpoint. A standalone read would
be a second `CallAPI` every conversation-load site has to remember to fire — and the moment a
restore-on-mount path lands (the report page's "Open source chat" deep-link, which would open the
chat at a conversation from the URL), an `onSelect`-only refetch would silently miss it. Because
the reports ride `get-conversation-results`, the section tracks the conversation's results
**wherever they load**, mechanically rather than by convention. The endpoint has exactly one caller
today, so the fold adds a small projected find on select and no new call.

`select_conversation`'s blanking `SetState` (`chat.yaml:306`, which already clears
`charts/tables/downloads`) also clears `saved_reports`, so the outgoing conversation's rows never
linger under the incoming one before the read resolves.

**The load was made mechanical; the clear was left a convention, and it drifted.** Riding
`get-conversation-results` means the rows arrive wherever the conversation loads — but nothing makes
them *leave*. That was a literal key list written out twice: in `select_conversation` (a loading
state the read fills in a moment later) and in `new_conversation` (terminal — New chat starts a
conversation with no read behind it to cover an omission). The paragraph above named only the first,
so `saved_reports` was added there and not to `new_conversation`, and New chat left the previous
conversation's reports listed above an empty transcript.

Fixed by removing the duplication rather than by asking the next author to remember both: the
blanked keys live in `pages/chat/actions/blank_results.yaml`, and each `SetState` merges them with
its own `conversationId` using `_build.object.assign`. That composition works because the two passes
run in the right order — `_ref` and `_var` resolve before build operators, so what `assign` merges
is already the caller's operator, and `_uuid` is *not* a build operator, so it survives the merge as
a runtime node and still mints a fresh id per click. Verified in the built artifact: all five call
sites carry the same five keys, with `{_uuid: true}` on New chat and `{_event: key}` /
`{_url_query: conversation_id}` on the two select paths. `chat-deep-link.spec.js` covers the
behaviour end to end, since a build cannot see a key missing from a `SetState`.

### A card that navigates, from existing chrome

Each row is the panel's card chrome (bordered box, title) plus an **Open** `Button` whose
`onClick` is a `Link` action — `pageId: {_module.pageId: report}`, `urlQuery.report_id:
{_state: saved_reports.$._id}` — exactly as the reports-list row and the save sheet navigate. The
raw `url` string `create-report` returns is **not** used for in-app navigation (it is treated as
external). The row also shows the report's `visibility` (a private/shared tag) and its `created`
stamp ("saved …") — `created`, not `updated`, so a later rename or republish never restates when it
was saved — the two facts that distinguish otherwise similarly-titled reports.

## Endpoints

| Endpoint                   | Status    | Change                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-conversation-results` | modified  | Gains a second step — a `MongoDBFind` on `reports-store` for the caller's non-deleted reports for the conversation — and returns them as `saved_reports` (`{ _id, title, visibility, created }`, sorted `created.timestamp: -1`) alongside the existing four fields.                                                                                                                                          |
| `emit-data-parts`          | modified  | For the turn's `generate_report` results, ties `conversation_id` onto the reports via an owner-guarded `MongoDBUpdateMany` (`$set` over `{ _id: { $in: ids } }`) and reads their rows back with a projected owner-guarded `MongoDBFind` for the live parts (the plugin has no `FindOneAndUpdate`), then emits a `data-report-saved` part per row. Those parts are **emitted, not persisted** to `data_parts`. |
| `generate-report`          | unchanged | Still creates the report `conversation_id: null` and returns `{ report_id, url }`; the hook consumes `report_id` from `toolResults` and the `FindOneAndUpdate` supplies the live part's row fields.                                                                                                                                                                                                           |

The `get-conversation-results` step is a `MongoDBFind` on `reports-store`, not an aggregation: no
computed fields are needed (unlike `list-reports`, which aggregates for `is_favourite` and section
counts), so a projected find is the whole job. The endpoint already returns `[]`s for its four
fields on the unauthenticated guard; that early return gains `saved_reports: []`, so an
unauthenticated call stays a quiet empty feed with no separate `:reject`.

## Files changed (anticipated)

- `modules/reporting/api/get-conversation-results.yaml` — add the `reports-store` find step and
  the `saved_reports` return field (and `saved_reports: []` on the unauthenticated guard).
- New `modules/reporting/pages/chat/components/saved_from_chat.yaml` — the section component
  (`_ref`'d into `results_panel.blocks`), matching how the save sheet and rail modals are `_ref`'d
  under `pages/chat/`.
- `modules/reporting/pages/chat.yaml` — `_ref` the section as the first panel block; add
  `saved_reports` to the existing `set_results` `SetState` and to the `select_conversation`
  blanking `SetState`; add an `onDataPart` branch appending a `data-report-saved` part to
  `saved_reports`. No new `CallAPI`.
- `modules/reporting/pages/chat/components/save_report_sheet.yaml` — drop the post-save `Link`
  navigation; on a successful save, refresh `saved_reports` (via `get-conversation-results`) and
  close.
- `modules/reporting/api/emit-data-parts.yaml` — backfill `conversation_id` onto each
  `generate_report` result and emit a `data-report-saved` part (streamed, not persisted).
- `designs/reporting/ux/design.md` (parent) — update the `conversation_id` inventory on **both**
  axes: readers (report page → + this chat panel) and populators (create-report → + the
  `emit-data-parts` backfill; "always null on the agent-tool path" is no longer true). See
  [resolved question 2](#resolved-questions).
- `designs/reporting/ux/save-as-report/design.md` — a note that the sheet no longer navigates away
  (it refreshes this section), pointing here.
- `docs/reporting/` — a note that the results panel surfaces a conversation's saved reports and
  fills on save.
- `apps/demo/` — a build-verified consumer (below).

## Demo consumers

[save-as-report](../save-as-report/design.md#demo-consumers) already seeds one report with a real
`conversation_id`. This design's demo need is that **a conversation document exists whose `_id`
matches that report's `conversation_id`**, so selecting it in the rail fetches and renders the
section with at least one row — exercising the folded read and a navigating row on **re-visit** end
to end. Seed (or align an existing seeded conversation to) that id.

The two **instant-on-save** paths are build-verified structurally (the save-sheet refresh, the
`emit-data-parts` backfill/emit, and the `onDataPart` branch all resolve in the build), but a live
save or a live agent turn is a `/r:dev-test` step, not a build gate — the agent path in particular
needs a real model turn. Verify config with `pnpm ldf:b` from `apps/demo`, and inspect the resolved
`get-conversation-results` and `emit-data-parts` artifacts under
`.lowdefy/server/build/api/reporting/**`.

## Resolved questions

1. **Does the section appear instantly when a report is saved?** **Yes, on both routes.** The save
   sheet drops its post-save navigation and refreshes `saved_reports`; the agent path's
   `emit-data-parts` hook backfills `conversation_id` and emits a live `data-report-saved` part.
   (This design first shipped re-visit-only, on the reasoning that the save flow navigated away;
   review 1 finding 3 added instant-on-save, changing the save flow and the agent hook to make it
   real.)
   1b. **Why populate the agent path in the hook, not in `generate_report`?** Because a tool endpoint
   never receives the `conversationId` (an external-framework limit the endpoint already documents);
   the `onFinish` hook does. Forking the framework to thread the id into tool calls is out of scope.
   See [the agent-route decision](#the-agent-route-populate-conversation_id-in-the-onfinish-hook-not-the-tool).
2. **Is the report page still the only reader of `conversation_id`, and create-report its only
   populator?** No on both counts. This sub-design makes the chat panel a second **reader**, and the
   `emit-data-parts` backfill a second **populator** (so the agent-tool path is no longer "always
   null"). The parent [`design.md`](../design.md) data-model lines are updated on both axes, so the
   inventory stays the single source of truth.
3. **Reuse `get-conversation-results` for the read?** **Yes — fold it in.** It is the panel's
   single per-conversation load (one caller, owner-scoped, fired on the same `onSelect`), and the
   saved reports are results-panel content. Folding adds one step and one return field, deletes a
   would-be second endpoint and its `CallAPI`, and makes the section track the conversation's
   results wherever they load — including a future restore-on-mount path a separate endpoint would
   miss. (This design first proposed a standalone `list-conversation-reports`; review 1 folded it —
   the "different store / different concern" objection didn't hold: same DB, and saved reports are
   panel content.)
4. **Share the read with a future rail badge (Option A)?** No. A needs a grouped count across all
   chats; this is one chat's list — different query, different shape. Shared filter idiom only.

## Deviations from the wireframe

1. **The save sheet no longer navigates to the report page.** To make instant-on-save real, its
   `onOk` refreshes this section and stays on the chat instead of opening the report. This is a
   deviation from [save-as-report](../save-as-report/design.md)'s flow, not from the Option B plate
   (which drew the section filling on save — now honoured).

## Non-goals

- **The rail badge / label-suffix (Option A)** — deferred; it is block-gated and needs its own
  grouped-count read.
- **Inline transcript markers (Option C)** — the richest, heaviest placement; not now.
- **Forking the agent framework** so tool endpoints receive the `conversationId`. The
  `emit-data-parts` backfill sidesteps the need; the tool stays as-is.
- **A reverse pointer on the conversation document.** The link stays one-directional
  (report → conversation); the section derives from that, adding no field.
- **Surfacing another user's reports** that happen to share a conversation. Owner-scoped only.

## Risks

- **`emit-data-parts` grows on `generate_report` turns.** The tuned turn-end hook now does an
  owner-guarded `UpdateMany` and a projected `Find`, plus builds one extra part, when a turn saved a
  report. Contained: it is guarded on a non-empty id list, so a turn that called no `generate_report`
  makes no write and no read; the two ops are small and bounded by the per-turn id cap.
- **Two populators of `conversation_id` now.** The save sheet and the hook both set it — a second
  writer of a field that had one. Contained: both write the same value shape for the same owner, and
  the parent inventory records both so the invariant doesn't drift silently.
- **The save-sheet flow change ripples into save-as-report.** Dropping its navigation is a
  behaviour change owned there; the deviation and the parent note keep the two designs in step
  rather than letting them disagree.
- **`get-conversation-results` now reads two stores.** The fold adds a `reports-store` find to what
  was a single conversations-store read. Contained: one caller, a small projected find on select,
  and the two reads are independent (no cross-store `$lookup`); the report read adds no contention
  on the per-turn conversation write path.
