# Review 1 — Part 09 hook invocation

Focus: cross-design consistency with Parts 6, 8, 13, and with the submit-pipeline
spec; payload / return-shape contracts; merge-layer ordering.

## Blockers

### 1. Three-layer event merge drops the `comment` injection layer

> **Resolved.** Rewrote the `event_overrides` bullet as a four-layer merge (engine default → YAML `event_overrides[interaction]` → runtime `comment` → pre-hook `event_overrides`), matching Part 13's Comment mapping commitment verbatim. Updated the verification bullet to require a YAML-clobber regression test and a pre-hook-overrides-comment test. Chose option (b) over (a) because (a) only works if comment composes at layer 1, which is exactly the YAML-wins ordering Part 13 ruled out.

[design.md:32](../design.md) commits the `event_overrides` merge as:

> merged over `action.event[interaction]` (YAML), which merges over the engine
> default from part 8's `buildDefaultLogEventPayload` … **Three-layer merge
> implemented as a single function.**

But [Part 13 § Comment mapping](../../13-resolver-apis/design.md) commits a
**four-layer** order, with the runtime `comment` field injected as a distinct
layer between YAML and pre-hook:

> 1. Engine defaults
> 2. Action YAML `event.{interaction}.{type|display|metadata}` — baked into `event_overrides`
> 3. **Runtime `comment` field** — handler injects into `metadata.comment` if present and non-empty
> 4. Pre-hook return `event_overrides` — unkeyed runtime bag, merges last

Part 13 is explicit that layer 3 sits "above the part-9 layer-2
(`action.event[interaction].metadata`) override so a YAML-defined metadata field
can't clobber the user-supplied comment." An implementer reading Part 9 verbatim
writes a 3-layer merge that either drops user comments entirely or lets a YAML
`event.{interaction}.metadata.comment` clobber the user's input.

**Fix.** Restate the merge as four layers and pin which layer owns the comment
injection. Two equivalent shapes:

- **(a)** Treat comment as part of the engine default (compose `metadata.comment`
  into the bottom layer before invoking the merge). Keeps the merge function
  three-layer but moves the responsibility into `buildDefaultLogEventPayload`'s
  caller. Cross-link Part 13's "Comment mapping" task so the implementer
  doesn't drop it.
- **(b)** Make the merge function four-layer with comment as layer 3 between
  YAML and pre-hook. Matches Part 13's commitment verbatim.

Either way, also update the Verification bullet ("Event: same three layers")
to call out the comment merge — without a test asserting `metadata.comment`
survives a YAML override, the regression is invisible.

### 2. Build-time hook auth gate contract is stale

> **Resolved.** Struck the "Build-time hook auth gate (handed off to part 13)" section, the Out-of-scope bullet referencing `hook.auth.roles` validation, and the Contract bullet asserting build-time validation. Replaced with a short "Hook auth — by construction in part 13" section pointing at [Part 13 § Auth by construction](../../13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate). Matches the resolution applied in Part 11 review-1 #7.

[design.md:51–53](../design.md) and the Contract to neighbours bullet
([design.md:84](../design.md)) both assert:

> The auth gate (`hook.auth.roles ⊇ action.access.roles`, reject `auth.public: true`)
> is a build-time check in part 13.
>
> Part 13 validates `hook.auth.roles ⊇ action.access.roles` at build time …

That contract no longer holds. [Part 13 § Hook emission](../../13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate)
(the section header itself says "replaces the build-time auth gate") flips
hooks to inline-routine authoring and synthesizes `auth.roles` directly from
`action.access.roles`:

