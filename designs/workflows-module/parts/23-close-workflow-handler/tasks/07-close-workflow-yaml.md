# Task 7: Create `modules/workflows/api/close-workflow.yaml` routine

## Context

The plugin's `CloseWorkflow` handler is the engine-side implementation; consuming apps invoke it via a Lowdefy operational API. This task adds `close-workflow.yaml` — a single-step routine that calls the `CloseWorkflow` request and returns its result.

From [design.md § `close-workflow` operational API](../design.md):

> Add a fifth operational API to part 19:
> - `close-workflow.yaml` — single-step routine invoking `CloseWorkflow` from this part. Payload: `workflow_id` required; `reason`, `references` optional. Returns `{ action_ids, event_id, tracker_fired }`.

Part 19 hasn't shipped yet — none of the four other operational API yaml files (`start-workflow.yaml`, `cancel-workflow.yaml`, `get-entity-workflows.yaml`, `get-workflow-overview.yaml`) exist in the tree. Part 23's contract is to create just `close-workflow.yaml`; Part 19 will create the others (and wire them all into the module manifest in Part 20).

The routine's payload shape matches the handler ([design.md:19–22](../design.md)):
- Required: `workflow_id`.
- Optional: `reason`.
- Optional: `references` (passed through unchanged — the handler's `RESERVED_WORKFLOW_KEYS` defense validates).

The routine layer does NOT re-validate; see Part 19's design for the "`references` pass-through" rationale ([19-operational-apis/design.md:11](../../19-operational-apis/design.md)).

## Task

### 1. Create the file path

```
modules/workflows/api/close-workflow.yaml
```

If `modules/workflows/api/` doesn't exist yet, create the directory. Per Part 19's structure, this directory will eventually hold all five operational APIs.

### 2. Author the routine YAML

```yaml
id: close-workflow
type: Api
auth:
  public: false
routine:
  - id: close_workflow
    type: Request
    properties:
      connectionId: workflow_api
      requestId: CloseWorkflow
      payload:
        workflow_id:
          _payload: workflow_id
        reason:
          _payload: reason
        references:
          _payload: references
    response:
      _request: close_workflow
```

Key details:

- `type: Api` — Lowdefy's operational-API definition shape.
- `connectionId: workflow_api` — the consuming app's connection id for the `WorkflowAPI` plugin connection. This is the same convention Part 19 uses for the other four routines. If the canonical connection id ever changes, this file changes with it.
- `requestId: CloseWorkflow` — matches the registered request name in `WorkflowAPI.js:requests` (Task 1).
- `_payload: workflow_id` / `_payload: reason` / `_payload: references` — passes payload keys straight through. The Lowdefy `_payload` operator dot-resolves on the routine's incoming payload.
- `response: { _request: close_workflow }` — returns the handler's result verbatim. The handler already returns the contract `{ action_ids, event_id, tracker_fired }` (Task 6); the routine just hands it back.

### 3. Verify the YAML loads under the Lowdefy parser

Run `pnpm ldf:b` against `apps/demo` (or whichever consumer app first wires the workflow module). The build should not error on this file. (Once Part 19 / Part 20 ship the manifest and connection wiring, this becomes a `_ref` target from the module manifest; until then the file is just a static asset.)

## Acceptance Criteria

- `modules/workflows/api/close-workflow.yaml` exists with the routine above.
- The YAML parses without error — verify by running `pnpm ldf:b` from a consumer app that includes the workflows module (or, before Part 20 lands, by parsing the file directly with `yaml.parse`).
- No tests required for this task — the routine is a static config file. End-to-end coverage of the close-workflow API lands in [Part 22's `operational-apis.spec.js`](../../22-workflows-e2e-suite/design.md), which is out of scope here.

## Files

- `modules/workflows/api/close-workflow.yaml` — create — single-step Api routine invoking `CloseWorkflow`.

## Notes

- Use snake_case for the routine step's `id: close_workflow` — matches the project convention for request ids and action ids ([CLAUDE.md § Lowdefy Project Rules](../../../../../CLAUDE.md)).
- The file id is kebab-case (`id: close-workflow`) — matches the kebab-case API id convention ([CLAUDE.md](../../../../../CLAUDE.md): "Kebab-case API IDs — Use kebab-case for API endpoint IDs").
- Don't add a `_ref` entry to `lowdefy.yaml` here — that wiring belongs to the consuming app (or, for the module itself, to Part 20's manifest exports). If Part 19 lands first and establishes a pattern for the other four routines, mirror it.
- Don't add the routine to the module manifest (`modules/workflows/module.lowdefy.yaml`) — Part 20 owns the manifest. This task ships only the yaml file; manifest wiring is a Part 20 task.
- `auth: { public: false }` is conservative — the consuming app's role gate can tighten further. v0's `CloseWorkflowActions` had no built-in role gate; v1's pattern is to set `public: false` here and let the consumer's hooks add role-based auth.
