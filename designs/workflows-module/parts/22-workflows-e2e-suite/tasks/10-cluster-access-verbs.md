# Task 10: Cluster `access-verbs`

## Context

Follows the `form-lifecycle` template (task 3). Story: per-verb button and page visibility under different roles — the `actions-on-entity` component renders per `visible_verbs`, buttons gate on the per-verb `action_allowed` bag, and a role missing a signal's verb is **rejected at the endpoint**. Mode: **Spine (UI)** with an endpoint-rejection tail.

Access vocabulary (verified in `makeWorkflowsConfig.js`): per-app, per-verb gates under `access.{app_name}.{verb}`, where a gate is `true` (any role) or a non-empty array of role strings; an omitted verb key denies; the empty list `[]` is a build error. The test app's `app_name` is `test` and `user_schema.roles_path` is `roles`, so `ldf.user({ roles: [...] })` controls the caller's verb set. Gate evaluation lives in `modules/workflows/components/evaluateVerbGate.js` / `action_role_check.yaml`; endpoint-side enforcement is in the submit handler (unit-covered for logic — per-verb gates in `SubmitWorkflowAction` tests). This cluster proves the gates **bind through the wired app**: rendered UI and live endpoint, per role.

## Task

1. **Fixture workflow** `workflow_config/access-verbs/`: `type: access-verbs`, entity `things-collection`. Form actions with deliberately distinct access bags, e.g.:
   - `everyone-edits` — `access.test: { view: true, edit: true }`.
   - `reviewer-gated` — `access.test: { view: true, edit: true, review: [reviewer] }` (review verb role-gated; the `review` verb is action-global per `resolveSignal.test.js` — the design's "action-global review rule").
   - `admin-only` — `access.test: { view: [admin], edit: [admin] }`.
   - `_ref` from `workflows.yaml`.

2. **Spec** `e2e/workflows/access-verbs.spec.js`. Three sessions via `ldf.user({ roles: [...] })`: a plain user (`roles: []` or `[user]`), a `reviewer`, an `admin`. For each:
   - **`actions-on-entity` visibility**: on `/thing-view`, assert each action row renders (or is absent/inert) per that role's `visible_verbs` — e.g. `admin-only` is invisible (or shows no link) to the plain user, visible to admin.
   - **Page + button gating**: `reviewer-gated`'s edit page renders its submit button for everyone with `edit`; its review page's approve/request-changes buttons render for the reviewer and **not** for the plain user (the per-verb `action_allowed` bag driving button render). Assert the page-level behaviour for a role without `view` on `admin-only` (no leak of action data — whatever the shipped behaviour is: redirect, empty, or 403 surface; assert it deliberately).
   - **Endpoint rejection (tail)**: as the plain user, walk `reviewed-gated` to in-review through the UI, then fire `workflow.submit(action_id, { signal: 'approve', ... , expectError: true })` directly — the real endpoint rejects (role lacks `review`), and the action doc is unchanged. One positive control: the same call as `reviewer` succeeds.

## Acceptance Criteria

- Spec green in the full suite.
- Visibility asserted for at least three role profiles across the three access bags, on the rendered `actions-on-entity` surface.
- Button-level gating asserted on a review page (render for reviewer, absent for non-reviewer).
- Endpoint-side enforcement proven: one rejected signal (DB unchanged) and its positive control through the same real endpoint.

## Files

- `apps/workflows-test/modules/workflows/workflow_config/access-verbs/access-verbs.yaml` + per-action yamls — create
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — modify (add `_ref`)
- `apps/workflows-test/e2e/workflows/access-verbs.spec.js` — create

## Notes

- Multi-**app** verb-filter coverage (role unions across `app_name`s) is explicitly deferred by the design — one `app_name` only. This cluster is multi-*role* within `test`.
- If part 49 (`request-changes` verb gate, in `designs/workflows-module/parts/_next/`) lands before this task, re-read its design — the review-verb gating asserted here may gain a per-signal nuance. Assert shipped behaviour, and flag any design/code mismatch rather than encoding it.
