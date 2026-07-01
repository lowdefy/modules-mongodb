# Task 1: Flip `hooks` and `on_complete` from string Api ids to inline routine objects

## Context

The action-authoring spec and shipped `makeWorkflowsConfig` validator currently treat hook references as **strings** — author writes a hook Api id (`pre: lead-onboarding-qualify-pre-submit`) and that Api lives in a separate `apis/*.yaml` file elsewhere in the host app. Group `on_complete` works the same way.

Part 13's design inverts this model: hooks (and `on_complete` routines) are authored **inline** on the action / workflow YAML, and the resolver emits the corresponding Lowdefy Apis with deterministic ids and `auth.roles` synthesized from `action.access.roles`. The "hook-auth gate" dissolves — auth holds by construction.

This task lands the **YAML grammar flip + validator extension** that the resolver in task 2 depends on. It does not write the resolver itself.

### Current state

In `designs/workflows-module-concept/action-authoring/spec.md`:

- The worked example at line 361–366 shows `hooks.submit_edit.pre: lead-onboarding-qualify-pre-submit` (string).
- Line 103 documents the old auth gate (`hook.auth.roles ⊇ action.access.roles`, reject `auth.public: true`).
- The file-layout block at line 14–16 lists `{action-type}-submit-hook.yaml` as a separate file under `api/`.
- The `makeWorkflowApis` row at line 487 says "validates `hook.auth.roles ⊇ action.access.roles`".
- The "generated endpoint" example at line 515–522 emits hooks as `pre: <api-id-or-null>, post: <api-id-or-null>`.

In `modules/workflows/resolvers/makeWorkflowsConfig.js`:

- `ACTION_FIELDS` at line 5–16 picks engine-runtime fields off the action YAML; build-time-only fields (`hooks`, `interactions`, `event`) are explicitly excluded from the normalized output (comment lines 1–4). The validator currently does **not** inspect `hooks` at all — it just passes through.
- `validateAction` at line 51–87 covers `kind` / `form` / `tracker` / `status_map` checks. No hook checks today.
- `validateWorkflow` at line 89–153 covers workflow / group / starting-action invariants. No `on_complete` checks today.

### New shape

`hooks.{interaction}.{pre|post}` is an **object** whose shape mirrors a Lowdefy Api `routine:` block (an array of routine steps):

```yaml
hooks:
  submit_edit:
    pre:
      routine:
        - id: <step-id>
          type: <RoutineStepType>
          ...
    post:
      routine: [...]
  approve:
    pre:
      routine: [...]
```

Same for groups:

```yaml
action_groups:
  - id: phase-1
    title: Discovery
    on_complete:
      routine:
        - id: <step-id>
          type: ...
```

The author no longer names the Api id or its `auth:` block — those are derived by the resolver (task 2) at emission:

