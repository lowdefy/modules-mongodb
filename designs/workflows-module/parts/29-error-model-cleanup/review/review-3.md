# Review 3 — Part 29 error-model cleanup

Focus: a third pass against shipped code, the upstream Lowdefy state, and internal consistency between the proposed-change channel and the spec-rewrite text. The design's review-1 and review-2 surfaces are clean; this pass surfaces one stale precondition (the upstream PR has already merged), one internal contradiction (Change 2 vs the spec-rewrite text on `force: true`), one broken reference (`event_overrides.metadata` link), one unsubstantiated module-property claim (notifications idempotency), and one FYI on a pre-existing wart that the cleanup happens to retire.

## Blockers

### 1. The upstream "hard dependency" has already merged — design and Task 1 are stale

> **Resolved.** Added a "Done — shipped upstream" note to Task 1 citing commit `cc18b41e9` and flagging the SDK-version pin as the only remaining work. Updated the Task 1 row in `tasks.md` and the Ordering Rationale to reflect that the upstream change has shipped. Rewrote the design's Upstream-dependency section to past tense (status note, retained PR scope for context, replaced the "does not ship until upstream merges" sentence with the SDK-pin gate). Task 8's T1 dependency edge stays — it now means "requires the SDK version that includes `cc18b41e9` to be consumed" rather than "requires the upstream PR to merge."

The design's [Upstream dependency](../design.md#upstream-dependency) section ends with:

> Part 29 does not ship until the upstream PR merges. Part 29's implementation tasks block on it.

And [`tasks/01-upstream-lowdefy-reject-flag.md`](../tasks/01-upstream-lowdefy-reject-flag.md) opens a PR against the Lowdefy repo with three edits — `UserError.isReject`, `controlReject.js` passes the flag, `runRoutine.js` branches on `isReject` before `context.handleError`.

All three already ship in the sibling Lowdefy checkout. Verified against:

- [`packages/utils/errors/src/UserError.js:18`](../../../../../lowdefy/packages/utils/errors/src/UserError.js) — `constructor(message, { blockId, cause, isReject = false, metaData, pageId } = {})` with `this.isReject = isReject;` on line 24.
- [`packages/api/src/routes/endpoints/control/controlReject.js:40`](../../../../../lowdefy/packages/api/src/routes/endpoints/control/controlReject.js) — `const error = new UserError(message, { cause, isReject: true });`.
- [`packages/api/src/routes/endpoints/runRoutine.js:56-65`](../../../../../lowdefy/packages/api/src/routes/endpoints/runRoutine.js) — catch branches on `error.isReject` _before_ `context.handleError`, exactly as the design's prescribed code block (design lines 145-156) and Task 1's acceptance criteria (lines 56-64) spell out.

The change shipped under commit `cc18b41e9` ("feat(api): Propagate :reject status across runRoutine throw boundary.") on 2026-05-26 with `runRoutine.reject.test.js` covering the four behaviours Task 1 prescribes.

**Implications for Part 29:**

- Task 1 is obsolete. Either delete it from `tasks/tasks.md` and the task file (the cleanest fix — there's no work left to do upstream), or rewrite it as a one-line verification task ("verify cc18b41e9 is present on `develop` and pin the SDK version this monorepo consumes against it") and renumber the dependency edges in `tasks/tasks.md` (Task 8 currently depends on Task 1).
- The Upstream-dependency section in `design.md` should flip tense: state that the precondition has shipped, name the commit (or the SDK version that includes it), and remove the "Part 29 does not ship until the upstream PR merges" sentence. As written, a future reader will assume work is blocked.
- Task 8's "depends on T1" edge should drop to "depends on the SDK version that includes cc18b41e9 being consumed by the modules-mongodb monorepo" (a one-line check, possibly already true).

**Fix.** Update the Upstream-dependency section to read past-tense (commit landed, verify SDK version pin), delete or repurpose Task 1, and re-anchor Task 8's dependency edge accordingly.

## Findings

### 2. Change 2 says "no `force` needed"; the spec-rewrite text in the inventory still prescribes `force: true`

> **Resolved.** Dropped `force: true` from design.md line 185 (the engine/spec.md § Action `error` transition rewrite text) to match Change 2, D4's force-callers inventory, and the verification bullet at line 259. Task 02's draft of the spec text was already correct ("no `force` needed — `error.priority = 1` is below every non-terminal stage").

The design contradicts itself on the pre-hook error-push channel.

**Change 2 (line 10)** — the canonical statement of the new contract:

> A pre-hook that wants to push the action to `error` returns it through the regular `status` / `actions[]` channels (typically `actions: [{ ..., status: 'error' }]` — **no `force` needed** under the current priority table since `error(1)` is below every non-terminal stage).

Reinforced by the verification bullet at line 259:

> Pre-hook returning `status: 'error'` (no `force` needed — `error(1)` is below every non-terminal stage) writes the error transition cleanly via the normal priority path; no special `hook_error` branch invoked.

**Spec-rewrite text the design tells the implementer to land at engine/spec.md (line 185):**

> Adds: "Pre-hooks push `error` via `actions: [{ ..., status: 'error', **force: true** }]` when they need to mark the action errored ..."

The spec-rewrite text contradicts Change 2 — it prescribes `force: true` on pre-hook `actions[]` entries, despite Change 2 explicitly stating none is needed. If the implementer follows the inventory text verbatim, the concept spec ships with a `force: true` example that authors will then copy, defeating Change 2's "no special force needed" framing and re-introducing the priority-bypass friction D4 is trying to localise on `resolve_error`.

This is also internally inconsistent with D4 (line 98) which names only three remaining per-doc force callers — `resolve_error`'s recovery transition, tracker subscription, and `StartWorkflow`'s parent-link push — pre-hook `actions[]` is deliberately _not_ in that list.

**Fix.** Drop `force: true` from the spec-rewrite text on line 185. The pre-hook channel example should read `actions: [{ ..., status: 'error' }]` to match Change 2, D4's force-callers inventory, and the verification bullet at line 259. (Task 02's draft of this spec text should also be checked for the same drift.)

