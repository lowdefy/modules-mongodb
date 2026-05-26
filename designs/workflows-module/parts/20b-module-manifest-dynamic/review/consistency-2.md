# Consistency Review 2

## Summary

Scanned design.md + 10 task files against review-1 + consistency-1 decisions. One inconsistency found — propagated the fix to the design and three task files. No drift on terminology, status_map shape, or projection fix; no contradictions between tasks.

## Files Reviewed

**Design:** `design.md`
**Reviews:** `review/review-1.md`, `review/consistency-1.md`
**Tasks:** `tasks/tasks.md`, `tasks/01-fix-per-status-projection.md`, `tasks/02-entity-workflows-refetch-component.md`, `tasks/03-author-qualify-action.md`, `tasks/04-author-send-quote-action.md`, `tasks/05-author-schedule-followup-action.md`, `tasks/06-author-proof-of-installation-action.md`, `tasks/07-author-track-installation-action.md`, `tasks/08-restructure-onboarding-and-delete-trackers.md`, `tasks/09-lead-view-start-onboarding-modal.md`, `tasks/10-readme-update.md`

No `plan/` directory, no other supporting files.

## Inconsistencies Found

### 1. Short-form `_ref: hooks/<file>.yaml` paths won't resolve in app config

**Type:** Stale reference / factual error against Lowdefy semantics
**Source of truth:** App `_ref` paths resolve relative to `apps/demo/lowdefy.yaml` (the app root), not the file containing the `_ref` — confirmed by the existing `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` which uses `_ref: modules/workflows/workflow_config/onboarding/track-step-1.yaml` (full app-root-relative path).
**Files affected:** `design.md` (lines 149, 158), `tasks/03-author-qualify-action.md` (3 occurrences), `tasks/04-author-send-quote-action.md` (2 occurrences), `tasks/08-restructure-onboarding-and-delete-trackers.md` (2 occurrences).
**Resolution:** Asked user. **Decision (confirmed):** "app refs are relative to the lowdefy.yaml file." Updated every short-form `_ref: hooks/<file>.yaml` to its app-root-relative equivalent `_ref: modules/workflows/workflow_config/onboarding/hooks/<file>.yaml`. Added a one-line note at the first design occurrence (line 149 area) and in task 03 + task 04 + task 08 explaining the convention so the next reader doesn't trip over it.

## No Issues

- **Hook routine terminology** — every task uses "routine" / "routine file" consistently; no stale "hook YAML" / "hook Api file" language.
- **`key:` placeholder** — every reference uses `$device_serial`; no `$device_id` or literal `device` variants.
- **Per-status projection shape** — task 1's code blocks match design's "three-operand `_string.concat: [$, _module.var: app_name, .field]`" verbatim.
- **`link:` shape** — every reference uses `{ pageId: { _module.pageId: { id, module } }, urlQuery }` structure; no flat-string variants.
- **Part 02 framing** — no task mentions Part 02 retirement; design's "audit" posture is uncontradicted.
- **`entity-workflows-refetch` component** — task 2 describes it as a YAML fragment of two-action-array, consumed via `_ref: { module, component, vars }`; tasks 9 + 10 reference it the same way.
- **Action file paths** — all five new action files share the same `apps/demo/modules/workflows/workflow_config/onboarding/` directory; no cross-task disagreement.
- **Dependency table in tasks.md** — verified against each task's stated context; task 8 depends on 3–7, task 9 on 2 + 6 + 8, task 10 on 2 + 8.
- **Tracker action link** — task 7 documents `urlQuery.workflow_id: $child_workflow_id` and runtime-projection dependency; matches design's [Runtime-only deps] section.
- **Resolver-emitted ids** — task 8's acceptance criteria list matches design's [Verification § Build smoke] list verbatim (page ids, endpoint ids, hook Api ids, `workflow-onboarding-group-g1-on-complete`).

## Files Modified

- `designs/workflows-module/parts/20b-module-manifest-dynamic/design.md` — 2 `_ref` paths + added explanatory note.
- `designs/workflows-module/parts/20b-module-manifest-dynamic/tasks/03-author-qualify-action.md` — 3 `_ref` paths.
- `designs/workflows-module/parts/20b-module-manifest-dynamic/tasks/04-author-send-quote-action.md` — 2 `_ref` paths + added explanatory note.
- `designs/workflows-module/parts/20b-module-manifest-dynamic/tasks/08-restructure-onboarding-and-delete-trackers.md` — 2 `_ref` paths + added explanatory note.
