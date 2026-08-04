# Save as report: selection, the confirm sheet, and the create-report endpoint

A sub-design of [`reporting/ux`](../design.md) — plate 3 of [`wireframes.html`](../wireframes.html), redrawn in real blocks in [`wireframes-blocks.html`](../wireframes-blocks.html).

**This is the change that makes the module's second job real.** Today a report exists only if the user types "turn this into a report" — a magic phrase, discovered by reading the welcome and remembered later, with no visible path from an answer on screen to a saved report. This sub-design replaces the phrase with an act: tick the results that answered the question, press **Save as report**, confirm a pre-filled sheet.

It is small in surface — one modal component, one endpoint — and load-bearing out of proportion to its size, because every other sub-design assumes reports get created. [chat](../chat/design.md) builds the panel that hosts the selection; [ownership](../ownership/design.md) owns the model the insert writes; [reports-list](../reports-list/design.md) and [report-page](../report-page/design.md) consume what this creates.

## Proposed change

1. Add **result selection → "Save as report"** in the results panel. Selection is the panel's only marking affordance.
2. Add a **confirm sheet**: name pre-filled from the conversation title, sections as the selected results in order, and a filter picker offering catalog-derived fields. The typed path ("save this as a report") opens the same sheet pre-filled, so both routes converge on one confirm step.
3. Add a **`create-report` endpoint** so report creation no longer depends on the agent's `generate_report` tool. The tool path stays and opens the same sheet.

## Current state

- `modules/reporting/pages/chat.yaml` — the results panel has no selection affordance of any kind; result cards carry expand and download only.
- `modules/reporting/api/generate-report.yaml` — the only creation path. Inserts `{ _id, owner, title, description, spec, conversation_id: null, deleted: null, created, updated }`. The `conversation_id: null` carries a comment recording why: tool endpoints receive only the tool input, so the agent context (conversation id) does not reach them.
- `validateReportSpec` — already validates a spec on the tool path, and is the shared validation both paths will use.

## Key decisions and rationale

### Selection is the entry point to a report, and the panel's only marking affordance

Report creation stops depending on a phrase: the user ticks the results that answered the question and presses **Save as report**. Because selection carries that weight, nothing else on a result card competes with it for "this one matters" — expand, download and `⋯` all act on a single result.

(An earlier revision had a ★ on each card to "mark a result to find later in this conversation"; it was removed as invented surface with no job — a conversation is short enough to scroll, and two marking affordances on one card make neither legible.)

Selection is `CheckboxSwitch` bound to `charts.$.selected` in the panel's state arrays — no new machinery, and the same shape for a chart, a table or an export result. What the sheet reads off a ticked result is the **validated spec the part carries**, not its rendered payload: a chart part persists a baked ECharts option, and an option cannot be reversed into a pipeline, so without the spec beside it a ticked chart could not become a section at all. That part shape is [chat](../chat/design.md#the-panel-is-an-artefact-store-so-its-parts-need-identity-a-date-and-a-bound)'s, and this sub-design is the reason it exists — along with the part `id` the selection keys on, so retention or a concurrent turn cannot shift the array under an open selection.

The division that makes this coherent: the panel card stays a **snapshot** of its turn, and the section the sheet creates from it is **live**, re-queried at every report open. Same spec, two lifetimes.

### One confirm sheet, two routes into it

The sheet is a confirm, never a blank form: the assistant proposes the name, the sections and the candidate filters; the user edits. The typed path opens the same sheet pre-filled. One behaviour is worth more than two shortcuts — and the sheet's shape maps directly onto the report spec the module already persists, so nothing new has to be modelled.

The convergence is the point. Two creation flows would mean two things to explain, two places a spec can be malformed, and a user who learned one route being surprised by the other.

### The filter picker derives its options; it does not invent them

