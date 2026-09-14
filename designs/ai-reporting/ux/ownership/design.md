# Reporting ownership: visibility, favourites, retirement, and the endpoints over them

A sub-design of [`reporting/ux`](../design.md) — read its [data model](../design.md#data-model) and [cross-cutting invariants](../design.md#cross-cutting-invariants) first.

Today a saved report is readable only by its author, retirable only by its author, and that is the whole model: `list-reports` matches `owner.user_id`, `resolve-report` matches `_id` **and** `owner.user_id`, and there is no notion of a report anyone else can see. This sub-design gives reports an audience and a life cycle — private by default, publishable to the whole app by a role-holder, favouritable per user, retired by one soft delete, recoverable — and puts every one of those acts behind a server-side check.

**This sub-design is server-side only, and it ships first.** No page changes. The reports data model, the scope semantics and the authorization checks land with tests, so the four UI sub-designs build against a fixed contract instead of co-evolving with one. The three surfaces that read this model are [reports-list](../reports-list/design.md), [report-page](../report-page/design.md) and [save-as-report](../save-as-report/design.md); none of them decides anything here.

Conversation documents already carry `owner`, `created` and `updated`; the `deleted` stamp they still need belongs to the rail that needs it — see [chat](../chat/design.md). The report ownership model has nothing to say about conversations.

> **Implemented.** This sub-design shipped in the `reporting` module — the
> visibility, favourites, soft-delete/restore, duplicate and scope-aware
> `list-reports` endpoints are all live under `modules/ai-reporting/api/`.
> `docs/ai-reporting/` is the source of truth for consumer-observable behaviour;
> this file records the rationale.

## Proposed change

1. Reports are **private to their author** by default. A `visibility: private | shared` field opens one to the whole app, settable only by a user holding one of the roles listed in a new **`share_roles`** var (a string array — more than one role can carry the privilege). Unset means no publishing at all. What "the whole app" does and does not promise is bounded by the catalog's own role gate — see [below](#what-shared-does-and-does-not-promise).
2. **Publish and unpublish are one reversible act** via a single `set-report-visibility` endpoint, with exactly two states: only me, or everyone in the app. No per-user grants, no groups, no share links. The two directions are gated differently so the act stays reversible — see [taking it down is easier than putting it up](#taking-it-down-is-easier-than-putting-it-up).
3. Every mutation is **checked server-side** — rename, delete, restore, publish, drop-a-section are owner-only, as are the two owner-gated reads that open the author's conversation (continue-in-chat and ask-the-assistant-to-fix-a-section); unpublish is the one act a `share_roles` holder may perform on a report they do not own — and every other read-only act (open, favourite, download a section, duplicate) is checked only for readability. **Duplicate** is the non-owner's path to a version they control.
4. Add **per-user favourites** (`favourite_of: [user_id]`, projected to a boolean for the caller) so one user's ★ is not everyone's, and they work on shared reports you do not own.
5. Keep **soft delete as the only retirement** — no archive state. Deleting a published report drops it from everyone's Shared scope for free, because every read filters the stamp.
6. **Restore returns a report to private**, in the same update that clears the marker. There is no purge endpoint.
7. Rewrite **`list-reports`** to take a server-side `scope` (mine / shared / favourites / all / deleted) plus search, sort and paging, and open **`resolve-report`** to shared reports while telling the page whether the viewer is the owner.

## Current state

- `modules/ai-reporting/api/generate-report.yaml` — inserts `{ _id, owner, title, description, spec, conversation_id: null, deleted: null, created, updated }`. The `conversation_id: null` carries a comment recording why: tool endpoints receive only the tool input, so the agent context (conversation id) does not reach them.
- `modules/ai-reporting/api/list-reports.yaml` — own-only (`owner.user_id` match), `deleted.timestamp: { $exists: false }`, sort `updated.timestamp: -1`, `limit: 200`, projection `title/description/created/updated`. No scope, search, sort or paging parameters.
- `modules/ai-reporting/api/delete-report.yaml` — a correct soft delete: owner-scoped, writes a `deleted` change stamp from `defaults/change_stamp.yaml`, and excludes already-deleted docs so a repeat delete reports 0 modified rather than overwriting the original who/when. Its one gap is the refusal path rather than the write, and it is shared with every other filter-authorized update here — see [below](#ownership-is-enforced-server-side-on-every-write).
- `modules/ai-reporting/api/resolve-report.yaml` — loads the report matched on `_id` **and** `owner.user_id`, so today a report is readable only by its author; rejects on not-found (the `Dynamic` block renders its fallback), runs each query section through `AnalyticsPipeline` inside `:try`, compiles server-side.
- `modules/ai-reporting/defaults/` — two fragments every endpoint composes from: `owner.yaml` (`{ user_id, name }`) and `change_stamp.yaml` (`{ timestamp, user: { name, id } }`). Both take the id from `_user: id`, the repo-wide identity key — see [the identity key](#the-identity-key-is-_user-id-not-sub--id) below for why reporting no longer derives its own. Reporting declares no dependencies, so it does not consume the events module's exported `change_stamp` component — but the shape is identical, and that is a deferred choice rather than a limit.
- `docs/shared/soft-delete.md` — the repo idiom: field `deleted`, shape `{ timestamp, user: { name, id } }`, initialised `null`, read predicate `deleted.timestamp: { $exists: false }`. No module in this repo has an archive state.

## Key decisions and rationale

### Private by default; publishing is role-gated, binary, and reversible

Most users should only ever see their own reports. A user holding any role in `share_roles` may publish one to the **whole app** — the same shape an existing app already uses for its saved exports (per-user documents matched on the creator's id, plus a curated set everyone can read).

Publishing is binary and reversible: `private` or `shared`, toggled in one place, with no per-person or per-team grants and no share links. Anything finer needs an access model this module does not have, and inventing one here would mean owning it forever. `share_roles` is plural because more than one role can legitimately carry the privilege; unset means the app cannot publish anything new, and the control is then **absent** rather than disabled — a disabled toggle teaches a capability the user cannot have. Unset does **not** retroactively hide reports already shared: they stay listed and readable, and their owners can still unpublish them (which the gating below is what makes possible).

**Publish is independent of everything else.** Unpublishing does not archive, delete, unfavourite or move a report; it changes exactly one field. Conversely a deleted report cannot be published, because a deleted report is not readable at all.

### Taking it down is easier than putting it up

The two directions of `set-report-visibility` are gated differently:

- **Publish** requires the caller to be the owner **and** hold a `share_roles` role. Owner, because publishing someone else's private report would expose work they had not chosen to share; role, because that is the privilege.
- **Unpublish** requires the caller to be the owner **or** hold a `share_roles` role.

Checking both in both directions reads tidier and is the version that breaks. It makes publish reversible only while _both_ conditions still hold, and three ordinary situations dissolve one of them: a publisher whose role is revoked can no longer retract their own app-wide report; an app that switches publishing off freezes every already-shared report in place; and an author who leaves takes the only retraction path with them. In each case the content stays in front of the whole app and the only remaining exit is deleting it.

The asymmetry closes all three without a new field, endpoint or state, and it is not an access model creeping in — it widens one existing check, in the restrictive direction only. It does hand `share_roles` holders a moderation power over reports they do not own, which is deliberate: anyone trusted to decide what the whole app sees is trusted to decide it should stop seeing something. There is no equivalent power to publish, rename, delete or edit someone else's report.

The list's row menu therefore shows Unpublish on a shared report the viewer does not own when they hold the role. That needs nothing new from `list-reports` — the page already knows the viewer's roles and the configured `share_roles` — so it stays a display decision in [reports-list](../reports-list/design.md), with the endpoint as the boundary.

### The report page's menu is compiled, and what that duplicates

_Added 2026-08-14, when the report page's ⋯ became a dropdown._

Both surfaces now draw the ⋯ as the same antd dropdown, but they get there differently, and the difference is forced rather than chosen. **A dropdown owns the block that opens it.** A `Modal` can be opened from anywhere by id (`CallMethod`), which is how the report page originally reused the list's menu wholesale; a `Dropdown` or `Popover` cannot, and neither registers a method to open one from elsewhere. The report page's ⋯ sits in the header `compileReport` emits inside a `Dynamic` block, so the menu had to be emitted there too.

Compiled output cannot `_ref` build-time config, so **publish, unpublish and duplicate now have two implementations** — the shared `modules/ai-reporting/actions/report_*.yaml` the list's cell `_ref`s, and the `CallAPI` sequences the compiler emits. That is the cost, and it is the reason to state it here rather than leave it to a code comment: a change to one of those three endpoints or payloads has to be made twice. Rename and delete do not duplicate — they only open the static `rename_modal` and `delete_confirm_modal`, which both surfaces share.

Three things make that trade acceptable rather than merely tolerable:

- **It is the posture the header already had.** ★, Drop-a-section and Continue-in-chat are compiler-emitted action sequences in the same row, and ★ has been implemented twice (compiler and grid cell) since it shipped.
- **The alternative costs more.** Making the header static — so its items could `_ref` the shared files — needs the report's `title` / `description` / `is_owner` / `visibility` client-side, which `Dynamic` never exposes: it resolves server-side at page get and only the resolved blocks reach the client. That means a new authorized single-report read, which would put a **second** implementation of the readable predicate in the module — precisely the thing this design refuses to allow anywhere else — and a title that paints after mount instead of arriving with the page.
- **What duplicates is wiring, not judgement.** Three `CallAPI` payloads, no branching. The authorization is untouched: the endpoints match the caller, exactly as before.

The item gates move server-side as a result, which is a small improvement: the endpoint computes a `can_share` boolean from the `share_roles` var and passes it to the compiler, so no `_user` operator survives into compiled output and the answer is decided once per page load rather than per render. `is_owner` and `visibility` fall back closed (`false` / `private`), so a resolver that omits them hides the owner's items rather than offering Publish on an already-shared report.

An item's link and its actions are emitted **together**, so a viewer's compiled config carries only the actions their own menu can reach — a reader's page contains no rename or delete action at all. That is hygiene, not the boundary; the boundary is still the match inside each endpoint.

### What `shared` does and does not promise

There are **two independent role concepts** in this module, and publishing sits on top of the older one. `share_roles` governs who may publish a report. The catalog's per-collection `roles` govern who may query the data underneath it, and that gate is enforced by `AnalyticsPipeline` against the **viewing** user's roles on every resolve, section by section — a report is revalidated for whoever opens it, never trusted because it was valid when saved. Nothing checks the two against each other, and they are not meant to be the same thing.

So `visibility: "shared"` means precisely this: the report is **listed in everyone's Shared scope and openable by everyone**. It does not promise every viewer sees numbers. A `share_roles` holder can publish a report over a role-gated collection to an app where few others hold that role, and those viewers get the report with its gated sections failing.

In the common case there is nothing to explain: catalog role-gating is opt-in, and a collection with an absent or empty `roles` list is queryable by any authenticated user, so an app that gates nothing has the two layers coincide exactly.

Two ways of closing the gap are **rejected**:

- **Refusing to publish a report that touches a role-gated collection.** It forbids the case the gate exists to serve — a team publishing restricted reports among themselves, all of whom hold the role. A restriction that blocks the legitimate use to prevent a confusing one is the wrong trade.
- **Hiding role-gated reports from the Shared scope.** It picks wrong on a mixed report, where some sections are open and only some are gated: hiding it costs the viewer the sections they were entitled to, and listing it returns us to the same place.

What is left is a **display problem, not a model problem** — a viewer needs to be told that a section is withheld rather than broken. That belongs to the surface that renders the failure, and is [report-page](../report-page/design.md#a-section-the-viewers-roles-deny-is-not-a-broken-section)'s: it also corrects that page's non-owner copy, which currently names who can fix a broken section, when in this case nothing is broken and nobody can.

### Ownership is enforced server-side, on every write

The menus differ between owner and non-owner, but the menu is not the boundary. Every write — rename, publish, delete, restore, drop-a-section — matches the caller against the report's owner in its own endpoint, as do the two owner-gated **reads** that hand the viewer into the author's conversation (continue-in-chat, and ask-the-assistant-to-fix-a-section, which is the same hand-off with a section named). A hidden menu item is a UX affordance; the match is the authorization. Unpublish is the single exception, and it is still a server-side match: owner **or** `share_roles` holder, for the reasons [above](#taking-it-down-is-easier-than-putting-it-up).

Likewise the list's **scope match is the authorization boundary**, which is exactly why the scope has to be a server parameter rather than a client-side filter over an "everything" response. A single endpoint returning everything and letting the client pick would make Shared and Mine cosmetic.

**Putting the authorization in the filter obliges every such update to set `disableNoMatchError: true`.** This is not a detail of the write, it is the refusal path. `MongoDBUpdateOne` throws on a zero match by default, and the thrown body carries `received.filter`, the endpoint's YAML source path and a stack trace — so with authorization in the filter, the default behaviour hands a caller who may not act the exact predicate that rejected them. Every refusal becomes an error response describing the check it failed. With the flag, a refusal is a successful update reporting `modifiedCount: 0`, which is the whole point: zero means not found, not readable, already deleted, or already in that state, and the caller is not told which. This applies to all five filter-authorized updates — `set-report-visibility` (both directions), `set-report-title`, `set-report-favourite`, `restore-report` and `delete-report`. It does **not** apply to `remove-report-section`, whose refusal is a `:reject:` from an owner-matched load that runs before the update, making the update's zero-match path unreachable outside a concurrent delete. This was found by running the endpoints, not by reading them — a build check cannot see it, which is [why the verification step is an e2e suite](#verification).

### Non-owners get read-plus-duplicate

Open, favourite, download a section, duplicate — and the edit actions are _absent_, not disabled. **Duplicate** is the escape hatch that makes this comfortable: rather than a request-access dance, copy a shared report into your own and change it freely. The copy is always private and owned by the copier, with `favourite_of` reset; the original is untouched.

### Favourites are per-user

A ★ on a shared report must not be everyone's ★, so favourites are stored as `favourite_of: [user_id]` on the report doc and projected to a boolean for the caller. They are a read-side marker, so they work on reports you do not own, and they drive both the Favourites scope and the default sort.

The array is the right shape at module scale — the Favourites query is a single `favourite_of: <user_id>` match. If an app ever has hundreds of users favouriting one report, the array becomes a hot document and the answer is a `report_favourites` join collection; that is a mechanical swap behind the same two endpoints.

### The stored spec is the validator's output

Every writer of a report — `generate-report`, `create-report` and `remove-report-section` — persists **`validateReportSpec`'s return value**, not the spec it was handed. Today `generate-report` stores `_payload: spec`, the agent's raw payload.

The reason to change it is that the raw payload is not a document shape at all: it is whatever the model sent, re-interpreted by current code on every read. Section ids get re-derived from array position, `format` descriptors fall back to `REPORT_LOCALE` / `REPORT_CURRENCY` / `REPORT_DECIMALS`, a multiselect's `match` defaults to `any`, and any key the validator does not recognise rides along untouched. So a stored report's meaning tracks the module's current constants rather than being fixed at the moment it was saved, and nothing about it is stable enough to reference — which is what pushed [dropping a section](#dropping-a-section-is-the-one-spec-write-and-it-has-to-cascade) toward a positional guard.

**The safety argument for storing raw is untouched by this, which is what makes the change available.** `generate-report`'s current comment defends raw persistence on the grounds that "the pipeline is stored verbatim, never sanitized" and resolve-time revalidation is the guarantee. Both halves survive: `validateQuery` returns the pipeline array **unchanged** — its own docstring says so (`plugins/modules-mongodb-plugins/src/analytics/validateChartSpec.js:20-21, 43`) — so the validator's output carries every pipeline byte-for-byte as the raw payload did. Nothing is sanitized, and `AnalyticsPipeline` still revalidates per section per viewer on every resolve. That reasoning was about pipelines and is correct about pipelines; it had simply been extended to the whole spec, and the presentation contract is where the cost landed.

What this fixes, by construction:

- **Section ids are assigned once and persisted**, so they are durable identities rather than positions. No writer authors them — the validator does — which is why this costs nothing at the three call sites.
- **Display defaults freeze at create time.** `REPORT_LOCALE` / `REPORT_CURRENCY` / `REPORT_DECIMALS` and the `match` default become **create-time inputs**, not read-time fallbacks. Changing one no longer changes the meaning of every report that omitted it. This is a change in what those constants are, and it is the intended one: an app's currency default should not retroactively re-denominate reports saved last year.
- **Unrecognised keys stop being persisted forever.** The document holds a shape this module authored.

**The one thing this costs: the validator's output has to be valid input, and today it is not.** Persisting `validateReportSpec`'s return value means the document is re-validated by the same function that produced it — on every resolve, and again inside `remove-report-section`'s read → cascade → revalidate → write. Run the current validator over its own output and it throws, three separate ways:

- A kpi that omits `format` comes back with `format` explicitly `null` (`validateReportSpec.js:179-191`) and fails `format must be an object`. This one needs no serialization argument: it is a `null` in the returned object.
- A filter section's absent `options` / `match` / `optionsQuery` are `undefined` in the return value (`:416-425`). `:set_state` writes the operator's result into routine state in-process with no serialization (`@lowdefy/api/dist/routes/endpoints/control/controlSetState.js:32-34`), so they reach the insert and the driver's default (`ignoreUndefined` is set nowhere) stores them as `null`. Each then trips a `!== undefined` check — a select fails on `match is only valid on a multiselect control`, a multiselect on `declares both options and optionsQuery`, a daterange on `options must be an array`.
- A report with no description composes `description: null` from the document field, because `_payload` of an absent key resolves to `null` (`@lowdefy/operators/dist/getFromObject.js:35-37`), and fails `description must be a string`.

Two rules close it from both ends, and the file already carries the pattern — the table-column branch builds its return value key by key and sets only what is present (`:249-267`):

- **An absent optional is an absent key in the output**, never `null` and never `undefined`. Nothing nullable then reaches the document at all.
- **`null` reads as absent wherever the validator reads an optional.** Uniform rather than special-cased on `description`, so no caller has to learn which fields tolerate a null. This is a loosening, which the compatibility rule below permits, and it is part of the persisted contract rather than an implementation detail.

The property is worth naming because nothing else enforces it: **`validateReportSpec` is idempotent** — validating its own output returns that output. A round-trip assertion over one section of each type belongs in `validateReportSpec.test.js`, because it is what stops the next optional field reintroducing this, and discovering it through a bricked report costs far more than the test does.

**`spec` holds `{ sections }` only.** `title` and `description` are document fields, not spec fields — the single source for the list, for search, for sort and for `set-report-title`, which then writes one field and never touches the spec. `resolve-report` composes `{ title, description, sections }` from the document before re-validating, so `compileReport` keeps reading `validated.title` (`compileReport.js:454-457`) unchanged and `validateReportSpec` changes only as above. The split is right independently of the duplication it removes: `spec` is the AI-authored contract, `title` is user-editable metadata, and review 2's decision that `search` matches title and description "and explicitly not the spec" becomes automatic once the spec carries no prose.

**`spec_version: 1` on insert, and the validator may only loosen.** The stored spec is re-validated on every read — `querySections` and `compileReport` both call `validateReportSpec` — so a tightening of the grammar retroactively invalidates documents already saved. That has happened once already: table columns carried a `tag` flag, the derived enum-tag styling was dropped, and the strict-key check now rejects `tag` outright. The rule is therefore that **the validator may loosen for persisted shapes and never tighten**, and it is forced rather than chosen: there is no migrations directory anywhere in this repo, so nothing can migrate a module-owned collection, and a tightening that needs a migration needs the mechanism built first. `spec_version` is what a future compatibility branch or migration would key on, and it cannot be backfilled meaningfully later — an existing document gives no way to tell which grammar it was written against.

A spec that fails re-validation at resolve is a **whole-report** failure, not a per-section Alert: `querySections` runs in the resolver's `:for … :in`, which `@lowdefy/api`'s `controlFor` evaluates before iteration and outside the per-section `:try`. Today that surfaces as the `Dynamic` fallback — "Report not found … or you do not have access to it" — which is the one message that tells an owner not to investigate. [report-page](../report-page/design.md#a-spec-that-no-longer-validates-is-not-a-missing-report) owns the correct rendering.

### Dropping a section is the one spec write, and it has to cascade

[report-page](../report-page/design.md#a-broken-section-gets-two-ways-out-and-only-for-the-owner) gives a report's owner two ways out of a failing section: ask the assistant to fix it, or drop it. Only the second is a write. **Asking the assistant is navigation** — it opens the source conversation with the failing section named — so it is gated exactly like continue-in-chat and writes nothing. What the assistant then produces is a **new** report, because re-deriving a spec is the assistant's job and editing a report's sections outside chat is a non-goal in both this design's parent and report-page. There is no update-in-place path for a spec and none is wanted.

Dropping a section is therefore the only spec write in the module, and `remove-report-section` is the only endpoint that performs it. Three things force its shape:

**It cannot be a `$pull`.** `validateReportSpec` enforces filter bindings in both directions — every filter section must be bound by at least one section, and no section may name a filter field the report does not have. So removing a section can invalidate the spec two ways: drop a filter, and every remaining section still listing its field fails; drop the last section bound to a filter, and that filter fails. A naive removal produces a document its own validator rejects, which then breaks the report on the next resolve rather than at the moment of the edit. The endpoint therefore cascades — removing a filter strips its field from the remaining sections' `filterBy`, and removing the last section bound to a filter removes that filter too — and revalidates before writing.

**It cascades silently, rather than refusing.** The alternative is rejecting the drop with "unbind the filter first", and the person clicking Remove has never seen a spec, has no concept of a binding, and no way to act on that message.

**It refuses one thing: emptying the report.** `validateReportSpec` requires a non-empty `sections` array, and the cascade makes zero sections easy to reach rather than obscure — a report of one chart plus the filter that drives it collapses in a single click, because dropping the chart orphans the filter and the cascade takes it too. So the endpoint checks the post-cascade result and rejects when nothing would be left, naming the act the user actually wants: _this is the report's only section — delete the report instead_, with the path to `delete-report`. Relaxing the validator to accept an empty report is the alternative and it is worse: it loosens an invariant every spec writer shares so that one endpoint can skip a guard, and it would need an empty state on the report page that nothing else asks for. This is the one rejection the endpoint has, and unlike "unbind the filter first" it names a choice the user can act on.

**It has to be server-side, because the client never holds the spec.** `resolve-report` returns compiled blocks, not the spec — the pipelines stay server-side deliberately — so "post the spec minus one section" is not available without shipping the spec to the browser, which would be a widening for one edit action. `remove-report-section` names the section and the server does the read, the removal, the cascade, the revalidation and the write. This is also why the endpoint is narrow rather than a general `set-report-spec`: nothing else needs one, and a general spec writer would add a third author of report specs beside the agent and the save sheet.

**Section ids are durable, so the call needs no guard.** `validateReportSpec` assigns each section an id and the writers persist it — see [the stored spec is the validator's output](#the-stored-spec-is-the-validators-output) — so a `section_id` names one section for the life of the report rather than the position it happened to occupy when the caller last read it.

That makes the payload `{ report_id, section_id }`, and it removes the whole class of stale-position bug rather than guarding it. A double-click sends the same id twice: the first call removes that section, the second finds nothing to remove and is rejected. Nothing slides into a slot, because there are no slots.

**No document predates this.** No app has a saved report yet, so every report that will ever exist is written by the new insert path, and there is no population carrying positional ids. Worth stating because the guard's removal rests on it: had reports existed, the first section-drop on each would still have addressed sections by position, and the invariant above would have been true only of new data.

**Preserving a supplied id means the validator has to check it.** The mechanism is that `validateReportSpec` keeps a section's `id` rather than always deriving one from position — and it cannot tell a stored document's id from one the model invented, since `generate-report`'s payload schema constrains a section only to `{ type }` and permits any other key. The id is not an inert label: `compileReport` uses it as the **block id** (`:372, 512, 529, 539, 610, 619`), as a request id (`query_${id}`), as a download id and as a **page-state path** (`sections.${id}.rows`). Two sections sharing an id collide in the rows Map (`:439`) so both render the same rows — wrong numbers, not a rendering glitch — and an id containing a `.` forks the state path, so a section reads rows nothing writes.

So the validator preserves an `id` only when it is a non-empty string within the label cap, free of `.` and `$`, and **unique across the report's sections**; anything else fails rather than being silently re-derived. A rejected tool call carries a message the model can act on, where a stored spec whose ids changed under it is the exact bug this section exists to remove. The validator's comment explaining why `id` is currently allowed-but-ignored (`validateReportSpec.js:283-287`) is rewritten with it — that comment is where the next reader will go to understand id assignment.

**This replaces a guard an earlier revision carried**, and the reversal is worth recording because the original reasoning was sound at the time. That revision priced durable ids as "changes the spec contract for all three writers (the agent, the save sheet, this endpoint)" and took `{ report_id, section_id, expected_type, expected_label }` instead, with the endpoint rejecting when the section at that position was not the one described. That price was real **under raw persistence**: if the document stores what the writer sent, every writer has to author or inject an id. Once the writers store the validator's output, the validator assigns the ids, no writer's contract moves at all, and the guard is paying for a problem that no longer exists. Dropped with it: the two `expected_*` fields, the guard-mismatch rejection, and its e2e case. The cascade and the refusal to empty a report are untouched — both are independent of how a section is addressed.

Durable ids also make every other reference to a section stable for free: the resolver's failure log, a per-section CSV, and the fix-in-chat context each name a section rather than a slot.

### Soft delete is the only retirement

The wireframes originally carried both archive and delete. They collapsed to one because no module in this repo has an archive state, and the established idiom is a `deleted` change stamp with reads filtering `deleted.timestamp: { $exists: false }`. Two retirement acts would mean two states to reconcile against visibility (is an archived-but-published report visible? to whom?), a fourth list scope to explain, and a second thing to test.

One soft delete also buys a consequence for free: because every read filters the stamp, deleting a published report removes it from everyone's Shared scope without a separate unpublish step.

**Nothing in this module hard-deletes.** The delete confirm says so — "nothing is queried again and no data is touched" — because "Delete" over a data tool reads as destructive and the reassurance is true: the module never writes to the source collections at all.

### Restore returns a report to private

**Restore always writes `visibility: private`** in the same update that clears the marker. Silently re-publishing something deleted months ago would hand it back to the whole app before anyone re-read the numbers. Republishing is one deliberate click afterwards. (Reversing this — restoring the previous audience exactly — is a one-line change if a real case argues for it.)

The recovery surface itself — a quiet page rather than a fourth list scope — is [reports-list](../reports-list/design.md#recovery-is-a-page-not-a-scope)'s decision. What belongs here is that its read is `list-reports` with `scope: deleted`, **still owner-matched**: you never see anyone else's deleted reports, including ones that were published to you.

There is no permanent-delete action anywhere, and adding one would be the single irreversible act in an otherwise recoverable system.

### The identity key is `_user: id`, not `sub ?? id`

Reporting briefly derived its ownership key as `_if_none: [_user: sub, _user: id]`, in a `defaults/user_id.yaml` fragment `_ref`'d by eleven sites. That is now plain `_user: id`, matching every other module in the repo — events' exported `change_stamp` (`modules/events/module.lowdefy.yaml:49`), `deals/api/create-deal.yaml:33`, `files/requests/upload-policy.yaml:35`, all seven notifications requests.

The `sub ?? id` form was never a decision. It arrived with the conversation writers and spread when a later commit noticed reporting held two identity keys and standardised reports onto the conversations one rather than the other way round. Three reasons to undo it:

**Its recorded rationale was false.** The fragment claimed `sub ?? id` was "what the agent framework derives when it invokes an onFinish hook". It isn't: `handleAgentChat.js` runs hooks through `context.callEndpoint(endpointId, { payload })` with the request context, so `_user` inside a hook resolves exactly as in a browser-invoked endpoint. Where the framework does express a precedence — `createSessionCallback.js`, for `session.hashed_id` — it is `id ?? sub`, the reverse order, and it never touches `_user`.

**It is dead weight in the normal case.** `createSessionCallback.js` builds `session.user` from the standard OIDC claim set on the JWT, which always carries both `id` and `sub`; `auth.userFields` then sets its mapped fields on top. Auth.js sets `token.sub = user.id` at sign-in, so in any adapter-backed app that maps `userFields: { id: user.id }` — as `apps/demo/lowdefy.yaml:79` does — `sub` and `id` hold the same value.

**Where it is not dead, it is harmful.** The divergent case is an app that deliberately maps `userFields.id` to something other than the JWT subject — an employee number, a contact id. `_if_none` prefers `sub`, so in exactly that case reporting would key ownership on the provider subject while events, notifications, files and deals key on the app's chosen id: one person, two identities, and reporting rows that can never be joined to any other module's data.

The case the `sub ?? id` form was defending against — an app that declares no `userFields.id` — is already broken repo-wide for that app: events would write `id: null` stamps and every notifications filter would match nothing. `userFields.id` is a de-facto host-app contract, and reporting hedging against its absence bought nothing while breaking joins for apps that had chosen a different id deliberately.

`defaults/user_id.yaml` is deleted rather than reduced to `_user: id`. Its stated purpose was to stop a non-trivial derivation drifting between readers and writers; with a bare `_user: id` there is nothing to drift, and no other module wraps the operator. (The drift argument was already only half-true in practice — six sign-in guards spelled `sub ?? id` inline while the fragment sat beside them.)

**Migration.** No data migration ships, and the reason is narrower than "`sub == id` everywhere". Where the two values agree — every adapter-backed app mapping `userFields.id` to `user.id` — the stored key is unchanged and there is nothing to migrate. Where they diverge, which is the case this change exists to fix, the break is real: every existing report and conversation is keyed on the provider subject, so after the change its owner matches nobody and it disappears from every scope. **No consumer app is in that state**, which is why no migration is written.

Worth recording for whoever hits this later: a correct migration could not be shipped from this module anyway. Rewriting the old key into the new one needs a per-user mapping from subject to mapped id, and that lives only in the host app's own user records — so it is an app-specific migration, not a blind `$set`. It would have to cover both collections and four fields each: `owner.user_id` plus `created.user.id`, `updated.user.id` and `deleted.user.id`. A consumer can detect exposure in one query — reports whose `owner.user_id` matches no current user id.

### Reporting writes its own change stamp, for now

Reporting declares no module dependencies, so it writes the stamp shape from its own `modules/ai-reporting/defaults/change_stamp.yaml` — a within-module `_ref` needs no dependency, and five endpoints write a stamp, so the shape lives in one file rather than being copied into each of them. `restore-report` and every other new writer `_ref` the same fragment.

**Note — the events module already exports a `change_stamp` component, and reporting could use it.** This is a choice, not a limitation, and earlier revisions of this design stated it as though reporting "cannot" reuse it. It can: `modules/events/module.lowdefy.yaml` exports `change_stamp` (:14) whose component resolves to `_module.var: change_stamp` (:88), and every other module in the repo consumes it as

```yaml
updated:
  _ref:
    module: events
    component: change_stamp
```

The gain is more than deduplication. Because the component resolves to the **events entry's var**, an app that adds a field to its audit stamps — a tenant id, an app name, a request id — sets it once on the events module entry and every consuming module picks it up. Reporting's local fragment is invisible to that, so an app doing this today would end up with reporting stamps that differ from the rest of its collections.

The cost is that reporting stops being dependency-free. Every app installing reporting would also have to install and wire `events`, and reporting is the module most likely to be dropped into an app standalone — it is an analytics surface, not part of the entity graph the other modules share. That is the whole of the trade-off, and it is why the local fragment stands for now.

**Not implemented here.** Deliberately deferred rather than resolved: it is a manifest change plus five `_ref` swaps, it is independent of everything else in this sub-design, and it wants a view on whether reporting should be allowed to depend on events at all — which is a module-graph question, not an ownership one.

## Data model

The table is in the [parent](../design.md#data-model). What this sub-design adds is the semantics:

- **`visibility`** — absent is read as `private`, so existing documents need no migration. Only `set-report-visibility` writes it, and `restore-report` forces it to `private`.
- **`favourite_of`** — absent is read as empty. `$addToSet` / `$pull` only; never overwritten wholesale. Projected out of every list and read response as a boolean `is_favourite` for the caller, so a caller never learns who else favourited a report. **A favourite is not a grant.** Because a non-owner may favourite a shared report, the marker outlives the sharing that allowed it — so the Favourites scope is a `favourite_of` match **and** the readable predicate, never the match alone (see the scope table under [Endpoints](#endpoints)). Nothing `$pull`s on unpublish or delete: the read filters instead, so the marker sits dormant and works again if the report is republished.
- **`owner`** — `{ user_id, name }`. `owner.user_id` is the authorization key every scope filter and every mutation matches; `owner.name` is carried so a list row or report header can name the owner without a lookup. `duplicate-report` writes the copier as owner of the new document; nothing rewrites it on an existing one, though the shape does not preclude a transfer later — which is the point of it not being the `created` stamp (see the [parent](../design.md#data-model)). The id is `_user: id` — see [the identity key](#the-identity-key-is-_user-id-not-sub--id).
- **`owner.name` is a snapshot, and cannot be otherwise.** Reporting declares no module dependencies and knows no users collection, so it has no way to resolve a `user_id` to a current display name — the carried name is not an optimization avoiding a lookup, it is the only thing available. Owner-side writes refresh the whole `owner` reference while they are there (free, and it matches what `save-conversation` already does on the conversation side), but that is best-effort: a "Published by …" line reads the name as at the last write, so a user who changes their display name keeps the old one on reports nobody has touched since. Accepted rather than fixed — the fix is a dependency on a module that owns users, which is the trade-off [the change stamp section](#reporting-writes-its-own-change-stamp-for-now) defers deliberately.
- **`spec`** — `{ sections }`, the validator's output rather than the writer's input, with each section carrying a durable id, unique within the report. The validator is idempotent, so re-validating a stored spec returns it unchanged: an absent optional is an absent key, and a `null` reads as absent. See [the stored spec is the validator's output](#the-stored-spec-is-the-validators-output).
- **`spec_version`** — `1`. Written on insert by every creator. The validator may loosen for persisted shapes and never tighten; this is what a future compatibility branch keys on, and it cannot be backfilled.
- **`title` / `description`** — document fields, not spec fields. The single source for the list, search, sort and rename.
- **`created` / `updated` / `deleted`** — change stamps, all three. `created` is written once on insert; `updated` on every spec change; `deleted` by the soft delete, which refuses to overwrite an existing one. Reads filter on `deleted.timestamp`, and the list sorts on `updated.timestamp`. Because `created` carries `user.name`, the [report page](../report-page/design.md)'s provenance line needs no extra lookup to say who made a report.

**Which writes stamp `updated`, and which deliberately do not.** The repo rule is a change stamp on every write, and this is the one place it is narrowed — because the list sorts on `updated.timestamp`, so the stamp is not just an audit record, it is the list's order. `create-report` and `generate-report` write both stamps on insert; `set-report-title` and any spec write stamp `updated`. `set-report-favourite`, `set-report-visibility` and `restore-report` do **not**: a favourite is one user's read-side marker, and stamping it would jump the report to the top of _every_ user's list each time anyone starred it. Publishing and restoring change who may see a report, not what it is.

Restore is the case worth defending, because not stamping it has a visible cost: the list orders by `updated.timestamp`, so a report last edited in March and restored today returns to its March position rather than the top. Stamping it would fix the position and break something better — the [report page](../report-page/design.md#provenance-is-three-facts-and-one-of-them-is-free)'s provenance line states **when the spec last changed**, and a restore changes nothing about the spec, so the stamp would make that line assert an edit that never happened. A truthful provenance line is worth more than a sort position, particularly on a report published to other people.

The cost is paid where it arises instead: **the recovery page hands the user the restored report** rather than returning them to a list to find it — [reports-list](../reports-list/design.md#recovery-is-a-page-not-a-scope)'s to build. That is better than either version of the stamp, since even a report sorted to the top of Mine still means scanning a grid for it.

### Indexes are the host app's to create, and this module's to document

Reporting owns these two collections rather than querying the app's, so it is the only party in a position to say what they need indexing on — and after this rewrite `list-reports` carries the authorization boundary, so an unindexed collection scan with a blocking in-memory sort is the cost of every list open.

Nothing in this repo creates an index, and this design does not change that. The precedent is `modules/contacts/requests/search_contacts.yaml`, which documents the Atlas Search index its `$search` stage needs field by field and notes that an app without Atlas can drop the stage and keep a working pipeline. Same shape here: the module documents, the host app creates.

What the reads want. Field order follows equality, then sort, then range — a non-point predicate ahead of the sort key means the index scan is not ordered by it:

| Index                                                     | Serves                                  |
| --------------------------------------------------------- | --------------------------------------- |
| `owner.user_id`, `updated.timestamp`, `deleted.timestamp` | Mine and the deleted scope              |
| `visibility`, `updated.timestamp`, `deleted.timestamp`    | Shared and `all` — the unbounded scopes |
| `favourite_of`                                            | The Favourites scope                    |
| `conversation_id`                                         | The report ↔ chat link                  |
| `owner.user_id`, `updated.timestamp` (conversations)      | The chat rail                           |

**These serve the `$match`, not the default sort, and the default sort cannot be indexed at all.** `is_favourite` is not a stored field — it is `$in` over `favourite_of`, computed in `$addFields`, which is [why the endpoint has to be an aggregation](#files-changed-anticipated) — and a `$sort` on a field produced by `$addFields` can never use an index. So favourite-first ordering is a blocking in-memory sort in every scope, and `$skip` / `$limit` inside `$facet` cannot use an index either. This is stated rather than fixed: on `mine`, `favourites` and `deleted` the `$match` narrows to one user's reports first, so sorting tens of documents in memory costs nothing. The scopes where it is unbounded are `shared` and `all`, which match on a property of the report rather than on the viewer — hence their own index row above, and hence the note that a blocking sort has a memory ceiling above which it errors rather than slows. A caller-supplied `sort` replaces the default outright and _is_ indexable, which is a second small argument for that replacement rule.

**`search` is `$regex` over `title` and `description`, not Atlas Search.** The set being searched is one user's reports, already owner-scoped and paged, so ranking buys little while an Atlas requirement costs every consumer of the module. This is the same field pair review 2 fixed for other reasons. Atlas remains available on the contacts pattern if a real case appears — the fields searched do not change either way.

## Endpoints

| Endpoint                | Status  | Shape                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list-reports`          | rewrite | `{ scope: mine \| shared \| favourites \| all \| deleted, search?, sort?, skip, page_size }`; scope match is the authz boundary. An aggregation, not a find — see [Files changed](#files-changed-anticipated). Returns display fields plus section-type counts, filter count, visibility, publisher, `is_favourite`, `is_owner`, and the total for the pager. Scope predicates are in the table below. |
| `set-report-visibility` | new     | `{ report_id, visibility }` — publish: owner **and** `share_roles` holder. Unpublish: owner **or** `share_roles` holder. [Why they differ](#taking-it-down-is-easier-than-putting-it-up).                                                                                                                                                                                                              |
| `set-report-favourite`  | new     | `{ report_id, favourite }` — `$addToSet` / `$pull` on `favourite_of`. Readable-report check, not owner.                                                                                                                                                                                                                                                                                                |
| `set-report-title`      | new     | `{ report_id, title }` — owner-only.                                                                                                                                                                                                                                                                                                                                                                   |
| `remove-report-section` | new     | `{ report_id, section_id }` — owner-only. Server-side read → remove the named section → cascade filter bindings → revalidate **without the catalog** → write; stamps `updated`. Rejects when the section id is not on the report, and when the removal plus its cascade would leave no sections. [Why it is not a `$pull`](#dropping-a-section-is-the-one-spec-write-and-it-has-to-cascade).           |
| `duplicate-report`      | new     | `{ report_id }` → new doc: `title` / `description` / `spec` / **`spec_version`** copied, `visibility: private`, owner = caller, `favourite_of: []`, **`conversation_id: null`**, its own `created` / `updated`, `deleted: null`. Readable-report check.                                                                                                                                                |
| `restore-report`        | new     | `{ report_id }` — owner-only; clears `deleted` and sets `visibility: private` in one update.                                                                                                                                                                                                                                                                                                           |
| `delete-report`         | change  | The soft delete itself was already correct — owner-scoped, stamped, repeat-safe. One line added: `disableNoMatchError: true`, so a non-owner's delete is a zero match rather than an error carrying the filter. [Why every filter-authorized update needs it](#ownership-is-enforced-server-side-on-every-write).                                                                                      |
| `resolve-report`        | change  | Read match becomes `_id` + not-deleted + (`owner.user_id` = caller **or** `visibility: "shared"`); returns whether the viewer is the owner so the page can render owner-only actions. The per-section role gate is untouched and still runs against the viewer — see [what `shared` promises](#what-shared-does-and-does-not-promise).                                                                 |

**"Readable-report check"** means the same predicate `resolve-report` uses: not deleted, and owned by the caller or shared. Favourite and duplicate use it because both are read-side acts on something you are already entitled to see.

**The four scopes, written out.** These are the authorization boundary, so they are stated rather than left to the implementation. `caller` is `_user: id`; every scope also carries the search, sort and page parameters.

| Scope        | Match                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `mine`       | `owner.user_id: caller` + not deleted. Any visibility — publishing a report does not remove it from Mine. |
| `shared`     | `visibility: "shared"` + not deleted. Includes the caller's own shared reports.                           |
| `favourites` | `favourite_of: caller` + not deleted + (`owner.user_id: caller` **or** `visibility: "shared"`).           |
| `all`        | not deleted + (`owner.user_id: caller` **or** `visibility: "shared"`) — the readable predicate alone.     |
| `deleted`    | `owner.user_id: caller` + `deleted.timestamp` **present**. Owner-only; never anyone else's.               |

**`search` matches `title` and `description`** — the two fields the no-matches state names ("No report titles or descriptions contain that", `wireframes.html`). Not the spec: a report's pipelines and field names are not text the user wrote, and matching them would return reports whose visible text has nothing to do with the term.

**`all` is a scope, not a tab.** It exists for one affordance the plates draw: the no-matches state's **Search all scopes** button, for the case where the user knows they saved something and not which tab it is in. It is the widest scope and also the plainest — it _is_ the readable predicate with nothing added, so it widens nothing the other scopes do not already allow. The segmented control stays Mine / Shared / Favourites; `all` is reachable only by pressing that button, which keeps the search term and re-runs it wider. The plate's body copy says "look in the shared scope" while its button says all scopes; the button is the decision, because searching only Shared answers the question half the time and gets the reverse case (searching from Shared, wanting Mine) wrong.

**Default sort** is `is_favourite` descending, then `updated.timestamp` descending — on `mine`, `shared` and `favourites`. `deleted` defaults to `deleted.timestamp` descending instead: the recovery page's whole content is when a report was deleted and by whom, and `updated` on a deleted report is when its spec last changed, which is unrelated — one edited heavily in March and deleted in July would sort above one created and deleted yesterday. Favourite-first ordering is meaningless there too.

A `sort` supplied by the caller **replaces** the default outright rather than nesting under `is_favourite`. Favourites lead only when the user has not asked for an order; a starred report floating above a title sort would make the sort control look broken.

Two things follow from the table. **The readable predicate is only load-bearing on `favourites`** — `mine` is readable because you own it and `shared` because it is shared, but a favourite marker can outlive the sharing that created it, which is the one place a bare scope match would leak. And **the scopes deliberately overlap**: a report you published is in both Mine and Shared, and can be in Favourites as well. `shared` filters on a property of the report rather than on the report's relation to the viewer, which is what makes it predictable — and it gives the publisher somewhere to see their report as the app sees it, and somewhere to go to unpublish it. `deleted` is the only scope that is not a filter over live reports, and the only one that inverts the stamp test.

**`remove-report-section` revalidates without the catalog**, which is the same posture `resolve-report` takes and for the same reason. `validateReportSpec`'s `catalog` argument is not cosmetic — with it, every pipeline goes through `validatePipeline` **and** a select/multiselect filter must have an options source (`validateReportSpec.js:496-511`). Passing it here can only turn a working removal into an unrelated refusal: a filter whose only options source was catalog enum `values` for a field the app has since stopped declaring would make the drop fail with `filter "region" has no options`, on an act that has nothing to do with that filter. `AnalyticsPipeline` gates every pipeline per viewer at resolve regardless, so the catalog buys this endpoint nothing.

**A duplicate copies `spec_version` rather than writing `1`.** The copy carries the original's spec verbatim, so stamping it with the current constant would mislabel an older spec as the current grammar — reintroducing, at the one endpoint that clones a spec instead of authoring one, exactly the "an existing document gives no way to tell which grammar it was written against" problem the field exists to prevent.

**A duplicate never inherits the original's conversation link.** `conversation_id` is written `null` on the copy, and this is a confidentiality requirement rather than tidiness: the copier owns the copy, so the [report page](../report-page/design.md#continue-in-chat-is-owner-only-and-conditional)'s owner-only "Continue in chat" would render and point at the original author's conversation — the transcript that page is explicit about not exposing. The copy gets its own `created` stamp for the same reason in reverse: inheriting one would put the original author's name on the copier's provenance line.

`create-report` is the fifth writer of this model and is specified in [save-as-report](../save-as-report/design.md) — it is the one endpoint whose shape is driven by the sheet rather than by the model.

## Vars

`reports_collection` — unchanged, and **deliberately not renamed**. It defaults to `report_layouts` while this design, the module and every endpoint call them reports; the name is left over from an earlier concept. Renaming the default would silently point an existing app at an empty collection, which is a real failure in exchange for tidiness, so the var keeps its name and its `description` gains a line saying so — the mismatch stops being an open question for the next consumer who notices it.

`share_roles` — string array, no default. Unset means nothing can be published: `set-report-visibility` rejects every _publish_ call, no publish control renders anywhere, and in an app that never had the var the Shared scope is empty because nothing was ever shared. It is **not** a retroactive switch — an app that removes the var after reports were published still has those reports listed and readable, and their owners can still unpublish them, because [unpublish falls back to the owner](#taking-it-down-is-easier-than-putting-it-up). Full `description` / `type` in `modules/ai-reporting/module.lowdefy.yaml`, then `pnpm docs:gen`.

## Files changed (anticipated)

- `modules/ai-reporting/api/list-reports.yaml` — rewritten as a **`MongoDBAggregation`, not the `MongoDBFind` it is today**, with the scope parameter, search, sort and paging. The three new response fields force it: `is_favourite` is `$in` over `favourite_of`, and the section-type and filter counts are reductions over `spec.sections` — a find projection takes `$slice` / `$elemMatch` / `$meta` and no expressions, so none of them is expressible there. Paging is `$skip` / `$limit` inside a `$facet` alongside a count branch — the repo idiom (`apps/demo/.claude/guides/pagination.md`), and the source of the total the list's footer shows. **Offsets rather than the cursor the plates specify**, for one reason: the sort is user-selectable, which it was not when the deck was drawn. A cursor has to encode the sort key it pages over, and neither default key is unique — `is_favourite` is a boolean with two enormous ties and `updated.timestamp` can repeat — so a correct cursor needs a `_id` tiebreaker compounded into it for every sort the toolbar offers. An offset needs none of that, and resets on a sort change exactly as a restarted cursor would. This is a change of mechanism only: the total is available either way, and the footer the plates draw is unaffected — see [deviation 2](#deviations-from-the-wireframes).
- New `modules/ai-reporting/api/set-report-visibility.yaml`, `set-report-favourite.yaml`, `set-report-title.yaml`, `remove-report-section.yaml`, `duplicate-report.yaml`, `restore-report.yaml`.
- `modules/ai-reporting/api/generate-report.yaml` — insert shape gains `visibility: "private"`, `favourite_of: []` and `spec_version: 1`, and **stores `_state: validated` rather than `_payload: spec`**, with `spec` holding `{ sections }` only and `title` / `description` staying document fields. (`conversation_id` is already on the document, still null on this path.) `create-report` writes the same shape — see [save-as-report](../save-as-report/design.md).
- `modules/ai-reporting/api/resolve-report.yaml` — read match opened to shared; returns the owner flag; and composes `{ title, description, sections }` from the document before `querySections` / `compileReport`, so the compiler keeps reading `validated.title` unchanged.
- `plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js` — three changes, all forced by the document now holding this function's own output. It **preserves a supplied `id`** instead of always deriving one from position (it already accepts `id` on a filter section and ignores it), and checks it: non-empty string, within the label cap, no `.` or `$`, unique across sections. Its **output omits absent optionals** rather than emitting `null` / `undefined` — the table-column branch (`:249-267`) is the pattern to copy into the kpi and filter branches. And **`null` reads as absent** wherever it reads an optional, which is the input-side half of the same round trip. Everything else it validates is unchanged.
- `plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.test.js` — a round-trip assertion per section type: `validateReportSpec(validateReportSpec(spec))` deep-equals `validateReportSpec(spec)`. This is the only thing that holds the idempotency property once it is fixed, and it is a jest test rather than e2e, so it runs on every `pnpm test`.
- `modules/ai-reporting/module.lowdefy.yaml` — `share_roles`, the `reports_collection` description note, plus the new endpoint exports.
- `docs/ai-reporting/` — a concepts page for ownership / visibility / retirement, the expected indexes, and regenerated `reference/vars.md`.
- `.changeset/` — a new entry for the identity-key change, which shipped as a breaking commit (`a22b1468`, `refactor(reporting)!`) without one; plus a correction to the unreleased `reporting-owner-reference.md`, which still introduces `defaults/user_id.yaml` and defends the `sub ?? id` derivation that the same unreleased batch deletes. Both entries release together, so as it stands the published CHANGELOG would add a file the same release removes. The new entry must state the breaking condition — an app whose `userFields.id` is not the auth subject loses its existing reports and conversations — even though no consumer is in that state today; that is what makes the `!` legible to whoever reads the changelog next.

## Demo consumers

These are the shared fixtures the UI sub-designs all build on, so they are seeded here:

- Seeded reports covering **private, shared, and favourited**, with at least one owned by a **second user** so the non-owner view (read-plus-duplicate, absent edit actions, "Published by") is actually exercised.
- `share_roles` set on the demo module entry, and a demo user holding the role plus one who does not.
- At least one soft-deleted report so the recovery page renders with a real stamp.

## Verification

This sub-design ships no page, so a build check verifies almost nothing about it: `pnpm ldf:b` confirms the YAML compiles, and cannot execute a single authorization predicate. Since the authorization behaviour _is_ the deliverable, the tests are the deliverable too, and they are **Playwright e2e specs** — the only harness in this repo that reaches an API routine at all. (`pnpm test` is jest over the plugins package's JS; the `mongodb-memory-server` suites all sit under `plugins/modules-mongodb-plugins/src/connections/`. Nothing there can invoke a `type: Api` routine.)

The harness already does everything needed. `apps/demo/e2e/fixtures.js` merges the `ldf` and `mdb` fixtures: `mdb` seeds report documents directly, and `ldf.user(userObj)` sets or clears the session cookie mid-test, so **one spec can seed as one user and act as another** — which is what makes the non-owner half testable at all. `apps/demo/e2e/ai-reporting/formatted-report.spec.js` is the pattern to follow, and already guards the identity key from the other side.

One exception now sits on the jest side, and it is the cheapest test in the batch: the **spec round trip**. `validateReportSpec`'s idempotency is a pure-function property, so it is asserted in `validateReportSpec.test.js` rather than through an endpoint — one section of each type in, the validator's own output back through it, deep-equal. It belongs in this sub-design because this is the change that makes the property load-bearing, and it guards a failure e2e would only catch if a spec happened to include a kpi or a filter.

What lands with this sub-design:

- **One spec per scope** — all five, each asserting both what it returns and what it withholds, since the scope match is the authorization boundary. `all` needs the negative case most: another user's **private** report must not appear in it.
- **One owner / non-owner pair per mutation** — publish, unpublish, rename, delete, restore, duplicate, favourite, remove-a-section — asserting the non-owner call is rejected server-side rather than merely hidden in a menu. Unpublish needs a third case: a non-owner **holding** a `share_roles` role, who must succeed, and a publish attempt by the same caller, who must not.
- **The two cascade cases on `remove-report-section`** — dropping a filter section, and dropping the last section bound to a filter — each asserting the report still resolves afterwards. These are the cases where a naive removal leaves a spec its own validator rejects, so a test that only drops a standalone KPI proves nothing. Plus two refusal cases: a one-chart-one-filter report, where the cascade would empty the spec; and a **repeated removal** — two calls carrying the same `section_id`, asserting the second is rejected because that id is no longer on the report. (Under positional ids this was a "stale position" case, where the second call would remove whatever had slid into the slot; durable ids make it a plain not-found, and the test asserts the report is untouched.)
- **The publish life cycle end to end**: private → shared → visible to a second user → unpublished → gone from that user's list.

Then `pnpm ldf:b` from `apps/demo` for the demo entry's config, as usual.

## Resolved questions

Resolved 2026-07-29, carried over from the parent design.

1. **Archive or delete?** Delete only. No module in this repo has an archive state, and the soft-delete stamp is the established idiom.
2. **Does reporting already soft-delete correctly?** Reports yes (`delete-report` writes the stamp, owner-scoped, and won't overwrite an existing one). Conversations have no delete at all, so that endpoint is new — see [chat](../chat/design.md).
3. **Can reporting reuse the events module's `change_stamp` component?** Yes, technically — the earlier "no" was wrong. Events exports it and every other module consumes it; reporting doesn't only because it declares no dependencies and that is worth keeping for now. See [Reporting writes its own change stamp, for now](#reporting-writes-its-own-change-stamp-for-now) for the trade-off and why it is deferred rather than settled.
4. **Where does the publish capability come from?** A `share_roles` string array var, checked server-side on `set-report-visibility`. Modelled on an existing app's saved-exports pattern: per-user documents matched on the creator's id, plus a set everyone can read.

## Deviations from the wireframes

1. **The read predicate is `deleted.timestamp: { $exists: false }`**, not `deleted: null` as the plates' notes phrase it. The plates describe the idiom loosely; `docs/shared/soft-delete.md` is canonical, and it treats a document as live whether `deleted` is absent, null, or an object without a timestamp.
2. **`list-reports` pages by offset, not by cursor.** Plate 4's callout 7 (`wireframes.html:2325`) specifies "search, scope, sort and a cursor", and the blocks deck adds that "`Pagination` exists if numbered pages are ever wanted, but a cursor is what the endpoint returns" (`wireframes-blocks.html:2453`). The deviation is the mechanism only, and it is driven by something the deck predates: sort became a user-selectable parameter, and a cursor must encode the key it pages over. **What the plates draw is unchanged** — `Showing 6 of 8 · Load more` is exactly what an offset plus the `$facet` count produces, and the appending footer is [reports-list](../reports-list/design.md)'s to build. An earlier revision of this design justified the offset by claiming a cursor returns no total; that was simply wrong — the plate's own "of 8" comes from the count branch, which is independent of how pages are addressed. **Reversed by [reports-list](../reports-list/design.md):** a scope is low hundreds of reports at most, so `list-reports` now returns the whole scope with no `$skip`/`$limit` and the grid pages it client-side; the `$facet` count stays as the scope's `total`.

## Risks

- **The list endpoint carries the authorization boundary.** Scope, search, sort and paging all now happen server-side, which is correct, but it means a bug in the scope match is a confidentiality bug rather than a display bug. It needs tests per scope: "shared" excluding deleted, "deleted" being owner-only, and "favourites" excluding a report whose sharing was withdrawn — the last being the case where a scope match alone would leak.
- **`favourite_of` on the report doc** is a shared-document write per favourite. Fine at module scale, hot at hundreds of users per report; the join-collection swap is known but unbuilt.
- **Restore-to-private will occasionally annoy** someone who deliberately deleted a published report and wanted it back exactly as it was. Accepted: the failure mode in the other direction is republishing to the whole app without anyone re-reading the numbers.

## Non-goals

- **Per-user or per-team sharing, groups, share links, or request-access flows.** Two states, plus duplicate.
- **A purge / permanent delete.**
- **An archive state.**
- **Conversation ownership.** Conversations are already own-only and stay that way; their delete and `updated` field belong to [chat](../chat/design.md).
