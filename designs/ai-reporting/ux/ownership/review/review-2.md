# Review 2

Re-review after review 1's ten findings were all resolved. Review 1's annotated findings are
settled and not re-raised; this pass reads only what changed — the two new gating sections,
`remove-report-section` and its cascade, the scope and sort table, the `updated` stamping
rule, the paging switch, and the Verification section — against the plugin source, the two
wireframe decks and the sibling sub-designs.

Most of it holds, including the claims I could most easily have got wrong: `mdb.seed()` and
`ldf.user()` both exist as the Verification section describes, and the cascade reasoning is
right about the validator. Six findings, one of which is a decision review 1 got wrong.

### 1. `remove-report-section` can produce a spec its own validator rejects — by emptying it

> **Resolved (auto).** Took the first option — the endpoint refuses rather than the validator relaxing — because the alternative collapses under one push: it loosens an invariant every spec writer shares so that one endpoint can skip a guard, and it needs a report-page empty state nothing else asks for. New paragraph in the cascade section: the endpoint checks the post-cascade result and rejects when nothing would be left, with copy naming the act the user actually wants ("this is the report's only section — delete the report instead") and a path to `delete-report`. Noted as the endpoint's one rejection, and distinguished from the "unbind the filter first" rejection the design already refuses to make: this one names a choice the user can act on. Endpoint row and the Verification list updated (the refusal case: a one-chart-one-filter report, asserting the call is rejected and the report untouched), and report-page records that this is the one place Remove leads to Delete.

`validateReportSpec` fails on `sections must be a non-empty array`
(`plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js:150`). The cascade
section (line 90) covers the two ways a removal orphans a binding, and revalidating before
writing is the right instinct — but it never covers the case where the removal, plus its own
cascade, leaves **zero** sections.

The cascade makes this easy to hit rather than obscure. A two-section report — one chart plus
the filter that drives it — collapses in a single click: dropping the chart orphans the
filter, the cascade removes it, and the spec is empty. So does a one-section report. The
outcome is a validator error the user cannot act on, which is exactly the failure mode the
"cascades silently rather than refusing" paragraph (line 92) exists to avoid, arriving by a
different door.

Two candidate fixes, and the design should pick one:

- **Refuse the drop when it would empty the report**, with copy that names the real choice —
  "this is the report's only section; delete the report instead" — and a path to
  `delete-report`. Honest, and it maps onto an act the user already understands.
- **Allow an empty report** and relax the validator. Cheaper at the endpoint, but it makes
  every other spec writer accept an empty report too, and the report page would need an
  empty state it does not have.

The first is smaller and keeps the validator's invariant. Either way the Verification list
(line 229) needs the case — its two cascade specs both assume something survives.

### 2. The switch to offset paging contradicts the blocks deck, which designs Load more for this exact surface — and review 1's argument for it was wrong

> **Resolved.** The finding framed this as cursor-versus-offset; on inspection the plates decided two separable things and only one is a mechanism. **Offsets stay in the endpoint, and the presentation becomes what the plates actually draw.**
>
> The false argument is deleted. Files changed no longer claims a cursor returns no total — it does not, and plate 4's own `Showing 6 of 8` proves it, since the count comes from the `$facet` branch regardless of how pages are addressed — and the assertion that the list uses a `Pagination` block is gone, since [reports-list](../../reports-list/design.md) never specified one. The offset is now justified by the one argument that survives and that the deck predates: sort became user-selectable, a cursor must encode the key it pages over, and neither default key is unique (`is_favourite` is a boolean with two enormous ties, `updated.timestamp` repeats), so a correct cursor needs an `_id` tiebreaker compounded in for every sort the toolbar offers. An offset needs none, and resets on a sort change exactly as a restarted cursor would.
>
> The deviation is recorded as **deviation 2**, citing both decks (`wireframes.html:2325`, `wireframes-blocks.html:2453`) and stating plainly that it is a mechanism change with no visual consequence. reports-list gains a **Paging is a Load more footer, not numbered pages** section: `Showing n of m · Load more`, appending rather than replacing, reading `{ skip, page_size }`, with scope / search / sort changes resetting both the rows and the offset — called out because appending onto rows from a previous scope would mix two authorization boundaries in one grid. Its files-changed list and paging risk are updated to match.

