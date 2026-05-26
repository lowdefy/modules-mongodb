# Task 1: Fix per-status `message` / `link` projection in three operational APIs

## Context

The workflows module's three entity-rendering APIs (`get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`) all attempt to project the action's per-status `message` and `link` onto each action row at lookup time. The current projection is broken — it builds the literal string `"$apps.demo.link"` instead of resolving to the value at `status_map.{status}.{app_name}.link`:

```yaml
# modules/workflows/api/get-entity-workflows.yaml lines 62–73 (current, broken)
message:
  _string.concat: [ $apps, ., { _module.var: app_name }, .message ]
link:
  _string.concat: [ $apps, ., { _module.var: app_name }, .link ]
```

`_string.concat` joins operands as literals. `$apps` becomes the string `"$apps"`, not a Mongo projection. The result is a constant string on every action regardless of status.

The engine-side fix landing on a sibling branch projects `status_map.{status}.{app_name}` onto the action root at every status transition — so the action doc ends up carrying (e.g.) `demo: { message: …, link: … }` directly. With that write in place, the API-side projection collapses to a three-operand concat that builds the Mongo projection string `"$demo.link"` at build time.

## Task

In each of these three files, replace the four-operand `_string.concat: [$apps, ., {app_name}, .{field}]` shape with the three-operand `_string.concat: [$, _module.var: app_name, .{field}]` shape:

- `modules/workflows/api/get-entity-workflows.yaml`
- `modules/workflows/api/get-workflow-overview.yaml`
- `modules/workflows/api/get-action-group-overview.yaml`

The replacement shape (same in all three files):

```yaml
message:
  _string.concat:
    - $
    - _module.var: app_name
    - .message                              # → "$demo.message" at build time
link:
  _string.concat:
    - $
    - _module.var: app_name
    - .link                                 # → "$demo.link" at build time
```

Both `message` and `link` swap. The placement of the projection within the `$group` / `$push` (or whichever pipeline stage carries it in each file) stays unchanged — only the operand list of the `_string.concat` changes.

The "$status"-based fallback / conditional rendering that other stages handle (e.g. terminal statuses dropping `link:`) is unchanged by this task.

## Acceptance Criteria

- All three files use the three-operand `_string.concat: [$, _module.var: app_name, .<field>]` shape for both `message` and `link`.
- No file contains the literal operand `$apps` anywhere.
- `apps/demo` builds without errors after the change (the build doesn't fail even though the engine-side write hasn't shipped — the projection just returns `null` until then).
- `apps/demo/modules/workflows/.lowdefy/dev/build/...` output shows the projection compiles to `"$demo.message"` / `"$demo.link"` strings (the `app_name` literal baked in at build time).

## Files

- `modules/workflows/api/get-entity-workflows.yaml` — modify — replace `message` and `link` projection operands.
- `modules/workflows/api/get-workflow-overview.yaml` — modify — same.
- `modules/workflows/api/get-action-group-overview.yaml` — modify — same.

## Notes

- Runtime verification of this projection (i.e. seeing a real `{ pageId, urlQuery }` block come through on each action) depends on the engine-side `status_map → action_root.{app_name}` write landing separately. Until then, the action root has no `{app_name}` field and the projection returns `null` at runtime. That's expected for this task — don't try to verify the link renders end-to-end, just verify the build compiles to the right Mongo string.
- This is the only build-time change required; no manifest edits, no new files.
