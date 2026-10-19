# Task 4: Resolver — swap `WORKFLOW_FIELDS` and add the legacy-key rejection check

## Context

`modules/workflows/resolvers/makeWorkflowsConfig.js` is the build-time resolver that turns the host app's workflow YAML into the normalized `workflowsConfig` array consumed by the engine. Today it includes `'entity_type'` in `WORKFLOW_FIELDS` (line 18) and has no check for the legacy field name.

Part 21 (a) swaps the whitelisted field name and (b) adds a build-time rejection so apps still using `entity_type` get a clear migration message rather than a silently-dropped field. Per the design's verification section, the rejection fires both when `entity_type:` appears alone and when it appears alongside `entity_collection:` — the migration check fires before the new-field happy path so half-migrated YAML can't slip through.

Task 2 should land first so the plugin schema's `required` list and this resolver's `WORKFLOW_FIELDS` agree at every commit.

## Task

### Field rename

In `modules/workflows/resolvers/makeWorkflowsConfig.js`, in the `WORKFLOW_FIELDS` array (currently at line 18), replace `'entity_type'` with `'entity_collection'`:

```js
const WORKFLOW_FIELDS = [
  "type",
  "entity_collection",
  "display_order",
  "starting_actions",
  "action_groups",
];
```

### Rejection check

Add a top-of-`validateWorkflow` check that runs before any other workflow-level validation. If the raw workflow YAML carries an `entity_type` key (with or without `entity_collection`), throw via the existing `fail()` helper with the message:

```
workflow "{workflow.type}": legacy "entity_type" field is no longer supported; rename to "entity_collection" (a MongoDB collection connection id like "leads-collection").
```

The check uses `'entity_type' in workflow` so that an explicit `entity_type: null` still trips the rejection — half-migrated YAML where the author cleared the value but didn't remove the key is exactly the case we want to catch. Whether `entity_collection` is also present doesn't matter — the rejection fires either way.

### Unit tests

Co-locate tests with the resolver per the package's existing test layout (the file's directory will already have or will gain a `__tests__/` or `*.test.js` sibling). Cover:

1. **Happy path** — a workflow with `entity_collection: 'leads-collection'` (and no `entity_type`) round-trips through `makeWorkflowsConfig` and emerges with `entity_collection` on the normalized output. No `entity_type` key on the output.
2. **Legacy field alone** — a workflow with `entity_type: 'lead'` and no `entity_collection` throws with the exact migration message above (substring match is fine on the test side: `legacy "entity_type" field is no longer supported`).
3. **Both fields declared** — a workflow with both `entity_type: 'lead'` and `entity_collection: 'leads-collection'` throws with the same message — confirms the migration check fires before the new-field happy path.

## Acceptance Criteria

- `makeWorkflowsConfig.js` `WORKFLOW_FIELDS` contains `'entity_collection'` and does not contain `'entity_type'`.
- A workflow YAML with `entity_type:` (with or without `entity_collection:`) throws an Error whose message contains `legacy "entity_type" field is no longer supported` and names the workflow's `type`.
- A workflow YAML with `entity_collection:` only is accepted and the value flows through to the normalized output.
- Unit tests for all three cases pass.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — swap the `WORKFLOW_FIELDS` entry; add the rejection check at the top of `validateWorkflow`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` (or equivalent per package convention) — create or modify — three test cases described above.

## Notes

The existing `fail(workflowType, message)` helper composes the workflow-scoped error prefix. Use it rather than throwing a raw `Error` so the rejection's voice matches the rest of the resolver's diagnostics.

`'entity_type' in workflow` is the right form for the key check — `workflow.entity_type !== undefined` would let an `entity_type: null` slip through. We want both forms caught.
