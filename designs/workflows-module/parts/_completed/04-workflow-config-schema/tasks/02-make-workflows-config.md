# Task 2: Write the `makeWorkflowsConfig` resolver

## Context

`makeWorkflowsConfig` is a Lowdefy `_ref` resolver that takes a pre-expanded array of workflow YAML definitions and emits the normalized workflows config the engine reads.

It's invoked from app YAML like this:

```yaml
workflowsConfig:
  _ref:
    resolver: ../shared/workflow_utils/resolvers/makeWorkflowsConfig.js  # app-side path
    vars:
      workflows:
        _ref: ../shared/workflow_config/workflows.yaml
```

By the time the resolver runs, **Lowdefy has already expanded all nested `_ref`s in `vars.workflows`**. The resolver doesn't need to walk the tree resolving references — it just sees a plain JS array. (The design.md says "expands `_ref`s"; that wording is misleading. The framework does the expansion; the resolver consumes the result.)

The previous-generation resolver (`modules/workflows/resolvers-old/makeWorkflowsConfig.js`) is a useful behavior reference but **uses different field names**: `action.action` → `action.type`, `workflow.ticket_category` → `workflow.entity_type`, `action.roles` → `action.access.roles`, etc. Read it for shape, then implement against the new field names from the concept doc ([workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md)).

**Scope decisions:**

- **Resolver narrows the output.** Both workflow-level and action-level fields are whitelisted — only fields the engine reads at runtime or UI components look up via the connection. Build-time-only fields (`form`, `form_review`, `form_error`, `pages`, `hooks`, `interactions`, `event`) are excluded; parts 12/13/15 read those directly from the raw workflow YAML.
- **7 inline validators.** Each validator throws a precise `makeWorkflowsConfig: workflow "X": <what's wrong>` error pointing at the failing YAML.
- **No `_ref` expansion logic.** Framework handles it.
- **No display-override merge in this resolver.** That ships separately via the manifest's `_build.object.assign` merge for the UI components.

### Normalized shape

Workflow-level (5 fields):

```
{
  type: string,                 // unique workflow id
  entity_type: string,          // entity tracked (e.g. "lead", "lot")
  display_order?: number,
  starting_actions: Array<{ type, status }>,
  actions: ActionConfig[],
  action_groups?: Array<{ id, title?, sort_order? }>,
}
```

Action-level (10 fields whitelisted):

```
{
  type: string,
  kind: 'form' | 'task' | 'tracker',
  key?: string,
  tracker?: { workflow_type },
  blocked_by?: Array<string>,
  action_group?: string,
  sort_order?: number,
  required_after_close?: boolean,
  access?: { [app_name]: string[], roles?: string[] },
  status_map?: { [status]: { [app_name]: { message, link? } } },
}
```

`sort_order` and `status_map` are UI-only but included because UI status-lookup happens via the connection's `workflowsConfig`. Build-time fields are dropped — see whitelist comment in the resolver.

### Validators shipped (7)

Each throws on first violation with a path-prefixed message.

1. **Action `type` uniqueness within workflow.** Two actions with the same `type` would clobber each other in any engine `actionsByType` lookup.
2. **`kind` ∈ {form, task, tracker}.** Unknown kinds break downstream branching.
3. **Kind/block matchup.** `form` requires `form:`, `tracker` requires `tracker:`, `task` rejects both, and `form: + tracker:` together is rejected (shape ambiguity).
4. **`action_group` references a declared group.** Prevents orphan group references.
5. **No `action_groups[].id` collides with any `actions[].type`.** Required because `blocked_by` resolves group-id-first.
6. **`status_map` keys are canonical statuses.** Catches status-name typos at build time.
7. **`starting_actions` entries resolve.** Each `{type, status}` entry: `type` must be a declared action, `status` must be a canonical status name.

Validators deliberately NOT shipped:

- **`blocked_by` resolution** — engine territory (part 7).
- **`access.{app_name}` verb whitelist** — runtime is lenient (silently ignores unknown verbs per spec).
- **Hook auth gate** — part 13 (lives with endpoint generation).

## Task

Create `modules/workflows/resolvers/makeWorkflowsConfig.js`. The resolver:

1. Reads `vars.workflows` — an array of workflow YAML objects (already `_ref`-expanded).
2. Validates each workflow (7 checks above) — throws on first violation.
3. For each action, picks only whitelisted fields (10 entries) into the output.
4. For each workflow, picks only whitelisted fields (5 entries) into the output.
5. Returns the array of normalized workflow configs.

Approximate shape (final file lives at `modules/workflows/resolvers/makeWorkflowsConfig.js`):

```js
const ACTION_FIELDS = [
  'type', 'kind', 'key', 'tracker', 'blocked_by',
  'action_group', 'sort_order', 'required_after_close',
  'access', 'status_map',
];
const WORKFLOW_FIELDS = [
  'type', 'entity_type', 'display_order',
  'starting_actions', 'action_groups',
];
const ACTION_KINDS = ['form', 'task', 'tracker'];
const ACTION_STATUSES = [
  'not-required', 'error', 'changes-required', 'done',
  'in-review', 'in-progress', 'action-required', 'blocked',
];

function pick(source, fields) { /* ... */ }
function fail(workflowType, message) { /* throws with prefix */ }
function validateAction(workflow, action) { /* kind, block matchup, status_map */ }
function validateWorkflow(workflow) { /* uniqueness, group collision, starting_actions, etc. */ }

function makeWorkflowsConfig(_, vars) {
  return vars.workflows.map((workflow) => {
    validateWorkflow(workflow);
    const actions = (workflow.actions ?? []).map((a) => pick(a, ACTION_FIELDS));
    return { ...pick(workflow, WORKFLOW_FIELDS), actions };
  });
}

export default makeWorkflowsConfig;
```

## Acceptance Criteria

- File exists at `modules/workflows/resolvers/makeWorkflowsConfig.js`.
- Default export is a function with signature `(_, vars) => WorkflowsConfig`.
- Given a valid workflow, returns an array where each workflow has only the 5 whitelisted fields and each action only the 10 whitelisted fields.
- Each of the 7 validators throws an Error whose message contains `makeWorkflowsConfig: workflow "<type>":` and is specific enough to point at the failing action/group.
- Given an action with both `form` and `tracker`, throws with message containing the action's `type`, the workflow's `type`, and the words "form" and "tracker".
- No imports of any third-party library. Resolver is pure JS, no dependencies, no `node:` modules.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — create

## Notes

- **The resolver is module-internal.** Apps invoke it via the module-export wiring landing in part 20. For now, the file just needs to exist at the canonical path so the example YAML's resolver path (currently `../shared/workflow_utils/resolvers/makeWorkflowsConfig.js`) can be adjusted later to point at the module.
- **No file-system imports, no `node:` modules.** The resolver runs in Lowdefy's build context. Keep it pure.
- **Why narrow the output?** `workflowsConfig` ships to the connection and is read by the engine on every call. Heavy build-time-only fields (forms, pages, hooks) would bloat the connection config for no engine consumer. Build-time resolvers in parts 12/13/15 read the raw workflow YAML.
- **The previous-generation resolver builds an `actions_config` object keyed by action type.** We are NOT doing that. `actions` stays an array. Engine indexes it itself if needed.
- **`workflow.entity?.key` from the old code maps to `workflow.entity_type` in the new shape.** App-side migration concern, not the resolver's.
- **No JSDoc typedefs file.** Existing modules ship no `.js` helpers and a JSDoc-only file with no real LSP consumers isn't worth the overhead.
