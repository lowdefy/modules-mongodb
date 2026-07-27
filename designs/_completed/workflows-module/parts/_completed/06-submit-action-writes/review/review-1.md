# Review 1 — Part 06 SubmitWorkflowAction core writes

Focus: contract drift from shipped code (parts 3, 4, 5), payload-shape ambiguity between the resolver-emitted Api layer and the engine-handler layer, and a small set of substantive gaps that will trip implementation if not pinned now.

## Substantive issues

### 1. Payload shape elides the engine-spec `currentActionId` / `actions[]` / `keys[]` plural layer

> **Resolved.** Added a Payload sub-section above Lifecycle scaffold naming the per-endpoint inputs (`action_id`, `interaction`, `current_key`, `form`, `form_review`, `fields`, `current_status`, `hooks`, `event_overrides`) and the internal `{ currentActionId, actions[], eventId }` shape the rest of the lifecycle reads from. Translation pinned to step 1; `keys: []` silent-no-op footgun documented. Also dropped per-call `force` from the contract — per-entry `force` on `actions[]` is the only force surface (cascaded into engine/spec.md and part 9 design).

[design.md:13–28](../design.md) describes a lifecycle that maps interactions to status transitions for "the action," and the Verification block at [design.md:74–80](../design.md) references `current_key`. But the engine spec at [engine/spec.md:196–211](../../../workflows-module-concept/engine/spec.md#submitworkflowaction-payload) is explicit that the handler's payload is:

```
{
  currentActionId: string | null,
  actions: [{ type, status, keys?, fields?, references?, force? }],
  eventId: string,
  force: true | false
}
```

The submit-pipeline Api ([submit-pipeline/spec.md:39–72](../../../workflows-module-concept/submit-pipeline/spec.md#per-action-update-action-action_type-api-resolver-emitted)) is what carries `action_id` + `current_key` + `interaction` + `form` / `form_review` / `fields`. The resolver routine **must translate** the per-action endpoint's payload to the engine-handler's `currentActionId` + `actions[]` shape (resolving `action_type` + `current_key` → an action lookup, computing target status from the interaction → `actions[0].status`, threading `currentActionId`).

The current part-6 design never names this translation step. Without it, finding 2 below (single-action assumption) and finding 5 below (idempotency key) are ambiguous.

**Fix.** Add a short "Payload translation" sub-section after "Lifecycle scaffold" that:

- Names the inputs the handler actually receives (`currentActionId`, `actions[]`, `eventId`, `force`) and ties them back to the per-action endpoint payload from submit-pipeline.
- Pins where the translation happens: either inside the resolver routine that part 13 emits (lean: yes — keep the handler payload uniform) or inside `handleSubmit.js` step 1 as a normalisation pass. Calling that out now avoids a part-13 ↔ part-6 fight later.
- Confirms the handler accepts (and propagates) `keys: [...]` even though v1 only fires it from one entry per call — otherwise part-9 pre-hook `actions[]` returns won't be able to fan out keyed actions.

### 2. `keys: [...]` plural fan-out is not in scope but the design talks like the call is single-action

> **Resolved.** Committed v1 ships the per-entry write loop now; only the `currentActionId` slot is populated in part 6 (parts 7 and 9 plumb auto-unblock + pre-hook entries into the same loop). Rewrote Interaction → target-status mapping lede to say the table applies to the `currentActionId` entry only — auto-unblock entries (`action-required`) and pre-hook-returned entries (author-supplied `status`) bypass the table.

[engine/spec.md:191](../../../workflows-module-concept/engine/spec.md#capabilities) commits to `SubmitWorkflowAction` writing "one or more action transitions per call" with the `keys: [...]` flat-map semantics. Pre-hook returns can also add `actions[]` entries ([part 9 design.md:23](../09-hook-invocation/design.md)). Part 6's lifecycle scaffold ([design.md:13–28](../design.md)) reads as a single-action transition — step 4 "Write action transitions" is plural but every other reference (`form_data` write, interaction → target-status mapping, idempotency key) is singular.

**Why this matters.** The interaction → target-status mapping ([design.md:31–38](../design.md)) applies to "the user-submitted action." But pre-hook `actions[]` entries each carry their own `status` (per [part 9 design.md:23](../09-hook-invocation/design.md) and [submit-pipeline/spec.md:185](../../../workflows-module-concept/submit-pipeline/spec.md#pre-hook-return-all-fields-optional)) — they aren't subject to the interaction default. Auto-unblock entries similarly carry `status: action-required` (set by `computeAutoUnblocks`), not derived from the interaction.

**Fix.** Disambiguate in [design.md:31](../design.md): say "engine default per interaction applies to the **currentActionId entry**; pre-hook `actions[]` and auto-unblock entries carry their own `status` and skip this mapping." Then say either:

- v1 only writes one transition per call (the `currentActionId`), defers fan-out + pre-hook `actions[]` writing to part 7+9 — but then part 9 has nowhere to land the per-entry write loop; or
- v1 ships the fan-out loop with `force: true` honored per-entry, and just doesn't expose pre-hook `actions[]` until part 9 plugs it in.

Lean toward option 2 — the loop is cheap, part 9 needs it, and `keys: []` validation is the only edge case worth pinning here (mention the silent-no-op footgun from [engine/spec.md:213](../../../workflows-module-concept/engine/spec.md#submitworkflowaction-payload)).

### 3. `updateAction.js` "replaces part 5's scaffold" contradicts part 5's own commitment

> **Resolved.** Rewrote the Sub-modules bullet to put `updateAction.js` at `src/connections/shared/`, extending part 5's scaffold in place. Added a Contract-to-neighbours line noting part 10 calls into the extended `updateAction`.

[design.md:54–57](../design.md) (Sub-modules):

> `SubmitWorkflowAction/updateAction.js` (full) — replaces part 5's scaffold; enforces priority rule, idempotency, change stamps.

[Part 5 design.md:78](../05-start-cancel-handlers/design.md):

> Part 6 imports `createAction.js` and `updateAction.js` from `src/connections/shared/`, then extends `updateAction.js` with priority-rule logic and idempotency guards (**extending the scaffold in place rather than introducing a separate `SubmitWorkflowAction/`-nested copy**).

The shipped code lives at [plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js) and its JSDoc explicitly says `"future task in part 06 makes this optional"` — i.e. extends in place. Part 6's "SubmitWorkflowAction/updateAction.js (full)" path would mean either moving the file or having two copies; both contradict the shipped state and part 5's commitment.

This was settled in [part 5 review-1 finding 14](../../05-start-cancel-handlers/review/review-1.md) ("committed `src/connections/shared/` as the home for `createAction.js` and `updateAction.js`. Updated the design's 'Shared internal helpers' section and 'Contract to neighbours' line"). Part 6's design pre-dates that resolution.

**Fix.** Move `updateAction.js` out of the Sub-modules list at [design.md:54](../design.md) and into the existing shared/ tree. Rewrite the bullet to:

> `src/connections/shared/updateAction.js` — extend part 5's scaffold in place: drop the `force !== true` guard, add priority-rule check via `actionsEnum`, idempotency guard via `getCurrentAction.js`, accept `currentActionId` for the self-exception. `force: true` callers (StartWorkflow's parent push, CancelWorkflow's not-required loop, tracker subscription, pre-hook entries) keep working unchanged.

This also affects [design.md:91 (Contract to neighbours)](../design.md) — "Parts 7, 8, 9, 10, 11 each light up one of the no-op'd lifecycle steps" should mention that part 10 (tracker subscription) calls `updateAction` from this part's extension.

### 4. `actionsEnum` priority data is in the connection schema but the design never says where to read it

> **Resolved.** Added a bullet in Priority rule naming `connection.actionsEnum[stage].priority` as the priority source, with the throw-on-unknown-stage commitment.

[plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js) declares `actionsEnum` as a required connection property and explicitly calls `priority` "load-bearing for the priority-rule check." [StartWorkflow.js:13](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js) already reads it through `context.actionsEnum`.

Part 6's Priority Rule section ([design.md:40–46](../design.md)) describes the rule but doesn't say:

- Where the priority numbers come from (`connection.actionsEnum[stage].priority`).
- That `actionsEnum` is the only place priority lives — not in `workflowsConfig`, not on the action doc.
- How a status with no `actionsEnum` entry is handled (lean: throw at handler entry; the build-time validator in [makeWorkflowsConfig.js:77](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) already enforces `status_map` keys but not `interactions[*].status` overrides, so a typo in YAML survives to runtime).

**Fix.** In [design.md:40–46](../design.md), add:

> Priority is read from `connection.actionsEnum[stage].priority` at handler entry. A resolved target status not present in `actionsEnum` throws with a clear error — guards against a typo in `action.interactions[*].status` (part 9) or a pre-hook return that resolved to an unknown stage.

This also feeds finding 6 (validation return shape).

### 5. Idempotency key is under-specified — `(action_id, current_status, interaction)` doesn't compose with pre-hook overrides

> **Resolved.** Rewrote the Idempotency section: idempotency falls out of the priority rule + `currentActionId` self-exception, not a payload triple. `shouldUpdate.js` wraps the priority check; `getCurrentAction.js` loads the action doc once per entry for consistent reads.

[design.md:47–50](../design.md):

> Same `(action_id, current_status, interaction)` re-submitted is a no-op via the `shouldUpdate` guard.

Problem: `current_status` isn't part of the engine-handler payload (it's part of the per-action endpoint payload — submit-pipeline Decision 3 mentions it for the task `submit_edit` status-selector). The engine-side guard the priority rule already provides ([engine/spec.md:288–291](../../../workflows-module-concept/engine/spec.md#idempotency)) is:

- Action status push: priority rule rejects same-stage on non-`currentActionId` actions and `force: true` is required to push terminal-from-terminal — naturally idempotent for retries.
- `currentActionId` self-exception: same-stage allowed; otherwise nothing would let a user re-save an `in-review` action.

So the real idempotency rule for `SubmitWorkflowAction` is the **priority-rule-plus-self-exception** check, plus a top-level same-`(workflow.status[0].stage)` guard for the workflow push (already pseudocoded at [engine/spec.md:263](../../../workflows-module-concept/engine/spec.md#tracker-subscription)).

The `shouldUpdate` helper at [design.md:50](../design.md) is fine, but the **key** should be derived from the per-entry resolved status, not from a payload field that doesn't exist on the engine side.

**Fix.** Rewrite [design.md:47–50](../design.md):

> Idempotency falls out of the priority rule + `currentActionId` self-exception. A retry of the same submit issues the same writes; the priority check rejects status pushes that already landed (non-self entries) and the self-exception allows the no-op same-stage push on the user-submitted action. `utils/shouldUpdate.js` wraps the priority check for the per-entry write loop; `utils/getCurrentAction.js` fetches the action doc once per entry so the priority comparison reads consistent state.

Drop the `(action_id, current_status, interaction)` triple — it's a routine-layer concept that doesn't exist on the handler side.

### 6. Open question 1 (validation return shape) is downstream of `hook_error` semantics; not really open

> **Resolved.** Committed the dual validation paths inline on step 1: throw before action lookup (payload schema, role, terminal-workflow gate); force-push `error` transition after lookup (mid-write failures and pre-hook `hook_error`). Removed the open question. Cross-link to engine/spec.md § Action `error` transition.

[design.md:86](../design.md) flags "throw vs. structured `{ success: false }` return" as open and "leans structured." But the upstream contract is already settled: [engine/spec.md:170–175](../../../workflows-module-concept/engine/spec.md#action-error-transition) commits validation failures to the **engine-driven mid-submit failure** path:

> writes `{ stage: error, created, reason: <step-name>, error_message, error_metadata }` to the action's `status` array with `force: true` semantics; … returns partial `{ action_ids, event_id }`

i.e. validation that catches an issue **after** the action lookup writes an `error` transition and returns a partial result. Validation that catches an issue **before** the action lookup (payload schema, action-not-found, role gate fail) doesn't have an action doc to write a status entry on — so it must throw.

This splits cleanly:

| When validation fires             | Action doc exists? | Path                                                  |
| --------------------------------- | ------------------ | ----------------------------------------------------- |
| Payload schema / role / no action | No                 | throw — caller sees structured error (CallApi result) |
| After action lookup, mid-write    | Yes                | engine-driven `error` transition (force-pushed)       |

**Fix.** Replace the open question with a committed Validation sub-section in [design.md:15](../design.md) (the `1. Validate` bullet) noting both paths and pointing the second at [engine/spec.md § Action `error` transition](../../../workflows-module-concept/engine/spec.md#action-error-transition). The throw-only path matches every other handler in the repo (`StartWorkflow.js:19,22,25` already throws on missing payload fields).

### 7. `required_after_close` deferral targets the wrong part

> **Resolved.** Shipped the submit-time terminal-workflow gate in part 6's step 1: reject when `workflow.status[0].stage ∈ {completed, cancelled}` AND `!action.required_after_close`. Replaced the misdirected part-7 deferral in Out-of-scope with a pointer to the new [part 23 — CloseWorkflow handler](../../23-close-workflow-handler/design.md) (close-vs-cancel split surfaced during action-review discussion). Part 23 owns the close-side action-sweep (the other half of the `required_after_close` contract); part 6 may share a workflow-close write helper with part 23 when it lands.

[design.md:66](../design.md):

> `required_after_close` honoring — ship in this part if cheap; otherwise defer to part 7 (where workflow-stage gating already gets touched).

Part 7 doesn't touch workflow-stage gating for submits. [Part 7 design.md:9–50](../07-group-state-machine/design.md) covers group status derivation, `blocked_by` resolution, group writeback, and auto-complete check. Auto-complete _pushes_ workflow status to `completed`; it doesn't _read_ workflow status to gate submits.

`required_after_close` is an action-level field ([action-authoring/spec.md:181](../../../workflows-module-concept/action-authoring/spec.md)): when `false` (the default), the action rejects submits after `workflow.status[0].stage` is `completed` or `cancelled`. That's a step-1 validation in `handleSubmit.js` — squarely part 6's territory.

**Fix.** Either commit to honoring it in part 6 (it's a one-line check in step 1: `if workflow.status[0].stage ∈ {completed, cancelled} && !action.required_after_close → throw`), or defer it to a follow-on. Don't pin it on part 7. The check needs `workflow.status[0].stage` and `action.required_after_close` (already in `ACTION_FIELDS` at [makeWorkflowsConfig.js:13](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)), so it's cheap. Lean ship in part 6.

### 8. Return shape's `completed_groups: []` placeholder needs part-7 docs cross-link

> **Resolved.** Added a one-line cross-link after the return-shape line naming part 7's swap to the `[{ workflow_id, id, on_complete? }]` shape.

[design.md:27](../design.md):

> Then return: `{ action_ids, completed_groups: [], event_id: null, tracker_fired: null, pre_hook_response: null, post_hook_response: null }`.

`completed_groups: []` is fine as a literal placeholder in v1, but [part 7 design.md:42](../07-group-state-machine/design.md#completed_groups-return-shape) commits the shape:

> `[{ workflow_id, id, on_complete? }]`

If part 6's `handleSubmit.js` returns a literal `[]`, every existing call site reads "always-empty array" until part 7 lands. That's fine as long as part 7 swaps the literal for the real computation in the **same lifecycle step 5** (currently called "Recompute workflow summary — counts only. `groups[]` defer to part 7" at [design.md:19](../design.md)).

Make it explicit so part 7 has a clear seam.

**Fix.** Add a half-sentence in the return shape comment at [design.md:27](../design.md):

> `completed_groups: []` is a literal placeholder; part 7 replaces it with the `[{ workflow_id, id, on_complete? }]` entries computed during step 5's group recompute.

### 9. `form_data` write path doesn't say `form_review` merges with `form` before write

> **Resolved.** Extended step 6 to commit the merge: `form` and `form_review` from the endpoint payload combine into one flat bag before write, no `.review` sub-key, field collisions are author error. Noted part 9's `form_overrides` layer on top.

[design.md:20](../design.md) (lifecycle step 6):

> Write `form_data` — layout `form_data.{action_type}[.{key}].{field}` (per concept engine D5).

[engine/spec.md:164](../../../workflows-module-concept/engine/spec.md#form-data-layout):

> Submitter (`form:`) and reviewer (`form_review:`) payloads are merged into one bag before write; the engine doesn't disambiguate.

The endpoint payload carries both `form` and `form_review` ([submit-pipeline/spec.md:53–54](../../../workflows-module-concept/submit-pipeline/spec.md#per-action-update-action-action_type-api-resolver-emitted)) and the handler must merge them into the single `form_data.{action_type}` namespace. Without this called out, an implementer will write only `form` and lose `form_review` values on `approve` / `request_changes` submits.

**Fix.** Extend [design.md:20](../design.md) to:

> Write `form_data` — merge `form` and `form_review` from the endpoint payload into one flat bag (per [engine spec § Form data layout](../../../workflows-module-concept/engine/spec.md#form-data-layout) — no `.review` sub-key), then `$set` per-field at `form_data.{action_type}[.{key}].{field}`. Field collisions are author error; engine doesn't disambiguate.

This also unblocks part 9's `form_overrides` merge — that's pre-hook → form_review → form layered, all written to the same path.

## Smaller issues

### 10. `pre_hook_response` / `post_hook_response` in the v1 return are `null`, not omitted

> **Rejected.** The `null` literals are intentional — they commit field presence in v1 so part 9 populates an existing slot rather than adding the keys. Engine spec's `tracker_fired?` style is itself a slight overreach (the field is also present-and-null in v1), so matching it would muddy the contract more than help.

[design.md:27](../design.md) returns `pre_hook_response: null, post_hook_response: null`. That's fine and matches what part 9 needs — but [engine/spec.md:191](../../../workflows-module-concept/engine/spec.md#capabilities) says the handler returns `{ action_ids, completed_groups, event_id, tracker_fired? }` with `tracker_fired` marked optional via `?`. Consider explicitly marking the two hook-response fields as the same shape (`pre_hook_response?`, `post_hook_response?`) since part 9 makes them populated; part 6 just emits `null`. Cosmetic.

### 11. Lifecycle step 10 numbering disagrees with engine spec

> **Resolved.** Added a one-line note to the Lifecycle scaffold lede stating it follows submit-pipeline's numbering, with a cross-link to engine spec's alternate write-ordering view.

Part 6 [design.md:24](../design.md): step 10 is "Tracker subscription". Engine spec [engine/spec.md:308–321](../../../workflows-module-concept/engine/spec.md#ordering-inside-one-submitworkflowaction-invocation) numbers tracker subscription as step 9 (with auto-complete check as step 6 and `form_data` write as step 7) — a different ordering and numbering than [submit-pipeline/spec.md:14–27](../../../workflows-module-concept/submit-pipeline/spec.md#flow), which goes 1–12 in pipeline order with tracker subscription as step 10.

Part 6 follows submit-pipeline's numbering, which is the right call (the pipeline view is the canonical user-facing one). But neither spec is internally consistent. Worth a one-line note in part 6 saying it follows submit-pipeline's lifecycle numbering (not engine spec's internal write-ordering, which is a different view of the same flow). Stops a reviewer from getting confused.

### 12. "Validate access check (`access.roles ∩ user.roles`)" omits the per-app verb check

> **Resolved.** Reworded step 1 to say "access role gate" with an explicit "verb filter is implicit at submit time" note + cross-link to engine spec.

[design.md:15](../design.md): step 1 says "access check (`access.roles ∩ user.roles`)". [engine/spec.md:194](../../../workflows-module-concept/engine/spec.md#capabilities):

> **Access enforcement** — runs the per-app verb filter + role gate from action-authoring Decision 3 ("Action access semantics") at two server-side points … (2) `SubmitWorkflowAction` handler re-checks role gate before writes; rejects with structured error on mismatch (role revoked between render and submit). **Verb-filter check at submit-time is implicit** (page wouldn't have been generated if verb wasn't allowed in current app).

So the design's "access check" is correctly **role-only** at submit time — but the parenthetical should say so, otherwise a reviewer might think the verb-filter is missing. Tiny rewording.

**Fix.** Change [design.md:15](../design.md):

> Validate: payload schema, action exists, access role gate (`access.roles ∩ user.roles`). Verb filter is implicit (per [engine spec § Capabilities](../../../workflows-module-concept/engine/spec.md#capabilities) — the page wouldn't have been generated if the verb wasn't allowed in the calling app).

### 13. `not-required` button's status mapping isn't called out vs. priority rule

> **Resolved.** Reworded the self-exception bullet in Priority rule to commit "audit history is the source of truth for 'user did this again'" — same-stage re-clicks intentionally write a fresh status entry. Non-self idempotency falls out of the priority rule.

[design.md:34](../design.md): `not_required → not-required`. [engine/spec.md:300](../../../workflows-module-concept/engine/spec.md#priority-rule):

> `not-required` (priority 0) is the universal terminal — only `force: true` (per-call or per-entry) moves it.

So writing a `not-required` push from any non-terminal status is fine (priority(0) < priority(non-terminal-X) always). But writing it _onto_ an already-`not-required` action requires `force: true`. The interaction default doesn't set force; will a `not_required` button click on a `not-required` action no-op via priority + `currentActionId` self-exception, or write a duplicate status entry?

Worked it out: same-stage self-exception allows the push, so a re-click writes a duplicate status entry with the same `stage: not-required`. Acceptable (audit history) but worth a one-line note so an implementer doesn't add a "this is wasteful" comment and try to guard it.

**Fix.** No code change; add a clarification in [design.md:43](../design.md):

> Self-exception is intentional — same-stage re-clicks on the user-submitted action write a fresh status entry (audit history is the source of truth for "user did this again"). Idempotency on _non-self_ entries falls out of the priority rule (priority(X) < priority(X) is false).

## Out-of-scope / non-findings

- The form-data merge contract with `form_overrides` (part 9 owned) is fine as a deferral — part 9 picks it up.
- The 11-step skeleton being "stubbed with TODOs pointing at their part" is a sensible engineering choice; no review issue.
- `idempotency` v1 — once finding 5 is settled, no further work.

## Suggested doc edits in order

1. Finding 3 — move `updateAction.js` back to `shared/`. (Untangles parts 5/6/10.)
2. Finding 6 — close open question 1; commit dual validation paths in step 1.
3. Finding 1 + 2 — add Payload translation sub-section and disambiguate single-vs-multi-entry assumptions.
4. Finding 7 — pin `required_after_close` to part 6.
5. Finding 4 + 9 — fill in `actionsEnum` and `form_data` merge details.
6. Findings 5, 8, 11, 12, 13 — small in-place clarifications.