Review 1 finding #7 replaced the endpoint's cursor with `skip` / `page_size`, on the grounds
that "a cursor returns no total, so it cannot drive the `Pagination` block". Both halves of
that need correcting, and I am the source of the error.

**The plates already decided this, the other way.** `wireframes-blocks.html:2453` is a
callout on plate 4 — the reports list — reading: "**Load more appends** — the cursor lives in
state, the response concatenates onto the rows already rendered. `Pagination` exists if
numbered pages are ever wanted, but a cursor is what the endpoint returns." The plate draws
the footer as `Showing 6 of 8 · Load more`, labelled `Button · cursor in state`, beside the
Recently-deleted link. `wireframes.html:2425` matches.

**And "a cursor returns no total" is refuted by that same drawing.** `Showing 6 of 8` is a
total. It comes from the `$facet` count branch either way — the count is independent of
whether the page is addressed by offset or by cursor. Review 1 conflated the paging mechanism
with the availability of a total, and the design now carries that conflation in Files changed
(line 203), which also asserts "the `Pagination` block the list uses" — a block
[reports-list](../../reports-list/design.md) never specifies. Its rebuild list names a
toolbar, cells, a row menu, a footer recovery link, a delete confirm and three empty states;
no pagination control appears anywhere in it.

So the design currently states a paging model that (a) its own supporting deck designs
differently, (b) the consuming sub-design does not implement, and (c) is justified by a false
premise. The parent's rule is that a sub-design may override the wireframes but **must record
the deviation** (`../design.md`, the plates section), and neither ownership nor reports-list's
Deviations section mentions paging at all.

The real choice is between two defensible models, and it should be made knowingly:

- **Load more with a cursor**, as the deck draws it. Suits a list where you scan for one
  report and rarely go deep, keeps the footer to one button, and still shows a total.
