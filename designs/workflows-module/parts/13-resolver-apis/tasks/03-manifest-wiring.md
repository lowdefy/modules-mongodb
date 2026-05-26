# Task 3: Wire `makeWorkflowApis` into the module manifest

## Context

`makeWorkflowApis` produces an array of `{ id, definition }` Api objects at build time (task 2). For Lowdefy to merge those Apis into the app's Api tree, the module manifest needs to declare the resolver in its `exports.api` (or equivalent) section. The mechanism is part 2's dynamic-exports extension to `@lowdefy/build` — the same primitive `makeActionPages` uses for dynamic page exports.

**This task is blocked on part 2.** Part 2's design ([parts/02-dynamic-module-pages/design.md](../../_completed/02-dynamic-module-pages/design.md)) lists "whether `exports.api` rides on the same channel as `exports.pages`" as an open question. Until that resolves, there's no manifest shape to write against. Three candidate shapes:

- **Single shared channel.** Part 2 picks one mechanism (e.g. `exports.resolvers: { pages: [...], api: [...] }`) that handles both pages and Apis. Easiest manifest wiring.
- **Parallel channels.** `exports.pages: [{ resolver, vars }]` and `exports.api: [{ resolver, vars }]` — same shape, two homes. Manifest carries both entries.
- **API-only extension.** Part 13 ships its own upstream change to add `exports.api` resolver-emit, parallel to part 12's page extension.

Read part 2's resolved-state design before writing this task's edit.

The current `modules/workflows/module.lowdefy.yaml` already declares `workflows_config` as a required var (shipped as part of the part-4 / part-15 consolidation; see lines 23–32 of the live manifest). Part 12's task 3 is the planned home for the `makeActionPages.js` registration **and** the `app_name` var declaration; it's blocked on the same part-2 upstream that blocks this task. This task adds **only** the API-resolver wiring; it does not pull in part 20's full surface (WorkflowAPI connection, `MONGODB_URI` secret, menus, etc.).

## Task

Edit `modules/workflows/module.lowdefy.yaml` to:

1. **Register the API resolver** under whatever channel part 2 settled on for dynamic Api exports. Inline-in-`exports.api` shape (parallel to the page channel):

   ```yaml
   exports:
     pages:
       - resolver: resolvers/makeActionPages.js
         vars:
           workflows: { _module.var: workflows_config }
           app_name: { _module.var: app_name }
     api:
       # Per-action update-action-{action_type} endpoints + resolver-emitted
       # hook Apis + group on_complete Apis. Endpoints emit once per
       # form/task action regardless of host app; engine enforces access
       # at submit time. See parts/13-resolver-apis/design.md.
       - resolver: resolvers/makeWorkflowApis.js
         vars:
           workflows: { _module.var: workflows_config }
   ```

   Adjust to part 2's actual shape if it picked something other than `exports.api`. `vars.app_name` is **not** passed to this resolver — it doesn't need it (per design.md:15).

2. **Bump the manifest version** — minor bump (Api exports are additive). The current version when this task is picked up depends on whether part 12's task 3 shipped first; bump from whatever's there.

3. **Do not** redeclare `workflows_config` — it's already in the shipped manifest. **Do not add `app_name`** either; that's part 12's task 3 (and this resolver doesn't need it).

### Suggested edit (template — adapt to part 2's actual shape and to what's already in the manifest when you pick this up)

Only the additions specific to this task are shown below; leave any sections part 12's task 3 (or part 20) has added in place. The `pages:` entry is shown for context — only add it here if part 12's task 3 hasn't already shipped.

```yaml
name: Workflows
version: <bump minor from current>
description: Workflow engine — action lifecycle, status transitions, hooks, trackers

exports:
  components: # already in manifest — leave as-is
    - id: action_statuses
    - id: workflow_lifecycle_stages
  # pages: (added by part 12's task 3 — shown for context only)
  api:
    # Per-action update-action-{action_type} endpoints, plus resolver-emitted
    # hook Apis and group on_complete Apis. See parts/13-resolver-apis/design.md.
    - resolver: resolvers/makeWorkflowApis.js
      vars:
        workflows: { _module.var: workflows_config }

vars:
  workflows_config: # already in manifest — leave as-is
    type: array
    required: true
    description: ...
  # app_name: (added by part 12's task 3 — not needed for this resolver)
  action_statuses_display: # already in manifest — leave as-is
  workflow_lifecycle_stages_display: # already in manifest — leave as-is

components: # already in manifest — leave as-is

plugins:
  - name: "@lowdefy/modules-mongodb-plugins"
    version: "^0.6.0"
```

## Acceptance Criteria

- `modules/workflows/module.lowdefy.yaml` registers `resolvers/makeWorkflowApis.js` under part 2's dynamic-API-export channel.
- A demo app composing the module with a valid `workflows_config` produces the expected per-action Api set at build time (verify by inspecting the Lowdefy build output's Api list — should include `update-action-{action_type}` per form/task action, plus any resolver-emitted hook / `on_complete` Apis for actions and groups that declared inline routines).
- A demo app composing the module **without** `workflows_config` continues to fail the build at the manifest-level `required: true` check (no behavioral change here — part 12's task 3 already enforces it).
- The manifest version is bumped (minor — Api exports are an additive feature).
- The existing page exports (`makeActionPages`) and enum components continue to work unchanged.

## Files

- `modules/workflows/module.lowdefy.yaml` — modify

## Notes

- **Blocked on part 2.** Don't start this task before part 2's dynamic-API channel decision lands. The manifest shape depends on which channel shape part 2 picks (`exports.api` inline vs `exports.resolvers.api` vs a single shared channel).
- **Do not** add the WorkflowAPI connection, the `MONGODB_URI` secret, menus, or the form-components library exports here. Those land in part 20's full manifest consolidation.
- **No `app_name` var here.** The resolver doesn't consume `app_name` (endpoints emit once per action regardless of host app). Part 12's task 3 already declares `app_name` for `makeActionPages`; leave that declaration alone.
- **If part 2 ships only a page channel,** file a follow-up against part 2 to add the API channel, mark this task `⏸ blocked on part 2 follow-up`, and ship tasks 1–2 separately. Tasks 1–2 produce a fully tested resolver without manifest wiring — they unblock part 9's design work that depends on the emitted endpoint shape.
