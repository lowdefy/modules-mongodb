# The report page: provenance, per-section export, recoveries, and where filters sit

A sub-design of [`reporting/ux`](../design.md) — plate 6 of [`wireframes.html`](../wireframes.html), redrawn in real blocks in [`wireframes-blocks.html`](../wireframes-blocks.html).

The report page works: it resolves a spec server-side, runs each query section, compiles into a `Dynamic` block, and renders a per-section Alert where a section failed. What it does not do is tell you anything about the report — who made it, when, when these numbers were computed — or let you carry a question forward. A broken section says it is broken and stops. And now that filters have shipped, the page has one genuine layout problem: **a filter control conveys nothing about which sections it scopes**, which is indistinguishable from a broken filter.

This sub-design adds the provenance and the ways out, and holds the filter-placement decision.

## Proposed change

1. Add a **provenance line** (who made it, when, when it ran), **per-section CSV** (`⤓` on each query-backed section; none on a KPI), and **"Continue in chat"** reopening the source conversation with the report as context — owner-only.
2. Give a broken section **two owner-only recoveries** — ask the assistant to fix it, or drop it — on top of the per-section Alert the module already renders. A non-owner's broken section names who can fix it and stops there.
3. Consume **`conversation_id`** so the report ↔ chat links work in both directions, treating its absence as no affordance rather than a broken one.

Filter placement is the page's one open problem and is **not decided here** — see [the filter row says nothing about what it scopes](#the-filter-row-says-nothing-about-what-it-scopes).

## Current state

