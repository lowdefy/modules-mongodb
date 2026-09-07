# Review 3

Re-review after the schema review's twelve findings landed
([`../../review/schema-1.md`](../../review/schema-1.md), resolutions committed `a3601f05` /
`9b859d8f`). Reviews 1 and 2 are settled and not re-raised. This pass reads only what moved:
the new **stored spec is the validator's output** section, the durable-section-ids reversal,
the `spec` / `title` / `description` split, `spec_version`, the `owner.name` snapshot note,
and the new indexes section — against `validateReportSpec.js`, `validateChartSpec.js`,
`compileReport.js`, `querySections.js`, `analyticsOperator.js`, the shipped endpoints, and
the installed `@lowdefy/api` and `@lowdefy/operators`.

The central decision is right and the reasoning behind it holds: `validateQuery` really does
return the pipeline unchanged, `generate-report` really does already hold the validator's
output in `_state: validated`, and `compileReport` really does read `validated.title` — so
the change costs one line at that call site and the safety argument survives exactly as
written. See **Verified as written**.

But the change rests on an unstated assumption — that the validator's output is valid input
to the validator — and it is not. I ran it: persisting `validateReportSpec`'s return value
produces a document that throws on its own next read. That is finding 1, and it is the one
that has to be settled before any of this ships. Six findings; the rest are smaller.

### 1. `validateReportSpec` is not idempotent, so persisting its output bricks the report at the first resolve

> **Resolved (auto).** Nothing to arbitrate — the fix is forced, and it is needed even if resolve stopped re-validating, because `remove-report-section` reads, cascades, revalidates and writes, so the round trip happens on the write path regardless. Two rules, stated in the spec-shape section and closing the loop from both ends: **an absent optional is an absent key in the output** (never `null`, never `undefined`, so nothing nullable reaches the document), and **`null` reads as absent wherever the validator reads an optional**. The second is uniform rather than special-cased on `description`, so no caller has to learn which fields tolerate a null; it is a loosening, which the compatibility rule already permits, and it is recorded as part of the persisted contract.
>
> The property is now named in the design — `validateReportSpec` is idempotent — and pinned by a round-trip assertion per section type in `validateReportSpec.test.js`, added to Files changed and to Verification as the one jest test in an otherwise e2e batch. The table-column branch (`:249-267`) is cited as the in-file pattern to copy, since it already builds its return value key by key.
>
> Both stale sentences corrected: Files changed no longer says "No change to what it validates", and the spec-shape paragraph now says `compileReport` is unchanged while `validateReportSpec` changes as above.
>
> One thing considered and **not** pursued: dropping read-time spec revalidation altogether, which would make this finding disappear rather than fixing it. It does not hold up. The loosen-never-tighten rule is forced independently — `remove-report-section` revalidates on write, so a tightening strands existing documents whether or not resolve validates — and dropping it would trade a cheap invariant for a defensive compiler.

The whole design now turns on a property nobody has checked: that the validator's output
round-trips through the validator. It does not. The stored spec is re-validated on every read
(`querySections.js:58`, and again inside `compileReport`), and per this design's own
[whole-report failure paragraph](../design.md) a spec-level throw is not a per-section Alert —
it rejects the routine and the page renders "Report not found".

I ran the validator over minimal specs and fed its own output back in. Three separate keys
fail, all of them the validator's own doing:

- **`format: null` on every kpi without a format.** The kpi branch returns
  `format` explicitly `null` when the section omits one (`validateReportSpec.js:179-182,
183-191`), and the input check is `section.format !== undefined`
  (`:180`) → `validateFormat(null)` → `fail("format must be an object")` (`:60-62`). This one
  needs no serialization argument at all: it is an explicit `null` in the returned object, so
  it fails under any persistence path. **Every kpi section that omits `format` bricks its
  report.**
