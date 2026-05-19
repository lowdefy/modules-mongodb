# Review 1 — Resolver inputs, page-shell completeness, gating edge cases

Focus: does part 12 have everything it needs from upstream parts, and does the emitted page shell match the concept UI spec?

## Inputs the resolver claims to read are not in the normalized config

### 1. `entity_collection` is never declared in workflow YAML

> **Resolved by new part 21.** The finding surfaced a deeper issue: `entity_type` is redundant once `entity_collection` is on every workflow/action doc. Spun out as [part 21 — entity-type-to-collection](../../21-entity-type-to-collection/design.md), which drops `entity_type` entirely from workflow YAML, doc shapes, and handler payloads. Part 12 now passes `entity_collection` only and depends on part 21 explicitly. Part 21 owns the follow-up tasks against the Implemented parts 3 and 4.

Part 12 In-scope (line 28) lists `entity_collection` as a var the resolver passes through from "the workflow". But:

- `action-authoring/spec.md` workflow YAML (lines 20–43) declares only `type`, `title`, `entity_type`, `display_order`, `action_groups`, `starting_actions`, `actions`. No `entity_collection`.
- [part 4 design.md:16](../../04-workflow-config-schema/design.md) lists the same top-level fields and excludes `entity_collection` from the schema.
- The shipped resolver at [modules/workflows/resolvers/makeWorkflowsConfig.js:18](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) confirms: `WORKFLOW_FIELDS = ['type', 'entity_type', 'display_order', 'starting_actions', 'action_groups']`.
- The concept UI spec line 99 says `get_workflow_entity` resolves the entity from "the workflow doc's `entity_type` + `entity_id` + `entity_collection`" — at runtime, off the **workflow doc**, not the workflow YAML config.

So `entity_collection` is a per-workflow-instance runtime field on the workflow doc, not a per-workflow-type build-time scalar. Part 12 cannot pass it as a template var.

**Fix:** Drop `entity_collection` from the vars list. Either (a) the template fetches it via `get_action` / `get_workflow` against the action's `workflow_id`, or (b) part 4 adds `entity_collection` to the workflow YAML so it becomes a per-type build-time constant. The latter is the cleaner option if every workflow type has a fixed collection — call this out as a part-4 amendment if needed.

### 2. `entity_id` referenced as a pass-through but it's a runtime URL param

> **Resolved.** Added a clarifying paragraph under the vars list in [part 12 design.md](../design.md) — `entity_id` is not a build-time var; it resolves at runtime from the `?action_id=` URL query via `get_action.workflow_id → get_workflow.entity_id`.

UI spec line 56 says "`entity_type`, `entity_id`, `entity_collection` flow into templates so they can build the right query." Part 12's design correctly omits `entity_id` from the listed vars (line 28 only lists `entity_type, entity_collection`), but the rationale link to UI spec line 56 will mislead readers into expecting `entity_id` too.

**Fix:** A one-line note in the design clarifying that `entity_id` comes from `_request: get_action.workflow_id → get_workflow.entity_id` at runtime, not as a build-time var.

### 3. Author-supplied page chrome is stripped by part 4

> **Resolved.** Small fold-in. Part 12's design now states it reads both the normalized config (for engine-runtime fields) and the raw `workflows_config` YAML (for build-time-only fields like `pages`, `form`, `hooks`). Part 4's `tasks/tasks.md` already documents this contract — part 12 was just under-describing its own inputs. No change to implemented parts needed.

Part 12 (line 14) reads the **normalized** config from part 4. But part 4 strips `pages`, `hooks`, `interactions`, `event`, `form`, `form_review`, `form_error` (see [makeWorkflowsConfig.js:1–5](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) comment: "Build-time-only fields … are excluded — they're consumed by build-time resolvers against the raw workflow YAML").

That means the design line 29 ("`maxWidth`, etc. — pass-through chrome knobs from `action.pages.{verb}`") is only achievable if part 12 reads the **raw** YAML, not the normalized config. The same applies to:

- `pages.{verb}.title` / `requests` / `events` / `formHeader` / `formFooter` / `modals` (concept ui spec lines 156–187, action-authoring spec lines 236–272).
- `pages.error.buttons.submit.{title, modal}` ([ui spec:69](../../../workflows-module-concept/ui/spec.md), [action-authoring spec:266–272](../../../workflows-module-concept/action-authoring/spec.md)).

