# Review 2

Second review, after review-1's five findings were resolved and `tasks/` was generated. The rewrite's premise still holds, and the spot-checked factual claims verify: `internal_mirror_child_active` is a real FSM signal (`fsm/tables.js:110`), `required_after_close` is the real close-sweep flag (`CloseWorkflow.js`), the demo e2e README does cite the 60–90s build cost (`apps/demo/e2e/README.md:30`), `templates/error.yaml.njk` exists for the form `-error` page, the demo's four workflows specs exist as described, and the demo confirms the `vars.yaml` wiring contract (`apps/demo/modules.yaml:10–13`). The findings below are about something the design asserts and the repo contradicts: **"All have shipped; the suite asserts current behaviour throughout" is not true**, and three in-flight parts rewrite the exact surfaces several clusters drive.

## Sequencing

### 1. Part 40 has not shipped, and the static check pages the suite drives still run the obsolete `interaction` model

> **Resolved.** Sequencing is owned by `implementation-plan.md`, not this design — the design is intentionally written against the target state of in-flight parts 40/46/48, so no gating subsection was added. The false claim was fixed: "Depends on" now names shipped vs. in-flight parts and points to the plan, "Contract to neighbours" no longer calls 40 shipped, and part 22's row in the plan records "after 40/46".

"Depends on" claims all listed parts "have shipped", and "Contract to neighbours" counts part 40 among the shipping parts (5–20, 23, **38–40**, 43). But part 40 lives in active `parts/40-simple-action-surfaces/` (not `_completed/`), is modified in the current working tree, and its own intro states the problem: the three shared `workflow-action-*` pages "still run the **old interaction model**". Verified — `modules/workflows/pages/workflow-action-edit.yaml:207` fires `interaction: submit_edit`, the wire field this design itself says no longer exists ("`signal` is the wire field; there is no `interaction`", § Fixture surface).

Consequence: the `check-blocked-by` spine (click a button on a static check page → engine commits) **cannot go green against current behaviour** — the pages send a payload the rebuilt engine doesn't speak. The same applies to any `access-verbs` assertion that renders a static check page's buttons. This isn't a doc nit; it propagates into `tasks/tasks.md`, which declares "tasks 4–10 can run in parallel" immediately after `form-lifecycle` — task 04 would be authored against broken pages.

Fix: in "Depends on", split the list into _shipped_ (38, 39, 43, 12/13/15, 19, 20a/b) and _prerequisite, in flight_ (40 — required before `check-blocked-by` and the check-page portions of `access-verbs`). Add the same gate to "Implementation order within this part", and correct the "Contract to neighbours" parts list. The tasks file then needs its parallelism claim patched (a `/r:design-task` re-run or targeted edit after action-review).

### 2. Parts 46 and 48 (also in flight) delete the mechanisms two cluster stories are written against

> **Resolved.** The two design-level touchpoints are now phrased in behaviour terms, stable across part 46: the `access-verbs` row no longer names `visible_verbs`/`action_allowed` (it states per-verb visibility, non-rendering of unfireable buttons, and endpoint rejection), and "What only e2e can prove" #1 drops `makeActionFormConfigs`, describing the seam instead. The `tracker.workflow_type` touchpoint needs nothing in the design — the field is only named in the generated task files, which are patched under finding 5 (the verified post-48 name is `tracker.child_workflow_type`).

Part 46 (`46-debundle-workflow-config/`, size XL, actively edited) retires the client verb mirror: `components/action_role_check.yaml` and the `action_allowed` bag are **deleted**, the `visible_verbs` YAML stage collapses into plugin JS, and button visibility becomes server-resolved `GetWorkflowAction` `action.buttons`/`allowed`. It also deletes `makeActionFormConfigs.js`, extends the three overview API responses, and reshapes `get_action` from array to object. Part 48 renames `tracker.workflow_type` → `tracker.child_workflow_type` in authored config.

This collides with the design in three places:

- **`access-verbs` cluster row** — "`actions-on-entity` renders per `visible_verbs`, buttons gate on the per-verb `action_allowed` bag" names two mechanisms scheduled for deletion. The _behaviour_ (per-verb visibility, role-gated buttons) survives 46; the design should state the story in behaviour terms ("buttons a role cannot fire do not render; the endpoint rejects the signal") so the cluster is stable across 46, rather than baking in mechanism names.
- **"What only e2e can prove" #1** names `makeActionFormConfigs` as a load-bearing resolver; under 46 it no longer exists. Same fix: name the seam (build emits form metadata consumed by pages), not the current resolver.
- **`tracker-child` fixture** would author `tracker.workflow_type`, which 48 renames. One line in the cluster row or the task noting the field name follows part 48's outcome avoids a silent fixture break.

