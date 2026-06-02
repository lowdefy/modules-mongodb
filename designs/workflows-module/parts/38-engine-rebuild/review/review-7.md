# Review 7 — Task 9 (load phase + phase types) input-contract completeness

Scope: `tasks/09-load-phase-and-types.md`, focused on the `loadWorkflowState`
contract and the submit-time access gate it introduces. Checked against the design
(D2 load-phase contract, design.md:62; D3 Plan, design.md:74–109; D16 access model,
design.md:400–418), Part 34 D6 (`34-action-access-model/design.md:131–148`), the
sibling tasks it depends on (task 1 `findDocs`, task 2 `resolveSignal`/`hasReview`,
task 5 `gates.fixtures.js`, task 13 commit/CAS), and the code it replaces
(`WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`, `WorkflowAPI/schema.js`).

What's correct and grounded: the verb-resolution table (task 9 lines 37–40) matches
Part 34 D6 (`34-…/design.md:137–142`) exactly; the `Plan` type (lines 17–27) is the
verbatim D3 shape; the `required_after_close` carve-out (line 35) reproduces
`handleSubmit.js:115–121` precisely (`(stage === "completed" || "cancelled") &&
actionConfig.required_after_close !== true → throw`); access-before-pre-hook ordering
matches D2 (design.md:62). The findings below are input-contract gaps — values the
gate needs that the task never sources — in the same class as review-5/6's per-task
contract findings.

## Contract gaps (would block implementation)

### 1. `current_app` is referenced four times but never sourced

> **Resolved (auto).** Task 9's input bullet now states `current_app` resolves from `context.connection.app_name` (schema.js `app_name`, wired from `_module.var: app_name`) — the same source the event render context uses — and that the gate and `planEventDispatch` must agree on it.

The access gate reads `access.{current_app}.{verb}` and
`_user.apps.{current_app}.roles` (task 9 lines 36, 41; design.md:62, 406), but
neither the task nor D2 says where `current_app` comes from. The established
plumbing is the connection field `app_name`: `WorkflowAPI/schema.js:79` declares it
("Apps wire this from `_module.var: app_name`"), and the current engine reads it as
`context.connection?.app_name` (`handleSubmit.js:325`; `event-id-round-trip.test.js:89`).
The load gate is the *one* new reader of this value in Part 38, so leaving the source
implicit invites an implementer to re-derive it differently from how
`planEventDispatch` keys `display.{appName}` — the two must agree.

**Fix.** State in task 9 that `current_app` resolves from `context.connection.app_name`
(the same source the event render context uses), and add it to the `loadWorkflowState`
input description (line 31 currently lists only "params, user, connection").

### 2. The signal driving verb-resolution is not named as `payload.signal`

> **Resolved (auto).** The gate bullet now reads "resolve the required verb for the user signal `payload.signal` (the same payload field the planner later applies to the target action, design.md D4 source 1)".

The reads bullet names `payload.action_id` (line 32) as the target-action key, but
the access-gate bullet says only "resolve the signal's required verb" (line 36)
without stating the signal *is* `payload.signal`. `resolveSignal` (task 2) and the
verb table both key on the signal; the load gate must read it from the same payload
field the planner later applies to the target action (design.md:139, "Submit applies
this to the target action identified by `payload.action_id`"). One clause closes it.

**Fix.** In line 36, name the input: "resolve the verb for the user signal
`payload.signal` via the Part 34 D6 table."

### 3. The user-roles JS source is unstated; gate-input shape left to guess

> **Resolved (auto).** Task 9 now spells out the JS gate inputs: `gate = actionConfig.access?.[current_app]?.[verb]`, `userRoles = context.user.apps?.[current_app]?.roles ?? []`, evaluated with the shared `(gate, userRoles) → bool` semantics, with gate-absent and empty-roles cases failing closed per task 5 categories 4–5.

Task 9 writes the gate in Lowdefy-operator notation — `_user.apps.{current_app}.roles`
(line 41) — but this is load-phase JS, not YAML. Task 5's oracle signature is
`(gate, userRoles) → bool`, so `loadWorkflowState` must extract a concrete
`userRoles` array to feed it: `context.user.apps?.[current_app]?.roles ?? []`. The
task never states that `context.user` is the `_user` source nor how the
missing/empty-roles case maps onto task 5's "empty user-roles vs non-`true` gate →
fail" category. Without it the implementer guesses the access path and the
empty-roles default.

**Fix.** State that the gate is evaluated by passing the resolved gate
(`actionConfig.access?.[current_app]?.[verb]`) and `userRoles = context.user.apps?.[current_app]?.roles ?? []`
through the same `(gate, roles) → bool` helper task 5/7/8 share — and that a
gate-absent verb fails closed (task 5 category 4).

### 4. No error class named for the gate / invariant throws

> **Resolved.** Went further than the proposed fix: rejected `UserError` as the vehicle (it's Lowdefy's routine-reject discriminator, reserved for pre-hook rejects, task 14) and defined an engine error model in D13 — `WorkflowEngineError extends Error` with `(message, { code, cause })` in `shared/errors.js`, codes for load-phase invariants (`workflow_not_found`, `action_not_found`, `stage_rejects_submit`, `access_denied`) and plan-phase signal validation (`unknown_signal`, `missing_target`, `signal_not_allowed`); `ConcurrentSubmitError extends WorkflowEngineError` (code `concurrent_submit`, kept as a named class for catch-by-name retry). Cause-chain contract: rethrows adding context pass `{ cause }`; default is to bubble unwrapped. Task 9 creates the class and names its codes; task 13 now extends it instead of pointing at `UserError.js`.

The AC says the gate "rejects unauthorized submits … with a structured error"
(line 48) and lists three invariant throws (line 47), but task 9 leaves the throw
shape open — unlike task 13, which defines `ConcurrentSubmitError` and points at
`SubmitWorkflowAction/UserError.js:62`. That `UserError.js` already exists and is the
load phase's natural error vehicle (the current `handleSubmit.js` throws plain
`Error` at lines 84–121, which this rebuild is the chance to standardise). Leaving it
unspecified means access-denied, not-found, and bad-stage get three hand-rolled
shapes — the opposite of "one correct way."

