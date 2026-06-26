# Review 6 — Render contract gaps and stale cross-references

Spot-checks review-5's three resolutions against the surrounding handler code and the open Part 32 / Part 13 dependencies they assume. The review-5 resolutions themselves hold (entry_id wiring, helper-side post-write workflow, tracker.child_workflow_type rename) — what's loose is the render contract around them: a third event-display channel D14 doesn't name, a workflow staleness window step 6 still opens after the recompute fix, and a couple of cross-design references that no longer point at anything actionable.

## Render contract holes

### 1. D14 doesn't address the YAML `event_overrides` channel

> **Resolved.** Extended D14 to name the YAML `params.event_overrides[interaction].display.{app}.{field}` channel as a third source layer alongside engine defaults and pre-hook returns; all three are plain Nunjucks template strings. Updated the Proposed change item 9 enumeration to match. Added a "Why the YAML channel matters specifically" paragraph explaining the operator-pass pre-render path that makes `_nunjucks: { template, on }` silently wrong on the engine path (verbs and engine bindings resolve against page-side state, not engine context). Enforcement is by documentation + Lowdefy's operator-pass behaviour — no special `renderTree` handling (see #4's rejection). Updated Task 15 to require the README to document the event-display authoring contract — plain strings, list of bindings, explicit contrast with the `_nunjucks: { template, on }` idiom — with matching acceptance criterion. Added a Task 14 test case asserting the YAML-layer plain-string source renders against engine context, matching the existing pre-hook-layer case.

D14 ([design.md:280-308](../design.md)) names two event-display source layers — "engine-default templates and pre-hook `event_overrides.display.{app}.title`" — and commits both to plain Nunjucks template strings. The merged payload assembled in [`handleSubmit.js:328-332`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) has three sources:

```js
const mergedEventPayload = mergeEventOverrides({
  defaultPayload: defaultEventPayload,
  yamlOverride: params.event_overrides?.[params.interaction], // ← third channel, unnamed in D14
  preHookOverride: preHookResponse?.event_overrides,
});
```

