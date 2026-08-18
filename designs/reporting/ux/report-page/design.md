# The report page: provenance, per-section export, recoveries, and where filters sit

A sub-design of [`reporting/ux`](../design.md) — plate 6 of [`wireframes.html`](../wireframes.html), redrawn in real blocks in [`wireframes-blocks.html`](../wireframes-blocks.html).

The report page works: it resolves a spec server-side, runs each query section, compiles into a `Dynamic` block, and renders a per-section Alert where a section failed. What it does not do is tell you anything about the report — who made it, when, when these numbers were computed — or let you carry a question forward. A broken section says it is broken and stops. And now that filters have shipped, the page has one genuine layout problem: **a filter control conveys nothing about which sections it scopes**, which is indistinguishable from a broken filter.

This sub-design adds the provenance and the ways out, and holds the filter-placement decision.

## Proposed change

1. Add a **provenance line** (who made it, when, when it ran), **per-section CSV** (`⤓` on each query-backed section; none on a KPI), and **"Continue in chat"** reopening the source conversation with the report as context — owner-only.
2. Give a broken section **two owner-only recoveries** — ask the assistant to fix it, or drop it — on top of the per-section Alert the module already renders. A non-owner's broken section names who can fix it and stops there.
3. Distinguish a section the viewer's **roles deny** from one that is broken. They render identically today, only one of them has anything to fix, and opening reports to a shared audience is what makes the confusion routine — see [below](#a-section-the-viewers-roles-deny-is-not-a-broken-section).
4. Consume **`conversation_id`** so the report ↔ chat links work in both directions, treating its absence as no affordance rather than a broken one.

Filter placement was the page's one open problem; it is now **decided** — each filter renders beside the sections it drives — see [the filter row says nothing about what it scopes](#the-filter-row-says-nothing-about-what-it-scopes).

## Current state

