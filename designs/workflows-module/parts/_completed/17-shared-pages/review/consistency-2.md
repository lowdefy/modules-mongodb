# Consistency Review 2

## Summary

Second consistency pass after tasks/ was generated. Found one substantive design-vs-task contradiction (entity fetch on workflow-overview) plus two minor task-file issues. The substantive contradiction surfaced a deeper design gap — the workflows module had no contract for constructing the host-app entity-page URL — which the user resolved with a new `vars.entities` module var. Design and tasks updated to match the new direction.

## Files Reviewed

- **Design:** `designs/workflows-module/parts/17-shared-pages/design.md`
- **Reviews:** `review/review-1.md`, `review/consistency-1.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01-extend-get-entity-request.md` (deleted), `tasks/02-task-view-page.md`, `tasks/03-task-edit-page.md`, `tasks/04-task-review-page.md`, `tasks/05-workflow-overview-page.md`, `tasks/06-manifest-page-exports.md`, `tasks/07-demo-app-wiring.md`
- **Plans:** none
- **Supporting files:** none

## Inconsistencies Found

### 1. Design vs Task — entity-doc fetch on workflow-overview

**Type:** Design-vs-Task Drift / surfaced design gap
**Source of truth (initial):** `design.md` § "Reused module-shipped requests" (line 60) committed the overview page to fire `requests/get_entity.yaml` to fetch the entity doc for breadcrumbs / back-link.
**Files affected:** `design.md` § "Reused module-shipped requests", § "Workflow overview page", § "Depends on", § "Contract to neighbours", § Verification; `tasks/tasks.md`; `tasks/01-extend-get-entity-request.md`; `tasks/05-workflow-overview-page.md`; `tasks/07-demo-app-wiring.md`.

**Drift detected:** Task 5 picked option (b) "skip the entity fetch entirely" — overruling the design without a corresponding design update. Task 1 (the parameterization of `get_entity.yaml.njk`) was then declared "unused" by task 5's own body while still being a dependency in tasks.md.

**Deeper gap surfaced during user discussion:** The design committed to fetching the entity but never specified **how the workflows module would build the entity-page URL for the back-link**. v0 hardcoded `/ticket-view?_id=...` (single entity kind known at template-write time). The new design has workflows running on arbitrary entity collections per app; no documented contract for the URL pattern.

**Resolution path:** User proposed a new `vars.entities` module var:

```yaml
vars:
  entities:
    leads-collection:
      page_id: lead-view
      id_query_key: _id
      title: Lead
```

The workflow-overview page reads `_module.var: entities[workflow.entity_collection]` to build the back-link (`pageId: <page_id>`, `urlQuery: { <id_query_key>: <entity_id> }`) and the entity-kind label (`title`). No entity-doc fetch needed for v1 chrome (the static `title` is the breadcrumb label).

**Files changed:**

- **`design.md`:**
  - § "Workflow overview page": added an "Entity back-link" bullet pointing at the new `entities` var.
  - § "Reused module-shipped requests": rewrote the overview bullet to drop the entity fetch and reference the `entities` var.
  - **New § "`entities` module var"** added with field shapes (`page_id`, `id_query_key`, `title`), read mechanism (`_module.var`), build-time validation obligation (part 4), and manifest declaration obligation (part 20).
  - § "Depends on": part 4's role expanded to include the `entities` validator obligation; part 16's role narrowed (overview doesn't consume `get_entity.yaml.njk`); part 20 added.
  - § "Contract to neighbours": part 16's bullet updated; new bullet added for part 20's `vars.entities` declaration.
  - § Verification: added bullets for entity back-link behavior and the build-time validator.

- **`tasks/tasks.md`:** removed task 1 from the table; added an explanatory note about the numbering gap; updated the Overview to mention the new `vars.entities`; updated "External dependencies" to note `get_entity.yaml.njk` is not consumed; added a new "Cross-part obligations" section for the part 4 / part 20 obligations.

- **`tasks/01-extend-get-entity-request.md`:** **deleted** — the parameterization had no consumer after the design moved to the `entities` var approach.

- **`tasks/05-workflow-overview-page.md`:** rewrote the entity-fetch section. The `onMount` sequence drops `Request: get_entity`. A new "Entity back-link" block is specified, reading `_module.var: entities` with the `_object.from_entries` shape for the dynamic-key urlQuery. Acceptance criteria and Notes updated.

- **`tasks/07-demo-app-wiring.md`:** added a prerequisite step to declare `vars.entities` in the demo app; added a verification bullet for the entity back-link.

### 2. Task 02 — self-contradicting acceptance criterion

**Type:** Internal Contradiction (task file)
**Source of truth:** Design § `onMount` sequence step 4 — "task-view and task-review skip this step (no form-state priming)."
**Files affected:** `tasks/02-task-view-page.md` (acceptance criterion).

**Before (line 52):**

> `_request: get_action` and `_request: get_workflow` resolve correctly when the page loads with a valid `?action_id` (skip workflow fetch isn't possible structurally since both pages share the requests — the design says task-view _skips_ step 4, so don't emit `get_workflow` at all in onMount for task-view).

This both references `_request: get_workflow` succeeding AND says don't emit `get_workflow`. The "(skip workflow fetch isn't possible structurally...)" parenthetical was a writing-error leftover.

**Resolution:** Rewrote the acceptance criterion to say only `_request: get_action` resolves and explicitly state that `get_workflow` and `get_entity` are NOT emitted on task-view.

### 3. Task 02 — file-list wording

**Type:** Internal Contradiction (minor)
**Source of truth:** Design § "Reused module-shipped requests" — task-view fires only `get_action.yaml`.
**Files affected:** `tasks/02-task-view-page.md` (context section).

**Before (line 13):**

> Reuse of part 16's request files (`requests/get_action.yaml`, `requests/get_workflow.yaml`, `requests/get_entity.yaml.njk`) — though task pages don't actually fetch the entity per design § "Reused module-shipped requests."

Listed three files then noted task pages don't fetch the entity. The list also incorrectly implied task-view uses `get_workflow.yaml` (it doesn't — only task-edit does).

**Resolution:** Rewrote to "Task-view fires only `get_action.yaml` (no workflow fetch, no entity fetch — per design § "Reused module-shipped requests" and `onMount` sequence steps 4 and 5)."

## No Issues

- **`_completed/` link paths** are consistent across design and tasks (parts 15, 19 use `../_completed/`; non-completed parts use the direct path).
- **Verb namespacing** for `pages.{verb}.events.{handler}` (resolved in consistency-1 #3) stays consistent across design and tasks.
- **Eight-step `onMount` sequence** is consistently referenced — design owns the canonical list, tasks 2/3/4 each spell out the per-page projection without internal contradictions (after fix #2 above).
- **Status-selector filter inputs and disabled state** (priority rule, `not-required` terminal, `action_statuses_display` merge) consistent between design § task-edit and task 03.
- **`required_after_close` gate** consistent across task-edit and task-review descriptions in both design and task files.
- **Stale-URL redirect allowlists** consistent (`[action-required, in-progress, changes-required]` for edit; `[in-review, error]` for review; no guard on view).
- **Per-card `form_data` indexing** consistent — design § Workflow overview page and task 05 both spell out the keyed-vs-non-keyed lookup.
- **`pages.{verb}.events.{handler}`-only allowlist for task actions** consistent across design § Page event wiring and tasks 02/03/04.
- **`dist/...` path violations** — none remain (cleaned in consistency-1).
- **Review-finding numerical cross-references** in design — none remain (cleaned in consistency-1).
