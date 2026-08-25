# Review 1

Reviewed `designs/reporting/ux/ownership/design.md` against the reporting endpoints, the
analytics plugin's role gate, the conversation writers, the e2e harness, the repo's
pagination and soft-delete idioms, and the four sibling sub-designs that consume this
contract.

The identity-key section (lines 72–88) checks out claim by claim against source — see
**Verified as written** at the end. The findings below are four places where the model as
specified is wrong or leaks, four places where the contract the four UI sub-designs are
told to build against is not actually specified, and two gaps in how this ships.

## Correctness and confidentiality

### 1. "Publish to the whole app" is not true when a section touches a role-gated collection

> **Resolved.** Split: the model correction lands here, the display fix goes to report-page. New **What `shared` does and does not promise** section states the two independent role concepts (`share_roles` governs publishing; the catalog's per-collection `roles` govern reading the data, enforced against the viewer on every resolve) and defines `shared` as "listed in everyone's Shared scope and openable by everyone" — not a promise that every viewer sees numbers. It notes the common case is unaffected, since catalog role-gating is opt-in. Two closures are rejected in writing: refusing to publish a role-gated report (forbids the case the gate exists to serve — a team sharing restricted reports among themselves) and hiding such reports from the Shared scope (picks wrong on a mixed report, costing the viewer the sections they were entitled to). Proposal 1 and the `resolve-report` row carry pointers.
>
> The remainder is a display problem and went to [report-page](../../report-page/design.md#a-section-the-viewers-roles-deny-is-not-a-broken-section), which owns the failure rendering: new proposal 3 and a section specifying a third Alert variant for a withheld section, pre-checked rather than post-explained (`compileReport` already receives the catalog and the viewer's roles, so it needs no new inputs — the union of catalog `roles` over the base collection and every `$lookup.from`, compared to the viewer's). It carries no recoveries for anyone, including the owner, since nothing is broken; it corrects that page's non-owner copy, which named who could fix a section nobody can; and it names no collection or role, so a display fix does not become a description of the app's access model. Its demo list gains a shared report over a role-gated collection opened by a user without the role — also the first demo coverage catalog role-gating has had.

The design's central promise is that `visibility: shared` "opens one to the **whole app**"
(lines 13, 34). It does not. `resolve-report.yaml` passes `_user: roles` into every
per-section `AnalyticsPipeline` call, and `checkCollectionAccess`
(`plugins/modules-mongodb-plugins/src/analytics/validatePipeline.js:210-225`) rejects the
pipeline when the viewer holds none of the catalog roles required by the base collection or
any `$lookup.from`. The rejection lands in the resolver's `:catch`, so each denied section
renders as an Alert card.

So a `share_roles` holder can publish a report over `payroll` to an app where nobody else
holds the `payroll` role, and every viewer gets a report whose every section is an Alert.
The two role concepts are completely orthogonal: `share_roles` governs who may publish,
catalog `roles` governs who may read the data, and nothing checks them against each other.
Worse, the failure is indistinguishable from a broken report — the `:catch` deliberately
discards the gate's message ("the viewer gets an honest generic description",
`resolve-report.yaml`), so the viewer cannot tell an access denial from a spec that drifted
out of the catalog.

This is not a widening — the invariant "nothing here widens what can be queried"
(parent, invariant 4) holds, and correctly. The problem is that the design's model of
visibility does not admit that a second authorization layer sits under it. It needs a
decision, and there are three shapes: state plainly that shared means "shared where the
viewer's roles allow" and let sections deny (cheapest, but the publisher gets no warning
and the viewer gets no explanation); have `set-report-visibility` compute the union of
catalog roles the spec touches and warn or refuse when it is non-empty; or have
`resolve-report` distinguish role-denied from otherwise-failed so a non-owner's Alert says
"you do not have access to this data" rather than nothing. At minimum the design should say
which, because [report-page](../../report-page/design.md#a-broken-section-gets-two-ways-out-and-only-for-the-owner)
builds its non-owner broken-section copy ("names who can fix it") on the assumption that a
broken section is the author's problem to fix — and in this case it is not.

### 2. The Favourites scope leaks reports that were unpublished

> **Resolved (auto).** The design's own invariant 2 already says the scope match is the authorization boundary, so composing the readable predicate onto every live scope states what the design claims rather than deciding anything new. Two edits: the `favourite_of` bullet now says a favourite is not a grant — the marker outlives the sharing that allowed it, so the Favourites scope is a `favourite_of` match **and** the readable predicate — and a new paragraph under the endpoint table states the composition for all four scopes, with `deleted` as the stated exception (inverts the stamp test, composes ownership not readability). Nothing `$pull`s on unpublish: the read filters, so a dormant marker works again on republish, which the `$pull` alternative would have destroyed permanently. Risk 1 now names the favourites case as the one where a scope match alone leaks.

Favourites are argued for as "a single `favourite_of: <user_id>` match" (line 54), and the
endpoint table says the scope is `favourites` with no further predicate (line 122). But
`set-report-favourite` deliberately works on reports you do not own (line 16, line 124), so
`favourite_of` accumulates ids of non-owners on a shared report — and nothing in the design
ANDs the readable predicate back onto the Favourites query.

Concretely: Bob favourites Alice's shared report. Alice unpublishes it (or loses the
`share_roles` role and it is unpublished, or `share_roles` is removed from the module
entry). `favourite_of` still contains Bob, so Bob's Favourites tab still lists a report
that is now private to Alice — title, description, contents pills, `owner.name`, and an
Open link into `resolve-report`, which _does_ re-check (`owner.user_id` = caller **or**
`visibility: "shared"`) and rejects. So the leak is the list row's metadata plus a row that
opens into the not-found fallback.

