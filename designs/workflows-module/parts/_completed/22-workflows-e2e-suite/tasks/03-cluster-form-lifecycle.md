# Task 3: Cluster `form-lifecycle` — the template cluster

## Context

The harness (tasks 1–2) is green. This is the first cluster fixture and the **template the remaining clusters follow** — file layout, spine assertion shape, and tail technique established here get copied by tasks 4–10. It is also the suite's usage exemplar: the design's Verification says "a reviewer dropping the module into a fresh app can read `form-lifecycle` (config + spec) as a usage template", so the config should be clean, commented, and in current vocabulary.

Story (design cluster table): a form action with the `review` verb — `submit` → in-review → `approve` → done; the `request_changes` resubmit loop; `progress` draft-save (no validation, lands in-progress); `not_required`. Mode: **Spine** — render the real page, click the real button, the real per-action endpoint fires, Mongo mutates, assert the DB _and_ that the UI reflects it.

Authoring references: `apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml` (review-verb form action) and `qualify.yaml` (form keys/components, `form.` state-path prefix). FSM ground truth: `plugins/modules-mongodb-plugins/src/connections/.../fsm/tables.test.js` and part 38's design — the spec asserts representative transitions, not cells.

`kind: form` actions get **per-action pages emitted by `makeActionPages`** — one per form action × verb, page id `{type}-{action}-{verb}` from `templates/{verb}.yaml.njk`. With module scoping, URLs are `/workflows/{type}-{action}-{verb}?action_id=...`.

## Task

1. **Fixture workflow** `apps/workflows-test/modules/workflows/workflow_config/form-lifecycle/`:
   - `form-lifecycle.yaml` — `type: form-lifecycle`, `entity_collection: things-collection`, `entity_ref_key: thing_ids`, one action group, two starting actions (both `action-required`):
     - `reviewed-form` — `kind: form`, `access.test: { view: true, edit: true, review: true }` (role-gate the review verb in task 10's cluster, not here — keep this one maximally readable). A small form: one `required: true` `text_input`, one `text_area`. `status_map` messages for every stage the story visits (action-required, in-progress, in-review, changes-required, done).
     - `optional-form` — `kind: form`, `access.test: { view: true, edit: true }`, one optional field. Exists so `not_required` can be exercised without un-doing `reviewed-form`'s terminal state.
   - Add the `_ref` to `workflow_config/workflows.yaml`.

2. **Spec** `apps/workflows-test/e2e/workflows/form-lifecycle.spec.js`. Use `workflow.start({ workflow_type: 'form-lifecycle', entity })` against a seeded `things` doc, then drive the UI:
   - **Draft-save (`progress`)**: open `/workflows/form-lifecycle-reviewed-form-edit?action_id=...`, fill only the optional field (required field empty), click the progress/draft button → no validation block, action lands `in-progress`, form_data persisted (`mdb` read), reopening the page re-primes the saved value.
   - **Submit**: fill the required field, submit → `in-review`. Assert the submit was rejected first when the required field was empty (validation on `submit`, not on `progress`).
   - **Request changes**: open `/workflows/form-lifecycle-reviewed-form-review?action_id=...`, request changes (with a comment if the surface offers one) → `changes-required`; the edit page is again actionable; resubmit → `in-review`.
   - **Approve**: review page → approve → `done`. Spine closure: navigate back to `/thing-view?_id=...` and assert the `actions-on-entity` surface shows the action's `done` state — UI reflects committed DB state, per the design's "not a UI-only render check" rule.
   - **Not required**: on `optional-form`'s edit page, fire `not_required` → `not-required` stage, group/workflow summary recomputes (use `workflow.assertGroups` / `assertSummary`).
   - Throughout, pair every UI step with a `workflow.assertStatus` DB assertion.

3. Spec titles use concept-doc language (e.g. `"request_changes returns the form to the submitter and resubmit re-enters review"`) so a reader maps each test to an FSM row.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-workflows-test e2e` runs `form-lifecycle.spec.js` green (alongside `scaffold.spec.js`).
- The emitted page ids `form-lifecycle-reviewed-form-edit` / `-view` / `-review` all render (the `view` page gets at least one render assertion).
- At least one full-stack spine assertion exists: UI click → committed DB state → UI reflects it.
- Validation behaviour split is proven: `progress` saves without validation; `submit` enforces `required`.
- The config file reads as a usage template: commented, current vocabulary (`kind: form`, per-verb `access`), no test-DSL artifacts.

## Files

- `apps/workflows-test/modules/workflows/workflow_config/form-lifecycle/form-lifecycle.yaml` — create
- `apps/workflows-test/modules/workflows/workflow_config/form-lifecycle/reviewed-form.yaml` + `optional-form.yaml` — create (`_ref`'d action files, mirroring the demo's per-action file layout)
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — modify (add `_ref`)
- `apps/workflows-test/e2e/workflows/form-lifecycle.spec.js` — create

## Notes

- If a behaviour here is awkward to reach through Playwright but is really a plugin-JS property (e.g. an FSM edge with no UI surface), **stop and add a jest test instead** (Principle 4) — don't contort the spec. Note any such decision in the PR description.
- One test walking the sequential story (like `onboarding-happy-path.spec.js` does) is fine; state is sequential and teardown between steps would cost more than it buys. `not_required` can be a second test since it touches a different action.