> **Auth by construction.** The resolver synthesizes each emitted hook Api's
> `auth:` block from `action.access.roles` directly (`hook.auth.roles ≡
> action.access.roles`, never `auth.public: true`). The "`hook.auth.roles ⊇
> action.access.roles`" gate holds by construction — no separate validation
> pass, no cross-resource lookup, no `vars.apis` input needed.

There is no build-time validation pass and nothing for Part 9 to "assume."
Part 11's review-1 finding #7 already caught the same staleness in Part 11.

**Fix.** Strike the "Build-time hook auth gate (handed off to part 13)" section
and the matching Contract bullet. Replace with a one-liner pointing at
[Part 13 § Hook emission ("Auth by construction")](../../13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate)
so readers know the gate holds by construction, not by validation.

### 3. `context.callApi` invocation: `module` value is hand-wavy

> **Resolved.** Pinned the literal `module: 'workflows'` and spelled out the hook id template `update-action-{action_type}-{interaction}-{pre|post}`. Cross-linked `dispatchNotifications.js:17–21` as the canonical call shape and noted Part 11 reuses the same pattern.

[design.md:14](../design.md):

> Invokes via `context.callApi({ id: <hook-api-id>, module: <auto-from-resolver-config> }, payload, { user })`.

"`<auto-from-resolver-config>`" is not a real value. Hook Apis are emitted by
[Part 13](../../13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate)
"alongside the `update-action-{action_type}` endpoint" — i.e. under the
workflows module entry id. Per [Part 11 review-1 finding #2](../../11-group-on-complete-fanout/review/review-1.md) and
[dispatchNotifications.js:17–21](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js),
the canonical call shape for a module-scoped Api is:

```js
await context.callApi(
  { id: derivedApiId, module: 'workflows' },
  payload,
  { user: context.user },
);
```

**Fix.** Pin the literal `module: 'workflows'` (or whatever the workflows
module entry id resolves to at runtime — clarify which) and cross-link
`dispatchNotifications.js` as the canonical call shape. Without the explicit
value, an implementer falls back to the bare-string form and silently
dispatches into the consuming app's own-Api namespace instead of the
workflows-module-scoped one — the same trap Part 11 was caught in.

Also worth restating: the derived hook id is
`update-action-{action_type}-{interaction}-{pre|post}` per
[Part 13 § Hook emission](../../13-resolver-apis/design.md#hook-emission-replaces-the-build-time-auth-gate).
Spell out the template so readers don't have to chase Part 13 to know what
goes in the `id` slot.

## Findings

### 4. Pre-hook payload omits the `comment` field

> **Resolved.** Added `comment` to the pre-hook payload as a top-level scalar (`null` when not supplied). Pinned inspect-only — pre-hooks rewrite the comment via `event_overrides.metadata.comment` on the return (the layer-4 channel committed in #1), not via a separate top-level return field. Matches the spec's pre-hook return shape (no `comment` slot).

[design.md:15–19](../design.md) lists the pre-hook payload as:

> `form`, `form_review`, `fields`, `current_status`.

But Part 13's emitted endpoint payload includes a runtime `comment` field
([Part 13 § Comment mapping](../../13-resolver-apis/design.md)), and
[submit-pipeline/spec.md § Pre-hook payload](../../../workflows-module-concept/submit-pipeline/spec.md#pre-hook-payload)
makes no commitment either way (silent on comment).

This omission matters in two cases:

- A pre-hook that wants to override `event_overrides` based on the user's
  comment (e.g. "if comment is empty, suppress the notification") needs to
  see it.
- A pre-hook that wants to validate or transform the comment before it lands
  on the event (e.g. PII scrubbing) needs to see it — and ideally needs a
  way to write it back, but that's a separate question for a follow-up.

**Fix.** Add `comment` to the pre-hook payload shape, alongside `form`,
`form_review`, `fields`. Note that it's a free-text scalar (matches Part 13's
"no schema validation" commitment). If pre-hooks shouldn't be able to mutate
the comment (only inspect it), say so — otherwise an implementer might wire a
`pre-hook.return.comment` override that nobody has thought through.

### 5. `hook_error` return shape contradicts Part 6's partial-return commitment

> **Resolved.** Restated the `hook_error` return as the full partial shape (`action_ids: [<submitted_action_id>]`, `completed_groups: []`, `event_id: null`, `tracker_fired: null`, `pre_hook_response: <pre-hook return>`, `post_hook_response: null`). Chose `event_id: null` on the error path (rather than surfacing the handler-entry eventId) to keep the field's semantics unambiguous — `event_id` in the return means "events-collection doc id," and no doc is written on error paths since step 7 is skipped. Folded the same change into Part 6's mid-write error return so both error entries (`reason: <step-name>` and `reason: 'pre-hook'`) carry the identical partial shape. The handler-entry `eventId` still stamps `status[].event_id` on the error transition for in-invocation traceability — it just isn't surfaced under the return's `event_id` field.

[design.md:34](../design.md) on `hook_error`:

> Returns `{ pre_hook_response: <pre-hook return>, ... rest null }`.

[Part 6's mid-write failure shape](../_completed/06-submit-action-writes/design.md)
commits a different partial return for the same kind of abort (it explicitly
calls out that `hook_error` returns "take the same path with `reason: 'pre-hook'`"):

> force-push `{ stage: error, created, reason: <step-name>, error_message,
> error_metadata }` onto the action's `status[]` via `updateAction(...force: true)`;
> skip the remaining lifecycle steps; return partial `{ action_ids, event_id, ... }`.

So Part 6 says `action_ids` and `event_id` are populated on the error return;
Part 9 says "rest null."

Specifically:

- `action_ids` is the submitted action's id (whose error transition was just
  written) — non-null. Part 6's force-push wrote a `status[]` entry on it.
- `event_id` is the handler-entry-generated eventId that Part 6 stamps onto
  every write (per [engine/spec.md:213](../../../workflows-module-concept/engine/spec.md)
  "one id per invocation"). It lives on the error-transition's
  `status[].event_id` slot. Whether the response surfaces it is a contract
  choice — but "rest null" forecloses on the contract without saying so.
- `completed_groups: []` (literal placeholder, matches part 6 step 6's
  return-shape skeleton).
- `tracker_fired: null` (no status change; no tracker subscription fires).
- `post_hook_response: null` (post-hook never ran).

**Fix.** Restate the `hook_error` return as the same partial shape Part 6
commits, with `pre_hook_response` populated. Concretely:

```
{
  action_ids: [<submitted_action_id>],
  completed_groups: [],
  event_id: <handler-entry eventId>,   // the eventId stamped on the error transition
  tracker_fired: null,
  pre_hook_response: <pre-hook return>,
  post_hook_response: null,
}
```

If the intent is actually to omit `event_id` on the error path (e.g. because
no log event was dispatched), say so explicitly and reconcile with Part 6.

### 6. `post_hook_error` is both committed and an open question

> **Resolved.** Committed lean-surface: post-hook failure surfaces as `post_hook_error: { message, metadata? }` on the return (non-fatal; null on success). Struck the "Optionally surface" hedge from the body, dropped the open question, and called out the deliberate departure from the spec's "logged but not propagated" posture (rationale: post-hooks commonly drive downstream side effects whose silent failure would mislead callers). Folded `post_hook_error: null` into Part 6's default return and into Part 9's `hook_error` partial return. Updated the verification bullet.

[design.md:41](../design.md): "Optionally surface as `post_hook_error` on the
response." [design.md:79](../design.md) Open questions: "silent swallow vs.
`post_hook_error` on response. Lean surface (visible to callers but non-fatal)."

The body sounds like a commitment ("Optionally surface…"); the Open Questions
section is still asking. Pick one. If `post_hook_error` ships, name it in the
return-shape skeleton ([Part 6's return shape](../_completed/06-submit-action-writes/design.md)
already lists `pre_hook_response` and `post_hook_response`; extend with
`post_hook_error?`). If it doesn't, drop the "Optionally surface" hedge and
commit to silent-swallow + log.

Per the spec's posture ([submit-pipeline/spec.md § Post-hook return](../../../workflows-module-concept/submit-pipeline/spec.md#post-hook-return)):
"Failures logged but not propagated to caller" — that leans toward silent
swallow. If Part 9 wants to deviate (lean surface, per the open-question
preference), call it a deliberate departure from the spec and update the
return shape in Part 6 as a fold-in.

### 7. `actions[]` entry shape under-specified

> **Resolved.** Enumerated the six-field entry shape (`type`, `key?`, `status?`, `fields?`, `upsert?`, `force?`) matching the spec, with per-field semantics (key=keyed-only, status-omit=form-data-only-write, etc.). Pinned the collision rule as **replace** (not field-overlay): when a pre-hook entry's `(type, key)` matches an auto-unblock entry, the pre-hook entry wholly replaces the auto-unblock entry in the merged list. Rationale: silently mixing engine-default fields with author intent invites "why is status X when my hook said Y" traps. Cross-linked Part 6 § Payload as the canonical entry-shape superset and write-loop owner.

[design.md:31](../design.md): "Each entry may carry `force: true` to bypass the
priority rule on its own write. `upsert: true` spawns instanced actions per
[part 4](../04-workflow-config-schema/design.md) schema."

[submit-pipeline/spec.md § Pre-hook return](../../../workflows-module-concept/submit-pipeline/spec.md#pre-hook-return-all-fields-optional)
commits a richer shape:

```
actions: array            # entries: { type, key, status, fields, upsert, force }
```

Part 9 doesn't enumerate which fields participate in the `(type, key)`
collision merge with auto-unblocks, and doesn't pin the behaviour when:

- pre-hook entry has `fields` but no `status` (form-data-only write on a
  different action?);
- pre-hook entry has `status` for an action whose existing transition would
  also be touched by an auto-unblock (engine pushes `action-required`,
  pre-hook says `done` — pre-hook wins per "Pre-hook entries take precedence
  on `(type, key)` collision", but is the auto-unblock entry dropped or does
  it still appear in `actions[]` as a no-op?);
- pre-hook entry omits `key` for a non-keyed action (matches; collision rule
  works on `(type, undefined)`).

**Fix.** Enumerate the entry shape (matching the spec's six fields) and pin
the collision semantics: "On `(type, key)` collision the pre-hook entry
**replaces** the auto-unblock entry in the merged list (not a per-field
overlay)." Cross-link
[Part 6 § Payload](../_completed/06-submit-action-writes/design.md#payload)
since the internal `actions[]` superset shape lives there.

### 8. `current_status` field on the pre-hook payload isn't qualified

> **Resolved.** Restated the payload bullet as "`current_status` — caller-supplied for task `submit_edit` (status-selector pattern); `null` for form actions and all other interactions." Cross-linked Part 6's interaction → target-status mapping.

[design.md:17](../design.md) lists `current_status` unconditionally in the
pre-hook payload. But per
[Part 6 § Interaction → target-status mapping](../_completed/06-submit-action-writes/design.md#interaction--target-status-mapping-engine-default-only),
`current_status` is meaningful only for the task `submit_edit` status-selector
pattern. For form actions it's either absent from the payload or null.

This is a small one but it sets up implementer confusion: "do I always read
`current_status` from the payload? what's its value for an `approve` interaction
on a form action?" Restate as "`current_status` (caller-supplied for task
`submit_edit`; null for form actions and all other interactions)" — matches
Part 6's contract and avoids the implementer having to reverse-engineer it
from Part 6's interaction table.

## Minor

### 9. Lifecycle step numbers aren't named

> **Resolved.** Added a Goal-section closing line: "This part lights up step 2 (pre-hook, pre-write) and step 11 (post-hook, after all side effects) of the 11-step lifecycle skeleton committed by Part 6 § Lifecycle scaffold."

Part 9 implements step 2 (pre-hook) and step 11 (post-hook) of the 11-step
lifecycle skeleton committed by
[Part 6 § Lifecycle scaffold](../_completed/06-submit-action-writes/design.md#lifecycle-scaffold).
Part 9's body never names those step numbers. Part 11's design opens with
"Step 9 in `handleSubmit` now executes …" — same convention. Worth a
one-liner: "This part lights up step 2 (pre-hook, pre-write) and step 11
(post-hook, after all side effects) of the lifecycle skeleton from Part 6."

### 10. Pre-hook timeout open question presupposes no implementation hook

> **Resolved.** Added the decision inline in the `invokePreHook.js` section ("pre-hook and post-hook invocations omit `options.timeout`; the part-1 callApi default (10s) applies; revisit if real apps need a different value") and struck the open question.

[design.md:78](../design.md): "Default timeout for hook invocations — inherit
`context.callApi`'s default (10s) vs. tighter. Inherit; revisit if real apps
need different."

Part 1's `CallApiOptions` already includes a `timeout` field
([Part 1 § In scope](../_completed/01-call-api-primitive/design.md)). The open question
is really "do we set `options.timeout` explicitly on hook invocations" — and
the answer "inherit" means "don't pass `timeout`." Restate as a one-liner
decision in the body ("pre-hook and post-hook invocations omit
`options.timeout`; the call-api default applies") and strike the open
question.

### 11. Verification doesn't cover the `force` rejection case

> **Resolved.** Added verification bullet: pre-hook entries without `force` are subject to the priority rule; unreachable transitions are silently dropped per Part 6's per-entry semantics, surfaced in test output for assertion.

[design.md:64–74](../design.md) covers `force: true` honored on pre-hook
entries but doesn't test the opposite: a pre-hook entry without `force` that
attempts an unreachable transition (e.g. `done → action-required`) is
rejected by the priority rule (per
[Part 6 § Priority rule](../_completed/06-submit-action-writes/design.md#priority-rule)).
Add: "Pre-hook entries without `force` are subject to the priority rule;
unreachable transitions are silently dropped (per Part 6's per-entry semantics)
and surfaced in test output for assertion."

### 12. `form_overrides` collision semantics need pinning

> **Resolved.** Extended the `form_overrides` bullet to commit field-path-level merging (not document-level replace), with an inline example (`{ a: 1 }` + user `{ b: 2 }` → `$set` ops on both `a` and `b`). Added a matching verification bullet.

[design.md:33](../design.md): "Pre-hook overrides win on collision."

This matches [submit-pipeline/spec.md § Pre-hook return](../../../workflows-module-concept/submit-pipeline/spec.md#pre-hook-return-all-fields-optional)
("`form_overrides` merge rules: pre-hook wins over user-submitted `form` /
`form_review` on field collision"). The added detail worth committing: the
merge happens at the **field-path** level (matching Part 6's per-field `$set`
writes), not at the document level. So a pre-hook `form_overrides:
{ a: 1 }` plus a user `form: { b: 2 }` results in `$set` ops for both `a`
and `b`, not a wholesale replace. Worth a one-line clarification in the
verification list.