- Hook Api id: `update-action-{action_type}-{interaction}-{pre|post}`
- `on_complete` Api id: `workflow-{workflow_type}-group-{group_id}-on-complete`
- Auth roles: synthesized from `action.access.roles` (or, for `on_complete`, the union of `access.roles` across the group's actions).

### What this task covers

1. **Update the action-authoring spec** to describe the new inline-routine shape, drop the old string form, drop the standalone `{action-type}-submit-hook.yaml` file from the layout block, drop the auth-gate validation row, and update the worked example.
2. **Extend `makeWorkflowsConfig`** to validate the new shape and reject the legacy string form with a migration message.
3. **Update the worked-example YAML / fixtures** if any test fixtures use the legacy shape.

The resolver itself (task 2) consumes the resulting YAML; this task only changes the grammar and the gate that admits it.

## Task

### Part A — Spec updates: `designs/workflows-module-concept/action-authoring/spec.md`

1. **File layout block (around line 7–16).** Remove the `{action-type}-submit-hook.yaml` line — hooks no longer live as separate API files. Add a one-line note that hook routines live inline on the action YAML's `hooks:` block.

2. **Build-time validation list (around line 103).** Replace the hook-auth bullet:

   - **Old:** `hooks.{interaction}.{pre,post}` (if present) — each referenced hook API must declare `auth.roles ⊇ action.access.roles` and must not declare `auth.public: true`. See submit-pipeline "Hook auth gate." Fails the build with a path to the offending hook + action when the relationship doesn't hold.
   - **New:** `hooks.{interaction}.{pre,post}` (if present) — must be an **object** carrying an inline `routine:` array (Lowdefy Api routine shape). String values (the legacy form referencing an external Api id) are rejected with a migration message. The resolver emits the Api at build time with `auth.roles` synthesized from `action.access.roles` — no separate auth gate.

3. **Worked example for `qualify` (around line 361–366).** Replace:

   ```yaml
   hooks: # optional; per-interaction pre/post hook APIs (submit-pipeline Decision 4)
     submit_edit:
       pre: lead-onboarding-qualify-pre-submit
   ```

   with:

   ```yaml
   hooks: # optional; per-interaction pre/post routines (inline)
     submit_edit:
       pre:
         routine:
           - id: validate
             type: MongoDBFindOne
             connectionId: leads-collection
             properties:
               filter: { _id: { _payload: action.references.lead_id } }
           # ...further steps...
   ```

   Keep the rest of the worked example unchanged (the hook is illustrative; just demonstrate the inline shape).

4. **Workflow YAML example (around line 28).** Update the `on_complete` field on `phase-1`:

   - **Old:** `on_complete: workflow_config/onboarding/api/phase-1-complete.yaml`
   - **New:**
     ```yaml
     on_complete:
       routine:
         - id: notify-ops
           type: CallApi
           # ...
     ```

5. **Resolver pipeline table (around line 487).** Update the `makeWorkflowApis` row's "Emits" cell:

   - Replace "validates `hook.auth.roles ⊇ action.access.roles`" with "also emits resolver-derived hook Apis (one per declared `hooks.{interaction}.{pre|post}` routine) and group `on_complete` Apis with `auth.roles` synthesized from `action.access.roles`."

6. **Generated endpoint example (around line 515–522).** Update the `hooks:` map shape — it's still per-interaction strings on the **emitted** endpoint, but the values are now resolver-derived ids (`update-action-{action_type}-{interaction}-pre`), not author-supplied. Add a one-line comment to the same effect.

7. **Bottom note (around line 534).** Replace "Build-time validation: `hook.auth.roles ⊇ action.access.roles` (and `hook.auth.public !== true`) for every hook API referenced from `hooks.{interaction}.{pre,post}` — see submit-pipeline Decision 4." with: "Hook Apis are resolver-emitted with `auth.roles` synthesized from `action.access.roles`; the gate holds by construction. No separate validation pass."

   If the submit-pipeline spec is also referenced here as the canonical "Hook auth gate" source, leave that link in but adjust the surrounding wording to match the new model.

### Part B — Validator extension: `modules/workflows/resolvers/makeWorkflowsConfig.js`

Extend `validateAction` (around line 51) with hook-shape validation. Walk `action.hooks` (if present) and check each interaction slot:

```js
const HOOK_INTERACTIONS = [
  "submit_edit",
  "not_required",
  "resolve_error",
  "approve",
  "request_changes",
];
const HOOK_PHASES = ["pre", "post"];

function validateHooks(workflow, action) {
  if (!action.hooks) return;
  for (const interaction of Object.keys(action.hooks)) {
    if (!HOOK_INTERACTIONS.includes(interaction)) {
      fail(
        workflow.type,
        `action "${action.type}" hooks key "${interaction}" is not a known interaction (expected one of: ${HOOK_INTERACTIONS.join(", ")}).`,
      );
    }
    const phases = action.hooks[interaction];
    for (const phase of Object.keys(phases ?? {})) {
      if (!HOOK_PHASES.includes(phase)) {
        fail(
          workflow.type,
          `action "${action.type}" hooks.${interaction} phase "${phase}" is invalid (expected "pre" or "post").`,
        );
      }
      const value = phases[phase];
      if (typeof value === "string") {
        fail(
          workflow.type,
          `action "${action.type}" hooks.${interaction}.${phase} is a string ("${value}") — the legacy shape pointing at an external Api id. Convert to an inline routine object: { routine: [ ... ] }. See action-authoring/spec.md "Action hooks contract".`,
        );
      }
      if (
        value === null ||
        typeof value !== "object" ||
        !Array.isArray(value.routine)
      ) {
        fail(
          workflow.type,
          `action "${action.type}" hooks.${interaction}.${phase} must be an object with a routine: array (got: ${JSON.stringify(value)}).`,
        );
      }
    }
  }
}
```

Wire `validateHooks(workflow, action)` into the `validateAction` body.

Extend `validateWorkflow` similarly for `action_groups[].on_complete`:

```js
function validateGroupOnComplete(workflow, group) {
  if (!("on_complete" in group)) return;
  const value = group.on_complete;
  if (typeof value === "string") {
    fail(
      workflow.type,
      `action_groups "${group.id}" on_complete is a string ("${value}") — the legacy shape pointing at a YAML path. Convert to an inline routine object: { routine: [ ... ] }. See action-authoring/spec.md "Workflow YAML".`,
    );
  }
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray(value.routine)
  ) {
    fail(
      workflow.type,
      `action_groups "${group.id}" on_complete must be an object with a routine: array (got: ${JSON.stringify(value)}).`,
    );
  }
}
```

Wire `validateGroupOnComplete(workflow, group)` into the existing `for (const group of groups)` loop in `validateWorkflow`.

### Part C — Test fixtures: `modules/workflows/resolvers/makeWorkflowsConfig.test.js`

Add test cases mirroring the new validations:

1. **Inline hook routine passes.** An action with `hooks: { submit_edit: { pre: { routine: [{ id: 'x', type: 'MongoDBFindOne' }] } } }` validates cleanly.
2. **Legacy string hook fails with migration message.** `hooks: { submit_edit: { pre: 'some-api-id' } }` throws with `/legacy shape/` and `/Convert to an inline routine object/`.
3. **Malformed hook value fails.** `hooks: { submit_edit: { pre: { not_routine: [...] } } }` throws with `/must be an object with a routine: array/`.
4. **Unknown interaction fails.** `hooks: { surprise: { pre: { routine: [] } } }` throws with `/is not a known interaction/`.
5. **Inline `on_complete` routine passes.** A group with `on_complete: { routine: [...] }` validates cleanly.
6. **Legacy string `on_complete` fails with migration message.** A group with `on_complete: 'workflow_config/onboarding/api/phase-1-complete.yaml'` throws with `/legacy shape/`.

Re-run any existing tests touching `validateWorkflow` / `validateAction` to confirm no regression.

### Part D — Worked-example fixture (if present)

Search for any test fixture files using the legacy hook string form (e.g. `apps/demo/workflow_config/*.yaml`). If any exist, convert them to the inline shape with a minimal placeholder routine (e.g. `routine: [{ id: 'placeholder', type: 'Request' }]` is fine — task 2 doesn't execute routines, just emits them). If none exist, skip this part.

```bash
grep -rn "submit-hook\|pre: [a-z-]*$\|on_complete: [a-z./]*\.yaml" apps/ modules/ designs/ 2>/dev/null
```

Anything that turns up needs the same flip.

## Acceptance Criteria

- `node --test modules/workflows/resolvers/makeWorkflowsConfig.test.js` exits 0 with the six new test cases passing **and** all pre-existing cases still passing.
- `designs/workflows-module-concept/action-authoring/spec.md` reflects the inline-routine model in: file-layout block, validation list, `qualify` worked example, workflow YAML example, resolver pipeline table, generated-endpoint example, bottom note. A grep for `submit-hook.yaml` in the spec returns no matches.
- A grep for `'submit_edit:\\s*\\n\\s*pre: [a-z]'` (or equivalent regex for the legacy form) across `apps/`, `modules/`, and `designs/` returns no matches.
- Running `makeWorkflowsConfig` against a workflow with the legacy string-hook form throws a precise error matching `/hooks\..+\..+ is a string.+legacy shape/` and pointing at the offending action.
- Running `makeWorkflowsConfig` against a workflow with the legacy `on_complete: <yaml-path>` string throws a precise error matching `/on_complete is a string.+legacy shape/` and pointing at the offending group.

## Files

- `designs/workflows-module-concept/action-authoring/spec.md` — modify (file-layout, validation list, worked examples, resolver table, bottom note)
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify (add `validateHooks` and `validateGroupOnComplete`; wire into existing validators)
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify (add six test cases)
- Any `apps/**/*.yaml` or `designs/**/*.yaml` fixtures still using the legacy hook / `on_complete` string form — modify

## Notes

- **Don't widen scope beyond the schema flip.** This task does not author the resolver, does not change `makeWorkflowsConfig`'s normalized-output shape (hooks are still excluded from `ACTION_FIELDS` — they're build-time-only and the resolver in task 2 reads them off the raw YAML, not the normalized output), and does not touch part 9 / part 11 designs (those carry cross-part drift flagged in `review/consistency-1.md` and get folded when those parts enter their own review cycles).
- **Spec link rot.** The `submit-pipeline/spec.md` "Hook auth gate" section is still referenced from several other files (parts 9, 11). Leave the link alive in the action-authoring spec but adjust the surrounding wording so the link reads as "see this for historical context / runtime invocation contract" rather than "this is where the gate lives." A full sweep of submit-pipeline/spec.md is part of the cross-part fold-in tracked in `review/consistency-1.md`, not this task.
- **No runtime impact.** The submit handler (`SubmitWorkflowAction`) doesn't read `action.hooks` from anywhere — it'll read `hooks` off the endpoint payload that task 2's resolver bakes in. So this task can ship without coordinating with the engine.
- **Migration message style.** Match the existing `fail(workflowType, message)` shape in `makeWorkflowsConfig.js` so the error prefix is consistent (`makeWorkflowsConfig: workflow "..." action "...": ...`).
