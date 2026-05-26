# Review 1 — Demo migration, example syntax, operator-flow claim

## Factual errors

### 1. Demo app already uses `interactions:` — migration is not zero-cost

The design concludes from § Use cases considered that "every override case I could construct is either (a) a misconfigured `access.{app_name}` verb list or (b) genuinely conditional logic that is properly a pre-hook anyway" and § Parts touched / "Worked-example YAML in the demo app" hedges with "Audit needed — § Use cases considered suggests the demo likely uses zero status overrides." That hedge is contradicted by the demo's current state.

- [`apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml:20-22`](../../../../apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml) declares `interactions: { submit_edit: { status: done } }`. The action's `access.demo: [edit, view]` (no `review`), so the engine default for `submit_edit` is already `done` — the override is **redundant**, drop-on-migrate.
- [`apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml:27-33`](../../../../apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml) declares three overrides: `submit_edit: in-review` (redundant — `review` is in `access.demo`, default is `in-review`), `approve: done` (redundant — default is `done`), **and `request_changes: action-required`** (non-default — engine default is `changes-required`).

The third one is exactly the case § Use cases considered dismisses for `request_changes` ("'Send all the way back to draft' (write `action-required` instead of `changes-required`). … I cannot find a workflow where this is a static per-action decision"). The demo's send-quote action is precisely that decision, written statically. It may be illustrative-only rather than load-bearing, but it's the only worked example consumers will copy from, and the conclusion that the static decision pattern doesn't appear in practice doesn't hold against the artefact this part has to migrate.

**Concrete consequence for the design:**

- "No current users or implementers. No migration needed" in § Migration is wrong; the demo workflow_config carries three `interactions:` blocks across two actions, one of which is a non-default override that needs porting to a pre-hook. Add the demo port to the part's task list explicitly, rather than tucking it under "Audit needed."
- Reconsider whether the dismissal-of-`request_changes` analysis under § Use cases considered is the right framing, or whether the design should land with "static `request_changes` overrides exist; we accept the migration cost of porting them to one-line `:return:` routines." The latter is a stronger story — fewer claims to defend, just a clean cost statement.

### 2. Pre-hook example YAML uses non-existent step type

§ What the rewrites look like / Case A and Case B show pre-hook routines written as:

```yaml
routine:
  - id: return_status
    type: Return
    params:
      status: done
```

Lowdefy has no `type: Return` step. Routine return uses the `:return:` control prefix, as in [`makeWorkflowApis.js:95`](../../../../modules/workflows/resolvers/makeWorkflowApis.js) (`:return: { action_ids: ..., ... }`), every shipped api routine in [`modules/workflows/api/*.yaml`](../../../../modules/workflows/api), and the `:return:` documented at [`apps/demo/.claude/guides/api-routines.md:35`](../../../../apps/demo/.claude/guides/api-routines.md). The correct shape is:

```yaml
routine:
  - :return:
      status: done
```

Both Case A and Case B need fixing — Case B compounds it ("`Return params.event_overrides`" in § `_nunjucks` evaluation reads the same way). Authors copying these examples will hit a build error.

### 3. § `_nunjucks` evaluation — equivalence verified is right by accident

The section claims "[the `_nunjucks` operator] is **not evaluated by the workflow engine in any override path**. The operator object travels as a literal through `context.callApi('new-event', module: 'events')`."

For the **engine default** path (`buildDefaultLogEventPayload`), that's true: the operator is constructed as a JS literal in [`dispatchLogEvent.js:80-86`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js) after operator evaluation has already run, so it travels as a literal.

For the **Layer 2** path (YAML baked into endpoint `properties.event_overrides`), it's not. [`evaluateOperators.js:50-220`](../../../../../lowdefy/packages/operators/src/evaluateOperators.js) walks `properties` recursively and resolves any registered operator it encounters, including `_nunjucks`. The submit step's `properties.event_overrides.submit_edit.display.consumer.title._nunjucks` would be evaluated at endpoint-call time, not stored as a literal. Same for the **pre-hook** path: `controlReturn.js:20` calls `evaluateOperators` on `control[':return']`, so a `_nunjucks` inside a `:return:` body is resolved at routine execution time.

