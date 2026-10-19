# Review 1 — Part 11 group `on_complete` fan-out

Focus: cross-design consistency with Parts 7, 8, 10, 13, and with the actual
state of `handleSubmit.js` / `CancelWorkflow.js` / `makeWorkflowsConfig.js`
on disk.

## Blockers

### 1. `completed_groups[].on_complete` is a routine object, not an Api id

> **Resolved (Option 1 — synthesize at fan-out time).** `fireGroupOnComplete` reads the `on_complete` field only as a fire/skip signal (truthy fires) and constructs the api id `workflow-{workflow_type}-group-{group_id}-on-complete` locally from `context.workflow.workflow_type` + each entry's `id`. Part 7's return shape and `handleSubmit.js:336` stay unchanged. Hard-coded template is pinned by a unit test (finding #10) — same posture as `dispatchLogEvent.js`'s hard-coded `new-event` target.

[design.md:14–15](../design.md) says fan-out fires "for each entry with a
non-null `on_complete` Api id" by invoking
`context.callApi(<on_complete-api-id>, payload, { user })`. That contract
no longer matches the data this part receives.

Two facts on disk:

- [`handleSubmit.js:336`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)
  populates `completed_groups[].on_complete` with `cfg?.on_complete ?? null`
  — the raw value from `workflowConfig.action_groups[].on_complete`.
- [`makeWorkflowsConfig.js:106–126`](../../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)
  rejects the string-id shape and requires
  `on_complete: { routine: [ ... ] }`. The "legacy shape pointing at a YAML
  path" error message makes the migration explicit. So the field in
  `completed_groups` is an **inline routine object**, not a callable Api id.

Meanwhile [Part 13](../../13-resolver-apis/design.md:38–40) emits each
inline `on_complete` as an Api at build time with the deterministic id
`workflow-{workflow_type}-group-{group_id}-on-complete`. Part 11 needs to
land on that id to fire the call. Three viable resolutions; pick one:

1. **Synthesize at fan-out time.** `fireGroupOnComplete` takes
   `workflow_type` + `group.id` from context/each entry and constructs
   `workflow-${workflow_type}-group-${group.id}-on-complete`. Decide what
   to do when the group has no `on_complete:` declared — current
   `cfg?.on_complete ?? null` is fine for that signal, but the design
   should call out the precise predicate (skip when `on_complete` is
   falsy on the entry, fire otherwise).
2. **Change Part 7's return shape.** Make `completed_groups[].on_complete`
   carry the resolver-emitted Api id (`workflow-{type}-group-{id}-on-complete`)
   rather than the routine. That keeps fan-out a dumb loop but requires
   `handleSubmit.js` to know about resolver naming, which couples the
   handler to a build-time convention it currently doesn't import.
3. **Drop `on_complete` from the `completed_groups` shape entirely.** Have
   fan-out walk `workflowConfig.action_groups` keyed by `group.id` to
   decide "fire or skip", and synthesize the api id at the same site.
   That keeps Part 7's return slim and centralizes the "what api do I
   call" question in Part 11.

Whichever path, the design has to state explicitly that fan-out targets
`workflow-{workflow_type}-group-{group_id}-on-complete` (or the chosen
canonical) and that the inline-routine value is **never** what gets
passed to `callApi`. Without this, Part 11 is unimplementable.

### 2. `context.callApi` signature is wrong

> **Resolved.** Design now specifies `context.callApi({ id: <derived-id>, module: 'workflows' }, payload, { user: context.user })` with an explicit note that the `{ id, module }` form is required because the Api is module-scoped, and a cross-link to `dispatchNotifications.js:17–21` as the canonical call shape.

[design.md:15](../design.md) writes
`context.callApi(<on_complete-api-id>, payload, { user })`.

The actual primitive's signature for own-app Apis (the case here — the
`on_complete` Api is authored inline on the workflow and lives in the
consuming app) accepts either a string endpoint id or an
`{ id, module }` object. See
[`dispatchNotifications.js:17–21`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js):

