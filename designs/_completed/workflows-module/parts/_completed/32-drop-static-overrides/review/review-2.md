# Review 2 — Phantom build-time check, `mergeStatus` name, minor inconsistencies

Targeted re-read after Review 1's action pass. Findings 1–2 are factual errors that propagate into tasks 4 and 6; findings 3–5 are smaller wording/consistency snags.

## Factual errors

### 1. There is no existing build-time `status` enum check to "lose" or "move"

> **Resolved.** Verified against `makeWorkflowsConfig.js:128–166` and `makeWorkflowApis.emitInteractions:55–64` — no enum check exists on either channel today. Removed the "regression vs. build-time validation" bullet from § Trade-offs / "What gets worse" and added a net-gain bullet to § Trade-offs / "What gets better" framing change #6 as a first-of-its-kind runtime enum check. Task 4 wording follow-up handled by finding #2's rename.

The design says in § Trade-offs / "What gets worse" (line 157):

> Build-time validation loss for `status` enum-membership. Today `makeWorkflowsConfig` rejects a typo at build. Move the check to runtime in `mergeStatus.js` (change #6) — costs nothing at submit, prevents an invalid stage being written. Strictly a regression vs. build-time validation…

And Task 4 line 18 reinforces:

> moves the build-time enum-membership check that used to live in `makeWorkflowsConfig` (for the now-dropped YAML field) to **runtime**…

Both readings of "today" / "used to live" are wrong. [`makeWorkflowsConfig.js:128–166`](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) does not validate `action.interactions[].status` against `ACTION_STATUSES` anywhere — `interactions:` is in the build-time-only fields excluded from `ACTION_FIELDS`, `validateAction` checks only `action.kind`, `action.form|tracker` shape, and `action.status_map` enum membership, and `interactions` is never inspected. `makeWorkflowApis.emitInteractions` ([`makeWorkflowApis.js:55–64`](../../../../modules/workflows/resolvers/makeWorkflowApis.js)) reads `v.status` and passes it through unchanged — no enum check there either. A typo in `action.interactions.submit_edit.status: dnoe` is silently baked into the endpoint payload today and would be silently written by `updateAction` at submit time.

This finding is also consistent with Review 1 finding #6's audit conclusion ("`makeWorkflowsConfig` is a hand-written-checks validator with no Joi/Ajv schema and no unknown-keys rejection") — that audit verified the lack of unknown-key rejection but didn't propagate the implication to the per-field enum claim two paragraphs below.

**Concrete consequence for the design:**

- § Trade-offs / "What gets worse" bullet should drop the "regression vs. build-time validation" framing. The new runtime check in `resolveTargetStatus` is a **net gain**, not a regression — today's posture silently accepts a typo and ships it to MongoDB; the new posture catches it at submit time. Either reframe the bullet ("Adds a runtime enum check on the pre-hook `status` return; today a typo on either channel ships silently — net win") or move the line entirely from "what gets worse" into "what gets better."
- Change #6 in § Proposed change reads: "`mergeStatus` runtime-validates the pre-hook `status` return…" — fine. But the "Move the check" wording in § Trade-offs and "moves the build-time check" in Task 4 both falsely imply pre-existence. Drop "move" and just say "add."
- § Contract to neighbours bullet for Part 9 ("adds the runtime `status` enum check in `mergeStatus`") is fine — neutral framing, no false historical claim.

### 2. `mergeStatus` is a name without a referent

> **Resolved.** Took the recommended option — dropped `mergeStatus` everywhere and named the existing function (`resolveTargetStatus`). Rewrote change #6, § Trade-offs / "What gets better" (the new bullet from finding #1), § Parts touched / Part 9 row, § Verification, § Contract to neighbours, Task 2 acceptance criteria, and Task 4 Context. The check lives inside `resolveTargetStatus`'s second `handleSubmit` invocation, as Task 4 already specifies — extracting a six-line helper file would be overkill per the reviewer's note.

The design refers to a function called `mergeStatus` six times: changes #6, § Trade-offs, § Parts touched, § Verification, § Contract to neighbours. The codebase has no `mergeStatus.js` and Part 9's design doesn't introduce one — the per-interaction resolver is [`resolveTargetStatus.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.js), and Task 4 quietly resolves this by stating the check lives "inside `resolveTargetStatus`" (line 41) while still using the name `mergeStatus` in the context section (line 29: "The design names this `mergeStatus`…").

A reader who has only read the design will look for `mergeStatus.js`, won't find it, and will conjecture that Part 32 introduces a new file. They'll then read the task list, see Task 4 modifies `resolveTargetStatus.js`, and have to reverse-engineer that "mergeStatus" was a design-prose name for "the new enum check inside the resolver's second invocation."

**Fix:** pick one name and use it consistently. Two options:

- **(Recommended)** Drop `mergeStatus` and refer to the existing function. Rewrite change #6 as "`resolveTargetStatus` runtime-validates the pre-hook `status` return against `action_statuses` and throws on miss." Apply the same rename in § Trade-offs, § Parts touched, § Verification, § Contract to neighbours.
- Or extract the enum check into a tiny `mergeStatus.js` helper that `resolveTargetStatus` calls (or that handleSubmit calls between the pre-hook return and the second `resolveTargetStatus` invocation). Adds a file but matches the design prose. Probably overkill for a six-line `if (!ACTION_STATUSES.includes(s)) throw` check.

This is a renaming-or-extraction call; either resolves the name-without-referent. The "name a thing that does not exist" status is the issue.

## Wording / scope

### 3. § `_nunjucks` evaluation still contains a "Return" reference Review 1 #2 didn't sweep

> **Resolved.** Rewrote `Return params.event_overrides` → "returning `event_overrides` from a `:return:`" (one-token tweak, no pre-emption of the deferred `_nunjucks` section rewrite).

Review 1 #2 fixed Cases A and B's `type: Return` step shape but its resolution note said "The § `_nunjucks` evaluation reframing (finding #3) handles the remaining 'Return params.event_overrides' reference." Finding #3 was deferred to a future nunjucks-template rewrite, so the line at design.md:211 still reads:

> Same destination for the engine default (JS literal in `buildDefaultLogEventPayload`), the dropped Layer 2 path (YAML literal baked into endpoint properties), and the pre-hook path (`Return params.event_overrides`).

Grammatically this can be read as "`return params.event_overrides`" (verb-phrase prose). In context — adjacent to a parenthetical describing a YAML mechanism — it parses naturally as a step-type reference, the same misreading Review 1 #2 caught. Independent of the deferred § `_nunjucks` rewrite, a one-token tweak (`Return params.event_overrides` → "`:return: { event_overrides: ... }` body" or just "returning `event_overrides` from a `:return:`") removes the ambiguity without pre-empting the larger rewrite.

### 4. Task 1 acceptance criterion #4 enumerates two things but calls them three layers

> **Resolved.** Rewrote Task 1 AC #4 as "three layers: engine default + runtime `comment` + pre-hook return (the first two folded together by `buildDefaultLogEventPayload`)" — matches the design's "4 → 3" per-conceptual-layer math.

Task 1 line 51:

> The event-overrides section in `submit-pipeline/spec.md` describes three layers post-fold: engine default (with runtime `comment` folded in by `buildDefaultLogEventPayload`) + pre-hook return.

That parenthetical folds the runtime `comment` into the engine default, so the criterion enumerates exactly two layers. The design itself (change #2, § Trade-offs) says "event merge collapses from four layers to three" — but that "three" includes the un-folded `comment` layer 3 as its own item.

Pick one framing. Either:

- "describes **two** layers post-fold: engine default (with runtime `comment` folded in) + pre-hook return" — accurate to what's actually in the merge function ([`mergeEventOverrides.js:23`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.js) takes a `defaultPayload` and a `preHookOverride`).
- Or "three layers: engine default + runtime `comment` + pre-hook return, where the first two are folded by `buildDefaultLogEventPayload`" — keeps the per-conceptual-layer count consistent with the design's "4 → 3" wording.

Either reads cleanly; the current acceptance criterion mixes the two framings ("three layers post-fold" with a two-item enumeration).

### 5. § Parts touched / "Worked-example YAML in the demo app" — list a deliberate demo-semantic change

> **Resolved.** Added the "behavioural side effect" sentence to the demo row in § Parts touched (send-quote's `request_changes` flow now writes `changes-required` instead of `action-required`). Also strengthened Task 7's acceptance criterion #5 to explicitly mark this as a deliberate demo behavioural change.

[`send-quote.yaml:32`](../../../../apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml) currently writes `request_changes: action-required` (non-default — engine default is `changes-required`). After Task 7's deletion the demo's request_changes flow will write `changes-required` instead. Review 1 #1 already established the design's stance (this is artifact-of-Layer-2, not a load-bearing demo semantic) and chose deletion over porting to a pre-hook.

That's a reasonable choice, but the design currently buries the "demo behaviour changes" consequence inside "all four get deleted; the demo workflows operate on engine defaults afterwards" — a reader who runs the demo and observes the new status arrow won't readily connect it back to this part. A one-line addition to the demo row would close the loop:

> Side effect: send-quote's `request_changes` flow now writes `changes-required` (engine default) instead of `action-required`. Accepted per § Use cases considered — the static `action-required` override is artifact-of-Layer-2, not a load-bearing demo semantic.

Task 7's acceptance criteria don't surface this either — worth adding to that task as well so the demo smoke (per § Verification "worked-example smoke") captures it.

## Minor

- Task 4's `UserError` resolution note (lines 31–35) calls out the "Resolve the open question; don't defer it" rule from `CLAUDE.md` and tells the implementer to grep before writing. That's a fine punt, but resolving it once in the design (rather than once per implementer) is cheaper. A 30-second grep against the lowdefy worktree (`grep -rn "class UserError" /Users/sam/Developer/lowdefy/lowdefy/packages`) would let the design state authoritatively whether `UserError` is already exposed and where to import from. Not blocking — the task gives a sensible fallback — but the rule wants it answered here.

  > **Resolved.** Grepped the lowdefy worktree: `UserError` is exported from `@lowdefy/errors` (`packages/utils/errors/src/UserError.js`). `modules-mongodb-plugins/package.json` does not depend on that package, and the existing test shims (`invokePreHook.test.js`, `handleSubmit.test.js`) inline the same minimal `name === 'UserError'` / `isReject` shape that `runRoutine` discriminates on. Task 4 now mandates a small local helper file `SubmitWorkflowAction/UserError.js` with the same shape, imported from `resolveTargetStatus.js` — single source-of-truth per "One correct way," no new peer dep churn. Task 4 Context section, step 4, and Files list updated accordingly.

- § Verification bullet "no engine writes have landed when the throw fires" is the key new assertion. Task 6 covers it; Task 4 leaves it to Task 6. Fine ordering, just confirming the design's verification claim has a task owner.

  > **Accepted.** Confirmation only — no design change needed; Task 6's acceptance criteria own the assertion.

- § Migration says "The hardest churn is **rewriting in-flight design documents** (parts 4, 9, 13 above) — none of which are sealed, all of which already cite 'Layer 2' by that label." Part 13 is in `_completed/`. Calling it "in-flight" is wrong — the design itself notes "tasks 1–2 shipped" for Part 13 in § Parts touched. Tiny wording snag; the substance (amend the design doc to reflect the bake-in removal) is captured by Task 2.

  > **Resolved.** Verified both parts 4 AND 13 are under `parts/_completed/`. Rewrote the § Migration paragraph as "rewriting cross-referencing design documents" and called out which parts are in `_completed/` (handled by Task 2) vs. in flight (Part 9, edited directly). The reviewer flagged Part 13 only, but Part 4 is also in `_completed/` — both fixed.