The same predicate gap applies to deleted reports: `favourite_of` survives the soft delete,
so a favourited-then-deleted report needs `deleted.timestamp: { $exists: false }` on the
Favourites scope too, and the design never says the scopes compose that way.

Fix: state that every scope is `(readable predicate) AND (scope predicate)`, and that the
Favourites scope is therefore `favourite_of: caller` **and** not-deleted **and**
(owned-by-caller **or** shared) — which is also what makes `$pull` unnecessary on
unpublish. This is exactly the "bug in the scope match is a confidentiality bug" the design
names as its own top risk (line 173); the risk is real and the design currently specifies
the bug.

### 3. `duplicate-report` does not null `conversation_id`, and the copy's chat link then targets the author's conversation

> **Resolved (auto).** No decision here — report-page has already decided the author's transcript is not the copier's to see, and carrying the link would contradict it. The `duplicate-report` row now spells the whole insert: `title` / `description` / `spec` copied, `visibility: private`, owner = caller, `favourite_of: []`, `conversation_id: null`, its own `created` / `updated`, `deleted: null`. A paragraph under the table records why it is a confidentiality requirement rather than tidiness, and why the copy needs its own `created` stamp — inheriting one puts the original author's name on the copier's provenance line.

The duplicate spec is `{ report_id }` → new doc, `visibility: private`, owner = caller,
`favourite_of: []` (line 126). It says nothing about `conversation_id`, `created`,
`updated` or `deleted`.

