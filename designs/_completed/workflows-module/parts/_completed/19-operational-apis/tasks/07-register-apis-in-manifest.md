# Task 7: Register all five APIs in the module manifest

## Context

Per CLAUDE.md's "Register new APIs in lowdefy.yaml" rule, every new API file needs a corresponding `_ref` entry in the module manifest. For modules specifically, two registration points exist:

1. **`api:` array** — the `_ref` list that pulls each API file into the manifest.
2. **`exports.api`** — the named-exports list that lets consumers reference these APIs via `_module.endpointId: { id: <name>, module: workflows }`.

Both are wired in [`modules/workflows/module.lowdefy.yaml`](../../../../../modules/workflows/module.lowdefy.yaml). The manifest currently has no `api:` or `exports.api` sections — they need to be added.

Tasks 1–6 ship five API files under `modules/workflows/api/`:

- `cancel-workflow.yaml` (task 1)
- `start-workflow.yaml` (task 2)
- `close-workflow.yaml` (task 3)
- `get-entity-workflows.yaml` (task 5)
- `get-workflow-overview.yaml` (task 6)

Plus one reusable stage at `api/stages/access_filter.yaml` (task 4). The stage is **not** registered — it's `_ref`'d directly from tasks 5 and 6.

Part 20's design ([`20-module-manifest/design.md`](../../20-module-manifest/design.md)) lists the full manifest contract this part should leave in place — including the `connections`, `user_schema` var, plugin version bump, secrets, and dependency declarations. Part 19 only adds the `api:` and `exports.api` lists; the remaining manifest pieces are part 20's scope.

## Task

Edit `modules/workflows/module.lowdefy.yaml`:

1. Under `exports:`, add an `api:` list:

   ```yaml
   exports:
     components:
       # ... existing entries ...
     api:
       - id: start-workflow
         description: Instantiate a workflow on an entity. Optional parent_action_id links as a child of an existing tracker action.
       - id: cancel-workflow
         description: Push cancelled to workflow status; flip remaining open actions to not-required.
       - id: close-workflow
         description: User-initiated normal termination — push completed to workflow status; sweep non-terminal actions honoring required_after_close.
       - id: get-entity-workflows
         description: Return workflows + filtered actions for one entity. Consumed by actions-on-entity.
       - id: get-workflow-overview
         description: Return one workflow + ordered + filtered actions for the shipped workflow-overview page.
   ```

2. At the top level of the manifest (alongside `components:` and `global:`), add an `api:` block with `_ref`s to each file:

   ```yaml
   api:
     - _ref: api/start-workflow.yaml
     - _ref: api/cancel-workflow.yaml
     - _ref: api/close-workflow.yaml
     - _ref: api/get-entity-workflows.yaml
     - _ref: api/get-workflow-overview.yaml
   ```

   Keep the five entries in the same order as the `exports.api` list — readers grep for one and expect the other.

3. Do **not** add `auth:` blocks, connection configs, `user_schema` var, or plugin version bumps. Those belong to part 20's manifest task.

## Acceptance Criteria

- `modules/workflows/module.lowdefy.yaml` has an `exports.api` list with five entries (`start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`).
- The manifest has a top-level `api:` block with five `_ref` entries pointing at the corresponding files under `api/`.
- Order matches between `exports.api` and `api:` (both list the three handler-wrappers first, then the two reads).
- `pnpm ldf:b` from `apps/demo` succeeds — the manifest builds cleanly. (Until part 20 wires the workflows module into `apps/demo/modules.yaml`, the build doesn't import the module; this task verifies only that the manifest is syntactically valid.)
- No changes to `connections`, `vars`, `global`, `plugins`, `secrets`, `dependencies` — those land in part 20.

## Files

- `modules/workflows/module.lowdefy.yaml` — **modify** — add `exports.api` list and top-level `api:` `_ref` block.

## Notes

- **Description style.** The `exports.api` entries carry one-line `description:` strings (matching the existing `exports.components` entries in the same manifest). Wording mirrors the concept spec's API table ([`module-surface/spec.md`](../../../../workflows-module-concept/module-surface/spec.md)) so users grep'ing across the manifest, concept spec, and part 19 design see the same phrasing.
- **Why this is the last task.** Tasks 1–6 can land in any order (with task 4 before tasks 5/6). Task 7 is the integration step — once it lands, the manifest exposes all five APIs to consumers (part 17, part 18, demo wiring in part 20). Splitting it per-API would create merge churn on the manifest file across PRs.
- **Auth posture stays open.** Per tasks 1–3, no `auth:` blocks on the routines. Host apps gate the call sites. If a future hardening pass needs `auth.roles` on the read APIs (so unauthorized callers can't probe workflow existence), it lands here additively without breaking the manifest shape.
- **The `auth:` block question for `close-workflow`.** v1 ships the API open. The close handler's validation rejects already-`cancelled` workflows; the missing piece is "should the API itself require an admin role." That's a follow-up after real apps surface the call-site pattern — out of scope here, consistent with the design.
