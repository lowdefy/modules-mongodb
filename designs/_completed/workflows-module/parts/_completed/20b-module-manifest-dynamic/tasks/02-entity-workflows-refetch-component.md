# Task 2: Export `entity-workflows-refetch` action-sequence component

## Context

The `actions-on-entity` widget renders all workflows attached to one entity. It owns its own `onMount` action sequence that calls `get-entity-workflows` and writes the response to `_state.entity_workflows`:

```yaml
# modules/workflows/components/actions-on-entity.yaml lines 4–19
events:
  onMount:
    - id: call_entity_workflows
      type: CallAPI
      params:
        endpointId:
          _module.endpointId: get-entity-workflows
        payload:
          entity_id:
            _var: entity_id
          entity_collection:
            _var: entity_collection
    - id: set_entity_workflows
      type: SetState
      params:
        entity_workflows:
          _actions: call_entity_workflows.response.response.workflows
```

Every host page that mutates workflows on an entity (start / cancel / close / submit) needs to fire the same two-action pair to refresh the widget — and currently has to know the endpoint id (`get-entity-workflows`) and the state key (`entity_workflows`). Lead-view's 20a "Start onboarding" button already does this inline (`refetch_entity_workflows` + `set_entity_workflows`). Task 9 adds a second site (the start-onboarding modal); rather than inline the same pair again, expose it as a reusable component.

## Task

1. **Create `modules/workflows/components/entity-workflows-refetch.yaml`.** A two-action sequence taking `entity_id` and `entity_collection` as vars and mirroring `actions-on-entity.onMount`:

   ```yaml
   _ref:
     # consumed as part of an action sequence; expects vars { entity_id, entity_collection }.
     ...
   ```

   Specifically, the component should be a YAML fragment that consumer pages `_ref` into the middle of an `onClick` (or other event) action sequence. The fragment is the two-action array:

   ```yaml
   - id: refetch_entity_workflows
     type: CallAPI
     params:
       endpointId:
         _module.endpointId: get-entity-workflows
       payload:
         entity_id:
           _var: entity_id
         entity_collection:
           _var: entity_collection
   - id: set_entity_workflows
     type: SetState
     params:
       entity_workflows:
         _actions: refetch_entity_workflows.response.response.workflows
   ```

   IDs match the existing convention (`refetch_entity_workflows`, `set_entity_workflows`) so a consumer's sibling actions can reference these by id if needed.

2. **Register the component under `modules/workflows/module.lowdefy.yaml` `components:`.** Add an entry alongside the existing ones (`action_statuses`, `actions-on-entity`, `workflow-header`, etc.):

   ```yaml
   components:
     - id: entity-workflows-refetch
       component:
         _ref: components/entity-workflows-refetch.yaml
     # ... existing entries unchanged
   ```

3. **Do not refactor `actions-on-entity.onMount` to consume the new component in this task.** That's an obvious follow-up but isn't load-bearing for 20b; keeping the change scoped here makes the new component's first consumer (task 9) the canonical example, and a separate task can refactor the existing `onMount` later.

## Acceptance Criteria

- `modules/workflows/components/entity-workflows-refetch.yaml` exists and is a YAML array of two action descriptors (CallAPI + SetState).
- `modules/workflows/module.lowdefy.yaml` registers the new component under `components:`.
- `apps/demo` builds without errors (the component compiles even though no consumer references it yet — task 9 will).
- A `_ref: { module: workflows, component: entity-workflows-refetch, vars: { entity_id, entity_collection } }` resolves in the apps/demo build output to the two-action sequence.

## Files

- `modules/workflows/components/entity-workflows-refetch.yaml` — create — two-action sequence (CallAPI + SetState).
- `modules/workflows/module.lowdefy.yaml` — modify — add `entity-workflows-refetch` to `components:`.

## Notes

- This is a build-time-resolved component, not a runtime block. Consumers reach it via `_ref: { module, component, vars }` and the resolver inlines the action array at build time.
- The component intentionally writes to the same state key (`entity_workflows`) that `actions-on-entity.onMount` writes to — consumers don't need their own state key, they just refresh the one the widget already reads from.