- **`description: null`.** Two independent routes to it. The validator returns
  `description: spec.description`, `undefined` when absent (`:516`); and separately, the
  design has `resolve-report` compose `{ title, description, sections }` from **document**
  fields — where `description` is already `null` today, because `generate-report.yaml:77-78`
  writes `_payload: spec.description` and `_payload` of an absent key resolves to `null`
  (`@lowdefy/operators/dist/getFromObject.js:35-37`). Re-validating then hits
  `spec.description !== undefined && typeof spec.description !== "string"` (`:146-148`) →
  `fail("description must be a string")`. **This one breaks existing reports too**, the
  moment `resolve-report` starts composing from document fields — independently of
  normalization.
- **`options` / `match` / `optionsQuery` on every filter section.** The filter branch returns
  these as `undefined` when absent (`:416-425`). `:set_state` writes the operator's return
  value into routine state in-process with no serialization
  (`@lowdefy/api/dist/routes/endpoints/control/controlSetState.js:32-34`), so the `undefined`s
  reach the insert, and the driver's default (`ignoreUndefined` is set nowhere in the
  connection or this repo) stores them as `null`. Each then trips a `!== undefined` check:
  a select filter fails on `match is only valid on a multiselect control` (`:363-367`), a
  multiselect on `declares both options and optionsQuery` (`:369-373`), a daterange on
  `options must be an array` (`:318-327`).

Verified, not reasoned — the probe output, re-validating each shape after persistence:

```
kpi (no format)   → format must be an object.
select filter     → match is only valid on a multiselect control.
multiselect       → declares both options and optionsQuery — pick one source.
daterange         → options must be an array of at most 50 values.
description absent→ description must be a string.
chart / table / download / markdown → OK
```

The failure is at least loud rather than silent: it hits the first resolve of any new report,
so a demo consumer exercising a kpi or a filter catches it. That is the only mercy in it.

**The fix is small and there is already a pattern for it in the same file.** The table-column
branch builds its return value key by key and only sets what is present (`:249-267`) — do
that in the other branches too, so an absent optional is an absent key rather than a `null`.
Then state the property the design is relying on, and pin it: a test asserting
`validateReportSpec(validateReportSpec(spec))` deep-equals `validateReportSpec(spec)` for one
section of each type. `validateReportSpec.test.js` already exists; this is a few lines in it,
and it is the guard that stops the next optional field reintroducing the bug.

The `description` half needs one more decision, because it reaches documents that already
exist: either `resolve-report` omits a null `description` when it composes, or the validator
treats a null `description` as absent. The latter is a loosening, which the design's own
[loosen-never-tighten rule](../design.md) permits — and if that is the route, say so in the
data model, because "null reads as absent" then becomes part of the persisted contract rather
than an implementation detail.

Two consequences for the design's text, whichever way it goes. The Files-changed line for
`validateReportSpec.js` currently says "**No change to what it validates**" — that is no
longer true on the input side. And the claim that "neither `validateReportSpec` nor
`compileReport` changes" in the spec-shape section needs the same correction.

### 2. Preserving a supplied section id hands id authorship to the agent, and the id is a block id and a state path

> **Resolved (auto).** No fork: preservation is required for a stored spec to keep its ids, and the validator cannot distinguish a stored id from an invented one, so checking the id is the only available answer. The validator preserves an `id` only when it is a non-empty string within the label cap, free of `.` and `$`, and **unique across the report's sections** — and fails otherwise rather than silently re-deriving, because a rejected tool call carries a message the model can act on where a silently renumbered stored spec is the bug durable ids exist to remove. The `.` and `$` exclusions are not tidiness: the id is a page-state path (`sections.${id}.rows`), so a dot forks it.
>
> New paragraph in the section-ids section carries the harm rather than just the rule — duplicate ids collide in `compileReport`'s rows Map (`:439`) so both sections render the same rows, which is wrong numbers rather than a rendering glitch. Files changed spells out all three validator changes, and notes that the comment at `:283-287` explaining why `id` is currently allowed-but-ignored gets rewritten with them, since that is where the next reader will look.
>
> The design's claim that "no writer authors them" is left standing in the sense that mattered — no writer's _contract_ moves, which is what made the reversal free — but it is no longer doing work it cannot support, because the validator now checks what it is handed.

