# Review 3 — Design + tasks vs. Part 33's comment contract, Part 38's shipped helpers, and the in-tree bindings

This review covers the current design.md **and the new `tasks/` folder** (12 tasks + tasks.md). The tasks are
strong — they correctly resolve several things review-2 left open (`commitPlan` workflow-less plans → task 3,
closed-workflow editability → task 2, the verb-gate reality → tasks 2/5) and the code verification behind them
checks out almost everywhere. The dominant problems are (a) one real contract contradiction with Part 33 that
runs through five task files and the design, and (b) the design.md lagging the tasks on facts the tasks already
settled — per CLAUDE.md, designs are the source of truth, so those corrections must land in design.md, not live
only in `tasks/tasks.md` "Notable decisions".

**Verified sound (no action):** the kind-guard baseline exists exactly as task 6 assumes
(`planActionTransition.js:165,173` spreads `...payload.fields` verbatim on both paths; the JSDoc forward-reference
"Part 24 layers a kind-based rule later" is at line 55); Part 39's design now does drop `fields` and narrow the
Validate regex (`39-form-submit-buttons/design.md:232-235` — review-2 #1's resolution holds); Part 35's rename
landed (`ACTION_KINDS = ['form', 'simple', 'tracker']`, pages renamed `simple-*`); `planChangeLog.js:86` tolerates
a null workflow entry exactly as task 3 claims; the load-gate-ahead-of-side-effects invariant task 2 preserves is
documented in `loadWorkflowState.js:43-46`; `_var`-inside-`_build.string.concat` endpoint-id composition has
in-tree precedent (`templates/edit.yaml.njk:242-261`); `TiptapInput` / `DateSelector` exist and are the blocks the
templates already use; the stub + all six call sites match task 10/11's description.

## Contract contradictions

### 1. `event.metadata.comment` contradicts Part 33 D2 — which says Part 24 was already amended off it

> **Resolved (auto).** Half of this was already fixed when actioning began: design.md (mtime between the tasks and this review) had been amended off `metadata.comment` onto the planner route — its lines 110/144 and the open question all read "no `metadata.comment`", so the reviewer's design.md citations were against a stale snapshot. The five task files were still on the old contract and have been swept: task 1's `buildMetadata` shape is `{ action_type, workflow_type, current_key }` (no `comment` key), its tests assert the key's absence, and its note now cites Part 33 D2/D3 as the contract; tasks 4/5/8/12 reworded onto "comment rides the planner's `comment` param; rendering owned by Part 33 (`display.{app_name}.description`)". The planner `comment` param is kept exactly as Part 33's contract prescribes (flows un-folded if Part 24 lands first).

Part 33 (`33-comment-rendering/design.md`) pins the comment contract both write paths share:

- D2 (`:8`, `:28-33`): "**`metadata.comment` is dropped.** The comment … carries it once, in
  `display.{app_name}.description`."
- D3 (`:37-44`): one pure helper `foldCommentIntoEvent`, **one call site inside `planEventDispatch`** — "Part 24
  extends it with an `UpdateActionFields` handler type … and passes `comment` through the same parameter the
  submit path uses — there is **no** separate per-event-builder call."
- `:132` / `:141`: Part 24's "plan/payload prose **has been amended** off `metadata.comment` onto the planner
  route" and "if Part 24 lands first, its handler type carries `comment` un-folded until this part adds the fold."

That amendment never landed. Part 24 still writes `metadata.comment` in six places:

- `design.md:110` — endpoint comment payload "handler maps to `event.metadata.comment`".
- `design.md:144` — planner builds the event with "`metadata.comment` from payload".
- `design.md:264` — open question restates the mapping.
- **Task 1** — instructs `buildMetadata` to carry `{ …, comment }` and the note doubles down: "Confine
  `metadata.comment` strictly to the `UpdateActionFields` handler type". This contradicts the same note's own
  citation of Part 33 as the reason the submit path writes no `metadata.comment` — the shipped planner says so
  explicitly (`planEventDispatch.js:46-49`, `:226`: "No `metadata.comment` … superseded by Part 33's
  `foldCommentIntoEvent`"). Part 33's D2 rationale (one storage location, no shadow) applies to the fields event
  identically; there is no consumer of `metadata.comment` on this event.
- **Tasks 4 (step 3 + tests), 5 (tests), 8 (payload annotation), 12 (engine-spec capabilities bullet)** — all
  assert `metadata.comment`.

**Fix:** keep task 1's `comment` **parameter** on `planEventDispatch` (that part is exactly Part 33's contract)
but drop the metadata key: the fields-updated `buildMetadata` shape becomes `{ action_type, workflow_type,
current_key }`. Per Part 33 `:141`, landing order is then free — the comment rides the planner param un-rendered
until Part 33's fold lands. Sweep the five task files + three design.md lines; task 12's capabilities bullet
should describe the comment as "routed through the planner's `comment` param; rendering owned by Part 33
(`display.{app_name}.description`)", not as event metadata. Also coordinate: Part 33's design is concurrently
modified on this branch — whichever lands second must not reintroduce the key.

### 2. Design still claims pure reuse of Part 38's helpers; tasks 1–3 amend four shared files the design doesn't own

> **Resolved (auto).** design.md now reads "reuses **and minimally amends**" with a one-line summary of each amendment, the Load/Commit bullets name the new load mode and the workflow-less commit explicitly, and the Files-changed plugin section is restructured under `src/connections/` (the `shared/` tree sits beside `WorkflowAPI/`, not inside it — a path error the original list carried) adding `loadWorkflowState.js` (third `{ actionId, verb }` mode), `commitPlan.js` (action-only plans, no CAS), and `types.js` (nullable `Plan.workflow`). Review-2 #4 annotated. (Note: `planEventDispatch.js` was already in the file list when actioning began — only the other three were missing.)

`design.md:141` says the handler "reuses Part 38's helpers — `loadWorkflowState` / `commitPlan` …
`planEventDispatch`", and the "Files changed (owned by this part)" list names only `planFieldsUpdate.js` (new),
`planActionTransition.js` (amend), the handler, and the connection registration. But none of the three helpers
supports this operation as shipped:

- `loadWorkflowState.js:70-74` — two modes only, discriminated by `actionId`/`signal`; submit mode hard-runs the
  stage check (`:148-157`) and `SIGNAL_VERBS`. Task 2's third `{ actionId, verb }` mode is a real amendment.
- `commitPlan.js:63` — `commitWorkflowAndActions` destructures `plan.workflow` unconditionally;
  `buildCommitResult` reads `plan.workflow.doc._id` (`:155-161`). A `workflow: null` plan throws today. Task 3
  amends both plus the `Plan` typedef (`shared/phases/types.js`).
- `planEventDispatch.js:112-154` — a closed handler-type enum (Part 33 `:44` confirms it throws on unknown), so
  the `UpdateActionFields` type is an amendment, not reuse (task 1).

This is review-2 #4 made concrete: the tasks resolved it by amending `commitPlan`, but design.md was never
updated. **Fix:** add `planEventDispatch.js`, `loadWorkflowState.js`, `commitPlan.js`, and `types.js` to "Files
changed", and reword "reuses Part 38's helpers" to "reuses and minimally amends" with one line each (new handler
type; third load mode; nullable-workflow plan). Annotate review-2 #4 resolved.