`params.event_overrides` is the YAML layer baked into the per-action submit endpoint's `properties`. Lowdefy's operator pass walks `properties` and resolves any registered operator it encounters before the handler runs — see [Part 32 review-1 finding #3](../../../_completed/32-drop-static-overrides/review/review-1.md), confirmed against [`evaluateOperators.js:50-220`](../../../../../lowdefy/packages/operators/src/evaluateOperators.js). Concrete consequences for the engine render path:

- A YAML author who writes `display.demo.title: "{{ user.profile.name }} ..."` (plain string) ships an unrendered Nunjucks template through to the engine — `renderEventDisplay` resolves it against the new engine context. Good.
- A YAML author who writes `display.demo.title: { _nunjucks: { template: "...", on: { user: true, action_type: true } } }` (the old idiom in use across modules-mongodb apps today — see [`contacts/api/create-contact.yaml`](../../../../modules/contacts/api/create-contact.yaml) for the pattern) gets it pre-rendered by Lowdefy's operator pass against the **page-side** context, yielding a string with the action verb missing (no `action_type` in page state) and the user's name resolved from page context. The engine then renders that already-rendered string against engine context — usually a no-op, but silently wrong.

The design's contract is silent on which shape the YAML channel must use. D14's "plain Nunjucks template strings, no `_nunjucks: { template, on }` wrapping" rule needs to extend to `params.event_overrides`, with a doc note that this is a behaviour change from the cross-repo `event_display` idiom (which assumes operator-wrap because the Lowdefy YAML CallApi caller wires the template's `on:` bindings at runtime).

**Fix:** D14 picks up a third bullet — "YAML `event_overrides[interaction].display.{app}.{field}` is also a plain Nunjucks template string; `_nunjucks: { template, on }` wrapping is rejected (or no-ops by accident — document which)." `modules/workflows/README.md` (Task 15) documents the shape for app authors. Test plan adds a YAML-layer assertion under `dispatchLogEvent.test.js`. Optionally `mergeEventOverrides` or `renderEventDisplay` throws on an operator-literal at a leaf slot to make the contract enforceable instead of advisory (see finding #4).

### 2. `context.workflow` refresh misses step-6's `form_data` write

> **Resolved.** Added a fourth `handleSubmit.js` edit to both design.md and Task 8: inside the step-6 `if (Object.keys(formMerged).length > 0)` block, mirror the form_data write into `context.workflow` in memory (alongside the Mongo `$set`) so step 7's event-display render sees post-write `workflow.form_data`. Kept inline rather than extracted to a helper (single caller, single shape — extract if a second caller emerges, per CLAUDE.md "Build for what exists, not what might"). The `updated` stamp is mirrored too. Added two test cases in Task 8: one for the no-`current_key` path, one for the `current_key` path. D14's `workflow.form_data` binding stays as documented.

Task 8 step 3 (and design.md handleSubmit edit 3) reassigns `context.workflow = recomputeResult.workflow` immediately after the step-5 recompute. With the helper-side fix from review-5 #1, that workflow object carries fresh `summary` / `groups` / `updated` / optional `completed` status. But the very next block is step 6 ([`handleSubmit.js:298-312`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)):

```js
const setOps = { updated: context.changeStamp };
for (const [field, value] of Object.entries(formMerged)) {
  setOps[`${formDataPathPrefix}.${field}`] = value;
}
await context.mongoDBConnection("workflows").MongoDBUpdateOne({
  filter: { _id: context.workflow._id },
  update: { $set: setOps },
});
```

That write lands `form_data.{action.type}[.current_key].{field}` on the workflow doc in Mongo, but doesn't touch `context.workflow` in memory. Step 7's `dispatchLogEvent` (line 334) then renders against `context.workflow`. D14's `workflow` binding exposes `form_data` ([design.md:300](../design.md)) — an event template referencing `"{{ workflow.form_data.install-step.physical_id }}"` resolves against pre-submit state and reads `undefined` / empty.

Three concrete patterns this breaks:

- Engine-default detail templates (or a future addition) that quote a submitted form field.
- App-authored YAML / pre-hook event-display templates that reach into `workflow.form_data.*` to summarise what just landed.
- Notification templates downstream of the event (Part 8 / events module) that read the same `display.{app}` block.

**Fix:** in step 6's mutation, mirror the write in memory before step 7 runs. The mechanic is one line at the top of step 6 alongside `setOps`:

```js
context.workflow = {
  ...context.workflow,
  form_data: mergeFormDataInto(
    context.workflow.form_data,
    formDataPathPrefix,
    formMerged,
  ),
  updated: context.changeStamp,
};
```

(or pull a single helper that produces both the `$set` map and the in-memory object — one composition, two consumers, matches the recompute-helper pattern review-5 #1 already established). The `handleSubmit.js` Modified bullet picks up this edit; Task 8 documents it as edit 4 in step 3 of the task or moves the reassignment to a "refresh `context.workflow` from all writes before step 7" rule. Either spelling closes the staleness window.

If keeping `workflow.form_data` post-write-fresh is genuinely out of scope, the alternative is to **remove `form_data` from D14's `workflow` binding list** and direct authors at `params.form` (or a new `submitted_form` binding) — but that pushes the cost to every author who wants to quote a just-submitted field, so the in-memory mirror is the lower-cost answer.

### 3. `kind: form` page-ID convention isn't verified against Part 13's resolver

> **Resolved.** Convention is verified — by [Part 12 (`makeActionPages`)](../../../_completed/12-resolver-pages/design.md), not Part 13. Part 12 design.md:25-26 commits to emitting `{workflow_type}-{action_type}-{verb}` for `verb ∈ [edit, view, review, error]`, which matches D4's table exactly once build-scoping prepends `${entryId}/`. Added the file:line citation to D4 (after the per-kind URL table) and a note that verb-gating is per-app (`access.{vars.app_name}`), so engine-computed `link.pageId` for a verb the host didn't emit will dead-link — same rule as today, caller responsibility. (Review's pointer to Part 15 is misdirected: Part 15 emits the form body, not page IDs.) Test coverage for the form convention falls out of `computeEngineLinks.test.js`'s existing kind-form assertions.

D4 ([design.md:88-91](../design.md)) commits the engine to compose:

| Kind   | `pageId`                                                          |
| ------ | ----------------------------------------------------------------- |
| `form` | `${entryId}/${actionDoc.workflow_type}-${actionDoc.type}-${verb}` |

and remarks "kind: form uses the same stage × verbs shape against form-emitted page IDs from Part 13" ([design.md:83](../design.md)). The convention is asserted, not verified — Part 13 (resolver-apis) isn't in `_completed/` yet, and the form-page emission lives in Part 15 ([`_completed/15-resolver-form-builder/design.md`](../../../_completed/15-resolver-form-builder/design.md)). The worked example in this part uses `kind: task` so a `kind: form` link is never exercised by Part 30's test plan.

If Part 15's emitted page IDs don't match `${workflow_type}-${action_type}-{verb}` exactly — e.g. they're `form-${workflow_type}-${action_type}` (no per-verb variant), or scoped differently to handle keyed actions, or use a separator other than `-` — every engine-written form-kind link is dead on arrival. The CLAUDE.md "Resolve the open question; don't defer it" rule applies: read [`makeWorkflowApis.js`](../../../../modules/workflows/resolvers/makeWorkflowApis.js) / the Part 15 form-builder resolver and bake the verified emission convention into D4 with a file:line citation.

If the convention turns out to be `<entryId>/${workflow_type}-${action_type}-edit` with no `view` / `review` variants emitted, D4's task/form verb table doesn't apply to forms at all and the form row collapses to "always `${entryId}/${workflow_type}-${action_type}` regardless of verb" — which then changes the test plan and the validator's verb-vs-kind rules.

**Fix:** one paragraph under D4 quoting the Part 13/15 emission rule with a file:line ref, and a `computeEngineLinks.test.js` case that uses a `kind: form` action whose expected pageId is constructed using the verified convention. If forms don't have per-verb pages, the form row in D4's per-kind URL table simplifies and a follow-up task to align Part 15 / Part 13 is logged.

## Looser ends

### 4. `renderTree` behaviour on operator-shaped literals is undefined

> **Rejected.** No consumers exist today, so there's no migration tolerance to engineer — the walker doesn't need a guard against a case that can't reach it in practice. Lowdefy's `evaluateOperators` pre-handler pass evaluates every registered operator in API `properties` before the handler runs, so the engine path only ever receives strings at leaf positions; an operator-literal can't reach `renderTree` via the YAML or pre-hook channels in normal use. The walker's existing shape (string → `parseNunjucks`, array/object → recurse, else passthrough) is already correct and matches what reaches it. Adding `_nunjucks`-key detection or unwrap logic would be speculative scaffolding for a migration scenario that doesn't apply (CLAUDE.md "Build for what exists, not what might"). Updated D14's "Why the YAML channel matters specifically" paragraph to drop the forward reference to a renderTree enforcement mechanism and state that enforcement is by documentation + the operator-pass behaviour. If a real consumer later writes `_nunjucks` literals into the engine pipeline through some bypass path, the walker produces structurally weird output and `EventsTimeline.sanitize` shows the failure — fix the bypass, not the walker. Annotation-only on the review; no code change to D13.

D13 ([design.md:262-275](../design.md)) defines the walker as: string → `parseNunjucks`, array → map, object → recurse on entries, else passthrough. With the YAML channel still in play (finding #1), an operator-literal `_nunjucks: { template: "...", on: { ... } }` that slips through (legacy YAML override, a pre-hook that returns the wrong shape, a future caller that wasn't migrated) lands as an object. The walker recurses into the operator key, runs Nunjucks on `template` (success — it's a string), leaves the `on` field untouched, and produces `{ _nunjucks: { template: "rendered string", on: { ... } } }` at the slot. [`EventsTimeline.js:225`](../../../../plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js)'s `sanitize(title)` receives an object and renders empty / `[object Object]` — silent failure, no engine-side error.

**Fix:** one of (a) detect `_nunjucks` keys in `renderTree` and throw with a pointer at the migration ("Engine path requires plain Nunjucks template strings — see design.md D14"); (b) detect and unwrap (treat the rendered template as the slot value, drop the wrapper); or (c) leave behaviour as-is and rely on docs + tests to catch it before merge. (a) is the strongest — closes the silent-failure mode and surfaces the bug at the writer not the reader. The `renderTree.test.js` case from Task 1 picks up a "throws on `_nunjucks` literal at a leaf" assertion. Doc note in D13.

### 5. Stale Part 32 cross-references

> **Resolved.** Dropped the "Cross-reference Part 32" callout from D14 (the five-line block at design.md lines 319-324: the "\_nunjucks evaluation — equivalence verified" callback, the two-bullet "edits Part 32 needs", and the "Land Part 30 before Part 32" ordering line) and rewrote the Related-section entry (line 697) to describe Part 32 accurately ("narrowed status overrides to the pre-hook channel") as an adjacent topic with no shared edits. Part 32 is shipped; the follow-on edits the original cross-reference cited came from Part 32 review-1 thread content, not its design, and were never actionable. The author-facing impact the cross-reference was trying to mitigate — apps still using the `_nunjucks: { template, on }` event-display idiom — is already covered by Task 15's README updates (the engine-renders contract + explicit contrast with the cross-repo idiom). No new task needed.

Design.md lines [319-324](../design.md) and [697](../design.md) list "Two follow-on edits Part 32 needs" — the Case B pre-hook example and the "`_nunjucks` evaluation — equivalence verified" section — and recommends "Land Part 30 before Part 32 (or fold the two edits into Part 32's open work)". But Part 32 is in [`_completed/`](../../_completed/32-drop-static-overrides/) and its design.md (152 lines, no mention of `event_overrides` / `_nunjucks` / "Case B") shipped without those sections — the references in Part 30 are to **review-1 of Part 32**, which is review feedback, not design content. So:

- "Land Part 30 before Part 32" is impossible — Part 32 is shipped.
- "fold the two edits into Part 32's open work" — there is no open work; Part 32 is closed.
- The "Cross-reference Part 32" callout reads as an open dependency, but the dependency doesn't exist anywhere actionable.

**Fix:** drop the "Land Part 30 before Part 32" line. Replace the two-bullet "edits Part 32 needs" with either (a) a tracking note that the obsolete-equivalence section was never folded back into Part 32's design, no action required (since Part 32 shipped without it); or (b) a tiny new task in this part's `tasks/` folder that adds a deprecation note to `modules/workflows/README.md` under "event display" — that's where authors actually read the contract. (b) is the cleaner answer because the author-facing artifact (README) is the only place the obsolete `_nunjucks: { template, on }` advice still circulates.

### 6. Stale line-number references in tasks

> **Resolved.** Swapped Task 8's three numeric refs ("lines 226-249", "step-5 recompute", same) for anchor phrases that survive line drift ("the inner `for (const doc of matchingDocs)` block, and its sibling `entry.upsert === true` branch"; "after `recomputeWorkflowAfterActionWrite` returns"; "same point as edit 2"). The remaining numeric refs in tasks (e.g. `StartWorkflow.js:117-128`) cite engine code that the task is explicitly editing — those stay numeric because the line is the edit target, not a navigation aid.

Task 8 says "the step-4 per-entry write loop (lines 226-249)" ([tasks/08-wire-updateAction.md](../tasks/08-wire-updateAction.md)). Actual loop is [`handleSubmit.js:195-251`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) — line 226 is the `updateAction` call inside the loop, not the loop start; line 206 is the upsert `createAction`. Same shape for the "step-5 recompute" reference — recompute is at line 266, dispatch at line 334. Cosmetic but degrades implementer trust on a long task. Either update the cited ranges or swap numeric refs for anchor phrases ("the per-entry write loop in step 4", "after `recomputeWorkflowAfterActionWrite` returns").

## Summary

Three substantive holes: the YAML `event_overrides` channel isn't named by D14's plain-strings rule (#1); `context.workflow` is reassigned at the wrong point and step 6's `form_data` write doesn't reach event templates (#2); and the `kind: form` page-ID convention is asserted against Part 13 without a verifying citation (#3). Two looser items: `renderTree` has no defensive behaviour against operator-literal slop (#4) and the Part 32 cross-references no longer point at anything actionable (#5). Cosmetic: tasks cite stale line numbers (#6).

Findings #1 and #2 block any submit that exercises form templates or YAML event-override apps — both real surfaces in the demo. #3 blocks the first `kind: form` link rendered by the engine, which the current test plan doesn't exercise. Resolve before the implementer hits the gap mid-task.

Next: `/r:design-action-review 30-status-map-rendering` to resolve, reject, or defer each finding.
