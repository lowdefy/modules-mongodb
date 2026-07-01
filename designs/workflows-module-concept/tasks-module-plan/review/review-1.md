# Review 1 — Factual inconsistencies, schema framing, rename completeness

## Factual inconsistencies

### 1. `kind: external` is fabricated

> **Rejected.** `external` is a planned future kind (system-driven actions, no user surface) — not yet shipped or designed in a part. Added a parenthetical at the first mention (Common-fields `kind` bullet) clarifying that `custom` is in-design (Part 28) and `external` is forward-looking, so the taxonomy and the rename's rejected-alternatives argument remain coherent.

Lines 57, 95, and 99 enumerate the workflow-action kind taxonomy as `form / simple / tracker / custom / external`. `kind: external` does not exist anywhere in shipped code, active sub-designs, or active follow-on parts:

- `modules/workflows/resolvers/makeWorkflowsConfig.js:26` — `const ACTION_KINDS = ['form', 'task', 'tracker'];`
- `designs/workflows-module-concept/design.md:11` — sub-design summary lists only "three action kinds (form / simple / tracker)".
- `designs/workflows-module/parts/28-custom-action-kind/` — adds `custom` only.
- Repo-wide grep for `kind: external` / `kind external` returns zero hits.

Line 99 leans further on the fiction ("we already have `external` filling BPMN's 'Service Task' slot") to reject the alternative `user_task` name.

**Fix:** Drop every reference to `external`. The current/planned taxonomy is `form / simple / tracker / custom` (the last contingent on Part 28). The case for renaming `task` → `simple` stands on the three real kinds plus the in-flight fourth — no fifth needed.

### 2. `entity_id` / `entity_collection` listed in two mutually exclusive sections

> **Resolved.** Added a "Shared but conditional" sub-section between Workflow-only and Task-only. Holds `entity_id` / `entity_collection` with a note that workflow actions always populate them while tasks-module design decides whether to use these top-level fields or fold entity linkage into `references`. Removed the redundant entries from Workflow-only and Task-only.

Schema contract puts these fields in **Workflow-only** (line 70: "set on workflow actions, **null/absent** on tasks") and also in **Task-only** (line 77: "_optional_ for tasks (a task can be standalone or filed against a specific entity). Same field names as workflow actions; tasks just allow null"). They can't be both. The Task-only entry is correct (the constraint on line 86 confirms it: `entity_id, entity_collection ... must all be nullable at the schema level`).

**Fix:** Remove `entity_id` / `entity_collection` from the Workflow-only bullet on line 70. Either move them into a third **Shared but conditional** sub-section, or leave them under Task-only with a one-line note that workflow actions always populate them and tasks may set them.

### 3. Open Question 3 is already answered earlier in the doc

> **Resolved.** Dropped OQ 3. The Constraints section already captures the schema-level nullability requirement, and #2 deferred the populate-or-not question to tasks-module design.

OQ 3 asks "Does the existing `entity_id` / `entity_collection` field on the actions collection accept null?" Line 86 states "(None of the shipped Mongo writes enforce these as required today — verified — but the constraint needs to stay.)" Verified by inspection: `modules/workflows/connections/actions-collection.yaml` is a bare `MongoDBCollection` with no JSON Schema validator; no shipped code enforces a required constraint on these fields.

**Fix:** Drop OQ 3, or fold its remaining intent ("don't add a required constraint later") into the existing Schema-contract constraints list — that constraint is already implied by line 86.

### 4. The "existing indexes" listed under constraint 2 don't exist

