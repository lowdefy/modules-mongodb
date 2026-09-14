# Review 2

### 1. A ticked part's stored spec is not a report section — the design skips the transform

> **Resolved.** The sheet assembles finished sections and hands them to `create-report` (which stays a thin validate-and-insert), rather than the endpoint assembling from raw parts. The design's Key-decisions section now spells out the wrap: for each ticked part, stamp the section `type` from the array it came from (`charts`/`tables`/`downloads`) and lift the card `title` into the section `label`, then carry the part's `spec` through — the same section-shaped input the agent's `generate_report` authors.

The design says the sheet reads "the **validated spec the part carries**" off a ticked result and that this becomes a section (Key decisions, line 29; and "the sheet's shape maps directly onto the report spec the module already persists, so nothing new has to be modelled", line 35). It does not map directly.

`validateReportSpec` requires every section to carry a `type` — it dispatches on `section.type` (`plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js:208` chart, `:233` table, `:418` download) and fails a section whose type isn't one of `kpi, chart, table, filter, markdown, download` (`:429-430`). It also requires a non-empty `label` on every section (`validateLabel`, `:65-74`; called at `:209`, `:234`, `:254`).

The data-part specs carry neither. From `buildDataParts.js`: a chart part's spec is `{ chart, query, x, y }` with the user string in `title`; a table part's is `{ query, columns }`; a download part is `{ label, description, query }`. None carries `type`, and charts/tables use `title` where a section needs `label`.

So between "ticked part" and "section the validator accepts" there is a real transform the design doesn't name: **inject the section `type`** (knowable from which array the part came from — see #3) and **supply `label`** (map the part's `title` for charts/tables; downloads already have `label`). This is the load-bearing gap — every other finding is smaller than this one. The fix is to state the part-spec → section-spec mapping explicitly in the design (per kind: chart/table/download), so the implementer builds the transform rather than passing the raw part spec to `validateReportSpec` and hitting `section … requires a label` / `type "…" is not one of …`.

### 2. The design claims drift-safety it doesn't mechanize — the insert doc is duplicated inline

> **Resolved.** Extract a shared `modules/ai-reporting/defaults/new_report.yaml` fragment (the pattern `owner.yaml`/`change_stamp.yaml` already follow) that emits the full insert document from the validated spec + `conversation_id`, and migrate `generate-report` onto it so both endpoints `_ref` one shape. Added to the Endpoints section and Files-changed. The "one insert shape" claim is now mechanized, not aspirational.

The Endpoints section closes with "Two authors, one stored shape — which is what keeps the two creation paths from drifting" (line 65), and the Risks section repeats that two callers are "contained by … one insert shape" (line 99). But there is no one insert shape in the code. `generate-report.yaml:85-121` writes the full 11-field document inline — `spec_version: 1`, `visibility: "private"`, `favourite_of: []`, `conversation_id`, `deleted: null` are all literal inline defaults; only `owner` (`:88-89`) and the change stamps (`:118-121`) are extracted to `defaults/` refs. `create-report` (line 71, new file) will re-declare the same block. The moment ownership adds or changes a default — a `spec_version` bump, a new field — the two endpoints diverge silently, which is exactly the drift the design says it has contained.

This is a "one correct way" call (CLAUDE.md): the shape both endpoints must agree on should be a shared `_ref` fragment, the same pattern `owner.yaml`/`change_stamp.yaml` already follow, parameterised by the validated spec + `conversation_id`. Either the design should specify that fragment (e.g. `modules/ai-reporting/defaults/new_report.yaml`) as part of this sub-design's work, or it should soften the "one insert shape" claim to "two hand-maintained copies". The first is the intent; the second is what ships if nobody names the fragment.

### 3. Selection spans three independent arrays, but sections are one ordered list — the initial order is unspecified

> **Resolved.** Initial order is by kind — ticked charts, then tables, then downloads — reordered by the user with ↑/↓. Reading the three arrays in that fixed sequence means no cross-array order has to be tracked at selection time. Pinned in the Key-decisions section.

Selection is bound per-array — `charts.$.selected`, and "the same shape for a chart, a table or an export result" (line 29) means `tables.$.selected` and `downloads.$.selected` too. The panel keeps these as three separate state arrays (`chat.yaml:23-25`; `charts_section` `:602`, `tables_section` `:683`, `downloads_section` `:727`). But the sheet presents "sections as the selected results **in order**" (line 12) and reorders one list via `ControlledList` (line 47).

