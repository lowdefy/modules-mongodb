# Review 3 — Part 09 hook invocation

Focus: source-of-truth verification against shipped code (Part 6 handler,
`computeAutoUnblocks`, `buildDefaultLogEventPayload`) and cross-design
coordination with Part 13's pending handler work + Part 29's
propagate-everywhere posture. Looking for factual claims in the design that
don't match the implementation, prerequisite contracts that haven't shipped,
and merge-flow contracts that work in isolation but conflict with neighbours.

## Findings

### 1. Auto-unblock entries don't arrive in "plural shape" — they arrive keyless

> **Resolved.** Restated normalization as bilateral in `design.md` — both pre-hook and auto-unblock entries are normalized to engine-internal `{ type, keys, ... }` shape inside `mergePreHookActions.js` (kept upstream `computeAutoUnblocks` untouched). Task 02 updated to match. The keyed-action fan-out question raised in passing (auto-unblock only matches `doc.key === null` today) is split out as draft [Part 31 — Keyed auto-unblock fan-out](../../../31-keyed-auto-unblock-fanout/design.md) for team discussion; out of scope for Part 9.

[design.md:48](../design.md):

> The merge function normalizes pre-hook entries to the engine-internal
> `{ type, keys, status, fields, force }` shape before the collision pass:
> singular `key` → `keys: [<key>]`; omitted/null key → `keys: [null]`.
> **Auto-unblock entries from Part 7 already arrive in plural shape.**

That last sentence is wrong against shipped code.
[`computeAutoUnblocks.js:75–78`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js):

```js
return [...unblockedTypes].map((type) => ({
  type,
  status: "action-required",
}));
```

Auto-unblock entries carry **no `keys` field at all** — not singular `key`,
not plural `keys`. The current write loop tolerates this via the default at
[`handleSubmit.js:188`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)
(`const keys = entry.keys ?? [null];`), which fans the keyless entry across
every matching action doc.

