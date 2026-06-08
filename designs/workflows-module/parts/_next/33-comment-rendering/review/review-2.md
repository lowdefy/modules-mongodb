# Review 2 — Post-Part-38 rebase: fold ordering, Part 40 collision, call-site threading

Verified the rebased design against the Part 38 code now on this branch. Much of it
checks out: `planEventDispatch.js` exists at `shared/phases/planners/` and already
writes no `metadata.comment` (its docblock defers to "Part 33's `foldCommentIntoEvent`",
`planEventDispatch.js:46-49`); the shallow `mergeEventOverrides` merge is indeed carried
over unchanged (`planEventDispatch.js:198`, `mergeEventOverrides.js:28-31`), so D7's
"this part adds the deep-merge" is correctly scoped; the timeline's `$ne: null`
display-key filter (`events-timeline.yaml:31`), the `description` projection
(`events-timeline.yaml:43-50`), the sanitize-at-render path (`EventsTimeline.js:285`),
the empty-description guard (`EventsTimeline.js:473`), the `reference_field` /
`reference_value` vars (`events-timeline.yaml:19-26`), and the comments card in
`simple-view.yaml:200-286` all match the design's claims. Part 38 task 19 keeps
`comment` on the emitted-Api wire for this part, as Background asserts. The findings
below are the gaps.

## Correctness

### 1. The fold must run after `renderEventDisplay`, not merely "after the merge" — or user comments get compiled as Nunjucks templates

> **Resolved (auto).** D4 and the planner Files-changed bullet now pin merge → render → fold explicitly, with the why (raw HTML must not pass the Nunjucks compile; throw/data-exposure paths named). Added the template-syntax-passthrough unit case (`{{ workflow.entity_id }}` + stray `{%` stored verbatim) to the helper's test list.

D4 and Files-changed bullet (3) pin the call site as "after the merge". But in
`planEventDispatch.js` the sequence is merge (`:196-203`) → **render** (`:206-209`):
`renderEventDisplay` walks the whole merged `display` tree and compiles **every string**
as a Nunjucks template (`renderTree.js:11-12` → `parseNunjucks.js:8-10`,
`nunjucksFunction(fileContent)`). Folding the comment between merge and render sends
raw user-typed HTML through the Nunjucks compiler: a comment containing `{{`, `{%`, or
`{#` either throws (failing the whole submit) or interpolates against the render
context — which carries the full `user`, `action`, and `workflow` docs
(`planEventDispatch.js:158-167`), a data-exposure path.

Background §line 19 already says the comment "is folded into the **rendered** display
with no read-time templating" — so the intent is post-render; D4 and the Files-changed
bullet just say it imprecisely, and an implementer following "after the merge" literally
lands the bug.

**Fix:** pin the ordering explicitly: `foldCommentIntoEvent` runs **after
`renderEventDisplay`**, on the rendered display (or the assembled `doc.display`,
`planEventDispatch.js:211-217`) — merge → render → fold. Add a unit case: a comment
whose HTML contains `{{ workflow.entity_id }}` and a stray `{%` is stored verbatim,
not interpolated and not throwing.

### 2. `comment` is never threaded to the planner — `planSubmit.js` is missing from Files-changed

> **Resolved (auto).** Files-changed now lists `phases/planSubmit.js` with the one-line threading (`comment: params.comment` at the step-7 call), and the planner bullet states the new `comment` signature parameter as change (1).

`planEventDispatch` has no `comment` parameter, and its caller `planSubmit.js:188-202`
builds the arg bag without one (`params` is in scope at `:41`). Files-changed names only
the planner, but landing the fold inside it requires (a) a new `comment` arg on
`planEventDispatch`'s signature and (b) `planSubmit.js` passing `params.comment` at the
step-7 call. This is the same shape as review-1 #2 (the omitted `handleSubmit.js`
threading), recurring one layer down post-rebuild.

**Fix:** add `planSubmit.js` to Files-changed with the one-line threading
(`comment: params.comment` at `planSubmit.js:188`), and state the planner's new
parameter in the planner bullet.

## Cross-part coordination

### 3. Part 40 carries the comments card forward into a shared surface component; this part deletes it — neither design references the other