```js
await context.callApi(
  { id: "send-notification", module: "notifications" },
  { event_ids: [eventId] },
  { user: context.user },
);
```

Since the `on_complete` Api is emitted by `makeWorkflowApis`
([Part 13](../../13-resolver-apis/design.md:38–40)) under the workflows
module entry id, it's a **module-scoped** Api — the call must use
`{ id: '<derived-id>', module: 'workflows' }`, not a bare string and not
`module: undefined`. State that explicitly so implementers don't fall
back to the string form and silently dispatch into the consuming app's
own-Api namespace.

## Findings

### 3. Lifecycle step numbering only matches if you accept Part 6's renumber

> **Resolved.** Replaced the `tracker_fired`-coupling rationale with two correct reasons: (a) the spec fixes 9 → 10 → 11; (b) post-hook (step 11) reads `tracker_fired` from `result`, so tracker must run before post-hook. Frames fan-out as part of the "this workflow's owned side effects" cluster.

[design.md:26](../design.md) says: "Step 9 in `handleSubmit` now executes
(previously no-op'd in part 6) … runs after step 7 (log event) and step 8
(notifications) but before step 10 (tracker subscription)".

That ordering matches [`handleSubmit.js:420–424`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)
exactly — step 9 stub between dispatchNotifications and the tracker
subscription TODO. It also matches Part 10's
["Contract to neighbours"](../../10-tracker-subscription/design.md:79).
No issue with the ordering itself.

But the design's reason — "because both step 9 (group fan-out) and step 10
may make in-process writes through `context.callApi`, the ordering
matters for the `tracker_fired` signal" — overstates the coupling.
`tracker_fired` is the parent-action write that **this** workflow's
auto-complete triggers, not something downstream callApis influence.
Group `on_complete` Apis fire in the consuming app's namespace and may
do anything they want; they don't write back into this workflow's
`status` or into `tracker_fired`. The real reason is simpler: the spec
fixes the ordering ([submit-pipeline/spec.md "Flow"](../../../workflows-module-concept/submit-pipeline/spec.md)
steps 9 → 10 → 11), and post-hook (step 11) needs to see `tracker_fired`
populated. Rephrase to match.

### 4. Error semantics diverge from Part 8 without saying why

> **Resolved.** Added an "Error policy" bullet that pins the implementation (local try/catch per call, log + continue, `result.success === false` inverts to log not throw) and names the Part 8 divergence explicitly: engine-owned dispatch surfaces, author-code dispatch swallows. Trade-off ("caller has no signal a hook didn't fire") is named alongside the concept-spec mitigation (idempotent hooks + reconciliation). Note: the original review's "Part 6 mid-write catch corrupts `action.status: error`" framing was wrong — that catch only wraps steps 4-6 and is already closed by the time step 9 runs. Real reason for swallowing is "author code shouldn't 500 a clean action transition," not "avoid corrupting status."

[design.md:21](../design.md): "Errors logged but do not fail the submit."

That's the right v1 posture (concept Risks: "if engine retries after
group completion but before hook fire, hook may be missed entirely" —
mitigation is idempotent hooks + periodic reconciliation). But it
**diverges** from the precedent Part 8 established for the same lifecycle
class of side effect:
[`Part 8 § Step 7 / step 8 failure mode`](../_completed/08-side-effect-dispatch/design.md:90–98)
says log-event / notification failures throw past `handleSubmit` to the
request layer; "they are not wrapped in the mid-write try/catch".

The reasons Part 8 gives for throwing — "writes are durable, no
inconsistent state; a surfaced exception is more useful than a 200 OK
with a silent error field" — apply equally to `on_complete` failures.
The honest distinction is:

- Log event / notifications are engine-owned (we know the contract; if
  they fail it's a config or infrastructure bug we want surfaced).
- `on_complete` runs arbitrary author code; treating an author bug as a
  500 leaks abstraction and would also corrupt the action's `status`
  array via the Part 6 mid-write catch (which sets `status: error`)
  even though the action itself completed cleanly.

Make this trade-off explicit. Concretely: catch every `callApi` error
inside `fireGroupOnComplete.js`, log with structured context (workflow
id, group id, on*complete api id, error), continue with the next entry.
Match Part 8's `result.success` check shape but invert the policy on
failure — log instead of throw. Don't reach the outer
[`handleSubmit.js:370–401`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)
catch, because that path writes `action.status: error` on the user's
submitted action which is wrong (the action \_did* transition; only the
post-write hook failed).

### 5. Tracker-propagated parent group completions aren't addressed

[Part 10 § Logic step 6](../../10-tracker-subscription/design.md:32–33)
runs the parent workflow's recompute pass (groups, `blocked_by`
re-evaluation, auto-complete, summary writeback) via
`recomputeWorkflowAfterActionWrite.js`. If that pass transitions a
parent group from non-`done` to `done`, the parent's `on_complete`
hook **should** fire (concept spec on action-groups:
"`on_complete` fires once when the group transitions to `done`" —
silent on whether the transition was user-driven or tracker-propagated;
the natural reading is "fires once, regardless of cause").

Part 10's helper doesn't expose `completed_groups`; Part 11 reads
`completed_groups` only from the originating submit's
`handleSubmit`-level diff. So today the design implies parent-level
fan-out **doesn't fire**.

This is a real gap. Pick one:

1. Extend `recomputeWorkflowAfterActionWrite.js` (Part 10 helper) to
   return a per-level `completed_groups` diff, accumulated in
   `fireTrackerSubscription`, and have Part 11's `fireGroupOnComplete`
   also fan out the accumulated list.
2. Decide explicitly that v1 only fans out for the originating submit's
   workflow, and document that tracker-propagated parent group
   completions are handled by the periodic reconciliation job (concept
   already names that as the cancel-side / leak mitigation).

Either is defensible; the design has to pick. Mention this in Part 11's
"Contract to neighbours" too — Part 10's `fireTrackerSubscription`
either calls Part 11's helper per level (option 1) or it doesn't
(option 2) and the decision lands here.

### 6. `CancelWorkflow` claim is over-specified

> **Resolved.** Dropped the "(or returns an empty one)" disjunction; design now commits to the absent-key shape and cross-links to `CancelWorkflow.js:132` + Part 7's CancelWorkflow integration.

[design.md:30](../design.md): "Implementation: `CancelWorkflow` doesn't
return a `completed_groups` list (or returns an empty one)".

The "or returns an empty one" disjunction is dead. Looking at the
on-disk implementation
([`CancelWorkflow.js:132`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js)):

```js
return { action_ids: actionIds, event_id: null, tracker_fired: null };
```

There's no `completed_groups` key at all. [Part 7 § CancelWorkflow
integration](../../_completed/07-group-state-machine/design.md:76–77) also
commits explicitly: "the handler's return shape stays
`{ action_ids, event_id: null, tracker_fired: null }`". Drop the
parenthetical alternative; commit to the absent-key shape and have Part
11's fan-out skip workflows that don't return `completed_groups`. (Today
that's automatic because the only caller path is the submit handler,
but the design should match the committed shape.)

### 7. Open question on per-hook auth is already resolved

> **Resolved.** Struck the open question; replaced the Part 13 contract bullet with a pointer to Part 13's "Auth by construction" section.

[design.md:58](../design.md) asks: "Per-hook auth — should `on_complete`
Apis carry the same `hook.auth.roles ⊇ action.access.roles` build-time
check that action-level hooks do? … Decide during implementation."

