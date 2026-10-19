# Task 6: Demo — add the `entity.data` routine and read from the action response

## Context

The demo onboarding workflow currently relies on the deleted `get_entity` request. It must now
declare an `entity.data` routine and read entity fields off the `get_workflow_action.entity` object.

Relevant demo files:

- `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` — the workflow's
  `entity:` block (lines 3-13) currently has `connection_id: leads-collection`, `ref_key: lead_ids`,
  `page_id: lead-view`, `title: Lead`, `name_field: name`, `list_page_id: lead-list`,
  `list_title: Leads`.
- `apps/demo/modules/workflows/workflow_config/onboarding/lead-detail-slot.yaml` — the
  `entity_view.slot` block; its `_nunjucks` `on:` reads `get_entity.0.name` and `get_entity.0.email`.

This task depends on Tasks 1–4: validation (1) accepts `entity.data`, emission (2) generates the
endpoint, the handlers (3) surface `entity`/`entity_link.name`, and the templates (4) no longer
reference `get_entity`. Only the demo (`lead-detail-slot.yaml`) reads `get_entity`.

## Task

1. **`onboarding.yaml`** — in the `entity:` block:
   - **Remove** the `name_field: name` line (the field is gone; the routine returns `name`).
   - **Add** an `entity.data` routine in the `{ routine: [...] }` envelope. It names its own
     connection (`leads-collection`), takes `{ entity_id }`, and returns an object whose reserved
     `name` key is the lead's display name plus the host-owned fields the slot renders (`email`,
     and any others the slot/`DataDescriptions` reference). Mirror the design's authoring example:

     ```yaml
     data:
       routine:
         - id: load
           type: MongoDBAggregation
           connectionId: leads-collection
           payload:
             entity_id:
               _payload: entity_id
           properties:
             pipeline:
               - $match:
                   _id:
                     _payload: entity_id
         - :return:
             name:
               _step: load.0.name
             email:
               _step: load.0.email
     ```

     Use the actual field names on the demo `leads-collection` doc (the current slot reads `name`
     and `email`, so return at least those). Keep `connection_id`, `ref_key`, `page_id`, `title`,
     `list_page_id`, `list_title` unchanged.

2. **`lead-detail-slot.yaml`** — repoint the `_nunjucks` `on:` reads from the array shape to the
   object shape on the action response:
   - `name: { _request: get_entity.0.name }` → `name: { _request: get_workflow_action.entity.name }`
   - `email: { _request: get_entity.0.email }` → `email: { _request: get_workflow_action.entity.email }`
   - Update the file's header comment (lines 4-6) — it no longer reads a baked `get_entity` request;
     it reads `get_workflow_action.entity.<field>` (object, no `.0`).

3. Audit the rest of the onboarding workflow config for any other `entity.*` form-config reads of
   `get_entity` (grep `get_entity` under `apps/demo/modules/workflows/workflow_config/onboarding/`)
   and repoint them the same way. (At time of writing, only `lead-detail-slot.yaml` references it.)

## Acceptance Criteria

- `onboarding.yaml`'s `entity:` block has no `name_field` and a valid `entity.data: { routine: [...] }`
  returning `name` (+ `email`).
- `lead-detail-slot.yaml` reads `get_workflow_action.entity.name` / `.email` (no `.0`, no
  `get_entity`).
- No file under `apps/demo/.../onboarding/` references `get_entity` (excluding generated
  `.lowdefy/` build artifacts).
- `cd apps/demo && pnpm ldf:b` succeeds.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` — modify — drop
  `name_field`, add the `entity.data` routine.
- `apps/demo/modules/workflows/workflow_config/onboarding/lead-detail-slot.yaml` — modify — repoint
  slot reads to `get_workflow_action.entity.*`; update header comment.

## Notes

- The routine returns an **object** — the slot and `DataDescriptions` read `entity.<field>`
  directly (no `.0`); `set_entity_id` keeps reading `entity.id` (injected by the handler).
- `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` exercises this flow end-to-end (Part 22
  suite); it does not need changes for this task but is the e2e coverage referenced by the design.
