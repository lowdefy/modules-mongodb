# Task 4: Wire the three components into `module.lowdefy.yaml`

## Context

Tasks 1–3 ship `action_role_check.yaml`, `workflow-header.yaml`, and `actions-on-entity.yaml` under `modules/workflows/components/`. None of them are currently exposed via the module manifest, which means host apps can't `_ref` them as `module: workflows, component: <id>`. This task wires all three into `module.lowdefy.yaml` so they're consumable by host apps via the module-export mechanism.

The existing manifest at [modules/workflows/module.lowdefy.yaml](../../../../modules/workflows/module.lowdefy.yaml) already exports the two enum components (`action_statuses`, `workflow_lifecycle_stages`) and registers them in the top-level `components:` block via `_build.object.assign`. Adding three more component entries follows the same pattern but is simpler — these are file refs, not assigned objects.

## Task

Modify `modules/workflows/module.lowdefy.yaml` to expose the three Part 18 components.

**1. Add to `exports.components`** (currently has the two enums). Append three entries:

```yaml
exports:
  components:
    - id: action_statuses
      description: Action status enum (8 canonical statuses) merged with app display overrides — for UI consumption
    - id: workflow_lifecycle_stages
      description: Workflow lifecycle stage enum (active, completed, cancelled) merged with app display overrides — for UI consumption
    # ↓ NEW (part 18)
    - id: actions-on-entity
      description: Entity-page widget — surfaces all workflows attached to one entity. Host apps drop it onto entity pages; takes entity_id + entity_collection vars.
    - id: workflow-header
      description: Per-workflow strip with title, lifecycle badge, summary counts, milestone label, workflow-overview link button, and a collapsible slot for caller-passed blocks. Used internally by actions-on-entity and workflow-overview.
    - id: action_role_check
      description: Client-side role-gate action sequence. Composed into a page's onMount; writes the boolean to _state.action_allowed.
```

**2. Add to the top-level `components:` block** (currently has the two enums via `_build.object.assign`). Append three plain `_ref` entries:

```yaml
components:
  - id: action_statuses
    component:
      _build.object.assign:
        - _ref: enums/action_statuses.yaml
        - _module.var: action_statuses_display
  - id: workflow_lifecycle_stages
    component:
      _build.object.assign:
        - _ref: enums/workflow_lifecycle_stages.yaml
        - _module.var: workflow_lifecycle_stages_display
  # ↓ NEW (part 18)
  - id: actions-on-entity
    component:
      _ref: components/actions-on-entity.yaml
  - id: workflow-header
    component:
      _ref: components/workflow-header.yaml
  - id: action_role_check
    component:
      _ref: components/action_role_check.yaml
```

**3. Update the leading comment.** The current comment block at the top of the manifest enumerates which parts the manifest declares:

> "This manifest declares the part-04 enum components (action_statuses, workflow_lifecycle_stages), the part-15 global register (action_form_configs), and the part-19 operational APIs (start/cancel/close-workflow + get-entity-workflows / get-workflow-overview)."

Update it to also mention the part-18 component exports. Suggested addition: append "and the part-18 entity-page components (actions-on-entity, workflow-header, action_role_check)" to the sentence.

## Acceptance Criteria

- `modules/workflows/module.lowdefy.yaml` exports all five components: `action_statuses`, `workflow_lifecycle_stages`, `actions-on-entity`, `workflow-header`, `action_role_check`.
- The top-level `components:` block has matching entries for each, with the Part 18 entries using plain `_ref` (no `_build.object.assign`).
- `pnpm ldf:b` on `apps/demo` builds cleanly — no missing-`_ref` errors, no schema errors on the manifest.
- A host app can `_ref: { module: workflows, component: actions-on-entity, vars: { entity_id, entity_collection } }` successfully (the build resolves the ref).
- The leading comment in the manifest reflects the part-18 additions.

## Files

- `modules/workflows/module.lowdefy.yaml` — **modify** — append three entries to `exports.components`, three entries to the top-level `components:` block, and extend the leading comment.

## Notes

- **Per-component dash-vs-underscore IDs are intentional.** `actions-on-entity` and `workflow-header` are kebab-case (matching the component file naming); `action_role_check` is snake_case (matching its file naming and v0's precedent). CLAUDE.md file-naming rule: "Use snake_case for component files, request files, action files" — `action_role_check.yaml` is an action sequence (snake_case correct); `workflow-header.yaml` and `actions-on-entity.yaml` are block-tree components. The mixed convention is intentional and matches the files shipped in tasks 1–3.
- **No host-app changes required by this task.** Existing `_ref: { path: ../components/X.yaml }` call sites from Part 16 and Part 17 will continue to work — they use direct path refs, not module-component refs. The export entries enable a *new* call shape (`_ref: { module: workflows, component: X }`) for host apps that drop the components onto their own pages (Part 27's job).
- **Module manifest is the source of truth for var schemas** per CLAUDE.md. The Part 18 components don't introduce new top-level module vars (they read existing `app_name`, `user_schema`, `workflows_config`), so no `vars:` additions are needed in this task. Part 20 (module-manifest as a whole) is the broader manifest design; this task lands the surface needed for Part 18 specifically.
- **Smoke check after wiring** — drop a temporary `_ref: { module: workflows, component: actions-on-entity, vars: { entity_id: "test", entity_collection: "test" } }` on a demo page, run `pnpm ldf:b`, verify the build resolves the ref. Roll back the temp change before commit. (This is just for build-time verification — the component won't actually render meaningfully without a real entity, which is Part 27's responsibility.)