The design's justification for durable ids costing nothing is that "**No writer authors them
— the validator does** — which is why this costs nothing at the three call sites." That is
true today and stops being true under the change. The mechanism the design specifies is that
the validator "preserves a section's supplied `id` instead of always deriving one from
position" — and the validator cannot tell a stored document's id from one the model invented.
`generate-report.yaml`'s payloadSchema constrains a section only to `{ type }` and permits
additional keys (`:42-45`), and the five non-filter branches never key-check, so an `id` on a
chart or kpi section is accepted today and silently dropped. Under preservation it would be
kept, unchecked.

That matters because `section.id` is not an inert label. `compileReport` uses it as the
**block id** (`:372, 512, 529, 539, 610, 619`), as a request id (`query_${id}`, `:117, 626`),
as a download id (`:631`), as a heading id (`:363`), and as a **page-state path**
(`sections.${section.id}.rows`, `:131, 144, 492`). Two concrete harms:

- **Duplicate ids cross a report's data.** `compileReport` keys rows by id in a Map
  (`rowsBySectionId.set(entry.id, …)`, `:439`) and reads them back per section (`:470, 576`).
  Two sections sharing an id means the second write wins and **both sections render the same
  rows** — a report showing wrong numbers, not a rendering glitch. It also collides two block
  ids in one page. I confirmed the current behaviour is safe by construction: two sections
  supplied `id: "zzz"` come back `["s0","s1"]`.
- **An id containing a dot forks the state path.** `sections.a.b.rows` nests where
  `sections.s3.rows` does not, so a section whose id is `a.b` reads rows nothing writes.
  `$`-prefixed is worse in a Lowdefy state path.

Fix: preserve a supplied `id` only when it is a non-empty string, free of `.` and `$`, within
the label cap, and **unique across sections** — and fail otherwise, rather than silently
re-deriving, so a malformed spec is rejected at the tool call where the model can act on the
message. This is a restriction that prevents a real harmful mistake, so it earns its place.

While there: the validator's comment at `:283-287` explains why `id` is on the filter
branch's allowed-key list and _ignored_ ("the id below is always derived from the section's
position"). That comment becomes wrong under this change and should be rewritten, not left to
contradict the code — it is the one place a reader would go to understand id assignment.

### 3. Reports created before this change keep positional ids, so the dropped guard's failure mode survives for them

> **Resolved.** The finding is real about the mechanism and empty in practice: **no app has a saved report yet**, confirmed by the user. So there is no population carrying positional ids, every report that will ever exist is written by the new insert path, and "there are no slots" holds without qualification. No backfill, and no legacy e2e case.
>
> Recorded in the design as a stated fact rather than left implicit, under **No document predates this**, because the guard's removal rests on it and the next reader deserves to know it was checked rather than assumed. It also names what would have followed otherwise — the first section-drop on each existing report would still have addressed sections by position — so if this design is ever reused against a populated collection the exposure is written down instead of rediscovered.

The reversal that dropped `expected_type` / `expected_label` rests on one sentence: "**Nothing
slides into a slot, because there are no slots.**" That is true of documents written after
the change. It is false for every document written before it, and there is no migration —
this design says so for the identity key, and the schema review established there is no
migrations mechanism in the repo at all.

For a legacy report, `spec.sections` carries no ids, so `validateReportSpec` derives `s0, s1,
…` from position exactly as today (`:160`). `remove-report-section` reads, removes,
revalidates and writes — so ids become durable **after** the first successful removal. The
exposed window is the first spec write on a pre-change report, which is precisely the case
review 2 identified: two calls from one render, the second removing whatever slid into the
slot, silently, with no undo.

