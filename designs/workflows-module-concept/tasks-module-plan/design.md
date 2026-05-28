# Tasks Module Plan — Adhoc Actions Alongside Workflow Actions

A forward-looking concept for a future `tasks` module that lives next to `workflows` and shares the same `actions` collection. Workflow actions are pre-defined steps inside a `workflow_config`; tasks are adhoc todos that users (or external systems) create at runtime. Both are work items the same user does — putting them in one collection means a single "my work" view can surface both, and lets us reuse the status enum, change-stamp, references shape, and events-as-comments pattern already shipped.

This design is **not** the tasks module's implementation design. It's the boundary contract: what the `workflows` module must lock in *now* so the future `tasks` module can be built on the same collection without contortions or rewrites.

## Proposed change

1. Treat the `actions` collection as shared between the `workflows` module (already implemented) and a future `tasks` module — every doc has the same base shape; workflow-only fields are optional, task-only fields are optional, no doc is required to set both kinds of fields.
2. Rename the current `kind: task` workflow-action kind to `kind: simple`, freeing the word "task" for the adhoc concept. The rename amends the action-authoring grammar, the shipped resolvers/handlers, the three module-shipped pages (`task-edit` / `task-view` / `task-review` → `simple-edit` / `simple-view` / `simple-review`), and the active follow-on parts that reference the kind.
3. Introduce adhoc-task semantics on the `actions` doc — `workflow_id: null`, user-supplied `title`, user-supplied `description`, optional entity link, no `blocked_by`, no `hooks:` / `interactions:` evaluation, transitions driven directly by user submit not by the workflow engine.
4. Reuse the existing `global.action_statuses` enum as a strict superset; adhoc tasks use a fixed subset (`action-required` / `in-progress` / `done` / `not-required`). No new status enum, no parallel state machine.
5. Reuse the events-as-comments pattern (`events` module already shipped) so comments on adhoc tasks render through the same timeline component as workflow-action events.
6. Defer everything tasks-module-specific — the actual module manifest, kanban view, gantt view, adhoc-creation APIs, assignment/access model for adhoc tasks, external-creation SDK — to dedicated designs once workflows ships.

## Industry reference points

Every mature work-tracker collapses "work item" into one logical collection with optional structural parents:

| Tool    | Collection | Optional parent / container               |
| ------- | ---------- | ----------------------------------------- |
| Linear  | Issues     | Project / Cycle / Initiative (all optional) |
| Jira    | Issues     | Epic / Sprint                             |
| Asana   | Tasks      | Project / Section (My Tasks = no project) |
| GitHub  | Issues     | Milestone / Project                       |
| ClickUp | Tasks      | List / Folder                             |
| Monday  | Items      | Board                                     |

Workflow vs adhoc maps cleanly onto "in a project" vs "no project". Splitting into two collections would mean a second status taxonomy, a duplicate notifications path, two access models, and a "my work" view that has to merge from two sources. The shared-collection direction is the well-trodden one.

## The two streams

**Stream 1 — workflow actions** (already designed).

- Created by `start-workflow` when the workflow is initiated; the set of actions is fixed by the workflow's `starting_actions` and `action_groups`.
- `workflow_id`, `action_group`, `type` (from workflow config), `kind` (form / simple / tracker / custom / external), `blocked_by` all set from the YAML config.
- `title` / `description` come from the workflow YAML config (action authoring spec); they're config-derived, not user-supplied per instance.
- Status transitions flow through `SubmitWorkflowAction` — validation, pre-hook, writes, side effects, post-hook, group recomputation. Engine-orchestrated.
- Access is role-based + verb-based, declared per action in YAML.

**Stream 2 — adhoc tasks** (future module).

- Created by users at runtime via a `create-task` API (or by external systems / LLMs via that API — meeting-minutes summariser feeding action items is the canonical example).
- `workflow_id: null`. No `action_group`. No `type` from a config; if a `type` field is kept on the doc it's either null or a free-form tag.
- `kind: task`. No `blocked_by`. No `hooks:` / `interactions:`.
- `title` and `description` are user-supplied at creation and editable thereafter.
- Status transitions are direct writes — user picks the new status on a form, the tasks module writes it. No state machine beyond "current status is in the allowed set".
- Access is doc-level (creator + assignees + optional team scope), not config-driven.

