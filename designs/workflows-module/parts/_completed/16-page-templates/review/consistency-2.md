# Consistency Review 2

## Summary

Re-scanned part 16's tree after task files were generated and part 17 was modified to add `required_after_close` gating + reuse of part 16's request files. Found 1 minor terminology drift between part 17 and part 16/v0 conventions (bracket-notation vs. dot-notation operator paths); resolved. The new task files (01–05) are clean against review-1 and consistency-1 decisions — every contract propagated correctly. The `required_after_close` gate added to part 17 was evaluated as not-a-drift on part 16 (it doesn't apply there — see "No Issues" below).

## Files Reviewed

**Part 16 (the subject):**

- `designs/workflows-module/parts/16-page-templates/design.md`
- `designs/workflows-module/parts/16-page-templates/review/review-1.md`
- `designs/workflows-module/parts/16-page-templates/review/consistency-1.md`
- `designs/workflows-module/parts/16-page-templates/tasks/tasks.md`
- `designs/workflows-module/parts/16-page-templates/tasks/01-module-shipped-requests.md`
- `designs/workflows-module/parts/16-page-templates/tasks/02-view-template.md`
- `designs/workflows-module/parts/16-page-templates/tasks/03-edit-template.md`
- `designs/workflows-module/parts/16-page-templates/tasks/04-review-template.md`
- `designs/workflows-module/parts/16-page-templates/tasks/05-error-template.md`

**Adjacent parts cross-referenced (re-validated against part 16):**

- `designs/workflows-module/parts/17-shared-pages/design.md` (recently modified — flagged for review)
- `designs/workflows-module/parts/13-resolver-apis/design.md`
- `designs/workflows-module/parts/24-universal-fields/design.md`
- `designs/workflows-module/parts/18-entity-components/design.md`
- `designs/workflows-module/parts/12-resolver-pages/design.md`
- `designs/workflows-module/implementation-plan.md`

## Inconsistencies Found

### 1. Part 17 used `status[0]` bracket notation; part 16 + v0 codebase use `status.0` dot notation

**Type:** Stale Reference (cross-design vocabulary drift)
**Source of truth:** [CLAUDE.md § Operator dot notation and composition](../../../../CLAUDE.md) — "Most Lowdefy operators (`_state`, `_global`, `_request`, `_step`, `_payload`, etc.) support dot notation for nested access (e.g., `_step: get_lot.gates.s0`)." Part 16's `design.md` (line 33, 71, 73, 74) + tasks 02–05 all use `.0.` notation. v0 templates (`dist/workflows-module/ui/example_workflow/**/*.yaml`) use `.0.` notation throughout.
**Files affected:** [part 17 design.md](../../17-shared-pages/design.md) lines 15, 19, 23 — three `_request: get_action.status[0].stage` / `workflow's status[0].stage` references.
**Resolution:** Replaced all three with `.0.` notation. Line 15: `_request: get_action.status.0.stage` with a parenthetical pointing at CLAUDE.md's rule. Line 19: rewritten as `_request: get_action.status.0.stage` instead of equality test on `get_action.status[0].stage === 'not-required'`. Line 23: `workflow's status.0.stage`. No semantic change — just the operator-path string format.

## Items evaluated and dismissed (no inconsistency)

### Part 17's new `required_after_close` gate is not duplicated in part 16

**Type considered:** Internal Contradiction (between part 17 and part 16 about the gate's universality).
**Decision:** Not a drift. Reasoning:

Part 17 added a `required_after_close` gate (lines 23 + 36): on task-edit and task-review, when the workflow's `status.0.stage` is `completed` or `cancelled` AND the action does not declare `required_after_close: true`, the Save (or approve / request_changes) button renders disabled and a banner surfaces the closed-workflow constraint up-front rather than via a generic post-submit error.

Part 16 has **no parallel gate** on form-action edit / review / error templates. Initial scan flagged this as a potential drift but on inspection:

- **Form-action templates already cover the case via their stale-URL guards.** Edit's allowlist is `[action-required, in-progress, changes-required]`; review's is `[in-review, error]`; error's is `[error]`. When a workflow closes and `required_after_close: true` is **not** set, the engine's close-workflow sweep flips remaining open actions to `not-required` — which is outside every form-template allowlist. The user gets a stale-URL redirect to `-view`, not a banner-and-disabled-submit UX. Same effect (no-write), different mechanism.
- **Task pages lack a stale-URL guard.** The design's "Stale-URL redirect guards" table is explicit: task pages don't have one. Task pages render for any action status. So part 17 needs the explicit `required_after_close` gate to surface the closed-workflow state; part 16 doesn't need it because the status-based redirect handles it.
- **Action with `required_after_close: true` on a closed workflow** — the action's own status stays in a writable stage (`action-required` / `in-progress` / `changes-required`), so part 16's edit template renders normally. That's the intended behavior of `required_after_close`. No banner needed.

If form-action pages later need a banner UX (e.g. to _inform_ the user the workflow is closed even when the action remains writable), that's an additive expansion to part 16's design — not a fix for a drift.

### Comment-payload contract is intact across all tasks

Every interaction button payload in tasks 03 / 04 / 05 reads `_state: comment` and posts as a top-level `comment` field. Tasks explicitly note "the resolver-emitted API maps to `event.metadata.comment`" matching part 13's Comment-mapping subsection. No drift.

### `page_config` is consistently used (no `chrome` leftover, no `action_config.pages` drift)

Every per-verb chrome lookup in tasks 02–05 reads `page_config.{title|requests|events|formHeader|formFooter|modals|buttons|maxWidth}`. No reads of `action_config.pages.{verb}` anywhere. Matches part 12 design + resolver.

### Universal-fields component path is consistent across tasks 02–05 and part 24

All four template tasks `_ref` `../components/universal-fields/universal-fields.yaml` with `mode: edit | display` and `kind: form`. Part 24's "Component shipped" section commits the file at `modules/workflows/components/universal-fields/universal-fields.yaml`. Paths align.

### `action_role_check` path is consistent across tasks 02–05 and part 18

All four template tasks `_ref` `../components/action_role_check.yaml` in step 6 of onMount. Part 18 ships `components/action_role_check.yaml`. Paths align.

### Part 17 correctly references part 16's request files

Part 17 lines 53, 55–56, 93 explicitly state task and overview pages reuse part 16's request files under `modules/workflows/requests/` — no parallel `requests/` directory shipped. Task 1 of part 16 ships the canonical files; part 17 inherits.

### `DataView` vs. `DataDescriptions` callout is appropriate

Task 02 + 04 specify `DataView` (the design's source-of-truth call for v0 parity) and add a Notes callout flagging the repo's prior `DataView` → `DataDescriptions` migration. Implementer has the context to swap if the block isn't registered. No drift — the design says `DataView`; the swap is a Notes-section escape hatch, not a contradiction.

### Outer-card suppression rule is consistent

Tasks 03 (edit) and 05 (error) apply outer-card suppression with the correct first-entry check: task 03 reads `action_config.form[0]?.form`; task 05 reads `action_config.form_error[0]?.form`. Tasks 02 (view) and 04 (review) correctly omit the suppression (the design says "applies to edit and error only"). Matches design line 191.

### Block ordering in tasks matches design's "Block ordering inside layout.card" subsection

Tasks 03–05 list the right ordering: `title → page_config.formHeader → universal-fields band → form body → form-review body (review only) → comment → page_config.formFooter → floating-actions`. Matches design lines 168–181.

### Stale-URL allowlists in tasks match design

- Task 02 (view): explicitly states no stale-URL guard. Matches design line 72.
- Task 03 (edit): `[action-required, in-progress, changes-required]` + `_input: skip_status_redirect` escape hatch. Matches design line 71.
- Task 04 (review): `[in-review, error]`. Matches design line 73.
- Task 05 (error): `[error]`. Matches design line 74.

### `Edit` navigation button on review is wired correctly

Task 04 specifies the `Edit` button as a `Link` to `page_ids.edit` with `input: { skip_status_redirect: true }`. Task 03 specifies that the edit page's stale-URL guard respects `_input: skip_status_redirect`. The two ends agree.

### `not_required` opt-in is consistently described

Task 03 (edit): button gated on `page_config.buttons.not_required.visible: true` + `_state.action_allowed` + stage priority > 0. Task 02 (view): explicitly states no `not_required` button. Concept ui/spec.md lines 51–52 reflect the same. No drift.

### `_module.connectionId` paths are correct

Task 01 specifies `_module.connectionId: actions-collection` / `workflows-collection` (workflows module's own connections). Tasks 03/04/05 use `_module.endpointId` with `module: workflows` for `update-action-{action_type}`. The endpoint IDs are scoped under the module entry. All paths consistent with `module.lowdefy.yaml` connection declarations.

### Implementation plan and Wave 6 ordering remain consistent

Implementation plan Wave 6 (line 67–76) lists part 24 before parts 16/17/18 — matches the cross-part-dependencies callout in tasks.md. Repo footprint table (line 100) includes parts 16, 17, 18, 24 in the `modules/workflows/` repo.

## No Issues

All other checked items are consistent (covered above under "Items evaluated and dismissed" + this section's positive findings):

- Decision register from review-1 (16 findings) — fully reflected in design.md, tasks/, and adjacent parts.
- Decision register from consistency-1 (14 + 1 = 15 fixes) — still in place; no regression.
- Part 24's narrowed scope (form + task only; tracker excluded) — referenced consistently in tasks 02–05 (`kind: form` everywhere).
- Concept-spec updates from consistency-1 (`not_required` row in submit-pipeline button table; canonical YAML adds `comment` slot; ui/spec + ui/design corrections to payload-vs-engine-destination comment wording) — all still in place.
- The resolver code + tests (`makeActionPages.test.js`, `makeWorkflowApis.test.js`) are unchanged since consistency-1 — 51/51 tests still passing as of last run.

## Next Step

Tasks are now consistent end-to-end. Run `/r:design-start workflows-module/parts/16-page-templates all` to create GitHub issues for tasks 01–05 and start implementation.
