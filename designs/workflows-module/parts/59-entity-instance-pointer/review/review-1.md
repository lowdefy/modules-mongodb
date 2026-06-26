# Review 1

The design is accurate where I could check it: the StartWorkflow param checks (`StartWorkflow.js:58-65`), doc write (`:179-181`), parent/child denorm (`:188-189`, `:264-265`), the `GetEntityWorkflows` query (`:25,37`), the `GetWorkflowAction` response (`:246-247`), the `planActionTransition` seed (`:176-177,183-184`), `planEventDispatch` (`:160-163,261`), the `computeEngineLinks` sentinel (`:94-97`), and the `RESERVED_WORKFLOW_KEYS` lists all match what the design says it will change. The decisions (drop connection_id from the start payload, fold `ref_key` into the workflow `entity`, dotted index, nullable objects) are sound and well-argued. The findings below are about **completeness of the file/scope lists**, not the core approach — and one factual error in the file list.

## File-list accuracy

### 1. The `modules/workflows/README.md` "## Indexes" section does not exist

> **Resolved (auto).** Confirmed `README.md` is a three-line stub with no `## Indexes` section (and per CLAUDE.md source-side READMEs stay stubs). Dropped the README bullet from the "Indexes + docs" file list; the index content lives only in `docs/workflows/reference/indexes.md`, already listed.

The Indexes + docs bullet says: "`modules/workflows/README.md` — the `## Indexes` section's `workflows.{ entity_collection: 1, entity_id: 1 }` → dotted." But `README.md` is a three-line stub:

```
# Workflows
Full documentation: [`../../docs/workflows/`](../../docs/workflows/index.md).
```