## Schema contract

The shared `actions` collection holds both streams. Field categories:

### Common (every doc)

- `_id`, `change_stamp`
- `kind` — discriminator. Workflows: `form` / `simple` / `tracker` / `custom` / `external`. Tasks: `task`.
- `status` (current) and the status-history array — both streams use the same shape.
- `assignees` — universal-fields component, already shipped.
- `due_date` — universal-fields component.
- `description` — universal-fields component; workflow actions get it from YAML config, tasks get it from user input. Field shape is identical.
- `references` — used by the events module + entity-page integration. Both streams use the same shape.

### Workflow-only (set on workflow actions, **null/absent** on tasks)

- `workflow_id`, `workflow_type`
- `entity_id`, `entity_collection` (workflow actions always have these — they're scoped to an entity by the workflow they belong to)
- `action_group`, `type`
- `blocked_by`, `unblocks_on` (engine-managed)
- `child_workflow_id` / `child_entity_id` / `child_entity_collection` (tracker actions only — already a sparse field)
- `form_data` (form actions only — already sparse)
- The engine-computed `link` / `status_map` rendering output (engine-managed; only meaningful for workflow actions)

### Task-only (set on tasks, **null/absent** on workflow actions)

- `title` — user-supplied. Workflow actions have title derived from `type` + `status_map`; tasks need a top-level user-editable string.
- `entity_id`, `entity_collection` — *optional* for tasks (a task can be standalone or filed against a specific entity). Same field names as workflow actions; tasks just allow null.
- Possibly a `created_by` field — though `change_stamp` already records this for both streams.

No task-only field is required on workflow-action docs. No workflow-only field is required on task docs. The discriminator that separates the streams is `workflow_id`: set means workflow-action, null means task.

### Constraints this places on the workflows module

These are the things the workflows module ships must respect so the tasks module can write to the same collection cleanly:

- **No collection-level required fields** beyond `_id`, `kind`, `status`, `change_stamp`. In particular, `workflow_id`, `type`, `entity_id`, `entity_collection`, `action_group` must all be nullable at the schema level. (None of the shipped Mongo writes enforce these as required today — verified — but the constraint needs to stay.)
- **No index assumes `workflow_id` is present.** Existing indexes on `actions` are on `(workflow_id, status)`, `(entity_id, entity_collection)`, etc. — partial indexes filtered on `workflow_id` existing would be fine; non-partial indexes on `workflow_id` are also fine because Mongo indexes nulls. No change needed; just don't add a non-null constraint later.
- **`type` is not required.** Workflow actions always have a `type`; tasks may not. If the field exists on a task, it's a free-form tag, not a workflow-config slug.
- **The status enum stays a strict superset** of what adhoc tasks need. The shipped enum (`action_statuses`) already includes `action-required`, `in-progress`, `done`, `not-required` — the four states adhoc tasks need. No engine work assumes a workflow action will *never* sit in just those four states either.

## The `kind: task` → `kind: simple` rename

Current `kind: task` is a workflow-action kind for "user does a real-world thing, marks it done, no input form". It's parallel to `form` / `tracker` / `custom` / `external` in that it describes the action's surface. Renaming frees the word "task" for the adhoc concept and ends the collision.

**New name: `simple`.** Reads alongside the existing kinds — `form` captures input, `simple` captures nothing, `tracker` subscribes, `custom` delegates to the app, `external` lets a system drive it. Rejected alternatives:

- `manual` — misleading. `form` actions are also human-driven; the differentiator is "has input surface" vs "no input surface", not human-vs-automated.
- `step` — undifferentiated. Every workflow action is a step.
- `user_task` (BPMN's term) — verbose, and we already have `external` filling BPMN's "Service Task" slot.

### Files that change with the rename

Concept-level (designs, not shipped — small edits):

- `workflows-module-concept/design.md` (worked example: `schedule-followup` → `kind: simple`, references to "task action")
- `workflows-module-concept/action-authoring/spec.md` (taxonomy table, validation rules)
- `workflows-module-concept/action-authoring/design.md` (decision 2, sample YAML, mutual-exclusion list)
- `workflows-module-concept/submit-pipeline/spec.md` (resolver scope: "Emitted for `kind: form` and `kind: simple` actions")
- `workflows-module-concept/ui/spec.md` (shared-page naming)
- `workflows-module-concept/action-groups/spec.md` (where it references `task`)

Shipped code (already in `modules/workflows/` and `plugins/`):

- `modules/workflows/resolvers/makeWorkflowApis.js` — `isTask = action.kind === 'task'` → `'simple'`
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — `ACTION_KINDS` constant and validation branch
- `modules/workflows/pages/task-edit.yaml` / `task-view.yaml` / `task-review.yaml` — file rename to `simple-*` + internal `kind: task` references → `simple`. Page IDs (`task-edit` etc.) referenced via `_module.pageId` in worked examples + YAML status_map links also flip.
- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — `ActionKind` typedef
- `modules/workflows/README.md` — wording

Active follow-on parts (designs not yet implemented or amending shipped code):

- `workflows-module/parts/24-universal-fields/` — `kind: form | task` comment becomes `form | simple`
- `workflows-module/parts/28-custom-action-kind/` — references task semantics
- `workflows-module/parts/30-status-map-rendering/` — `kind: task | form | tracker` everywhere
- `workflows-module/parts/34-action-access-model/` — `kind: task` in per-verb table example
- Parts under `_completed/` that reference `kind: task` in the historical record stay as-is (history); new amendments use the new name.

The rename is mechanical — no behavioural change, no migration of existing data because the workflows module hasn't shipped to production. It's purely a vocabulary swap, but it has to happen before the first real app onboards or the renames-on-shipped-customers conversation gets expensive.

### Migration of the page IDs

The three shared pages (`task-edit`, `task-view`, `task-review` in `modules/workflows/pages/`) become `simple-edit`, `simple-view`, `simple-review`. Action `status_map.{stage}.{slug}.link.pageId` references these via `_module.pageId: { id: task-edit, module: workflows }` — all such references in concept docs + shipped templates flip to `simple-edit`. The link table in `parts/30-status-map-rendering/design.md` updates accordingly.

## Status enum subset for adhoc tasks

Adhoc tasks use a fixed subset of `global.action_statuses`:

| Status            | Default label    |
| ----------------- | ---------------- |
| `action-required` | Action Required  |
| `in-progress`     | In Progress      |
| `done`            | Done             |
| `not-required`    | Not Required     |

The labels read identically across both streams. They were chosen against user research with business users who preferred them over the common "Todo / In Progress / Done / Cancelled" set:

- **"Action Required"** depersonalises the work — *someone* needs to act. Fits an engine telling an assignee they're up *and* a creator filing a todo for a teammate. "Todo" carries an implicit "I" which mis-frames assigned work in both streams.
- **"Not Required"** reads as a rational decision that the work doesn't need to happen. "Cancelled" implied failure or interruption, which business users reacted negatively to. "Not Required" is neutral closure.

The engine-vs-user origin of each transition (the engine skipping a step vs. a user deciding a todo doesn't matter) is an implementation mechanism, not a semantic split — the user-facing meaning is the same.

Excluded from the adhoc subset: `blocked` (no dependencies to evaluate), `error` (no engine validation), `changes-required` (no review flow), `in-review` (no review flow). These remain on the enum and only workflow actions use them — adhoc tasks never enter those states.

The tasks module will reject create/update requests that try to set an adhoc-task status outside the four allowed values. The workflows module needs no change here — the shipped enum and its display labels already cover both streams.

## Engine boundary

The workflows module's engine — `SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`, tracker subscription, group recomputation — exists to manage the workflow lifecycle. None of these handlers are called for adhoc tasks. The tasks module will have its own (much simpler) write handlers:

- `create-task` — insert into `actions` with `kind: task`, status `action-required`, user-supplied `title` / `description` / `assignees` / `due_date` / optional entity link.
- `update-task` — update fields directly; log a status-change event if status changed.
- `delete-task` (or close-task) — TBD; likely a soft-delete or status flip.

These handlers do **not** invoke the workflow engine. They share the `actions` collection and the events module's comment-event pattern; nothing else.

The workflows engine must not assume every doc in `actions` was written by it. Specifically:

- The tracker subscription queries the `actions` collection looking for `child_workflow_id` matches — tasks never set this field, so they're transparent to the subscription.
- The group recomputation reads `actions` filtered by `workflow_id` — tasks have `workflow_id: null` and are excluded by the filter naturally.
- The `references` write contract assumes the doc was inserted in a workflow flow; tasks will write references the same way but never trigger workflow-engine logic from a reference update.

All three are already true in the current implementation. The constraint is to keep them true.

## Comments via events

Both workflow actions and adhoc tasks use the `events` module's `new-event` API to record comments. The event shape is identical: `references.action_ids: [<action_id>]` (and `references.workflow_ids: [<workflow_id>]` for workflow actions only — tasks omit it), `type: comment-added` (or whatever the agreed comment event type is), `metadata.comment: "<user-supplied text>"`.

A single timeline component can render events filtered by `action_id` for both streams, identical UI, identical write path. No new comment storage, no parallel comment model.

## Access model — different shapes, no overlap

Workflow actions have a config-driven access model: `access.{app_name}: [verb, ...]`, `access.roles: [...]`. The workflows engine enforces it at submit time.

Adhoc tasks have a doc-driven access model: creator can edit/delete, assignees can edit + change status + comment, optional team scope for view. The tasks module will define this in its own design; nothing about it touches the workflows engine.

Both can co-exist because the access checks live in the *submit handler*, not in the collection. Workflow handlers gate on the workflow-config-derived rules; task handlers gate on the doc-level rules. The collection itself doesn't enforce either — the calling API does.

The constraint on workflows: don't put access-enforcement logic in a place (e.g., a collection-level read trigger, or a shared aggregation helper that assumes `workflow_id`) that would force tasks to participate in workflow access rules.

## Out of scope

These belong to the tasks module's own design(s), not this one:

- The tasks module's manifest (`module.lowdefy.yaml`), exports, vars.
- The tasks-module APIs: `create-task`, `update-task`, `get-my-tasks`, etc.
- Kanban view shape (columns, filters, card design).
- Gantt / timeline view.
- The tasks module's doc-level access rules and how assignees / creator / team scope compose.
- Whether the "my work" view surfaces workflow actions assigned to the user alongside tasks (likely yes — main payoff of the shared collection — but the kanban / view design owns the call).
- External-creation SDK / API for LLMs and external systems to create tasks. Its own dedicated design, after workflows and the tasks module v1 both ship.
- Subtask / hierarchy on adhoc tasks (most tools support this — Linear sub-issues, Asana subtasks). Not v1; if added later it's a `parent_task_id` field, not a new collection.

## Open questions

1. **Should the `kind: task` rename land as a standalone follow-on part before more of the workflows module ships, or batch it with the next active part?** Recommendation: standalone, small (S-sized), runs in parallel with whatever's in flight. The rename is mechanical but touches enough surface that batching it inside an unrelated part muddies that part's review.
2. **Where does the `title` field live on workflow actions?** Today workflow actions get display strings from `status_map.{stage}.{slug}.message`. There's no top-level `title` on the doc. Tasks need a user-editable `title` at the top level. Decision: tasks add `title` as a task-only top-level field; workflow actions keep using the status-map message; the entity-page renderers branch on `kind` to pick the right display string. No retrofit needed on workflow actions.
3. **Does the existing `entity_id` / `entity_collection` field on the actions collection accept null?** Workflow actions always set them (they're scoped to an entity by their workflow). Adhoc tasks may be standalone (no entity). Action: confirm the field has no `required` constraint in the shipped schema; if it does, drop the constraint as part of the rename PR.

## Related

- Parent concept: [workflows-module-concept/design.md](../design.md) — the seven-sub-design overview this plan sits next to.
- Action authoring (current taxonomy): [action-authoring/spec.md](../action-authoring/spec.md) — the YAML grammar this plan asks to rename one kind in.
- Submit pipeline: [submit-pipeline/spec.md](../submit-pipeline/spec.md) — references `kind: form` / `kind: task` for endpoint emission scope.
- Implementation: [workflows-module/design.md](../../workflows-module/design.md) — the parts-based implementation plan. The rename touches active parts 24, 28, 30, 34 and shipped code in `modules/workflows/` + `plugins/modules-mongodb-plugins/`.
