# Task 2: Write the `makeWorkflowApis` resolver

## Context

`makeWorkflowApis` is a Lowdefy `_ref` resolver that emits per-action `update-action-{action_type}` Lowdefy Apis at build time, plus the resolver-derived hook Apis and group `on_complete` Apis the action / workflow YAML carries inline. It runs once per build, consumes the host app's `workflows_config` array, and returns an array of `{ id, definition }` Api objects that the module-loading layer (part 2) merges into the app's Api tree.

The resolver is invoked from `module.lowdefy.yaml` (task 3 wires this); for now you can drive it from a unit-test harness.

### Inputs

Lowdefy passes resolver vars as the second argument: `function makeWorkflowApis(_, vars)`. The vars shape:

```js
{
  workflows: WorkflowYaml[],  // raw, with _ref already expanded by the framework
}
```

`vars.app_name` is **not** an input — endpoints emit once per form/task action regardless of which apps consume them. (Per-page emission is verb-filtered in `makeActionPages`; per-API emission is not.)

The framework expands all nested `_ref`s in `vars.workflows` before the resolver runs (same pattern as `makeActionPages`). The resolver sees a plain JS array of workflow objects.

### Input contract

The resolver reads everything from the raw `vars.workflows` array — the same raw YAML `makeActionPages` consumes, **not** the normalized output of `makeWorkflowsConfig`. Build-time-only fields (`hooks`, `interactions`, `event`, `access`, `action_groups[].on_complete`) live on the raw action / workflow object; `makeWorkflowsConfig` strips them from its engine-runtime slice. The two resolvers run in parallel against the same raw YAML.

Task 1 already taught `makeWorkflowsConfig` to validate `hooks.{interaction}.{pre|post}` and `action_groups[].on_complete` as inline routine objects (rejecting the legacy string form). This resolver assumes that validation has run — it does not re-validate the YAML schema.

### What the resolver emits

For each workflow:

1. **One `update-action-{action_type}` Api per `kind: form` / `kind: task` action.** Tracker actions emit nothing. The endpoint shape is identical for form and task — handler routes task-specific behaviour via `current_status`.
2. **Zero or more hook Apis** per action — one per declared `hooks.{interaction}.{pre|post}` slot. The author's inline `routine:` is emitted on a fresh Api whose `auth.roles` is synthesized from the action's `access.roles`.
3. **Zero or more group `on_complete` Apis** per workflow — one per `action_groups[].on_complete` that's declared. Auth is synthesized from the union of `access.roles` across the group's actions.

### Emitted shapes

#### `update-action-{action_type}` Api

Per submit-pipeline/spec.md "Per-action `update-action-{action_type}` Api":

```yaml
id: update-action-{action_type}
type: Api
routine:
  - id: submit
    type: SubmitWorkflowAction
    connectionId:
      _module.connectionId: workflow-api
    properties:
      action_id: { _payload: action_id }
      action_type: <action_type>               # build-time literal
      workflow_type: <workflow_type>           # build-time literal
      interaction: { _payload: interaction }
      current_key: { _payload: current_key }
      form: { _payload: form }
      form_review: { _payload: form_review }
      fields: { _payload: fields }
      comment: { _payload: comment }                 # user-supplied comment; handler maps to event.metadata.comment (see part 13 design.md § Comment mapping)
      current_status: { _payload: current_status }   # only when emitting for kind: task; omit for form
      hooks:                                    # sparse — only declared interactions/phases
        submit_edit:
          pre: update-action-{action_type}-submit_edit-pre
          # post slot omitted if not declared
      event_overrides:                          # sparse — lifted from action.event[interaction]
        submit_edit: { type, display, references, metadata }
      interactions:                             # sparse — lifted from action.interactions[interaction]
        submit_edit: { status: <override> }
  - :return:
      action_ids: { _step: submit.action_ids }
      completed_groups: { _step: submit.completed_groups }
      event_id: { _step: submit.event_id }
      tracker_fired: { _step: submit.tracker_fired }
      pre_hook_response: { _step: submit.pre_hook_response }
      post_hook_response: { _step: submit.post_hook_response }
```

**Sparseness:** the `hooks`, `event_overrides`, and `interactions` maps carry only the slots the action declares. An action with no `hooks:` block omits the entire `hooks:` property from the emitted endpoint (not `hooks: {}`).

**Payload contract:** no root-level `force` field — the resolver does not emit a `force:` slot in `properties:`. `force: true` lives only on pre-hook-returned `actions[]` entries (engine-internal).

#### Hook Api (`update-action-{action_type}-{interaction}-{pre|post}`)

For each declared `hooks.{interaction}.{pre|post}`:

```yaml
id: update-action-{action_type}-{interaction}-{pre|post}
type: Api
auth:
  roles: <action.access.roles>      # synthesized; never auth.public: true
routine: <action.hooks[interaction][phase].routine>     # passed through verbatim
```