> **Resolved.** Order pinned: 33 before 40 (added 33 to Part 40's deps in `implementation-plan.md`, both tables — codifies the existing schedule where 33 is "next" and 40 waits on 24/39). Part 40's design and tasks 03/04/05 amended throughout: carry over the events-timeline `_ref`, not the comments card. Modal question answered: the timeline lives inside the surface component's `view` mode, so the Drawer renders it identically to the pages — no page-only special case. Added Part 40 (ordering + carry-over note) and Part 42 (its D6 suppresses the self-referential action card) to this part's Depends-on.

[Part 40](../../../40-simple-action-surfaces/design.md) moves the view page's body —
**including the comments card and its `metadata.comment: { $exists }` query** — into a
new shared `components/simple-action-surface.yaml`, rendered by the three pages *and* a
`Drawer` modal (design `:48`, `:156`, `:171`; tasks
[03 `:32,:97`](../../../40-simple-action-surfaces/tasks/03-check-action-surface.md),
[04 `:10,:13,:19`](../../../40-simple-action-surfaces/tasks/04-rewrite-check-pages.md),
[05 `:9`](../../../40-simple-action-surfaces/tasks/05-check-action-modal.md) — "comments
card (carry over from `workflow-action-view.yaml`)"). This part deletes that card and
swaps in the events timeline. Neither design mentions the other on this point, and
`implementation-plan.md` (`:31`, `:37`) doesn't order Part 33 against Part 40 — 33 is
"next (after 38 task 15)", 40 "depends on 24, 39".

Consequences of leaving it unpinned:

- **40 first:** the card no longer lives in `workflow-action-view.yaml`; this part's
  Files-changed targets the wrong file — the swap happens inside
  `simple-action-surface.yaml`, and the **Drawer modal's `view` mode** (which Part 40
  explicitly says shows "status-history + comments") needs a decision: does it render
  the events timeline too, or is the timeline page-only?
- **33 first:** Part 40's design and tasks re-introduce a deleted card (the "carry over
  from `workflow-action-view.yaml`" instruction has nothing to carry).

**Fix:** pin the order in `implementation-plan.md`, amend the lagging design (likely
Part 40: "carry over the events-timeline `_ref`, not the comments card"), answer the
modal question explicitly, and add Part 40 to this part's Depends-on/relates-to. While
there, also back-reference [Part 42](../../../_completed/42-timeline-action-cards/design.md), which
already coordinates with this part from its side (D6 suppresses the self-referential
action card on the timeline this part adds — Part 42 `:122`, `:234`).

### 4. D3 says the fold is "called once inside `planEventDispatch`"; Files-changed and Contract-to-neighbours say Part 24's `planFieldsUpdate` calls it separately — pick one architecture

> **Resolved.** Architecture (a) chosen: the fold has exactly one call site, inside `planEventDispatch`. Part 24 extends the planner's closed enum with an `UpdateActionFields` handler type → `action-fields-updated` event type (+ `DEFAULT_TITLES` entry) and passes `comment` — no per-event-builder call, the event gets the planner's full pipeline (references, default title, render) for free. D3, Files-changed, Contract-to-neighbours, and the Depends-on Part 24 entry aligned here; Part 24's design amended directly (`:110`, `:144`, `:195`, open question `:264`) off `metadata.comment` onto the planner route, including the new `planEventDispatch` amend bullet in its Files-changed.

D3: the helper "is called once inside the shared event-dispatch planner
(`planEventDispatch`) that both the submit and `UpdateActionFields` paths reuse, so the
two cannot drift." Files-changed §`UpdateActionFields` and Contract-to-neighbours: "Part
24's `planFieldsUpdate` event builder calls `foldCommentIntoEvent` on its
`action-fields-updated` payload." These are different architectures — one call site
inside the shared planner vs. one per event builder — and the design asserts both.

The code sharpens the choice: `planEventDispatch` is a **closed enum** over handler
types and derives its event types internally (`planEventDispatch.js:55-56`, throws on
unknown `handlerType` at `:149-153`); `action-fields-updated` is not producible today.
Meanwhile [Part 24](../../24-universal-fields/design.md) itself is split the same way —
its `:139` says the handler reuses `planEventDispatch`, its `:142` says `planFieldsUpdate`
builds the event payload itself — **and `:142` still writes "`metadata.comment` from
payload"**, which this part's D2 abolishes.

**Fix:** pick one: (a) fold inside `planEventDispatch`; Part 24 adds an
`UpdateActionFields` handler type + `action-fields-updated` event type to the planner
and passes `comment` — no separate call; or (b) the helper is the contract with two
call sites — then rewrite D3's "called once inside the planner" claim. Either way, add
"amend Part 24 design `:142` (`metadata.comment` → `foldCommentIntoEvent` /
`display.{app}.description`)" to the Part 24 entry in Depends-on, so the stale write
instruction doesn't ship.

## Minor

### 5. Files-changed plugin path header is wrong

> **Resolved (auto).** Header corrected to `src/connections/shared/`; helper pinned to `phases/planners/foldCommentIntoEvent.js`, beside `deepMerge.js` and its caller `planEventDispatch.js`.

