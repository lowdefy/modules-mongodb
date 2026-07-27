# Review 1

The design's load-bearing claim is that the author-authored-link machinery for
`custom` is **already shipped** — that `computeEngineLinks` returning `{}`,
`validateStatusMapCells` permitting `link:`, and `substituteActionIdSentinel`
swapping the `{ action_id: true }` sentinel are live branches that step 1 merely
"activates," leaving the `custom: form` FSM alias as "the only genuinely-missing
engine piece" (design §Proposed change 2–3, §Links, §Related).

Verifying against source, **that premise is wrong in two places**. Both the
sentinel substitution and the link-surfacing path were built for Part 30's
_single-`link` cell_ model, which was rejected; the live read/render path was
rebuilt under Part 34 D7 around a _per-verb `links` map_, and the custom
single-link path was orphaned. As written, a `custom` action would transition
correctly through the FSM but its authored link would **never reach any card,
overview, or timeline**, and the `{ action_id: true }` sentinel would reach the
app page as the literal boolean `true`.

The findings below are ordered by severity.

## Correctness — the link path is unwired, not "already shipped"

### 1. The display layer reads per-verb `.links`; the custom cell writes singular `.link` — the authored link never surfaces

> **Resolved.** Confirmed against source. Adopted fix (a) with a refined cell schema: the author writes a single working `link:` plus an optional `view_link:` (not a per-verb map). `computeEngineLinks` stops returning `{}` for custom and routes the rendered cell links into the per-verb `links` map by stage — the working `link` into the stage's active verb slot (`edit`/`review`/`error`, or `view` at `done`), and `view_link` (else the shared `workflow-action-view` page) into the `view` slot. `collapseLink`'s existing priority then routes a working user to the app page and an observer to the view/status page; a viewer is never dropped onto the working page. Design rewritten: §Summary, §Proposed change 2–3, the kinds table, §What `custom` means, §Why a fourth kind, §Links (retitled "engine routes authored cell links"), §App-side shape, §What's still wired up, §What's deliberately not provided, Files-changed `computeEngineLinks` row, §Related. This also fixes #5 (verb slot now specified) and reframes #3 (the "already shipped"/"no code change" framing is gone).

This is the central defect. Every read surface collapses the link from the
**plural per-verb map** `action[slug].links`, not the singular cell `link`:

- `GetEntityWorkflows.js:96` — `collapseLink({ links: action[app_name]?.links, allowed })`
- `GetWorkflowOverview.js:68` — same
- `GetWorkflowActionGroupOverview.js:68` — same
- `GetEventsTimeline.js:278` — same

`collapseLink` (`shared/render/resolveActionAccess.js:76`) reads only
`links.edit / links.review / links.error / links.view` — it has no concept of a
singular `link`.

Now trace what `custom` actually writes. In `planActionTransition.js`:

- Line 238–244 renders the `status_map` cell onto the doc. For the design's
  example cell `{ "my-team-app": { message, link: { pageId, urlQuery } } }`, the
  rendered result deep-merges to `doc["my-team-app"].link` (**singular**).
- Line 247 calls `computeEngineLinks({ action: doc, entry_id })`, which returns
  `{}` for `kind: custom` (`computeEngineLinks.js:62`), so the loop at 248–250
  writes **nothing** to `doc["my-team-app"].links` (plural).

Result: the custom link lives at `doc[slug].link`; every display surface looks at
`doc[slug].links`; `collapseLink(undefined)` returns `null`. The card renders no
link. The design's §"What's still wired up automatically" → `workflow-overview`
bullet ("the custom action's card uses the action doc's rendered `link`") is false
against current code.

Note the asymmetry that makes this easy to miss: the **message** path _does_ work
— `GetEntityWorkflows.js:97` reads `action[app_name]?.message`, which is exactly
where the cell renders it. So a custom action's card would show its message but be
unclickable. A naïve demo could look "wired" while the defining feature is dead.

**Proposed fix.** Pick one and bake it into the design:

