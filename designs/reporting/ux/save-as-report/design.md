# Save as report: selection, the confirm sheet, and the create-report endpoint

A sub-design of [`reporting/ux`](../design.md) — plate 3 of [`wireframes.html`](../wireframes.html), redrawn in real blocks in [`wireframes-blocks.html`](../wireframes-blocks.html).

**This is the change that makes the module's second job real.** Today a report exists only if the user types "turn this into a report" — a magic phrase, discovered by reading the welcome and remembered later, with no visible path from an answer on screen to a saved report. This sub-design replaces the phrase with an act: tick the results that answered the question, press **Save as report**, confirm a pre-filled sheet.

It is small in surface — one modal component, one endpoint — and load-bearing out of proportion to its size, because every other sub-design assumes reports get created. [chat](../chat/design.md) builds the panel that hosts the selection; [ownership](../ownership/design.md) owns the model the insert writes; [reports-list](../reports-list/design.md) and [report-page](../report-page/design.md) consume what this creates.

## Proposed change

1. Add **result selection → "Save as report"** in the results panel. Selection is the panel's only marking affordance.
2. Add a **confirm sheet**: name pre-filled from the conversation title, and sections as the selected results in order. (The sheet reserves a filters region, but the filter picker itself is a sub-design — [`filter-picker`](filter-picker/design.md) — and this sheet ships filterless first.)
3. Add a **`create-report` endpoint** so report creation no longer depends on the agent's `generate_report` tool. The tool path stays as it is — the agent authors a spec and replies with a link — and both endpoints share one validator and one stored shape ([why they don't share a UI](#two-creation-routes-one-validator-and-one-stored-shape)).

## Current state

- `modules/reporting/pages/chat.yaml` — the results panel has no selection affordance of any kind. Chart and table cards carry only their title, the rendered result and an "as of" date; only an export card carries a control, its download button. There is no per-result `⋯` menu (the only kebab on the page is the conversation rail's).
- `modules/reporting/api/generate-report.yaml` — the only creation path. Inserts `{ _id, owner, title, description, spec, conversation_id: null, deleted: null, created, updated }`. The `conversation_id: null` carries a comment recording why: tool endpoints receive only the tool input, so the agent context (conversation id) does not reach them.
- `validateReportSpec` — already validates a spec on the tool path, and is the shared validation both paths will use.

## Key decisions and rationale

### Selection is the entry point to a report, and the panel's only marking affordance

Report creation stops depending on a phrase: the user ticks the results that answered the question and presses **Save as report**. Selection is the card's only _marking_ affordance — the one control that says "this result matters for the report." Any per-result action a card carries or grows (an export's download, a future expand) acts on that single result; none of them marks it, so none competes with the tick.

(An earlier revision had a ★ on each card to "mark a result to find later in this conversation"; it was removed as invented surface with no job — a conversation is short enough to scroll, and two marking affordances on one card make neither legible.)

Selection is `CheckboxSwitch` bound to `charts.$.selected` in the panel's state arrays — no new machinery, and the same shape for a chart, a table or an export result. What the sheet reads off a ticked result is the **validated spec the part carries**, not its rendered payload: a chart part persists a baked ECharts option, and an option cannot be reversed into a pipeline, so without the spec beside it a ticked chart could not become a section at all. That part shape is [chat](../chat/design.md#the-panel-is-an-artefact-store-so-its-parts-need-identity-a-date-and-a-bound)'s, and this sub-design is the reason it exists — along with the part `id` the selection keys on, so retention or a concurrent turn cannot shift the array under an open selection.

A part is not itself a section, and the sheet is what closes the gap. A ticked chart in state is `{ id, title, option, spec: { chart, query, x, y }, created }`; a section `validateReportSpec` accepts needs a `type` and a `label`, which the part does not carry — its user string lives in `title`, and its kind is implicit in which array it came from. So the sheet **assembles finished sections**: for each ticked part it stamps the section `type` (`chart` / `table` / `download`, from the array the tick lives in) and lifts the card's `title` into the section `label`, then carries the part's `spec` fields through. The initial section order is **by kind — all ticked charts, then tables, then downloads** — which the user then reorders with ↑ / ↓; the three arrays are read in that fixed sequence, so no cross-array ordering has to be tracked at selection time. This is what "the sheet is the second author" means concretely — it hands `create-report` the same section-shaped input the agent's `generate_report` authors, so `create-report` stays a thin validate-and-insert. (The part legitimately differs from the section: the part is a snapshot with a baked option, the section is a live spec — same fields, two lifetimes, so the wrap is real work, not an accident of shape.)

The division that makes this coherent: the panel card stays a **snapshot** of its turn, and the section the sheet creates from it is **live**, re-queried at every report open. Same spec, two lifetimes.

### The sheet assembles chart, table and download sections only — KPIs and markdown stay on the `generate_report` route

The sheet can only assemble what the conversation rendered as a tickable card, and the chat surface renders exactly three: `render_chart`, `render_table`, `export_data`. There is no `render_kpi` tool, no `data-report-kpi` part, no `kpis` state array — so a KPI section, though [`validateReportSpec`](../../../../plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js) accepts one (`{ type: kpi, label, query, valueKey, format? }`), can never come out of this route. That is deliberate, not an oversight: `generate_report` is the guided primary route (the chat design's welcome tracks steer new users to it), it composes KPI sections natively, and it is a strict superset of what the sheet produces. Tick-and-save is the secondary "keep the discrete results I'm already looking at" route, and a KPI — a single number — is the one result type that is better _composed at the top of a report_ than _kept on its own_.

The outcome a user might reach for here is already free on the primary route: because `generate_report`'s chart/table sections use the identical spec shape the render tools emit, "turn the charts we just made into a report and add a revenue KPI at the top" is one `generate_report` call, not a tick-and-save. What is _not_ cheap — and is therefore deferred — is bridging the tick UI into the agent (selection is client page state no tool sees, so seeding a `generate_report` from ticked specs is new plumbing on both sides) or enriching an already-saved report with KPIs (report-editing, a non-goal). A `render_kpi` card that the sheet then assembles as a fourth kind is a coherent future improvement; it is chat-surface work first, and it waits until the tick-and-save route earns it.

### Two creation routes, one validator and one stored shape

The sheet is a confirm, never a blank form: it opens pre-filled — the name from the conversation title, the sections from the ticked results in kind order (and, once the [picker](filter-picker/design.md) lands, candidate filters) — and the user edits, reorders and removes before saving. It also takes an optional free-text **description** — a `TextArea`, blank by default — sent as a string or `null` so a blank field stores no description (`validateReportSpec` keeps `""` verbatim but drops a `null`/absent one). Its shape maps directly onto the report spec the module already persists, so nothing new has to be modelled.

An earlier revision had the agent's typed route converge on this same sheet — "save this as a report" opening the same pre-filled confirm. That is **dropped**, because it cannot be built: `generate_report` is a tool endpoint, and a tool endpoint runs server-side with only the tool input in hand — it has no handle on the page and cannot open a client modal. (It is the same limitation that keeps `conversation_id` off the tool path — see [the report ↔ chat link](#the-report--chat-link-and-the-one-thing-that-blocks-it).) So the two routes stay distinct: the agent authors a spec and replies with a link; the sheet is the tick-and-save route's own confirm.

What they converge on is not a UI but the part that matters for correctness — **one validator and one stored shape**. Both the sheet's `create-report` and the agent's `generate_report` run the same `validateReportSpec` and insert through the same [`new_report.yaml`](#endpoints) fragment, so a spec is validated one way and stored one way whichever route authored it. That is the convergence worth having: never two places a spec can be malformed, never two document shapes to keep in step.

The two routes are not peers. `generate_report` is the guided primary route — the [welcome tracks](../chat/design.md) steer new users to it, and it composes the KPI and markdown sections a ticked card cannot ([why](#the-sheet-assembles-chart-table-and-download-sections-only--kpis-and-markdown-stay-on-the-generate_report-route)). The sheet is the secondary "keep the discrete results I'm already looking at" route. Two routes, one spec grammar, one insert.

### The filter picker is a sub-design; this sheet ships filterless first

The picker UI belongs to this sheet, but it is a design's worth of _authoring_ decisions on its own — which catalog fields are eligible, whether numeric fields are filterable at all (report-filters ships no numeric-range control), how the assistant's proposed filters and the user's added ones coexist, whether the sheet previews resolved options or emits the query blind, and what authoring-time failure looks like. None of the rest of this sheet depends on any of that, so the picker is carved into [`filter-picker`](filter-picker/design.md), which feeds this design.

**This sheet ships without the picker first.** It reserves a filters region and otherwise creates reports with **no user-authored filters** — which is valid and useful: sections are live-queried regardless, and the agent tool path already creates filterless reports today. The picker slots into the reserved region when its sub-design lands. Nothing about selection, section assembly, the endpoint or the insert changes when it does — a filter is just another section the same `create-report` validates and stores.

### Publishing from the sheet: create private, then publish

The sheet carries a **"Who can see it"** control — a `SegmentedSelector`, **Only me** (`private`) / **Everyone** (`shared`) — so an author can publish at the moment they save, not only later from the report page. It fills in plate 3's "who can see this" affordance.

The control is an **affordance, not the authorization**. It renders only for users who could actually publish — those holding a [`share_roles`](../ownership/design.md) role (`_user.hasSomeRoles`, wrapped in `_build.if` so an app that never set `share_roles` compiles the check to a literal `false` and never shows the control) — so nobody is offered a choice the endpoint would reject. The boundary stays server-side: the match in `set-report-visibility` is the authorization, the hidden control is only UX — the module's stated position that a hidden menu item is an affordance and the endpoint match is the authorization.

The save is **create then publish**, not a `visibility` payload on `create-report`. The report is always inserted `private` (the `new_report.yaml` default, unchanged); when the author chose **Everyone**, the sheet makes a second `set-report-visibility` call. That endpoint is the single owner of publish authorization — publishing requires the caller to be the owner **and** hold a `share_roles` role ([why the two directions are gated differently](../ownership/design.md)) — so teaching `create-report` a `visibility` field would fork that gate into a second copy that drifts the moment either half changes. Because the control only shows to role holders, the follow-up publish is expected to succeed; were it ever rejected, the report is already saved `private`, the safe outcome.

### Sections reorder with ↑ / ↓, not a drag handle

No block does drag reordering. `ControlledList` registers `moveItemUp(index)`, `moveItemDown(index)` and `removeItem(index)` as `CallMethod` targets, which is the whole job for a list that is typically two to four rows. A sortable list is not worth a block for this.

The sheet is a `Modal`, deliberately **generous — wide and full-height** — rather than a page. It carries a name, a reorderable section list and a per-filter picker, so it is not small; but the room a page would buy is not worth what a page loses. The confirm-not-builder stance ([non-goals](#non-goals)) is structural in a modal — it is an interruption over the answer it came from, not a surface that invites composing sections from scratch — whereas a page would have to work to keep looking like a confirm and would need an empty state for the reload that clears the selection. State loss is not the reason: `SetGlobal` survives navigation, so a page route is technically open — the choice is framing, not feasibility. (A `Drawer` is the same trade in a different shape; worth weighing against a running app if the modal feels tight. This is a surface decision, revisitable — the endpoint, validation and insert are unaffected either way.)

The sheet is otherwise all existing blocks: `Modal` + `TextInput` + `TextArea` + `ControlledList` + `CheckboxSwitch` + `Selector` + `SegmentedSelector`. `MultipleSelector` supports `{ label, value }` options and tag display natively, so the filter tags plate 6 draws are compiler work, not block work.

### The report ↔ chat link, and the one thing that blocks it

"Continue in chat" and "Open source chat" both need `conversation_id` on the report doc. The existing `generate-report` endpoint cannot supply it — its comment records why: tool endpoints receive only the tool input, so the agent's conversation context never reaches them.

The new `create-report` endpoint **can**, because the sheet is a `Modal` mounted on the chat page and calls `CallAPI` with `_state: conversationId` in hand. That key is set at the chat page's `onInit` (named for `AgentChat`'s block property), and the modal shares it because it lives in the same page's state — no page navigation, and nothing extra to thread through. So the link is populated on the sheet path and absent on the tool path. The UI must therefore treat it as **optional**: no `conversation_id`, no continue-in-chat affordance — not a broken button. This is a reason to prefer the sheet path, not a blocker for either.

The field itself is in the [parent's data model](../design.md#data-model); this endpoint is its only populator, and the [report page](../report-page/design.md) is its only consumer.

## Endpoints

| Endpoint        | Status | Shape                                                                                                                        |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `create-report` | new    | `{ spec, conversation_id }` → validate, insert **the validator's output**, return `{ report_id, url }`. Called by the sheet. |

The insert writes the same document shape as `generate-report`, including the [ownership](../ownership/design.md) defaults — `visibility: "private"`, `favourite_of: []`, `deleted: null`, `spec_version: 1`, `owner` = caller — plus the `conversation_id` the tool path cannot supply. It always inserts `private`; publishing to the whole app is a separate act, through `set-report-visibility` from the sheet's visibility control or the report page ([why](#publishing-from-the-sheet-create-private-then-publish)).

Mind the two shapes the word `spec` wears. The endpoint's **input** `spec` is `{ title, description?, sections }` — the sheet's name field becomes `spec.title` — exactly as `generate-report`'s payload nests it; `validateReportSpec` reads title/description off that input and returns them at the top level. Both paths then persist the **output**, not the input: the **stored** `spec` holds `{ sections }` with durable section ids, while `title` and `description` are lifted out to document fields ([why](../ownership/design.md#the-stored-spec-is-the-validators-output)).

Two authors, one stored shape — and that shape lives in **one place**, not two. Today `generate-report` writes the whole document inline (`owner`, `title`, `description`, `spec`, `spec_version: 1`, `visibility: "private"`, `favourite_of: []`, `conversation_id`, `deleted: null`, change stamps); only `owner` and the change stamp are shared `defaults/` fragments. This sub-design extracts a third, `modules/reporting/defaults/new_report.yaml`, that takes the validated spec and a `conversation_id` and emits the full insert document, and **migrates `generate-report` onto it** so both endpoints `_ref` the same fragment. Without that, `create-report` is a second inline copy and the two paths drift the moment a default changes — the shared fragment is what actually makes "one stored shape" true rather than a convention two files have to remember.

## Files changed (anticipated)

- New `modules/reporting/pages/chat/components/save_report_sheet.yaml` — the confirm sheet, opened by the tick-and-save route only (the typed route does not open it — see [resolved question 3](#resolved-questions)). Carries the name, optional description, section list, and the role-gated visibility control. Lives under `pages/chat/` because it is chat-only.
- `modules/reporting/pages/chat.yaml` — result selection in the panel, the Save-as-report action, and the sheet mounted once.
- New `modules/reporting/api/create-report.yaml`.
- New `modules/reporting/defaults/new_report.yaml` — the shared insert document (owner, title, description, spec, defaults, `conversation_id`, change stamps), parameterised by the validated spec + `conversation_id`. Referenced by both creation endpoints.
- `modules/reporting/api/generate-report.yaml` — migrate its inline insert onto `new_report.yaml` so the document shape has a single source.
- `modules/reporting/module.lowdefy.yaml` — the endpoint export.
- `docs/reporting/` — a how-to for the save-as-report flow.

## Demo consumers

- One seeded report carrying `conversation_id` so Continue-in-chat resolves, and one without so the affordance's absence is exercised too. (Both are read by [report-page](../report-page/design.md); they are seeded once, here, because this is the sub-design that owns the field's population.)
- The sheet reachable from the demo chat page with at least one selectable result, so the whole selection → sheet → insert path is build-verified.

Verify with `pnpm ldf:b` from `apps/demo`.

## Resolved questions

Resolved 2026-07-29:

1. **Can the agent's `generate_report` populate the conversation link?** No — tool endpoints receive only the tool input; the existing code comments this. The page-side `create-report` can, which is one more reason to prefer the sheet when a report should link back to its conversation.

Resolved 2026-07-30, from reading the installed block source:

2. **Can sections be dragged to reorder?** No. `ControlledList` moves items by method call; ↑ / ↓ is the shape.

Resolved 2026-08-06:

3. **Do the typed/agent route and the tick-and-save route converge on one confirm sheet?** No — dropped. `generate_report` is a tool endpoint: it runs server-side with only the tool input and cannot open a client modal (the same limit that keeps `conversation_id` off that path). The agent authors a spec and replies with a link; the sheet is the tick-and-save confirm. The two routes share one validator and one stored shape, not a UI — see [Two creation routes](#two-creation-routes-one-validator-and-one-stored-shape).

## Deviations from the wireframes

1. **`conversation_id` is optional in the UI.** The plates show Continue-in-chat unconditionally; it is absent on reports created through the agent tool path — see [the report ↔ chat link](#the-report--chat-link-and-the-one-thing-that-blocks-it).
2. **Sections reorder with ↑ / ↓, not a drag handle.** Plate 3 draws `⣿` grips. No block does drag reordering; `ControlledList` exposes `moveItemUp` / `moveItemDown` / `removeItem` as methods.

## Risks

- **Two creation paths for reports** (the sheet and the agent tool) means two callers of the same validation. Contained by both going through `validateReportSpec` and one insert shape, but the tool path's missing `conversation_id` is a real, permanent asymmetry — one that only resolves if tool endpoints ever receive agent context.
- **The sheet's filter picker and the agent both author `optionsQuery`.** Two authors of one spec field is a drift surface; contained by the shape being validated server-side either way, and by the derivation rule living in one place ([`report-filters`](../../report-filters/design.md)).

## Non-goals

- **A report builder UI.** The sheet is a confirm over what the conversation already produced, not a place to compose sections from scratch.
- **The filter picker UI** — a sub-design, [`filter-picker`](filter-picker/design.md); this sheet ships filterless first. The `optionsQuery` mechanics underneath it are [`report-filters`](../../report-filters/design.md).
- **Editing an existing report's sections through the sheet.** The sheet creates; re-deriving a spec is the assistant's job, and dropping a section is a [report-page](../report-page/design.md) action.
- **KPI and markdown sections on the tick-and-save route** — deferred to a later improvement. The chat surface renders no KPI or markdown card to tick; both section types are produced by `generate_report`, the guided primary route. See the [assembles-three-kinds decision](#the-sheet-assembles-chart-table-and-download-sections-only--kpis-and-markdown-stay-on-the-generate_report-route).