### 3. The access-gate prose and component snippets are stale against the shipped Part 34 / Part 18 shapes

> **Resolved (auto).** design.md reworded to the shipped model: the load gate is the per-app **`edit`** verb (`access.{app_name}.edit` via `gateAllows`, Part 34 — action-wide `access.roles` removed by Part 34 D4); the component gates on `_state.action_allowed.edit` (per-verb map from `action_role_check`, Part 18) — button snippet and Verification line fixed. The consequence is now stated under "Role gating": metadata updates require the `edit` verb; a review-only role cannot update universal fields from any surface (v1 stance).

- `design.md:143` — "role check (`access.roles` ⊇ user roles), identical to `SubmitWorkflowAction`". Action-wide
  `access.roles` no longer exists; the build hard-errors on it (`makeWorkflowsConfig.js:150-154`, "removed
  (Part 34 D4)"). The shipped model is per-app per-verb `access.{app_name}.{view|edit|review|error}` via
  `gateAllows`; tasks 2/5 correctly gate on the **`edit`** verb.
- `design.md:122` — `visible: { _eq: [{ _state: action_allowed }, true] }` and `:151` "reads
  `_state.action_allowed`". `action_allowed` is a per-verb map (`components/action_role_check.yaml:39-44`); the
  gate is `action_allowed.edit` (task 10 has it right).

These corrections currently live only in `tasks/tasks.md` "Notable decisions" — fold them into design.md. While
there, state the consequence explicitly: **metadata updates require the `edit` verb.** The placement table's
"Reviewers who need to change metadata use the `edit` page sidebar" silently assumes reviewers also hold `edit`;
a review-only role cannot update fields from anywhere. That's a fine v1 stance, but it should be one sentence in
"Role gating", not an inference.

### 4. Design omits the binding prerequisites task 9 ships — including a cross-module amendment to user-account

> **Resolved (auto).** The "Module-shipped requests added: None" section is now "none added, one amended", documenting the additive `get_action` `assignee_docs` `$lookup` and the cross-module `user-multi-selector` `id`/`title` vars (with Part 24a's "Part 24 binds `_state.fields.assignees`" anticipation cited); both files added to Files changed. The string-`_id` verification (re-verified against `invite-user.yaml` `_uuid: true` / `create-profile.yaml` `_user: id`) is recorded in task 9's notes and in the design section.

`design.md:181` says "Module-shipped requests added: **None**", and "Files changed" contains no
`modules/workflows/requests/get_action.yaml` or `modules/user-account/**` entries. But the design's own display
rule (`:174` — one `user-avatar` per assignee) is unimplementable from the action doc alone: `assignees` is an id
array and `user-avatar` consumes a doc (`user-avatar.yaml:11,25`). Task 9 closes the gap with (a) a `$lookup` →
`assignee_docs` on the shared `get_action` request and (b) an `id` + `title` var on user-account's
`user-multi-selector` (Part 24a shipped it hardcoded; its design explicitly anticipates "Part 24 binds
`_state.fields.assignees`"). Both are right — but (b) especially is a cross-module contract change and must
appear in design.md's file list, not only in a task.

One open question task 9 left implicit is settled here so it doesn't resurface at code time: **user-contacts
`_id` is a string** (`_uuid: true` on the invite upsert — `user-admin/api/invite-user.yaml:25-27`; `_user: id` on
`user-account/api/create-profile.yaml:21-23`), so selector values round-trip the client as strings and the
`$lookup` on `_id` is type-safe. Record that in task 9's notes.

### 5. `get_action` returns an array — the simple pages' display bindings are broken today, and the design's display example replicates the broken shape

> **Resolved.** Pinned `get_action.0.*` (user decision). Design: the display-mode bullet, the kind×mode table row, and the example all carry the `.0.` index (the example also gains the `assignee_docs` leaf); the binding bullet explains why bare `get_action.*` resolves `undefined` and notes the `_state: action.*` alternative on pages that already prime from `get_action.0`. Task 11 step 2's deferred "sanity-check" is now a directive: fix the simple pages' un-indexed reads to `.0.`, minimally — Part 40's rewrite replaces these pages with its `surface.*` namespace, so no SetState restructure here. Task 10's references updated to the same shape. Coordination note: Part 40's task 4 currently primes `surface.action ← _request: get_action` ("the full action doc") — that carries the same array bug and needs `get_action.0` on its side; flagged to the user (Part 40 is a concurrently-active design, not edited from here).

`get_action.yaml` is a `MongoDBAggregation` (`$match` only) → the response is an **array**. The form templates
handle this (`view.yaml.njk:63-66` — `SetState action: { _request: get_action.0 }`), but `simple-view.yaml:126-131`
and `simple-review.yaml` bind `action_data` to `_request: get_action.assignees` — which resolves `undefined` on an
array. The design's own display-mode example (`design.md:76-78`) and prose (`:59` "reads `get_action.*`") carry
the same shape.

Task 11 step 2 notices the discrepancy but defers it ("fix the binding to whichever shape the request actually
returns"). The answer is determinable now — per CLAUDE.md, resolve it rather than punting: the bindings must be
`get_action.0.*` (or the simple pages adopt the templates' SetState pattern). Fix the design example, pin the
shape in task 11, and make task 10's `assignee_docs` leaf + post-update refetch use the same shape.

## Process

### 6. Review-2 findings #4, #6, #8, #9 were actioned but never annotated — and tasks.md says the reviews were skipped

> **Resolved (auto).** Review-2 annotated: #4 Resolved (task 3 + the design file-list catch-up from #2 here), #6 Resolved (task 1: planner stamps the type + `DEFAULT_TITLES`; icon/colour stays app-wired), #8 Resolved (task 2's sentence; lifted into design.md's Lifecycle paragraph), #9 Rejected — premise removed (no `metadata.comment` anywhere, per #1 here). tasks.md's "reviews skipped" line left as an accurate historical record of how the tasks were generated.

`tasks/tasks.md:50` records "Review files skipped: `review/review-1.md`, `review-2.md`", yet four unannotated
review-2 findings are in fact resolved by the tasks:

- **#4** (`commitPlan` workflow-less) → task 3 (see finding 2 — design.md still needs the file-list update).
- **#6** (`action-fields-updated` display plumbing) → task 1: the planner stamps the type directly and ships a
  `DEFAULT_TITLES` entry rendered into the event at plan time, so the timeline shows a real title; icon/colour
  posture matches the unregistered lifecycle event types (demo `event_types.yaml` registers only `create-lead` /
  `start-onboarding` — "apps wire what they want", Part 38's stated stance).
- **#8** (metadata editable on a closed workflow) → task 2 states it explicitly ("a fields update on a
  `completed` workflow's action is legal regardless of `required_after_close`"). Lift that sentence into
  design.md's "Lifecycle" (`:153` currently speaks only to the action's stage, not the workflow's lifecycle).
- **#9** (comment → event anchoring) → superseded by finding 1 above.

Add the resolution annotations to review-2 so the next reviewer doesn't re-verify them.

## Smaller things

### 7. Registration file is `WorkflowAPI/WorkflowAPI.js`, not `WorkflowAPI/index.js`

> **Resolved (auto).** Verified (`WorkflowAPI/` contains `WorkflowAPI.js`, no `index.js`); design.md's "Connection registration" paragraph and the Files-changed entry now name `WorkflowAPI/WorkflowAPI.js` (the connection's `requests` map, from which `src/types.js` derives the request-type list).

`design.md:147` and the file list (`:198`) name `WorkflowAPI/index.js`. The requests map lives in
`WorkflowAPI/WorkflowAPI.js:9-14` (task 5's note already says so). Fix the design.

### 8. `_build.array.includes` exists — remove task 10's hedge

> **Resolved (auto).** Re-verified in the Lowdefy source (`operators-js/src/operators/shared/array.js:60` — `includes` with named args `on`/`value`, shared → build-time capable). Task 10's hedge replaced with the pinned operator and the source citation.

Task 10's note punts: "If `_build.array.includes` doesn't exist … check the operators guide before improvising."
Verified in the Lowdefy source: `includes` is a shared array operator
(`operators-js/src/operators/shared/array.js:60`), and the `_build.` prefix evaluates shared operators at build
time. Pin `_build.array.includes` for the `show` membership gating and delete the hedge.

## Summary

| # | Severity | Finding |
|---|----------|---------|
| 1 | High | `event.metadata.comment` contradicts Part 33 D2 (which claims Part 24 was already amended off it); runs through design.md + tasks 1/4/5/8/12. Keep the planner `comment` param, drop the metadata key. |
| 2 | Moderate | Design claims pure reuse of Part 38 helpers; tasks 1–3 amend `planEventDispatch` / `loadWorkflowState` / `commitPlan` / `types.js` — add to "Files changed", annotate review-2 #4. |
| 3 | Moderate | `access.roles` wording and bare-boolean `action_allowed` snippets are stale vs Part 34/18; fold the tasks' corrections into design.md and state the edit-verb requirement explicitly. |
| 4 | Moderate | Task 9's `get_action` `$lookup` + user-account selector vars are design surface design.md doesn't own; also record the (now settled) string `_id` verification. |
| 5 | Moderate | `get_action` returns an array — simple-page bindings and the design's display example read `get_action.*` and resolve undefined; pin `.0.` now instead of task 11's deferred "sanity-check". |
| 6 | Process | Review-2 #4/#6/#8/#9 actioned but unannotated; tasks.md says reviews were skipped. |
| 7 | Minor | `WorkflowAPI/index.js` → `WorkflowAPI/WorkflowAPI.js` in design.md. |
| 8 | Minor | `_build.array.includes` verified to exist — remove task 10's hedge. |