- **Offset paging with the `Pagination` block**, as every other list in this repo does — which
  is the argument reports-list actually makes for the grid ("the same kind of thing as every
  other module list here, so it is the same block").

The tie-breaker the design should reason about is the sort parameter, which the deck predates:
a user-selectable sort invalidates a cursor on every change, where an offset only needs
resetting. That argument survives; the no-total argument does not.

### 3. The sort contract is underspecified, and the `deleted` scope sorts on the wrong field

> **Resolved (auto).** Neither half carried a choice. A caller-supplied `sort` now **replaces** the default outright rather than nesting under `is_favourite` — the design's own word "default" already implied it, and the alternative (starred reports floating above a title sort) is a broken-looking control rather than a design. And `deleted` gets its own default of `deleted.timestamp` descending, since the recovery page's whole content is when a report was deleted, while `updated` on a deleted report is when its spec last changed — unrelated, so one edited in March and deleted in July would sort above one created and deleted yesterday. Favourite-first is dropped there as meaningless. Independent of #2: the sort contract is the same whichever paging model wins.

Line 189: "Default sort is `is_favourite` descending, then `updated.timestamp` descending, in
every scope." Two problems.

**It does not say what happens when the user picks a sort.** `sort?` is a request parameter
and the toolbar offers it, so either the chosen sort replaces the pair outright, or
`is_favourite` stays as the leading key and the user's choice orders within it. The second
means "sort by title" visibly does not sort by title — starred reports float regardless — and
that is the kind of surprise that reads as a broken control. The first is almost certainly
intended, but the contract four sub-designs build against should say so, and it decides
whether the aggregation's `$sort` is built by replacement or by prepending.

**"In every scope" is wrong for `deleted`.** That scope backs the recovery page, whose whole
content is the delete stamp's who and when
([reports-list](../../reports-list/design.md#recovery-is-a-page-not-a-scope)). `updated` is
when the spec last changed, which on a deleted report is unrelated to when it was deleted — a
report edited heavily in March and deleted in July sorts above one created and deleted
yesterday. The recovery page wants `deleted.timestamp` descending. Favourite-first ordering is
also meaningless there.

Fix: state that a user-supplied `sort` replaces the default, and give `deleted` its own
default of `deleted.timestamp` descending.

### 4. `remove-report-section` targets a section by a position the client read earlier, with nothing guarding the gap

> **Resolved.** Payload becomes `{ report_id, section_id, expected_type, expected_label }`, and the endpoint rejects when the section at that position is not the one described. One correction to the finding: the exposure is narrower than it claimed. The sequential case is safe, because the report page re-resolves after a removal and the next click works from fresh ids; what is exposed is two calls from the **same** render — a double-click sending `s2` twice, where the second removes whatever slid into that slot. The guard turns that from a silent destruction (no undo, nothing versions a spec) into a rejected call the page can refetch behind.
>
> Chosen server-side rather than disabling the button in flight, on the design's own stated principle that a hidden or disabled control is a UX affordance and never the boundary — the button would have been the one place it broke its own rule. Also recorded and rejected for now: giving sections **stored** ids, which would make this correct by construction and make any future section reference stable. Better shape, but it changes the spec contract for all three writers and nothing today needs a durable reference, so the guard is what the concrete need justifies. Endpoint row, report-page's Remove description and the Verification list all updated — the new test is two calls with one `section_id` from one render.

The design is admirably explicit that section ids are positional — derived as `s0`, `s1`… from
array order at read time and never stored (line 96) — and concludes that this "is sound for a
single read-modify-write". But the read and the write are not in the same place. The client
learned `s2` when the page resolved; the endpoint does its own read when the call arrives.
Anything that reordered or shortened `sections` in between makes `s2` a different section, and
the endpoint removes it without complaint.

It is not a far-fetched race. The same user in a second tab, a `remove-report-section` retried
after a timeout, or a double-click on Remove all produce it, and the last is the likely one:
two calls with `s2` and `s3` from the same render remove the wrong second section, because the
first call renumbered everything after it. The failure is silent and destructive — a section
disappears from a report that has no undo, since nothing versions a spec.

Cheap fix, in keeping with the endpoint already being narrow: have the caller send the
section's expected `type` and `label` alongside the id, and reject when they do not match what
sits at that position. That turns a silent wrong-removal into a rejected call the page can
retry after a refetch. Worth a line in the Verification list too.

### 5. `search` is undefined in the contract, and the plates' "Search all scopes" affordance has no home

> **Resolved.** Both halves. **`search` matches `title` and `description`** — the two fields the no-matches state already names — and explicitly not the spec, since a report's pipelines and field names are not text the user wrote and matching them would return reports whose visible text has nothing to do with the term.
>
> **A fifth scope, `all`**, added to the table: not deleted + (owner or shared) — the readable predicate with nothing added, so it is simultaneously the widest scope and the one that widens least. It backs the plate's **Search all scopes** button, for the user who knows they saved something and not which tab it is in. Recorded that it is a scope and **not a tab**: the segmented control stays Mine / Shared / Favourites and the button is the only way to reach it. The plate contradicts itself here — button says all scopes, body copy says look in Shared — and the button wins, because searching only Shared answers the question half the time and gets the reverse case wrong. Endpoint row, proposal 7 and the Verification list updated (`all` needs the negative case most: another user's private report must not appear), and [reports-list](../../reports-list/design.md#empty-states-are-three-different-screens)'s zero-result state now carries both buttons and says which fields were searched.

`search?` appears in the endpoint shape (line 168) and five times in prose, and nothing says
what it matches. The plates answer it — the zero-result state reads "No report **titles or
descriptions** contain that" (`wireframes-blocks.html:2551`) — so this is a decision already
made and simply not carried into the contract. One clause fixes it, and it matters because it
is the difference between one field and two in the `$match`.

The same empty state raises a second thing the designs do not cover. It offers two buttons:
`Clear search` and **`Search all scopes`**, with body copy "Try a different word, or look in
the shared scope." There is no all-scopes search in the four-scope table (line 182), and
[reports-list](../../reports-list/design.md#empty-states-are-three-different-screens) reduces
this state to "offers to clear the search" — the second button is dropped without a word.

Either it is a display-only scope switch — keep the search term, flip the segmented control to
Shared, refetch — which needs nothing from the endpoint and belongs in reports-list, or it is
a genuine fifth scope that searches everything the caller may read, which is an ownership
decision and a fifth predicate to specify and test. The first is almost certainly right and
costs nothing; the point is that the plates draw an affordance neither design accounts for, and
the parent's rule requires a recorded deviation if it is being dropped.

### 6. Restore does not stamp `updated`, so a just-restored report comes back where it was months ago

> **Resolved.** The rule stands; the fix moved to where the act happens. Stamping restore would buy a sort position and cost a true statement: the report page's provenance line states **when the spec last changed**, and a restore changes no spec, so the stamp would make that line assert an edit that never happened — worse on a report published to other people than a bad sort position is. The stamping paragraph now defends restore explicitly rather than lumping it with publish, and names the visible cost instead of leaving it implicit.
>
> One correction to the finding: it claimed nothing confirms the restore. The row leaving the recovery page does. What was missing is the way onward, so [reports-list](../../reports-list/design.md#recovery-is-a-page-not-a-scope) now hands the user a **link to the restored report** instead of returning them to a list. That beats both versions of the stamp — a report sorted to the top of Mine still means scanning a grid — and the page already holds the report id, so it costs nothing.

The stamping rule (line 162) puts `restore-report` among the writes that deliberately leave
`updated` alone, reasoning that restoring "changes who may see a report, not what it is". That
holds for `set-report-visibility`, where the report genuinely has not changed and stamping it
would move it in every user's list for no reason. Restore is different in a way worth
weighing.

The list orders by `updated.timestamp`, so a report last edited in March and restored today
returns to its March position. The user has just deliberately brought something back, is sent
from the recovery page to a list of thirty reports, and the thing they restored is on page
three. Nothing tells them it worked, and the design has already ruled out the other signal —
there is no "restored" state, no notification, and the recovery page's job ends when the row
leaves it.

This is not the favourites problem: restore is owner-initiated, on the owner's own report, and
happens once per report rather than repeatedly per viewer, so stamping it moves nothing in
anyone else's list. I would stamp `updated` on restore and say why the two writes differ. If
the rule stands instead, the design should say what confirms the restore, because right now
nothing does.

## Verified as written

Checked against source and correct — no action needed:

- **The Verification section's harness claims.** `mdb.seed(collectionName, documents)` is real
  (`@lowdefy/community-plugin-e2e-mdb/dist/mdb/createMdbHelper.js:31-33`), the fixture clears
  every non-system collection after each test (`dist/fixtures/index.js:67-73`), and
  `ldf.user(userObj)` sets or clears the session cookie mid-test
  (`@lowdefy/e2e-utils/dist/proxy/createPageManager.js:113-119`). One spec seeding as one user
  and acting as another is genuinely available today.
- **The cascade's premise.** `validateReportSpec` does enforce filter bindings in both
  directions — distinct filter fields and no dangling `filterBy` (`:456-480`), and every
  filter bound by at least one section (`:487-495`) — so a plain removal really does yield a
  rejected spec. Filter sections cannot themselves carry `filterBy` (`:302`), so the cascade
  needs no recursion, which the design correctly does not claim it does.
- **`is_favourite` and the two counts are not expressible in a find projection**, so the
  `MongoDBAggregation` rewrite is forced regardless of how finding 2 resolves.
- **No index definitions are expected of this design.** I looked for a repo convention to hold
  the four new scoped queries against and there is none — nothing in `modules/`, `plugins/` or
  `apps/demo` declares MongoDB indexes. Not a gap in the design.
- **The two gating sections** — the publish/unpublish asymmetry and the two-layer `shared`
  model — are internally consistent with the endpoint table, the scope table and the `Vars`
  section, including the non-retroactive reading of an unset `share_roles`.