**Fix:** Either (a) update the design to say "reads the raw `vars.workflows_config`, not the normalized output" — and reflect that on the dependency line (part 4 still validates, but part 12 doesn't consume its output); or (b) extend part 4 to keep a `pages` slice on the normalized config and document the contract.

Same problem applies to part 13 (which also says it reads the normalized config but needs `hooks`/`event`/`interactions`) — worth aligning both at once.

## Page-shell completeness

### 4. The design doesn't say to emit the `get_action` request

> **Resolved.** Added an explicit note in [part 12 design.md](../design.md) that the page shell carries context vars only — `events.onInit`, `requests:`, and the `get_action` request `_ref` live inside the template (part 16), not the shell.

UI spec page YAML shape (lines 23–50) clearly shows every emitted page carries:

```yaml
events:
  onInit:
    - id: get_action
      type: Request
      params: get_action
requests:
  - _ref:
      path: "{template-path}/get_action.yaml"
```

Part 12's In-scope section mentions only the `_ref` to the template and the `vars` block — nothing about the onInit `Request` action nor the `get_action` request `_ref`. Without this, the emitted page has no data and the template has nothing to render against.

**Fix:** Add a bullet to In-scope: "Emits the page-level `events.onInit` running `get_action` and the page-level `requests:` entry referencing `requests/get_action.yaml` (shipped by part 16)." Then mark `requests/get_action.yaml` as a part-16 deliverable in the contract.

### 5. `page_ids` map should reflect emitted pages, not all four verbs

> **Resolved.** Updated [part 12 design.md](../design.md) — `page_ids` only includes keys for emitted verbs. Templates guard sibling references with `_if page_ids.{verb} is defined`. The map never points at a non-existent page id.

Design line 28: `page_ids` map for sibling-page navigation `{ edit, view, review, error }`.

UI spec line 43–47 shows the full four-key map. But the resolver gates emission per-verb — if `-review` isn't emitted, the `page_ids.review` value points at a page id that doesn't exist. Templates that conditionally render review links would have to do their own existence check via app config, which the page YAML doesn't carry by the time it's at runtime.

**Fix:** Decide and document: either (a) only include keys for emitted verbs (template uses `_if` `page_ids.review is defined`); or (b) include all four ids unconditionally, and document that templates resolve link visibility through `access.{app_name}` re-checked at runtime via `action_role_check`. Option (b) is consistent with the concept's runtime-access-recheck pattern.

## Gating + collisions

### 6. Behavior when `vars.app_name` is unset

> **Resolved.** Added an explicit build-time validation entry in [part 12 design.md](../design.md) — `vars.app_name` must be non-empty; missing/null/`""` fails the build. Defense in depth with part 20's manifest-level `required: true`.

`makeWorkflowsConfig` doesn't require `app_name`, but part 12 keys the entire gating off `access.{vars.app_name}`. If `app_name` is missing / undefined, every action's `access[undefined]` is undefined, so no pages emit. That's likely the wrong failure mode — silently emitting zero pages is hard to debug.

**Fix:** Fail the build in the resolver with "workflows module: `app_name` is required for `makeActionPages` to gate page emission" when `vars.app_name` is falsy. Part 20's manifest already marks `app_name` as required — assert it here too.

### 7. `access.roles` key collision risk

> **Rejected.** Vanishingly unlikely in practice (no one names a deployment `"roles"`), and the right home would be part 20's var schema, not part 12. Not worth the noise here.

`access.roles` is a sibling of `access.{app_name}` ([action-authoring spec:117–123](../../../workflows-module-concept/action-authoring/spec.md)). If a host app picks `app_name: 'roles'`, then `access.roles` is read as a verb list rather than the role gate. Vanishingly unlikely but a one-line guard prevents nasty bugs.

**Fix:** Reject `vars.app_name === 'roles'` in the resolver at build time with a clear message. Cheap, eliminates the class of bug.

### 8. Page id collision check against static module pages

> **Rejected.** Structural prevention: dynamic ids are always three-segment `{workflow_type}-{action_type}-{verb}`, static ids are one/two segments. No realistic naming produces a collision. Adding the assertion would couple part 12 to part 17's static-page list for protection that doesn't pay rent.

Design line 38: "Page id collisions across workflows are prevented by the `{workflow_type}-...` prefix — but assert anyway."

Per [part 17 design.md:13–28](../../17-shared-pages/design.md), the module also ships static pages `task-edit`, `task-view`, `task-review`, `workflow-overview`. A workflow with `type: task` and an action with `type: edit` produces `task-edit-edit` (safe), but a workflow with `type: workflow` and `action_type: overview` produces `workflow-overview-{verb}` — still distinct from the bare `workflow-overview`. But assertion should explicitly include the static pages in its collision set to catch e.g. a workflow with `type: workflow-overview` and `action_type: -` from clobbering them.

**Fix:** Augment the assert to compare emitted ids against the static-page id list `['task-edit', 'task-view', 'task-review', 'workflow-overview']` plus the cross-workflow set.

### 9. Verification fixture redundancy

> **Resolved.** Dropped the redundant `track-installation` line in [part 12 design.md](../design.md); the stronger "tracker actions skipped even when carrying `access.{app}: [view]`" assertion remains.

Verification (lines 58–59):
- "`track-installation` (tracker) emits nothing."
- "Tracker actions skipped even when carrying `access.{app}: [view]`."

The second is a stronger version of the first. Drop the first, keep only the access-listed variant — that's the case worth testing.

## Cross-part timing

### 10. Path-existence check ships before templates ship

> **Resolved.** Added a "Placeholder templates" section to [part 12 design.md](../design.md) — part 12 ships four stub `.yaml.njk` files (replaced in part 16). This also dissolves the design's outstanding open question about the form stub (the placeholder `edit.yaml.njk` is the stub), which was removed.

Design line 37: "ensure the referenced template file exists (template files land in part 16, but the path check ships here so emission failures surface fast)."

Part 12 is Wave 2; part 16 is Wave 6 ([implementation-plan.md:26–31, 63–71](../../implementation-plan.md)). Between Wave 2 and Wave 6, the path check will fail on every build unless part 12 also ships placeholder templates (the design's open question about the `Html` stub addresses this for the form body but not for the four `.yaml.njk` templates themselves).

**Fix:** Pick one — (a) skip the path-existence check until part 16 lands and add a tracking task to enable it then; or (b) ship four no-op `templates/{verb}.yaml.njk` placeholder files in part 12 that part 16 fleshes out. Option (b) preserves the "fail fast" intent and the open-question stub block can live inside the placeholder edit template.

## Open question for part 12 to resolve before merge

The design's open question on the form-block stub is real but the timing matters: parts 12 and 15 both land in Wave 2 in parallel. If both merge together the stub is unnecessary; if part 12 lands first the stub is required for the demo to render at all. Tie the answer to the wave-2 sequencing decision.
