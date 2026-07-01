# Part 21 — Replace `entity_type` with `entity_collection`

**Source rationale:** [part 12 review-1 finding #1](../12-resolver-pages/review/review-1.md#1-entity_collection-is-never-declared-in-workflow-yaml). **Layer:** schema + cross-part contract change. **Size:** M. **Repo:** spans `modules/workflows/`, `plugins/modules-mongodb-plugins/`, `designs/workflows-module-concept/`.

## Goal

Collapse the two-scalar entity identity (`entity_type` + `entity_collection`) down to one (`entity_collection`). The workflows module never writes to the entity doc — it only reads it for display chrome and queries by it for entity-pages. The collection name uniquely identifies the entity's home, so `entity_type` is redundant metadata. Removing it simplifies the workflow YAML schema, the workflow/action doc shape, the `start-workflow` payload, and the entity-page query API.

## In scope

### Workflow YAML schema

- Rename `workflow.entity_type` → `workflow.entity_collection` in workflow YAML.
- Drop the field's semantic meaning of "named entity kind" — it's a Lowdefy connection id, e.g. `leads-collection`.
- Apps using the old field name fail the build with a clear migration message (one-line check in `makeWorkflowsConfig`).

### Workflow + action doc shapes

- Workflow doc: drop `entity_type`. Keep `entity_collection`, `parent_entity_id`, `parent_entity_collection` (the parent link shape has no `parent_entity_type` field today — nothing to drop there).
- Action doc: drop `entity_type`. Keep `entity_collection`, `child_entity_id`, `child_entity_collection` (the child link shape has no `child_entity_type` field today — nothing to drop there).

### Engine handler payloads

- `start-workflow` payload: drop `entity_type`. Required becomes `workflow_type`, `entity_id`, `entity_collection`.
- `get-entity-workflows` payload: drop `entity_type`. Required becomes `entity_id`, `entity_collection`. Query becomes `find({ entity_collection, entity_id })`.
- `cancel-workflow` payload is unaffected — it keys off `workflow_id` and never took `entity_type`.

### Resolvers and UI

- `makeWorkflowsConfig`: update `WORKFLOW_FIELDS` to swap `entity_type` for `entity_collection`.
- Part 12 (`makeActionPages`): pass `entity_collection` as the entity-context var instead of `entity_type`.
- Part 18 (`actions-on-entity` and friends): call `get-entity-workflows` with `(entity_collection, entity_id)`.

### Shipped code edits (formerly in implemented parts 3 and 4)

Part 21 owns these code changes directly — it does not file follow-up tasks under `parts/03-*/tasks/` or `parts/04-*/tasks/`. The implemented parts' designs and `tasks/` directories are frozen artifacts of what shipped; the delta lives here.

- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — drop the `entity_type` property from the `WorkflowDoc` and `ActionDoc` JSDoc typedefs.
- `plugins/modules-mongodb-plugins/src/connections/shared/getActionFields.js` — drop `entity_type` from the `MongoDBFindOne` projection and from the return-type JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — in the `workflowsConfig` JSON schema: drop `entity_type` from `required` and from the description string; add the `entity_collection` requirement and description (no per-property schema since `additionalProperties: true` already permits it, but the description and `required` list document the contract).
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — swap `'entity_type'` for `'entity_collection'` in `WORKFLOW_FIELDS`; add the build-time rejection check for legacy `entity_type:` (with or without `entity_collection:`) keyed in a workflow YAML, with the "rename to entity_collection" error message.

### Documentation

- Update every file under `designs/workflows-module-concept/` that mentions `entity_type` to drop it from payloads, doc shapes, worked-examples, and reserved-keys lists. Authoritative set is `git grep -l "entity_type" designs/workflows-module-concept/`; today that includes (at least) `spec.md`, `design.md`, `engine/spec.md`, `engine/design.md`, `action-authoring/spec.md`, `action-authoring/design.md`, `action-groups/spec.md`, `ui/spec.md`, `ui/design.md`, `module-surface/spec.md`, `module-surface/design.md`.
- Strike `entity_type` from the engine reserved-keys list in `engine/spec.md` and `engine/design.md` (the set of field names `references.{key}` payloads cannot override). Removing the field means `entity_type` is no longer engine-managed and apps must be free to use it as a reference key.
- Update the index recommendations in `engine/spec.md` (today: `(entity_type, entity_id)` for `workflows` and `actions`) to `(entity_collection, entity_id)`. Called out separately because a stale index recommendation creates a non-functional index — worse failure mode than a stale worked-example.
- Refresh per-part designs of unimplemented parts that mention the field. Today that means parts 5, 12, and 19 (part 18's design doesn't reference `entity_type` and needs no edit). Designs and `tasks/` directories of implemented parts (3, 4, 14) are not edited — see "Implemented parts" below.

## Out of scope / deferred

- **Backwards-compat shim for the old field name.** Reject at build time with a migration message; don't dual-accept. No production apps depend on the module yet.
- **Renaming the connection itself.** `leads-collection`, `tickets-collection` etc. stay as-is.
- **Display chrome that wants a human-readable entity label.** Workflows carry `title`; that's the display source. Apps that need a finer-grained label put it on the workflow YAML.

## Implemented parts

Parts 3 (engine-plugin-shell), 4 (workflow-config-schema), and 14 (form-components-library) have shipped. **Their `design.md` and `tasks/` directories are not edited by this part** — those are frozen records of what was specced when implementation happened. The code changes those parts shipped are amended directly under this part's "Shipped code edits" scope above; the design of the delta lives here, not in their folders.

Parts 5, 12, 18, 19 are unimplemented (Wave 2+). Parts 5, 12, and 19 absorb the change inline by editing their own `design.md` in this PR; part 18's design doesn't reference `entity_type` and needs no edit.

## Depends on

Nothing. This is a schema simplification; it can land before any of the dependent parts (5, 12, 18, 19) start.

## Verification

- `makeWorkflowsConfig` rejects a workflow declaring `entity_type:` with a clear "rename to entity_collection" message.
- `makeWorkflowsConfig` rejects a workflow declaring **both** `entity_type:` and `entity_collection:` with the same migration message — the migration check fires before the new-field happy path, so half-migrated YAML can't slip through.
- The demo app's worked-example onboarding workflow YAML (shipped by [part 20](../20-module-manifest/design.md), Wave 7) uses `entity_collection: leads-collection` end-to-end. Verified at part 20's land, not here — part 21 ships before the demo YAML exists.
- `start-workflow` integration test: payload `{ workflow_type, entity_id, entity_collection }` writes a workflow doc with no `entity_type` field.
- `get-entity-workflows` integration test: query by `(entity_collection, entity_id)` returns the expected workflows.
- End-to-end coverage of the new payload shape lands in [part 22 — workflows-e2e-suite](../22-workflows-e2e-suite/design.md) (the suite's worked-example seed already uses `entity_collection` end-to-end). This part's verification is rename-coverage unit/integration tests only.

## Open questions

- **Do the concept-doc updates land in this part or as a follow-up?** Lean: in this part — the concept doc is the source of truth; if it stays stale, future readers will re-introduce `entity_type`.
- **Should the `entity_collection` value be validated against the host app's declared connections?** Nice-to-have; defer to a future hardening pass unless trivial to add.

## Contract to neighbours

- **Part 4** is the workflow-config-schema source of truth. Part 4's design and `tasks/` stay frozen (it has shipped); part 21 amends the shipped code directly per "Shipped code edits" above.
- **Part 5 (start-cancel-handlers)** consumes the new payload shape.
- **Part 12 (resolver-pages)** passes `entity_collection` as the entity-context template var, not `entity_type`.
- **Part 18 (entity-components)** calls `get-entity-workflows` with the new payload.
- **Part 19 (operational-apis)** updates the `get-entity-workflows` payload contract.
