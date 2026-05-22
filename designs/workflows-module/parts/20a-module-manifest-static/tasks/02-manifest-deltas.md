# Task 2: Add manifest deltas to module.lowdefy.yaml

## Context

After task 1, `modules/workflows/connections/` exists with three connection files. The existing manifest at `modules/workflows/module.lowdefy.yaml` (v0.6.0) already declares all five shared pages, six operational APIs, three components, both enums merged with display overrides, and the plugin pin at `^0.6.0`. What's missing per the manifest header comment lines 1–13: connections, MONGODB_URI secret, `user_schema` / `app_name` / `entities` vars.

This task closes everything in that list **except** the menu exports (out of scope) and the form-fields component library (deferred to part 20b).

The `entities` var has nuanced behavior — it was introduced by [part 17 shared-pages](../../_completed/17-shared-pages/design.md), specifically lines 65–98 of that design. Each entry maps `entity_collection` → `{ page_id, id_query_key, title }`. The manifest declares the var with `type: object` and `required: true`. Per-key shape isn't statically validated (Lowdefy var schemas don't validate nested keys); part 4's runtime completeness check covers that.

Sample pattern: `modules/contacts/module.lowdefy.yaml`. The `connections:` ref shape is at line 148; `exports.connections:` is at line 131–133; `secrets:` is at the bottom of the file.

## Task

Edit `modules/workflows/module.lowdefy.yaml` to add the following.

### 1. Three new `vars` entries

Append to the existing `vars:` block (which currently holds `workflows_config`, `action_statuses_display`, `workflow_lifecycle_stages_display`).

```yaml
app_name:
  type: string
  required: true
  description: The host app's deployment name. Filters action access via `access.{app_name}` per action, and is consumed by the engine to key the default log event's display block.

user_schema:
  type: object
  default:
    roles_path: roles
  description: Where the engine reads the caller's roles from on the session/user object. Defaults to `roles_path: roles`.

entities:
  type: object
  required: true
  description: >
    Map keyed by workflow `entity_collection` → `{ page_id, id_query_key, title }`. The module deep-links back into host-app entity pages (workflow-overview back-link, workflow-header entity-kind chrome) using these entries.
    - `page_id` — host-app page id rendering the entity.
    - `id_query_key` — URL query string key the entity page expects for its primary id (commonly `_id`).
    - `title` — singular human-readable entity-kind label (e.g. "Lead", "Ticket").
    Per-key shape is not statically validated by Lowdefy; part 4's `makeWorkflowsConfig` validator confirms every `entity_collection` referenced in `workflows_config` has a matching key here.
```

### 2. `dependencies:` block

Add a top-level `dependencies:` key (the current manifest has none).

```yaml
dependencies:
  - id: layout
    description: Page layout wrapper consumed by every shared page.
  - id: events
    description: Provides the `change_stamp` component referenced by the `workflow-api` connection.
```

Note: `events` is required because `workflow-api.yaml` `_ref`s `{ module: events, component: change_stamp }`. The `notifications` module is **not** declared — the static surface does not consume it; it lands in 20b alongside the per-action endpoint that uses it.

### 3. `secrets:` block

Add at the bottom of the file (mirrors `modules/contacts/module.lowdefy.yaml`).

```yaml
secrets:
  - name: MONGODB_URI
    description: MongoDB connection URI
```

### 4. Top-level `connections:` block

Add a top-level `connections:` key with `_ref`s to the three files from task 1.

```yaml
connections:
  - _ref: connections/workflows-collection.yaml
  - _ref: connections/actions-collection.yaml
  - _ref: connections/workflow-api.yaml
```

### 5. `exports.connections:` list

Inside the existing `exports:` block, add a `connections:` list naming the three connections (sibling to the existing `pages:`, `api:`, `components:` lists).

```yaml
exports:
  ...
  connections:
    - id: workflows-collection
      description: MongoDB collection connection for direct read access to the workflows collection.
    - id: actions-collection
      description: MongoDB collection connection for direct read access to the actions collection.
    - id: workflow-api
      description: Server-side WorkflowAPI connection — owns engine-managed write paths (transitions, tracker subscription, summary writeback).
```

### 6. Manifest header comment

Update the comment block at the top of the manifest (lines 1–16) so the "lands in part 20" / "WorkflowAPI connection... lands in part 20" sentences reflect that this part has shipped. Keep the "form-fields component library (part 14)" deferral pointing at part 20b. Tighten any other stale "part 20" references to point at 20b for the resolver entries.

## Acceptance Criteria

- `modules/workflows/module.lowdefy.yaml` carries the three new vars (`app_name`, `user_schema`, `entities`) with the descriptions above.
- Top-level `connections:` key exists with three `_ref` entries.
- Top-level `dependencies:` key exists with `layout` and `events`.
- Top-level `secrets:` key exists with `MONGODB_URI`.
- `exports.connections:` lists all three connection IDs.
- Existing static exports (pages, APIs, components, enums) untouched.
- Plugin pin remains `^0.6.0`.
- `apps/demo` build does not fail with manifest-parse errors (it may still fail because the demo doesn't yet wire the workflows module entry — that's task 6).
- A standalone manifest parse (e.g. `pnpm --filter=demo ldf:b` against a config that does NOT include workflows yet) is not regressed by the changes.

## Files

- `modules/workflows/module.lowdefy.yaml` — **modify**

## Notes

- `additionalProperties: false` on the WorkflowAPI schema means the connection file from task 1 must stay clean — no spurious keys.
- The `entities` description is the canonical place apps look for the var's shape (since it isn't in the concept spec). Be specific about the three subfields.
- Keep the manifest header comment in sync with what's shipped — stale comments mislead future readers.
- Do **not** add the resolver-channel entries (`makeActionPages`, `makeWorkflowApis`) here — those ship in 20b.