The migration **outcome** is still equivalent (both Layer 2 and pre-hook paths submit-time-resolve `_nunjucks`), but the mechanism the section asserts ("travels as a literal") is wrong for both override paths. The risk this matters: a future reader trusting the section will assume `_nunjucks` inside a pre-hook `:return:` is late-bound at render time and write a template referencing render-time context (`{{ now }}`, `{{ viewer }}`) that doesn't exist at submit time.

Two fixes:

- Rewrite the section to state the actual mechanism: both override paths evaluate `_nunjucks` at submit time; only the engine default constructs the operator literal post-eval. Migration equivalence holds because both override paths submit-time-resolve, but render-time-bound templates were never available via Layer 2 either.
- Or, if the section's intent was to defend that pre-hook authors can keep using their existing `_nunjucks` templates verbatim, scope the claim to that — "your existing `event.{interaction}.display.{app}.title._nunjucks` template works unchanged when moved into a pre-hook `:return:`" — and drop the literal-travel claim.

## Risk acknowledgement gap

### 4. Pre-hook side-effects re-run on retry — not "naturally idempotent"

Change #6 says: "The throw fires at the merge step (after step 2 pre-hook invocation, before step 4 writes) so no writes have landed; the action stays in its pre-submit state and retry is naturally idempotent."

Step 2 has already run when `mergeStatus` throws. A pre-hook that called an external validator, posted to a logging service, charged an account, or mutated any external resource has already fired its side effects. The retry will fire them again. "Naturally idempotent" is true of the action doc (no writes happened) and false of the pre-hook (it did run, fully).

This is the same risk class Part 29 § D6 already accepts (post-hook idempotency is the author's responsibility), but Part 32's wording suggests the throw is risk-free, which is stronger than Part 29 supports. Tighten to: "no engine writes have landed; the action doc is unchanged. Pre-hook side effects re-run on retry per the Part 29 D6 idempotency contract."

The bigger question this surfaces: should `mergeStatus`'s enum check fire **before** the pre-hook invocation by validating any declared static fallback? — moot here because the static fallback is gone. So the throw position is forced. Just align the language.

## Wording / scope

### 5. "Incremental cost is one Api per overridden interaction" undersells

§ Trade-offs / "What gets worse" says: "Each new overridden interaction adds one emitted hook Api (`update-action-{type}-{interaction}-pre`)."

Per [Part 13 § Pre-hook emission](../13-resolver-apis/design.md), the resolver emits one Api per `hooks.{interaction}.pre` declared — regardless of whether the pre-hook returns a status / event override or does other work. If an interaction already has a pre-hook for some other reason (validation, side effect), porting a Layer 2 override into the same pre-hook adds **zero** Apis. If the interaction has no pre-hook today, porting adds **one** Api. The cost is "one Api per interaction that didn't already declare a pre-hook" — narrower than the current wording.

Probably not worth re-flowing the section, but worth a one-word tightening to avoid future-reader confusion when they grep for the cost.

### 6. Schema unknown-key rejection — confirm the failure mode is friendly

§ Proposed change / "Drop the merge functions and tests for Layer 2" + § Migration / "no migration needed" rest on schema unknown-key rejection catching anyone who carries the old fields forward. Worth a quick check that `makeWorkflowsConfig`'s current schema validator does error on unknown keys (and produces a message that names the offending field), since Joi / Ajv defaults vary on this. If the rejection is silent (passes validation with the field ignored), the migration loses its safety net and authors get the override silently stripped.

Not a blocker — the audit is a one-liner — but worth the audit before shipping.

## Minor

- § Current state's table caption says "Layer 2 of 3" for status and "Layer 2 of 4" for event. The numbering reflects the spec's own counting; fine. Just confirms § Trade-offs's "status: 3 → 2 layers; event: 4 → 3 layers" math.
- § Parts touched lists "Concept spec — `submit-pipeline/spec.md`" with a specific edit list. The grep confirms the spec has live `interactions:` content at lines 103–121 and `event:` content at lines 254–260 — the rewrite is non-trivial but well-scoped. No issue.
- § Depends on says "Independent of Part 29." Confirmed — Part 32's throw fires before step 4 writes regardless of Part 29's catch-converter removal. Either ordering works.