The header reads "Plugin —
`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`", but the event-dispatch
planner lives at `src/connections/shared/phases/planners/planEventDispatch.js` — under
`connections/shared/`, a sibling of `WorkflowAPI/`, not inside it. The new helper's
stated home `shared/foldCommentIntoEvent.js` (relative to that header,
`WorkflowAPI/shared/`) doesn't exist as a directory. Natural home:
`connections/shared/phases/planners/` (beside `deepMerge.js`) or `connections/shared/`.
Fix the header and pin the helper's path.

### 6. Render-context variable names are wrong in D1/D7

> **Resolved (auto).** D1 now quotes the actual default title (`{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}`); D7 lists the real context keys (`user`, `action`, `workflow`, `signal`, `status_before`, `status_after`, `submitted_form`) with the smaller lifecycle context noted. Also fixed `submit-pipeline/spec.md`'s default-shape block, which still showed the `_nunjucks`-operator form with `action_type` — now the plain rendered template string with a context comment.

D7 says author overrides render "against the event render context (`user`,
`action_type`, `status_after`, …)" and D1 quotes the engine title as
"`{{user}} marked {{action_type}} as {{status_after}}`". The actual context keys are
`user`, `action`, `workflow`, `signal`, `status_before`, `status_after`,
`submitted_form` (`planEventDispatch.js:158-175`), and the actual default title is
`{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}`
(`planEventDispatch.js:20-21`) — `action_type` is not a context var. Authors writing
per-app overrides from the design/spec would use names that render empty. Fix both,
and check `submit-pipeline/spec.md` documents the same context.

### 7. The deep-merge should reuse Part 38's `deepMerge.js`, not grow a bespoke two-level merge

> **Resolved (auto).** D7 and Files-changed now name the implementation: call Part 38's shared `deepMerge` on the `display` channel inside `mergeEventOverrides` (per "one correct way"). `mergeEventOverrides.js` added to Files-changed with the stale-docblock rewrite called out.

Part 38 already ships the uniform deep-merge rule as a shared planner helper
(`shared/phases/planners/deepMerge.js:1-17` — "shared by every planner that layers a
patch onto loaded state"). D7/Files-changed describe adding "deep-merge under the app
key" without naming an implementation; per "one correct way", the event-display merge
should call `deepMerge` on the `display` channel rather than hand-rolling a second
merge. While touching it, rewrite `mergeEventOverrides.js`'s docblock — it still
documents the pre-rebuild world ("metadata.comment already folded into layer 1 …
Do NOT re-inject `comment` here", `:6-15`), which becomes false twice over.

### 8. The form-kind view template has no comments card — resolve the "if/where" hedge and name an owner for the timeline-add

> **Resolved.** Hedge replaced with a definitive statement (no comment surface exists in any form template — verified, zero matches) and the work pulled into this part's scope, broadened per user direction: the action-filtered `events-timeline` `_ref` is added to **all four** form-kind templates (`edit`/`view`/`review`/`error`), not just `view`. Files-changed, D6, Proposed change, In scope, Verification, and Contract-to-neighbours updated; Part 16 follow-on language dropped (it's `_completed/`, read-only), with a coordination note that Part 39 amends the same templates additively.

Files-changed hedges: "Form action `view` template (Part 16) — same swap on the
form-kind view surface, **if/where a comments card exists there**." Verified:
`modules/workflows/templates/view.yaml.njk` contains no comment surface at all (zero
matches), so there is nothing to swap — but the gap D6 articulates ("deleting the card
without adding a timeline would leave the action's own view page with no comment
surface") applies in full to form actions: `review.yaml.njk:178` captures a review
comment, and the form view page would render it nowhere. "Handled as a Part 16
follow-on" names a completed part (`_completed/`, read-only per project rules) — no
active part owns the work. Per "resolve the open question": state definitively that no
card exists there, and either add the events-timeline `_ref` to `view.yaml.njk` in this
part's scope or scope it out explicitly with an owner.

### 9. The concept-spec amendments are already applied — mark them done or drop them

> **Resolved (auto).** Section rewritten as "Already applied" with the spec line references; engine/spec.md bullet dropped (nothing to remove there). The one residual found while verifying — the spec's stale `_nunjucks` default-shape block — was fixed directly (see #6).

`submit-pipeline/spec.md` already carries the full Part 33 content this design lists as
pending amendments: comment-folds-last into `display.{app_name}.description` (`:271`),
the app-keyed override channel and deep-merge-under-the-app-key rule (`:273`), and the
wire-contract annotations (`:58`, `:327`). `engine/spec.md` contains no
`metadata.comment` to remove (zero matches). The "Concept-spec amendments" section
should note these are applied (or trim the engine/spec.md bullet to whatever actually
remains), so an implementer doesn't hunt for spec edits that are already in the tree.