The cheapest structural fix covering 1+2: a short "Sequencing vs. in-flight parts" subsection stating which clusters are blocked on which part (check pages → 40; nothing hard-blocks on 46/48, but cluster prose and fixtures must be mechanism-agnostic where 46/48 churn), replacing the false "All have shipped" sentence.

### 3. Part 49 changes `request_changes` gating out from under two clusters

> **Resolved.** Part 49 will ship before this suite is built (22 is queued behind 40/46), so the inversion window never opens — specs are authored against the post-49 view-or-review gate. Rather than pinning a probe signal in the design, part 49 was added to the "Depends on" in-flight list (the design is written against its target state). Task 10's probe phrasing is checked in the finding-5 task patch pass.

`parts/_next/49-request-changes-verb-gate/` (untracked, queued) flips the engine gate for `request_changes` from `review` to `view` OR `review`. Two touchpoints: `form-lifecycle`'s `request_changes` resubmit loop, and `access-verbs`'s "role missing a signal's verb is rejected at the endpoint". If the rejection assertion is authored against `request_changes`, it inverts when 49 lands (a view-only role goes from rejected to accepted). Fix is one sentence in `access-verbs`: pick the gate-rejection probe from signals 49 doesn't touch (`approve` is the stable one — it stays `review`-only), and note the `request_changes` loop in `form-lifecycle` should exercise a role that holds the verb under both rules.

## Coverage

### 4. `get-action-group-overview` and the two overview pages are uncovered, but Verification claims total surface coverage

> **Resolved.** Coverage added rather than narrowing the Verification claim: `get-action-group-overview` joins the `operational-lifecycle` API list, and `check-blocked-by` opens `workflow-overview` + `workflow-group-overview` against its group-structured workflow with one render assertion each. (Part 46 reshapes these surfaces; the design is written against its target state per finding 1's resolution.)

Verification promises "each operational API returns its documented shape" and "every emitted surface is proven reachable". Two gaps:

- `modules/workflows/api/` ships **six** operational APIs; the `operational-lifecycle` cluster lists five — `get-action-group-overview` (backing the part-25 group overview page) is omitted.
- The module manifest exports five static pages (`module.lowdefy.yaml:154–160`): the three `workflow-action-*` check pages **plus `workflow-overview` and `workflow-group-overview`**. No cluster renders the two overview pages; `operational-lifecycle` hits the overview _APIs_ headless (Tail) only.

Fix: add `get-action-group-overview` to the `operational-lifecycle` row, and give the two overview pages a render assertion in the cluster where they naturally appear — `check-blocked-by` already builds a group-structured workflow, so opening `workflow-group-overview` and `workflow-overview` there is one navigation + assertion each, not a new cluster. (Note both pages are also rewired by part 46 — same mechanism-agnostic caution as finding 2.) Alternatively, scope the Verification bullet honestly to the surfaces the clusters actually drive — but the two pages are cheap to cover and are exactly the "wired and reachable" seam this part owns.

## Minor

### 5. Tasks were generated against the unreviewed design and inherit findings 1–4

> **Resolved.** Targeted patch instead of regenerating: task 04 gains the two overview-page render assertions (finding 4); task 07 renames to `tracker.child_workflow_type` (part 48); task 09's story line adds `get-action-group-overview` (its body already included it); task 10 is rephrased in behaviour terms with the client verb mirror noted as retired by part 46, and its part-49 note now states post-49 gating as the baseline (the rejection probe already used the 49-stable `approve`). `tasks.md`'s "tasks 4–10 in parallel" stands — under finding 1's resolution the suite runs after parts 40/46 land, so no task is authored against the pre-40 pages.

`tasks/tasks.md` records "Review files skipped: review/ (entire folder)" and was generated before this review. Concretely affected: the "tasks 4–10 can run in parallel" ordering (finding 1), task 09's API list (finding 4), task 10's mechanism phrasing (findings 2–3), and task 07's tracker field name (finding 2). After action-review, the task set needs a patch pass — not a finding against the design text itself, but flagged so it isn't missed.