The hook Api id is referenced from the parent `update-action-{action_type}` endpoint's `hooks:` map; part 9's `invokePreHook.js` reads it from the endpoint payload and invokes it via `context.callApi`.

#### Group `on_complete` Api (`workflow-{workflow_type}-group-{group_id}-on-complete`)

For each `action_groups[].on_complete` declared on the workflow:

```yaml
id: workflow-{workflow_type}-group-{group_id}-on-complete
type: Api
auth:
  roles: <union of access.roles across actions whose action_group === group.id>
routine: <action_group.on_complete.routine>             # passed through verbatim
```

If the union of roles across the group's actions is empty (no action in the group has `access.roles`), emit `auth: { roles: [] }` — Lowdefy reads an empty roles list as "no role required" (gate effectively open). The resolver does **not** add a fallback gate; the author's choice of empty `access.roles` is honored. (Part 11 fires this Api via `context.callApi`, which still attaches the submitting user's auth context for routine-level checks.)

### Synthesizing `auth.roles`

For a hook Api:

```js
auth: { roles: [...(action.access?.roles ?? [])] }
```

For a group `on_complete` Api:

```js
const groupActions = workflow.actions.filter((a) => a.action_group === group.id);
const roles = [
  ...new Set(groupActions.flatMap((a) => a.access?.roles ?? [])),
];
auth: { roles };
```

Both: the `auth` block has only `roles` (no `public: true`). The resolver never emits an unguarded hook Api.

### Form vs task differences

The only difference between an emitted form-action endpoint and an emitted task-action endpoint is the `current_status` slot in `properties:`. Form actions omit it; task actions include `current_status: { _payload: current_status }`.

Distinguish by `action.kind`:

```js
const isTask = action.kind === "task";
// ...
properties: {
  // ...common fields...
  ...(isTask ? { current_status: { _payload: "current_status" } } : {}),
  // ...
}
```

Tracker actions (`kind: tracker`) emit nothing.

## Task

Create two files:

### `modules/workflows/resolvers/makeWorkflowApis.js`

Plain ES-module JS following the pattern from `modules/workflows/resolvers/makeActionPages.js`. Suggested skeleton:

```js
const HOOK_INTERACTIONS = [
  "submit_edit",
  "not_required",
  "resolve_error",
  "approve",
  "request_changes",
];
const HOOK_PHASES = ["pre", "post"];

function fail(message) {
  throw new Error(`makeWorkflowApis: ${message}`);
}

function emitHookApi({ workflowType, action, interaction, phase, routineBody }) {
  return {
    id: `update-action-${action.type}-${interaction}-${phase}`,
    definition: {
      type: "Api",
      auth: { roles: [...(action.access?.roles ?? [])] },
      routine: routineBody.routine,
    },
  };
}

function emitHooks(workflowType, action) {
  const apis = [];
  const map = {};                          // interaction → { pre?, post? }
  if (!action.hooks) return { apis, map };
  for (const interaction of HOOK_INTERACTIONS) {
    const phases = action.hooks[interaction];
    if (!phases) continue;
    const slot = {};
    for (const phase of HOOK_PHASES) {
      const body = phases[phase];
      if (!body) continue;
      const api = emitHookApi({
        workflowType,
        action,
        interaction,
        phase,
        routineBody: body,
      });
      slot[phase] = api.id;
      apis.push(api);
    }
    if (Object.keys(slot).length > 0) map[interaction] = slot;
  }
  return { apis, map };
}

function emitEventOverrides(action) {
  if (!action.event) return undefined;
  const map = {};
  for (const interaction of HOOK_INTERACTIONS) {
    const e = action.event[interaction];
    if (!e) continue;
    const slot = {};
    for (const key of ["type", "display", "references", "metadata"]) {
      if (key in e) slot[key] = e[key];
    }
    if (Object.keys(slot).length > 0) map[interaction] = slot;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function emitInteractions(action) {
  if (!action.interactions) return undefined;
  const map = {};
  for (const interaction of HOOK_INTERACTIONS) {
    const v = action.interactions[interaction];
    if (!v || !("status" in v)) continue;
    map[interaction] = { status: v.status };
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function emitActionEndpoint(workflow, action, hooksMap, eventMap, interactionsMap) {
  const isTask = action.kind === "task";
  const properties = {
    action_id: { _payload: "action_id" },
    action_type: action.type,
    workflow_type: workflow.type,
    interaction: { _payload: "interaction" },
    current_key: { _payload: "current_key" },
    form: { _payload: "form" },
    form_review: { _payload: "form_review" },
    fields: { _payload: "fields" },
    comment: { _payload: "comment" },
    ...(isTask ? { current_status: { _payload: "current_status" } } : {}),
    ...(hooksMap ? { hooks: hooksMap } : {}),
    ...(eventMap ? { event_overrides: eventMap } : {}),
    ...(interactionsMap ? { interactions: interactionsMap } : {}),
  };

  return {
    id: `update-action-${action.type}`,
    definition: {
      type: "Api",
      routine: [
        {
          id: "submit",
          type: "SubmitWorkflowAction",
          connectionId: { "_module.connectionId": "workflow-api" },
          properties,
        },
        {
          ":return": {
            action_ids: { _step: "submit.action_ids" },
            completed_groups: { _step: "submit.completed_groups" },
            event_id: { _step: "submit.event_id" },
            tracker_fired: { _step: "submit.tracker_fired" },
            pre_hook_response: { _step: "submit.pre_hook_response" },
            post_hook_response: { _step: "submit.post_hook_response" },
          },
        },
      ],
    },
  };
}

function emitGroupOnCompleteApi(workflow, group) {
  if (!group.on_complete) return null;
  const groupActions = (workflow.actions ?? []).filter(
    (a) => a.action_group === group.id,
  );
  const roles = [
    ...new Set(groupActions.flatMap((a) => a.access?.roles ?? [])),
  ];
  return {
    id: `workflow-${workflow.type}-group-${group.id}-on-complete`,
    definition: {
      type: "Api",
      auth: { roles },
      routine: group.on_complete.routine,
    },
  };
}

function emitForWorkflow(workflow) {
  const apis = [];

  for (const action of workflow.actions ?? []) {
    if (action.kind === "tracker") continue;
    const { apis: hookApis, map: hooksMap } = emitHooks(workflow.type, action);
    apis.push(...hookApis);
    const eventMap = emitEventOverrides(action);
    const interactionsMap = emitInteractions(action);
    apis.push(
      emitActionEndpoint(workflow, action, hooksMap, eventMap, interactionsMap),
    );
  }

  for (const group of workflow.action_groups ?? []) {
    const api = emitGroupOnCompleteApi(workflow, group);
    if (api) apis.push(api);
  }

  return apis;
}

function makeWorkflowApis(_, vars) {
  const { workflows } = vars;
  const apis = [];
  for (const workflow of workflows) {
    apis.push(...emitForWorkflow(workflow));
  }
  return apis;
}

export default makeWorkflowApis;
```

Refine signatures, error messages, and ordering to match what the test fixtures expect. The `_module.connectionId` key string needs to match Lowdefy's operator syntax — confirm against `makeActionPages.js`'s `_module.pageId` usage (the property name is the operator literal, the value is the argument).

### `modules/workflows/resolvers/makeWorkflowApis.test.js`

Self-contained test spec using Node's built-in test runner. Use `node --test modules/workflows/resolvers/makeWorkflowApis.test.js` to run.

The fixture is the worked-example onboarding workflow with four actions (`qualify`, `send-quote`, `schedule-followup`, `track-installation`), plus three groups (`phase-1`, `phase-2`, `phase-3`) — one of which carries an inline `on_complete` routine. Inline the fixture in the test file.

Required test cases (mirrors design.md "Verification"):

1. **Worked-example emits the right `update-action-*` set.** The worked-example workflow produces exactly:
   - `update-action-qualify` (form)
   - `update-action-send-quote` (form)
   - `update-action-schedule-followup` (task)
   - No `update-action-track-installation` (tracker skipped).
2. **Task endpoint includes `current_status`.** The emitted `update-action-schedule-followup` has `properties.current_status: { _payload: 'current_status' }`. The form endpoints (`update-action-qualify`, `update-action-send-quote`) do not have that property at all.
3. **Every form/task endpoint passes `comment` through.** Each emitted endpoint has `properties.comment: { _payload: 'comment' }`. The handler maps the field into `event.metadata.comment` (see part 13 design.md § Comment mapping); the resolver's only job is to thread the runtime field through.
4. **Sparse `hooks` / `event_overrides` / `interactions` maps.**
   - An action declaring `hooks.submit_edit.pre: { routine: [...] }` and nothing else produces `properties.hooks: { submit_edit: { pre: 'update-action-{type}-submit_edit-pre' } }` — no other interaction keys, no `post`.
   - An action with no `hooks:` block omits the `hooks` property from the emitted endpoint entirely (assert `'hooks' in properties === false`).
   - Same shape for `event_overrides` (slots emitted only for interactions present in `action.event`) and `interactions`.
5. **Hook Api emission.** A fixture action declaring `hooks.submit_edit.pre: { routine: [{ id: 'x', type: 'MongoDBFindOne' }] }` with `access: { roles: ['account-manager'] }` produces a hook Api with:
   - `id: 'update-action-qualify-submit_edit-pre'`
   - `definition.type: 'Api'`
   - `definition.auth: { roles: ['account-manager'] }`
   - `definition.routine: [{ id: 'x', type: 'MongoDBFindOne' }]`
6. **Group `on_complete` Api emission.** A fixture group `phase-1` with `on_complete: { routine: [{ id: 'notify', type: 'CallApi' }] }` and actions whose `action_group === 'phase-1'` and `access.roles: ['account-manager', 'ops-lead']` produces:
   - `id: 'workflow-onboarding-group-phase-1-on-complete'`
   - `definition.auth: { roles: ['account-manager', 'ops-lead'] }` (de-duplicated union of the group's actions' `access.roles`)
   - `definition.routine: [{ id: 'notify', type: 'CallApi' }]`
7. **`auth.roles` synthesis dedupes.** A group whose actions all share `roles: ['account-manager']` produces `auth: { roles: ['account-manager'] }`, not `['account-manager', 'account-manager']`.
8. **Empty roles passes through.** An action with no `access.roles` (or `access: { roles: [] }`) produces a hook Api with `auth: { roles: [] }`. A group whose actions all have empty roles produces an `on_complete` Api with `auth: { roles: [] }`.
9. **`event_overrides` carries the four-tuple.** An action declaring `event: { submit_edit: { type: 'qualified', display: 'Lead qualified', references: { ... }, metadata: { ... } } }` produces `properties.event_overrides.submit_edit` with all four fields (`type`, `display`, `references`, `metadata`).
10. **`interactions[interaction].status` baked in.** An action declaring `interactions: { submit_edit: { status: 'done' } }` produces `properties.interactions: { submit_edit: { status: 'done' } }`.
11. **No `force` slot.** The emitted endpoint's `properties:` does not contain a `force` field.
12. **Tracker actions emit nothing.** A workflow with only `kind: tracker` actions produces an empty Api array (no `update-action-*` endpoint, no hook Apis).

Use `node:test`'s `describe` / `it` / `assert.deepStrictEqual` / `assert.throws`. Keep the fixture inline as a JS literal — copy the minimum subset of the worked example needed to make each assertion meaningful.

## Acceptance Criteria

- `node --test modules/workflows/resolvers/makeWorkflowApis.test.js` exits 0 with all 12 test cases passing.
- The resolver passes lint (matching whatever ESLint config `modules/workflows/resolvers/makeActionPages.js` passes).
- `makeWorkflowApis.js` is importable as ES module: `import makeWorkflowApis from './makeWorkflowApis.js'` works.
- Running the resolver against the worked-example fixture produces exactly:
  - `update-action-qualify`, `update-action-send-quote`, `update-action-schedule-followup` (three action endpoints)
  - `update-action-qualify-submit_edit-pre` (the one declared hook in the worked example)
  - `workflow-onboarding-group-phase-1-on-complete` (the one declared group `on_complete`)
  - Total: five Apis for the worked example.
- Each error message includes the `makeWorkflowApis:` prefix and is precise enough to debug from build output alone.

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — create
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — create

## Notes

- **No new dependencies.** `node:test` and `node:assert` are built-in. Match the test-runner convention from `makeActionPages.test.js`.
- **Don't validate the workflow YAML schema.** Part 4 / task 1 owns hook-shape and `on_complete`-shape validation. If a malformed YAML reaches this resolver, that's a task-1 bug.
- **`_module.connectionId` operator syntax.** Lowdefy operators look like `{ '_module.connectionId': 'workflow-api' }` (the property name is the literal operator). Confirm by grepping `modules/workflows/` for existing `_module.*` usage and matching the shape. Pages in `makeActionPages.js` use `_module.pageId` similarly.
- **`_payload:` strings.** Lowdefy's `_payload` operator takes a string path. `{ _payload: 'action_id' }` is the canonical form — confirm against any shipped Lowdefy YAML in this repo (e.g. `apps/demo/**/*.yaml`) before deciding the in-JS literal shape. The skeleton above shows the most common form; adjust if other resolvers in this repo use a different convention.
- **Sparseness over completeness.** When in doubt, omit. An empty `hooks` map is **not** the same as no `hooks` key — emit no key at all when the action declares no hooks. Same for `event_overrides`, `interactions`, and the `current_status` slot on form actions.
- **De-duplicate role union.** Use a `Set` for the `on_complete` `auth.roles` computation. Order in the emitted array doesn't matter (Lowdefy treats it as a set), but stable ordering helps tests — `[...new Set(...)]` preserves insertion order, which is good enough.
- **Connection wiring is part 20's concern.** Don't bake `workflowsConfig` or `actionsEnum` into the endpoint payload — the handler reads them off the connection at submit time. The emitted endpoint only carries the `_module.connectionId: workflow-api` pointer.
- **Resolver runs in parallel with `makeActionPages`.** Both read the same raw `vars.workflows`; nothing about the order matters as long as both consume the raw YAML.
