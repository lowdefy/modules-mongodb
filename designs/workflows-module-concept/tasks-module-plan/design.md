# Tasks Module Plan — Adhoc Actions Alongside Workflow Actions

A forward-looking concept for a future `tasks` module that lives next to `workflows` and shares the same `actions` collection. Workflow actions are pre-defined steps inside a `workflow_config`; tasks are adhoc todos that users (or external systems) create at runtime. Both are work items the same user does — putting them in one collection means a single "my work" view can surface both, and lets us reuse the status enum, change-stamp, references shape, and events-as-comments pattern already shipped.

This design is **not** the tasks module's implementation design. It's the boundary contract: what the `workflows` module must lock in _now_ so the future `tasks` module can be built on the same collection without contortions or rewrites.

## Proposed change

1. Treat the `actions` collection as shared between the `workflows` module (already implemented) and a future `tasks` module — every doc has the same base shape; workflow-only fields are optional, task-only fields are optional, no doc is required to set both kinds of fields.
2. Rename the workflow-action kind that means "user does a real-world thing and marks it off" so the word "task" is free for the adhoc concept. This landed in two steps: `task → simple` shipped as [Part 35](../../workflows-module/parts/_completed/35-rename-task-kind-to-simple/design.md), and `simple → check` (a better name — see [the rename section](#the-kind-rename-and-the-action-page-decouple) below) plus a decouple of the shared pages to `action-edit` / `action-view` / `action-review` is the deferred [Part 43](../../workflows-module/parts/_completed/43-rename-simple-kind-to-check/design.md).
3. Introduce adhoc-task semantics on the `actions` doc — `workflow_id: null`, user-supplied `title`, user-supplied `description`, optional entity link, no `blocked_by`, no `hooks:` / `interactions:` evaluation, transitions driven directly by user submit not by the workflow engine.
4. Reuse the existing `global.action_statuses` enum as a strict superset; adhoc tasks use a fixed subset (`action-required` / `in-progress` / `done` / `not-required`). No new status enum, no parallel state machine.
5. Reuse the events-as-comments pattern (`events` module already shipped) so comments on adhoc tasks render through the same timeline component as workflow-action events.
6. Defer everything tasks-module-specific — the actual module manifest, kanban view, gantt view, adhoc-creation APIs, assignment/access model for adhoc tasks, external-creation SDK — to dedicated designs once workflows ships.

## Industry reference points

Every mature work-tracker collapses "work item" into one logical collection with optional structural parents:

| Tool    | Collection | Optional parent / container                 |
| ------- | ---------- | ------------------------------------------- |
| Linear  | Issues     | Project / Cycle / Initiative (all optional) |
| Jira    | Issues     | Epic / Sprint                               |
| Asana   | Tasks      | Project / Section (My Tasks = no project)   |
| GitHub  | Issues     | Milestone / Project                         |
| ClickUp | Tasks      | List / Folder                               |
| Monday  | Items      | Board                                       |

Workflow vs adhoc maps cleanly onto "in a project" vs "no project". Splitting into two collections would mean a second status taxonomy, a duplicate notifications path, two access models, and a "my work" view that has to merge from two sources. The shared-collection direction is the well-trodden one.

## The two streams

**Stream 1 — workflow actions** (already designed).

- Created by `start-workflow` when the workflow is initiated; the set of actions is fixed by the workflow's `starting_actions` and `action_groups`.
- `workflow_id`, `action_group`, `type` (from workflow config), `kind` (form / check / tracker / custom / external), `blocked_by` all set from the YAML config.
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
- `kind` — discriminator. Workflows: `form` / `check` / `tracker` / `custom` / `external`. Tasks: `task`. `custom` is in-design (Part 28); `external` is a planned future kind for system-driven actions with no user-facing surface — listed here so the taxonomy and the rename discussion below are forward-looking, but no dedicated part exists yet.
- `status` (current) and the status-history array — both streams use the same shape.
- `assignees` — universal-fields component, already shipped.
- `due_date` — universal-fields component.
- `description` — universal-fields component; workflow actions get it from YAML config, tasks get it from user input. Field shape is identical.
- `references` — used by the events module + entity-page integration. Both streams use the same shape.

### Workflow-only (set on workflow actions, **null/absent** on tasks)

- `workflow_id`, `workflow_type`
- `action_group`, `type`
- `blocked_by`, `unblocks_on` (engine-managed)
- `child_workflow_id` / `child_entity_id` / `child_entity_collection` (tracker actions only — already a sparse field)
- `form_data` (form actions only — already sparse)
- The engine-computed `link` / `status_map` rendering output (engine-managed; only meaningful for workflow actions)

### Shared but conditional (workflow actions always set them; tasks-module decides)

- `entity_id`, `entity_collection` — workflow actions always populate these (scoped to the workflow's entity). Whether adhoc tasks populate them as top-level fields or rely on `references` for entity linkage (e.g., a meeting-minutes action item referencing a company + a deal) is a tasks-module design call. Either way, the schema must allow null — see Constraints below.

No task-only fields. Tasks share the Common fields with workflow actions, may set the Shared-but-conditional fields, and leave the Workflow-only fields null/absent. Creator is captured by `change_stamp.created.user.id` on insert (the `events`-module idiom — see `docs/idioms.md` "Change stamps"), the same as for workflow actions; no separate `created_by` field.

Two discriminators, at different layers: `kind` discriminates the action's **user-facing surface** (`form` / `check` / `tracker` / `custom` / `external` for workflow actions, `task` for adhoc); `workflow_id` discriminates the **stream** — set means a workflow engine wrote it, null means a tasks module wrote it. The tasks module ignores `kind` on read; the workflows engine ignores any doc with `workflow_id: null`.

### Constraints this places on the workflows module

These are the things the workflows module ships must respect so the tasks module can write to the same collection cleanly:

- **No collection-level required fields** beyond `_id`, `kind`, `status`, `change_stamp`. In particular, `workflow_id`, `type`, `entity_id`, `entity_collection`, `action_group` must all be nullable at the schema level. (None of the shipped Mongo writes enforce these as required today — verified — but the constraint needs to stay.)
- **No index assumes `workflow_id` is present.** The workflows module ships no documented index definitions on `actions` today — a separate gap to close, since other modules in this repo document required indexes in their README (e.g. `activities/README.md`). When workflows adds them, they must accept `workflow_id: null` docs. Non-partial indexes on `workflow_id` are fine — Mongo indexes nulls. Partial indexes filtered on `workflow_id` existing are fine as workflow-only optimisations but must not be the sole index serving a query path that both streams use.
- **`type` is not required.** Workflow actions always have a `type`; tasks may not. If the field exists on a task, it's a free-form tag, not a workflow-config slug.
- **The status enum stays a strict superset** of what adhoc tasks need. The shipped enum (`action_statuses`) already includes `action-required`, `in-progress`, `done`, `not-required` — the four states adhoc tasks need. No engine work assumes a workflow action will _never_ sit in just those four states either.

## The kind rename and the action-page decouple

The workflow-action kind for "user does a real-world thing, marks it off, no input form" sits parallel to `form` / `tracker` / `custom` / `external` — it describes the action's surface. Freeing the word "task" for the adhoc concept needed a rename, and the right name took two passes:

1. **`task → simple`** — shipped as [Part 35](../../workflows-module/parts/_completed/35-rename-task-kind-to-simple/design.md). This freed "task" and ended the collision.
2. **`simple → check`** — the deferred [Part 43](../../workflows-module/parts/_completed/43-rename-simple-kind-to-check/design.md). "Simple" describes the implementation, not the thing, and carries a faint "trivial" connotation that undersells an action with assignees, a deadline, dependencies, and downstream effects.

**New name: `check`.** It pairs against `form` — you _fill in_ a form, you _check off_ a check — naming the input-surface vs no-input-surface contrast the taxonomy hinges on. The single best word is _task_, deliberately spent on the adhoc concept; `check` is the strongest remaining word that names the _surface_ rather than the implementation. Rejected this round: `simple` (incumbent — implementation-flavoured, faintly trivial), `job` (collides with the background-job sense), `checkbox` (implies binary; the kind has four states), `check-off` / `checkoff` (breaks the one-word `kind:` pattern), plus the Part 35 rejections (`manual`, `step`, `status`, `user_task`, `mark`) that still hold.

**The shared pages decouple from the kind name.** The three shared pages were renamed `simple-*` → **`workflow-action-edit` / `workflow-action-view` / `workflow-action-review`** by [Part 38 task 18](../../workflows-module/parts/_completed/38-engine-rebuild/tasks/18-display-surface-renames.md) (pulled forward from Part 43 per Part 38 review-14 #1) — anchoring the route on the domain noun, not the kind, while the `workflow-` prefix keeps the pages inside the Part 34 D10 fixed-page glob. Three reasons: (a) the _view_ shape (header, universal fields, status history, comments) is kind-agnostic and renders any kind, so `action-view` is honest where `check-view` would not be; (b) it survives future kind renames untouched — the kind never appears in a route again; (c) form actions use the verbose generated `workflow-{type}-{action_type}-{verb}` namespace, so `action-*` is free, and the `workflows` module prefix scopes it correctly (`/workflows/action-view` = "view a workflow action"). A useful consequence for the kind choice: `check` lives purely as an internal discriminator (`kind:` data, engine branches, authoring grammar) and never reaches a URL — so its faint verify/cheque ambiguity never surfaces to users.

The mechanical sweep — kind value, FSM tables, demo config, tests, concept terminology (no page ids; those are already final) — is enumerated in [Part 43](../../workflows-module/parts/_completed/43-rename-simple-kind-to-check/design.md). It is sequenced **after [Part 40](../../workflows-module/parts/_completed/40-simple-action-surfaces/design.md)** (the part that rewrites these page surfaces) so it runs once against a stable tree, and must land before the first real app onboards a workflow config.

### Tasks-module pages reuse the detail surface as a component, not a shared page

Adhoc tasks get their own view/edit pages in the future tasks module (`/tasks/view`, `/tasks/edit`), scoped separately from `/workflows/workflow-action-*`. Separate page sets is correct, not duplication: the write models genuinely differ — workflow `check` actions edit via nullary signal buttons through the engine resolver API (the FSM resolves the target status); tasks edit via direct status writes through `update-task`. The read-only detail shape, however, is identical across both streams, so the reuse is a `_ref`'d **component** (the way `action-view` renders the shipped `universal-fields` component), never a cross-module shared page. Shared collection → shared rendering, without coupling the two modules. External actions (`kind: external`) have no user-facing surface at all; if one ever needs a read view, the generic `action-view` renders it — the argument for the generic page name over a kind-specific one.

## Status enum subset for adhoc tasks

Adhoc tasks use a fixed subset of `global.action_statuses`:

| Status            | Default label   |
| ----------------- | --------------- |
| `action-required` | Action Required |
| `in-progress`     | In Progress     |
| `done`            | Done            |
| `not-required`    | Not Required    |

The labels read identically across both streams. They were chosen against user research with business users who preferred them over the common "Todo / In Progress / Done / Cancelled" set:

- **"Action Required"** depersonalises the work — _someone_ needs to act. Fits an engine telling an assignee they're up _and_ a creator filing a todo for a teammate. "Todo" carries an implicit "I" which mis-frames assigned work in both streams.
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

- The tracker subscription joins via `workflow.parent_action_id → action._id` (it looks up the child workflow by `_id`, reads its `parent_action_id`, then fetches that action) — it never queries `actions` by `child_workflow_id`, and tasks have no parent workflow linkage, so they're transparent to the subscription.
- The group recomputation reads `actions` filtered by `workflow_id` — tasks have `workflow_id: null` and are excluded by the filter naturally.
- The `references` write contract assumes the doc was inserted in a workflow flow; tasks will write references the same way but never trigger workflow-engine logic from a reference update.

All three are already true in the current implementation. The constraint is to keep them true.

## Comments via events

Both workflow actions and adhoc tasks use the `events` module's `new-event` API to record comments. The event shape is identical: `references.action_ids: [<action_id>]` (and `references.workflow_ids: [<workflow_id>]` for workflow actions only — tasks omit it), `type: comment-added` (or whatever the agreed comment event type is), `metadata.comment: "<user-supplied text>"`.

A single timeline component can render events filtered by `action_id` for both streams, identical UI, identical write path. No new comment storage, no parallel comment model.

### Timeline action cards are cross-stream — but task auth/links are the tasks module's job

[Part 46](../../workflows-module/parts/_completed/46-debundle-workflow-config/design.md) ports the events-timeline action-card lookup into a cross-stream engine method (`GetEventsTimeline`): it enriches a card for _any_ action referenced by an event, branching on `workflow_id`. Workflow actions get the full treatment (verb-gate access filter + engine link); non-workflow actions (`workflow_id: null` tasks) **pass through** on the shared display fields — `status` and `<app-slug>.message`, which Decision 1 already has tasks write into the same fields workflow actions use — so a task card renders with **zero** workflow logic.

Part 46 deliberately does **not** build task-specific timeline behaviour (none exists yet, no task docs exist). Two things become the **tasks module's** responsibility when it ships, resolved on the tasks side and **not** injected into the workflows `GetEventsTimeline` method (so the two access models stay separate, per "Access model" below):

- **Access filtering for task cards** — `GetEventsTimeline` applies no access filter to pass-through cards; the tasks module decides how task cards are gated (doc-level: creator/assignees/team).
- **Links for task cards** — workflow cards carry an engine link; task cards need a `/tasks/view` link the workflows engine has no business computing.

The constraint Part 46 honours now is only the one this plan already mandates: don't bake a workflow-only (`workflow_id != null`) assumption into the shared timeline path.

## Access model — different shapes, no overlap

Workflow actions have a config-driven access model: `access.{app_name}` is a per-app map of verb → role-gate (`access.{app_name}.{verb}: true | [roles]`, verbs `view` / `edit` / `review` / `error`; no action-wide role list). The workflows engine enforces it per-verb at submit time (Part 34).

Adhoc tasks have a doc-driven access model: creator can edit/delete, assignees can edit + change status + comment, optional team scope for view. The tasks module will define this in its own design; nothing about it touches the workflows engine.

Both can co-exist because the access checks live in the _submit handler_, not in the collection. Workflow handlers gate on the workflow-config-derived rules; task handlers gate on the doc-level rules. The collection itself doesn't enforce either — the calling API does.

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

## Decisions

1. **Display title on adhoc tasks.** Part 38 (superseding the rejected Part 30) standardises action display under top-level `<app-slug>.message` fields, written from `status_map` cells for workflow actions. Tasks write `<app-slug>.message` directly from user input — same field, same read path, no `kind`-branching in renderers. How user input maps to per-app values (single shared title fanned out vs per-app variants) is for the tasks-module design to decide.

## Related

- Parent concept: [workflows-module-concept/design.md](../design.md) — the seven-sub-design overview this plan sits next to.
- Action authoring (current taxonomy): [action-authoring/spec.md](../action-authoring/spec.md) — the YAML grammar this plan asks to rename one kind in.
- Submit pipeline: [submit-pipeline/spec.md](../submit-pipeline/spec.md) — references `kind: form` / `kind: check` for endpoint emission scope.
- The rename part: [workflows-module/parts/43-rename-simple-kind-to-check/design.md](../../workflows-module/parts/_completed/43-rename-simple-kind-to-check/design.md) — the `simple → check` + `simple-* → action-*` mechanical sweep, sequenced after Part 40.
- Implementation tracker: [workflows-module/implementation-plan.md](../../workflows-module/implementation-plan.md) — the parts-based delivery plan.
