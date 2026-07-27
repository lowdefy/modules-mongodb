# Task 8: Step 1 — Validate the per-endpoint payload + translate to the internal `actions[]` shape

## Context

[design.md § Payload](../design.md#payload) commits the translation: the per-action endpoint hands `SubmitWorkflowAction` a flat per-endpoint payload (`action_id`, `interaction`, `current_key`, `form`, `form_review`, `fields`, `current_status`, `hooks`, `event_overrides`); step 1 of `handleSubmit.js` translates it into the engine's internal `{ currentActionId, actions: [{ type, status, keys?, fields?, references?, force? }], eventId }` shape that every later step reads from.

[design.md § Lifecycle scaffold step 1](../design.md#lifecycle-scaffold) commits the validation checks:

> Validate: payload schema, action exists, access role gate (`access.roles ∩ user.roles`), and terminal-workflow gate (reject when `workflow.status[0].stage ∈ {completed, cancelled}` AND `!action.required_after_close`). Verb filter is implicit at submit time.

Plus the dual failure shape from [design.md step 1 Failure shape](../design.md#lifecycle-scaffold):

> **Before action lookup** (payload schema, action-not-found, role gate, terminal-workflow gate): no action doc to attach error context to → throw with a structured error.
> **After action lookup, mid-write**: handled by task 13 (mid-write error transition wrapper).

The interaction → target-status mapping from [design.md § Interaction → target-status mapping](../design.md#interaction--target-status-mapping-engine-default-only) applies to the `currentActionId` entry only.

This task is the largest in part 6. It lands the entry-point validation and the load-bearing translation that every downstream step reads from.

V0 reference: `dist/workflows-module/old/WorkflowAPI/UpdateWorkflowActions/handleUpdateActions.js` does its own validation inline (workflow lookup, `actions` array check). The new shape splits validation into named gates with explicit error messages.

## Task

Replace the `// Step 1 — Validate + translate per-endpoint payload to internal shape.` TODO in `handleSubmit.js` with the real body.

### 1. Payload schema check

Required fields on `context.params`: `action_id`, `interaction`. Optional: `current_key`, `form`, `form_review`, `fields`, `current_status`, `hooks`, `event_overrides`.

```js
const { params } = context;
if (typeof params.action_id !== "string" || params.action_id.length === 0) {
  throw new Error("SubmitWorkflowAction: action_id is required");
}
if (typeof params.interaction !== "string" || params.interaction.length === 0) {
  throw new Error("SubmitWorkflowAction: interaction is required");
}
```

### 2. Look up the action

Use `getCurrentAction` from task 2:

```js
import getCurrentAction from "./utils/getCurrentAction.js";
// ...
const action = await getCurrentAction(context, { actionId: params.action_id });
if (!action) {
  throw new Error(`SubmitWorkflowAction: action ${params.action_id} not found`);
}
```

### 3. Look up the workflow + workflow config

Fetch the workflow by `action.workflow_id` for the terminal-workflow gate, and look up the workflow's actions config for the interaction mapping + action config:

```js
const workflow = await context
  .mongoDBConnection("workflows")
  .MongoDBFindOne({ query: { _id: action.workflow_id } });
if (!workflow) {
  throw new Error(
    `SubmitWorkflowAction: workflow ${action.workflow_id} not found`,
  );
}

const workflowConfig = (context.workflowsConfig ?? []).find(
  (w) => w.type === workflow.workflow_type,
);
if (!workflowConfig) {
  throw new Error(
    `SubmitWorkflowAction: workflow_type "${workflow.workflow_type}" not in workflowsConfig`,
  );
}
context.actionsConfig = workflowConfig.actions ?? [];

const actionConfig = context.actionsConfig.find(
  (cfg) => cfg.type === action.type,
);
if (!actionConfig) {
  throw new Error(
    `SubmitWorkflowAction: action type "${action.type}" not in workflow "${workflow.workflow_type}" config`,
  );
}
```

Cache `workflow` and `actionConfig` on `context` so steps 3, 5, 6, 13 can read them without re-fetching:

```js
context.workflow = workflow;
context.action = action;
context.actionConfig = actionConfig;
```

### 4. Role gate (access.roles ∩ user.roles)

The Lowdefy framework's permission check has already validated authentication. The role gate inside the handler re-checks the action's `access.roles` against the caller's roles (per [engine/spec.md § Capabilities](../../../../workflows-module-concept/engine/spec.md#capabilities) — submit-time role re-check guards against role revocation between render and submit).

The caller's roles arrive via `lowdefyContext.user.roles` upstream from the framework. Pass them in `context` from the entry. (This means task 7's entry needs a small follow-up — add `user: lowdefyContext.user` to the `context` object. Confirm during this task; if missing, add it.)

```js
const accessRoles = actionConfig.access?.roles ?? [];
const userRoles = context.user?.roles ?? [];

if (accessRoles.length > 0) {
  const intersects = accessRoles.some((role) => userRoles.includes(role));
  if (!intersects) {
    throw new Error(
      `SubmitWorkflowAction: caller roles do not intersect with action.access.roles for action ${params.action_id}`,
    );
  }
}
```

Empty `access.roles` means no role gate (matches the `get-entity-workflows` filtering posture in part 19).

### 5. Terminal-workflow gate (the `required_after_close` check)

Per [design.md step 1](../design.md#lifecycle-scaffold) + [action-authoring/spec.md § `required_after_close`](../../../../workflows-module-concept/action-authoring/spec.md):

```js
const workflowStage = workflow.status?.[0]?.stage;
if (
  (workflowStage === "completed" || workflowStage === "cancelled") &&
  actionConfig.required_after_close !== true
) {
  throw new Error(
    `SubmitWorkflowAction: workflow ${workflow._id} is ${workflowStage}; action type "${action.type}" does not have required_after_close: true`,
  );
}
```

### 6. Resolve interaction → target status

Per [design.md § Interaction → target-status mapping](../design.md#interaction--target-status-mapping-engine-default-only):

```js
function resolveTargetStatus({ interaction, actionConfig, params }) {
  const hasReviewVerb = Object.values(actionConfig.access ?? {})
    .filter((v) => Array.isArray(v))
    .some((verbs) => verbs.includes("review"));

  switch (interaction) {
    case "submit_edit":
      if (actionConfig.kind === "task") {
        if (typeof params.current_status !== "string") {
          throw new Error(
            "SubmitWorkflowAction: task submit_edit requires caller-supplied current_status",
          );
        }
        return params.current_status;
      }
      return hasReviewVerb ? "in-review" : "done";
    case "not_required":
      return "not-required";
    case "resolve_error":
      return hasReviewVerb ? "in-review" : "done";
    case "approve":
      return "done";
    case "request_changes":
      return "changes-required";
    default:
      throw new Error(
        `SubmitWorkflowAction: unknown interaction "${interaction}"`,
      );
  }
}
```

Inline this in `handleSubmit.js` or extract to `./utils/resolveTargetStatus.js` — design.md doesn't commit either, but extracting keeps `handleSubmit.js` readable. Lean: inline for v1 (one call site); extract if part 9's interaction overrides need to share it (they will). Either is fine for this task; the extraction can fold into part 9.

### 7. Build the internal `actions[]` shape

One entry, populated from the `currentActionId` slot:

```js
const targetStatus = resolveTargetStatus({
  interaction: params.interaction,
  actionConfig,
  params,
});

const internal = {
  currentActionId: action._id,
  actions: [
    {
      type: action.type,
      status: targetStatus,
      keys: params.current_key ? [params.current_key] : undefined,
      fields: params.fields,
      // references intentionally omitted in v1 — pre-hook actions[] in part 9 sets it.
      // force: undefined — user submissions never set the engine's per-entry force.
    },
  ],
  eventId: context.eventId,
};
```

The `keys: [...]` plural form is per [engine/spec.md § SubmitWorkflowAction payload](../../../../workflows-module-concept/engine/spec.md#submitworkflowaction-payload) — a per-entry `keys` array fans out N writes per entry (omitted → one op with `key: null`; `[k]` → one op with `key: k`). v1 always sends one key or none.

Pass `internal` to downstream steps. Append `actionIds.push(action._id)` to track the user-submitted action in the return shape — task 10's write loop will append additional ids if other entries write.

## Acceptance Criteria

- Step 1's TODO marker in `handleSubmit.js` is replaced with the real body above.
- Pre-lookup failures (missing payload fields, action not found, workflow not found, workflow_type not in config, role gate fail, terminal-workflow gate fail) throw with precise messages naming the offending field/value.
- After-lookup state cached on `context`: `context.workflow`, `context.action`, `context.actionConfig`, `context.actionsConfig`.
- `context.user` available (entry from task 7 updated if needed).
- Internal `actions[]` shape carries a single entry with `currentActionId` slot populated, `keys` set when `current_key` was supplied.
- `interaction → target-status` resolution matches the table in the design.
- Task `submit_edit` honors caller-supplied `current_status`; throws when missing.
- Unknown `interaction` throws.
- `handleSubmit.test.js` extended with cases (using `inMemoryMongo`):
  - Missing `action_id` → throws.
  - Action not found → throws.
  - Workflow in `cancelled` stage + action without `required_after_close` → throws "workflow is cancelled".
  - Same workflow + action with `required_after_close: true` → does not throw on step 1.
  - Role gate: action with `access.roles: ['admin']`, caller with `roles: ['user']` → throws "caller roles do not intersect".
  - `submit_edit` on a form action with `access.{app}: ['view', 'review']` → resolves to `in-review`.
  - `submit_edit` on a form action without `review` verb → resolves to `done`.
  - `not_required` interaction → resolves to `not-required` regardless of verbs.
  - Task `submit_edit` without `current_status` → throws.
  - Task `submit_edit` with `current_status: 'changes-required'` → resolves to `changes-required`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — fill in step 1 body.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js` — modify (small) — ensure `context.user = lowdefyContext.user` is set if task 7 didn't already include it.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — extend with the 10+ cases above.
- _(Optional)_ `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/resolveTargetStatus.js` — create (if extracted) — pure function for the interaction-to-status mapping. If extracted, add a colocated `resolveTargetStatus.test.js` covering each interaction × verb combination.

## Notes

- **Verb filter is implicit at submit time.** Per the design's note: "the page wouldn't have been generated if the verb wasn't allowed in the calling app." The role gate **is** the submit-time check; the verb-list check happened at build time (part 12's resolver-pages emission). Don't add a verb check here.
- **`actionsConfig` cache on context.** Re-using v0's pattern of stashing the per-workflow actions config on `context.actionsConfig` keeps subsequent step bodies short. The cache is request-scoped — `context` itself is built fresh per invocation.
- **Pre-hook layer (part 9) reads / mutates `internal.actions`.** Part 9's pre-hook return merges entries with auto-unblocks (task 9) and can override `targetStatus` for the `currentActionId` entry. The split this task lands keeps the precedence clear: engine default lands here, YAML override + pre-hook override layer on top later.
- **`current_status` validation.** Only required when `actionConfig.kind === 'task'` and `interaction === 'submit_edit'`. Other interactions on task actions (not_required, approve, etc.) follow the form mapping. Confirm by tracing each case in the resolveTargetStatus table.
- The open question in `design.md § Open questions` about "current_status payload provenance for task vs. form" gets closed by this task's implementation — verify at the call sites that task `submit_edit` is the only interaction passing through the params slot.
