# Review 16 — Task 19 (Emitted API payload surfaces)

Scope: `tasks/19-emitted-payload-surfaces.md`, verified against `modules/workflows/resolvers/makeWorkflowApis.js` / `makeWorkflowsConfig.js` (post-task-6/22 state), `modules/workflows/api/*.yaml`, the landed phase code (`shared/phases/loadWorkflowState.js`, `planners/planActionTransition.js`), state-machine.md, and tasks 12/14/15/17.

Verified clean (no findings): the `HOOK_SIGNALS` list (`submit, progress, not_required, resolve_error, approve, request_changes`) matches state-machine.md's six button-surfaced signals exactly and the landed `SIGNAL_VERBS` map in `loadWorkflowState.js:9-16`; the `_module.endpointId` wrapping to preserve matches landed task-22 code (`makeWorkflowApis.js:40`); `cancel-workflow.yaml` / `close-workflow.yaml` already surface `event_id` + `tracker_fired`, so `start-workflow.yaml` is genuinely the only `:return` extension needed for review-13 #6's uniform surface.

## Missing Scope

### 1. `makeWorkflowsConfig.js` carries a second, un-re-keyed hook-key list — the build rejects signal-keyed configs before the emitter ever sees them

`makeWorkflowsConfig.js:40-46` has its own `HOOK_INTERACTIONS = ['submit_edit', 'not_required', 'resolve_error', 'approve', 'request_changes']`, and `validateHooks` (lines 66-72) **hard-errors** on any `hooks:` key outside it ("not a known interaction" — pinned by `makeWorkflowsConfig.test.js:271`). Task 19 re-keys only `makeWorkflowApis.js`'s copy. With task 19 done as scoped, Part 45's signal-keyed config (`hooks.submit` — the qualify.yaml sketch in Part 45's design) fails the **build** with a validation error: the demo can't even reach the emitter the task fixes. The task's own rationale ("without this, the signal-keyed demo config is silently skipped") understates it — the config is loudly rejected, by a file outside the task's scope.

No prior review covers this: review-10 #2's resolution added the re-key for `makeWorkflowApis.js` only ("Related resolver gap: `makeWorkflowApis.js:1-7`"), and no other task touches `validateHooks`.

**Fix:** add `makeWorkflowsConfig.js` (+ its test's hook-key cases, `makeWorkflowsConfig.test.js:200-271`) to task 19's scope. Prefer one shared constant over two lockstep lists ("One correct way"): resolvers are loaded by Lowdefy's `getUserJavascriptFunction.js` via native dynamic `import()`, so a relative import of a shared `resolvers/` module works (verified in `lowdefy/packages/build/src/build/buildRefs/getUserJavascriptFunction.js` — caveat: the dev-rebuild cache-bust query applies only to the entry file, so edits to the shared module need a build restart in dev; acceptable for a constant). If the import is avoided, export the list from both files and add a test asserting they're identical. While there: `event:` keys get **no** build validation at all (only `hooks:` does) — the same legacy-key/typo hazard the task worries about applies; extending `validateHooks`'s key check to `event:` blocks is a few lines against the same constant.

## Contract Ambiguity

### 2. The payload list reads as exhaustive but omits load-bearing fields — a literal implementation breaks Submit

Task line 11 and AC line 26 enumerate the mapping as "`signal`, `comment`, `metadata`, `form`, `form_review`, `event_overrides`, hooks". The rebuilt engine also requires, from the same wire payload:

- `action_id` — `loadWorkflowState`'s Submit mode is `{ actionId, signal }` (landed `loadWorkflowState.js:71`); D4 source 1: "Submit applies this to the target action identified by `payload.action_id`".
- `current_key` — task 12's event `metadata` composition carries it (`{ action_type, workflow_type, signal, current_key, … }`), and the keyed form_data path needs it (Q6 / `planFormDataMerge` keyed vs unkeyed).
- `fields` — `planActionTransition` sets `payload.fields` onto the planned doc (landed `planActionTransition.js:128,136`); for `kind: simple` the submission content *is* the fields bag (design D14 planner note, state-machine.md "Simple kind").

The current mapping (`makeWorkflowApis.js:65-78`) passes all three, plus the baked literals `action_type` / `workflow_type`. An implementer reading the task's list as the full mapping would delete them — Submit then can't locate its target action and simple submissions lose their content, with nothing in the task's AC catching it.

**Fix:** enumerate the complete post-task mapping in the task body and AC: `action_id`, `signal`, `current_key`, `fields`, `form`, `form_review`, `comment`, `metadata`, `hooks` (conditional), `event_overrides` (conditional) — and state explicitly whether the `action_type` / `workflow_type` literals stay (the rebuilt handler derives both from the loaded action doc, so they're either dropped deliberately or kept as informational; pick one).

### 3. "Drops `force`" describes a change with nothing to change

`makeWorkflowApis.js` has never passed `force` — verified at the pre-task-6 revision (`git show f944850` — no `force` in `emitActionEndpoint`'s properties); `force` was a pre-hook-return / `updateAction` flag, never an emitted-payload field. The no-force assertion already exists (`makeWorkflowApis.test.js:189-197`). The real payload-mapping deltas this task lands are: `interaction` → `signal`, drop `current_status`, **add `metadata`** (currently absent from the mapping). Minor accuracy fix so the implementer doesn't hunt for a `force` line to delete: reword to "asserts `force` stays absent (it never appeared in this mapping; the force *model* died with D4)".

## Cross-Task Gaps

### 4. `metadata` on `start-workflow.yaml` has no specified consumer

Task 19 adds `metadata` to the Start payload ("Part 30 carry-over"), but task 17's StartWorkflow rewrite never mentions `params.metadata`, and the current `StartWorkflow.js` doesn't read it. The carry-over source (Part 30, "Proposed change" #5 / D10) had start-payload `metadata` merge into action docs' `metadata` and the render context — under the rebuild that translates to threading `params.metadata` into each seeded draft's `planActionTransition` `payload.metadata` (the landed planner already merges it, `planActionTransition.js:129,137`), but no task says so. As written, task 19 wires a payload field that falls on the floor.

**Fix:** either task 17 gains the thread ("seed-mode `planActionTransition` calls receive `payload.metadata` from `params.metadata`") and task 19 names that consumer, or the field is dropped from both per "build for what exists" (nothing in the Part 45 demo passes `metadata` at start). Decide now rather than at implementation time.

### 5. AC "`signal` is documented" is unverifiable and contradicts the task body

The body (line 19) pins the opposite: "No signal grammar at start" — the `actions:` override keeps `{ type, status }`. Yet AC line 28 says "`signal` is documented" and Files line 34 says "document `signal`", with no instruction anywhere in the body for what to write. An implementer can't satisfy this criterion. **Fix:** replace with something concrete — e.g. "`start-workflow.yaml` carries a comment noting the `actions:` override keeps the `{ type, status }` grammar (legal seeds `action-required` | `blocked`, enforced at runtime by task 17); signals do not apply at start" — or delete the clause from both AC and Files.