- **(a) Engine broadcasts the cell link into the per-verb map (recommended).**
  Change `computeEngineLinks` so `kind: custom` does _not_ return `{}` but instead
  reads the rendered `doc[slug].link`, applies the sentinel substitution (see #2),
  and writes it into the `links` map for the verbs the slug declares (or a defined
  priority slot). This keeps the per-verb `collapseLink` contract intact and gives
  one place that owns both wiring gaps. The cell stays single-`link` (authors don't
  hand-author a four-verb map).
- **(b) Author writes a per-verb `links:` map in the cell.** Aligns the cell shape
  with the display contract directly, but pushes verb semantics onto every author
  and contradicts the design's single-`link` examples.

Either way the design must stop describing this as "no code change."

### 2. `substituteActionIdSentinel` is never called — the `{ action_id: true }` sentinel is not substituted

> **Resolved.** Confirmed `substituteActionIdSentinel.js` is dead Part-30 code (no production caller; only its own def + test) and weaker than the live path — it handles `action_id` only, not `entity_id`. The live sentinel swap already lives inline in the tracker `start_link` arm of `computeEngineLinks` (`computeEngineLinks.js:94–100`, both sentinels, validated by `validateTrackerStartLink`). Resolution: extract that inline swap into one shared flat-`urlQuery` helper, call it from both the tracker arm and the new custom branch, and **delete `substituteActionIdSentinel.js` + its test**. One sentinel mechanism for every engine-routed link ("one correct way"). Rejected the Nunjucks-`{{ _id }}`-string alternative — it would introduce a second convention diverging from tracker `start_link`. Design updated: §Proposed change 3, §Links (new "Sentinel substitution — one shared mechanism" paragraph), Files-changed (computeEngineLinks row + new deletion row), §Related.

The design (§Proposed change 3, §Links, §Files-changed row 6, §Related) treats
`substituteActionIdSentinel` as shipped machinery that step 1 activates. It is
**dead code**: the only references in `src/` are its own definition and its own
unit test —

```
src/connections/shared/render/substituteActionIdSentinel.js   (def)
src/connections/shared/render/substituteActionIdSentinel.test.js (test)
```

— no production caller. The live render path is
`planActionTransition → renderStatusMap → renderTree` (`renderStatusMap.js:28`,
`renderTree.js`), which only runs Nunjucks over string leaves. `renderTree` treats
`true` as a non-string leaf and passes it through unchanged. So the design's
worked example —

```yaml
link:
  pageId: contract-review
  urlQuery: { action_id: true }
```

— renders to `urlQuery: { action_id: true }` verbatim, and the app page receives
`?action_id=true`. The action `_id` never reaches the URL.

**Proposed fix.** Wire `substituteActionIdSentinel` into the render path (cleanest
inside the fix for #1, where the engine already touches the custom link). The
design's claim that step 1 "activates" three dead _branches_ is inaccurate: #2 is
an entirely uncalled function, not a branch gated on the kind enum — adding
`"custom"` to `ACTION_KINDS` does nothing for it.

> Aside: an author could side-step the sentinel today by writing
> `urlQuery: { action_id: "{{ _id }}" }` (a Nunjucks string `renderTree` _does_
> resolve against the planned doc). If you adopt that as the convention instead of
> the sentinel, #2 collapses to a docs change — but then drop the sentinel
> references from the design and from `substituteActionIdSentinel`'s framing, and
> decide whether that dead file stays.

## Design completeness

### 3. "The only genuinely-missing engine piece" understates the work

> **Resolved.** Covered by the resolution to #1. The "already shipped" / "only genuinely-missing engine piece" / "no code change" framing is gone: §Proposed change now lists `computeEngineLinks` as a real code change, §Links is retitled "engine routes authored cell links" and describes the actual edit, the Files-changed `computeEngineLinks` row is marked **Code change**, and §Related re-scopes the work (FSM alias + custom routing + sentinel substitution + `validateAction` arm + `view_link` validation + specs/README). The `validateAction` form/tracker arm itself is tracked separately as #4.

§Proposed change 2 asserts the `custom: form` FSM alias (`fsm/tables.js:136–143`,
confirmed missing) is the sole missing engine piece. Given #1 and #2, the actual
engine work is: the FSM alias **plus** wiring the custom link into the per-verb
`links` map **plus** sentinel substitution **plus** the `validateAction`
form/tracker rejection branch (see #4). The "amend the shipped resolvers, the FSM
table, and the specs directly … small enough" framing in §Related under-scopes the
change. Recommend rewriting §Proposed change and §"What the kind means at each
layer" → Links to describe real code changes, and re-checking the §Files-changed
"No code change" rows for `computeEngineLinks` (row 6) — it needs a change under
fix (a).

### 4. `validateAction` has no `kind: custom` form/tracker rejection branch

> **Resolved (auto).** Confirmed `makeWorkflowsConfig.js:535` is `action.kind === "check" && (action.form || action.tracker)` with no custom arm. §Build-time validation now names the concrete edit: extend the guard to `(action.kind === "check" || action.kind === "custom") && (action.form || action.tracker)`. Files-changed row 1 already listed this as a code change, so no inconsistency remained — only the prose pointer was added.

The design states custom "rejects `form:` and `tracker:` … exactly as `check`
does" (§Proposed change 1, §Build-time validation). In `makeWorkflowsConfig.js`
the existing guards are kind-specific: line 535 is `kind === "check" && (form ||
tracker)`. There is **no** `custom` arm, so `kind: custom` with a stray `form:`
block would pass validation today once `custom` is added to `ACTION_KINDS`. The
§Files-changed table (row 1) does list this as a code change, so the design is
internally inconsistent rather than wrong — but the prose ("mirror the check
branch") should name the concrete edit: extend line 535's condition to
`(action.kind === "check" || action.kind === "custom")`.

### 5. A single cell `link` has no verb — define how it collapses

> **Resolved.** Covered by the resolution to #1. The collapse is now specified: the working `link` routes to the stage's single active working verb slot (`edit` at action-required/in-progress/changes-required, `review` at in-review, `error` at error, `view` at done), and `view_link` — or the shared `workflow-action-view` page as fallback — fills the `view` slot. A user holding the working verb collapses to the app page; an observer collapses to the view/status page and is never dropped onto the working page. This is documented in §Links and §What `custom` means.

`collapseLink` resolves by verb priority (`edit > review > error > view`). A custom
action declaring both `edit` and `view` access produces one cell `link` with no
verb identity. Fix (a) in #1 must specify which verb slot(s) the broadcast link
lands in, because that determines collapse behaviour when the user holds multiple
verbs and whether the link shows for a view-only user. The design currently says
nothing about this — it inherited the single-link mental model from rejected Part 30. Recommend: broadcast to every verb the slug declares (so any accessible verb
surfaces the same app page), and state that explicitly.

### 6. Open question 2 (cell-link shape validation) interacts with #1

> **Resolved.** Open question 2 removed; the lean is now baked into the design. `validateStatusMapCells` gains shape validation for both `link:` and `view_link:` (`{ pageId: non-empty string, urlQuery?: object }`, `action_id`/`entity_id` sentinel-only, other `urlQuery` values strings) — reusing `validateTrackerStartLink` (`makeWorkflowsConfig.js:361`), which already enforces this exact shape, rather than a parallel checker ("one correct way"). Because #2 keeps the sentinel convention, the validated shape matches what the engine consumes. Updated §Proposed change 3, §Build-time validation, the `validateStatusMapCells` Files-changed row (now "Code change"), and removed open question 2.

`validateStatusMapCells` (line 466) permits `link:` for custom but validates no
internal shape. The design's open question 2 leans toward adding a shallow shape
check mirroring `validateTrackerStartLink`. That lean is right and should be
**resolved, not deferred** (CLAUDE.md "resolve the open question") — but it must
validate the shape the engine _actually consumes_ after #1 is fixed. If fix (a)
broadcasts a single `link`, validate `{ pageId, urlQuery? }` with the
`action_id`/`entity_id` sentinel rule from `validateTrackerStartLink:361`
(reuse it — "one correct way"). If you go with (b)'s per-verb map, validate that
shape instead. Either way, don't ship validation that green-lights a cell shape no
surface reads.

### 7. Open question 1 (e2e spec) — fold the link assertion in

> **Resolved.** Went further than the finding: rather than just naming the acceptance criterion on a deferred open question, the e2e spec is promoted into this part's scope (per user direction) — in the `workflows-test` app, not `demo`. §Proposed change gains step 6 (a `custom-action` workflow config + app-owned page + `apps/workflows-test/e2e/workflows/custom-action.spec.js`); Files-changed gains the three new rows. The spec's load-bearing assertion is the click-through (rendered card link carries the concrete `_id`, not the `true` sentinel, and navigates to the app page — the assertion that catches the #1/#2 defect class), plus the observer-fallback assertion. Open question 1 removed (the Open questions section is now empty and dropped).

The §Open-questions e2e item should, when scoped, assert the _click-through_: that
the rendered card link carries the concrete `_id` (not `true`) and navigates to
the app page. That single assertion is what would have caught #1 and #2. Worth
naming as the acceptance criterion rather than leaving the spec open-ended.

## What checks out

- `FSM_TABLES` lacks `custom` and `resolveSignal.js:28` returns `null` on an
  unknown table → a custom submit would no-op/throw without the alias. Step 2 is
  correct and necessary.
- `makeActionPages.js`'s `emitForAction` guard `if (action.kind !== "form")
return []` (line ~55) correctly excludes custom — no per-action pages. §Page
  emission is accurate.
- `makeWorkflowApis.js` skips only `kind: tracker` (line 321) and carries each
  action's `status_map` into `render_config` (lines 69–70). Custom is submittable
  and rides `{type}-submit` / `{type}-update-fields` as the design states.
- `validateStatusMapCells`'s `isCustom` branch (line 434, 466) does permit `link:`
  and is currently unreachable behind the unknown-kind check — accurate.
- The §"Why a fourth kind" rationale and the rejection of `check.author_links`
  hold up; `kind` is the discriminator the resolvers switch on.
- The Part 48 re-alignment (§Build-time validation decision note) is correct:
  `hooks:`/`event:` ride the per-workflow endpoint for every submittable kind
  (`validateHooks`/`validateEvent` are kind-agnostic except the tracker mirror-
  signal arm), so accepting them for custom needs no special-casing.