### 3. `event_overrides.metadata` link in D2a points at a non-existent anchor in engine/spec.md

> **Resolved.** Dropped the dead `engine/spec.md § Event overrides` link from D2a; left the Part 09 reference, which is the correct home for the `event_overrides` channel. `event_overrides` is a Part 9 pre-hook return field, not an engine-level spec concept.

D2a's diagnostic-context paragraph (line 67):

> Pre-hooks that want to capture diagnostics on an `error` push do so via `event_overrides.metadata` on the return — same channel for all other status pushes ([engine/spec.md § Event overrides](../../../workflows-module-concept/engine/spec.md), [Part 09 § event_overrides](../09-hook-invocation/design.md#pre-hook-return-merge)).

The link target `[engine/spec.md § Event overrides]` resolves to engine/spec.md with no fragment — and engine/spec.md has no "Event overrides" section. Verified against the file's section list:

> Plugin shape · Client and transaction model · Schema (Workflow doc, Action doc, Form data layout, Action `error` transition, Indexes) · Capabilities · References write contract · Tracker subscription · Idempotency · Priority rule · Ordering · Worked example · Open questions · Risks

The `event_overrides` channel lives in [Part 09 § Pre-hook return merge](../../09-hook-invocation/design.md#pre-hook-return-merge), which the same line correctly references. The engine/spec.md cross-link is dead.

The repeat at Change 2 (line 10) — "pre-hooks carry context into the log via `event_overrides.metadata` like every other status transition" — implies engine/spec.md documents the channel as a universal feature. It doesn't; it's a Part 9 contract.

**Fix.** Either drop the dead `engine/spec.md § Event overrides` link (leave only the Part 9 reference, which is correct), or — if the intent is to land an "Event overrides" section in engine/spec.md as part of Task 2's amendments — add that section to Task 2's edit inventory and make the design's claim accurate. The cleanest read of the design is the former: `event_overrides` is a Part 9 pre-hook return field, not an engine-level spec concept.

### 4. D6 bullet 4 claims "the notifications module is idempotent today" — the shipped module provides no such guarantee

> **Resolved.** Reframed D6 bullet 4: notifications idempotency is a notifications-module-contract concern (the `send-notification` API delegates to a consumer-supplied `send_routine` that is expected to dedupe on `event_ids`), not a Part 29 concern. Noted that the implementation we use today honours the contract, so the bounded blast-radius claim holds. A consumer whose `send_routine` doesn't dedupe would double-send on retry — out of scope for Part 29.

D6 bullet 4 (line 175), justifying the widened duplicate-write window under propagate-everywhere:

> the notifications module is idempotent today, so a step ≥ 8 throw + retry resolves to a single user-visible notification — the user-facing blast radius of this widened window is bounded.

The notifications module ships [`api/send-notification.yaml`](../../../../modules/notifications/api/send-notification.yaml) as:

```yaml
id: send-notification
type: InternalApi
routine:
  _module.var: send_routine
```

The entire send routine is supplied by the consuming app as a module var. The module itself has no dedupe logic, no `event_id` short-circuit, no "have I already sent this?" guard. Whether a retry produces a duplicate user-visible notification depends 100% on the consumer's `send_routine` implementation.

Two consequences:

- The "bounded blast radius" framing is aspirational, not factual. A consuming app whose `send_routine` blindly sends on every invocation (the default shape for a routine reading `event_ids` and calling Lambda / SendGrid / etc.) will double-send on retry.
- The design's claim doesn't match the responsibility-shift it implicitly asks for. If "the consumer's `send_routine` must be idempotent" is the actual contract, that belongs in the design (and ultimately in the notifications module's README), not asserted as a present-tense module property.

**Fix.** Restate D6 bullet 4 as a _consumer contract_, not a module property: "the consuming app's `send_routine` is expected to be idempotent across retries — the notifications module passes `event_ids` so a consumer can dedupe on that key; the user-visible blast radius is bounded _if_ the consumer honours the contract." Optionally: surface this expectation in the notifications module's README, or treat consumer-side idempotency as a follow-on documentation task. The "Out of scope" section already defers transactional atomicity — same posture works here.

## Minor

### 5. FYI — the catch-converter has a latent bug the cleanup retires for free

[`handleSubmit.js:309`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) reads `err.metadata ?? null` when building `error_transition.error_metadata`. The shipped `UserError` (verified at [`UserError.js:24`](../../../../../lowdefy/packages/utils/errors/src/UserError.js)) carries diagnostic data on `this.metaData = metaData` — capital D. A `UserError` reaching the catch-converter would have its `metaData` silently dropped from `error_transition.error_metadata`; the field would always be `null` for any `:throw`-shaped error from a pre-hook. (`:reject` doesn't reach the catch-converter today, but `:throw` could.)

Not a blocker for Part 29 — the catch-converter is being deleted entirely (Change 1 + Task 5). But worth a one-line acknowledgement somewhere in D1 or D2a that the cleanup also retires this case-mismatch wart, so a reader doing forensic git-blame later doesn't re-discover it as a fresh bug. Alternatively, just leave it unmentioned — it dies with the catch-converter and has no surface after the change. Reviewer's call.