> **Resolved.** Dropped the false "existing indexes" claim. Flagged the docs gap (workflows module doesn't document required indexes; other modules like `activities` do). Kept the forward-looking rule and added a caveat that partial indexes filtered on `workflow_id` existing must not be the sole index serving a query path both streams use.

Line 87 says "Existing indexes on `actions` are on `(workflow_id, status)`, `(entity_id, entity_collection)`, etc.". No index definitions exist in `modules/workflows/` or in the plugin source — no `createIndex` calls, no index manifests, no migration files in this repo. The actions collection is opened by `MongoDBCollection` and indexes (if any) live in operator-side migrations, not in the module.

**Fix:** Rewrite the bullet to drop the false claim. The forward-looking constraint ("no partial index filtered on `workflow_id` existing, and no non-null constraint added later") stands without needing to point at present-day indexes that don't exist.

## Discriminator confusion

### 5. Two competing discriminators stated

> **Resolved.** Replaced the single-sentence "discriminator is `workflow_id`" line with a two-sentence paragraph stating the layering explicitly: `kind` = user-facing surface, `workflow_id` = which stream wrote the doc; tasks module ignores `kind` on read, workflows engine ignores docs with `workflow_id: null`.

- Line 57: "**`kind`** — discriminator." (describes which surface an action presents)
- Line 80: "The discriminator that separates the streams is `workflow_id`: set means workflow-action, null means task."

Both can be true at different layers, but the doc never says that. A reader landing on line 80 first will assume `kind` is incidental; a reader landing on line 57 first will assume `workflow_id` is incidental.

**Fix:** State the layering explicitly once. Suggested wording: "`kind` discriminates the action's user-facing surface (`form` / `simple` / `tracker` / `custom` for workflow actions, `task` for adhoc); `workflow_id` discriminates the _stream_ — set means a workflow engine wrote it, null means a tasks module wrote it. The tasks module ignores `kind` on read; the workflows engine ignores any doc with `workflow_id: null`."

## Rename completeness

### 6. Demo app's `workflow_config` is missing from the rename file list

> **Resolved.** Added a "Demo app" sub-section under the rename file list calling out `install-step.yaml`, `schedule-followup.yaml`, and the two `task-edit` link references in `schedule-followup.yaml`.

The rename section (lines 102–126) catalogs concept docs, shipped module code, and active follow-on parts, but omits the demo app:

- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml:2` — `kind: task`
- `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml:2` — `kind: task`
- `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml:22,33` — `_module.pageId: { id: task-edit, module: workflows }`

The rename PR will fail CI (the demo app's `workflows_config` runs through the same `makeWorkflowsConfig` validator) unless these are updated. Other apps in the repo are CRMs / pages without workflows, so demo is the only consumer — but it is a consumer.

**Fix:** Add a bullet under "Shipped code" or a new "Demo app" bullet listing `apps/demo/modules/workflows/workflow_config/**` and `apps/demo/modules/workflows/vars.yaml` references.

### 7. Page-IDs migration paragraph (line 132) understates the cell-link reach

> **Resolved.** Replaced "in concept docs + shipped templates" with "in concept docs, shipped templates, and the demo app's `workflow_config/**`".

Line 132 says action `status_map.{stage}.{slug}.link.pageId` references the shared task pages "via `_module.pageId: { id: task-edit, module: workflows }`" and that "all such references in concept docs + shipped templates flip to `simple-edit`". Two clarifications needed:

- This pattern shows up in the **demo app's `schedule-followup.yaml`** (`link.pageId: { _module.pageId: { id: task-edit, module: workflows } }`) — same callsite shape, not in concept docs alone.
- The link-table in Part 30 has its own `task-edit` row (see `parts/30-status-map-rendering/design.md`); the design says it updates "accordingly" but doesn't list the row, which is fine — just confirm Part 30 is in the active follow-on list (it is, line 124).

**Fix:** Replace "in concept docs + shipped templates" with "in concept docs, shipped templates, and the demo app's `workflow_config/**`".

## Smaller items

### 8. "Possibly a `created_by` field" — already decided by `change_stamp`

> **Resolved.** Dropped the hedge — `change_stamp.created.user.id` records creator on insert across both streams. Combined with #10 (no task-only `title` field), Task-only became empty and was removed; replaced with a one-paragraph statement that tasks share Common, may set Shared-but-conditional, and leave Workflow-only null.

Line 78 hedges on whether tasks should add `created_by`. The doc already commits to `change_stamp` as a common field (line 58) and the events module's `change_stamp` captures `user.id` / `user.name` on insert (`docs/idioms.md` "Change stamps"). The first stamp on the doc _is_ `created_by`. No new field needed.

**Fix:** Replace the hedge with a one-line decision: "No separate `created_by`; `change_stamp.created.user.id` already records creator and is set on insert across both streams."

### 9. OQ 1 (rename batching) is a project-management call, not a design question

> **Resolved.** Dropped OQ 1. A separate implementation design already owns the rename rollout; the OQ has no place in this design.

The question — should the rename ship standalone or batch with the next active part? — has no design implication. The doc has already enumerated every affected file and committed the rename is mechanical. The recommendation on the same line already settles it ("standalone, small (S-sized)").

**Fix:** Either drop OQ 1 entirely (treat the recommendation as the decision) or move it under "Next step" as the rollout plan. Keeping it as an open question gives a reader the false impression that the rename's shape is unsettled.

### 10. "No retrofit needed on workflow actions" assumes the universal `description` is enough on workflow actions

> **Resolved.** Bigger than the optional add the reviewer flagged — uncovered an inconsistency with Part 30's display-field standardisation. Tasks now write the display title into the same top-level `<app-slug>.message` field that workflow actions use (Part 30's spread-from-`status_map` schema). No separate `title` field, no `kind`-branching in renderers. Removed the task-only `title` row from the schema, rewrote OQ 2's decision accordingly. Renderer-branching note moot.

OQ 2's decision is that tasks add a top-level `title`; workflow actions keep using `status_map.{stage}.{slug}.message`. This is consistent with the active design (action-authoring spec line 167 — `description` is universal, no `title`). One implication worth surfacing: the "my work" view that the doc twice cites as the main payoff (lines 3 and 199) will display a `title` column with mixed data — `task.title` for adhoc rows and `status_map[current_status][app_name].message` for workflow rows. That's the entity-page renderer's existing pattern, but `kind`-branching has to extend to whatever list/kanban view the tasks module ships. Worth a sentence under "How tasks render alongside workflow actions" so the tasks-module design picks it up.

**Fix (optional, can defer):** Add one sentence to OQ 2's decision: "Downstream consumers (kanban, my-work view, timeline) must branch on `kind` to pick the display string. Tasks-module design owns the renderer; workflows module exposes both fields unchanged."