The sheet offers filter fields from the catalog, and for a looked-up option list it derives the query from a catalog `relationships` entry plus a label field the user picks. That derivation rule — and the constraints on what an `optionsQuery` may be, including the scalar `valueKey` requirement — is specified in [`report-filters`](../../report-filters/design.md#two-authors-the-agent-writes-the-pipeline-the-sheet-derives-it). **The sheet is the second author of an `optionsQuery`; the agent is the first.** Both produce the same spec shape and both go through the same validation.

Nothing about filter mechanics is decided here.

### Sections reorder with ↑ / ↓, not a drag handle

No block does drag reordering. `ControlledList` registers `moveItemUp(index)`, `moveItemDown(index)` and `removeItem(index)` as `CallMethod` targets, which is the whole job for a list that is typically two to four rows. A sortable list is not worth a block for this.

The sheet is otherwise all existing blocks: `Modal` + `TextInput` + `ControlledList` + `CheckboxSwitch` + `Selector` + `SegmentedSelector`. `MultipleSelector` supports `{ label, value }` options and tag display natively, so the filter tags plate 6 draws are compiler work, not block work.

### The report ↔ chat link, and the one thing that blocks it

"Continue in chat" and "Open source chat" both need `conversation_id` on the report doc. The existing `generate-report` endpoint cannot supply it — its comment records why: tool endpoints receive only the tool input, so the agent's conversation context never reaches them.

The new `create-report` endpoint **can**, because the sheet is a page calling `CallAPI` where `_state: conversationId` is in hand (the chat page's state key, named for `AgentChat`'s block property). So the link is populated on the sheet path (which is now the primary path) and absent on the tool path. The UI must therefore treat it as **optional**: no `conversation_id`, no continue-in-chat affordance — not a broken button. This is a reason to prefer the sheet path, not a blocker for either.

The field itself is in the [parent's data model](../design.md#data-model); this endpoint is its only populator, and the [report page](../report-page/design.md) is its only consumer.

## Endpoints

| Endpoint        | Status | Shape                                                                                                                        |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `create-report` | new    | `{ spec, conversation_id }` → validate, insert **the validator's output**, return `{ report_id, url }`. Called by the sheet. |

The insert writes the same document shape as `generate-report`, including the [ownership](../ownership/design.md) defaults — `visibility: "private"`, `favourite_of: []`, `deleted: null`, `spec_version: 1`, `owner` = caller — plus the `conversation_id` the tool path cannot supply. Validation is `validateReportSpec`, shared with the tool path, and both paths persist **its output** rather than their input: `spec` holds `{ sections }` with durable section ids, while `title` and `description` are document fields the sheet writes directly ([why](../ownership/design.md#the-stored-spec-is-the-validators-output)). Two authors, one stored shape — which is what keeps the two creation paths from drifting.

## Files changed (anticipated)

- New `modules/reporting/pages/components/save_report_sheet.yaml` — the confirm sheet, opened by both routes.
- `modules/reporting/pages/chat.yaml` — result selection in the panel, the Save-as-report action, and the sheet mounted once.
- New `modules/reporting/api/create-report.yaml`.
- `modules/reporting/module.lowdefy.yaml` — the endpoint export.
- `docs/reporting/` — a how-to for the save-as-report flow.

## Demo consumers

- One seeded report carrying `conversation_id` so Continue-in-chat resolves, and one without so the affordance's absence is exercised too. (Both are read by [report-page](../report-page/design.md); they are seeded once, here, because this is the sub-design that owns the field's population.)
- The sheet reachable from the demo chat page with at least one selectable result, so the whole selection → sheet → insert path is build-verified.

Verify with `pnpm ldf:b` from `apps/demo`.

## Resolved questions

Resolved 2026-07-29:

1. **Can the agent's `generate_report` populate the conversation link?** No — tool endpoints receive only the tool input; the existing code comments this. The page-side `create-report` can, which is one more reason the sheet is the primary path.

Resolved 2026-07-30, from reading the installed block source:

2. **Can sections be dragged to reorder?** No. `ControlledList` moves items by method call; ↑ / ↓ is the shape.

## Deviations from the wireframes

1. **`conversation_id` is optional in the UI.** The plates show Continue-in-chat unconditionally; it is absent on reports created through the agent tool path — see [the report ↔ chat link](#the-report--chat-link-and-the-one-thing-that-blocks-it).
2. **Sections reorder with ↑ / ↓, not a drag handle.** Plate 3 draws `⣿` grips. No block does drag reordering; `ControlledList` exposes `moveItemUp` / `moveItemDown` / `removeItem` as methods.

## Risks

- **Two creation paths for reports** (the sheet and the agent tool) means two callers of the same validation. Contained by both going through `validateReportSpec` and one insert shape, but the tool path's missing `conversation_id` is a real, permanent asymmetry — one that only resolves if tool endpoints ever receive agent context.
- **The sheet's filter picker and the agent both author `optionsQuery`.** Two authors of one spec field is a drift surface; contained by the shape being validated server-side either way, and by the derivation rule living in one place ([`report-filters`](../../report-filters/design.md)).

## Non-goals

- **A report builder UI.** The sheet is a confirm over what the conversation already produced, not a place to compose sections from scratch.
- **Filter mechanics** — see [`report-filters`](../../report-filters/design.md).
- **Editing an existing report's sections through the sheet.** The sheet creates; re-deriving a spec is the assistant's job, and dropping a section is a [report-page](../report-page/design.md) action.
