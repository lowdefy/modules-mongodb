# Review 2 — Part 09 hook invocation

Focus: contract reconciliation after review-1's resolutions — Part 29 fold-in
(`hook_error` removal, `:reject` channel, collapsed return shape) versus
Part 06's shipped internal seam and the spec's pre-hook return shape.
Looking for unspecified translation steps, return-shape gaps, and merge
ambiguities not covered by review-1.

## Findings

### 1. Handler success-return shape is not reconciled with the new `rejected` / `reject_message` fields

> **Resolved by upstream simplification.** Part 29 § D5 was rewritten: `:reject` propagates transparently as a `UserError(isReject: true)` throw, with classification happening at the wrapping endpoint's `runRoutine` (per the new upstream `runRoutine.js` tweak). The `{ rejected, reject_message }` return surface on the handler is **deleted entirely** — there is no reject-path return shape, and the success-return shape stays `{ action_ids, completed_groups, event_id, tracker_fired, pre_hook_response, post_hook_response }` per Part 29 § change 5. The uniform-vs-polymorphic question dissolves because the fields don't exist. Updated Part 9's `invokePreHook.js`, abort-modes, verification, and contract-to-neighbours sections to reflect: no try/catch, no handler reject-return, no Part 13 trailing control step.

[design.md:71–82](../design.md) commits the `:reject` return as:

```
{
  rejected: true,
  reject_message: <message>,
  action_ids: [],
  completed_groups: [],
  event_id: null,
  tracker_fired: null,
  pre_hook_response: null,
  post_hook_response: null,
}
```

