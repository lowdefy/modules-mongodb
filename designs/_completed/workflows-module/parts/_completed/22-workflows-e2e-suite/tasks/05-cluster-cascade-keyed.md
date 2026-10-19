# Task 5: Cluster `cascade-keyed`

## Context

Follows the `form-lifecycle` template (task 3). Story: a driver action whose `submit` pre-hook returns `actions[]` that cascade `block` / `error` / `activate` at sibling actions and `upsert: true`-spawns a **keyed** action at its `none`-row birth stage. This is the **production mechanism** for engine-only signals — the old design's `control`-action test DSL is dead; cascades are expressed exactly as a real app would write them. Mode: **Spine + Tail**.

Authoring reference for the pre-hook shape: `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml` —

```yaml
hooks:
  submit:
    pre:
      routine:
        - :return:
            actions:
              - type: site-visit
                signal: activate
                upsert: true
```

The hook endpoint the resolver emits per `{type, action, signal, phase}` is `{type}-{action}-{signal}-{phase}` (`makeWorkflowApis.js:12`); the engine calls it via the connection's hook slot — no wiring needed in the fixture beyond the `hooks:` block. Cascade semantics (multi-level, depth guard, FSM no-op skip) are unit-owned (`runTrackerCascade.test.js`, `resolveSignal.test.js` for `none`-row upsert spawn); this cluster proves the mechanism fires through the wired app.

## Task

1. **Fixture workflow** `workflow_config/cascade-keyed/`: `type: cascade-keyed`, entity `things-collection`. Actions (all `access.test: { view: true, edit: true }`):
   - `driver` — `kind: form`, starts `action-required`. Its form carries fields that let one submit express the scenario (e.g. a `yes_no_selector` per cascade branch, or a single `enum_selector` choosing which siblings to hit) so the spec controls the cascade through real form input. Its `submit` pre-hook routine returns `actions[]`:
     - `signal: block` at sibling `gets-blocked` (starts `action-required`),
     - `signal: error` at sibling `gets-errored` (starts `action-required`; needs the `error` verb surface only if the spec opens its page — keep recovery out, that's task 6's story),
     - `signal: activate` at sibling `gets-activated` (starts `blocked`),
     - `{ type: keyed-spawn, signal: activate, upsert: true, key: <from form input> }` — the keyed action is **not** in `starting_actions`; it spawns at its `none`-row birth stage. Give `keyed-spawn` a config entry (kind: check is fine) but no starting status.
   - `_ref` from `workflows.yaml`.

2. **Spec** `e2e/workflows/cascade-keyed.spec.js`:
   - **Spine**: seed thing, `workflow.start`, open the driver's emitted edit page, fill the form, click submit. Assert via `mdb`/`workflow.assertStatus`: `gets-blocked` → blocked, `gets-errored` → error stage, `gets-activated` → action-required, and a new `keyed-spawn` action doc exists with the expected key at its birth stage. Assert `thing-view` reflects the new states (spine closure).
   - **Tail**: permutations through the real endpoint, no browser — use `workflow.setStage` to reposition siblings, then `workflow.submit(driver_id, { signal: 'submit', form: {...} })` with different form values; assert outcomes. Cover at least: upsert against an **existing** keyed action (second submit with same key — no duplicate doc; FSM no-op or re-signal per the shipped behaviour in `resolveSignal.test.js`), and a cascade landing on a sibling already in the target stage (no-op skip, no error).

## Acceptance Criteria

- Spec green in the full suite.
- One spine pass proves all four cascade effects (block / error / activate / keyed upsert-spawn) from a single real form submit, asserted in DB and reflected in UI.
- Tail proves upsert idempotency against an existing key through the real endpoint only.
- The fixture contains no test-only signal surface — every engine-only signal originates from the pre-hook `actions[]` return, the production mechanism.

## Files

- `apps/workflows-test/modules/workflows/workflow_config/cascade-keyed/cascade-keyed.yaml` + per-action yamls — create
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — modify (add `_ref`)
- `apps/workflows-test/e2e/workflows/cascade-keyed.spec.js` — create

## Notes

- Exact keyed-action config vocabulary (`key` on the cascade entry, keyed identity on the doc): verify against part 38's design and `resolveSignal.test.js` fixtures before authoring — the design names the behaviour ("`upsert: true`-spawns a keyed action at its `none`-row birth stage") but the YAML spelling must match the shipped engine.
- Keyed **terminality** (keyed actions and blocked_by fixpoint interaction) is a unit-backfill candidate (task 13), not e2e scope.