There is no `## Indexes` section and no `entity_collection`/`entity_id` in it — and per CLAUDE.md source-side READMEs are deliberately kept as stubs that point into `docs/`. The index content lives only in `docs/workflows/reference/indexes.md`, which the design already lists correctly. **Fix:** drop the README bullet from the file list (it would have the implementer hunting for a section that isn't there, or worse, re-adding index content to a stub against the docs convention).

## Cross-part / app scope gaps

### 2. The `apps/workflows-test/` workflow-config _definitions_ fall in the gap between Part 57 and Part 59

> **Resolved.** Assigned by the part boundary (Part 57 owns config shape). Added the nine workflows-test `workflow_config/**` definitions **and** `apps/workflows-test/modules/workflows/vars.yaml` (which also carries an `entities` map — Part 57's Migration note wrongly claimed the demo was the only `vars.entities` user; corrected) to **Part 57's** "Files changed", folding the flat fields + routing into each workflow's `entity:` block. Added a cross-reference note to Part 59's workflows-test bullet stating those definitions migrate under Part 57 and that Part 59 touches only runtime callers. Both designs already state the 57→59 sequence with an accepted broken state between them and no compat shim; reinforced on both sides so the "builds clean after both parts" expectation holds.

Nine workflows-test config files carry the authored flat `entity_collection` + `entity_ref_key` that Part 57 renames to the nested `entity:` block — e.g. `workflow_config/operational-lifecycle/operational-lifecycle.yaml:18-19` (`entity_collection: things-collection` / `entity_ref_key: thing_ids`), plus `cascade-keyed`, `tracker-parent`, `tracker-child-flow`, `form-lifecycle`, `access-verbs`, `error-recovery`, `field-gallery`, `check-blocked-by`.

Part 57's "Files changed" enumerates only the **demo's** `onboarding.yaml` and `company-setup.yaml`. This Part's workflows-test bullet covers "workflow*config **start callers**, `get-entity-workflows` callers, and the e2e specs" — but the top-level `entity_collection:`/`entity_ref_key:` in these files is config \_definition* (Part 57's domain: its updated `validateWorkflow` will **require** `workflow.entity` to be an object), not a "start caller." So neither part's file list owns migrating these nine files.

The consequence is worse than the intentional in-between brokenness the design accepts: once **both** parts land, Part 57's validator requires a nested `entity:` block, these files still have flat fields → the workflows-test app build **fails permanently** until someone fixes files no part assigned. **Fix:** add these config files to Part 57's file list (they are config-shape), and add a note here pointing at that — so the "repo builds after both parts" expectation actually holds.

### 3. `apps/demo/api/leads-create.yaml` is a StartWorkflow caller not in the file list

> **Resolved (auto).** Verified `leads-create.yaml` calls `onboarding-start` with `entity_id: { _payload: _id }` + `entity_collection: leads-collection`. Added it explicitly to the Apps file list alongside `lead-view.yaml`.

`leads-create.yaml:47-56` calls the generated `onboarding-start` endpoint with `entity_id: { _payload: _id }` and `entity_collection: leads-collection`. Under this Part it must drop `entity_collection` and nest `entity: { id: { _payload: _id } }`. The Apps section lists `lead-view.yaml` start buttons and "any other entity-workflow / start callers," so it is nominally inside the catch-all — but every other start caller is named explicitly, and this one is a server-side API (easy to miss when sweeping page YAML). **Fix:** list it explicitly alongside `lead-view.yaml`.

### 4. The doc sweep scope omits `docs/workflows/how-to/`

> **Resolved (auto).** Verified the two `how-to/` files carry the runtime/document shape (`write-a-hook.md` entity_id reads; `track-a-child-workflow.md` start payload + child_entity refs + prerequisite prose, sentinel stays flat). Widened the doc-sweep bullet to `docs/workflows/{concepts,how-to}/*.md` and called out both files.

The doc-sweep bullet names "`docs/workflows/concepts/*.md` and reference pages." Two `how-to/` files carry Part-59 runtime/document shape and are outside that scope:

- `how-to/write-a-hook.md:97,110,168` — three `_payload: context.workflow.entity_id` reads that this Part nests to `context.workflow.entity.id` (same runtime change as the demo's `billing-details.yaml`, which the design does list).
- `how-to/track-a-child-workflow.md` — a start-caller payload with flat `entity_id`/`entity_collection` (`:106-108`) and the `child_entity_id`/`child_entity_collection` field references (`:117`) that become `child_entity: { connection_id, id }`. (Its `entity_id: true` sentinel at `:52,60,62` correctly stays flat per "Where uniform stops" — no change needed there.)

**Fix:** widen the sweep to `docs/workflows/{concepts,how-to}/*.md` and reference pages, and call out these two files since they show the document/runtime shape this Part owns.

## Minor

### 5. Stale doc-comment references in three unlisted engine files

> **Resolved (auto).** Verified the stale flat-shape comments in `shared/errors.js`, `shared/phases/runTrackerCascade.js`, and `shared/phases/planners/planTrackerLevel.js`. Added a "Comment-only sweep" bullet to the Engine source list covering all three (no behavioral change).

The design is careful to say "update the doc comment" for `computeEngineLinks.js`, but three engine files outside the file list carry stale flat-shape references in comments:

- `shared/errors.js:10` — "Start's `workflow_type`/`entity_id`/`entity_collection`" (the param is now `entity.id`, no `entity_collection`).
- `shared/phases/runTrackerCascade.js:63` — "`child_workflow_id`, `child_entity_id`, `child_entity_collection`".
- `shared/phases/planners/planTrackerLevel.js:46-47` — same `child_entity_id`/`child_entity_collection` pair.

(Plus in-file comments within already-listed files: `GetEntityWorkflows.js:15`, `GetWorkflowAction.js:20,219`, `StartWorkflow.js:167`, `planActionTransition.js:85`, `planEventDispatch.js:113`.) None are behavioral, but the design claims "~8 engine source files" comprehensively; these three add to that count. **Fix:** note that the comment sweep includes these files.

### 6. The `GetWorkflowAction` response `entity.connection_id` has no consumer

> **Resolved.** Kept `connection_id` in the response and added a note to the `GetWorkflowAction.js` file-list bullet: only `entity.id` has a consumer; `connection_id` is carried for shape-symmetry with the document/denorm pointer and because the flat response already returned `entity_collection` (so this is a 1:1 rename, not new surface), not because anything reads it. Dropping it was the alternative (strict "build for concrete needs") but would mix a behavior change into a part framed as a pure flat→nested restructure.

The only reader of the response's entity fields is `requests/get_entity.yaml.njk:6` (`_request: get_workflow_action.entity_id` → `.entity.id`); it gets the connection id from the build-time template var threaded by `makeActionPages`, not from the response. The `check-action-modal.yaml` reads `assignees`/`due_date`/`description`/`status`/`allowed` only — nothing reads `entity_collection`/`connection_id` off the response. So nesting `connection_id` into the response (design point 5 / `GetWorkflowAction.js` bullet) preserves a field with no consumer.

This is defensible (it mirrors the document shape and the flat response already returned both scalars, so it's not _new_ surface), but per CLAUDE.md "build for concrete needs" it's worth a one-line note in the design acknowledging the response `connection_id` is carried for shape-symmetry, not because anything reads it — so a future reader doesn't go looking for the consumer.
