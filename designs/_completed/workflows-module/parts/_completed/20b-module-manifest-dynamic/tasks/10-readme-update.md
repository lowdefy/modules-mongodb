# Task 10: Update `modules/workflows/README.md` to drop part-20b pointer and document new exports

## Context

`modules/workflows/README.md` was authored by part 20a with a placeholder pointer in the Exports section: _"Per-action pages and per-action submit endpoints ship in part 20b"_. With the resolver wiring already on `main` (commit `574960a`) and the demo extension landing via tasks 3–8, the README should describe the full surface as one coherent thing.

The README also needs to document the new `entity-workflows-refetch` component (task 2) under Components.

## Task

1. **Replace the "Per-action pages and per-action submit endpoints ship in part 20b" pointer** in the Exports section with inline descriptions of the resolver-emitted entries:

   - **Pages:** one page per `(workflow_type, action_type, verb)` tuple where `verb` is in the action's `access.{app_name}.verbs` filtered against `[edit, view, review, error]` (per [makeActionPages.js `VERBS`](modules-mongodb/modules/workflows/resolvers/makeActionPages.js)). Tracker and task actions emit none. Example id: `onboarding-qualify-edit`.
   - **API Endpoints:** one `update-action-{action_type}` endpoint per form/task action, baking in `hooks:` / `event:` / `interactions:` blocks as build-time literals (see [part 13](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) contract). Also one `update-action-{type}-{interaction}-{phase}` per declared inline hook routine. Also one `workflow-{type}-group-{id}-on-complete` per declared group `on_complete` callback. Tracker actions emit none.

2. **Add a "How to Use" worked example** walking through declaring a single workflow with one form action:

   ```yaml
   # app's workflow_config/lead-pipeline.yaml
   type: lead-pipeline
   entity_collection: leads-collection
   starting_actions:
     - { type: qualify, status: action-required }
   action_groups:
     - { id: discovery, title: Discovery }
   actions:
     - type: qualify
       kind: form
       action_group: discovery
       access: { my-app: [edit, view], roles: [account-manager] }
       form: [...]
       status_map: { ... }
       interactions: { submit_edit: { status: done } }
   ```

   …observing that the build emits:
   - Pages at `/{workflows-entry}/lead-pipeline-qualify-edit` and `/{workflows-entry}/lead-pipeline-qualify-view`.
   - An endpoint at `/api/{workflows-entry}/update-action-qualify`.

3. **Document the new `entity-workflows-refetch` component** under Components. Specify its `vars` (`entity_id`, `entity_collection`) and link to `apps/demo/pages/leads/lead-view.yaml` as the canonical worked example.

4. **Drop the "static surface shipped by part 20a; part 20b adds…" framing paragraph** at the top of the README — replace with a description of the full surface as one coherent thing (no part-numbered history).

## Acceptance Criteria

- README's Exports section has no "ship in part 20b" pointer; both pages and endpoints are described inline.
- The "How to Use" section includes a worked-example block for a form action.
- The Components list includes `entity-workflows-refetch` with its vars.
- The top-level framing paragraph reads as one coherent description, not as "20a + 20b" history.
- Variable and export descriptions in the README still match `modules/workflows/module.lowdefy.yaml` (manifest is the source of truth — mismatches fail review).

## Files

- `modules/workflows/README.md` — modify — Exports section, How to Use, Components list, top-level framing.

## Notes

- Keep the README fixed-template from [CLAUDE.md "Documentation"](prp/CLAUDE.md): Description, Dependencies, How to Use, Exports (Pages / Components / API Endpoints / Connections / Menus), Vars, Secrets, Plugins, Notes.
- The Notes section can mention runtime-only deps (parts 1, 9, 11) but shouldn't drag the implementation-plan structure into the consumer-facing doc. Keep it short.
- README accuracy is a verification step in 20b's design — every var listed in the manifest must have a matching narrative entry here; every export in the README must exist in the manifest.