This matters because Part 9's collision rule is "evaluated per `(type,
single-key)` pair after both pre-hook and auto-unblock entries are expanded
across their `keys` arrays" ([design.md:50](../design.md)). With auto-unblock
entries having no `keys` to expand, the merge function as described would
either:

- skip the expansion for auto-unblock entries and miss `(type, null)`
  collisions with pre-hook entries that normalized to `keys: [null]`; or
- treat `undefined` `keys` as a special case (different default than pre-hook
  entries), which is the exact "two shapes in one loop" complexity the
  normalization pass exists to avoid.

**Fix.** Restate the normalization step as bilateral: both pre-hook entries
**and** auto-unblock entries are normalized to the engine-internal `{ type,
keys, ... }` shape before the collision pass, with `keys: undefined` →
`keys: [null]` (matching the write-loop default).

Also worth deciding whether the normalization belongs in the merge function
(as the design currently implies) or in `computeAutoUnblocks` itself —
pushing it upstream into Part 7's producer keeps the merge function's input
contract simple and avoids two callers having to remember to do the same
defaulting. Either is fine; pick one.

### 2. `buildDefaultLogEventPayload(comment)` is unshipped and unscoped

> **Resolved.** Picked option (a): Part 9 owns the fold-in. Created [Task 9 — Extend `buildDefaultLogEventPayload`](../tasks/09-extend-build-default-log-event-payload.md); added to `tasks.md` as a prerequisite blocking Task 3 (four-layer merge) and Task 7 (handler wiring extends `logEventInputBag` with `comment`). `design.md` line 59 rewritten to point at Task 9 instead of Part 13's "Pending handler work". [Part 13 § Pending handler work](../../13-resolver-apis/design.md#pending-handler-work-part-6-follow-up) annotated as superseded.

[design.md:54](../design.md) commits the four-layer event merge with layer 3
(runtime `comment`) folded into the bottom layer:

> Engine default from part 8's `buildDefaultLogEventPayload` (imported as
> the bottom layer; returns the unkeyed `{ type, display, references,
> metadata }` shape).

And [design.md:59](../design.md):

> Per Part 13 § Pending handler work step 2, layer 3 (runtime `comment`) is
> folded into `buildDefaultLogEventPayload` itself — the imported bottom-layer
> function accepts `comment` and returns layers 1 + 3 already composed.

Shipped [`buildDefaultLogEventPayload`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js)
**does not accept `comment`**. The function signature is
`{ workflow, action, actionConfig, interaction, current_key, status_before,
status_after, appName }` — no `comment` parameter, no `metadata.comment`
injection.

Per [Part 13 § Pending handler work (part 6 follow-up)](../../13-resolver-apis/design.md#pending-handler-work-part-6-follow-up):

> The handler side is **not yet wired**; until the steps below land, the
> resolver passes `comment` to the handler but nothing reads it.

So this is somebody's pending work — but whose? The design treats it as a
fait accompli ("Per Part 13 § Pending handler work step 2…") and instructs
Part 9's implementer to consume the already-composed layer-1+3 output. But
nothing has scheduled the fold-in: Part 13 frames it as a "part 6 follow-up";
Part 6 is in `_completed/`; no separate part owns it; Part 9's `tasks.md`
doesn't include it.

Concrete consequences:

- Part 9's task 7 wires the four-layer merge, but layer 3 is silently missing
  until `buildDefaultLogEventPayload` is extended. Verification test from
  [design.md:108](../design.md) ("`metadata.comment` survives a YAML
  override of other `metadata.*` fields") fails by default.
- Part 9's `tasks.md` lists no task for the `buildDefaultLogEventPayload`
  modification — implementer reading tasks-only doesn't know it needs to
  ship.

**Fix.** Pick one:

- **(a)** Add the `buildDefaultLogEventPayload` extension as an explicit Part 9
  task (a new task 0, run before tasks 1–4, or fold into task 3
  `mergeEventOverrides.js`). Update [design.md:59](../design.md) from "Per
  Part 13 § Pending handler work…" to "This part ships the
  `buildDefaultLogEventPayload(comment)` extension as a prerequisite to the
  four-layer merge."
- **(b)** Hard-block Part 9 on a separate "Part 13 follow-up" task landing
  first. Update the Depends-on section to call this out alongside the
  `runRoutine.js` upstream tweak, and note that Part 9's task 3 / task 7
  can't ship until the fold-in lands.

Either way, name the task and the owner. "Pending handler work" sitting in
Part 13 with no owner is exactly the kind of unscheduled blocker the
design-source-of-truth rule is meant to surface.

### 3. The existing mid-write error catch contradicts the propagate-everywhere contract this part inherits

> **Resolved.** Picked option (b): Part 9 ships with the catch in place; removal is owned by [Part 29 Task 5](../../29-error-model-cleanup/tasks/05-handlesubmit-remove-catch-converter.md) (already exists in Part 29's task list). Added a "Mid-write catch — known inconsistency window" subsection to `design.md` § Pre-hook abort modes explaining the bounded two-failure-posture state. `Depends on` now calls out Part 29 Task 5 as a parallel-landing follow-up (not a hard-block). Added a verification bullet describing the current vs post-removal behaviour. Task 7's Notes section pinned: the existing `try`/catch stays untouched; pre-hook call is positioned above the try block.

[design.md:66](../design.md) commits the propagate-everywhere posture:

> A pre-hook aborts the lifecycle in one of two ways. The choice belongs to
> the hook author; both modes propagate as throws through the engine —
> `invokePreHook.js`, `handleSubmit.js`, and the plugin handler **catch
> nothing**. … Same one-rule propagate-everywhere failure posture as the rest
> of the 11-step lifecycle ([Part 29 § D6](…)).

But [`handleSubmit.js:185–333`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)
ships a wrapping `try { … } catch (err) { … }` around steps 4–6 that:

1. Catches any throw from `updateAction`, `recomputeWorkflowAfterActionWrite`,
   or the form-data `$set`.
2. Force-pushes an error transition onto the user-submitted action.
3. Returns a partial `{ action_ids, completed_groups: [], event_id: null,
   tracker_fired: null, pre_hook_response: null, post_hook_response: null,
   error_transition: { reason, error_message, error_metadata } }`.

So the handler today **does catch sub-step throws** and synthesizes a
non-throwing partial-return shape with an undocumented `error_transition`
field — directly contradicting both [Part 29 § D6](../../29-error-model-cleanup/design.md#d6-propagate-everywhere--no-engine-side-catching-of-sub-step-throws)
and [Part 29 § change 5](../../29-error-model-cleanup/design.md#proposed-change)
(which collapses the success return to 6 fields, no `error_transition`).

Part 9's design committed to the new contract but doesn't say what happens
to the existing catch block. Two readings, neither pinned:

- **(a) Part 29 removes the catch as part of its scope** — but Part 29's
  scope is the error-model cleanup itself; the handler-side fold-in isn't
  enumerated in Part 29's task surface either.
- **(b) Part 9 removes the catch as part of step-2 wiring** — but Part 9's
  `tasks.md` task 7 only describes "Wire step 2 into `handleSubmit.js`:
  invoke pre-hook before step 3; apply status / actions / event-overrides /
  form-overrides merges; surface `pre_hook_response` on the return. Throws
  propagate transparently." That last sentence implies the catch goes, but
  doesn't name removing it.

If the catch stays and Part 9's `:reject` path also propagates, the
implementer ends up with inconsistent behavior: a pre-hook throw (step 2)
propagates to the caller, but a step-4 `updateAction` throw is caught,
force-writes an error transition, and returns a partial. That's exactly the
"two failure modes in one handler" trap [Part 29 § D6](../../29-error-model-cleanup/design.md#d6-propagate-everywhere--no-engine-side-catching-of-sub-step-throws)
exists to eliminate.

**Fix.** Pin it. Add to Part 9's task 7 (or as a separate task): "Remove the
existing `try { … } catch` block in `handleSubmit.js:185–333`. Sub-step
throws (steps 4–6, 7, 8, 10) propagate untouched. The `error_transition`
field is removed from the return-shape JSDoc." Update the verification to
add: "A mid-write throw (e.g. `updateAction` failure on step 4) propagates
to caller; no `error_transition` field on the response; partial writes from
prior loop iterations stay (deliberately non-atomic, same posture as
post-hook throw)."

If the catch is intentionally being kept for now (e.g. Part 29 hasn't shipped
the wrapping `runRoutine.js` tweak that classifies the propagated error),
say so explicitly: "Part 9 ships with the existing mid-write catch in place;
the catch is removed in a separate fold-in once Part 29's upstream
`runRoutine.js` tweak lands." That keeps the propagate-everywhere claim
honest.

### 4. `params.hooks` resolution + skip rules are undocumented

> **Resolved.** Named the slot (`context.params.hooks`) and pinned the skip-on-missing posture in `design.md` § `invokePreHook.js` and § `invokePostHook.js`. All three undefined levels (`params.hooks`, `[interaction]`, `.pre`/`.post`) collapse to a no-op return-null, with downstream consequences enumerated (three-layer event merge, no `actions[]` contributions, no `form_overrides`, status resolver falls back to engine+YAML). Tasks 5 and 6 updated with three explicit per-level skip test cases each.

[design.md:15](../design.md):

> Resolves `hooks[interaction].pre` from the endpoint config (baked in by
> [part 13](…)). The id follows the template `update-action-{action_type}-
> {interaction}-pre` (post-hook: `…-post`)…

This pins the id template but not the resolution path or skip semantics:

- **Where on `context`** does the merge function read `hooks` from? Likely
  `context.params.hooks`, but the design says "from the endpoint config"
  without naming the slot. (Aside: [`makeWorkflowApis.js:27`](../../../../../modules/workflows/resolvers/makeWorkflowApis.js)
  reads `action.hooks[interaction]` from the workflow config at resolver
  time, but the *runtime* payload bakes those id strings into the routine
  step's `properties`, surfacing as `context.params.<slot>` — name the slot.)
- **Skip semantics.** What happens when:
  - `params.hooks` is undefined (no `hooks:` declared on the action at
    all)?
  - `params.hooks[interaction]` is undefined (this interaction has no hook
    declared)?
  - `params.hooks[interaction].pre` is undefined but `.post` is set, or
    vice versa?

Each case should be a no-op invocation: `pre_hook_response: null` on the
return, four-layer event merge collapses to three layers, action[] merge
collapses to "just the engine-computed list + currentActionId entry."
But the design doesn't say so, and an implementer reading verbatim might
throw on missing keys (`Cannot read property 'pre' of undefined`).

This is the same trap [Part 13 § Hook emission](../../13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate)
sidesteps on the resolver side ("emit hook Apis only when the action declares
them" — the resolver skips emission, doesn't emit a no-op stub). The handler
needs the matching skip-on-missing posture.

**Fix.** Add a sentence to the `invokePreHook.js` section: "Read the hook
id from `context.params.hooks?.[interaction]?.pre`. If undefined (no hook
declared at any of the three levels), skip the invocation, return `null`,
and the four-layer merge collapses to three layers (no layer-4 pre-hook
contribution; no `actions[]` entries from pre-hook; no `form_overrides`)."
Mirror for `invokePostHook.js`.

### 5. Pre-hook `actions[]` writes on other action types skip the per-action auth gate

> **Resolved.** Picked option (a): trusted-channel posture, no per-entry access check. Added a "Trusted-channel posture — no per-entry access check" paragraph to `design.md` § `actions[]` merge bullet, naming the contract explicitly: step-1 per-endpoint role check is the sole user-side auth boundary; pre-hook `actions[]` and `force: true` both write without per-entry gating; pre-hook authors who want cross-action writes gated do so inside the hook routine. Consistency rationale included (matches `force`, `event_overrides`, `:reject` all being trusted-channel surfaces).

[`handleSubmit.js:115–124`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)
enforces the role check at step 1, but **only against the submitted action's**
`actionConfig.access.roles`:

```js
const accessRoles = actionConfig.access?.roles ?? [];
const userRoles = context.user?.roles ?? [];
if (accessRoles.length > 0) {
  const intersects = accessRoles.some((role) => userRoles.includes(role));
  if (!intersects) { throw new Error(...); }
}
```

A pre-hook can return `actions: [{ type: 'OTHER_TYPE', status: 'done' }]`,
and the step-4 write loop fans that entry through `updateAction` with no
further role check. Net effect: a user who has access to action A can,
through any pre-hook on A that writes to action B, drive B's state changes
**without** the engine verifying they have access to B.

Two readings, both plausible:

- **(a) By design.** Pre-hooks are server-side trusted code (authored by
  workflow YAML authors, not end users). A pre-hook's `actions[]` is the
  engine's controlled escape hatch — if the author wanted access to other
  action types gated, they can call a separate hook or check roles
  themselves.
- **(b) A gap.** The per-action role gate at step 1 implies action-level
  access boundaries are real and enforced. Pre-hooks silently routing
  around them violates the boundary.

Either is defensible, but the design doesn't address it at all.

**Fix.** Pin the contract one way or the other:

- If (a): add a sentence to the `actions[]` merge bullet — "Pre-hook
  `actions[]` entries write through Part 6's loop with **no per-entry access
  check**. The user-side auth gate is the per-endpoint role check (step 1,
  on the submitted action). Pre-hook authors who want to gate writes on
  other action types do so inside the hook routine."
- If (b): commit to per-entry role check before the loop runs, with the
  matching verification bullet.

The same question applies to `force: true` on pre-hook entries — they bypass
the priority rule, which is a write-time invariant rather than an access
check, so probably fine. But (a)-style "pre-hooks are trusted code"
deserves an explicit one-liner so the next implementer (or reviewer) doesn't
re-derive it.

## Minor

### 6. Step-1 `currentActionId` entry's `keys` shape in the collision pass

> **Resolved.** Added a clarifying sentence to `design.md` § `currentActionId` collision naming the step-1 entry's `keys: undefined → [null]` expansion explicitly (with the `handleSubmit.js:152–161` reference). Task 2's normalization step expanded to enumerate all three inputs (step-1, auto-unblock, pre-hook) so the implementer applies the same default uniformly.

[`handleSubmit.js:152–161`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)
shapes the step-1 entry as:

```js
actions: [{
  type: action.type,
  status: targetStatus,
  keys: params.current_key ? [params.current_key] : undefined,
  fields: params.fields,
}]
```

When `current_key` is null/undefined, `keys` is `undefined` (matching the
write-loop default at `:188`). The design's "Engine-internal normalization"
paragraph normalizes pre-hook entries (singular → plural; null → `[null]`)
but doesn't explicitly say what happens to the existing step-1 entry under
the collision pair-extraction. The collision rule compares `(type, key)`
after expansion — for the step-1 entry with `keys: undefined`, expansion
needs to produce `[(type, null)]`.

Likely fine in practice (the same `keys ?? [null]` default applies), but
worth a one-liner: "The step-1 `currentActionId` entry is also subject to
the same `keys: undefined → [null]` expansion before collision evaluation."

### 7. `resolveTargetStatus` throw precedes the pre-hook layer

> **Resolved.** Picked the intentional reading. Added a "Required inputs are validated before the pre-hook fires" paragraph to `design.md` § three-layer status precedence — names `resolveTargetStatus` as the step-1 site that throws on missing `current_status`, clarifies the three-layer story is about *resolution* not *required-input rescue*, and tells authors who need hook-derived target status that they can return any `status` via layer 3 but cannot bypass the layer-1 input contract.

[`handleSubmit.js:33–37`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)
throws on missing `current_status` for task `submit_edit`:

```js
if (interaction === "submit_edit" && actionConfig.kind === "task") {
  if (typeof params.current_status !== "string") {
    throw new Error("SubmitWorkflowAction: task submit_edit requires caller-supplied current_status");
  }
}
```

`resolveTargetStatus` is called at step 1 ([`handleSubmit.js:136`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) — **before** the pre-hook (step 2). So a pre-hook
that *intends* to override the engine default to (e.g.) `done` regardless of
caller-supplied `current_status` can't actually rescue a missing
`current_status` — the handler throws before the pre-hook fires.

This is probably intentional (the engine needs the input to compute the
default), but the three-layer story ("engine default < YAML < pre-hook")
reads as "pre-hook can override anything" if you don't notice the throw is
above pre-hook. Worth a one-liner in the three-layer section: "Engine default
is computed at step 1 (pre-hook); any required input the engine default
needs (e.g. `current_status` for task `submit_edit`) must be present on the
payload — pre-hook cannot rescue missing required inputs because it fires
after the default is computed."

If the intent is actually that the pre-hook **should** be able to override
the layer-1 throw (e.g. compute target status purely from hook context),
the resolver needs to defer the engine default until after the pre-hook
returns — bigger change, worth pinning if intended.
