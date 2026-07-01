# Task 1: Document required indexes in the workflows README and amend the README template

## Context

The workflows module ships two Mongo collection connections — `actions-collection` (collection `actions`) and `workflows-collection` (collection `workflows`) — and the engine + read-side APIs hit them on every entity render, every workflow render, and every action submit. Today the module documents **no** required indexes, leaving host apps to discover them via slow production queries. The module itself does not create indexes (host apps declare them via the `splice-actions` pattern); this task documents the minimum set the shipped queries assume, plus the schema-shape constraints that keep those indexes compatible with the future tasks module sharing the `actions` collection.

A query-coverage walk over every read/write site found that **two** indexes cover all hot paths, and both must be **non-partial** so the future tasks module's `workflow_id: null` adhoc docs are not excluded:

- `actions.{ workflow_id: 1 }`
- `workflows.{ entity_collection: 1, entity_id: 1 }`

Current README structure (`modules/workflows/README.md`): headings run `## Exports` (with `### Pages`, `### Components`, `### API Endpoints`, `### Connections`, `### Menus` subsections) → `## Vars` → `## Secrets` → `## Plugins` → `## Notes`. The new section goes **after the entire `## Exports` block** (i.e. after `### Menus`) and **before `## Vars`** — connections live inside `## Exports`, so the index section follows the whole Exports block.

`CLAUDE.md` pins a fixed per-module README template in its Documentation section:

```
- `modules/{name}/README.md` — Per-module reference. Fixed template: Description, Dependencies, How to Use, Exports (Pages / Components / API Endpoints / Connections / Menus), Vars, Secrets, Plugins, Notes.
```

Adding a standalone `## Indexes` section without updating this list would silently break the "fixed template" contract, so the template must gain `Indexes` between `Exports (…)` and `Vars` in the same change.

**Verified, no edit needed:** both connection files (`modules/workflows/connections/actions-collection.yaml`, `modules/workflows/connections/workflows-collection.yaml`) are bare `MongoDBCollection` configs with `changeLog` + `write: true` and **no `validator:` block**. The README section affirms this absence as a constraint; it does not add a validator.

## Task

### 1a. Add a `## Indexes` section to `modules/workflows/README.md`

Insert a new top-level `## Indexes` section between the end of the `## Exports` block (after the `### Menus` subsection) and the `## Vars` heading. It has two subsections (`actions`, `workflows`), each naming the index, the read paths it serves, and the constraints. Use this draft (refine wording for house style, keep the substance and all constraints):