Part 06 ([design.md:68](../../06-submit-action-writes/design.md))
commits the success return as `{ action_ids, completed_groups, event_id,
tracker_fired, pre_hook_response, post_hook_response, post_hook_error }` —
and Part 29 ([§ change 5](../../29-error-model-cleanup/design.md#proposed-change))
collapses it further to `{ action_ids, completed_groups, event_id,
tracker_fired, pre_hook_response, post_hook_response }`.

Part 09 doesn't say whether the success return also carries `rejected: false`
/ `reject_message: null` (so the response shape is uniform and callers can
read `result.rejected` without an `in` guard), or whether the two fields are
**polymorphic** and present only on the reject path. Part 13's emitted
trailing control step keys off `_step: submit.rejected` ([](../../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-surfaces-as-a-rejection-at-the-calling-app),
step 5), which works either way — `_eq: [..., true]` returns false on a
missing key — but the contract should be pinned, and Part 6's return-shape
skeleton needs the same fold-in Part 29 already commits for `hook_error` /
`post_hook_error`.

**Fix.** Add a one-liner in the `invokePreHook.js` section pinning the
shape: either "success return adds `rejected: false, reject_message: null`
for uniformity" or "`rejected` / `reject_message` are only present on the
reject path; callers gate on `result.rejected === true`." Then echo the
choice as a fold-in to Part 6's skeleton (Part 29's "Part 9 (unshipped)"
section already enumerates the other return-shape changes — add this one
alongside).

### 2. Pre-hook `actions[]` entry `key` vs engine-internal `keys` — translation step is unspecified

> **Resolved.** Added an "Engine-internal normalization" paragraph pinning singular `key` → `keys: [<key>]` / omitted → `keys: [null]` translation in the merge function before the collision pass. Cross-linked `handleSubmit.js:188` as the canonical loop input. Restated the collision rule as per-`(type, single-key)` evaluation after both pre-hook and auto-unblock entries are expanded across their `keys` arrays.

[design.md:41](../design.md) commits the pre-hook entry shape as
`{ type, key?, status?, fields?, upsert?, force? }` (singular `key`),
matching [submit-pipeline/spec.md § Pre-hook return](../../../workflows-module-concept/submit-pipeline/spec.md#pre-hook-return-all-fields-optional).

[Part 06 § Payload](../../06-submit-action-writes/design.md#payload)
commits the engine-internal `actions[]` shape as
`{ type, status, keys?, fields?, references?, force? }` (plural `keys`, an
array). Shipped code confirms — [`handleSubmit.js:188`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js):

```js
const keys = entry.keys ?? [null];
for (const key of keys) { ... }
```

Pre-hook entries pass through "the same loop" per Part 06 §
[v1 fan-out posture](../../06-submit-action-writes/design.md#payload),
but Part 9 doesn't say where `key` → `keys` translation happens. Without it,
either:

- the merge function in this part needs to wrap each `key` into a single-
  entry `keys: [<key>]` array (and `key: null` / omitted into `keys:
  [null]`); or
- the loop needs to accept both shapes (added complexity in shipped Part 6
  code).

The collision-rule wording at [design.md:48](../design.md) ("On `(type, key)`
match with an auto-unblock entry…") implicitly assumes singular comparison
keys — but the auto-unblock entries that flow in from Part 7 carry plural
`keys` (Part 7 fans group-id `blocked_by` into multiple action-keys). So the
collision check itself needs a defined pair-key (per-`(type, single-key)`
expansion before comparison).

**Fix.** Pin the translation explicitly in the merge logic: "pre-hook entries
are normalized to the engine-internal `{ type, keys, status, fields, force }`
shape before the collision pass — singular `key` → `keys: [<key>]`, omitted
key → `keys: [null]`. Collision is then evaluated per `(type, key)` pair
after both pre-hook and auto-unblock entries are expanded." Cross-link
`handleSubmit.js:188` as the canonical loop input shape.

### 3. Pre-hook `actions[]` collision with `currentActionId` entry is undefined

> **Resolved.** Picked (b) — same replace rule. Added a "`currentActionId` collision" sub-rule under the actions-merge collision section: a pre-hook `actions[]` entry matching the `(type, key)` of the `currentActionId` entry replaces the step-1 entry, just like auto-unblock collisions. The top-level pre-hook `status` field is sugar; the explicit `actions[]` form lets the hook attach `fields` / `force` / omit `status` for form-data-only writes. If the replacement omits `status`, the engine grafts in the three-layer-resolved status so the channels stay semantically aligned (no silent drop of an author-set top-level `status`). Verification bullet extended to cover the new branch.

[design.md:48](../design.md) commits the collision rule **only against
auto-unblock entries**:

> On `(type, key)` match with an auto-unblock entry, the pre-hook entry
> **replaces** the auto-unblock entry in the merged list…

But step 1 of the lifecycle puts a `currentActionId` entry into `actions[]`
(per [Part 06 § Payload](../../06-submit-action-writes/design.md#payload):
"single-entry `actions[]` with the `currentActionId` slot populated").
What happens if a pre-hook returns an `actions[]` entry whose `(type, key)`
matches the `currentActionId` entry?

Two possible contracts, neither documented:

- **(a) Use the top-level `status` channel for the `currentActionId`.** A
  pre-hook that wants to change the submitted action's target status uses
  the top-level `status` field (subject to the three-layer precedence at
  [design.md:32–36](../design.md), not the `actions[]` collision rule). An
  `actions[]` entry matching `currentActionId` is treated as a duplicate —
  either rejected at merge time or silently overridden by the top-level
  `status`.
- **(b) Same replace rule.** Pre-hook `actions[]` entries that match
  `currentActionId` replace the step-1 entry the same way they replace
  auto-unblocks. The top-level `status` channel becomes redundant for
  authors who reach for `actions[]`.

Without pinning this, an implementer either ends up with two entries for
the same `(type, key)` in the write loop (double-write under
`currentActionId` self-exception — fresh audit entry on top of fresh audit
entry) or silently picks one of the above without a regression test.

**Fix.** Pin the contract. Recommend (a) — it keeps the channels disjoint:
top-level `status` controls the `currentActionId` entry's target stage;
`actions[]` is for *additional* writes. State explicitly that a pre-hook
`actions[]` entry whose `(type, key)` matches the `currentActionId` is
collapsed into the top-level `status` channel (or rejected at merge time
with a build-warning). Add a verification bullet covering it.

### 4. Post-hook timing wording omits step 10 (tracker subscription)

> **Resolved.** Updated the `invokePostHook.js` timing bullet from "side effects (parts 8, 11)" to "side effects (parts 8, 10, 11)" and added "Fires after step 10 (tracker subscription) so a post-hook reading `result.tracker_fired` sees the final post-subscription state."

[design.md:88–89](../design.md):

> After step 6 writes complete and side effects (parts 8, 11) fire, invokes
> `hooks[interaction].post` if declared.

Per [Part 06 § Lifecycle scaffold](../../06-submit-action-writes/design.md#lifecycle-scaffold),
the 11-step order is: 6 (form_data) → 7 (log event) → 8 (notifications) → 9
(group on-complete fan-out) → 10 (tracker subscription) → 11 (post-hook).
"Side effects (parts 8, 11)" picks up the log-event/notifications + fan-out
parts but misses step 10 (Part 10, tracker subscription), which also fires
before the post-hook.

Minor wording bug but a real one — a reader of Part 9 might think the
post-hook runs before tracker subscription, which it doesn't (and which
matters: the tracker subscription can push a parent action to `error` or
`done`, and a post-hook reading `result.tracker_fired` needs that state to
be final).

**Fix.** Replace "side effects (parts 8, 11)" with "side effects (parts 8,
10, 11)" — or restate as "after step 10 completes." Echoed in the payload
description at [design.md:90](../design.md) ("`result: { action_ids,
completed_groups, event_id, tracker_fired? }`") — `tracker_fired` is set by
step 10, so the post-hook firing order needs to include it.

### 5. `:reject` idempotency contract isn't pinned

> **Resolved.** Extended the idempotency-under-retry paragraph to cover both abort modes — "before aborting (whether via `throw` or `:reject`)" — and called out that both modes re-fire the pre-hook from the top on resubmit.

[design.md:84](../design.md) commits idempotency-under-retry only for the
`throw` path:

> A pre-hook that performs side effects (calls an external API, writes to
> another collection) before throwing must be idempotent — the user can
> retry, and the pre-hook re-runs.

The `:reject` branch has the same retry surface — `:reject` is the
*user-facing-fixable* abort mode (per [](../../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-surfaces-as-a-rejection-at-the-calling-app)),
which means the user can read the message, fix the form, and resubmit. The
pre-hook re-runs on resubmit. Any side effects the hook performed before
the `:reject` step (an HTTP call to a validator, a write to a staging
collection) will replay — same idempotency requirement as the throw path.

Today's wording invites the read "throws need idempotency, rejects don't"
— and that's wrong.

**Fix.** Extend the idempotency paragraph to cover both abort modes:
"A pre-hook that performs side effects before aborting (whether via `throw`
or `:reject`) must be idempotent — the user can retry the same submission,
and the pre-hook re-runs from the top." Same author contract; both modes
re-fire.

### 6. Bottom-layer `buildDefaultLogEventPayload` shape clarification

> **Resolved.** Added an "Implementation note" under the four-layer event_overrides merge: layer 3 (runtime comment) is folded into `buildDefaultLogEventPayload` itself per Part 13 § Pending handler work step 2 — the imported bottom layer returns layers 1+3 already composed, and the merge function applies layer 2 (YAML) and layer 4 (pre-hook) on top. Explicit warning not to re-inject `comment` as a separate layer-3 step (would double-inject).

[design.md:50](../design.md): "`buildDefaultLogEventPayload` (imported as
the bottom layer; returns the unkeyed `{ type, display, references,
metadata }` shape)."

Looking at [Part 13 § Pending handler work (part 6 follow-up)](../../13-resolver-apis/design.md#pending-handler-work-part-6-follow-up),
step 2 commits that `buildDefaultLogEventPayload` "accept[s] `comment` and
merge[s] into `metadata.comment` when present and non-empty (drop the key
when falsy). Place the merge **above** the part-9 layer-2…
**Document the layer-3 position in the function's JSDoc so part 9's
implementer keeps the ordering correct.**"

So `buildDefaultLogEventPayload` is — per Part 13's commitment —
**not** a pure bottom layer; it composes layer 1 (engine defaults) **plus**
layer 3 (runtime comment) into a single returned shape. Part 9's "imported
as the bottom layer" wording at [design.md:50](../design.md) describes a
three-layer composition over a four-layer logical stack, which is right
but easy to misread.

This isn't a bug — review-1 #1 resolved with option (b)'s four-layer logical
ordering, and Part 13 then chose to fold the comment injection into
`buildDefaultLogEventPayload` itself rather than have Part 9's merge
function call out a separate layer-3 step. Worth a one-liner to keep the
two descriptions aligned: "The bottom layer ships layer 1 + layer 3
already composed (per Part 13's handler-work commitment); Part 9's merge
function applies layer 2 (YAML) and layer 4 (pre-hook) on top."

**Fix.** Add the clarifying sentence. Without it, an implementer reading
Part 9 in isolation writes a four-layer merge function that double-injects
the comment (once via `buildDefaultLogEventPayload`, once as a separate
layer-3 step) — and the verification test at
[design.md:117](../design.md) ("a pre-hook `event_overrides.metadata.comment`
still overrides the runtime comment") doesn't catch the double-injection.

## Minor

### 7. `pre_hook_response` field never defined as a return surface

> **Resolved.** Pinned the contract in the `invokePreHook.js` section: the **raw return object (pre-merge, exactly what the hook returned)** is surfaced as `pre_hook_response`; `null` when no pre-hook is declared. Symmetric with `post_hook_response`. Rationale recorded inline: raw return keeps author debugging direct and avoids leaking engine-internal normalization (e.g. the `key` → `keys` translation) into the response. Added a parallel verification bullet.

[design.md:80](../design.md) lists `pre_hook_response: null` on the reject
return shape. [Part 06 § Lifecycle scaffold](../../06-submit-action-writes/design.md#lifecycle-scaffold)
lists `pre_hook_response: null` as a default-null return field, populated
by Part 9. But Part 9's body never explicitly says "pre-hook return is
surfaced on the API response as `pre_hook_response`" — only the post-hook
gets that statement ([design.md:90](../design.md): "Return is free-form;
surfaced as `post_hook_response` on the API return").

Add the parallel statement in the `invokePreHook.js` section: "Pre-hook
return (the full merged-into object, post-merge — or just the raw return,
TBD) is surfaced as `pre_hook_response` on the API return." Or pick one
shape and pin it — today's wording at
[Part 6 § Lifecycle scaffold](../../06-submit-action-writes/design.md#lifecycle-scaffold)
just says "populated by part 9" without committing to *what* gets put
there.

### 8. Worked-example fixture names

> **Resolved.** Dropped the orphaned integration bullet. The fixture names (`qualify-pre-submit` / `send-quote-post-approve`) appeared only in that one sentence and didn't match Part 13's emit template anyway. End-to-end worked-example coverage lives in Part 22's e2e suite; this part's verification scope is already pinned as "unit-tests + handler-level integration smoke only."

[design.md:126](../design.md): "the worked-example `qualify-pre-submit` and
`send-quote-post-approve` fixtures exercise the full chain."

These fixture names don't appear elsewhere in the design folder
(`qualify-pre-submit` / `send-quote-post-approve` don't match the worked-
example's action vocabulary — Part 13's tests reference `update-action-
qualify` etc.). Either rename to match Part 13's emitted-id template
(`update-action-qualify-submit_edit-pre`, `update-action-send-quote-approve-
post`) or note that these are dedicated unit-test fixtures whose names are
implementation-defined.