`conversation_id` matters. [report-page](../../report-page/design.md#continue-in-chat-is-owner-only-and-conditional)
makes Continue-in-chat owner-only precisely because it "exposes the author's conversation —
a transcript that may contain questions they never published", and conditional on
`conversation_id` being present. On a duplicate the copier **is** the owner, so the owner
check passes and the affordance renders. What happens next, traced through the endpoints:

- `get-conversation-results.yaml` matches `_id` + `owner.user_id`, so the transcript
  restore returns empty — no transcript leak, but the chat opens blank with
  `_state: conversationId` set to Alice's id.
- The next turn's `save-conversation.yaml` upserts on filter `_id: <Alice's id>` +
  `owner.user_id: <Bob>` with `upsert: true`. No document matches that filter, so Mongo
  attempts an insert with `_id` = Alice's conversation id and fails on duplicate key —
  every turn, permanently, for that report.

So it is a hard failure rather than a disclosure, but it is a failure the design creates
and the fix is one clause: `duplicate-report` writes `conversation_id: null`. While there,
say the copy gets its own `created` / `updated` stamps and `deleted: null` — a duplicate
that inherits the original's `created` stamp puts Alice's name on
[report-page](../../report-page/design.md#provenance-is-three-facts-and-one-of-them-is-free)'s
provenance line for a report Bob owns.

### 4. Unpublish requires the role as well as ownership, so a published report can become unretractable

> **Resolved.** The asymmetry the finding proposed: **publish requires owner and role; unpublish requires owner or role.** New **Taking it down is easier than putting it up** section states both gates, walks the three situations the symmetric version strands (role revoked, publishing switched off app-wide, owner departed), and records that this widens one existing check in the restrictive direction only rather than admitting an access model. The moderation power it grants `share_roles` holders is named as deliberate and bounded — there is no equivalent power to publish, rename, delete or edit someone else's report. Proposal 2, proposal 3, the "Ownership is enforced server-side" section and the `set-report-visibility` endpoint row all updated, with unpublish marked as the single exception to owner-only writes.
>
> Two knock-ons carried. The `share_roles` var description was wrong in the same way and is corrected: unset means nothing new can be published, **not** that already-shared reports go dark — they stay listed and readable, and their owners can still unpublish them, which is precisely what the fallback to owner makes possible. And [reports-list](../../reports-list/design.md#the-one-real-gap-is-a-menu-cell) gains a note that Unpublish is the one row action not driven by `is_owner`: it shows when the row is shared and the viewer owns it or holds the role, computed client-side from `_user: roles` and `_module.var: share_roles`, so `list-reports` needs no new field. The verification list gains the third unpublish case — a non-owner holding the role must succeed, and the same caller's publish attempt must not.

`set-report-visibility` is "owner-checked **and** role-checked, both directions" (line 123),
and publish is described as "one reversible act" (line 14). The double gate makes it
reversible only while both conditions still hold. Three ordinary situations break it:

- The publisher's `share_roles` role is revoked. Their report stays visible to the whole
  app and they can no longer take it down. Only editing `share_roles` back, or deleting the
  report, retracts it.
- `share_roles` is removed from the module entry entirely. The design says this means "the
  app has no publishing: `set-report-visibility` rejects every call" (line 137) — so every
  already-shared report is frozen shared, while the Shared scope is specified as "always
  empty" (line 137). Reports readable via a direct `resolve-report` link but invisible in
  the list.
- The owner leaves. Nobody in the app can unpublish app-wide content, because the check is
  owner **and** role, and no role alone suffices.

The design argues correctly against inventing an access model, and I am not asking for one.
But there is a cheap asymmetry that fits the existing two states: gate **publish** on owner

- role, and gate **unpublish** on owner **or** role. Taking something down is the safe
  direction, a `share_roles` holder is already trusted to decide what the app sees, and it
  closes all three cases without adding a field or an endpoint. If the answer is instead
  "accepted, delete is the retraction path", the design should say so where it claims publish
  is reversible.

## The contract four sub-designs are told to build against

This sub-design's stated reason for shipping first and alone is that "the four UI
sub-designs build against a fixed contract instead of co-evolving with one" (line 7). Four
parts of that contract are not fixed.

### 5. No endpoint owns a spec edit, yet two are specified as owner-checked writes

> **Resolved.** Half the finding was a mislabel and half needed an endpoint. **Ask-the-assistant-to-fix-a-section is not a write** — it opens the source conversation with the section named, so it is gated like continue-in-chat, and what the assistant produces is a new report, which both this design's parent and report-page already settle as non-goals ("re-deriving a spec is the assistant's job"). Proposal 3 and the "Ownership is enforced server-side" section now separate owner-only _writes_ from the two owner-gated _reads_ that hand a viewer into the author's conversation.
>
> **Drop-a-section is a write and gets `remove-report-section`** (`{ report_id, section_id }`, owner-only), added to this table, the parent's inventory and Files changed. New **Dropping a section is the one spec write, and it has to cascade** section records three constraints found in the validator and the resolver rather than assumed: `validateReportSpec` enforces filter bindings **both** ways (every filter must be bound by a section; no section may name an absent filter), so a plain `$pull` yields a spec its own validator rejects — dropping a filter orphans the sections that named it, dropping the last bound section orphans the filter. It cascades silently rather than refusing, because the person clicking Remove has never seen a spec and could not act on "unbind the filter first". And it must be server-side, because `resolve-report` returns compiled blocks and never the spec, so "post the spec minus one section" would mean shipping pipelines to the browser for one edit action — which is also why the endpoint is narrow rather than a general `set-report-spec` that would become a third author of report specs. Recorded too: section ids are positional (`s0`, `s1`… derived at read time, not stored), so an id is an index and dropping one renumbers the rest.
>
> report-page's broken-section section now distinguishes the two actions and notes the cascade is user-visible — dropping the only section a filter drove removes that filter's control. The verification list gains both cascade cases, since a test that drops a standalone KPI proves nothing.

Line 15 lists the writes that are owner-checked server-side: "rename, publish, unpublish,
delete, restore, **fix-a-section**, and the continue-in-chat hand-back".
[report-page](../../report-page/design.md#a-broken-section-gets-two-ways-out-and-only-for-the-owner)
gives the owner "drop it (a spec edit, owner-checked like any other write)" and lists
`compileReport.js` under its own files changed — not an endpoint.

There is no such endpoint anywhere. The endpoint table here (lines 120–129) has no spec
writer, and neither does the parent's inventory (`../design.md`, lines 78–91), which the
parent calls the single place the inventory lives. `set-report-title` writes one field;
dropping a section rewrites `spec`, has to re-run `validateReportSpec` on the result, and
has to bump `updated`. "Continue-in-chat hand-back" likewise has no endpoint listed, and it
is the read whose owner check the design says matters most.

Either add `set-report-spec` (or `remove-report-section`) to this table and to the parent's
inventory, or move spec editing out of this sub-design and out of line 15's list — but not
both ways at once. As written, `report-page` will discover mid-build that the endpoint it
needs was never specified, which is the exact drift the parent's fifth risk names.

### 6. The four scope predicates are never written down, and `is_owner` is missing from the return

> **Resolved.** All four predicates now stated as a table under Endpoints, since they are the authorization boundary and the thing the per-scope tests assert: `mine` = owner + not deleted, any visibility (publishing does not remove a report from Mine); `shared` = `visibility: "shared"` + not deleted, **including the caller's own**; `favourites` = `favourite_of: caller` + not deleted + (owner or shared); `deleted` = owner + stamp present, owner-only. Default sort recorded as `is_favourite` then `updated.timestamp`, both descending.
>
> The overlap question was the only real choice and went to "Shared is every shared report". Reasoning recorded: `shared` filters on a property of the report rather than the report's relation to the viewer, which is what makes it predictable, and it gives a publisher somewhere to see their report as the app sees it and somewhere to go to unpublish it. The table also makes #2's fix precise — the readable predicate is load-bearing on `favourites` alone, since `mine` is readable by ownership and `shared` by definition.
>
> `is_owner` added to the return, computed unconditionally rather than per scope. [reports-list](../../reports-list/design.md#three-scopes-chosen-server-side) gains a note that the scopes overlap deliberately and nothing should de-duplicate across tabs, and its "Shared, nothing published" empty state is reworded — under this definition it means the app's shared library is empty, not that nobody shared with _you_.

The design says four times that "the scope match **is** the authorization boundary" (lines
19, 44, 173) and that it needs a test per scope — but never states the four predicates. The
open questions this leaves are not cosmetic:

- Does `mine` mean `owner.user_id: caller` (so your own shared reports appear in both Mine
  and Shared), or owner **and** private? This decides whether
  [reports-list](../../reports-list/design.md#empty-states-are-three-different-screens)'s
  "Shared, nothing published — states that nobody has published a report" is even true for
  a user who published one.
- Does `shared` include the caller's own shared reports?
- `favourites` and `deleted` — see finding 2.

Second, the return shape. Line 122 lists "display fields plus section-type counts, filter
count, visibility, publisher, `is_favourite`" — no `is_owner`.
[reports-list](../../reports-list/design.md#the-one-real-gap-is-a-menu-cell) chooses the row
menu's items "by `hiddenField` on the row's `is_owner`", and in the Favourites scope rows
can be owned by anyone. Add `is_owner` to the projection here, since it is this endpoint's
to compute, and write the four predicates out as a short table — they are the deliverable.

### 7. `cursor` is not this repo's pagination, and the listed return fields need an aggregation rather than a projection

> **Resolved (auto).** Both halves are mechanics the repo dictates, not preferences. The endpoint shape becomes `{ scope, search?, sort?, skip, page_size }` and the row notes it is an aggregation; Files changed carries the reasoning — `is_favourite` is `$in` over `favourite_of` and the two counts are reductions over `spec.sections`, none expressible in a find projection (`$slice` / `$elemMatch` / `$meta` only), and paging is `$skip` / `$limit` in a `$facet` with a count branch per `apps/demo/.claude/guides/pagination.md`, which is what the `Pagination` block binds to. The cursor is dropped for two concrete reasons rather than taste: it returns no total, so it cannot drive that block, and the sort is user-selectable, which invalidates a cursor on every sort change — not just the scope change reports-list accounts for. The total is added to the return list; `is_owner` is left for #6.

The rewrite takes `{ scope, search?, sort?, cursor? }` (line 122). Two problems.

**The cursor.** Every list page in this repo pages with `$skip`/`$limit` from a
`pagination: { current, skip, pageSize }` state shape that the `Pagination` block binds to
automatically, with the total coming from a `$facet` count branch
(`apps/demo/.claude/guides/pagination.md:9,13,220-222`). A cursor gives no total, so it
cannot drive that block — yet [reports-list](../../reports-list/design.md) is specified as
"a grid, like every other list in this repo" and says nothing about paging differently.
Nothing about a saved-reports list argues for cursors: the volumes are small, the sort is
user-selectable (which invalidates a cursor on every sort change, not just the scope change
`reports-list` accounts for), and `updated.timestamp` is not unique so a cursor over it
needs a tiebreaker. Use `{ scope, search?, sort?, skip, page_size }` with a `$facet` count
unless there is a reason not to, and say so.

**The projection.** `list-reports.yaml` is a `MongoDBFind` with an options `projection`.
None of the three new fields can be produced that way: `is_favourite` is `$in` over
`favourite_of` (find projections take `$slice` / `$elemMatch` / `$meta`, not expressions),
and "section-type counts" and "filter count" are reductions over `spec.sections`. All three
need `$addFields` in an aggregation — which `reports-store` supports (it is a plain
`MongoDBCollection`), and which the `$facet` count wants anyway. The design should say the
endpoint becomes an aggregation, because "rewritten … with the richer projection" (line 141)
reads as a smaller change than it is.

### 8. Say which of the new writes bump `updated`

> **Resolved (auto).** The design's own definition of `updated` ("on every spec change") plus the list sorting on it settles each case, so there was nothing to choose. New paragraph in the data model: `create-report` / `generate-report` stamp both on insert, `set-report-title` and any spec write stamp `updated`, and `set-report-favourite` / `set-report-visibility` / `restore-report` deliberately do not. It also names why this is the one place the repo's stamp-every-write rule is narrowed — the stamp is the list's sort order, not just an audit record, so stamping a favourite would reorder every user's list each time anyone starred a report.

`CLAUDE.md` is unambiguous — "Include a change stamp on all database write operations" —
and this design adds five writes without saying which of them touch `updated`. It matters
because the list sorts on `updated.timestamp` (line 116):

- `set-report-favourite` must **not** stamp. A favourite is one user's read-side marker
  (line 52); stamping it would jump the report to the top of _everyone's_ Mine and Shared
  lists every time anyone stars it.
- `set-report-visibility` and `restore-report` probably should not either — neither changes
  the spec, and the design says `updated` is written "on every spec change" (line 116).
- `set-report-title` and any spec edit (finding 5) should.

One sentence resolves it, and without it an implementer following the repo rule literally
gets the favourite case wrong in a way no build check catches.

## How this ships

### 9. "Lands with tests" names no test mechanism, and the stated verification is a build check

> **Resolved (auto).** The mechanism is determined rather than chosen — Playwright e2e is the only harness in the repo that can invoke a `type: Api` routine, and it already supports the two-user case (`ldf.user()` swaps the session cookie mid-spec, `mdb` seeds documents directly). New **Verification** section replaces the bare "verify with `pnpm ldf:b`": it states plainly that a build check verifies almost nothing here, names the harness and the existing spec to pattern off, and lists what lands — one spec per scope asserting what it withholds as well as what it returns, one owner/non-owner pair per mutation asserting server-side rejection rather than a hidden menu item, and the publish life cycle end to end. Deliberately not enumerating scope predicates, which are #6's.

The argument for shipping this sub-design first and alone is that "the authorization checks
land **with tests**" (line 7, echoed in the parent at line 17), and the risks section
reinforces it: "It needs tests per scope, including 'shared' excluding deleted and 'deleted'
being owner-only" (line 173). But the design never says what kind of test, and its own
verification section says only "Verify with `pnpm ldf:b`" (line 156) — a build check, which
cannot execute an authorization predicate.

The repo has no harness that reaches API YAML routines: `pnpm test` is jest over the plugins
package's JS units (the `mongodb-memory-server` suites are all under
`plugins/modules-mongodb-plugins/src/connections/`). The only mechanism that can test these
endpoints is the Playwright e2e suite, and it can do the job well — `apps/demo/e2e/fixtures.js`
merges the `ldf` and `mdb` fixtures, `mdb` seeds documents directly, and `ldf.user(userObj)`
sets or clears the session cookie mid-test
(`@lowdefy/e2e-utils/dist/proxy/createPageManager.js:113-119`), so one spec can seed as
Alice, act as Bob, and assert per scope. `apps/demo/e2e/reporting/formatted-report.spec.js`
is already the pattern, and already guards the identity key from the other side.

For a server-only sub-design whose entire visible output is authorization behaviour, naming
the test surface is not a detail — it is the difference between shipping first with a fixed
contract and shipping first untested. Add the spec list (one per scope, plus owner/non-owner
per mutation) to this design, and replace "verify with `pnpm ldf:b`" with the e2e run.

### 10. The shipped identity-key change has no changeset, and the pending one still documents the deleted fragment

> **Resolved.** Both halves. The changeset work is recorded in Files changed: a new entry for the identity-key change (`a22b1468`, breaking, shipped without one) plus a correction to the unreleased `reporting-owner-reference.md`, which still introduces `defaults/user_id.yaml` and defends the `sub ?? id` derivation the same unreleased batch deletes — they release together, so the published changelog would otherwise add a file the same release removes. The new entry has to state the breaking condition even though nothing is affected, since that is what makes the `!` legible later.
>
> On migration: **no consumer app maps `userFields.id` to anything other than the auth subject**, confirmed by the user, so no migration ships. The design's closing line is replaced with the reason rather than the outcome — where the values agree nothing changed; where they diverge the break is total (every report and conversation keyed on the subject matches nobody and vanishes from every scope), and no app is in that state. Also recorded, against the review's own glibness: a correct migration could not ship from this module regardless. Rewriting the key needs a per-user subject → mapped-id table that only the host app's user records hold, across two collections and four fields each (`owner.user_id` plus the three change stamps' `user.id`). A consumer can detect exposure in one query — reports whose `owner.user_id` matches no current user id.

The identity-key section documents commit `a22b1468`, which is marked breaking
(`refactor(reporting)!`) and which deleted `modules/reporting/defaults/user_id.yaml`. That
commit added no changeset — `.changeset/` holds five entries and none covers it.

More concretely wrong: the pending, unreleased `.changeset/reporting-owner-reference.md`
still says the change adds "Two new fragments under `modules/reporting/defaults/`" and
describes the first as "`user_id.yaml` — the `sub ?? id` derivation, now `_ref`'d by all
eleven read and write sites (and by `change_stamp.yaml`)", with a paragraph arguing why that
derivation must be identical everywhere. Both changesets release together into one
CHANGELOG entry, so as it stands the module's published release notes will introduce a file
the same release deletes and defend a derivation the same release removes. Fix the existing
changeset and add one for the identity key.

The design should also say what the divergent-id case does on upgrade. Line 88 says
"Migration is a non-issue anywhere `sub == id`, which is every adapter-backed app" — but the
divergent app is precisely the one the section says the change exists to fix (line 82), and
for that app every existing report and conversation is keyed on the provider subject and
goes invisible the moment the module updates. It is a one-line `$set` over two collections
plus a note, or an explicit "no app is in this state"; either is better than a sentence that
only covers the case where nothing happens.

## Verified as written

Checked against source and found accurate — no action needed:

- **The identity-key section's three arguments** (lines 76–84). `handleAgentChat.js` runs
  `onFinish` hooks through `context.callEndpoint(endpointId, { payload })` with the request
  context (`dist/handleAgentChat.js:189-191`). `createSessionCallback.js` expresses its only
  precedence as `user.id ?? user.sub ?? user.email`, for `hashed_id`, and never touches
  `_user` (`dist/routes/auth/callbacks/createSessionCallback.js:26,76`).
  `apps/demo/lowdefy.yaml:79` is `id: user.id` as cited.
- **The events `change_stamp` claims** (lines 94–103). Exported at
  `modules/events/module.lowdefy.yaml:14`, component at `:88` whose `_ref` resolves to a
  one-line `_module.var: change_stamp`, var default at `:40-49` using `_user: id` — so the
  "an app adds a field centrally and reporting misses it" consequence is exactly right, and
  reporting's local fragment is byte-identical in shape.
- **The current-state descriptions** of `list-reports`, `delete-report` and `resolve-report`
  (lines 24–26), including the already-deleted exclusion on the soft delete and the
  per-section `:try` on the resolver.
- **Deviation 1** (line 169). `docs/shared/soft-delete.md` does treat a document as live
  when `deleted` is absent, null, or an object without a timestamp, and does prescribe
  `deleted.timestamp: { $exists: false }` for reads. (It also prescribes writing the stamp
  via the events component — worth a line in that doc noting a dependency-free module
  writes its own, given finding 10's territory.)
- **`_user: roles` is available in an API routine**, so the `share_roles` check is
  expressible: `emit-data-parts.yaml`, `query-data.yaml` and `resolve-report.yaml` all pass
  it today, and `_array.some` / `_array.filter` exist in the installed operator set.
- **`favourite_of` as an array is the right shape at module scale**, and the
  join-collection escape hatch (line 54) is a genuine mechanical swap behind the two
  endpoints.