```markdown
## Indexes

The module's shipped queries assume two indexes exist on the collections behind the `actions-collection` and `workflows-collection` connections. The module does **not** create them — index creation is a host-app concern (consumer apps declare indexes via the `splice-actions` pattern). Host apps must add the following.

### `actions`

`{ workflow_id: 1 }` — **non-partial.**

Serves every workflow-stream read:

- [`api/get-workflow-overview.yaml`](api/get-workflow-overview.yaml) — `$lookup foreignField: workflow_id`, on every workflow overview load.
- [`api/get-action-group-overview.yaml`](api/get-action-group-overview.yaml) — `$lookup foreignField: workflow_id` (with a sub-pipeline filter on `action_group`), on every group overview load.
- [`api/get-entity-workflows.yaml`](api/get-entity-workflows.yaml) — `$lookup foreignField: workflow_id`, once per workflow on every entity page render.
- [`getActions.js`](../../plugins/modules-mongodb-plugins/src/connections/shared/getActions.js) — `find({ workflow_id })`, invoked by `recomputeWorkflowAfterActionWrite` after every action submit.
- `CancelWorkflow` / `CloseWorkflow` — `find` / `updateMany` scoped by `workflow_id` (admin actions).

Equality on `workflow_id` is the only useful key. The per-workflow `$sort` keys inside the `$lookup` sub-pipelines mix pipeline-computed fields (`groupIndex`, `required_sort`, `sort`) and stored fields (`created.timestamp`, `_id`); none are indexable here, and the per-workflow result set is small (typically <30 actions), so Mongo sorts it in memory.

**Keep it non-partial.** Future `kind: task` adhoc docs in this collection carry `workflow_id: null`. A non-partial index includes those null entries, costs nothing for the workflow-stream queries (they all filter by a concrete workflow `_id`), and stays usable for future tasks-module queries that join on `workflow_id`. Do **not** "optimise" it into a partial index filtered on `workflow_id` existing — that would silently break tasks-module queries that share this index path.

### `workflows`

`{ entity_collection: 1, entity_id: 1 }` — **non-partial.**

Serves the entity workflow list:

- [`api/get-entity-workflows.yaml`](api/get-entity-workflows.yaml) — `$match: { entity_collection, entity_id }` then `$sort: { display_order: 1, created.timestamp: -1 }`, on every entity page render.

The compound index matches the equality prefix exactly. Per-entity workflow counts are small (single-digit rows in shipped apps), so the post-match in-memory sort on `display_order` + `created.timestamp` is cheap; extending the index with `display_order` is a future-proofing knob, not a hot-path need.

### Schema-shape constraint

The `actions` collection must remain free of any collection-level required-field **validator** beyond the always-present `_id`, `kind`, `status`, `change_stamp`. The shipped `connections/actions-collection.yaml` carries no `validator:` block — keep it that way. The future tasks module writes `kind: task` adhoc docs with `workflow_id: null` and no `type`; a Mongo collection validator enforcing workflow-shaped fields would block that write path. Field-level invariants, if ever needed, belong in the write APIs, not a collection validator.
```

Adjust the relative link to `getActions.js` only if the actual path differs from `plugins/modules-mongodb-plugins/src/connections/shared/getActions.js` (it does not at time of writing). The `api/*.yaml` links are relative to the README's directory (`modules/workflows/`).

### 1b. Amend the fixed README template in `CLAUDE.md`

In the Documentation section, update the `modules/{name}/README.md` template line so the fixed template list reads:

```
Description, Dependencies, How to Use, Exports (Pages / Components / API Endpoints / Connections / Menus), Indexes, Vars, Secrets, Plugins, Notes.
```

i.e. insert `Indexes` between `Exports (…)` and `Vars`, matching the section's placement in the README.

## Acceptance Criteria

- `modules/workflows/README.md` has a new top-level `## Indexes` section placed after the `## Exports` block (after `### Menus`) and before `## Vars`.
- The section documents `actions.{ workflow_id: 1 }` and `workflows.{ entity_collection: 1, entity_id: 1 }`, both stated as **non-partial**, with the read paths each serves.
- The section states the schema-shape constraint: no collection-level validator on `actions` beyond `_id`, `kind`, `status`, `change_stamp`.
- The relative links to the three `api/*.yaml` files and to `getActions.js` resolve from the README's location.
- `CLAUDE.md`'s fixed per-module README template list includes `Indexes` between `Exports (…)` and `Vars`.
- No `validator:` block is added to either connection YAML (verify both remain bare `MongoDBCollection` configs).
- No shipped code or test changes.

## Files

- `modules/workflows/README.md` — modify — add the `## Indexes` section between `## Exports` and `## Vars`.
- `CLAUDE.md` — modify — insert `Indexes` into the fixed per-module README template list (in the `modules/{name}/README.md` Documentation bullet).

## Notes

- Keep the section to two indexes plus the three constraints (non-partial on each + the schema-shape/no-validator constraint). Do **not** add speculative indexes — the design deliberately excludes `actions.{ "assignees.user.id": 1, ... }` (no "my-work" view ships in v1), `actions.{ child_workflow_id: 1 }` (never queried by that key), `actions.{ action_group: 1 }`, `actions.{ "status.0.stage": 1 }`, `workflows.{ parent_action_id: 1 }`, and the status-extended compound. These belong to the future tasks module or are unused.
- This is documentation only — do not ship an index-creation migration; that is a host-app concern.