[Part 13 § Auth by construction](../../13-resolver-apis/design.md:37–40)
already dissolves this question for both action hooks and group
`on_complete`: the resolver synthesizes `auth.roles` directly from
`action.access.roles` (for hooks) or "the union of `access.roles`
across the group's actions" (for `on_complete`), never `auth.public:
true`. The gate holds by construction; there is no separate validation
pass and nothing for Part 11 to decide.

Strike the open question and the "Contract to neighbours" bullet that
follows ("Part 13 baked-in hook-auth check may need extending"). Replace
with a one-liner pointing at [Part 13 § Auth by construction] so
readers don't go hunting for the answer.

### 8. Payload contract bullet "user inherited via callApi auth context" is mis-stated

> **Resolved.** Payload-shape bullet now puts `user: context.user` explicitly on the payload (mirrors Part 9's pre/post hook contract) and adds a one-line note that the third-arg `{ user }` is the auth context, not a payload-injection mechanism.

[design.md:19](../design.md): "`user: { id, profile, roles }` (inherited
via callApi auth context)".

`context.callApi(endpoint, payload, { user })` passes `user` as the
**auth context** for the target Api; it doesn't auto-inject `user` into
the payload. If the v1 `on_complete` payload contract is supposed to
include `user` (which makes sense for hooks that want to attribute
side-effects to the actor without re-reading the auth context), the
fan-out must put it on the payload explicitly:

```js
await context.callApi(
  { id: derivedApiId, module: "workflows" },
  {
    workflow_id,
    workflow_type,
    group_id,
    group_title,
    event_id: context.eventId,
    user: context.user, // <-- explicit on payload
  },
  { user: context.user }, // <-- auth context, separate
);
```

Either commit to that shape (recommended — it mirrors the action-hook
pre/post payload contract Part 9 ships, which carries `user` on the
payload) or drop `user` from the documented payload and have the hook
read it via `_user` operator on its own routine. Don't leave it
ambiguous.

### 9. `group_title` source isn't pinned

> **Resolved.** Payload-shape bullet now pins each field's source: `workflow_id` ← `context.workflow._id`, `workflow_type` ← `context.workflow.workflow_type`, `group_id` ← entry `id`, `group_title` ← `workflowConfig.action_groups[].title` indexed by `group_id`, `event_id` ← `context.eventId`.

[design.md:18](../design.md) commits `group_title` to the payload but
doesn't say where it comes from. The originating workflow's
`workflowConfig.action_groups[].title` is the natural source — it's the
same value Part 7's resolver already validates. Make it explicit:
`group_title` is read from `workflowConfig.action_groups[].title`
indexed by the entry's `id`, and is required (Part 7 already validates
`title` is a non-empty string).

Same nit applies to `workflow_type` — `context.workflow.workflow_type`
is the obvious source; spell it out so reviewers don't have to derive
it.

## Minor

### 10. Verification doesn't cover the resolver-derived api id

> **Resolved.** Added the "Api id template pinned" unit test plus a "Payload contract" assertion to the Verification list.

[design.md:48–53](../design.md) lists unit tests but none assert what
api id `fireGroupOnComplete` actually calls. Given finding #1's
unimplementability today, that assertion is the most important one
to add — once finding #1 lands, add a test like:

> Given a fixture with `action_groups: [{ id: 'phase-1',
on_complete: { routine: [...] } }]` and `workflow_type: onboarding`,
> a submit that completes phase-1 fires `callApi` with
> `{ id: 'workflow-onboarding-group-phase-1-on-complete', module: 'workflows' }`.

### 11. "Returns nothing — fan-out runs after all writes are durable" is misleading

[design.md:22](../design.md) says the function returns nothing. But
finding #5 (tracker-propagated parent fan-out) might need an
accumulator, and the post-hook (step 11) payload might want to
surface which `on_complete` hooks fired (for the same reason
`tracker_fired` is surfaced — hooks that need to react to "did this
submit kick off downstream work" want the signal). At minimum, return
the list of `{ group_id, on_complete_api_id, success }` so post-hook
and the response can surface it; even if the response field is left for
a follow-up, the helper's return is cheap to populate now.