Collapsing three independently-ordered arrays into one ordered section list needs a defined initial order, and the design doesn't state one. When a user ticks a chart, a table and an export, what order do they arrive in the sheet before any manual reorder — charts-then-tables-then-downloads by array, or interleaved by the turn that produced them? The parts carry `created` (`chat.yaml:665`), so a by-time interleave is possible and arguably more faithful to the conversation than a by-kind grouping. This is a one-line decision, but it's unmade, and it's the same "which array did this come from" the #1 transform needs — so decide it once and let both use it.

### 4. "spec" names two different shapes; the endpoint's input contract is left ambiguous

> **Resolved (auto).** The Endpoints section now states the input `spec` is `{ title, description?, sections }` (the sheet's name field → `spec.title`), matching `generate-report`'s payload, and that the `{ sections }`-only form is the stored output. No decision — the design was underspecified, not wrong.

The Endpoints row gives `create-report`'s input as `{ spec, conversation_id }` (line 63) and line 65 says "`spec` holds `{ sections }` with durable section ids, while `title` and `description` are document fields". That describes the **stored** spec. But `validateReportSpec`'s **input** spec is a different shape: it reads `spec.title` and `spec.description` (`validateReportSpec.js:507-508`) and returns `{ title, description?, sections }` — title/description live _inside_ the spec it's handed, and only `sections` survives into the stored `spec`. `generate-report` follows this: its payload nests `title` inside `spec`, and it reads `validated.title` back out.

An implementer who takes "spec holds `{ sections }`" (line 65) as the input contract will pass `spec: { sections }`, and the validator will produce `title: undefined`. The design should say plainly that the input spec carries `{ title, description?, sections }` (the sheet's name field → `spec.title`), matching `generate-report`'s payload, and that the `{ sections }`-only form is the _output_ the document stores. One sentence pinning the input shape removes the trap.

### 5. The design contradicts itself on whether the sheet is a Modal or a page

> **Resolved (auto).** Line 55 rewritten: `conversationId` is in the chat page's state (set at `onInit`), so the link is available whether the sheet is a modal or a page — the "is a page" justification was both wrong (the design says modal everywhere else) and unnecessary. This fixes the internal contradiction only. It does **not** settle the modal-vs-page surface decision the user raised in review-1 #1 — that remains open and is taken up separately (see review-1 #1's annotation).

Line 55 argues the conversation link works "because the sheet **is a page** calling `CallAPI` where `_state: conversationId` is in hand". But everywhere else the sheet is a `Modal`: "The sheet is otherwise all existing blocks: `Modal` + …" (line 49), "New `modules/ai-reporting/pages/components/save_report_sheet.yaml`" mounted on chat.yaml (lines 69-70). These can't both be true.

The reasoning in line 55 is also stronger than it needs to be: a `Modal` mounted on `chat.yaml` already has `_state: conversationId` in hand, because it shares the chat page's state (`conversationId` is set at `chat.yaml:21`). So the conversation link is available to the sheet **whether it's a modal or a page** — the "is a page" justification is both inconsistent with the rest of the design and unnecessary. Fix line 55 to say the sheet is a Modal on the chat page and `conversationId` is in that page's state. (This also settles the still-open modal-vs-page question from review-1 #1 — the design has since committed to Modal everywhere except this one line.)

### 6. "Current state" mis-describes the result cards

> **Resolved (auto).** Current state corrected: chart/table cards carry only title, result and an "as of" date; only export cards carry a control (the download button); no per-result `⋯`. The ★-removal rationale rewritten so it no longer claims expand/download/`⋯` already sit on every card — selection is the sole _marking_ affordance, which stands regardless.

Current state says "result cards carry expand and download only" (line 17), and the rationale for dropping the ★ rests on "expand, download and `⋯` all act on a single result" (line 25). Neither matches `chat.yaml`. A chart card renders only a title, the `EChart`, and an "as of" date (`:643-682`) — no expand, no download, no `⋯` menu. There is no per-result kebab anywhere; the only `onMenuClick` is the conversation rail's (`:253`). Only a **download** card carries a button, and that's its whole purpose (a `DownloadCsv` action, `:766-791`).

The rationale still lands — selection is the sole marking affordance either way — but the design is describing a card layout that isn't in the code, which will send the implementer looking for expand/`⋯` controls to sit selection alongside. Either those affordances are planned in a sibling sub-design (name it) or the two lines should be corrected to the cards as they actually are.