The window is narrow and the design may well accept it — but it should say so rather than
assert an invariant that does not hold for existing data. The Verification section has the
same gap: the **repeated removal** case it now specifies ("the second is rejected because
that id is no longer on the report") only exercises a report created through the new insert
path, so it passes while the legacy case stays untested. If the exposure is accepted, seed a
legacy-shaped report (a spec whose sections carry no ids) and assert what the second call
does.

A cheap alternative worth weighing: have `remove-report-section` reject when the stored spec's
sections carry no persisted ids, having written the normalized spec back first — one clumsy
retry on the first drop of an old report, in exchange for the class of bug being gone
everywhere rather than nearly everywhere.

### 4. The default sort's leading key is computed in the pipeline, so none of the documented indexes can serve it

> **Resolved (auto).** Both halves, and the favourite-first default sort **stays** — the cost is real but it lands where it does not matter. On `mine`, `favourites` and `deleted` the `$match` narrows to one user's reports before the sort runs, so sorting tens of documents in memory is free. The unbounded scopes are `shared` and `all`, which match on a property of the report rather than on the viewer, and they now get their own index row.
>
> What changed is honesty plus one reordering. The indexes section now states that the indexes serve the `$match` and a caller-supplied `sort`, **not** the default sort, and that the default sort cannot be indexed at all because `is_favourite` is computed in `$addFields` — the same fact that forces the endpoint to be an aggregation. `$skip` / `$limit` inside `$facet` is named as unindexable too, and the memory ceiling as a failure rather than a slowdown. The first index row is reordered per equality-sort-range to `owner.user_id`, `updated.timestamp`, `deleted.timestamp`, and the table carries a one-line note explaining the ordering rule so the next row added follows it. That a caller-supplied sort replaces the default outright turns out to be a second small argument for review 2's replacement rule, which is now stated.

The new [indexes section](../design.md) opens with the right motivation — after the rewrite
"an unindexed collection scan with a blocking in-memory sort is the cost of every list open" —
and then documents indexes that cannot prevent that sort.

The default sort is `is_favourite` descending, then `updated.timestamp` descending. But
`is_favourite` does not exist in the collection: Files-changed specifies it as "`$in` over
`favourite_of`", i.e. an `$addFields` computation, which is also why the endpoint has to become
an aggregation. **A `$sort` on a field produced by `$addFields` can never use an index**, so
the default sort is a blocking in-memory sort in every scope regardless of what is created.
Paging compounds it: `$skip` / `$limit` inside `$facet` cannot use an index either, so the
whole matched set is materialized on every list open.

Separately, the first index row is ordered wrong for the sort it claims to serve.
`owner.user_id`, `deleted.timestamp`, `updated.timestamp` puts a non-point predicate
(`deleted.timestamp: { $exists: false }`) ahead of the sort key, so the index scan is not
ordered by `updated.timestamp` within an owner. Equality, Sort, Range is the rule:
`{ owner.user_id: 1, updated.timestamp: -1, deleted.timestamp: 1 }`.

None of this is fatal — `mine`, `favourites` and `deleted` match one user's reports, where a
blocking sort over tens of documents costs nothing. It is `shared` and `all` that match on a
property of the report rather than on the viewer, so their `$match` can select the whole
collection before the sort runs, and a blocking sort has a 100 MB ceiling above which it
errors rather than slows.

So the fix is mostly honesty plus one reordering: say that the favourite-first default sort is
always in-memory by construction and that the indexes serve the `$match` (and a
caller-supplied `sort`, which replaces the default and _can_ be indexed), reorder the first
row per ESR, and add `updated.timestamp` to the `shared` row since that is the scope where the
sort is unbounded.

### 5. `duplicate-report` copies the spec but not `spec_version`, so the copy is unversioned

> **Resolved (auto).** Copied from the source document rather than re-stamped, since the copy carries the original's spec verbatim and writing the current constant over an older grammar would mislabel it — reintroducing, at the one endpoint that clones a spec instead of authoring one, the "no way to tell which grammar it was written against" problem the field exists to prevent. Endpoint row updated, a paragraph under the table records the reasoning, and the [parent's](../../design.md#data-model) `spec_version` row now says "written on insert by every creator, and copied by `duplicate-report`" so the model states it once rather than in an endpoint footnote.

The endpoint row spells the insert out field by field — `title` / `description` / `spec`
copied, `visibility: private`, owner = caller, `favourite_of: []`, `conversation_id: null`,
its own stamps, `deleted: null` — and `spec_version` is not in it, while the data model says
it is "written on insert by every creator".

Copy it from the source document rather than writing `1`: the copy carries the original's
spec verbatim, so stamping it with the current version would mislabel a v1 spec as whatever
the constant says at the time — which is exactly the "an existing document gives no way to
tell which grammar it was written against" problem the field exists to prevent, reintroduced
by the one endpoint that clones a spec instead of authoring one. One line, and it is only
free before documents exist.

### 6. `remove-report-section` does not say whether it revalidates with the catalog, and the answer decides whether an unrelated catalog change blocks a drop

> **Resolved (auto).** Without the catalog, and the reasoning only runs one way: with it, a filter whose only options source was catalog enum `values` for a field the app has since stopped declaring makes the drop fail with `filter "region" has no options` — a refusal about something other than the section being dropped. `AnalyticsPipeline` gates every pipeline per viewer at resolve regardless, so the catalog buys this endpoint nothing it does not already have. Same posture `resolve-report` takes, for the same reason. Endpoint row says "revalidate **without the catalog**" and a paragraph under the table records why, citing the options-source check at `validateReportSpec.js:496-511` that makes the argument concrete.

The endpoint is specified as "read → remove → cascade → **revalidate** → write", and
`validateReportSpec`'s `catalog` argument is optional and changes what runs
(`validateReportSpec.js:33-36`): with a catalog, every pipeline goes through `validatePipeline`
**and** a select/multiselect filter must have an options source (`:496-511`). Without one,
shape checks only.

That is not a stylistic choice. With the catalog, dropping a section fails when anything else
about the report has drifted — a filter whose only options source was catalog enum `values`
for a field the app has since stopped declaring makes the drop fail with `filter "region" has
no options`, on an act that has nothing to do with that filter. Since `AnalyticsPipeline`
gates every pipeline per viewer at resolve regardless, the catalog buys nothing here and can
only turn a working removal into a refusal.

Validate **without** the catalog, and say so in the endpoint row — same posture
`resolve-report` already takes, and for the same stated reason.

## Verified as written

Checked against source and correct — no action needed:

- **The change costs one line at `generate-report`.** `_state: validated` already holds the
  validator's output (`generate-report.yaml:56-64`); `spec: { _payload: spec }` →
  `spec: { sections: { _state: validated.sections } }` is the whole edit at that site.
- **The safety argument survives exactly as the design states it.** `validateQuery` returns
  `{ collection: query.collection, pipeline: query.pipeline }` — the same array reference,
  no rewriting (`validateChartSpec.js:43`), and its docstring says so (`:20-21`). The
  normalized spec stores every pipeline byte-for-byte as the raw payload did.
- **Composing `{ title, description, sections }` needs no compiler change.** `compileReport`
  emits the header from `validated.title` (`compileReport.js:454-457`), so a document-level
  title reaches it unchanged.
- **The allowed-key half of id preservation is genuinely already done**, and for the reason
  the design gives: the filter branch lists `id` among its permitted keys
  (`validateReportSpec.js:288-299`).
- **Validation is reachable from an API routine without new plumbing.** `_analytics`
  exposes `validateReportSpec`, `querySections` and `compileReport` as server-operator
  methods (`analyticsOperator.js:30-37`), so `create-report` and `remove-report-section` need
  no new operator, connection or request type.
- **Unrecognised keys really do stop being persisted under normalization.** Only table
  columns (`:233-240`) and filter sections (`:288-305`) key-check; the other five branches
  construct a fresh object from known keys, so a stray key on a kpi or chart section is
  dropped rather than carried — which is what the design claims.
- **`owner.name` cannot be anything but a snapshot**, as stated: reporting's manifest declares
  no dependencies and no users collection, so there is nothing to resolve a `user_id` against.
- **The `reports_collection` non-rename** and its description note are the right call for the
  reason given; nothing in the module reads the default other than as a collection name.