**Fix.** State that the access rejection and the invariant throws use `UserError`
(or the agreed load-phase error class), and that the access-denied error is
distinguishable (status/code) from the not-found / bad-stage ones so the caller's
central fence and the inner gate return coherent responses.

## Consistency / clarity

### 5. The gate *replaces* the old `access.roles` intersection — say so

> **Resolved (auto).** Task 9 now states the per-verb gate replaces the action-wide `access.roles` intersection at `handleSubmit.js:104` (Part 34 D4 removes that shape; resolver hard-errors on it) and instructs not to preserve both checks.

`handleSubmit.js:104` computes `const accessRoles = actionConfig.access?.roles ?? []`
— the action-wide `access.roles` shape that Part 34 D4 **removes** (the resolver now
hard-errors on it, design.md:404). Task 9's per-verb gate is the replacement, but the
task doesn't say it supersedes the existing check. A one-line "this replaces the
action-wide `access.roles` intersection in today's `handleSubmit.js:104`" anchors the
behaviour change and warns the implementer not to preserve both.

### 6. `targetAction` in `LoadedState` is an addition over D2 — confirm consumers

> **Resolved (auto).** Verified the consumer chain: task 10's `planActionTransition` takes `action` as input, and the handler (task 15) sources it from the load phase. Task 9 now notes `targetAction` is the convenience handle `actions.find((a) => String(a._id) === payload.action_id)` that the handler passes as `planActionTransition`'s `action` input.

Task 9's `LoadedState` adds `targetAction` (line 15) alongside `actionConfig`; D2
(design.md:62) lists only "the `actionConfig` for the target action," not a separate
doc pointer. It's reasonable (`actions[]` already contains the doc, so `targetAction`
is a convenience handle), but it's new surface — confirm tasks 10/15 consume it by
that name, or it's redundant. Either reference it from a downstream task or note it's
a convenience alias for `actions.find(a => a._id === payload.action_id)`.

### 7. Config-resolution mechanism unstated; lifecycle stage-checks out of scope

> **Resolved.** Task 9 now names the config lookups (`context.workflowsConfig.find(... workflow_type)` → `workflowConfig.actions.find(... action type)`, per `handleSubmit.js:81–102`) and states the stage check is Submit-specific, with lifecycle preconditions scoped to task 17. Verified the actual lifecycle semantics before pointing there (the review's examples were part-hypothetical): Close guards today (completed → idempotent no-op, cancelled → throw, now `WorkflowEngineError` `code: "stage_rejects_close"` added to D13); Cancel deliberately has no stage guard; Start inserts a fresh doc so a started-already check can't apply. Task 17 records these — preserve, no new guards.

Two small omissions:
- "Resolves `workflowConfig` and (Submit) the `actionConfig`" (line 33) doesn't name
  the source. Today it's `context.workflowsConfig.find(... workflow_type)` then
  `workflowConfig.actions.find(... action type)` (`handleSubmit.js:81–102`). Name it
  so the implementer doesn't reinvent the lookup.
- The stage check (line 35) is **Submit-specific** (accepts-submissions +
  `required_after_close`). Start/Cancel/Close load the whole workflow (AC line 50) but
  have their own preconditions (can't cancel a `completed` workflow, can't start a
  started one). State that those lifecycle stage validations live in the lifecycle
  planners (task 17), not in `loadWorkflowState`, so they aren't bolted in here or
  assumed covered.

## Summary

Findings 1–4 are input-contract gaps: the access gate names `current_app`, the
signal, and `_user.apps…roles` but sources none of them, and the throw shape is
unspecified — an implementer cannot write the gate without inventing all four. They
are grounded in existing plumbing (`schema.js:79` `app_name`, `handleSubmit.js:325`,
task 5's oracle signature, `UserError.js`), so each has a concrete, low-churn fix.
Findings 5–7 are clarifications, with 5 flagging that the gate must *replace* (not
coexist with) the old `access.roles` check the rebuild deletes.
