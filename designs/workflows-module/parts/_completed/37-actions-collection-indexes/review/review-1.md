# Review 1 — README placement & field-path accuracy

The index set itself is correct. I walked every read/write site the design lists and confirmed the two-index recommendation covers them, and that the `child_workflow_id` / `parent_action_id` "no secondary index" reasoning holds. The findings below are about the README integration instructions and a couple of field-path inaccuracies in the prose — not the index choices.

## What verified clean

- **`actions.{ workflow_id: 1 }` covers the listed sites.** `get-entity-workflows.yaml`, `get-workflow-overview.yaml`, and `get-action-group-overview.yaml` all `$lookup` from `actions` with `foreignField: workflow_id`; MongoDB uses an index on the foreign collection's join field for these (including the combined `localField`/`foreignField` + `let`/`pipeline` form in `get-workflow-overview.yaml`). `getActions.js:11` does `find({ workflow_id })`; `CancelWorkflow.js:100` / `CloseWorkflow.js:141` do `find`/`updateMany` on `{ workflow_id, 'status.0.stage': {$nin:[...]} }`. All served by the equality prefix. ✓
- **`workflows.{ entity_collection: 1, entity_id: 1 }` matches `get-entity-workflows.yaml`'s `$match` equality prefix exactly.** ✓
- **Item 4 is right.** `fireTrackerSubscription.js:55-65` queries `workflows` by `_id`, reads `parent_action_id`, then fetches that action by `_id` (`getActionFields`). It never queries `actions` by `child_workflow_id`. And `child_workflow_id` is only ever _written_ (`createAction.js:53`, `StartWorkflow.js:122`) or _read off a fetched doc_ (`StartWorkflow.js:62`) / projected (`getActionFields.js:29`) — never a query key. The concept-doc bullet (tasks-module-plan line 172) is genuinely wrong on mechanism, conclusion stands. ✓
- **Connections carry no `validator:`.** Both `actions-collection.yaml` and `workflows-collection.yaml` are `MongoDBCollection` with `databaseUri` / `collection` / `changeLog` / `write` only. ✓

## Findings

### 1. The README has no top-level `## Connections` section — the placement instruction can't be followed literally

> **Resolved.** Restated the placement in both Proposed change item 1 and the Files-changed row as "after `## Exports`, before `## Vars`", with a note that `### Connections` lives inside `## Exports`.

Design line 7 and the Files-changed row (line 54) say to add `## Indexes` "after `## Connections` and before `## Vars`". But `modules/workflows/README.md` has no top-level `## Connections`. Its top-level headers are `## Dependencies`, `## How to Use`, `## Exports`, `## Vars`, `## Secrets`, `## Plugins`, `## Notes`. Connections live at `### Connections` (line 134) _inside_ `## Exports`.

A top-level `## Indexes` placed "after `## Connections`" would land inside the Exports block. Restate the placement as "after the `## Exports` section, before `## Vars`" — or resolve via finding #2.

### 2. The chosen `## Indexes` section contradicts both the cited precedent and the repo's fixed README template

> **Resolved via option (b).** Kept the dedicated `## Indexes` section and added Proposed change item 5 + a Files-changed row to amend CLAUDE.md's fixed README template (insert `Indexes` between `Exports (…)` and `Vars`), so "fixed template" stays true and the convention is mechanically enforced. Corrected the mis-cited `activities` precedent: the doc now states `activities` documents indexes as a `## Notes` paragraph and that this part deliberately diverges to a standalone section as the new enforced convention.

The design says the section is "Modelled on `activities/README.md`'s Notes-section call-out" (line 7) — but `activities/README.md` documents its `contact_ids` / `company_ids` indexes as prose inside `## Notes` (line 100), **not** in a dedicated `## Indexes` section. So the design cites that file as precedent while doing the opposite of what it does.

It also conflicts with CLAUDE.md's documentation rules, which pin a _fixed_ per-module README template: "Description, Dependencies, How to Use, Exports (…), Vars, Secrets, Plugins, Notes." There is no `Indexes` entry. Adding a new top-level section silently breaks the "fixed template" claim.

Pick one and make the design internally consistent:

- **(a) Follow the precedent (recommended):** document both indexes + the non-partial / no-validator constraints as a subsection or paragraph under `## Notes`, exactly as `activities` does. This needs no template change and matches the one file the design points at.
- **(b) Keep a dedicated `## Indexes` section** because two indexes + three constraints read better as a standalone block — but then this part must also update CLAUDE.md's per-module README template list to include `Indexes`, so "fixed template" stays true. The repo's "one correct way" principle argues against having two modules document the same kind of thing (required indexes) in two different sections.

### 3. Field-path inaccuracy in the `workflows` index analysis (line 37)

> **Resolved.** Changed line 37's sort path from `change_stamp.created.timestamp` to `created.timestamp`, matching the query (`get-entity-workflows.yaml` sorts `created.timestamp: -1`) and the write (`StartWorkflow.js:89` stores `created` at top level).

Line 37 describes the post-`$match` sort as on "`display_order` + `change_stamp.created.timestamp`". The actual query (`get-entity-workflows.yaml`) sorts `created.timestamp: -1`, and the workflow doc stores the stamp at **top-level `created`** (`StartWorkflow.js:89`: `created: context.changeStamp`), not under `change_stamp`. Line 35 already states the correct path (`created.timestamp: -1`); line 37 introduces the wrong one. Reconcile to `created.timestamp`. (Doesn't change the index — the sort field isn't indexed — but the README will likely echo this prose, so fix it at source.)

### 4. "Computed fields" list in the `actions` index analysis is incomplete/imprecise (line 27)

> **Resolved.** Reworded line 27 to "a mix of pipeline-computed fields (`groupIndex`, `required_sort`, `sort`) and stored fields (`created.timestamp`, `_id`) — none indexable here", per the suggested phrasing. Conclusion (in-memory sort over the small joined set) unchanged.

Line 27 says the sub-pipeline sort orders are "on computed fields (`groupIndex`, `required_sort`, `sort`, `_id`)". Two issues: `_id` is not a computed field, and the entity/group lookups also sort on `created.timestamp` (a stored field) — neither appears as `groupIndex`/`required_sort`/`sort` everywhere. The _conclusion_ is right (these sorts run in-memory over the small per-workflow result set, so they're neither indexable nor worth indexing), but the parenthetical mislabels the fields. Tighten to something like: "the per-workflow `$sort` keys are a mix of pipeline-computed fields (`groupIndex`, `required_sort`, `sort`) and stored fields (`created.timestamp`, `_id`), all sorted in-memory over the small joined set."

## Nits

- Line 8 calls the connections "bare `MongoDBCollection`". They carry `changeLog` + `write: true` too — "no `validator:`" is the accurate and load-bearing claim; "bare" is loose. Not worth a change unless the README repeats it.