- `modules/reporting/api/resolve-report.yaml` — loads the report matched on `_id` **and** `owner.user_id`, so today a report is readable only by its author; rejects on not-found (the `Dynamic` block renders its fallback), runs each query section through `AnalyticsPipeline` inside `:try`, compiles server-side. Opened to shared reports, and made to return an owner flag, by [ownership](../ownership/design.md#endpoints).
- `compileReport` — collects every filter control into a single full-width row at the top of the report, and renders a per-section Alert for a section that failed validation or execution.
- `modules/reporting/pages/report.yaml` — a `Dynamic` block over the compiled config, with `types.blocks` / `types.actions` / `types.operators` declared, and a fallback slot.
- The report doc carries `conversation_id`, but `generate-report` always writes it `null` — a comment there explains why it cannot do better.

## Key decisions and rationale

### Provenance is three facts, and one of them is free

Who made it, when it was last edited, and when these numbers were computed. The third is the one that matters most on a report someone else published to you — a chart with no run time is a chart you cannot date — and it is nearly free: the page already resolves the sections on load, so it costs only a resolve-time timestamp in the resolver's return, not a query. (Who-made-it and last-edited come off the document — `owner` and `updated` — which the resolver now returns alongside it, see [Files changed](#files-changed-anticipated).)

The middle fact is **"last edited," not "spec changed."** `updated` bumps on any change to what the report _is_ — a spec write like drop-a-section, and a rename alike — and deliberately not on changes that leave the report itself untouched: favouriting, publish/unpublish, restore, and the `conversation_id` backfill all skip the stamp. So the line stays honest without claiming the analysis moved when the owner only fixed a title. (`restore-report.yaml`'s no-stamp comment still justifies itself by "the line states when the SPEC last changed"; the decision to skip the stamp holds, but the reason should reword to "last edited, which a restore does not touch.")

The other two come off the document. On a shared report the line also names the publisher, which is the answer to "why am I seeing this?".

Deliberately **not** on this line: when the report was last opened, or last run by anyone. Persisting either means a write on every read — see [deviation 1](#deviations-from-the-wireframes).

### Export belongs to a section, not to a report

`export-data` validates a single `{ collection, pipeline }`, and a CSV's headers are that one result's row keys. A report holds several sections over different collections and grains, so a report-level "Export" has no answer to "export what?" — it would either silently pick a section or invent a multi-sheet format the module cannot produce.

Each query-backed section carries its own `⤓`; a KPI (one number, already on screen) carries none. This is also why the list rows have no Export: you open the report and download the section you meant.

Export is a **read**, so it is available to a non-owner of a shared report.

### Continue in chat is owner-only, and conditional

"Continue in chat" reopens the source conversation with the report as context. It is owner-only because it exposes the author's conversation — a transcript that may contain questions they never published — and that check is server-side, not a hidden button. It is also conditional on `conversation_id` being present: where it is absent the affordance is simply **absent** too, not disabled or broken.

`conversation_id` is populated on **both** creation routes — [save-as-report](../save-as-report/design.md#the-report--chat-link-and-the-one-thing-that-blocks-it)'s `create-report` on the sheet path, and the `emit-data-parts` turn-end backfill on the agent path ([reports-from-chat](../reports-from-chat/design.md)) — so a linked conversation is the normal case on both. Absence is the exception now: a report never saved from a chat, a legacy row, or the sub-second window before the turn-end hook fires. This page is one of two consumers — the chat panel's "Reports from this chat" section is the other. A non-owner sees no chat link of any kind, and their path to a version they can explore is **Duplicate** — see [ownership](../ownership/design.md#non-owners-get-read-plus-duplicate).

### A broken section gets two ways out, and only for the owner

The module already renders a per-section Alert, which is the right failure mode — one bad section, one Alert, the rest of the report intact. What it lacks is anything to do about it. The owner gets two actions, and they are different kinds of thing:

- **Ask the assistant to fix it** writes nothing. It opens the source conversation with the failing section named, gated exactly like Continue in chat and subject to the same `conversation_id` condition — so a report with no linked conversation (the exception now that the agent path backfills the link — see [above](#continue-in-chat-is-owner-only-and-conditional)) has no fix-in-chat affordance either. What the assistant then produces is a **new** report, per the non-goal below; nothing updates this one's spec.
- **Drop it** is the module's only spec write, through [ownership](../ownership/design.md#dropping-a-section-is-the-one-spec-write-and-it-has-to-cascade)'s `remove-report-section`. The page sends a report id and a section id — it never holds the spec, since this page is compiled blocks — and the server removes the section, cascades the filter bindings the validator would otherwise reject, revalidates and writes. Section ids are [durable](../ownership/design.md#the-stored-spec-is-the-validators-output), so the call needs no positional guard and a repeated click is a plain not-found rather than a risk of removing the wrong section. The cascade is worth knowing about here because it is user-visible: dropping the only section a filter drove takes that filter's control off the page too. And it is the reason Remove can be **refused** — on a report whose only content is one section plus its filter, the cascade would leave nothing, so the endpoint rejects and the page says what the user actually meant: this is the report's only section, delete the report instead. That is the one place Remove leads to Delete.

A non-owner's broken section names who can fix it and stops there. It does **not** offer to notify them — notifications are a non-goal for the whole design, and a "request a fix" button that sends nothing is worse than no button.

### A section the viewer's roles deny is not a broken section

A section can fail for two unrelated reasons, and the page currently tells the same story about both. It can be **broken** — the spec drifted out of the catalog, a field went away, the pipeline no longer validates. Or it can be **withheld**: the catalog lets an app restrict a collection to a set of roles, and `AnalyticsPipeline` enforces that against the **viewing** user on every resolve, so a section over a restricted collection fails for anyone who does not hold the role. Both land in the resolver's `:catch` and both render the same Alert.

They cannot currently be told apart _after the fact_: the `:catch` receives no error object, so the gate's message never reaches the compiler, which says as much in `optionsQueryFailure` and deliberately describes the failure vaguely rather than fabricating a cause. But they can be told apart **before** it. `compileReport` already receives the catalog and the viewer's roles, and the engine already owns the exact predicate: `validatePipeline`'s `checkCollectionAccess` (`validatePipeline.js:210-225`) enforces the union-of-roles rule over the base collection and every collection the pipeline walk touches. So the pre-check **reuses that predicate rather than re-deriving it** — have the validator's walk record each collection it checks into its context (a `touchedCollections` set, filled at the one call site that already visits every stage), and have the pre-check read its withheld-vs-broken verdict off that one accumulated set, so the compiler decides with the same walk the gate enforces with. Then render a third Alert variant where the viewer falls short. The point is that there is nothing to _extract_: `checkCollectionAccess` is a pointwise, throwing check invoked per stage during the walk, not an enumerator — the touched-collection set exists only as its sequence of call sites. So anything that re-derives that set independently — a hand-rolled "base collection + `$lookup.from`" scan, or a `requiredRoles(pipeline, catalog)` helper that walks the pipeline a second time beside `checkCollectionAccess` — is the trap: it would miss the stages the walk covers — `$unionWith`, a `$lookup` nested in `$facet`, `$graphLookup` — and misclassify a genuinely withheld section as **broken**, dropping the owner into the ask-the-assistant repair loop this whole distinction exists to prevent, in exactly the mixed case that is hardest to notice.

Three consequences:

- **The withheld Alert carries no recoveries**, for the owner either. There is nothing to fix — the spec is valid and the data is simply not this viewer's to see — so "ask the assistant to fix it" would send the owner into a repair loop over a working section. An owner can be denied too: `share_roles` and the catalog's roles are independent, so authoring a report is no guarantee of being able to read it later.
- **It corrects the non-owner copy above.** Naming who can fix a section is wrong when nothing is broken and nobody can; the withheld variant says the data is restricted and stops.
- **It names no collection and no role.** The section's own label already says as much as the viewer should learn; adding "requires the `finance` role on `payroll`" would turn a display fix into a description of the app's access model.

Why this matters more now than before: until reports had an audience, a viewer was always the author, and an author who could not read their own data was a rare, self-inflicted case. [ownership](../ownership/design.md#what-shared-does-and-does-not-promise) makes it ordinary — that is where the two-layer model is stated, and it explicitly hands the display half here.

### The filter row says nothing about what it scopes

**The one UX problem the report page currently has — now decided (below).** `compileReport` collects every filter control into a single full-width row at the top of the report, regardless of where its filter sections sit in the spec. Nothing on a control indicates which sections subscribe to it. Since `filterBy` is per-section, a report can carry two independent filter groups — one over orders, one over activities — and selecting a control in the first moves nothing a viewer happens to be looking at.

Found in manual testing of the report-filters demo: a company multi-select whose only bound sections were two tables below the fold read as a **broken filter**, and stayed convincing enough to survive a full trace through the compiled config, the payload, the server-built `$match`, the operator semantics, and the block source before the actual cause — nothing bound to it was on screen — became clear. If it fooled the person who wrote the compiler, it will fool a user. The demo report now works around it by hand, giving every filter at least one bound KPI or chart, but an agent-authored report has no such guarantee: the agent chooses `filterBy` per section, and nothing stops it binding a filter only to a table at the bottom.

**Decided: render each filter beside the sections it drives.** Of the three candidates the earlier revision weighed — naming the scope in the control's title (`Companies (activities)`, one compiler line but the label duplicates section names and grows with the binding), grouping the top row into a labelled sub-row per bound-section set (reads oddly when groups partly overlap), or co-locating — co-location is the largest change and the honest one. `compileReport` stops collecting filters into a single full-width top row and instead emits each filter's control adjacent to the section group it scopes, so a control's **position** _is_ the answer to "what does this move." The cheaper two annotate around a layout that still lies about scope; co-location removes the failure at its source.

The one sub-question co-location opens, resolved here rather than left to build time: a filter bound to **non-contiguous** sections, or across two groups. `filterBy` is per-section, so a filter need not drive a contiguous block. The rule: **a filter renders once, immediately above the first subscribing section in spec order** — never duplicated, so there is one control and one piece of state. Where its binding spans more than that one section, the control **keeps a scope label** naming the others (the candidate-1 mechanism, demoted to a fallback for the split case). So the common single-group report needs no label at all — position carries it — and the rare split report stays honest through the label. This is why co-location subsumes rather than merely beats candidate 1.

The failure this prevents is a viewer concluding the feature is broken — and by construction that complaint reads as a bug report about filters, not about layout, which is why it is fixed now rather than waiting for one.

Filter **mechanics** are settled and out of scope: see [`report-filters`](../../report-filters/design.md), which points here for placement.

### A spec that no longer validates is not a missing report

The stored spec is re-validated on every open — `querySections` and `compileReport` both run `validateReportSpec` — and that call sits in the resolver's `:for … :in`, which `@lowdefy/api`'s `controlFor` evaluates **before** any iteration and outside the per-section `:try` (`controlFor.js:24-31`). So a spec-level validation failure is not one Alert card: it rejects the routine, and the `Dynamic` block renders its fallback — _"Report not found. The report does not exist or you do not have access to it."_

That message is wrong in the one way that matters: it tells an owner looking at their own report not to investigate. And it is unlogged, because the resolver's diagnostic `:log` lives in the `:catch` that handles per-section failures, so nothing records which report failed or why.

It is a real state, not a hypothetical one. Table columns once carried a `tag` flag; the derived enum-tag styling was dropped and the strict-key check now rejects `tag` outright, so a report saved under the old grammar would land here. [ownership](../ownership/design.md#the-stored-spec-is-the-validators-output) narrows how often this can happen — the validator may loosen for persisted shapes and never tighten, and `spec_version` exists to key a compatibility branch on — but "never" is a rule, not a mechanism, and this page needs an honest answer for the day it is broken.

The response is deliberately **minimal**, because this state is a code bug, not user data going stale. [ownership](../ownership/design.md#the-stored-spec-is-the-validators-output)'s loosen-only rule exists precisely so a stored spec cannot stop validating, and no report predates the durable-id insert path — so a whole-spec re-validation failure _today_ means the validator was tightened in violation of that rule, not that a user's report drifted. (Catalog drift — a field or collection going away — fails a **section**, inside the per-section `:try`, and renders as a section Alert; it never reaches this whole-report path, which is grammar-only.) Two small changes, no resolver restructure: the fallback message in `report.yaml` stops lying to the owner — _"This report couldn't be loaded"_ instead of _"not found or no access"_ — and the resolver **logs** the failure (a bounded pre-validate step in a `:try`, before it rejects to the fallback) so the regression is caught. No cause-naming Alert and no ask-the-assistant route: there is nothing for the owner to rebuild, and a repair loop would blame their data for our bug. If a real migration path ever makes stale-but-valid specs a genuine user-facing state — the day `spec_version` grows a compatibility branch — that is when the richer recovery earns its place; building it now for a can't-happen-by-design bug is surface we would owe forever for nothing.

### The `Dynamic` types list is a whole-report failure mode

The report page compiles server-side into a `Dynamic` block, and **an undeclared block, action or operator type fails the entire report to the fallback slot** — not the one section that used it. This sub-design adds Fix-in-chat and Remove-section inside compiled sections, so `types.actions` needs `Link` alongside the existing `CallAPI` / `SetState` / `DownloadCsv`, and `Modal` joins `types.blocks` if per-section expand is compiled rather than rendered by the page.

**Any compiler change that emits a new block type has to land with its declaration in the same commit.** This is the sharpest edge on the page: the failure is total, and it is invisible until a report happens to contain the new section type.

## Files changed (anticipated)

- `modules/reporting/api/resolve-report.yaml` — **this page's own resolver change**, distinct from [ownership](../ownership/design.md#endpoints)'s already-shipped read-open + `is_owner` flag. Return the provenance facts the compiler cannot derive from `spec` (which now holds `{ sections }` only): `created`, `updated`, `owner`, `visibility`, and a **resolve-time timestamp** for "when these numbers were computed" — a `_date: now` in the return, the one provenance fact that is not on the document. And log a whole-spec re-validation failure (a bounded pre-validate `:try`) before it rejects to the fallback — see [a spec that no longer validates](#a-spec-that-no-longer-validates-is-not-a-missing-report).
- `modules/reporting/pages/report.yaml` — provenance line, per-section `⤓`, Continue-in-chat (owner-only, conditional on `conversation_id`), owner-only section recoveries, the **`Link`** action added to `types.actions` (Continue-in-chat and fix-in-chat navigate — `⤓`/DownloadCsv and Remove/CallAPI are already declared), and the honest whole-report fallback message (_"This report couldn't be loaded"_).
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — the provenance line (**new inputs**: the document's `created` / `updated` / `owner` / `visibility` and the resolve timestamp, plus `is_owner` to branch the owner-only affordances); the section-level recovery affordances; the withheld-section Alert variant, whose role pre-check **reuses `validatePipeline`'s `checkCollectionAccess`** rather than re-deriving the gate (no new _catalog / roles_ input — those are already passed); and **filter co-location** — emitting each filter beside the section group it drives instead of in a single top row.
- `docs/reporting/` — the index's surfaces table; `concepts/implementation-walkthrough.md` (the compiled shape changes: provenance, co-located filters, the new emitted `Link`).

## Demo consumers

The seeded fixtures are [ownership](../ownership/design.md#demo-consumers)'s and [save-as-report](../save-as-report/design.md#demo-consumers)'s — a shared report owned by a second user (so the non-owner view renders: provenance with a publisher, export present, chat link absent), one report with `conversation_id` and one without.

What this sub-design adds:

- A seeded report with a **deliberately broken section** so the Alert plus the two owner recoveries render, and so the non-owner variant of the same report shows the names-who-can-fix-it form.
- A seeded **shared report over a role-gated catalog collection**, opened by a demo user who does not hold the role, so the withheld variant renders — with no recoveries — beside the broken variant it must not be confused with. The demo catalog needs one entry carrying a `roles` list for this, which is also the first demo coverage catalog role-gating has had.
- A seeded report carrying **two independent filter groups**, so whatever the filter-placement decision becomes has a demo that exercises it. Today this is the case the demo works around by hand.

Verify with `pnpm ldf:b` from `apps/demo` and inspect the generated `.lowdefy/server/build/pages/**` artefacts.

## Open questions

None. The filter-placement question — the one open item an earlier revision carried — is [resolved above](#the-filter-row-says-nothing-about-what-it-scopes): each filter renders beside the section group it drives, above the first subscribing section, with a scope label only where the binding is split.

## Resolved questions

Resolved 2026-07-29:

1. **Is a report-level Export possible?** Not meaningfully — `export-data` validates one `{ collection, pipeline }` and CSV headers are that result's row keys. Export is per section.

## Deviations from the wireframes

1. **"Last ran" is not persisted.** The report header states the run time at resolve, which is free and honest; nothing writes a `last_run`. The consequence for the list column is recorded in [reports-list](../reports-list/design.md#deviations-from-the-wireframes).
2. **`conversation_id` is optional in the UI.** The plates show Continue-in-chat unconditionally; it is absent on any report with no linked conversation. Both creation routes now populate `conversation_id` (the agent path via the `emit-data-parts` backfill — [reports-from-chat](../reports-from-chat/design.md)), so absence is the exception rather than the agent-path default an earlier revision of this design assumed.

## Risks

- **The `Dynamic` types list is a total failure mode.** Adding a compiled block type without its declaration blanks the whole report to the fallback, and no test catches it unless a fixture contains that section type. Mitigated only by the same-commit rule above.
- **Owner-only actions inside compiled sections mean the compiler now branches on the viewer.** `compileReport` gains an is-owner input, and a bug there shows up as a non-owner seeing an action that fails server-side — the check holds, but the UI lied. Worth a test per branch.

## Non-goals

- **Editing a report's sections beyond drop-a-section.** Re-deriving a spec is the assistant's job.
- **A report-level export.** Per section, for the reason [above](#export-belongs-to-a-section-not-to-a-report).
- **Notifications** — including "request a fix" on a broken section a non-owner can see.
- **Filter mechanics** — see [`report-filters`](../../report-filters/design.md). Placement is in scope and open.
- **Persisting a last-run or last-opened timestamp.**