- `modules/reporting/api/resolve-report.yaml` — loads the report matched on `_id` **and** `user_id`, so today a report is readable only by its author; rejects on not-found (the `Dynamic` block renders its fallback), runs each query section through `AnalyticsPipeline` inside `:try`, compiles server-side. Opened to shared reports, and made to return an owner flag, by [ownership](../ownership/design.md#endpoints).
- `compileReport` — collects every filter control into a single full-width row at the top of the report, and renders a per-section Alert for a section that failed validation or execution.
- `modules/reporting/pages/report.yaml` — a `Dynamic` block over the compiled config, with `types.blocks` / `types.actions` / `types.operators` declared, and a fallback slot.
- The report doc carries `conversation_id`, but `generate-report` always writes it `null` — a comment there explains why it cannot do better.

## Key decisions and rationale

### Provenance is three facts, and one of them is free

Who made it, when the spec last changed, and when these numbers were computed. The third is the one that matters most on a report someone else published to you — a chart with no run time is a chart you cannot date — and it is free, because the page resolves the sections on load and already knows.

The other two come off the document. On a shared report the line also names the publisher, which is the answer to "why am I seeing this?".

Deliberately **not** on this line: when the report was last opened, or last run by anyone. Persisting either means a write on every read — see [deviation 1](#deviations-from-the-wireframes).

### Export belongs to a section, not to a report

`export-data` validates a single `{ collection, pipeline }`, and a CSV's headers are that one result's row keys. A report holds several sections over different collections and grains, so a report-level "Export" has no answer to "export what?" — it would either silently pick a section or invent a multi-sheet format the module cannot produce.

Each query-backed section carries its own `⤓`; a KPI (one number, already on screen) carries none. This is also why the list rows have no Export: you open the report and download the section you meant.

Export is a **read**, so it is available to a non-owner of a shared report.

### Continue in chat is owner-only, and conditional

"Continue in chat" reopens the source conversation with the report as context. It is owner-only because it exposes the author's conversation — a transcript that may contain questions they never published — and that check is server-side, not a hidden button. It is also conditional on `conversation_id` being present: reports created through the agent tool path have none, and the affordance is then **absent**, not disabled or broken.

`conversation_id` is populated only by [save-as-report](../save-as-report/design.md#the-report--chat-link-and-the-one-thing-that-blocks-it)'s `create-report`; this page is its only consumer. A non-owner sees no chat link of any kind, and their path to a version they can explore is **Duplicate** — see [ownership](../ownership/design.md#non-owners-get-read-plus-duplicate).

### A broken section gets two ways out, and only for the owner

The module already renders a per-section Alert, which is the right failure mode — one bad section, one Alert, the rest of the report intact. What it lacks is anything to do about it. The owner gets two actions: ask the assistant to fix it (which opens the conversation with the failing section as context), or drop it (a spec edit, owner-checked like any other write).

A non-owner's broken section names who can fix it and stops there. It does **not** offer to notify them — notifications are a non-goal for the whole design, and a "request a fix" button that sends nothing is worse than no button.

### The filter row says nothing about what it scopes

**Open, and the one UX problem the report page currently has.** `compileReport` collects every filter control into a single full-width row at the top of the report, regardless of where its filter sections sit in the spec. Nothing on a control indicates which sections subscribe to it. Since `filterBy` is per-section, a report can carry two independent filter groups — one over orders, one over activities — and selecting a control in the first moves nothing a viewer happens to be looking at.

Found in manual testing of the report-filters demo: a company multi-select whose only bound sections were two tables below the fold read as a **broken filter**, and stayed convincing enough to survive a full trace through the compiled config, the payload, the server-built `$match`, the operator semantics, and the block source before the actual cause — nothing bound to it was on screen — became clear. If it fooled the person who wrote the compiler, it will fool a user. The demo report now works around it by hand, giving every filter at least one bound KPI or chart, but an agent-authored report has no such guarantee: the agent chooses `filterBy` per section, and nothing stops it binding a filter only to a table at the bottom.

This is deliberately left open rather than decided, because the plates do not draw a multi-group report and the right answer depends on what the rest of this page becomes. Three candidates, in increasing cost:

1. **Name the scope in the control's title** — `Companies (activities)`. One line in `compileReport`, no layout change, but it duplicates section labels into the control and grows with the number of bound sections.
2. **Group the filter row by bound section set** — one sub-row per distinct group, each labelled with what it drives. Keeps filters together at the top; reads oddly when groups overlap partially (a filter bound to two of three sections).
3. **Render each filter beside the sections it drives** — abandons the single row, which is the honest fix and the largest change: filters stop being page furniture and become part of a section group.

Whichever wins, the failure it prevents is a viewer concluding the feature is broken, so a decision should not wait for a complaint — by construction the complaint reads as a bug report about filters, not about layout.

Filter **mechanics** are settled and out of scope: see [`report-filters`](../../report-filters/design.md), which points here for placement.

### The `Dynamic` types list is a whole-report failure mode

The report page compiles server-side into a `Dynamic` block, and **an undeclared block, action or operator type fails the entire report to the fallback slot** — not the one section that used it. This sub-design adds Fix-in-chat and Remove-section inside compiled sections, so `types.actions` needs `Link` alongside the existing `CallAPI` / `SetState` / `DownloadCsv`, and `Modal` joins `types.blocks` if per-section expand is compiled rather than rendered by the page.

**Any compiler change that emits a new block type has to land with its declaration in the same commit.** This is the sharpest edge on the page: the failure is total, and it is invisible until a report happens to contain the new section type.

## Files changed (anticipated)

- `modules/reporting/pages/report.yaml` — provenance line, per-section `⤓`, Continue-in-chat (owner-only, conditional on `conversation_id`), owner-only section recoveries, and the `types.*` declarations for any new emitted type.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — the section-level recovery affordances, and whatever the filter-placement decision turns out to require.
- `docs/reporting/` — the index's surfaces table; `concepts/implementation-walkthrough.md` if the compiled shape changes.

`resolve-report`'s change — opening the read to shared reports and returning the owner flag — is [ownership](../ownership/design.md#endpoints)'s.

## Demo consumers

The seeded fixtures are [ownership](../ownership/design.md#demo-consumers)'s and [save-as-report](../save-as-report/design.md#demo-consumers)'s — a shared report owned by a second user (so the non-owner view renders: provenance with a publisher, export present, chat link absent), one report with `conversation_id` and one without.

What this sub-design adds:

- A seeded report with a **deliberately broken section** so the Alert plus the two owner recoveries render, and so the non-owner variant of the same report shows the names-who-can-fix-it form.
- A seeded report carrying **two independent filter groups**, so whatever the filter-placement decision becomes has a demo that exercises it. Today this is the case the demo works around by hand.

Verify with `pnpm ldf:b` from `apps/demo` and inspect the generated `.lowdefy/server/build/pages/**` artefacts.

## Open questions

1. **Where do filter controls sit, and how does a control convey what it scopes?** [Above](#the-filter-row-says-nothing-about-what-it-scopes) — three candidates, no decision. Blocking nothing else in this design, but it should be settled before an agent-authored multi-group report reaches a user.

## Resolved questions

Resolved 2026-07-29:

1. **Is a report-level Export possible?** Not meaningfully — `export-data` validates one `{ collection, pipeline }` and CSV headers are that result's row keys. Export is per section.

## Deviations from the wireframes

1. **"Last ran" is not persisted.** The report header states the run time at resolve, which is free and honest; nothing writes a `last_run`. The consequence for the list column is recorded in [reports-list](../reports-list/design.md#deviations-from-the-wireframes).
2. **`conversation_id` is optional in the UI.** The plates show Continue-in-chat unconditionally; it is absent on reports created through the agent tool path.

## Risks

- **The `Dynamic` types list is a total failure mode.** Adding a compiled block type without its declaration blanks the whole report to the fallback, and no test catches it unless a fixture contains that section type. Mitigated only by the same-commit rule above.
- **Owner-only actions inside compiled sections mean the compiler now branches on the viewer.** `compileReport` gains an is-owner input, and a bug there shows up as a non-owner seeing an action that fails server-side — the check holds, but the UI lied. Worth a test per branch.

## Non-goals

- **Editing a report's sections beyond drop-a-section.** Re-deriving a spec is the assistant's job.
- **A report-level export.** Per section, for the reason [above](#export-belongs-to-a-section-not-to-a-report).
- **Notifications** — including "request a fix" on a broken section a non-owner can see.
- **Filter mechanics** — see [`report-filters`](../../report-filters/design.md). Placement is in scope and open.
- **Persisting a last-run or last-opened timestamp.**
